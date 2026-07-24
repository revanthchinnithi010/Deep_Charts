/**
 * components/animations/AnimatedList.tsx — React Native (Reanimated)
 *
 * Migration of: artifacts/trading-journal/src/components/animations/AnimatedList.tsx
 * Phase 12.4 — Composite Animation Wrappers (React → React Native)
 *
 * Web → RN replacements:
 *   motion[as] div/ul (Motion.dev)  → Animated.View (Reanimated)
 *   AnimatePresence (Motion.dev)    → mount-based entrance only; exit animations
 *                                     not supported (no AnimatePresence in RN)
 *   whileTap: { scale:0.97 }        → Pressable + onPressIn/onPressOut with Reanimated
 *   layout prop (motion)            → not applicable in RN; layout shifts handled natively
 *   willChange CSS hint             → not needed in RN (Reanimated handles GPU compositing)
 *   as?: HTMLElementTagNameMap key  → preserved for API compat; always renders View in RN
 *   className                       → preserved in interface; unused in RN
 *   style: React.CSSProperties      → style: StyleProp<ViewStyle>
 *   onClick                         → onPress / onClick alias preserved
 *
 * AnimatedPresenceList — exit animations:
 *   The web's AnimatePresence mode="popLayout" animates items out on removal.
 *   React Native has no direct equivalent. Entrance animations work identically.
 *   Exit animations are NOT implemented; components unmount without animation.
 *   Callers that need exit animations should manage the item lifecycle directly.
 *
 * AnimatedPresenceList — virtualization:
 *   Faithfully mirrors the web's non-virtualized <div> container. Callers with
 *   large lists should use FlashList (@shopify/flash-list) directly and apply
 *   per-item entrance animation via index-based withDelay() if needed.
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
import { Pressable } from "react-native";
import type { GestureResponderEvent, StyleProp, ViewStyle } from "react-native";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  listContainerVariants,
  listItemVariants,
  TAP_TRANSITION,
  SPRING_FAST,
} from "@/animations/motion";

/* ─── AnimatedList ────────────────────────────────────────────────────────── */

interface AnimatedListProps {
  children:   React.ReactNode;
  /** Preserved for API compat; unused in RN (always renders View). */
  as?:        string;
  /** Preserved for API compat; unused in RN. */
  className?: string;
  style?:     StyleProp<ViewStyle>;
}

/**
 * Wraps a list container with an entrance animation (fade + slide).
 * Uses listContainerVariants — same variant as the web source.
 */
