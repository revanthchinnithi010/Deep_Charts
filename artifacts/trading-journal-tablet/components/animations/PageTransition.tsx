/**
 * components/animations/PageTransition.tsx — React Native (Reanimated)
 *
 * Migration of: artifacts/trading-journal/src/components/animations/PageTransition.tsx
 * Phase 12.4 — Composite Animation Wrappers (React → React Native)
 *
 * Web → RN replacements:
 *   motion.div (Motion.dev)        → Animated.View (Reanimated)
 *   AnimatePresence initial/exit   → mount-based enter only (Expo Router handles navigation
 *                                    transitions; this component provides the enter animation)
 *   position: absolute; inset: 0   → position:"absolute", top:0, left:0, right:0, bottom:0
 *   willChange: "transform,opacity"→ not needed in RN (Reanimated handles GPU compositing)
 *   className                      → preserved in interface; unused in RN
 *   style: React.CSSProperties     → style: StyleProp<ViewStyle>
 *   custom?: number                → preserved for API compat; accepted but unused (same as web)
 *
 * Variants used (from @/animations/motion — same as web source):
 *   "page"         → pageVariants          (opacity 0.98→1 + translateY 9→0, 220ms)
 *   "tab"          → tabPageVariants       (opacity 0.98→1 crossfade only)
 *   "detail"       → pageDetailVariants    (same as page)
 *   "cover-detail" → pageDetailCoverVariants (opacity 0.96→1, no translate)
 *   "slide"        → pageSlideVariants     (same as page)
 *
 * Each RNPageVariant has { initial, enter, exit }; only initial→enter is applied here.
 * Exit animations are NOT applied — Expo Router unmounts pages on navigation.
 * Do NOT override Expo Router's navigation behavior; use this for in-page reveal only.
 *
 * fill=true (default): position absolute inset:0 — fills the Layout container.
 * fill=false: normal flow — for nested usage inside scrollable containers.
 */
import React, { useEffect } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  type SharedValue,
  type WithSpringConfig,
  type WithTimingConfig,
} from "react-native-reanimated";
import type { StyleProp, ViewStyle } from "react-native";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  pageVariants,
  tabPageVariants,
  pageDetailVariants,
  pageDetailCoverVariants,
  pageSlideVariants,
  type RNPageVariant,
} from "@/animations/motion";

/* ─── Types ───────────────────────────────────────────────────────────────── */

interface PageTransitionProps {
  children:   React.ReactNode;
  /** Preserved for API compat; unused in RN. */
  className?: string;
  style?:     StyleProp<ViewStyle>;
  variant?:   "page" | "detail" | "cover-detail" | "tab" | "slide";
  /** Direction integer forwarded from Expo Router. Accepted but unused (same as web). */
  custom?:    number;
  /**
   * Absolutely-position + stretch to fill the Layout container. Default: true.
   * Set to false for nested usage inside a scrollable container.
   */
  fill?:      boolean;
}

/* ─── Fill style constant (mirrors web BASE_STYLE) ───────────────────────── */

const FILL_STYLE: ViewStyle = {
  position: "absolute",
  top:      0,
  left:     0,
  right:    0,
  bottom:   0,
};

/* ─── Component ───────────────────────────────────────────────────────────── */

export function PageTransition({
  children,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  className: _className,
  style,
  variant = "page",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  custom:    _custom,
  fill    = true,
}: PageTransitionProps) {
  const reduced = useReducedMotion();

  const variants: RNPageVariant =
    variant === "tab"          ? tabPageVariants          :
    variant === "detail"       ? pageDetailVariants       :
    variant === "cover-detail" ? pageDetailCoverVariants  :
    variant === "slide"        ? pageSlideVariants        :
                                 pageVariants;

  const { initial, enter } = variants;

  // ── Shared values — initialised from the `initial` variant state ───────────
  const opacity    = useSharedValue(initial.opacity    ?? 0.98);
  const translateY = useSharedValue(initial.translateY ?? 0);
  const translateX = useSharedValue(initial.translateX ?? 0);
  const scale      = useSharedValue(initial.scale      ?? 1);

  const animStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale:      scale.value      },
    ],
  }));

  // ── Enter animation on mount ───────────────────────────────────────────────
  useEffect(() => {
    const { useSpring: spring, config } = enter;

    function animateSv(sv: SharedValue<number>, to: number): void {
      if (reduced) { sv.value = to; return; }
      sv.value = spring
        ? withSpring(to, config as WithSpringConfig)
        : withTiming(to, (config as WithTimingConfig | undefined) ?? { duration: 220 });
    }

    if (enter.opacity    !== undefined) animateSv(opacity,    enter.opacity);
    if (enter.translateY !== undefined) animateSv(translateY, enter.translateY);
    if (enter.translateX !== undefined) animateSv(translateX, enter.translateX);
    if (enter.scale      !== undefined) animateSv(scale,      enter.scale);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const containerStyle: StyleProp<ViewStyle> = fill
    ? [FILL_STYLE, animStyle, style]
    : [animStyle, style];

  return (
    <Animated.View style={containerStyle}>
      {children}
    </Animated.View>
  );
}
