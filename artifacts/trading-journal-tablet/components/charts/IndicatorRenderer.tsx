/**
 * IndicatorRenderer.tsx — React Native / Skia port (Phase 9.19 Pass A)
 *
 * Renders built-in applied indicators (EMA, SMA, VWAP, RSI, SUPERTREND) as
 * line series on the Skia chart.  Mirrors the web source exactly except for
 * the changes documented below.
 *
 * Web → RN changes
 * ─────────────────
 * 1. lightweight-charts removed
 *    - `LineSeries`          → local "LineSeries" string constant (matches
 *                              CustomChart.tsx's SkiaChartApiImpl.addSeries tag)
 *    - `ISeriesApi<"Line">`  → local `_IndSeries` interface whose shape is
 *                              satisfied by SkiaSeriesApiImpl at runtime
 *    - `Time`                → `number` (Unix timestamp — identical underlying type)
 *    - `LineStyle` enum      → local `LineStyle` const object with same values
 *    The cast `chart as unknown as _IndChart` is safe: ChartContext always holds
 *    a SkiaChartApiImpl, which satisfies _IndChart at runtime.
 *
 * 2. useLiveMarketContext removed
 *    LiveMarketContext is a stub on tablet (Phase 6.x provides the real WS
 *    context).  The subscribeToMessages live-tick effect is preserved in
 *    structure with a noop subscriber; it activates automatically when Phase 6
 *    merges.
 *
 * 3. Import paths updated
 *    `@/contexts/ChartContext`, `@/contexts/ChartBarsContext`,
 *    `@/store/indicatorStore`, `@/store/chartStore`,
 *    `@/calculations/indicatorCalc` all resolve to the tablet packages.
 *    `./chartPanState` is the already-ported module (no changes).
 *
 * All logic, mathematics, point caching, pan-range synchronisation, render
 * ordering, and cleanup are preserved identically to the web source.
 */

import { useEffect, useRef, useMemo, useCallback } from "react";
import { useChartContext } from "@/contexts/ChartContext";
import { useChartBars } from "@/contexts/ChartBarsContext";
import { useIndicatorStore, type AppliedIndicator } from "@/store/indicatorStore";
import { useChartStore, type OHLCBar } from "@/store/chartStore";
import { calcEMA, calcSMA, calcVWAP, calcRSI, calcSupertrend } from "@/calculations/indicatorCalc";
import { subscribePanRange, getPanRange } from "./chartPanState";

// ── Local type & constant replacements for lightweight-charts ─────────────────

/**
 * Unix-second timestamp — identical to LWC's UTCTimestamp underneath.
 * Using a local alias keeps the series point types identical to the web source.
 */
type _Time = number;

/**
 * Autoscale info shape — matches SkiaSeriesApiImpl.applyOptions and LWC.
 */
type _AutoscaleInfo = { priceRange: { minValue: number; maxValue: number } } | null;

/**
 * Minimal series interface whose shape is satisfied by SkiaSeriesApiImpl.
 *
 * The cast `chart.addSeries(...) as _IndSeries` is safe: at runtime the chart
 * is always a SkiaChartApiImpl and addSeries always returns a SkiaSeriesApiImpl
 * that implements every method listed here.
 */
interface _IndSeries {
  setData(data: Array<{ time: _Time; value: number }>): void;
  update(point: { time: _Time; value: number }): void;
  applyOptions(opts: {
    visible?: boolean;
    color?: string;
    lineWidth?: number;
    lineStyle?: number;
    autoscaleInfoProvider?: (() => _AutoscaleInfo) | null;
    [k: string]: unknown;
  }): void;
}

/**
 * Minimal chart interface that exposes addSeries / removeSeries.
 * SkiaChartApiImpl satisfies this at runtime; IChartApi (the stub in
 * ChartContext) does not declare these methods, so we cast.
 */
interface _IndChart {
  addSeries(type: unknown, opts?: Record<string, unknown>): _IndSeries;
  removeSeries(series: _IndSeries): void;
}

/** Series type tag — mirrors the CustomChart.tsx constant. */
const LineSeries = "LineSeries" as const;

/**
 * LineStyle const — mirrors LWC's LineStyle enum and CustomChart.tsx's local
 * constant so numeric values are identical across web and tablet.
 */
const LineStyle = { Solid: 0, Dotted: 1, Dashed: 2 } as const;

// ── LiveMarketContext stub ─────────────────────────────────────────────────────
//
// LiveMarketContext is a stub on tablet (Phase 6.x).  Using a noop here
// preserves the useEffect structure exactly so it activates automatically
// when the real subscribeToMessages is provided.

