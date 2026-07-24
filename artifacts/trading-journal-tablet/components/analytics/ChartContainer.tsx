/**
 * ChartContainer.tsx — Shared wrapper for all analytics chart components.
 *
 * Provides:
 *   - Consistent padding and background matching the card theme
 *   - Optional title and subtitle
 *   - Loading / error / empty state routing
 *   - Responsive width via onLayout
 *
 * Phase 10.6 — Analytics Foundation
 */

import React, { memo, useState } from "react";
import {
  type LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { ChartEmptyState, ChartErrorState, ChartLoadingState } from "./ChartEmptyState";
import { CHART_THEME } from "./chartTheme";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ChartContainerProps {
  /** Chart height in dp (defaults to the chart's own default if not set). */
  height?:    number;
  /** Optional card title displayed above the chart. */
  title?:     string;
  /** Optional subtitle / caption below the title. */
  subtitle?:  string;
  /** Show the loading shimmer instead of children. */
  isLoading?: boolean;
  /** Show the error state with this message. */
  error?:     string | null;
  /** Show the empty state with this message when data is empty. */
  isEmpty?:   boolean;
  emptyMessage?: string;
  emptyIcon?: React.ComponentProps<typeof ChartEmptyState>["icon"];
  /** Additional container styles. */
  style?:     ViewStyle;
  children?:  React.ReactNode;
}

// ── Component ──────────────────────────────────────────────────────────────

export const ChartContainer = memo(function ChartContainer({
  height,
  title,
  subtitle,
  isLoading    = false,
  error        = null,
  isEmpty      = false,
  emptyMessage,
  emptyIcon,
  style,
  children,
}: ChartContainerProps) {
  const [containerWidth, setContainerWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    if (width > 0) setContainerWidth(width);
  };

  const renderContent = () => {
    if (isLoading) return <ChartLoadingState height={height} />;
    if (error)     return <ChartErrorState   height={height} message={error} />;
    if (isEmpty)   return (
      <ChartEmptyState
        height={height}
        message={emptyMessage}
        icon={emptyIcon}
      />
    );
    return children;
  };

  return (
    <View style={[styles.root, style]} onLayout={onLayout}>
      {(title || subtitle) && (
        <View style={styles.header}>
          {title    && <Text style={styles.title}>{title}</Text>}
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      )}
      <View style={styles.body}>
        {renderContent()}
      </View>
    </View>
  );
});

// Re-export containerWidth so consumers can read it if needed
export { ChartContainer as default };

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    width: "100%",
  },
  header: {
    marginBottom: 8,
    gap:          3,
  },
  title: {
    fontSize:   13,
    fontWeight: "600",
    color:      "#EDF0F6",
    letterSpacing: 0.1,
  },
  subtitle: {
    fontSize:   11,
    color:      CHART_THEME.tooltipMuted,
    lineHeight: 15,
  },
  body: {
    width:    "100%",
    overflow: "hidden",
  },
});
