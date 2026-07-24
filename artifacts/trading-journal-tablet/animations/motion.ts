/**
 * animations/motion.ts — React Native (Reanimated)
 *
 * Migration of: artifacts/trading-journal/src/animations/motion.ts
 * Phase 12.2 — Core Animation Engine Rewrite (Framer Motion → Reanimated)
 *
 * Web → RN replacements:
 *   import { Transition, Variants } from "motion/react"
 *                                → react-native-reanimated types
 *   Transition                   → WithSpringConfig | WithTimingConfig
 *   Variants                     → RNVariant / RNPageVariant (see types below)
 *   EASE_* [bezier arrays]       → Easing.bezier(...) functions
 *   y / x props                  → translateY / translateX (explicit transform keys)
 *   y: "100%"  (sheet hidden)    → SHEET_TRANSLATE_CLOSED (large off-screen value)
 *   whileTap / whileHover        → pressedScale / hoveredScale (no Framer Motion)
 *   CSS transition strings       → kept as-is (compositor utilities return strings)
 *   Function-based variant states (sidebarItemVariants.open, cardVariants.visible)
 *                                → fixed state; callers add delay via withDelay(i*30, anim)
 *
 * All animation physics / durations preserved exactly:
 *   Spring configs: stiffness / damping / mass values unchanged.
 *   Timing durations: converted seconds → ms (0.22 s → 220 ms, etc.).
 *   Easing curves: Easing.bezier preserves the exact cubic bezier control points.
 *
 * Exported API preserved verbatim:
 *   EASE_OUT_EXPO, EASE_IN_OUT, EASE_PREMIUM, EASE_BACK_OUT  — Easing fns
 *   SPRING_FAST, SPRING_SMOOTH, SPRING_PANEL, SPRING_BOUNCY,
 *   SPRING_GENTLE, SPRING_MODAL                              — WithSpringConfig
 *   pageVariants, tabPageVariants, pageDetailVariants,
 *   pageDetailCoverVariants, pageSlideVariants               — RNPageVariant
 *   sidebarItemVariants                                      — RNVariant
 *   COMPOSITOR_EASE, COMPOSITOR_PANEL_DURATION_OPEN/CLOSE,
 *   COMPOSITOR_FADE_DURATION_OPEN/CLOSE                      — string constants
 *   compositorPanelTransition(open)                          — string utility fn
 *   compositorFadeTransition(open)                           — string utility fn
 *   backdropVariants, sheetVariants, dialogVariants          — RNVariant
 *   cardVariants, listContainerVariants, listItemVariants    — RNVariant
 *   fadeVariants, slideUpVariants, slideDownVariants,
 *   slideLeftVariants, slideRightVariants, scaleVariants     — RNVariant
 *   TAP_TRANSITION                                           — WithTimingConfig
 *   buttonConfig, iconButtonConfig                           — RN press state configs
 *   SHEET_TRANSLATE_CLOSED                                   — new; sentinel for "100%"
 *
 * Explicitly NOT implemented:
 *   ❌ Framer Motion runtime (motion/react removed)
 *   ❌ whileTap / whileHover motion props (no runtime in RN)
 */

import {
  Easing,
  type WithSpringConfig,
  type WithTimingConfig,
} from "react-native-reanimated";
import type { RNVariant, RNVariantState } from "@/animations/variants";

/* ─── Page variant type ───────────────────────────────────────────────────── */
/*
 * Page transitions use initial/enter/exit keys (not hidden/visible/exit) to
 * match the route-based animation model. A separate interface preserves those
 * semantics without conflicting with the RNVariant modal/overlay convention.
 */

/** Variant shape for route-level page transitions (initial → enter → exit). */
export interface RNPageVariant {
  initial: RNVariantState;
  enter:   RNVariantState;
  exit:    RNVariantState;
}

/* ─── Easing curves ───────────────────────────────────────────────────────── */
/*
 * Web originals were cubic-bezier arrays used as `ease` strings in motion/react.
 * Reanimated WithTimingConfig.easing accepts the function produced by Easing.bezier.
 * Control points are preserved exactly.
 */

/** [0.16, 1, 0.3, 1] — fast deceleration; equivalent to CSS ease-out-expo */
export const EASE_OUT_EXPO  = Easing.bezier(0.16, 1, 0.3, 1);
/** [0.4, 0, 0.2, 1]  — standard Material easeInOut */
export const EASE_IN_OUT    = Easing.bezier(0.4, 0, 0.2, 1);
/** [0.22, 1, 0.36, 1] — premium deceleration */
export const EASE_PREMIUM   = Easing.bezier(0.22, 1, 0.36, 1);
/** [0.34, 1.56, 0.64, 1] — subtle overshoot (back-ease-out) */
export const EASE_BACK_OUT  = Easing.bezier(0.34, 1.56, 0.64, 1);

