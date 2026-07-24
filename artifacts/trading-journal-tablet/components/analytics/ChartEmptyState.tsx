/**
 * ChartEmptyState.tsx — Loading, empty, and error states for analytics charts.
 *
 * Provides three reusable states consumed by ChartContainer:
 *   - Loading  : animated skeleton shimmer
 *   - Empty    : "no data" message with icon
 *   - Error    : error message with icon
 *
 * Phase 10.6 — Analytics Foundation
 */

import { Ionicons } from "@expo/vector-icons";
import React, { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { CHART_THEME } from "./chartTheme";

// ── Skeleton shimmer ───────────────────────────────────────────────────────

const ShimmerBar = memo(function ShimmerBar({
  opacity,
  height,
  marginBottom = 0,
}: {
  opacity: Animated.AnimatedInterpolation<string | number>;
  height:  number;
  marginBottom?: number;
}) {
  return (
    <Animated.View
      style={[
        styles.shimmerBar,
        { height, marginBottom, opacity },
      ]}
    />
  );
});

// ── ChartLoadingState ──────────────────────────────────────────────────────

export const ChartLoadingState = memo(function ChartLoadingState({
  height = 200,
}: {
  height?: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue:         1,
          duration:        900,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue:         0,
          duration:        900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const opacity = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0.25, 0.55],
  });

  const innerH = height - 16;

  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.skeletonWrap}>
        {/* Bar skeleton — mimics a bar chart silhouette */}
        <View style={styles.barsRow}>
          {[0.55, 0.80, 0.40, 0.90, 0.65, 0.75, 0.50].map((h, i) => (
            <ShimmerBar
              key={i}
              opacity={opacity}
              height={innerH * h}
              marginBottom={0}
            />
          ))}
        </View>
        {/* Baseline */}
        <ShimmerBar opacity={opacity} height={1} />
      </View>
    </View>
  );
});

// ── ChartEmptyState ────────────────────────────────────────────────────────

export const ChartEmptyState = memo(function ChartEmptyState({
  height  = 200,
  message = "No data available",
  icon    = "bar-chart-outline",
}: {
  height?:  number;
  message?: string;
  icon?:    React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <View style={[styles.container, styles.centred, { height }]}>
      <Ionicons
        name={icon}
        size={28}
        color="rgba(148,163,184,0.25)"
        style={styles.emptyIcon}
      />
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
});

// ── ChartErrorState ────────────────────────────────────────────────────────

export const ChartErrorState = memo(function ChartErrorState({
  height  = 200,
  message = "Failed to load chart data",
}: {
  height?:  number;
  message?: string;
}) {
  return (
    <View style={[styles.container, styles.centred, { height }]}>
      <Ionicons
        name="alert-circle-outline"
        size={28}
        color="rgba(221,75,75,0.45)"
        style={styles.emptyIcon}
      />
      <Text style={[styles.emptyText, styles.errorText]}>{message}</Text>
    </View>
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    width:           "100%",
    overflow:        "hidden",
    justifyContent:  "flex-end",
  },
  centred: {
    justifyContent:  "center",
    alignItems:      "center",
  },
  skeletonWrap: {
    flex:           1,
    paddingHorizontal: 4,
    justifyContent: "flex-end",
  },
  barsRow: {
    flexDirection:  "row",
    alignItems:     "flex-end",
    gap:            6,
    flex:           1,
    paddingBottom:  4,
  },
  shimmerBar: {
    flex:            1,
    borderRadius:    4,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  emptyIcon: {
    marginBottom: 8,
  },
  emptyText: {
    fontSize:  12,
    color:     CHART_THEME.tooltipMuted,
    textAlign: "center",
  },
  errorText: {
    color: "rgba(221,75,75,0.6)",
  },
});
