/**
 * ChartAxisHelpers.ts — Axis label formatter factories for analytics charts.
 *
 * Each factory returns a function with the signature expected by
 * victory-native's `axisOptions.formatXLabel` / `formatYLabel` props.
 *
 * Phase 10.6 — Analytics Foundation
 */

import { formatShortDate, formatCurrencyCompact, formatPercent } from "./chartUtils";

// ── X-axis formatters ──────────────────────────────────────────────────────

/**
 * Formats a date string "YYYY-MM-DD" as a short label "Jan 5".
 * Use as CartesianChart axisOptions.formatXLabel for time-series charts.
 */
export function makeDateXFormatter(): (value: string | number) => string {
  return (value: string | number): string => {
    if (typeof value !== "string" || !value.includes("-")) return String(value);
    return formatShortDate(value);
  };
}

/**
 * Returns the label value as-is (identity).
 * Use for category axes where labels are already human-readable.
 */
export function makeIdentityXFormatter(): (value: string | number) => string {
  return (value: string | number): string => String(value);
}

/**
 * Truncates long category labels to `maxLen` characters.
 * Use for symbol or broker name axes.
 */
export function makeTruncatedXFormatter(
  maxLen: number = 6,
): (value: string | number) => string {
  return (value: string | number): string => {
    const s = String(value);
    return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
  };
}

// ── Y-axis formatters ──────────────────────────────────────────────────────

/**
 * Compact currency formatter for Y-axis ticks: "$1.2k", "-$500".
 * Pass the currency symbol (default "$").
 */
export function makeCurrencyYFormatter(
  symbol: string = "$",
): (value: string | number) => string {
  return (value: string | number): string => {
    const n = typeof value === "number" ? value : Number(value);
    if (isNaN(n)) return "";
    return formatCurrencyCompact(n, symbol);
  };
}

/**
 * Percentage formatter for Y-axis ticks: "68.5%".
 */
export function makePercentYFormatter(
  decimals: number = 0,
): (value: string | number) => string {
  return (value: string | number): string => {
    const n = typeof value === "number" ? value : Number(value);
    if (isNaN(n)) return "";
    return formatPercent(n, decimals);
  };
}

/**
 * Plain number formatter for Y-axis ticks.
 */
export function makePlainYFormatter(
  decimals: number = 1,
): (value: string | number) => string {
  return (value: string | number): string => {
    const n = typeof value === "number" ? value : Number(value);
    if (isNaN(n)) return "";
    return n.toFixed(decimals);
  };
}
