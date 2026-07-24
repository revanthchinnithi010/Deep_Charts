/**
 * chartTheme.ts — Shared analytics chart theme for the tablet app.
 *
 * Mirrors the color palette and visual language from the web analytics pages
 * (pnl-analytics.tsx, NetPnLAnalytics.tsx, reports.tsx). All hex values are
 * the computed equivalents of the HSL constants used on the web.
 *
 * Phase 10.6 — Analytics Foundation
 */

import { Platform } from "react-native";
import { matchFont } from "@shopify/react-native-skia";
import type { SkFont } from "@shopify/react-native-skia";

// ── Color palette — mirrors web analytics pages ────────────────────────────
// Web source constants (for reference):
//   GREEN  = "hsl(145, 58%, 52%)"   → #3ecc79
//   RED    = "hsl(0, 68%, 58%)"     → #dd4b4b
//   PURPLE = "hsl(161, 72%, 42%)"   → #1e9e73
//   BLUE   = "hsl(210, 80%, 62%)"   → #4ea8e8  /  "#60a5fa"
//   ORANGE = "hsl(32, 85%, 58%)"    → #e8892b
//   MUTED  = "hsl(128, 8%, 38%)"    → #5c6b5e

export const CHART_COLORS = {
  /** Profitable / win — green */
  profit:  "#3ecc79",
  /** Loss — red */
  loss:    "#dd4b4b",
  /** Primary accent — teal/purple */
  accent:  "#1e9e73",
  /** Secondary accent — blue */
  blue:    "#60a5fa",
  /** Tertiary accent — orange */
  orange:  "#e8892b",
  /** Neutral / breakeven — muted green-gray */
  muted:   "#5c6b5e",
  /** Equity curve line */
  equity:  "#60a5fa",
  /** Radar fill */
  radar:   "#1e9e73",
} as const;

// Convenience aliases for chart components that mirror web variable names
export const GREEN  = CHART_COLORS.profit;
export const RED    = CHART_COLORS.loss;
export const PURPLE = CHART_COLORS.accent;
export const BLUE   = CHART_COLORS.blue;
export const ORANGE = CHART_COLORS.orange;
export const MUTED  = CHART_COLORS.muted;

// ── Chart drawing theme ────────────────────────────────────────────────────

export const CHART_THEME = {
  /** Chart canvas background */
  background:      "transparent" as const,
  /** Grid line color */
  gridLine:        "rgba(255,255,255,0.06)",
  /** Axis tick label color */
  axisLabel:       "rgba(148,163,184,0.55)",
  /** Axis line (hidden by default — use grid instead) */
  axisLine:        "transparent" as const,
  /** Tooltip background — dark glassy */
  tooltipBg:       "rgba(12,14,19,0.96)",
  /** Tooltip border */
  tooltipBorder:   "rgba(57,91,67,0.35)",
  /** Tooltip text — primary */
  tooltipText:     "#EDF0F6",
  /** Tooltip text — muted label */
  tooltipMuted:    "rgba(148,163,184,0.70)",
  /** Area chart fill opacity suffix (appended to profit/loss hex as alpha) */
  areaFillOpacity: 0.18,
  /** Radar grid fill */
  radarGridFill:   "rgba(255,255,255,0.03)",
  /** Radar grid stroke */
  radarGridStroke: "rgba(255,255,255,0.08)",
  /** Radar data fill */
  radarDataFill:   "rgba(30,158,115,0.22)",
  /** Radar data stroke */
  radarDataStroke: "#1e9e73",
  /** Legend text */
  legendText:      "rgba(148,163,184,0.70)",
} as const;

// ── Font sizes ─────────────────────────────────────────────────────────────

export const CHART_FONT_SIZE = {
  axis:    10,
  tooltip: 12,
  legend:  12,
  label:   11,
} as const;

// ── Skia axis font factory ─────────────────────────────────────────────────
// Called once per component mount — NOT a hook.
// Returns null if the system font cannot be matched (labels simply won't render).

export function makeAxisFont(size: number = CHART_FONT_SIZE.axis): SkFont | null {
  try {
    return matchFont({
      fontFamily: Platform.select({
        ios:     "Helvetica Neue",
        android: "sans-serif",
        default: "sans-serif",
      }) as string,
      fontSize:   size,
      fontStyle:  "normal",
      fontWeight: "normal",
    });
  } catch {
    return null;
  }
}

// ── Hex color with alpha helper ────────────────────────────────────────────
/** Returns an 8-character hex string (#rrggaabb) with the given alpha 0-1. */
export function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  // Strip leading # and append alpha
  return `${hex}${a}`;
}
