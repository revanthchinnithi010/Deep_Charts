/**
 * AreaChartWrapper.tsx — Area chart wrapper for analytics screens.
 *
 * Wraps victory-native's CartesianChart + Area + Line primitives.
 * Accepts the EquityCurveChartProps contract defined in reports.tsx
 * as well as a generic API for other area chart uses.
 *
 * Phase 10.6 — Analytics Foundation
 */

import React, { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { CartesianChart, Area, Line, useChartPressState } from "victory-native";

import {
  CHART_ANIMATE,
  CHART_DOMAIN_PADDING,
  CHART_PADDING,
  DEFAULT_CHART_HEIGHT,
  LINE_STROKE_WIDTH,
} from "./chartConfig";
import { makeAxisFont, CHART_THEME, CHART_COLORS, hexWithAlpha } from "./chartTheme";
import {
  makeDateXFormatter,
  makeCurrencyYFormatter,
} from "./ChartAxisHelpers";
import { ChartTooltip } from "./ChartTooltip";
import { formatShortDate, addXIndex, thinData } from "./chartUtils";
import type { EquityCurveChartProps, AreaPoint } from "../../app/(tabs)/reports";

// ── Generic area chart props ───────────────────────────────────────────────

export interface AreaChartWrapperProps {
  /** Array of data points — must contain the keys named by xKey and yKey */
  data:           AreaPoint[];
  /** Hex or CSS color for the line and area fill (default: equity blue) */
  color?:         string;
  /** Y-axis value formatter (full precision — for tooltip) */
  formatter?:     (v: number) => string;
  /** Y-axis tick formatter (compact — for axis labels) */
  axisFormatter?: (v: number) => string;
  height?:        number;
  /** Max data points rendered (thin large datasets for performance) */
  maxPoints?:     number;
  /** Show or hide the tooltip on press */
  showTooltip?:   boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

export const AreaChartWrapper = memo(function AreaChartWrapper({
  data,
  color         = CHART_COLORS.equity,
  formatter     = (v: number) => `$${v.toFixed(2)}`,
  axisFormatter = makeCurrencyYFormatter(),
  height        = DEFAULT_CHART_HEIGHT,
  maxPoints     = 120,
  showTooltip   = true,
}: AreaChartWrapperProps) {
  // Load axis font once per component instance
  const font = useMemo(() => makeAxisFont(), []);

  // Thin very large datasets for performance
  const thinned = useMemo(
    () => thinData(data, maxPoints),
    [data, maxPoints],
  );

  // Add numeric xIndex for CartesianChart (better than date strings for interpolation)
  const chartData = useMemo(() => addXIndex(thinned), [thinned]);

  const { state, isActive } = useChartPressState({
    x: 0,
    y: { value: 0 },
  });

  const xFormatter = useMemo(
    () => (i: string | number) => {
      const idx = typeof i === "number" ? i : parseInt(String(i), 10);
      const point = thinned[idx];
      return point ? formatShortDate(point.date) : "";
    },
    [thinned],
  );

  const labelFormatter = useMemo(
    () => (i: string | number) => {
      const idx = typeof i === "number" ? i : parseInt(String(i), 10);
      const point = thinned[idx];
      return point ? formatShortDate(point.date) : String(i);
    },
    [thinned],
  );

  const areaFill = useMemo(() => hexWithAlpha(color, 0.18), [color]);

  if (chartData.length === 0) return null;

  return (
    <View style={[styles.root, { height }]}>
      <CartesianChart
        data={chartData as any[]}
        xKey="xIndex"
        yKeys={["value"]}
        domainPadding={CHART_DOMAIN_PADDING}
        padding={CHART_PADDING}
        chartPressState={state as any}
        axisOptions={{
          font,
          labelColor:   CHART_THEME.axisLabel,
          lineColor:    "transparent",
          tickCount:    { x: 5, y: 5 },
          formatXLabel: xFormatter,
          formatYLabel: axisFormatter,
        }}
      >
        {({ points, chartBounds }: { points: any; chartBounds: any }) => (
          <>
            <Area
              points={points.value}
              y0={chartBounds.bottom}
              color={areaFill}
              animate={CHART_ANIMATE}
            />
            <Line
              points={points.value}
              color={color}
              strokeWidth={LINE_STROKE_WIDTH}
              animate={CHART_ANIMATE}
            />
          </>
        )}
      </CartesianChart>

      {showTooltip && isActive && (
        <ChartTooltip
          state={state as any}
          yKey="value"
          formatter={formatter}
          labelFormatter={labelFormatter}
          colorBySign={false}
        />
      )}
    </View>
  );
});

// ── Reports-contract alias ─────────────────────────────────────────────────
// Satisfies the EquityCurveChartProps interface from reports.tsx §Phase 10 contract.

export const EquityCurveChartImpl = memo(function EquityCurveChartImpl({
  data,
  color,
  formatter,
  axisFormatter,
  height,
}: EquityCurveChartProps) {
  return (
    <AreaChartWrapper
      data={data}
      color={color}
      formatter={formatter}
      axisFormatter={axisFormatter}
      height={height}
      showTooltip
    />
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    width:    "100%",
    overflow: "hidden",
  },
});
