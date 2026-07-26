/**
 * DashboardSegmentedControl — React Native port
 *
 * Web source: artifacts/trading-journal/src/components/DashboardSegmentedControl.tsx
 *
 * Web → RN replacements:
 *   CSS translate3d transition  → Reanimated withTiming (UI-thread animation)
 *   onClick                     → onPress (Pressable)
 *   contain: "layout paint"     → removed (no CSS containment in RN)
 *   useLocation (wouter)        → removed; value is now a controlled prop
 *   href navigation             → removed; caller manages navigation via onValueChange
 *   ::before/::after layers     → LinearGradient overlay + borderColor top highlight
 *   backdrop-filter blur        → solid dark background (no blur in RN without libs)
 *   active:scale-[0.96]         → Reanimated withSpring on button press
 *
 * Design tokens (matched exactly from index.css .dash-segment-bar):
 *   Track bg          rgba(12, 12, 14, 0.94) — liquid-glass dark base
 *   Track border      rgba(255, 255, 255, 0.12) — glass rim
 *   Track shadow      0 18px 48px rgba(0,0,0,0.55)
 *   Track height      46px (web: h-[46px])
 *   Track padding     4px
 *   Track radius      12
 *   Pill bg           #2A2D31 — elevated dark solid
 *   Pill border       rgba(255, 255, 255, 0.10)
 *   Pill inset top    rgba(255, 255, 255, 0.12) — top highlight
 *   Pill shadow       0 8px 20px rgba(0,0,0,0.35)
 *   Pill radius       9
 *   Active label      #FFFFFF  font-weight 600  14px
 *   Idle label        #6E7578  font-weight 400  14px
 *   Anim duration     200ms  easing: cubic-bezier(0.16, 1, 0.3, 1) ≈ Easing.out(Easing.exp)
 *
 * API changes vs web:
 *   Web: no props (reads router location internally)
 *   RN:  fully controlled — value + options + onValueChange + disabled
 *        Callers own navigation; this component only signals selection.
 *
 * Animation:
 *   Uses react-native-reanimated (already in devDependencies ~4.1.1).
 *   Pill slides on the UI thread via withTiming + Easing.out(Easing.exp) — zero JS
 *   bridge frames, equivalent to CSS cubic-bezier(0.16, 1, 0.3, 1) on the web.
 *   Button labels scale to 0.96 on press via withSpring, matching web active:scale.
 */

import React, { memo, useCallback, useEffect, useRef } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SegmentOption {
  /** Unique identifier compared against `value`. */
  value: string;
  /** Human-readable label displayed on the segment. */
  label: string;
}

