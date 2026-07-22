/**
 * CustomIndicatorRenderer.tsx — React Native / Skia port (Phase 9.19 Pass A)
 *
 * Renders CUSTOM Pine Script indicators as chart series and, for SMC types,
 * a Skia Canvas overlay drawn imperatively via PictureRecorder.
 *
 * Web → RN changes
 * ─────────────────
 * 1. lightweight-charts removed
 *    - `LineSeries`, `AreaSeries`     → local string constants (match
 *                                       SkiaChartApiImpl's addSeries tags)
 *    - `LWLineStyle` (LineStyle enum) → local const object with same values
 *    - `ISeriesApi<SeriesType>`       → local `_CIRSeries` interface
 *    - `Time`                         → `number` (Unix timestamp, same type)
 *    The cast `chart as unknown as _CIRChart` is safe: ChartContext always
 *    holds a SkiaChartApiImpl that satisfies _CIRChart at runtime.
 *
 * 2. SMCOverlay: SVG → Skia PictureRecorder
 *    Web: <div><svg> ... </svg></div> rendered with React SVG elements.
 *    RN:  <View onLayout><Canvas><Picture /></Canvas></View> rendered
 *         imperatively via Skia.PictureRecorder — the same approach used by
 *         DrawingOverlay.tsx.
 *    Text rendering uses Skia.Font(undefined, size) (system default typeface),
 *    identical to the pattern in drawingCanvasRenderer.ts.
 *    Dashed lines are drawn by iterating dash segments to avoid a PathEffect
 *    API compatibility dependency.
 *
 * 3. useChartSize (ResizeObserver) → View onLayout
 *    ResizeObserver is a browser API.  On RN, layout dimensions are received
 *    via the onLayout callback and stored in refs/state.
 *
 * 4. chart.timeScale().timeToCoordinate() → binary-search + barIdxToX math
 *    `timeToCoordinate` is not on the tablet IChartTimeScale stub.  We
 *    replace it with the same bar-index → pixel-X formula used by
 *    DrawingOverlay.tsx:  x = (barIdx − logFrom + 0.5) × barW
 *    where barW = overlayWidth / (logTo − logFrom).
 *
 * 5. subscribeVisibleTimeRangeChange → subscribeVisibleLogicalRangeChange
 *    The tablet IChartTimeScale only exposes the logical-range variant.
 *    Both triggered re-renders on the web; a single logical-range subscription
 *    is sufficient to keep the overlay in sync with pan/zoom.
 *
 * 6. paneIndex in addSeries
 *    The current Skia rendering engine (Phase 9.13/9.15) renders all series
 *    in the main pane.  paneIndex is tracked in IndSeries.paneIndex for
 *    future multi-pane support, but is not passed to SkiaChartApiImpl.addSeries
 *    (which does not yet support the third argument).
 *
 * All series management logic, pan-range sync, render ordering, and cleanup
 * are preserved identically to the web source.
 */

import { useEffect, useRef, useState, useCallback, memo } from "react";
import { View, StyleSheet, type LayoutChangeEvent } from "react-native";
import {
  Canvas, Picture, Skia, PaintStyle,
  type SkPicture, type SkFont, type SkColor,
} from "@shopify/react-native-skia";
import { useChartContext } from "@/contexts/ChartContext";
import { useChartBars } from "@/contexts/ChartBarsContext";
import { useIndicatorStore } from "@/store/indicatorStore";
import { useChartStore } from "@/store/chartStore";
import { subscribePanRange, getPanRange } from "./chartPanState";
import {
  parsePineScript, computeCustomIndicator,
  type ParsedPineResult, type PineZone, type PineLevel,
} from "@/calculations/pineParser";
import type { OHLCBar } from "@/store/chartStore";

// ── Local type & constant replacements for lightweight-charts ─────────────────

/** Unix-second timestamp — identical to LWC's UTCTimestamp underneath. */
type _Time = number;

/** Autoscale info shape — matches SkiaSeriesApiImpl.applyOptions and LWC. */
type _AutoscaleInfo = { priceRange: { minValue: number; maxValue: number } } | null;