const _noopUnsub = () => {};
function _noopSubscribe(_fn: (msg: unknown) => void) { return _noopUnsub; }

// ── Types ─────────────────────────────────────────────────────────────────────

interface SeriesEntry {
  series: _IndSeries;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLineStyle(s: string): number {
  if (s === "dashed") return LineStyle.Dashed;
  if (s === "dotted") return LineStyle.Dotted;
  return LineStyle.Solid;
}

function buildPoints(bars: OHLCBar[], ind: AppliedIndicator): { time: _Time; value: number }[] {
  if (!bars.length) return [];
  const closes = bars.map(b => b.close);

  try {
    switch (ind.type) {
      case "SMA": {
        const period = Number(ind.settings.period) || 20;
        const vals = calcSMA(closes, period);
        return bars.flatMap((b, i) => vals[i] != null ? [{ time: b.time as _Time, value: vals[i]! }] : []);
      }
      case "VWAP": {
        const vals = calcVWAP(bars);
        return bars.flatMap((b, i) => vals[i] != null ? [{ time: b.time as _Time, value: vals[i]! }] : []);
      }
      case "RSI": {
        const period = Number(ind.settings.period) || 14;
        const rsiVals = calcRSI(closes, period);
        const slice = closes.slice(-100);
        const minP = Math.min(...slice);
        const maxP = Math.max(...slice);
        const range = maxP - minP || 1;
        return bars.flatMap((b, i) => {
          const r = rsiVals[i];
          return r != null ? [{ time: b.time as _Time, value: minP + (r / 100) * range }] : [];
        });
      }
      case "SUPERTREND": {
        const period = Number(ind.settings.period) || 10;
        const mult   = Number(ind.settings.multiplier) || 3;
        const pts = calcSupertrend(bars, period, mult);
        return bars.flatMap((b, i) => {
          const p = pts[i];
          return p != null ? [{ time: b.time as _Time, value: p.value }] : [];
        });
      }
      case "EMA":
      default: {
        const period = Number(ind.settings.period) || 9;
        const vals = calcEMA(closes, period);
        return bars.flatMap((b, i) => vals[i] != null ? [{ time: b.time as _Time, value: vals[i]! }] : []);
      }
    }
  } catch {
    return [];
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function IndicatorRenderer() {
  const { chart } = useChartContext();
  const { barsRef, replayBarCount } = useChartBars();
  const appliedIndicators = useIndicatorStore(s => s.appliedIndicators);
  const { barsLoaded } = useChartStore();

  // subscribeToMessages: noop on tablet until Phase 6 provides live WS context
  const subscribeToMessages = _noopSubscribe;

  const seriesMapRef = useRef<Map<string, SeriesEntry>>(new Map());

  // Stable memoized array — only recomputes when appliedIndicators identity changes.
  // This is critical: without useMemo, a new array ref is created every render,
  // which makes the sync useEffect run on every render → infinite loop / freeze.
  const builtinInds = useMemo(
    () => appliedIndicators.filter(i => i.type !== "CUSTOM"),
    [appliedIndicators],
  );

  // Keep a ref for use inside WS callback (avoids stale closure)
  const indicatorsRef = useRef(builtinInds);
  indicatorsRef.current = builtinInds;

  // Per-indicator point cache.
  // Validity is checked via bar count AND first/last bar timestamps so that
  // stale replay-slice points are never served when live data happens to have
  // the same bar count as the last replay slice.
  const pointCacheRef = useRef<Map<string, {
    barsLen:   number;
    firstTime: number;
    lastTime:  number;
    pts: { time: _Time; value: number }[];
  }>>(new Map());

  const getPoints = useCallback((bars: OHLCBar[], ind: AppliedIndicator) => {
    const cacheKey  = ind.id;
    const cached    = pointCacheRef.current.get(cacheKey);
    const firstTime = (bars[0]?.time ?? 0) as number;
    const lastTime  = (bars[bars.length - 1]?.time ?? 0) as number;
    if (
      cached &&
      cached.barsLen   === bars.length &&
      cached.firstTime === firstTime   &&
      cached.lastTime  === lastTime
    ) return cached.pts;
    const pts = buildPoints(bars, ind);
    pointCacheRef.current.set(cacheKey, { barsLen: bars.length, firstTime, lastTime, pts });
    return pts;
  }, []);

  // Sync series to chart whenever indicators list or bars change
  useEffect(() => {
    if (!chart || !barsLoaded) return;
    const bars = barsRef.current;
    if (!bars.length) return;
    const map = seriesMapRef.current;
    // Cast to extended interface — safe: chart is SkiaChartApiImpl at runtime
    const indChart = chart as unknown as _IndChart;

    // Remove series for deleted indicators
    const currentIds = new Set(builtinInds.map(i => i.id));
    for (const [id, entry] of map) {
      if (!currentIds.has(id)) {
        try { indChart.removeSeries(entry.series); } catch { /**/ }
        map.delete(id);
        pointCacheRef.current.delete(id);
      }
    }

    // Add / update series
    const firstTime = (bars[0]?.time ?? 0) as number;
    const lastTime  = (bars[bars.length - 1]?.time ?? 0) as number;
    for (const ind of builtinInds) {
      // Check cache BEFORE calling getPoints (which mutates the cache).
      // Validate by bar count AND timestamps so stale replay-slice data is never
      // reused when live data coincidentally has the same number of bars.
      const prevCached = pointCacheRef.current.get(ind.id);
      const dataChanged = !prevCached
        || prevCached.barsLen   !== bars.length
        || prevCached.firstTime !== firstTime
        || prevCached.lastTime  !== lastTime;
      const pts = getPoints(bars, ind);
      const existing = map.get(ind.id);
      if (existing) {
        try {
          existing.series.applyOptions({
            visible:   ind.visible,
            color:     ind.color,
            lineWidth: (ind.lineWidth || 1),
            lineStyle: toLineStyle(ind.lineStyle),
          });
          if (dataChanged) {
            existing.series.setData(pts);
          }
        } catch { /**/ }
      } else {
        try {
          const s = indChart.addSeries(LineSeries, {
            color:                  ind.color,
            lineWidth:              (ind.lineWidth || 1),
            lineStyle:              toLineStyle(ind.lineStyle),
            visible:                ind.visible,
            priceLineVisible:       false,
            crosshairMarkerVisible: false,
            lastValueVisible:       false,
          });
          s.setData(pts);
          map.set(ind.id, { series: s });
        } catch { /**/ }
      }
    }
  }, [chart, barsLoaded, builtinInds, barsRef, getPoints, replayBarCount]);

  // Live tick updates — only update the last point, never recalculate full series.
  // subscribeToMessages is a noop on tablet until Phase 6; this effect will
  // activate automatically when the real LiveMarketContext is provided.
  useEffect(() => {
    return subscribeToMessages((msg: unknown) => {
      if (!chart) return;
      const m = msg as { type?: string; bar?: OHLCBar };
      if ((m.type !== "bar_update" && m.type !== "new_bar") || !m.bar) return;
      const bars = barsRef.current;
      if (!bars.length) return;
      const map = seriesMapRef.current;

      for (const ind of indicatorsRef.current) {
        if (!ind.visible) continue;
        const entry = map.get(ind.id);
        if (!entry) continue;
        try {
          // Invalidate cache for this indicator so next full sync uses fresh data
          pointCacheRef.current.delete(ind.id);
          const pts = buildPoints(bars, ind);
          const last = pts[pts.length - 1];
          if (last) entry.series.update(last);
        } catch { /**/ }
      }
    });
  }, [chart, subscribeToMessages, barsRef]);

  // Lock all indicator series to the same vertical pan range as the candlestick.
  // The Skia chart unions autoscaleInfoProvider results across all series in a
  // pane; if EMA/SMA don't return the same locked range, the price scale expands
  // to include their natural data range and vertical pan feels "limited". We
  // install a live provider that reads getPanRange() dynamically — the main
  // series' per-frame applyOptions triggers LWC to re-call all providers,
  // picking up the updated value.
  useEffect(() => {
    return subscribePanRange((range) => {
      for (const entry of seriesMapRef.current.values()) {
        try {
          if (range !== null) {
            entry.series.applyOptions({
              autoscaleInfoProvider: () => {
                const r = getPanRange();
                return r ? { priceRange: { minValue: r.lo, maxValue: r.hi } } : null;
              },
            });
          } else {
            entry.series.applyOptions({ autoscaleInfoProvider: () => null });
          }
        } catch { /**/ }
      }
    });
  }, []); // module-level subscribePanRange needs no deps

  // Cleanup all series on unmount
  useEffect(() => {
    return () => {
      if (!chart) return;
      const indChart = chart as unknown as _IndChart;
      for (const entry of seriesMapRef.current.values()) {
        try { indChart.removeSeries(entry.series); } catch { /**/ }
      }
      seriesMapRef.current.clear();
      pointCacheRef.current.clear();
    };
  }, [chart]);

  return null;
}
