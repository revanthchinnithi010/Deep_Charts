/**
 * DrawingOverlay.tsx — React Native / Skia port (Pass A)
 *
 * Pass A scope: shape-primitive rendering only.
 * Renders all saved drawings for the current symbol using the already-ported
 * Skia imperative renderer (drawingCanvasRenderer.ts).  Visual selection glow
 * + anchor handles (circles) are shown for the currently-selected drawing.
 *
 * Explicitly OUT OF SCOPE for Pass A (deferred to Pass B / Pass C):
 *   • Anchor drag editing (resize handles, pointer capture)
 *   • Body (move) drag
 *   • Drawing creation interaction (crosshair, tap-to-place)
 *   • FloatingMiniToolbar / context menus
 *   • Fibonacci tools (all fib_ prefixes)
 *   • Ephemeral ruler / price_range / date_range tools
 *   • Alert badge rendering (alertDrawingIds prop is wired but not rendered)
 *
 * Rendering strategy (why PictureRecorder):
 *   The web source uses a Canvas2D element whose context is passed directly to
 *   renderDrawingsToCanvas().  In React Native there is no HTML canvas, but
 *   @shopify/react-native-skia provides Skia.PictureRecorder which hands back
 *   a raw SkCanvas, accepts the same imperative draw calls, and then produces an
 *   immutable SkPicture that can be played back inside any <Canvas> component via
 *   <Picture>.  This lets us reuse the entire 1184-line ported renderer verbatim.
 *
 * Viewport sync strategy:
 *   Horizontal (pan / zoom): subscribeVisibleLogicalRangeChange on the chart shim.
 *   Vertical  (price scale): 100 ms setInterval polling candle.priceToCoordinate(0),
 *   same approach used by LivePriceBox in CustomChart.
 *   Both paths call scheduleRender() which coalesces rapid calls via a pending flag.
 *
 * Web → RN changes (Pass A):
 *   Canvas2D + <canvas>            → Skia.PictureRecorder + <Canvas><Picture>
 *   SVG anchor handles             → Skia <Circle> declarative components
 *   SVG hit areas / foreignObject  → omitted (no DOM)
 *   createPortal                   → omitted
 *   window.addEventListener        → omitted
 *   localStorage                   → getDeletedDrawingIds() (already ported, reads module cache)
 *   BASE url                       → getApiBase()
 *   ResizeObserver / clientWidth   → View onLayout
 *   requestAnimationFrame loop     → coalesced setInterval + subscribeVisibleLogicalRangeChange
 */

import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import {
  Canvas,
  Circle,
  Group,
  Picture,
  Skia,
  type SkPicture,
} from "@shopify/react-native-skia";

import { useChartContext } from "@/contexts/ChartContext";
import { ChartBarsContext } from "@/contexts/ChartBarsContext";
import { getApiBase } from "@/lib/apiBase";
import {
  useDrawingStore,
  getDeletedDrawingIds,
} from "@/store/drawingStore";
import type { Drawing, DrawingPoint } from "@/types/drawing";
import type { OHLCBar } from "@/store/chartStore";
import {
  renderDrawingsToCanvas,
  type Px,
  type ToPxFn,
} from "./drawingCanvasRenderer";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  symbol:            string;
  timeframe:         string;
  /** Not rendered in Pass A — wired for API compatibility with the web version. */
  onDrawingAlert?:   (drawing: Drawing) => void;
  alertDrawingIds?:  Set<number>;
}

// ─── Component ────────────────────────────────────────────────────────────────

