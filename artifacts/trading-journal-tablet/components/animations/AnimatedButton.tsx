/**
 * components/animations/AnimatedButton.tsx — React Native (Reanimated)
 *
 * Migration of: artifacts/trading-journal/src/components/animations/AnimatedButton.tsx
 * Phase 12.4 — Composite Animation Wrappers (React → React Native)
 *
 * Web → RN replacements:
 *   motion.button (Motion.dev)      → Pressable + Animated.View (Reanimated)
 *   whileTap: { scale }             → onPressIn withTiming(tapScale, TAP_TRANSITION)
 *   whileHover: { scale, y }        → no hover in RN; props preserved for API compat
 *   React.ButtonHTMLAttributes      → PressableProps (with onClick alias for web compat)
 *   willChange: "transform"         → not needed in RN (Reanimated handles compositing)
 *   SafeButtonProps (Omit<button>)  → Omit<PressableProps, "style"> + precise RN types
 *   style: React.CSSProperties      → style: StyleProp<ViewStyle>
 *   onClick                         → preserved as alias; mapped to onPress
 *   className                       → preserved in interface; unused in RN
 *
 * Caller-supplied onPressIn / onPressOut are composed with the animation handlers.
 * All animation timing (TAP_TRANSITION: 90ms easeOut, SPRING_FAST release) preserved.
 * Reduced-motion / noMotion / disabled → renders Pressable with no scale animation.
 */
import React, { useCallback } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import {
  Pressable,
  type PressableProps,
  type GestureResponderEvent,
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { SPRING_FAST, TAP_TRANSITION } from "@/animations/motion";

/* ─── AnimatedButton ──────────────────────────────────────────────────────── */

interface AnimatedButtonProps extends Omit<PressableProps, "style" | "children"> {
  children?: React.ReactNode;
  /** Scale target on press. Default: 0.97 */
  tapScale?:   number;
  /** Scale on hover. Default: 1.04. Preserved for API compat; unused in RN (no hover). */
  hoverScale?: number;
  /** Y-lift on hover (px). Preserved for API compat; unused in RN (no hover). */
  hoverLift?:  number;
  /** Disable all motion. Default: false */
  noMotion?:   boolean;
  /** Cosmetic variant hint — consumers apply their own styles. */
  variant?:    "default" | "outline" | "ghost" | "destructive" | "secondary";
  /** Cosmetic size hint — consumers apply their own styles. */
  size?:       "default" | "sm" | "lg" | "icon";
  /** Preserved for API compat; unused in RN (no class-name system). */
  className?:  string;
  style?:      StyleProp<ViewStyle>;
  /** Web API compat — alias for onPress. Resolved after onPress if both provided. */
  onClick?:    () => void;
}

export function AnimatedButton({
  children,
  tapScale    = 0.97,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hoverScale  = 1.04,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hoverLift   = 0,
  noMotion    = false,
  disabled,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  variant:   _variant,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size:      _size,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  className: _className,
  style,
  onClick,
  onPress,
  onPressIn:  callerPressIn,
  onPressOut: callerPressOut,
  ...rest
}: AnimatedButtonProps) {
  const reduced = useReducedMotion();
  const still   = reduced || noMotion || !!disabled;

  const scale     = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      if (!still) scale.value = withTiming(tapScale, TAP_TRANSITION);
      callerPressIn?.(e);
    },
    [still, tapScale, callerPressIn, scale],
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      if (!still) scale.value = withSpring(1, SPRING_FAST);
      callerPressOut?.(e);
    },
    [still, callerPressOut, scale],
  );

  const handlePress = onPress ?? (onClick ? () => onClick() : undefined);

  return (
    <Pressable
      disabled={disabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled ?? false }}
      {...rest}
    >
      <Animated.View style={[animStyle, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/* ─── AnimatedIconButton ──────────────────────────────────────────────────── */

interface AnimatedIconButtonProps extends Omit<PressableProps, "style" | "children"> {
  children?: React.ReactNode;
  /** Rotation on hover (deg). Preserved for API compat; unused in RN (no hover). */
  rotateOnHover?: number;
  /** Disable all motion. Default: false */
  noMotion?:      boolean;
  /** Cosmetic variant hint — consumers apply their own styles. */
  variant?:       "default" | "outline" | "ghost" | "destructive" | "secondary";
  /** Cosmetic size hint — consumers apply their own styles. */
  size?:          "default" | "sm" | "lg" | "icon";
  /** Preserved for API compat; unused in RN. */
  className?:     string;
  style?:         StyleProp<ViewStyle>;
  /** Web API compat — alias for onPress. */
  onClick?:       () => void;
}

export function AnimatedIconButton({
  children,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  rotateOnHover = 0,
  noMotion      = false,
  disabled,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  variant:   _variant,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  size:      _size,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  className: _className,
  style,
  onClick,
  onPress,
  onPressIn:  callerPressIn,
  onPressOut: callerPressOut,
  ...rest
}: AnimatedIconButtonProps) {
  const reduced = useReducedMotion();
  const still   = reduced || noMotion || !!disabled;

  const scale     = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = useCallback(
    (e: GestureResponderEvent) => {
      if (!still) scale.value = withTiming(0.97, TAP_TRANSITION);
      callerPressIn?.(e);
    },
    [still, callerPressIn, scale],
  );

  const handlePressOut = useCallback(
    (e: GestureResponderEvent) => {
      if (!still) scale.value = withSpring(1, SPRING_FAST);
      callerPressOut?.(e);
    },
    [still, callerPressOut, scale],
  );

  const handlePress = onPress ?? (onClick ? () => onClick() : undefined);

  return (
    <Pressable
      disabled={disabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled ?? false }}
      {...rest}
    >
      <Animated.View style={[animStyle, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
