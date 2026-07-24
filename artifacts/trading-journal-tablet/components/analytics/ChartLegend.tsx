/**
 * ChartLegend.tsx — Shared legend component for analytics charts.
 *
 * Renders a horizontal row of colour-keyed legend items, matching the
 * visual style of the web analytics pages.
 *
 * Phase 10.6 — Analytics Foundation
 */

import React, { memo } from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { CHART_THEME, CHART_FONT_SIZE } from "./chartTheme";

// ── Types ──────────────────────────────────────────────────────────────────

export interface LegendItem {
  label: string;
  color: string;
  /** "circle" (default), "square", or "line" indicator shape */
  shape?: "circle" | "square" | "line";
}

export interface ChartLegendProps {
  items:       LegendItem[];
  /** "row" (default) or "column" layout */
  direction?:  "row" | "column";
  style?:      ViewStyle;
}

// ── Component ──────────────────────────────────────────────────────────────

export const ChartLegend = memo(function ChartLegend({
  items,
  direction = "row",
  style,
}: ChartLegendProps) {
  return (
    <View style={[styles.root, direction === "column" && styles.column, style]}>
      {items.map((item) => (
        <View key={item.label} style={styles.item}>
          <Indicator color={item.color} shape={item.shape ?? "circle"} />
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
});

// ── Indicator shape ────────────────────────────────────────────────────────

const Indicator = memo(function Indicator({
  color,
  shape,
}: {
  color: string;
  shape: "circle" | "square" | "line";
}) {
  if (shape === "line") {
    return <View style={[styles.line, { backgroundColor: color }]} />;
  }
  return (
    <View
      style={[
        styles.dot,
        shape === "square" && styles.square,
        { backgroundColor: color },
      ]}
    />
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flexDirection:  "row",
    flexWrap:       "wrap",
    alignItems:     "center",
    gap:            12,
  },
  column: {
    flexDirection:  "column",
    alignItems:     "flex-start",
    gap:            6,
  },
  item: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           5,
  },
  dot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  square: {
    borderRadius: 2,
  },
  line: {
    width:        14,
    height:       2,
    borderRadius: 1,
  },
  label: {
    fontSize: CHART_FONT_SIZE.legend,
    color:    CHART_THEME.legendText,
  },
});