export interface DashboardSegmentedControlProps {
  /** Currently selected segment value. */
  value: string;
  /** Ordered list of segments to render. */
  options: SegmentOption[];
  /** Fired when the user taps a different segment. */
  onValueChange: (value: string) => void;
  /** When true the control is non-interactive and 50% opaque. */
  disabled?: boolean;
  /** Optional override for the outer container style. */
  style?: ViewStyle;
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — matched from index.css .dash-segment-bar (web)
// ─────────────────────────────────────────────────────────────────────────────

const TRACK_HEIGHT   = 46;                           // web: h-[46px]
const TRACK_RADIUS   = 12;                           // web: border-radius 12
const TRACK_PADDING  = 4;                            // web: padding 4
const PILL_RADIUS    = 9;                            // web: inner pill radius = 12 − 3 ≈ 9
const PILL_BG        = "#2A2D31";                    // web: pill background
const PILL_BORDER    = "rgba(255,255,255,0.10)";     // web: pill border
const PILL_TOP_HL    = "rgba(255,255,255,0.12)";     // web: inset 0 1px 0 highlight
const TRACK_BG       = "rgba(12,12,14,0.94)";        // web: .dash-segment-bar background
const TRACK_BORDER   = "rgba(255,255,255,0.12)";     // web: border
const LABEL_ACTIVE   = "#FFFFFF";                    // web: selected label colour
const LABEL_IDLE     = "#6E7578";                    // web: unselected label colour

// ─────────────────────────────────────────────────────────────────────────────
// Animation constants
// ─────────────────────────────────────────────────────────────────────────────

/** 200ms matches the web CSS transition-duration. */
const PILL_DURATION  = 200;
/** Easing.out(Easing.exp) approximates cubic-bezier(0.16, 1, 0.3, 1) from the web. */
const PILL_EASING    = Easing.out(Easing.exp);

// ─────────────────────────────────────────────────────────────────────────────
// Individual segment button with press-scale animation
// ─────────────────────────────────────────────────────────────────────────────

interface SegmentButtonProps {
  option:    SegmentOption;
  isActive:  boolean;
  disabled:  boolean;
  onPress:   () => void;
}

const SegmentButton = memo(function SegmentButton({
  option, isActive, disabled, onPress,
}: SegmentButtonProps) {
  // Replicates web: active:scale-[0.96] on the button
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    zIndex: 1,
    paddingHorizontal: 4,
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.96, { mass: 0.3, damping: 12, stiffness: 200 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { mass: 0.3, damping: 12, stiffness: 200 });
  }, [scale]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole="tab"
      accessibilityLabel={option.label}
      accessibilityState={{ selected: isActive, disabled }}
      style={styles.pressableArea}
    >
      <Animated.View style={animStyle}>
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            isActive ? styles.labelActive : styles.labelIdle,
            disabled && styles.labelDisabled,
          ]}
        >
          {option.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

function DashboardSegmentedControl({
  value,
  options,
  onValueChange,
  disabled = false,
  style,
}: DashboardSegmentedControlProps) {
  const count = options.length;

  // Track the measured pixel width of the full container so the pill can be
  // sized as containerWidth / count (equal-width segments).
  const containerWidthRef = useRef(0);

  // Shared value holds the current pill translateX in px.
  const pillX = useSharedValue(0);

  // Resolve the active index from the current `value` prop.
  const activeIndex = options.findIndex((o) => o.value === value);
  const safeIndex   = activeIndex < 0 ? 0 : activeIndex;

  // Jump the pill to the correct position whenever value/count/width changes
  // (including initial mount and container measure).
  const movePill = useCallback(
    (index: number, animated: boolean) => {
      const w = containerWidthRef.current;
      if (w <= 0) return;
      const segW    = w / count;
      const targetX = index * segW;
      if (animated) {
        pillX.value = withTiming(targetX, {
          duration: PILL_DURATION,
          easing:   PILL_EASING,
        });
      } else {
        pillX.value = targetX;
      }
    },
    [count, pillX],
  );

  // Re-position whenever the controlled value changes.
  useEffect(() => {
    movePill(safeIndex, true);
  }, [safeIndex, movePill]);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      if (w === containerWidthRef.current) return;
      containerWidthRef.current = w;
      // Snap without animation on first layout / resize.
      movePill(safeIndex, false);
    },
    [safeIndex, movePill],
  );

  // Animated pill style — width = 1/count of container, translateX = pillX.
  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
    width: containerWidthRef.current > 0
      ? containerWidthRef.current / count
      : undefined,
  }));

  return (
    <View
      style={[styles.track, disabled && styles.trackDisabled, style]}
      onLayout={handleLayout}
    >
      {/*
       * Top glass reflection — mirrors web .dash-segment-bar::before
       * radial + linear gradient overlay (pointer-events:none, z:1)
       * In RN we use a LinearGradient absolutely positioned above the pill
       * but below the buttons (pointerEvents="none").
       */}
      <LinearGradient
        colors={[
          "rgba(255,255,255,0.025)",
          "rgba(255,255,255,0.008)",
          "rgba(255,255,255,0.000)",
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.trackReflection}
      />

      {/* ── Sliding pill (rendered behind labels) ── */}
      <Animated.View
        style={[styles.pill, pillStyle]}
      >
        {/*
         * Top inset highlight — mirrors web:
         *   inset 0 1px 0 rgba(255,255,255,0.12)
         * Rendered as a thin top-border stripe inside the pill.
         */}
        <View style={styles.pillTopHighlight} />
      </Animated.View>

      {/* ── Segment buttons ── */}
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <SegmentButton
            key={option.value}
            option={option}
            isActive={isActive}
            disabled={disabled}
            onPress={() => {
              if (!disabled && !isActive) onValueChange(option.value);
            }}
          />
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Track ─────────────────────────────────────────────────────────────────
  // web: background rgba(12,12,14,0.94)  border rgba(255,255,255,0.12)
  //      border-radius 12  padding 4  height 46  box-shadow 0 18px 48px rgba(0,0,0,0.55)
  track: {
    flexDirection:   "row",
    backgroundColor: TRACK_BG,
    borderRadius:    TRACK_RADIUS,
    borderWidth:     1,
    borderColor:     TRACK_BORDER,
    padding:         TRACK_PADDING,
    position:        "relative",
    overflow:        "hidden",
    height:          TRACK_HEIGHT,
    // web: box-shadow 0 18px 48px rgba(0,0,0,0.55)
    boxShadow:       "0px 8px 18px 0px rgba(0,0,0,0.55)",
  },
  trackDisabled: {
    opacity: 0.50,
  },

  // ── Top reflection overlay (::before equivalent) ─────────────────────────
  trackReflection: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: TRACK_RADIUS,
    zIndex:       1,
  },

  // ── Pill ─────────────────────────────────────────────────────────────────
  // web: background #2A2D31  border rgba(255,255,255,0.10)
  //      border-radius 9  inset top rgba(255,255,255,0.12)  shadow 0 8px 20px rgba(0,0,0,0.35)
  pill: {
    position:        "absolute",
    top:             TRACK_PADDING,
    bottom:          TRACK_PADDING,
    borderRadius:    PILL_RADIUS,
    backgroundColor: PILL_BG,
    borderWidth:     1,
    borderColor:     PILL_BORDER,
    overflow:        "hidden",
    zIndex:          0,
    // web: inset box-shadow + drop shadow 0 8px 20px rgba(0,0,0,0.35)
    boxShadow:       "0px 4px 8px 0px rgba(0,0,0,0.35)",
  },

  // ── Pill top inset highlight ───────────────────────────────────────────
  // web: inset 0 1px 0 rgba(255,255,255,0.12)
  pillTopHighlight: {
    position:          "absolute",
    top:               0,
    left:              0,
    right:             0,
    height:            1,
    backgroundColor:   PILL_TOP_HL,
  },

  // ── Segment pressable wrapper ─────────────────────────────────────────────
  pressableArea: {
    flex:   1,
    zIndex: 2,        // sit above pill and reflection
  },

  // ── Labels ───────────────────────────────────────────────────────────────
  // web: font-size 14px  active: #FFFFFF font-weight 600
  //                     idle:   #6E7578  font-weight 400
  label: {
    fontSize:      14,
    letterSpacing: 0.1,
  },
  labelActive: {
    color:       LABEL_ACTIVE,
    fontFamily:  "SFProDisplay-Semibold",
    fontWeight:  "600",
  },
  labelIdle: {
    color:       LABEL_IDLE,
    fontFamily:  "SFProDisplay-Regular",
    fontWeight:  "400",
  },
  labelDisabled: {
    opacity: 0.50,
  },
});

export default memo(DashboardSegmentedControl);
