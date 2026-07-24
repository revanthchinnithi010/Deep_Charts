/**
 * components/animations/LoadingSpinner.tsx — React Native (Reanimated)
 *
 * Migration of: artifacts/trading-journal/src/components/animations/LoadingSpinner.tsx
 * Phase 12.3 — Animation Primitive Wrappers (React → React Native)
 *
 * Web → RN replacements:
 *   SVG <circle> + stroke-dasharray → View with circular border (border-based arc)
 *   SVG rotate transform            → Animated.View rotate via animateSvgSpinner
 *   HTMLDivElement dots             → Animated.View dots via animateLoadingDots
 *   ref={containerRef} DOM query   → dotsRef array with makeMutable SharedValues
 *   style: React.CSSProperties     → style: StyleProp<ViewStyle>
 *
 * Animation engine: animateSvgSpinner / animateLoadingDots from @/animations/anime.
 * Timing, speed, looping, and stagger all preserved exactly.
 *
 * Visual note:
 *   SVG stroke-dashoffset animation is unsupported in React Native without a
 *   native SVG library. The spinner is rendered as a circular bordered View
 *   (one transparent edge creates the arc appearance), then rotated. This
 *   matches the rotation animation while omitting the dash phase-shift — per
 *   the RN anime.ts comment: "dash animation unsupported in RN".
 *
 * Color note:
 *   Web default color="currentColor" (CSS inheritance) — not supported in RN.
 *   Default changed to "#FFFFFF". Callers should pass their theme color explicitly.
 *
 * Accessibility: accessibilityLabel + accessibilityRole="progressbar" match the
 *   web aria-label + role="status" semantics.
 */
import React, { useEffect, useRef } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  makeMutable,
} from "react-native-reanimated";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  animateSvgSpinner,
  animateLoadingDots,
  type DotTarget,
  type SpinnerTarget,
} from "@/animations/anime";

/* ─── LoadingSpinner ──────────────────────────────────────────────────────── */

interface SpinnerProps {
  /** Ring diameter in px. Default: 40 */
  size?:       number;
  /** Stroke thickness. Default: 3 */
  stroke?:     number;
  /** Stroke colour. Default: "#FFFFFF" (RN has no currentColor CSS inheritance) */
  color?:      string;
  /** Track colour. Default: rgba(255,255,255,0.10) */
  trackColor?: string;
  /** Full rotation duration in ms. Default: 900 */
  duration?:   number;
  /** Preserved for API compatibility; unused in RN. */
  className?:  string;
  style?:      StyleProp<ViewStyle>;
}

export function LoadingSpinner({
  size       = 40,
  stroke     = 3,
  color      = "#FFFFFF",
  trackColor = "rgba(255,255,255,0.10)",
  duration   = 900,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  className,
  style,
}: SpinnerProps) {
  const reduced = useReducedMotion();

  // Shared value driving the rotation (0 → 360, looped).
  const rotate  = useSharedValue(0);
  const target: SpinnerTarget = { rotate };

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  useEffect(() => {
    if (reduced) return;
    const ctrl = animateSvgSpinner(target, { duration });
    return () => { ctrl.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, reduced]);

  const circleBase: ViewStyle = {
    position:     "absolute",
    top:          0,
    left:         0,
    right:        0,
    bottom:       0,
    borderRadius: size / 2,
    borderWidth:  stroke,
  };

  return (
    <View
      style={[{ width: size, height: size }, style]}
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
    >
      {/* Track — full opaque ring */}
      <View style={[circleBase, { borderColor: trackColor }]} />
      {/* Arc — one edge transparent to create partial-arc appearance */}
      <Animated.View
        style={[
          circleBase,
          {
            borderColor:    color,
            borderTopColor: "transparent",
          },
          // Reduced-motion: static arc, no rotation.
          reduced ? undefined : spinnerStyle,
        ]}
      />
    </View>
  );
}

/* ─── DotLoader ───────────────────────────────────────────────────────────── */

interface DotLoaderProps {
  count?:     number;
  size?:      number;
  /** Dot colour. Default: "#FFFFFF" (RN has no currentColor CSS inheritance) */
  color?:     string;
  gap?:       number;
  /** Preserved for API compatibility; unused in RN. */
  className?: string;
  style?:     StyleProp<ViewStyle>;
}

/**
 * Individual animated dot — manages its own useAnimatedStyle.
 * Kept as a named internal component so hooks are called at component level.
 */
function DotView({
  dot,
  size,
  color,
}: {
  dot:   DotTarget;
  size:  number;
  color: string;
}) {
  const animStyle = useAnimatedStyle(() => ({
    opacity:   dot.opacity.value,
    transform: [{ translateY: dot.translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width:           size,
          height:          size,
          borderRadius:    size / 2,
          backgroundColor: color,
          flexShrink:      0,
        },
        animStyle,
      ]}
    />
  );
}

export function DotLoader({
  count     = 3,
  size      = 6,
  color     = "#FFFFFF",
  gap       = 5,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  className,
  style,
}: DotLoaderProps) {
  const reduced = useReducedMotion();

  // Create shared values with makeMutable so the array can vary in length.
  // makeMutable is the non-hook equivalent of useSharedValue — safe in a ref.
  const dotsRef = useRef<DotTarget[]>([]);
  if (dotsRef.current.length !== count) {
    dotsRef.current = Array.from({ length: count }, () => ({
      opacity:    makeMutable(1),
      translateY: makeMutable(0),
    }));
  }

  useEffect(() => {
    if (reduced) return;
    const anim = animateLoadingDots(dotsRef.current, {});
    return () => { anim.pause(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, count]);

  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", gap },
        style,
      ]}
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
    >
      {dotsRef.current.map((dot, i) => (
        <DotView key={i} dot={dot} size={size} color={color} />
      ))}
    </View>
  );
}