/**
 * Minimal series interface satisfied by SkiaSeriesApiImpl at runtime.
 * Includes createPriceLine for WaveTrend horizontal level lines.
 */
interface _CIRSeries {
  setData(data: Array<{ time: _Time; [k: string]: number }>): void;
  applyOptions(opts: {
    visible?: boolean;
    color?: string;
    lineWidth?: number;
    lineColor?: string;
    topColor?: string;
    bottomColor?: string;
    autoscaleInfoProvider?: (() => _AutoscaleInfo) | null;
    [k: string]: unknown;
  }): void;
  createPriceLine(opts: {
    price:            number;
    color:            string;
    lineWidth:        number;
    lineStyle:        number;
    axisLabelVisible: boolean;
    title:            string;
  }): unknown;
}

/**
 * Minimal chart interface exposing addSeries / removeSeries.
 * SkiaChartApiImpl satisfies this at runtime.
 */
interface _CIRChart {
  addSeries(type: unknown, opts?: Record<string, unknown>): _CIRSeries;
  removeSeries(series: _CIRSeries): void;
}

/** Series type tags — mirror CustomChart.tsx constants. */
const LineSeries = "LineSeries" as const;
const AreaSeries = "AreaSeries" as const;

/**
 * LineStyle const — mirrors LWC's LineStyle enum and CustomChart.tsx's local
 * constant so numeric values are identical across web and tablet.
 */
const LWLineStyle = { Solid: 0, Dotted: 1, Dashed: 2 } as const;

// ── Skia colour helpers ───────────────────────────────────────────────────────
//
// Skia.Color(cssString) parses a CSS colour string and returns a SkColor (the
// branded number type that Skia's paint.setColor() requires).
// We build 8-digit hex strings (#rrggbbaa) to encode alpha, converting the
// rgba() values from the web SVG source exactly.

/** Convert (r,g,b,a) → SkColor via an 8-digit CSS hex string. */
function rgbaToSkia(r: number, g: number, b: number, a: number): SkColor {
  const h = (n: number) => (n & 0xff).toString(16).padStart(2, "0");
  return Skia.Color(`#${h(r)}${h(g)}${h(b)}${h(Math.round(a * 255))}`);
}

function zoneSkiaColors(kind: PineZone["kind"]): { fill: SkColor; stroke: SkColor } {
  switch (kind) {
    case "fvg_bull": return { fill: rgbaToSkia(34,197,94,0.10),  stroke: rgbaToSkia(34,197,94,0.50)  };
    case "fvg_bear": return { fill: rgbaToSkia(239,68,68,0.10), stroke: rgbaToSkia(239,68,68,0.50) };
    case "ob_bull":  return { fill: rgbaToSkia(34,197,94,0.14),  stroke: rgbaToSkia(34,197,94,0.65)  };
    case "ob_bear":  return { fill: rgbaToSkia(239,68,68,0.14), stroke: rgbaToSkia(239,68,68,0.65) };
  }
}

function levelSkiaColor(kind: PineLevel["kind"]): SkColor {
  switch (kind) {
    case "bos_bull":   return Skia.Color("#22c55e");
    case "bos_bear":   return Skia.Color("#ef4444");
    case "choch_bull": return Skia.Color("#a78bfa");
    case "choch_bear": return Skia.Color("#fb923c");
    case "liq_high":   return Skia.Color("#38bdf8");
    case "liq_low":    return Skia.Color("#f59e0b");
  }
}

// ── Skia font cache ───────────────────────────────────────────────────────────
//
// Skia.Font(undefined, size) creates a font with the system default typeface.
// This is the same pattern used by drawingCanvasRenderer.ts (`getFont`).
// Cached by size to avoid repeated allocation during the render loop.

const _skFontCache = new Map<number, SkFont>();
function getSkFont(size: number): SkFont {
  let f = _skFontCache.get(size);
  if (!f) { f = Skia.Font(undefined, size); _skFontCache.set(size, f); }
  return f;
}

// ── SMC overlay (React Native / Skia) ────────────────────────────────────────

