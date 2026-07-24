/**
 * components/animations/AnimatedCard.tsx — React Native (Reanimated)
 *
 * Migration of: artifacts/trading-journal/src/components/animations/AnimatedCard.tsx
 * Phase 12.3 — Animation Primitive Wrappers (React → React Native)
 *
 * Web → RN replacements:
 *   motion.div (Motion.dev)        → Animated.View (Reanimated) + Pressable
 *   custom={index} stagger         → withDelay(index × 55 ms, ...)
 *   whileTap: { scale:0.97 }       → onPressIn → withTiming(0.97, TAP_TRANSITION)
 *   whileHover: { y:-3, scale:1.015 } → press-release spring (no y-lift; no hover in RN)
 *   whileInView / viewport         → mount-triggered (inView preserved for API compat)
 *   willChange CSS hint            → not needed in RN (Reanimated handles GPU compositing)
 *   style: React.CSSProperties     → style: StyleProp<ViewStyle>
 *   onClick                        → onPress (Pressable); prop name preserved in interface
 *
 * All entrance animation timing, easing, and spring physics preserved exactly.
 * Press animation: TAP_TRANSITION (90 ms easeOut) in, SPRING_FAST on release.
 * Reduced-motion: renders children with no animation.
 */
import React, { useEffect } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  type SharedValue,
  type WithSpringConfig,
} from "react-native-reanimated";
import { Pressable } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cardVariants, TAP_TRANSITION, SPRING_FAST } from "@/animations/motion";

/* ─── Types ───────────────────────────────────────────────────────────────── */

interface AnimatedCardProps {
  children:   React.ReactNode;
  /** Stagger index — each +1 adds ~55 ms entrance delay. Default: 0 */
  index?:     number;
  /**
   * Trigger entrance on scroll into view.
   * Web: uses IntersectionObserver. RN: mount-triggered (inView preserved for API compat).
   */
  inView?:    boolean;
  /** Only animate once. Default: true. Preserved for API compatibility. */
  once?:      boolean;
  /** Preserved for API compatibility; unused in RN. */
  className?: string;
  style?:     StyleProp<ViewStyle>;
  /**
   * Press handler — web API name `onClick` preserved.
   * Mapped to Pressable `onPress` in RN.
   */
  onClick?:   () => void;
  /** Enable interactive press / hover scale animation. */
  hoverable?: boolean;
}

/* ─── Component ───────────────────────────────────────────────────────────── */

export function AnimatedCard({
  children,
  index     = 0,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  inView    = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  once      = true,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  className,
  style,
  onClick,
  hoverable = false,
}: AnimatedCardProps) {
  const reduced = useReducedMotion();

  // ── Shared values ─────────────────────────────────────────────────────────
  const opacity    = useSharedValue(cardVariants.hidden.opacity    ?? 0);
  const translateY = useSharedValue(cardVariants.hidden.translateY ?? 20);
  const scale      = useSharedValue(cardVariants.hidden.scale      ?? 0.96);
  // Separate shared value for press feedback — multiplied into the entrance scale.
  const pressScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale:      scale.value * pressScale.value },
    ],
  }));

  // ── Entrance animation ─────────────────────────────────────────────────────
  useEffect(() => {
    const { visible } = cardVariants;
    const config      = visible.config as WithSpringConfig;
    const entryDelay  = index * 55; // 55 ms per card stagger — matches web

    function enterSv(sv: SharedValue<number>, to: number): void {
      if (reduced) { sv.value = to; return; }
      const anim = withSpring(to, config);
      sv.value = entryDelay > 0 ? withDelay(entryDelay, anim) : anim;
    }

    if (visible.opacity    !== undefined) enterSv(opacity,    visible.opacity);
    if (visible.translateY !== undefined) enterSv(translateY, visible.translateY);
    if (visible.scale      !== undefined) enterSv(scale,      visible.scale);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  // ── Press handlers ─────────────────────────────────────────────────────────
  // Only active when `hoverable` is true (mirrors web: whileTap only when hoverable).
  const handlePressIn = hoverable
    ? () => { pressScale.value = withTiming(0.97, TAP_TRANSITION); }
    : undefined;

  const handlePressOut = hoverable
    ? () => { pressScale.value = withSpring(1, SPRING_FAST); }
    : undefined;

  return (
    <Pressable
      onPress={onClick}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{ flexShrink: 1 }}
      accessibilityRole={onClick ? "button" : "none"}
    >
      <Animated.View style={[animatedStyle, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
