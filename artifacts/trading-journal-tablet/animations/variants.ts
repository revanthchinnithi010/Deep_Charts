/**
 * animations/variants.ts — React Native (Reanimated)
 *
 * Migration of: artifacts/trading-journal/src/animations/variants.ts
 * Phase 12.1 — Shared Timing & Animation Variants (React → React Native)
 *
 * Web → RN replacements:
 *   import { Variants } from "framer-motion"  → RNVariant (custom interface below)
 *   Spring configs { type:"spring", stiffness, damping, mass }
 *                                              → WithSpringConfig (same stiffness/damping/mass,
 *                                                type field removed — callers use withSpring())
 *   Timing configs { duration (seconds), ease }
 *                                              → WithTimingConfig (duration × 1000 → ms,
 *                                                ease strings mapped to Easing.* functions)
 *   EASE_PREMIUM [0.22,1,0.36,1] (array)      → Easing.bezier(0.22,1,0.36,1) (function)
 *   filter: "blur(...)"                        → omitted (not supported in React Native)
 *   y / x props                                → translateY / translateX (explicit transform keys)
 *   staggerChildren                            → omitted (no built-in stagger in Reanimated;
 *                                                callers implement stagger via delay offsets)
 *
 * Spring physics preserved exactly:
 *   Reanimated's WithSpringConfig shares the same stiffness / damping / mass
 *   parameter names and semantics as Framer Motion. All four spring presets
 *   (SMOOTH, SNAPPY, PANEL, MODAL) are preserved without modification.
 *
 * Duration mapping (seconds → milliseconds):
 *   0.22 s → 220 ms  (modalVariants visible, overlayVariants visible)
 *   0.18 s → 180 ms  (leftPanelVariants exit, overlayVariants exit)
 *   0.16 s → 160 ms  (modalVariants exit, floatUpVariants exit)
 *   0.14 s → 140 ms  (miniToolbarVariants exit)
 *
 * Easing mapping:
 *   EASE_PREMIUM  [0.22,1,0.36,1]  → Easing.bezier(0.22, 1, 0.36, 1)
 *   "easeOut"                       → Easing.out(Easing.ease)
 *   (no ease specified)             → Reanimated default (Easing.inOut(Easing.quad))
 *
 * Usage pattern with Reanimated:
 *   Each variant's states carry style values plus a `config` (WithSpringConfig or
 *   WithTimingConfig) and a `useSpring` flag telling callers which animation fn to use.
 *
 *   Example — modal open/close:
 *     const opacity   = useSharedValue(modalVariants.hidden.opacity ?? 0);
 *     const translateY = useSharedValue(modalVariants.hidden.translateY ?? 0);
 *     const animStyle = useAnimatedStyle(() => ({
 *       opacity: withTiming(opacity.value, modalVariants.visible.config as WithTimingConfig),
 *       transform: [{ translateY: withTiming(translateY.value,
 *                       modalVariants.visible.config as WithTimingConfig) }],
 *     }));
 *     // Trigger: opacity.value = modalVariants.visible.opacity ?? 1;
 *     //          translateY.value = modalVariants.visible.translateY ?? 0;
 *
 *   Example — spring-driven panel:
 *     const tx = useSharedValue(leftPanelVariants.hidden.translateX ?? -80);
 *     const op = useSharedValue(leftPanelVariants.hidden.opacity ?? 0);
 *     const animStyle = useAnimatedStyle(() => ({
 *       opacity: withSpring(op.value, leftPanelVariants.visible.config as WithSpringConfig),
 *       transform: [{ translateX: withSpring(tx.value,
 *                       leftPanelVariants.visible.config as WithSpringConfig) }],
 *     }));
 *
 * Exported API preserved verbatim:
 *   SPRING_SMOOTH, SPRING_SNAPPY, SPRING_PANEL, SPRING_MODAL — spring config constants
 *   EASE_PREMIUM                                              — easing function (Reanimated)
 *   bottomBarVariants, barItemVariants, leftPanelVariants
 *   miniToolbarVariants, staggerItemVariants, modalVariants
 *   overlayVariants, floatUpVariants                         — RNVariant descriptors
 *
 * New exports (supporting types — no web equivalent):
 *   RNVariantState, RNVariant                                — TypeScript types for callers
 *
 * Explicitly NOT implemented:
 *   ❌ Screen animations
 *   ❌ Shared element transitions
 *   ❌ Navigation transitions
 *   ❌ Gesture animations
 *   ❌ Bottom sheet animations
 *   ❌ Chart animations
 *   ❌ New animation presets
 */