/* ─── Spring physics presets ─────────────────────────────────────────────── */
/*
 * Reanimated WithSpringConfig uses the same stiffness / damping / mass fields as
 * Framer Motion Transition — no value changes required.
 * `type: "spring"` key removed (callers use withSpring() explicitly).
 */

/** Quick snappy response — buttons, badges */
export const SPRING_FAST: WithSpringConfig = {
  stiffness: 480, damping: 30, mass: 0.8,
} as const;

/** Default smooth spring — most UI elements */
export const SPRING_SMOOTH: WithSpringConfig = {
  stiffness: 240, damping: 26, mass: 0.9,
} as const;

/** Heavier, stately — sidebars, large panels */
export const SPRING_PANEL: WithSpringConfig = {
  stiffness: 200, damping: 30, mass: 1,
} as const;

/** Subtle bounce — cards, lists */
export const SPRING_BOUNCY: WithSpringConfig = {
  stiffness: 300, damping: 20, mass: 0.8,
} as const;

/** Ultra-gentle float — subtle reveals */
export const SPRING_GENTLE: WithSpringConfig = {
  stiffness: 120, damping: 20, mass: 1.2,
} as const;

/** Modal pop */
export const SPRING_MODAL: WithSpringConfig = {
  stiffness: 320, damping: 28, mass: 0.9,
} as const;

/* ─── Internal timing configs ─────────────────────────────────────────────── */

const PAGE_EASE_FN = Easing.bezier(0.25, 0.46, 0.45, 0.94);
const PAGE_ENTER: WithTimingConfig = { duration: 220, easing: PAGE_EASE_FN };
const PAGE_EXIT:  WithTimingConfig = { duration: 140, easing: Easing.bezier(0.4, 0, 1, 1) };

/* ─── Page transitions ────────────────────────────────────────────────────── */
/*
 * GPU-safe: only opacity + translateY (no layout props).
 * Instagram philosophy: enter is almost imperceptible (content materialises in place).
 *
 * Cover-detail starts fully opaque at y:0 — the overlay occupies the full
 * viewport from frame 1, preventing any bleed-through of content beneath.
 */

/** Standard page — sidebar and utility pages (non-tab). */
export const pageVariants: RNPageVariant = {
  initial: { opacity: 0.98, translateY: 9 },
  enter:   { opacity: 1,    translateY: 0, config: PAGE_ENTER, useSpring: false },
  exit:    { opacity: 0,    translateY: -4, config: PAGE_EXIT, useSpring: false },
};

/**
 * Tab pages — pure opacity crossfade. No translateY.
 * Avoids interaction with Layout header height changes between tabs.
 */
export const tabPageVariants: RNPageVariant = {
  initial: { opacity: 0.98 },
  enter:   { opacity: 1,    config: PAGE_ENTER, useSpring: false },
  exit:    { opacity: 0.98, config: PAGE_EXIT,  useSpring: false },
};

/** Detail pages — same premium system as pageVariants. */
export const pageDetailVariants: RNPageVariant = pageVariants;

/**
 * Cover-detail pages (Portfolio / Balances / Net-PnL — position:fixed overlay).
 * Starts fully opaque at y:0; a subtle opacity ramp keeps the arrival smooth.
 */
export const pageDetailCoverVariants: RNPageVariant = {
  initial: { opacity: 0.96, translateY: 0 },
  enter:   { opacity: 1,    translateY: 0, config: PAGE_ENTER, useSpring: false },
  exit:    { opacity: 0,    translateY: 0, config: PAGE_EXIT,  useSpring: false },
};

/** Slide pages — unified to premium system (same as pageVariants). */
export const pageSlideVariants: RNPageVariant = pageVariants;

/* ─── Sidebar nav items ───────────────────────────────────────────────────── */
/*
 * Web source used "closed"/"open" keys and a custom-function `open` state that
 * embedded a per-item `delay: i * 0.03`. Framer Motion custom functions are not
 * supported in RNVariant. The delay is removed from the variant definition;
 * callers apply per-item delay via: withDelay(index * 30, withSpring(...)).
 * Key names mapped: closed → hidden, open → visible.
 */