const DrawingOverlay = memo(function DrawingOverlay({
  symbol,
}: Props) {
  const { chart, candle }        = useChartContext();
  const { barsRef }              = useContext(ChartBarsContext);
  const drawings                 = useDrawingStore(s => s.drawings);
  const selectedDrawingId        = useDrawingStore(s => s.selectedDrawingId);
  const { resetDrawings }        = useDrawingStore.getState();

  // ── Canvas layout ──────────────────────────────────────────────────────────
  const [plotW, setPlotW]        = useState(0);
  const [plotH, setPlotH]        = useState(0);
  const plotWRef                 = useRef(0);
  const plotHRef                 = useRef(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    plotWRef.current = width;
    plotHRef.current = height;
    setPlotW(width);
    setPlotH(height);
  }, []);

  // ── Always-current refs ────────────────────────────────────────────────────
  // Avoids stale closures in render/interval callbacks without restarting them.
  const drawingsRef        = useRef<Drawing[]>(drawings);
  const selectedIdRef      = useRef<number | null>(selectedDrawingId);
  const candleRef          = useRef(candle);
  const chartRef           = useRef(chart);

  drawingsRef.current   = drawings;
  selectedIdRef.current = selectedDrawingId;
  candleRef.current     = candle;
  chartRef.current      = chart;

  // ── Visible logical range ──────────────────────────────────────────────────
  // Updated by subscribeVisibleLogicalRangeChange; read synchronously by toPx.
  const rangeRef = useRef<{ from: number; to: number }>({ from: 0, to: 0 });

  // Seed the range as soon as the chart is ready (before any pan event fires).
  useEffect(() => {
    if (!chart) return;
    const r = chart.timeScale().getVisibleLogicalRange();
    if (r) rangeRef.current = r;
  }, [chart]);

  // ── Skia picture state ─────────────────────────────────────────────────────
  const [picture, setPicture] = useState<SkPicture | null>(null);

  // ── Render coalescing ──────────────────────────────────────────────────────
  // When multiple triggers fire in the same tick (range change + drawings change),
  // only one render pass executes via the pending flag.
  const renderPending = useRef(false);

  // ── toPx: DrawingPoint → pixel Px | null ──────────────────────────────────
  //
  // Price → Y: candle.priceToCoordinate() from the series shim.
  // Time  → X: binary-search bars for the matching bar index, then apply the
  //            barIdxToX formula used by CustomChart:
  //              x = (barIdx − logFrom + 0.5) × barW
  //              barW = plotW / (logTo − logFrom)
  //            For future bars (beyond the last historical bar), the index is
  //            extrapolated using the median bar interval (same as web toPx).
  const toPxRef = useRef<ToPxFn>(() => null);

  // Rebuilt on every render pass so it always captures the latest refs.
  const buildToPx = useCallback((): ToPxFn => {
    return (pt: DrawingPoint): Px | null => {
      const series = candleRef.current;
      if (!series) return null;

      const rawY = series.priceToCoordinate(pt.price);
      if (rawY == null || !isFinite(rawY)) return null;
      const y = rawY;

      const bars   = barsRef.current as OHLCBar[];
      const { from: logFrom, to: logTo } = rangeRef.current;
      const W      = plotWRef.current;
      if (W <= 0 || logTo <= logFrom) return null;

      const barW = W / (logTo - logFrom);

      // Binary search: find the bar whose time matches pt.time exactly.
      let lo = 0, hi = bars.length - 1, barIdx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (bars[mid].time === pt.time) { barIdx = mid; break; }
        if (bars[mid].time  < pt.time) lo = mid + 1;
        else hi = mid - 1;
      }

      let x: number;
      if (barIdx >= 0) {
        // Historical bar — direct index.
        x = (barIdx - logFrom + 0.5) * barW;
      } else if (bars.length > 0) {
        // Future bar or pre-history: extrapolate from last bar using median interval.
        const lastIdx     = bars.length - 1;
        const lastBar     = bars[lastIdx];
        const prevBar     = bars.length > 1 ? bars[lastIdx - 1] : null;
        const intervalSec = prevBar
          ? Math.max(1, lastBar.time - prevBar.time)
          : 60;
        const barsAhead = (pt.time - lastBar.time) / intervalSec;
        x = (lastIdx + barsAhead - logFrom + 0.5) * barW;
      } else {
        return null;
      }

      return { x, y };
    };
  }, [barsRef]);

  // ── Imperative render pass ─────────────────────────────────────────────────
  // Records all drawing shapes into a SkPicture via PictureRecorder and stores
  // it in React state.  <Canvas><Picture picture={…}/></Canvas> plays it back.
  const doRender = useCallback(() => {
    renderPending.current = false;
    const W = plotWRef.current;
    const H = plotHRef.current;
    if (W <= 0 || H <= 0 || !candleRef.current) {
      setPicture(null);
      return;
    }

    const toPx   = buildToPx();
    toPxRef.current = toPx;

    // Bar half-width for position-tool rendering (mirrors web doCanvasRender).
    const { from: logFrom, to: logTo } = rangeRef.current;
    const barW = W / Math.max(1, logTo - logFrom);
    const bhw  = barW / 2;

    const bars = barsRef.current as OHLCBar[];

    // Record drawing commands into a picture.
    const recorder = Skia.PictureRecorder();
    const skCanvas = recorder.beginRecording(Skia.XYWHRect(0, 0, W, H));

    renderDrawingsToCanvas(
      skCanvas,
      W,
      H,
      drawingsRef.current,
      toPx,
      selectedIdRef.current,
      null,   // dragLive — no drag in Pass A
      bhw,
      bars,
      1,      // dpr = 1; Skia already operates in physical pixels
      null,   // moveDragId — no drag in Pass A
      H,      // clipH = full plot height (no time-axis exclusion needed; canvas sits over plot area)
    );

    setPicture(recorder.finishRecordingAsPicture());
  }, [buildToPx, barsRef]);

  // Schedule a coalesced render — multiple triggers in the same tick collapse
  // into a single doRender() call via a timeout.
  const scheduleRender = useCallback(() => {
    if (renderPending.current) return;
    renderPending.current = true;
    // Use a 0-delay timeout so all synchronous triggers in the same frame
    // accumulate before we render once.
    setTimeout(doRender, 0);
  }, [doRender]);

  // ── Subscribe to horizontal viewport changes (pan / zoom) ─────────────────
  useEffect(() => {
    if (!chart || !candle) return;

    // Seed range immediately in case the chart was already set up before mount.
    const initial = chart.timeScale().getVisibleLogicalRange();
    if (initial) rangeRef.current = initial;

    const onRange = (r: { from: number; to: number } | null) => {
      if (r) rangeRef.current = r;
      scheduleRender();
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    // Initial render.
    scheduleRender();

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
    };
  }, [chart, candle, scheduleRender]);

  // ── Poll for vertical (price-scale) changes ────────────────────────────────
  // The tablet chart shim has no subscribeVisiblePriceRangeChange, so we poll.
  // 100 ms interval mirrors the LivePriceBox approach in CustomChart.
  useEffect(() => {
    if (!candle) return;
    let prevY: number | null = null;

    const id = setInterval(() => {
      const y = candle.priceToCoordinate(0);
      if (y !== prevY) {
        prevY = y;
        scheduleRender();
      }
    }, 100);

    return () => clearInterval(id);
  }, [candle, scheduleRender]);

  // ── Re-render when drawings or selection changes ───────────────────────────
  useEffect(() => {
    scheduleRender();
  }, [drawings, selectedDrawingId, scheduleRender]);

  // ── Re-render when canvas size changes ────────────────────────────────────
  useEffect(() => {
    scheduleRender();
  }, [plotW, plotH, scheduleRender]);

  // ── Load drawings from API on symbol change ────────────────────────────────
  // Mirrors the web DrawingOverlay: drawings are symbol-scoped (not timeframe-
  // scoped) so a trendline drawn on 1H remains visible on 5M, 4H, 1D, etc.
  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(
          `${getApiBase()}/api/drawings?symbol=${encodeURIComponent(symbol)}`,
        );
        if (res.ok && !cancelled) {
          const data: Drawing[] = await res.json() as Drawing[];
          const deletedIds = getDeletedDrawingIds();
          resetDrawings(data.filter(d => !deletedIds.has(d.id)));
        }
      } catch {
        /* network unavailable — leave store as-is */
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [symbol, resetDrawings]);

  // ── Selection anchor handles ───────────────────────────────────────────────
  // Rendered as React Skia components inside the same Canvas so they composite
  // above the PictureRecorder layer without a second canvas surface.
  // Pass A: visual only (no drag handlers).
  const selectedDrawing = drawings.find(d => d.id === selectedDrawingId) ?? null;

  // Compute anchor pixel positions at React render time.
  // toPxRef.current is updated by doRender(); between renders it reflects the
  // last committed viewport, which is good enough for static handle display.
  const anchorPxPoints: Px[] = [];
  if (selectedDrawing) {
    for (const pt of selectedDrawing.points) {
      const px = toPxRef.current(pt);
      if (px) anchorPxPoints.push(px);
    }
  }

  const handleColor = selectedDrawing?.style.color ?? "#B7FF5A";

  // ── Render ─────────────────────────────────────────────────────────────────
  // The overlay covers the same area as the chart plotting surface.
  // pointerEvents="none" — all touch events fall through to the chart.
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={onLayout}
    >
      {picture && plotW > 0 && plotH > 0 && (
        <Canvas
          style={{
            position: "absolute",
            left:     0,
            top:      0,
            width:    plotW,
            height:   plotH,
          }}
        >
          {/* All drawing shapes — rendered by the ported imperative renderer */}
          <Picture picture={picture} />

          {/* ── Anchor handles for the selected drawing ─────────────────────
              Two concentric circles per point: outer translucent halo + inner
              solid dot.  Mirrors the web SVG handles (DrawingShape's anchor
              <circle> elements).  Pass A: visual only, no drag handlers. */}
          {selectedDrawing && anchorPxPoints.map((px, i) => (
            <Group key={i}>
              {/* Outer halo */}
              <Circle
                cx={px.x}
                cy={px.y}
                r={6}
                color={handleColor}
                opacity={0.18}
              />
              {/* Inner dot */}
              <Circle
                cx={px.x}
                cy={px.y}
                r={3}
                color={handleColor}
                opacity={0.95}
              />
            </Group>
          ))}
        </Canvas>
      )}
    </View>
  );
});

export default DrawingOverlay;