import {
  Easing,
  type WithSpringConfig,
  type WithTimingConfig,
} from "react-native-reanimated";

/* ─── Types ───────────────────────────────────────────────────────────────── */

/** A single animation state (hidden / visible / exit). */
export interface RNVariantState {
  opacity?: number;
  translateY?: number;
  translateX?: number;
  scale?: number;
  /**
   * Animation config to apply when transitioning TO this state.
   * Cast to WithSpringConfig when useSpring is true,
   * cast to WithTimingConfig when useSpring is false/undefined.
   */
  config?: WithSpringConfig | WithTimingConfig;
  /**
   * true  → use withSpring(value, config as WithSpringConfig)
   * false → use withTiming(value, config as WithTimingConfig)
   */
  useSpring?: boolean;
}

/** Reanimated equivalent of Framer Motion's Variants type. */
export interface RNVariant {
  hidden:  RNVariantState;
  visible: RNVariantState;
  exit?:   RNVariantState;
}

/* ─── Spring configs ──────────────────────────────────────────────────────── */
/* Physics values are identical to the Framer Motion originals.
   Reanimated WithSpringConfig uses the same stiffness/damping/mass fields. */

export const SPRING_SMOOTH: WithSpringConfig = { stiffness: 180, damping: 24, mass: 0.9 } as const;
export const SPRING_SNAPPY: WithSpringConfig = { stiffness: 220, damping: 18             } as const;
export const SPRING_PANEL:  WithSpringConfig = { stiffness: 140, damping: 22             } as const;
export const SPRING_MODAL:  WithSpringConfig = { stiffness: 160, damping: 20             } as const;

/* ─── Easing ──────────────────────────────────────────────────────────────── */
/* EASE_PREMIUM was [0.22, 1, 0.36, 1] (cubic bezier array for Framer Motion).
   Reanimated uses Easing.bezier(x1, y1, x2, y2) — identical curve. */

export const EASE_PREMIUM = Easing.bezier(0.22, 1, 0.36, 1);

/* ─── Shared timing configs ───────────────────────────────────────────────── */
/* Named internally so they can be shared across multiple variants. */

const TIMING_PREMIUM_180: WithTimingConfig = { duration: 180, easing: EASE_PREMIUM };
const TIMING_EASEOUT_220: WithTimingConfig = { duration: 220, easing: Easing.out(Easing.ease) };
const TIMING_DEFAULT_160: WithTimingConfig = { duration: 160 };
const TIMING_DEFAULT_140: WithTimingConfig = { duration: 140 };
const TIMING_DEFAULT_220: WithTimingConfig = { duration: 220 };
const TIMING_DEFAULT_180: WithTimingConfig = { duration: 180 };

/* ─── Variants ────────────────────────────────────────────────────────────── */

/**
 * bottomBarVariants
 *
 * Web source:
 *   hidden:  { opacity:0, y:100, scale:0.92, filter:"blur(10px)" }
 *   visible: { opacity:1, y:0,   scale:1,    transition:{...SPRING_SMOOTH, staggerChildren:0.04} }
 *
 * RN changes:
 *   filter:blur omitted (not supported in RN)
 *   staggerChildren omitted (implement via delay offsets in callers)
 *   y → translateY
 */
export const bottomBarVariants: RNVariant = {
  hidden:  { opacity: 0, translateY: 100, scale: 0.92                                             },
  visible: { opacity: 1, translateY:   0, scale:    1, config: SPRING_SMOOTH, useSpring: true      },
};

/**
 * barItemVariants
 *
 * Web source:
 *   hidden:  { opacity:0, y:8,  scale:0.88 }
 *   visible: { opacity:1, y:0,  scale:1,   transition:SPRING_SMOOTH }
 */