export const sidebarItemVariants: RNVariant = {
  hidden:  { translateX: -12, opacity: 0 },
  visible: { translateX: 0,   opacity: 1, config: SPRING_SMOOTH, useSpring: true },
  // Per-item delay: callers use withDelay(index * 30, withSpring(value, SPRING_SMOOTH))
};

/* ─── Compositor CSS-transition system ───────────────────────────────────── */
/*
 * These constants are CSS strings — they drive inline `style.transition` on web
 * and are retained verbatim for any web-targeting build targets or reference
 * documentation. In pure RN runtime they are unused; RN callers use Reanimated
 * timing configs (PAGE_ENTER / PAGE_EXIT above) instead.
 *
 * Functions preserved: compositorPanelTransition / compositorFadeTransition.
 */

export const COMPOSITOR_EASE                 = "cubic-bezier(0.22,1,0.36,1)";
export const COMPOSITOR_PANEL_DURATION_OPEN  = "0.18s";
export const COMPOSITOR_PANEL_DURATION_CLOSE = "0.12s";
export const COMPOSITOR_FADE_DURATION_OPEN   = "0.14s";
export const COMPOSITOR_FADE_DURATION_CLOSE  = "0.12s";

/** CSS `transition` string for the animated opacity+transform panel layer. */
export function compositorPanelTransition(open: boolean): string {
  const dur = open ? COMPOSITOR_PANEL_DURATION_OPEN : COMPOSITOR_PANEL_DURATION_CLOSE;
  return `opacity ${dur} ${COMPOSITOR_EASE}, transform ${dur} ${COMPOSITOR_EASE}`;
}

/** CSS `transition` string for the opacity-only backdrop / static blur layer. */
export function compositorFadeTransition(open: boolean): string {
  const dur = open ? COMPOSITOR_FADE_DURATION_OPEN : COMPOSITOR_FADE_DURATION_CLOSE;
  return `opacity ${dur} ease`;
}

/* ─── Modals / Sheets ─────────────────────────────────────────────────────── */

export const backdropVariants: RNVariant = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, config: { duration: 220 } satisfies WithTimingConfig, useSpring: false },
  exit:    { opacity: 0, config: { duration: 180 } satisfies WithTimingConfig, useSpring: false },
};

/**
 * Off-screen sentinel for bottom sheets.
 * Web used y:"100%" (percentage of container height). In RN, use a large pixel
 * value; callers may override with the measured component height for precision.
 */
export const SHEET_TRANSLATE_CLOSED = 1000;

/** Bottom sheet / drawer. */
export const sheetVariants: RNVariant = {
  hidden:  { translateY: SHEET_TRANSLATE_CLOSED, opacity: 0.5 },
  visible: { translateY: 0, opacity: 1, config: SPRING_PANEL, useSpring: true },
  exit:    {
    translateY: SHEET_TRANSLATE_CLOSED,
    opacity: 0.3,
    config: { duration: 240, easing: Easing.bezier(0.4, 0, 1, 1) } satisfies WithTimingConfig,
    useSpring: false,
  },
};

/** Centered dialog. */
export const dialogVariants: RNVariant = {
  hidden:  { opacity: 0, scale: 0.985, translateY: 20 },
  visible: {
    opacity: 1, scale: 1, translateY: 0,
    config: { duration: 220, easing: Easing.out(Easing.ease) } satisfies WithTimingConfig,
    useSpring: false,
  },
  exit: {
    opacity: 0, scale: 0.96, translateY: 10,
    config: { duration: 160 } satisfies WithTimingConfig,
    useSpring: false,
  },
};

/* ─── Cards ───────────────────────────────────────────────────────────────── */
/*
 * Web: visible state was a function (i: number) that embedded delay: i * 0.055.
 * RN:  fixed state; callers apply per-card delay via withDelay(index * 55, anim).
 */
export const cardVariants: RNVariant = {
  hidden:  { opacity: 0, translateY: 20, scale: 0.96 },
  visible: {
    opacity: 1, translateY: 0, scale: 1,
    config: { stiffness: 260, damping: 32, mass: 0.9 } satisfies WithSpringConfig,
    useSpring: true,
    // Per-card delay: callers use withDelay(index * 55, withSpring(value, config))
  },
};

/* ─── Lists ───────────────────────────────────────────────────────────────── */

export const listContainerVariants: RNVariant = {
  hidden:  { opacity: 0, translateY: 10 },
  visible: {
    opacity: 1, translateY: 0,
    config: { duration: 220, easing: Easing.out(Easing.ease) } satisfies WithTimingConfig,
    useSpring: false,
  },
  exit: { opacity: 0, config: { duration: 150 } satisfies WithTimingConfig, useSpring: false },
};

