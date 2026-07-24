/**
 * LineChartWrapper.tsx — Line chart wrapper for analytics screens.
 *
 * Wraps victory-native's CartesianChart + Line primitive.
 * Supports single and dual-color lines (positive / negative split)
 * to match the equity curve zero-crossing behaviour in NetPnLAnalytics.tsx.
 *
 * Phase 10.6 — Analytics Foundation
 */

import React, { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { CartesianChart, Line, useChartPressState } from "victory-native";

import {
  CHART_ANIMATE,
  CHART_DOMAIN_PADDING,
  CHART_PADDING,
  DEFAULT_CHART_HEIGHT,
  LINE_STROKE_WIDTH,
} from "./chartConfig";
import { makeAxisFont, CHART_THEME, CHART_COLORS } from "./chartTheme";
import { makeCurrencyYFormatter } from "./ChartAxisHelpers";
import { ChartTooltip } from "./ChartTooltip";
import { addXIndex, thinData, formatShortDate } from "./chartUtils";
import type { AreaPoint } from "../../app/(tabs)/reports";

// ── Types ──────────────────────────────────────────────────────────────────

export interface LineChartWrapperProps {
  data:            AreaPoint[];
  /** Line stroke color (default: equity blue) */
  color?:          string;
  /** Formatter for tooltip values */
  formatter?:      (v: number) => string;
  /** Formatter for y-axis tick labels */
  axisFormatter?:  (v: number) => string;
  height?:         number;
  strokeWidth?:    number;
  /** Max data points (large datasets are thinned) */
  maxPoints?:      number;
  showTooltip?:    boolean;
  /** When true, values above zero use `profitColor` and below use `lossColor` */
  splitBySign?:    boolean;
  profitColor?:    string;
  lossColor?:      string;
}

// ── Component ──────────────────────────────────────────────────────────────

export const LineChartWrapper = memo(function LineChartWrapper({
  data,
  color         = CHART_COLORS.equity,
  formatter     = (v: number) => `$${v.toFixed(2)}`,
  axisFormatter = makeCurrencyYFormatter(),
  height        = DEFAULT_CHART_HEIGHT,
  strokeWidth   = LINE_STROKE_WIDTH,
  maxPoints     = 120,
  showTooltip   = true,
  splitBySign   = false,
  profitColor   = CHART_COLORS.profit,
  lossColor     = CHART_COLORS.loss,
}: LineChartWrapperProps) {
  const font = useMemo(() => makeAxisFont(), []);

  const thinned = useMemo(() => thinData(data, maxPoints), [data, maxPoints]);

  const chartData = useMemo(() => addXIndex(thinned), [thinned]);

  const { state, isActive } = useChartPressState({
    x: 0,
    y: { value: 0 },
  });

  const xFormatter = useMemo(
    () => (i: string | number) => {
      const idx   = typeof i === "number" ? i : parseInt(String(i), 10);
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

  // When splitBySign is true, split into positive/negative segments for dual-colour rendering.
  // victory-native renders one Line per yKey; we null out the "wrong" sign on each dataset.
  const splitData = useMemo(() => {
    if (!splitBySign) return null;
    return chartData.map((d) => ({
      ...d,
      valuePos: d.value >= 0 ? d.value : 0,
      valueNeg: d.value <  0 ? d.value : 0,
    }));
  }, [chartData, splitBySign]);

  if (chartData.length === 0) return null;

  // Two render paths with explicit any-casts to satisfy victory-native's strict generics.
  if (splitBySign && splitData) {
    return (
      <View style={[styles.root, { height }]}>
        <CartesianChart
          data={splitData as any[]}
          xKey="xIndex"
          yKeys={["valuePos", "valueNeg"]}
          domainPadding={CHART_DOMAIN_PADDING}
          padding={CHART_PADDING}
          axisOptions={{
            font,
            labelColor:   CHART_THEME.axisLabel,
            lineColor:    "transparent",
            tickCount:    { x: 5, y: 5 },
            formatXLabel: xFormatter,
            formatYLabel: axisFormatter,
          }}
        >
          {({ points }: { points: any }) => (
            <>
              <Line
                points={points.valuePos}
                color={profitColor}
                strokeWidth={strokeWidth}
                animate={CHART_ANIMATE}
              />
              <Line
                points={points.valueNeg}
                color={lossColor}
                strokeWidth={strokeWidth}
                animate={CHART_ANIMATE}
              />
            </>
          )}
        </CartesianChart>
      </View>
    );
  }

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
        {({ points }: { points: any }) => (
          <Line
            points={points.value}
            color={color}
            strokeWidth={strokeWidth}
            animate={CHART_ANIMATE}
          />
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

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    width:    "100%",
    overflow: "hidden",
  },
});