export function AnimatedList({
  children,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  as:        _as,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  className: _className,
  style,
}: AnimatedListProps) {
  const reduced = useReducedMotion();
  const { hidden, visible } = listContainerVariants;

  const opacity    = useSharedValue(hidden.opacity    ?? 0);
  const translateY = useSharedValue(hidden.translateY ?? 10);

  const animStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  useEffect(() => {
    if (reduced) {
      opacity.value    = visible.opacity    ?? 1;
      translateY.value = visible.translateY ?? 0;
      return;
    }
    const config = visible.config as WithTimingConfig | undefined;
    const timing = config ?? { duration: 220 };
    opacity.value    = withTiming(visible.opacity    ?? 1, timing);
    translateY.value = withTiming(visible.translateY ?? 0, timing);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return (
    <Animated.View style={[animStyle, style]}>
      {children}
    </Animated.View>
  );
}

/* ─── AnimatedListItem ────────────────────────────────────────────────────── */

interface AnimatedListItemProps {
  children:   React.ReactNode;
  /** Preserved for API compat; unused in RN. */
  as?:        string;
  /** Preserved for API compat; unused in RN. */
  className?: string;
  style?:     StyleProp<ViewStyle>;
  /** Mapped to onPress in RN (web API name preserved). */
  onClick?:   () => void;
  /** Enables tap-scale press feedback. */
  tappable?:  boolean;
  /** Stagger hint — preserved for API compat; parent manages stagger in RN. */
  index?:     number;
}

/** Wraps a list item. Pass tappable to enable press-scale feedback. */
export function AnimatedListItem({
  children,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  as:        _as,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  className: _className,
  style,
  onClick,
  tappable  = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  index:    _index,
}: AnimatedListItemProps) {
  const reduced = useReducedMotion();
  const scale   = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = (e: GestureResponderEvent) => {
    void e;
    if (!reduced && tappable) scale.value = withTiming(0.97, TAP_TRANSITION);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    void e;
    if (!reduced && tappable) scale.value = withSpring(1, SPRING_FAST);
  };

  if (tappable || onClick) {
    return (
      <Pressable
        onPress={onClick}
        onPressIn={tappable ? handlePressIn : undefined}
        onPressOut={tappable ? handlePressOut : undefined}
      >
        <Animated.View style={[animStyle, style]}>
          {children}
        </Animated.View>
      </Pressable>
    );
  }

  return <Animated.View style={style}>{children}</Animated.View>;
}

/* ─── Internal: PresenceItem ──────────────────────────────────────────────── */
/*
 * Applies listItemVariants entrance animation to each item in the data-driven
 * AnimatedPresenceList. Each instance owns its own shared values.
 */

interface PresenceItemProps {
  children: React.ReactNode;
  index:    number;
  reduced:  boolean;
}

function PresenceItem({ children, index, reduced }: PresenceItemProps) {
  const { hidden, visible } = listItemVariants;

  const opacity    = useSharedValue(hidden.opacity    ?? 0);
  const translateX = useSharedValue(hidden.translateX ?? -14);
  const scale      = useSharedValue(hidden.scale      ?? 0.96);

  const animStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [
      { translateX: translateX.value },
      { scale:      scale.value      },
    ],
  }));

  useEffect(() => {
    if (reduced) {
      opacity.value    = visible.opacity    ?? 1;
      translateX.value = visible.translateX ?? 0;
      scale.value      = visible.scale      ?? 1;
      return;
    }

    const delayMs    = index * 30;
    const spring     = visible.useSpring;
    const config     = visible.config;

    function animateSv(sv: SharedValue<number>, to: number): void {
      const base = spring
        ? withSpring(to, config as WithSpringConfig)
        : withTiming(to, config as WithTimingConfig | undefined);
      sv.value = delayMs > 0 ? withDelay(delayMs, base) : base;
    }

    if (visible.opacity    !== undefined) animateSv(opacity,    visible.opacity);
    if (visible.translateX !== undefined) animateSv(translateX, visible.translateX);
    if (visible.scale      !== undefined) animateSv(scale,      visible.scale);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return <Animated.View style={animStyle}>{children}</Animated.View>;
}

/* ─── AnimatedPresenceList ────────────────────────────────────────────────── */

interface PresenceListProps<T> {
  items?:          T[];
  keyExtractor?:   (item: T) => string | number;
  renderItem?:     (item: T, index: number) => React.ReactNode;
  children?:       React.ReactNode;
  /** Preserved for API compat; unused in RN (always renders View). */
  as?:             string;
  /** Preserved for API compat; unused in RN. */
  className?:      string;
  style?:          StyleProp<ViewStyle>;
  emptyState?:     React.ReactNode;
}

/**
 * Renders a list with per-item entrance animations.
 *
 * Two usage modes:
 *   1. Data-driven: items + keyExtractor + renderItem → each item gets entrance animation.
 *   2. Children-driven: pass pre-keyed children (AnimatedListItem etc.) directly.
 *
 * Exit animations are NOT supported (no AnimatePresence in RN).
 * For exit animations, manage item lifecycle at the call site.
 */
export function AnimatedPresenceList<T,>({
  items,
  keyExtractor,
  renderItem,
  children,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  as:        _as,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  className: _className,
  style,
  emptyState,
}: PresenceListProps<T>) {
  const reduced = useReducedMotion();

  // ── Children-driven mode ───────────────────────────────────────────────────
  if (children !== undefined) {
    return <Animated.View style={style}>{children}</Animated.View>;
  }

  // ── Data-driven mode ───────────────────────────────────────────────────────
  const list = items ?? [];

  if (list.length === 0 && emptyState) {
    return <Animated.View style={style}>{emptyState}</Animated.View>;
  }

  return (
    <Animated.View style={style}>
      {list.map((item, i) => (
        <PresenceItem
          key={keyExtractor ? keyExtractor(item) : i}
          index={i}
          reduced={reduced}
        >
          {renderItem?.(item, i)}
        </PresenceItem>
      ))}
    </Animated.View>
  );
}
