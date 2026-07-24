/**
 * BarChartWrapper.tsx — Vertical and horizontal bar chart wrappers.
 *
 * Wraps victory-native's CartesianChart + Bar primitive.
 * Implements the WeeklyPnlChartProps, BrokerPnlChartProps, and
 * RRHistogramChartProps contracts defined in reports.tsx.
 *
 * Note on horizontal bars: victory-native does not natively support horizontal
 * bar charts. SymbolPnlChart (horizontal) is implemented as a custom View-based
 * renderer in HorizontalBarChart below, which renders ranked symbol PnL rows.
 *
 * Phase 10.6 — Analytics Foundation
 */

import React, { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { CartesianChart, useChartPressState } from "victory-native";
import { RoundedRect } from "@shopify/react-native-skia";

import {
  CHART_ANIMATE,
  CHART_DOMAIN_PADDING,
  CHART_PADDING,
  DEFAULT_CHART_HEIGHT,
  DEFAULT_HBAR_HEIGHT,
} from "./chartConfig";
import { makeAxisFont, CHART_THEME, CHART_COLORS } from "./chartTheme";
import {
  makeCurrencyYFormatter,
} from "./ChartAxisHelpers";
import { ChartTooltip } from "./ChartTooltip";
import { addXIndex } from "./chartUtils";
import type {
  WeeklyPnlChartProps,
  BrokerPnlChartProps,
  RRHistogramChartProps,
  SymbolPnlChartProps,
  BarPoint,
  HBarPoint,
} from "../../app/(tabs)/reports";

// ── Generic vertical bar chart ─────────────────────────────────────────────

export interface BarChartWrapperProps {
  data:            BarPoint[];
  formatter?:      (v: number) => string;
  axisFormatter?:  (v: number) => string;
  /** Zero-line reference value (default 0) */
  referenceY?:     number;
  height?:         number;
  showTooltip?:    boolean;
  /** Max x-label length before truncation */
  xLabelMaxLen?:   number;
}

export const BarChartWrapper = memo(function BarChartWrapper({
  data,
  formatter     = (v: number) => `$${v.toFixed(2)}`,
  axisFormatter = makeCurrencyYFormatter(),
  referenceY    = 0,
  height        = DEFAULT_CHART_HEIGHT,
  showTooltip   = true,
  xLabelMaxLen  = 5,
}: BarChartWrapperProps) {
  const font = useMemo(() => makeAxisFont(), []);

  const chartData = useMemo(() => addXIndex(data), [data]);

  const { state, isActive } = useChartPressState({
    x: 0,
    y: { value: 0 },
  });

  const xFormatter = useMemo(
    () => (i: string | number) => {
      const idx   = typeof i === "number" ? i : parseInt(String(i), 10);
      const point = data[idx];
      if (!point) return "";
      const label = point.label;
      return label.length > xLabelMaxLen
        ? label.slice(0, xLabelMaxLen - 1) + "…"
        : label;
    },
    [data, xLabelMaxLen],
  );

  const labelFormatter = useMemo(
    () => (i: string | number) => {
      const idx = typeof i === "number" ? i : parseInt(String(i), 10);
      return data[idx]?.label ?? String(i);
    },
    [data],
  );

  if (chartData.length === 0) return null;

  return (
    <View style={[styles.root, { height }]}>
      <CartesianChart
        data={chartData as any[]}
        xKey="xIndex"
        yKeys={["value"]}
        domainPadding={{ ...CHART_DOMAIN_PADDING, left: 20, right: 20 }}
        padding={CHART_PADDING}
        chartPressState={state as any}
        axisOptions={{
          font,
          labelColor:   CHART_THEME.axisLabel,
          lineColor:    "transparent",
          tickCount:    { x: Math.min(data.length, 7), y: 5 },
          formatXLabel: xFormatter,
          formatYLabel: axisFormatter,
        }}
      >
        {({ points, chartBounds }: { points: any; chartBounds: any }) => {
          const bars = points.value as Array<{ x: number; y: number | null }>;
          const n    = bars.length;
          const chartW = (chartBounds.right as number) - (chartBounds.left as number);
          const barW   = n > 0 ? Math.max(2, (chartW / n) * 0.65) : 8;
          return (
            <>
              {bars.map((pt, i) => {
                if (pt.y == null) return null;
                const color  = data[i]?.color ?? CHART_COLORS.muted;
                const bottom = chartBounds.bottom as number;
                const top    = Math.min(pt.y, bottom);
                const h      = Math.max(1, Math.abs(bottom - pt.y));
                return (
                  <RoundedRect
                    key={i}
                    x={pt.x - barW / 2}
                    y={top}
                    width={barW}
                    height={h}
                    r={3}
                    color={color}
                  />
                );
              })}
            </>
          );
        }}
      </CartesianChart>

      {showTooltip && isActive && (
        <ChartTooltip
          state={state as any}
          yKey="value"
          formatter={formatter}
          labelFormatter={labelFormatter}
          colorBySign
        />
      )}
    </View>
  );
});

// ── Horizontal bar chart (pure-View implementation) ────────────────────────
// victory-native does not support horizontal bars, so this uses native Views.

export interface HorizontalBarChartProps {
  data:           HBarPoint[];
  formatter?:     (v: number) => string;
  axisFormatter?: (v: number) => string;
  referenceX?:    number;
  height?:        number;
  /** Maximum bar rows shown (rest are truncated) */
  maxRows?:       number;
}

export const HorizontalBarChart = memo(function HorizontalBarChart({
  data,
  formatter  = (v: number) => `$${v.toFixed(2)}`,
  height     = DEFAULT_HBAR_HEIGHT,
  maxRows    = 8,
}: HorizontalBarChartProps) {
  const visible = useMemo(() => data.slice(0, maxRows), [data, maxRows]);

  const maxAbs = useMemo(
    () => Math.max(1, ...visible.map((d) => Math.abs(d.value))),
    [visible],
  );

  return (
    <View style={[styles.hBarRoot, { minHeight: height }]}>
      {visible.map((item, i) => {
        const pct    = Math.abs(item.value) / maxAbs;
        const isPos  = item.value >= 0;
        return (
          <View key={`${item.label}-${i}`} style={styles.hBarRow}>
            {/* Label */}
            <Text style={styles.hBarLabel} numberOfLines={1}>
              {item.label}
            </Text>
            {/* Bar track */}
            <View style={styles.hBarTrack}>
              <View
                style={[
                  styles.hBarFill,
                  {
                    width:           `${pct * 100}%` as any,
                    backgroundColor: item.color,
                    alignSelf:       isPos ? "flex-start" : "flex-end",
                  },
                ]}
              />
            </View>
            {/* Value */}
            <Text style={[styles.hBarValue, { color: item.color }]}>
              {formatter(item.value)}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

// ── Reports-contract aliases ───────────────────────────────────────────────

export const WeeklyPnlChartImpl = memo(function WeeklyPnlChartImpl({
  data, formatter, axisFormatter, referenceY, height,
}: WeeklyPnlChartProps) {
  return (
    <BarChartWrapper
      data={data}
      formatter={formatter}
      axisFormatter={axisFormatter}
      referenceY={referenceY}
      height={height}
    />
  );
});

export const BrokerPnlChartImpl = memo(function BrokerPnlChartImpl({
  data, formatter, axisFormatter, height,
}: BrokerPnlChartProps) {
  return (
    <BarChartWrapper
      data={data}
      formatter={formatter}
      axisFormatter={axisFormatter}
      height={height}
    />
  );
});

export const RRHistogramChartImpl = memo(function RRHistogramChartImpl({
  data, height,
}: RRHistogramChartProps) {
  return (
    <BarChartWrapper
      data={data}
      height={height}
      showTooltip={false}
      xLabelMaxLen={6}
    />
  );
});

export const SymbolPnlChartImpl = memo(function SymbolPnlChartImpl({
  data, formatter, axisFormatter, referenceX, height,
}: SymbolPnlChartProps) {
  return (
    <HorizontalBarChart
      data={data}
      formatter={formatter}
      axisFormatter={axisFormatter}
      referenceX={referenceX}
      height={height}
    />
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    width:    "100%",
    overflow: "hidden",
  },
  // Horizontal bar styles
  hBarRoot: {
    width:    "100%",
    gap:      10,
    paddingVertical: 4,
  },
  hBarRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  hBarLabel: {
    width:    60,
    fontSize: 11,
    color:    CHART_THEME.axisLabel,
    textAlign: "right",
  },
  hBarTrack: {
    flex:            1,
    height:          10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius:    5,
    overflow:        "hidden",
    flexDirection:   "row",
  },
  hBarFill: {
    height:       10,
    borderRadius: 5,
    minWidth:     3,
  },
  hBarValue: {
    width:      68,
    fontSize:   11,
    fontWeight: "600",
    textAlign:  "right",
  },
});
