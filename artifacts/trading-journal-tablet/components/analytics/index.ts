/**
 * components/analytics/index.ts — Analytics foundation barrel export.
 *
 * All shared chart wrappers, theme constants, utilities, and state components
 * are re-exported from here.  Analytics screens import from this single entry
 * point rather than from individual files.
 *
 * Phase 10.6 — Analytics Foundation
 */

// ── Theme & configuration ──────────────────────────────────────────────────

export {
  CHART_COLORS,
  CHART_THEME,
  CHART_FONT_SIZE,
  GREEN,
  RED,
  PURPLE,
  BLUE,
  ORANGE,
  MUTED,
  makeAxisFont,
  hexWithAlpha,
} from "./chartTheme";

export {
  DEFAULT_CHART_HEIGHT,
  DEFAULT_PIE_HEIGHT,
  DEFAULT_RADAR_HEIGHT,
  DEFAULT_HBAR_HEIGHT,
  AXIS_TICK_COUNT,
  CHART_PADDING,
  CHART_DOMAIN_PADDING,
  BAR_ROUNDED_CORNERS,
  LINE_STROKE_WIDTH,
  DONUT_INNER_RADIUS,
  RADAR_GRID_LEVELS,
  RADAR_LABEL_PADDING,
  CHART_ANIMATE,
  TIME_FILTER_OPTIONS,
  type TimeFilter,
  type TimeFilterOption,
} from "./chartConfig";

// ── Utilities ──────────────────────────────────────────────────────────────

export {
  localDateStr,
  formatShortDate,
  formatLongDate,
  getCutoffDate,
  formatCurrency,
  formatCurrencyCompact,
  formatPercent,
  pnlColor,
  pnlColorStrict,
  addXIndex,
  thinData,
  splitBySign,
} from "./chartUtils";

export {
  makeDateXFormatter,
  makeIdentityXFormatter,
  makeTruncatedXFormatter,
  makeCurrencyYFormatter,
  makePercentYFormatter,
  makePlainYFormatter,
} from "./ChartAxisHelpers";

// ── Shared UI components ───────────────────────────────────────────────────

export { ChartLoadingState, ChartEmptyState, ChartErrorState } from "./ChartEmptyState";
export { ChartContainer }                                       from "./ChartContainer";
export { ChartTooltip, ChartMultiTooltip }                     from "./ChartTooltip";
export { ChartLegend }                                          from "./ChartLegend";
export type { LegendItem, ChartLegendProps }                   from "./ChartLegend";
export type { ChartContainerProps }                             from "./ChartContainer";
export type { ChartTooltipProps, ChartMultiTooltipProps, TooltipState } from "./ChartTooltip";

// ── Chart wrappers ─────────────────────────────────────────────────────────

export {
  AreaChartWrapper,
  EquityCurveChartImpl,
} from "./AreaChartWrapper";
export type { AreaChartWrapperProps } from "./AreaChartWrapper";

export {
  BarChartWrapper,
  HorizontalBarChart,
  WeeklyPnlChartImpl,
  BrokerPnlChartImpl,
  RRHistogramChartImpl,
  SymbolPnlChartImpl,
} from "./BarChartWrapper";
export type { BarChartWrapperProps, HorizontalBarChartProps } from "./BarChartWrapper";

export {
  LineChartWrapper,
} from "./LineChartWrapper";
export type { LineChartWrapperProps } from "./LineChartWrapper";

export {
  PieChartWrapper,
  WinLossChartImpl,
} from "./PieChartWrapper";
export type { PieChartWrapperProps } from "./PieChartWrapper";

export {
  RadarChartWrapper,
  PerformanceRadarChartImpl,
} from "./RadarChartWrapper";
export type { RadarChartWrapperProps } from "./RadarChartWrapper";
