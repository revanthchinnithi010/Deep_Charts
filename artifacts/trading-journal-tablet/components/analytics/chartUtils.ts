/**
 * chartUtils.ts — Shared utility functions for analytics charts.
 *
 * Mirrors the helper functions in the web analytics pages (pnl-analytics.tsx,
 * NetPnLAnalytics.tsx, reports.tsx) while being React Native compatible.
 * Pure functions — no React, no hooks, no side-effects.
 *
 * Phase 10.6 — Analytics Foundation
 */

import type { TimeFilter } from "./chartConfig";
import { CHART_COLORS } from "./chartTheme";

// ── Date helpers ───────────────────────────────────────────────────────────

/**
 * Returns a YYYY-MM-DD string in the LOCAL calendar, free from UTC-offset drift.
 * Mirrors `localDateStr()` in pnl-analytics.tsx.
 */
export function localDateStr(d: Date): string {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** Short date — "Jan 5" format.  Mirrors `fShortDate()` in pnl-analytics.tsx. */
export function formatShortDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day:   "numeric",
  });
}

/** Long date — "Jan 5, 2024" format.  Mirrors `fLongDate()` in pnl-analytics.tsx. */
export function formatLongDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month:  "short",
    day:    "numeric",
    year:   "numeric",
  });
}

/**
 * Returns the cutoff date and todayOnly flag for a given time filter.
 * Mirrors `getCutoffDate()` in pnl-analytics.tsx.
 */
export function getCutoffDate(
  filter: TimeFilter,
): { cutoff: string | null; todayOnly: boolean } {
  const now = new Date();
  if (filter === "all")   return { cutoff: null, todayOnly: false };
  if (filter === "today") return { cutoff: localDateStr(now), todayOnly: true };
  const d = new Date(now);
  if (filter === "7d")   d.setDate(d.getDate() - 6);
  if (filter === "30d")  d.setDate(d.getDate() - 29);
  if (filter === "3m")   d.setMonth(d.getMonth() - 3);
  if (filter === "6m")   d.setMonth(d.getMonth() - 6);
  if (filter === "1y")   d.setFullYear(d.getFullYear() - 1);
  return { cutoff: localDateStr(d), todayOnly: false };
}

// ── Number formatters ──────────────────────────────────────────────────────

/** Currency formatter — "$1,234.56" or "-$234.56". */
export function formatCurrency(
  value:    number,
  decimals: number = 2,
  symbol:   string = "$",
): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return value < 0 ? `-${symbol}${formatted}` : `${symbol}${formatted}`;
}

/**
 * Compact currency formatter for axis ticks — "$1.2k", "$34k", "-$1.5k".
 * Mirrors the axis label formatters used throughout the web analytics pages.
 */
export function formatCurrencyCompact(value: number, symbol: string = "$"): string {
  const abs  = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}${symbol}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${sign}${symbol}${abs.toFixed(0)}`;
}

/** Percentage formatter — "68.5%" */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

// ── Color helpers ──────────────────────────────────────────────────────────

/** Returns the profit/loss color for a numeric value. */
export function pnlColor(value: number): string {
  return value >= 0 ? CHART_COLORS.profit : CHART_COLORS.loss;
}

/** Returns the profit/loss color with a provided neutral fallback at zero. */
export function pnlColorStrict(value: number): string {
  if (value > 0)  return CHART_COLORS.profit;
  if (value < 0)  return CHART_COLORS.loss;
  return CHART_COLORS.muted;
}

// ── Data transforms ────────────────────────────────────────────────────────

/**
 * Adds a numeric `xIndex` field to each data point for use as CartesianChart's
 * xKey when the natural key is a string (e.g. date).  victory-native performs
 * best with numeric x keys on large datasets.
 */
export function addXIndex<T extends object>(
  data: T[],
): Array<T & { xIndex: number }> {
  return data.map((d, i) => ({ ...d, xIndex: i }));
}

/**
 * Thin the data array to at most `maxPoints` evenly-spaced samples.
 * Preserves the first and last points to keep axis labels correct.
 */
export function thinData<T>(data: T[], maxPoints: number): T[] {
  if (data.length <= maxPoints) return data;
  const step = (data.length - 1) / (maxPoints - 1);
  const result: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(data[Math.round(i * step)]);
  }
  return result;
}

/**
 * Splits a dataset at the zero line for positive/negative coloring.
 * Returns points grouped into consecutive positive and negative runs.
 */
export function splitBySign<T extends { value: number }>(
  data: T[],
): Array<{ positive: boolean; points: T[] }> {
  if (data.length === 0) return [];
  const runs: Array<{ positive: boolean; points: T[] }> = [];
  let current: { positive: boolean; points: T[] } = {
    positive: data[0].value >= 0,
    points:   [data[0]],
  };
  for (let i = 1; i < data.length; i++) {
    const pos = data[i].value >= 0;
    if (pos !== current.positive) {
      runs.push(current);
      current = { positive: pos, points: [data[i]] };
    } else {
      current.points.push(data[i]);
    }
  }
  runs.push(current);
  return runs;
}