interface SMCOverlayProps {
  result:  ParsedPineResult;
  bars:    OHLCBar[];
  visible: boolean;
}

const SMCOverlay = memo(function SMCOverlay({ result, bars, visible }: SMCOverlayProps) {
  const { chart, candle } = useChartContext();

  // ── Layout size — replaces ResizeObserver ──────────────────────────────────
  const sizeRef  = useRef({ w: 0, h: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    sizeRef.current = { w: width, h: height };
    setSize({ w: width, h: height });
  }, []);

  // ── Re-render trigger (mirrors web version's setTick pattern) ──────────────
  const [tick, setTick] = useState(0);

  // Always-current refs — avoids stale closures in callbacks
  const chartRef  = useRef(chart);
  const candleRef = useRef(candle);
  chartRef.current  = chart;
  candleRef.current = candle;

  // ── Visible logical range ──────────────────────────────────────────────────
  // Updated by subscribeVisibleLogicalRangeChange; read synchronously by toX.
  const rangeRef = useRef<{ from: number; to: number } | null>(null);

  // Seed range on chart ready and subscribe to changes.
  // RN change: subscribeVisibleTimeRangeChange is not on the tablet stub.
  // subscribeVisibleLogicalRangeChange (which the tablet does expose) covers
  // both pan and zoom events — sufficient to keep the overlay in sync.
  useEffect(() => {
    if (!chart) return;
    const r = chart.timeScale().getVisibleLogicalRange();
    if (r) rangeRef.current = r;

    const onRangeChange = (r: { from: number; to: number } | null) => {
      if (r) rangeRef.current = r;
      setTick(t => t + 1);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRangeChange);
    return () => {
      try { chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRangeChange); } catch { /**/ }
    };
  }, [chart]);

  useEffect(() => { setTick(t => t + 1); }, [bars, result]);

  // ── Skia picture state ─────────────────────────────────────────────────────
  const [picture, setPicture] = useState<SkPicture | null>(null);

  // ── Convert bar timestamp → pixel X ───────────────────────────────────────
  // RN change: chart.timeScale().timeToCoordinate() is not on the tablet stub.
  // Replaced with binary-search-in-bars + barIdxToX math — the same approach
  // used by DrawingOverlay.tsx's toPx function.
  //   barW = overlayWidth / (logTo − logFrom)
  //   x    = (barIdx − logFrom + 0.5) × barW
  const toX = useCallback((t: number): number | null => {
    const { w: W } = sizeRef.current;
    if (W <= 0 || !rangeRef.current) return null;
    const { from: logFrom, to: logTo } = rangeRef.current;
    if (logTo <= logFrom) return null;
    const barW = W / (logTo - logFrom);

    // Binary search: find the bar whose time matches t exactly
    let lo = 0, hi = bars.length - 1, barIdx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].time === t) { barIdx = mid; break; }
      if (bars[mid].time  < t) lo = mid + 1;
      else hi = mid - 1;
    }
    if (barIdx < 0) return null;
    return (barIdx - logFrom + 0.5) * barW;
  }, [bars]);

  // ── Convert price → pixel Y via the candlestick series shim ───────────────
  const toY = useCallback((p: number): number | null => {
    const series = candleRef.current;
    if (!series) return null;
    return series.priceToCoordinate(p);
  }, []);

  // ── Re-record Skia picture on every relevant change ────────────────────────
  useEffect(() => {
    const { w: W, h: H } = sizeRef.current;
    if (W <= 0 || H <= 0 || !visible) { setPicture(null); return; }
    const range = rangeRef.current;
    if (!range || range.to <= range.from) { setPicture(null); return; }

    // rightX: pixel X of the last bar's right edge + 40 px (matches web source)
    let rightX = W;
    if (bars.length > 0) {
      const lastBar = bars[bars.length - 1];
      const rx = toX(lastBar.time);
      if (rx != null) rightX = Math.min(rx + 40, W);
    }

    const recorder = Skia.PictureRecorder();
    const canvas   = recorder.beginRecording(Skia.XYWHRect(0, 0, W, H));

    const fontZone  = getSkFont(9);
    const fontLevel = getSkFont(8.5);

    // ── Zones ────────────────────────────────────────────────────────────────
    for (const zone of result.zones) {
      const x1 = toX(zone.startTime);
      const x2 = toX(zone.endTime) ?? rightX;
      const y1 = toY(zone.top);
      const y2 = toY(zone.bottom);
      if (x1 == null || y1 == null || y2 == null) continue;

      const { fill: fillColor, stroke: strokeColor } = zoneSkiaColors(zone.kind);
      const rx = Math.min(x1, x2);
      const ry = Math.min(y1, y2);
      const rw = Math.max(Math.abs(x2 - x1), 8);
      const rh = Math.abs(y2 - y1);
      if (rh < 0.5) continue;

      // Rounded rect (rx=2) — mirrors web SVG rx={2}
      const rrect = Skia.RRectXY(Skia.XYWHRect(rx, ry, rw, rh), 2, 2);

      const fillPaint = Skia.Paint();
      fillPaint.setColor(fillColor);
      fillPaint.setStyle(PaintStyle.Fill);
      canvas.drawRRect(rrect, fillPaint);

      const strokePaint = Skia.Paint();
      strokePaint.setColor(strokeColor);
      strokePaint.setStyle(PaintStyle.Stroke);
      strokePaint.setStrokeWidth(1);
      canvas.drawRRect(rrect, strokePaint);

      // Zone label (top-left, 9 px)
      if (zone.label) {
        const textPaint = Skia.Paint();
        textPaint.setColor(strokeColor);
        canvas.drawText(zone.label, rx + 4, ry + 10, textPaint, fontZone);
      }
    }

    // ── Levels ───────────────────────────────────────────────────────────────
    for (const lv of result.levels) {
      const x1 = toX(lv.time);
      const y  = toY(lv.price);
      if (x1 == null || y == null) continue;
      const color = levelSkiaColor(lv.kind);

      // Dashed line: strokeWidth=1.2, dasharray=[6,4].
      // Drawn as manual segments to avoid PathEffect API version dependencies.
      const linePaint = Skia.Paint();
      linePaint.setColor(color);
      linePaint.setStrokeWidth(1.2);
      linePaint.setStyle(PaintStyle.Stroke);
      linePaint.setAntiAlias(true);

      const SEG = 6, GAP = 4, PAT = SEG + GAP;
      let cx = x1;
      while (cx < rightX) {
        const ex = Math.min(cx + SEG, rightX);
        canvas.drawLine(cx, y, ex, y, linePaint);
        cx += PAT;
      }

      // Coloured pill at the right edge — mirrors <rect x={rightX-36} y={y-8} width={34} height={14} rx={3}/>
      const pillRect  = Skia.XYWHRect(rightX - 36, y - 8, 34, 14);
      const pillRRect = Skia.RRectXY(pillRect, 3, 3);
      const pillPaint = Skia.Paint();
      pillPaint.setColor(color);
      pillPaint.setStyle(PaintStyle.Fill);
      pillPaint.setAlphaf(0.9);
      canvas.drawRRect(pillRRect, pillPaint);

      // Label text centred in pill — mirrors textAnchor="middle" x={rightX-19}
      const textPaint = Skia.Paint();
      textPaint.setColor(rgbaToSkia(15, 22, 24, 1)); // #0f1618 from web source
      const tw = fontLevel.measureText(lv.label).width;
      const tx = rightX - 19 - tw / 2;
      canvas.drawText(lv.label, tx, y + 4, textPaint, fontLevel);
    }

    setPicture(recorder.finishRecordingAsPicture());
  }, [tick, visible, result, bars, toX, toY]);

  if (!visible) return null;

  return (
    <View
      onLayout={onLayout}
      pointerEvents="none"
      style={styles.smcOverlay}
    >
      {picture != null && size.w > 0 && size.h > 0 && (
        <Canvas style={{ width: size.w, height: size.h }}>
          <Picture picture={picture} />
        </Canvas>
      )}
    </View>
  );
});