export const barItemVariants: RNVariant = {
  hidden:  { opacity: 0, translateY: 8, scale: 0.88                                            },
  visible: { opacity: 1, translateY: 0, scale:    1, config: SPRING_SMOOTH, useSpring: true    },
};

/**
 * leftPanelVariants
 *
 * Web source:
 *   hidden:  { x:-80, opacity:0 }
 *   visible: { x:0,   opacity:1, transition:SPRING_PANEL }
 *   exit:    { x:-80, opacity:0, transition:{ duration:0.18, ease:EASE_PREMIUM } }
 */
export const leftPanelVariants: RNVariant = {
  hidden:  { translateX: -80, opacity: 0                                                           },
  visible: { translateX:   0, opacity: 1, config: SPRING_PANEL,    useSpring: true                 },
  exit:    { translateX: -80, opacity: 0, config: TIMING_PREMIUM_180, useSpring: false             },
};

/**
 * miniToolbarVariants
 *
 * Web source:
 *   hidden:  { scale:0.8,  opacity:0, y:10 }
 *   visible: { scale:1,    opacity:1, y:0,  transition:SPRING_SNAPPY }
 *   exit:    { scale:0.88, opacity:0, y:6,  transition:{ duration:0.14 } }
 */
export const miniToolbarVariants: RNVariant = {
  hidden:  { scale: 0.8,  opacity: 0, translateY: 10                                             },
  visible: { scale: 1,    opacity: 1, translateY:  0, config: SPRING_SNAPPY,    useSpring: true   },
  exit:    { scale: 0.88, opacity: 0, translateY:  6, config: TIMING_DEFAULT_140, useSpring: false },
};

/**
 * staggerItemVariants
 *
 * Web source:
 *   hidden:  { opacity:0, x:-8, scale:0.92 }
 *   visible: { opacity:1, x:0,  scale:1,   transition:SPRING_SNAPPY }
 */
export const staggerItemVariants: RNVariant = {
  hidden:  { opacity: 0, translateX: -8, scale: 0.92                                          },
  visible: { opacity: 1, translateX:  0, scale:    1, config: SPRING_SNAPPY, useSpring: true   },
};

/**
 * modalVariants
 *
 * Web source:
 *   hidden:  { opacity:0, scale:0.985, y:16 }
 *   visible: { opacity:1, scale:1,     y:0,  transition:{ type:"tween", duration:0.22, ease:"easeOut" } }
 *   exit:    { opacity:0, scale:0.96,  y:8,  transition:{ duration:0.16 } }
 */
export const modalVariants: RNVariant = {
  hidden:  { opacity: 0, scale: 0.985, translateY: 16                                              },
  visible: { opacity: 1, scale: 1,     translateY:  0, config: TIMING_EASEOUT_220, useSpring: false },
  exit:    { opacity: 0, scale: 0.96,  translateY:  8, config: TIMING_DEFAULT_160, useSpring: false },
};

/**
 * overlayVariants
 *
 * Web source:
 *   hidden:  { opacity:0 }
 *   visible: { opacity:1, transition:{ duration:0.22 } }
 *   exit:    { opacity:0, transition:{ duration:0.18 } }
 */
export const overlayVariants: RNVariant = {
  hidden:  { opacity: 0                                                              },
  visible: { opacity: 1, config: TIMING_DEFAULT_220, useSpring: false               },
  exit:    { opacity: 0, config: TIMING_DEFAULT_180, useSpring: false               },
};

/**
 * floatUpVariants
 *
 * Web source:
 *   hidden:  { opacity:0, y:20, scale:0.95 }
 *   visible: { opacity:1, y:0,  scale:1,    transition:SPRING_SMOOTH }
 *   exit:    { opacity:0, y:12, scale:0.97, transition:{ duration:0.16 } }
 */
export const floatUpVariants: RNVariant = {
  hidden:  { opacity: 0, translateY: 20, scale: 0.95                                             },
  visible: { opacity: 1, translateY:  0, scale:    1, config: SPRING_SMOOTH,    useSpring: true   },
  exit:    { opacity: 0, translateY: 12, scale: 0.97, config: TIMING_DEFAULT_160, useSpring: false },
};