export const listItemVariants: RNVariant = {
  hidden:  { opacity: 0, translateX: -14, scale: 0.96 },
  visible: { opacity: 1, translateX: 0,   scale: 1,    config: SPRING_SMOOTH, useSpring: true },
  exit:    {
    opacity: 0, translateX: -8, scale: 0.97,
    config: { duration: 140 } satisfies WithTimingConfig,
    useSpring: false,
  },
};

/* ─── Generic reveal variants ─────────────────────────────────────────────── */

export const fadeVariants: RNVariant = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, config: { duration: 280 } satisfies WithTimingConfig, useSpring: false },
  exit:    { opacity: 0, config: { duration: 180 } satisfies WithTimingConfig, useSpring: false },
};

export const slideUpVariants: RNVariant = {
  hidden:  { opacity: 0, translateY: 24 },
  visible: { opacity: 1, translateY: 0,  config: SPRING_SMOOTH, useSpring: true },
  exit:    {
    opacity: 0, translateY: 12,
    config: { duration: 160 } satisfies WithTimingConfig,
    useSpring: false,
  },
};

export const slideDownVariants: RNVariant = {
  hidden:  { opacity: 0, translateY: -20 },
  visible: { opacity: 1, translateY: 0,   config: SPRING_SMOOTH, useSpring: true },
  exit:    {
    opacity: 0, translateY: -10,
    config: { duration: 160 } satisfies WithTimingConfig,
    useSpring: false,
  },
};

export const slideLeftVariants: RNVariant = {
  hidden:  { opacity: 0, translateX: 24 },
  visible: { opacity: 1, translateX: 0,  config: SPRING_SMOOTH, useSpring: true },
  exit:    {
    opacity: 0, translateX: 12,
    config: { duration: 160 } satisfies WithTimingConfig,
    useSpring: false,
  },
};

export const slideRightVariants: RNVariant = {
  hidden:  { opacity: 0, translateX: -24 },
  visible: { opacity: 1, translateX: 0,   config: SPRING_SMOOTH, useSpring: true },
  exit:    {
    opacity: 0, translateX: -12,
    config: { duration: 160 } satisfies WithTimingConfig,
    useSpring: false,
  },
};

export const scaleVariants: RNVariant = {
  hidden:  { opacity: 0, scale: 0.86 },
  visible: { opacity: 1, scale: 1,    config: SPRING_BOUNCY, useSpring: true },
  exit:    {
    opacity: 0, scale: 0.94,
    config: { duration: 150 } satisfies WithTimingConfig,
    useSpring: false,
  },
};

/* ─── Buttons ─────────────────────────────────────────────────────────────── */

/**
 * 90 ms ease-out tween — press (onPressIn) transition.
 * Web: TAP_TRANSITION: Transition = { type:"tween", duration:0.09, ease:"easeOut" }
 * RN:  WithTimingConfig — duration converted s→ms, ease mapped.
 */
export const TAP_TRANSITION: WithTimingConfig = {
  duration: 90,
  easing: Easing.out(Easing.ease),
} as const;

/**
 * Button press/hover animation config.
 *
 * Web: { whileTap: { scale:0.97 }, whileHover: { scale:1.04 }, transition: {...} }
 * RN:  whileTap / whileHover key names preserved for API compat.
 *      Values are plain objects (no Framer Motion — callers use Pressable + Animated.Value).
 *      Callers:
 *        onPressIn  → animate scale to buttonConfig.whileTap.scale using TAP_TRANSITION
 *        onPressOut → animate scale back to 1 using buttonConfig.springTransition
 */
export const buttonConfig = {
  /** Target scale while pressed. Drive with withTiming(value, TAP_TRANSITION). */
  whileTap:        { scale: 0.97 as number },
  /** Target scale while hovered (desktop/pointer devices). */
  whileHover:      { scale: 1.04 as number },
  /** Timing config for the press-down animation. */
  transition:      TAP_TRANSITION,
  /** Spring config for the press-release animation. */
  springTransition: SPRING_FAST,
} as const;

export const iconButtonConfig = {
  /** Target scale while pressed. */
  whileTap:        { scale: 0.97 as number },
  /** Target scale + rotation while hovered. */
  whileHover:      { scale: 1.08 as number, rotate: 4 as number },
  /** Timing config for the press-down animation. */
  transition:      TAP_TRANSITION,
  /** Spring config for the press-release animation. */
  springTransition: SPRING_FAST,
} as const;
