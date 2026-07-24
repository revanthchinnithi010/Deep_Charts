/**
 * PieChartWrapper.tsx — Donut / Pie chart wrapper for analytics screens.
 *
 * Wraps victory-native's PolarChart + Pie primitive.
 * Implements the WinLossChartProps contract defined in reports.tsx.
 *
 * Phase 10.6 — Analytics Foundation
 */

import React, { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PolarChart, Pie } from "victory-native";

import { DEFAULT_PIE_HEIGHT, DONUT_INNER_RADIUS } from "./chartConfig";
import { CHART_COLORS, CHART_THEME, CHART_FONT_SIZE } from "./chartTheme";
import { ChartLegend } from "./ChartLegend";
import type { WinLossChartProps, PieSlice } from "../../app/(tabs)/reports";

// ── Generic donut chart props ──────────────────────────────────────────────

export interface PieChartWrapperProps {
  data:          PieSlice[];
  /** Inner radius as % string (default "52%") — set to "0%" for solid pie */
  innerRadius?:  string;
  height?:       number;
  /** Show legend below the chart */
  showLegend?:   boolean;
  /** Centre label (shown in the donut hole) */
  centreLabel?:  string;
  centreValue?:  string;
  centreColor?:  string;
}

// ── Component ──────────────────────────────────────────────────────────────

export const PieChartWrapper = memo(function PieChartWrapper({
  data,
  innerRadius  = DONUT_INNER_RADIUS,
  height       = DEFAULT_PIE_HEIGHT,
  showLegend   = true,
  centreLabel,
  centreValue,
  centreColor  = CHART_COLORS.profit,
}: PieChartWrapperProps) {
  const legendItems = useMemo(
    () => data.map((d) => ({ label: `${d.name} (${d.value})`, color: d.color })),
    [data],
  );

  const total = useMemo(
    () => data.reduce((s, d) => s + d.value, 0),
    [data],
  );

  if (data.length === 0 || total === 0) return null;

  // Ensure all slices have a positive value (PolarChart requirement)
  const validData = data.filter((d) => d.value > 0);

  return (
    <View style={styles.root}>
      <View style={[styles.chartWrap, { height }]}>
        <PolarChart
          data={validData as any[]}
          labelKey="name"
          valueKey="value"
          colorKey="color"
        >
          <Pie.Chart innerRadius={innerRadius}>
            {({ slice }) => (
              <>
                <Pie.Slice />
                <Pie.SliceAngularInset
                  angularInset={{
                    angularStrokeWidth: 2,
                    angularStrokeColor: "rgba(0,0,0,0.35)",
                  }}
                />
              </>
            )}
          </Pie.Chart>
        </PolarChart>

        {/* Centre label overlay (donut only) */}
        {(centreLabel || centreValue) && (
          <View style={styles.centreOverlay} pointerEvents="none">
            {centreValue && (
              <Text style={[styles.centreValue, { color: centreColor }]}>
                {centreValue}
              </Text>
            )}
            {centreLabel && (
              <Text style={styles.centreLabel}>{centreLabel}</Text>
            )}
          </View>
        )}
      </View>

      {showLegend && legendItems.length > 0 && (
        <ChartLegend items={legendItems} style={styles.legend} />
      )}
    </View>
  );
});

// ── Reports-contract alias ─────────────────────────────────────────────────

export const WinLossChartImpl = memo(function WinLossChartImpl({
  data,
  innerRadius,
  outerRadius,
  height,
}: WinLossChartProps) {
  // Compute win-rate for centre display
  const total    = data.reduce((s, d) => s + d.value, 0);
  const wins     = data.find((d) => d.name === "Wins")?.value ?? 0;
  const winRate  = total > 0 ? ((wins / total) * 100).toFixed(1) : "—";

  return (
    <PieChartWrapper
      data={data}
      height={height}
      showLegend
      centreValue={`${winRate}%`}
      centreLabel="Win Rate"
      centreColor={CHART_COLORS.profit}
    />
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    width:    "100%",
    alignItems: "center",
    gap:      12,
  },
  chartWrap: {
    width:    "100%",
    position: "relative",
  },
  centreOverlay: {
    position:       "absolute",
    top:            0,
    left:           0,
    right:          0,
    bottom:         0,
    justifyContent: "center",
    alignItems:     "center",
  },
  centreValue: {
    fontSize:   20,
    fontWeight: "700",
    lineHeight: 24,
  },
  centreLabel: {
    fontSize:  11,
    color:     CHART_THEME.tooltipMuted,
    marginTop: 2,
  },
  legend: {
    paddingHorizontal: 8,
    justifyContent:    "center",
  },
});