// ── Per-indicator series tracker ──────────────────────────────────────────────

interface IndSeries {
  seriesList: _CIRSeries[];
  /** Allocated pane index; tracked for future multi-pane support. */
  paneIndex:  number;
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export default function CustomIndicatorRenderer() {
  const { chart } = useChartContext();
  const { barsRef, replayBarCount } = useChartBars();
  const { appliedIndicators } = useIndicatorStore();
  const { barsLoaded } = useChartStore();

  // Map from indicator id → series list + pane index
  const seriesMapRef = useRef<Map<string, IndSeries>>(new Map());
  // Parsed results cache (used by SMC overlay)
  const resultsRef  = useRef<Map<string, ParsedPineResult>>(new Map());
  // Track which pane indices are in use (so we can allocate new ones)
  const paneCountRef = useRef(1); // pane 0 = main chart

  const customInds = appliedIndicators.filter(i => i.type === "CUSTOM");

  function lwLineStyle(s?: string): number {
    if (s === "dashed") return LWLineStyle.Dashed;
    if (s === "dotted") return LWLineStyle.Dotted;
    return LWLineStyle.Solid;
  }

  // ── Build / sync series on bar/indicator change ───────────────────────────
  useEffect(() => {
    if (!chart || !barsLoaded) return;
    const bars = barsRef.current;
    const map  = seriesMapRef.current;
    // Cast to extended interface — safe: chart is SkiaChartApiImpl at runtime
    const indChart = chart as unknown as _CIRChart;

    // Remove stale entries
    const currentIds = new Set(customInds.map(i => i.id));
    for (const [id, entry] of map) {
      if (!currentIds.has(id)) {
        for (const s of entry.seriesList) { try { indChart.removeSeries(s); } catch { /**/ } }
        map.delete(id);
        resultsRef.current.delete(id);
      }
    }

    for (const ind of customInds) {
      const pineCode = (ind.pineCode as string) ?? "";
      const parsed   = parsePineScript(pineCode);
      const result   = computeCustomIndicator(parsed, bars, ind.color, pineCode);
      resultsRef.current.set(ind.id, result);

      const existing = map.get(ind.id);

      // ── Multi-series (WaveTrend / future oscillators) ──────────────────
      if (result.multiSeries.length > 0) {
        // Allocate a logical pane index for this oscillator.
        // The current Skia rendering engine renders all series in the main pane;
        // paneIndex is tracked here so multi-pane support can be added later
        // without changing this file's logic.
        const paneIndex = existing?.paneIndex ?? paneCountRef.current++;

        if (existing) {
          // Update visibility + re-feed data
          for (let si = 0; si < existing.seriesList.length; si++) {
            const s  = existing.seriesList[si];
            const ms = result.multiSeries[si];
            if (!ms) continue;
            try {
              s.applyOptions({ visible: ind.visible });
              s.setData(ms.plots.map(p => ({ time: p.time as _Time, value: p.value })));
            } catch { /**/ }
          }
        } else {
          // Create all series in the allocated pane
          const seriesList: _CIRSeries[] = [];

          for (const ms of result.multiSeries) {
            try {
              let s: _CIRSeries;
              if (ms.style === "area") {
                s = indChart.addSeries(AreaSeries, {
                  lineColor:   ms.color,
                  topColor:    ms.areaTopColor    ?? "rgba(59,130,246,0.3)",
                  bottomColor: ms.areaBottomColor ?? "rgba(59,130,246,0.05)",
                  lineWidth:   (ms.lineWidth ?? 1),
                  priceLineVisible:       false,
                  crosshairMarkerVisible: false,
                  lastValueVisible:       false,
                  visible: ind.visible,
                });
              } else {
                s = indChart.addSeries(LineSeries, {
                  color:     ms.color,
                  lineWidth: (ms.lineWidth ?? 1),
                  priceLineVisible:       false,
                  crosshairMarkerVisible: false,
                  lastValueVisible:       false,
                  visible: ind.visible,
                });
              }
              s.setData(ms.plots.map(p => ({ time: p.time as _Time, value: p.value })));
              seriesList.push(s);
            } catch { /**/ }
          }

          // Add horizontal level lines via price lines on the last line series (wt1)
          if (result.hlines.length > 0 && seriesList.length > 0) {
            const refSeries = seriesList[seriesList.length - 1];
            for (const hl of result.hlines) {
              try {
                refSeries.createPriceLine({
                  price:            hl.price,
                  color:            hl.color,
                  lineWidth:        1,
                  lineStyle:        lwLineStyle(hl.lineStyle),
                  axisLabelVisible: true,
                  title:            hl.label ?? "",
                });
              } catch { /**/ }
            }
          }

          map.set(ind.id, { seriesList, paneIndex });
        }

      // ── Single plot series (EMA / SMA / VWAP / RSI) ───────────────────
      } else if (result.plots.length > 0 && result.overlay) {
        if (existing) {
          try {
            const s = existing.seriesList[0];
            s.applyOptions({ visible: ind.visible, color: ind.color });
            s.setData(result.plots.map(p => ({ time: p.time as _Time, value: p.value })));
          } catch { /**/ }
        } else {
          try {
            const s = indChart.addSeries(LineSeries, {
              color: ind.color, lineWidth: (ind.lineWidth || 1),
              priceLineVisible: false, crosshairMarkerVisible: false,
              lastValueVisible: false, visible: ind.visible,
            });
            s.setData(result.plots.map(p => ({ time: p.time as _Time, value: p.value })));
            map.set(ind.id, { seriesList: [s], paneIndex: 0 });
          } catch { /**/ }
        }

      // ── SMC / UNKNOWN: remove any existing chart series ────────────────
      // These are rendered exclusively via the Skia SMCOverlay below.
      } else {
        if (existing) {
          for (const s of existing.seriesList) { try { indChart.removeSeries(s); } catch { /**/ } }
          map.delete(ind.id);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, barsLoaded, customInds, barsRef, replayBarCount]);

  // Lock pane-0 (overlay) series to the same vertical pan range as the candlestick.
  // WaveTrend and other separate-pane indicators (paneIndex > 0) are intentionally
  // excluded — they have their own price scales and shouldn't be constrained.
  useEffect(() => {
    return subscribePanRange((range) => {
      for (const entry of seriesMapRef.current.values()) {
        if (entry.paneIndex !== 0) continue; // skip separate-pane indicators
        for (const s of entry.seriesList) {
          try {
            if (range !== null) {
              s.applyOptions({
                autoscaleInfoProvider: () => {
                  const r = getPanRange();
                  return r ? { priceRange: { minValue: r.lo, maxValue: r.hi } } : null;
                },
              });
            } else {
              s.applyOptions({ autoscaleInfoProvider: () => null });
            }
          } catch { /**/ }
        }
      }
    });
  }, []); // module-level subscribePanRange needs no deps

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (!chart) return;
      const indChart = chart as unknown as _CIRChart;
      for (const entry of seriesMapRef.current.values()) {
        for (const s of entry.seriesList) { try { indChart.removeSeries(s); } catch { /**/ } }
      }
      seriesMapRef.current.clear();
      paneCountRef.current = 1;
    };
  }, [chart]);

  // ── Render SMC Skia overlays ──────────────────────────────────────────────
  const bars = barsRef.current;
  const smcInds = customInds.filter(ind => {
    const pineCode = (ind.pineCode as string) ?? "";
    const parsed   = parsePineScript(pineCode);
    return ["SMC_FULL","SMC_STRUCTURE","SMC_FVG","SMC_OB","SMC_LIQUIDITY","UNKNOWN"].includes(parsed.type);
  });

  return (
    <>
      {smcInds.map(ind => {
        const result = resultsRef.current.get(ind.id);
        if (!result) return null;
        return <SMCOverlay key={ind.id} result={result} bars={bars} visible={ind.visible} />;
      })}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  smcOverlay: {
    position: "absolute",
    top:      0,
    left:     0,
    right:    0,
    bottom:   0,
    zIndex:   15,
    overflow: "hidden",
  },
});
