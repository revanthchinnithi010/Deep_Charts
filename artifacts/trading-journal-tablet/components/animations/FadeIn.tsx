/**
 * components/animations/FadeIn.tsx — React Native (Reanimated)
 *
 * Migration of: artifacts/trading-journal/src/components/animations/FadeIn.tsx
 * Phase 12.3 — Animation Primitive Wrappers (React → React Native)
 *
 * Web → RN replacements:
 *   motion[as] (Motion.dev)        → Animated.View (Reanimated)
 *   whileInView / viewport         → mount-triggered (no IntersectionObserver in RN;
 *                                    `inView` prop preserved for API compatibility)
 *   className / as                 → preserved in interface; unused in RN
 *   style: React.CSSProperties     → style: StyleProp<ViewStyle>
 *   delay in seconds               → delay × 1000 = milliseconds (Reanimated)
 *   SPRING_SMOOTH transition merge → variant config carries spring physics
 *
 * All variant states, easing, durations, and spring physics preserved exactly.
 * Reduced-motion: shared values jump to visible immediately (no animation).
 */
import React, { useEffect } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  type SharedValue,
  type WithSpringConfig,
  type WithTimingConfig,
} from "react-native-reanimated";
import type { StyleProp, ViewStyle } from "react-native";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  fadeVariants,
  slideUpVariants,
  slideDownVariants,
  slideLeftVariants,
  slideRightVariants,
  scaleVariants,
} from "@/animations/motion";
import type { RNVariant } from "@/animations/variants";

/* ─── Types ───────────────────────────────────────────────────────────────── */

export type FadeInVariant =
  | "fade"
  | "slide-up"
  | "slide-down"
  | "slide-left"
  | "slide-right"
  | "scale"
  | "spring";

const VARIANT_MAP: Record<FadeInVariant, RNVariant> = {
  "fade":        fadeVariants,
  "slide-up":    slideUpVariants,
  "slide-down":  slideDownVariants,
  "slide-left":  slideLeftVariants,
  "slide-right": slideRightVariants,
  "scale":       scaleVariants,
  "spring":      slideUpVariants, // alias — spring physics come from the variant
};

interface FadeInProps {
  children: React.ReactNode;
  /** Animation style. Default: "slide-up" */
  variant?: FadeInVariant;
  /**
   * Extra delay before the animation starts, in seconds.
   * Matches the web API (Motion.dev uses seconds for `transition.delay`).
   */
  delay?: number;
  /** Animate only once. Default: true. Preserved; respected on mount in RN. */
  once?: boolean;
  /**
   * Trigger on scroll into view instead of immediately.
   * Web: uses IntersectionObserver. RN: mount-triggered (no scroll intersection).
   * Prop preserved for API compatibility.
   */
  inView?: boolean;
  /** Preserved for API compatibility; unused in RN (no class-name system). */
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** Preserved for API compatibility; always renders Animated.View in RN. */
  as?: string;
}

/* ─── Component ───────────────────────────────────────────────────────────── */

export function FadeIn({
  children,
  variant   = "slide-up",
  delay     = 0,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  once      = true,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  inView    = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  className,
  style,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  as,
}: FadeInProps) {
  const reduced  = useReducedMotion();
  const variants = VARIANT_MAP[variant];
  const { hidden, visible } = variants;

  // Web delay is in seconds; Reanimated uses milliseconds.
  const delayMs = Math.round(delay * 1000);

  // ── Shared values ─────────────────────────────────────────────────────────
  // All hooks called unconditionally. Initialized from the hidden variant state.
  const opacity    = useSharedValue(hidden.opacity    ?? 0);
  const translateY = useSharedValue(hidden.translateY ?? 0);
  const translateX = useSharedValue(hidden.translateX ?? 0);
  const scale      = useSharedValue(hidden.scale      ?? 1);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale:      scale.value      },
    ],
  }));

  // ── Animation trigger ──────────────────────────────────────────────────────
  useEffect(() => {
    const { useSpring: spring, config } = visible;

    function animateSv(sv: SharedValue<number>, to: number): void {
      if (sv.value === to) return;
      if (reduced) {
        // Jump to visible state immediately — no animation.
        sv.value = to;
        return;
      }
      const base = spring
        ? withSpring(to, config as WithSpringConfig)
        : withTiming(to, (config as WithTimingConfig | undefined) ?? { duration: 400 });
      sv.value = delayMs > 0 ? withDelay(delayMs, base) : base;
    }

    if (visible.opacity    !== undefined) animateSv(opacity,    visible.opacity);
    if (visible.translateY !== undefined) animateSv(translateY, visible.translateY);
    if (visible.translateX !== undefined) animateSv(translateX, visible.translateX);
    if (visible.scale      !== undefined) animateSv(scale,      visible.scale);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return (
    <Animated.View style={[animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}
