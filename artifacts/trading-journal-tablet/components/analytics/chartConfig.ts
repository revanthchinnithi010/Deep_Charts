/**
 * chartConfig.ts — Shared chart configuration constants for analytics.
 *
 * Central place for all sizing, padding, and structural defaults.
 * Mirrors the configuration pattern from the web analytics pages.
 *
 * Phase 10.6 — Analytics Foundation
 */

// ── Default dimensions ─────────────────────────────────────────────────────

export const DEFAULT_CHART_HEIGHT     = 200;
export const DEFAULT_PIE_HEIGHT       = 220;
export const DEFAULT_RADAR_HEIGHT     = 240;
export const DEFAULT_HBAR_HEIGHT      = 190;

// ── Axis options ──────────────────────────────────────────────────────────

/** Tick counts for CartesianChart axes */
export const AXIS_TICK_COUNT = {
  x: 5,
  y: 5,
} as const;

// ── CartesianChart padding (inner canvas padding, in dp) ───────────────────

export const CHART_PADDING = {
  left:   4,
  right:  4,
  top:    12,
  bottom: 0,
} as const;

// ── Domain padding (space outside data extent, in data units) ──────────────

export const CHART_DOMAIN_PADDING = {
  left:   12,
  right:  12,
  top:    20,
  bottom: 4,
} as const;

// ── Bar chart corner radius ────────────────────────────────────────────────

export const BAR_ROUNDED_CORNERS = {
  topLeft:  4,
  topRight: 4,
} as const;

// ── Stroke widths ──────────────────────────────────────────────────────────

export const LINE_STROKE_WIDTH   = 2;
export const RADAR_STROKE_WIDTH  = 1.5;
export const RADAR_DATA_STROKE_W = 2;

// ── Pie / Donut defaults ───────────────────────────────────────────────────

/** Inner radius as percentage string for donut charts */
export const DONUT_INNER_RADIUS  = "52%";

// ── Radar chart ────────────────────────────────────────────────────────────

/** Number of concentric grid levels in the radar chart */
export const RADAR_GRID_LEVELS   = 5;
/** Padding around the radar canvas for axis labels */
export const RADAR_LABEL_PADDING = 32;

// ── Time filter options — identical to web analytics pages ─────────────────

export type TimeFilter = "today" | "7d" | "30d" | "3m" | "6m" | "1y" | "all";

export interface TimeFilterOption {
  id:    TimeFilter;
  label: string;
}

export const TIME_FILTER_OPTIONS: TimeFilterOption[] = [
  { id: "today", label: "Today" },
  { id: "7d",    label: "7D"   },
  { id: "30d",   label: "30D"  },
  { id: "3m",    label: "3M"   },
  { id: "6m",    label: "6M"   },
  { id: "1y",    label: "1Y"   },
  { id: "all",   label: "All"  },
];

// ── Animation config ───────────────────────────────────────────────────────

export const CHART_ANIMATE = {
  type: "spring" as const,
} satisfies { type: "spring" | "timing" };
