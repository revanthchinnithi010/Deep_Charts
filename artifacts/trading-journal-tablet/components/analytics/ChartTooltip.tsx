/**
 * ChartTooltip.tsx — Animated tooltip overlay for analytics charts.
 *
 * Designed to be placed inside the chart's container View (position:relative)
 * as a sibling to the CartesianChart. Uses Reanimated shared values from
 * victory-native's useChartPressState to position itself at the active point.
 *
 * Usage:
 *   const { state, isActive } = useChartPressState({ x: "", y: { value: 0 } });
 *   ...
 *   {isActive && (
 *     <ChartTooltip
 *       state={state}
 *       yKey="value"
 *       formatter={fc}
 *       labelFormatter={formatShortDate}
 *     />
 *   )}
 *
 * Phase 10.6 — Analytics Foundation
 */

import React, { memo, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

import { CHART_THEME, CHART_FONT_SIZE } from "./chartTheme";
import { pnlColor } from "./chartUtils";

// ── Types ──────────────────────────────────────────────────────────────────

export interface TooltipState {
  x: {
    value:    SharedValue<string | number>;
    position: SharedValue<number>;
  };
  y: Record<string, {
    value:    SharedValue<number>;
    position: SharedValue<number>;
  }>;
}

export interface ChartTooltipProps {
  /** Press state from useChartPressState */
  state:          TooltipState;
  /** The yKey whose position and value to track */
  yKey:           string;
  /** Formats the numeric value for display */
  formatter:      (v: number) => string;
  /** Formats the x-axis label for display */
  labelFormatter?: (v: string | number) => string;
  /** Whether to colour the value text based on positive/negative */
  colorBySign?:   boolean;
  /** Tooltip width in dp (default 90) */
  width?:         number;
}

// ── Component ──────────────────────────────────────────────────────────────

export const ChartTooltip = memo(function ChartTooltip({
  state,
  yKey,
  formatter,
  labelFormatter,
  colorBySign = true,
  width       = 90,
}: ChartTooltipProps) {
  const [label, setLabel]   = useState<string>("");
  const [value, setValue]   = useState<number>(0);

  const yEntry = state.y[yKey];

  // Sync shared values to React state for text rendering
  useAnimatedReaction(
    () => ({
      x: state.x.value.value,
      y: yEntry?.value.value ?? 0,
    }),
    (curr) => {
      runOnJS(setLabel)(
        labelFormatter ? labelFormatter(curr.x) : String(curr.x),
      );
      runOnJS(setValue)(curr.y);
    },
  );

  // Position the tooltip at the active data point
  const animStyle = useAnimatedStyle(() => {
    const xPos = state.x.position.value;
    const yPos = yEntry?.position.value ?? 0;
    return {
      transform: [
        // Shift left so the tooltip centres over the point
        { translateX: xPos - width / 2 },
        // Shift up so it sits above the point
        { translateY: yPos - 56 },
      ],
    };
  });

  const valueColor = colorBySign
    ? pnlColor(value)
    : CHART_THEME.tooltipText;

  return (
    <Animated.View
      style={[styles.tooltip, animStyle, { width }]}
      pointerEvents="none"
    >
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }]}>
        {value >= 0 && colorBySign ? "+" : ""}
        {formatter(value)}
      </Text>
    </Animated.View>
  );
});

// ── Multi-value tooltip (for charts with multiple y series) ────────────────

export interface MultiTooltipEntry {
  yKey:      string;
  label:     string;
  color:     string;
  formatter: (v: number) => string;
}

export interface ChartMultiTooltipProps {
  state:          TooltipState;
  entries:        MultiTooltipEntry[];
  labelFormatter?: (v: string | number) => string;
  width?:         number;
}

export const ChartMultiTooltip = memo(function ChartMultiTooltip({
  state,
  entries,
  labelFormatter,
  width = 120,
}: ChartMultiTooltipProps) {
  const [xLabel, setXLabel]   = useState<string>("");
  const [values, setValues]   = useState<Record<string, number>>({});

  useAnimatedReaction(
    () => {
      const yVals: Record<string, number> = {};
      for (const e of entries) {
        yVals[e.yKey] = state.y[e.yKey]?.value.value ?? 0;
      }
      return { x: state.x.value.value, y: yVals };
    },
    (curr) => {
      runOnJS(setXLabel)(
        labelFormatter ? labelFormatter(curr.x) : String(curr.x),
      );
      runOnJS(setValues)(curr.y);
    },
  );

  const animStyle = useAnimatedStyle(() => {
    const xPos = state.x.position.value;
    const firstY = entries[0] ? (state.y[entries[0].yKey]?.position.value ?? 0) : 0;
    return {
      transform: [
        { translateX: xPos - width / 2 },
        { translateY: firstY - 72 },
      ],
    };
  });

  return (
    <Animated.View
      style={[styles.tooltip, animStyle, { width }]}
      pointerEvents="none"
    >
      <Text style={styles.label} numberOfLines={1}>{xLabel}</Text>
      {entries.map((e) => (
        <View key={e.yKey} style={styles.multiRow}>
          <View style={[styles.dot, { backgroundColor: e.color }]} />
          <Text style={[styles.multiValue, { color: e.color }]}>
            {e.formatter(values[e.yKey] ?? 0)}
          </Text>
          <Text style={styles.multiLabel} numberOfLines={1}>{e.label}</Text>
        </View>
      ))}
    </Animated.View>
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tooltip: {
    position:        "absolute",
    top:             0,
    left:            0,
    backgroundColor: CHART_THEME.tooltipBg,
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     CHART_THEME.tooltipBorder,
    paddingHorizontal: 10,
    paddingVertical:   7,
    gap:               2,
    // Shadow
    shadowColor:     "#000",
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.45,
    shadowRadius:    8,
    elevation:       8,
  },
  label: {
    fontSize:  CHART_FONT_SIZE.tooltip - 2,
    color:     CHART_THEME.tooltipMuted,
    marginBottom: 1,
  },
  value: {
    fontSize:   CHART_FONT_SIZE.tooltip,
    fontWeight: "700",
    color:      CHART_THEME.tooltipText,
  },
  multiRow: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            5,
    marginTop:      2,
  },
  dot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  multiValue: {
    fontSize:   CHART_FONT_SIZE.tooltip - 1,
    fontWeight: "600",
  },
  multiLabel: {
    fontSize:  CHART_FONT_SIZE.tooltip - 2,
    color:     CHART_THEME.tooltipMuted,
    flex:      1,
  },
});
