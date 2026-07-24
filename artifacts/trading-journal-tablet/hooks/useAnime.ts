/**
 * hooks/useAnime.ts — React Native (Reanimated)
 *
 * Migration of: artifacts/trading-journal/src/hooks/useAnime.ts
 * Phase 12.2 — Core Animation Engine Rewrite (Framer Motion → Reanimated)
 *
 * Web → RN replacements:
 *   animejs JSAnimation / animate()   → Reanimated SharedValue animations
 *   HTMLElement targets               → RNAnimeTarget (Record<string, SharedValue<number>>)
 *   instance.pause() via animejs      → cancelAnimation() per SharedValue
 *   instance.seek(0) + play()         → reset SharedValues to initial + re-animate
 *   RefObject<HTMLElement>            → not returned; callers own SharedValues
 *
 * Exported API preserved verbatim:
 *   AnimeInstance   — type alias for RNAnimeInstance (pause / play / seek)
 *   RNAnimeTarget   — new export; RN equivalent of animejs DOM target
 *   RNAnimeParams   — new export; RN equivalent of animejs animation params
 *   useAnime()      → { play, pause, restart, instanceRef }
 *   useAnimeOnMount(factory, target, deps) — runs animation on mount / dep change
 *
 * Signature changes vs web:
 *   useAnime().play(targets, params)
 *     Web:  targets: Element | Element[] | NodeListOf<Element> | string
 *     RN:   targets: RNAnimeTarget | RNAnimeTarget[]
 *
 *   useAnimeOnMount
 *     Web:  factory: (el: T extends HTMLElement) → params; returns RefObject<T>
 *     RN:   factory: (target: RNAnimeTarget) → void;
 *           target: RNAnimeTarget passed directly; nothing returned
 *     Rationale: Reanimated animations are driven by SharedValues, not DOM refs.
 *                Callers own the SharedValues and pass them in; the hook owns
 *                only the cancel-on-unmount / cancel-on-dep-change lifecycle.
 */

import { useCallback, useEffect, useRef } from "react";
import {
  cancelAnimation,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
  type WithSpringConfig,
  type WithTimingConfig,
} from "react-native-reanimated";

/* ─── Types ───────────────────────────────────────────────────────────────── */

/**
 * React Native animation target — a dictionary of SharedValue<number> keyed
 * by animatable property name (opacity, translateY, scale, rotate, etc.).
 *
 * Replaces animejs' DOM-element / CSS-selector targets.
 */
export type RNAnimeTarget = Record<string, SharedValue<number>>;

/**
 * React Native animation params — mirrors animejs' animation options.
 *
 * Property animations are specified as extra keys on the object:
 *   { opacity: [0, 1], translateY: [24, 0], duration: 400 }
 *
 * Array value → [from, to]: SharedValue is set to `from` before animating.
 * Scalar value → to: animation starts from the current SharedValue.
 */
export interface RNAnimeParams {
  duration?: number;
  /** Per-item delay in ms, or a stagger function produced by utils.stagger(). */
  delay?: number | ((index: number, total: number) => number);
  loop?: boolean | number;
  alternate?: boolean;
  /** true → use withSpring; false/undefined → use withTiming */
  useSpring?: boolean;
  springConfig?: WithSpringConfig;
  timingConfig?: WithTimingConfig;
  onComplete?: () => void;
  /** Remaining keys are property → [from,to] | to */
  [prop: string]: unknown;
}

/** Imperative animation handle returned by play(). */
export interface RNAnimeInstance {
  pause(): void;
  play(): void;
  /** Seek to an approximate progress offset (ms). Best-effort in Reanimated. */
  seek(progressMs: number): void;
}

/** Back-compat alias — matches the web's `AnimeInstance` type alias. */
export type AnimeInstance = RNAnimeInstance;

/* ─── Internal helpers ────────────────────────────────────────────────────── */

const RESERVED_KEYS = new Set([
  "duration", "delay", "loop", "alternate",
  "useSpring", "springConfig", "timingConfig", "onComplete",
]);

function buildAnimation(
  sv: SharedValue<number>,
  to: number,
  params: RNAnimeParams,
  delayMs: number,
): void {
  const { duration = 400, loop = false, alternate = false, useSpring: spring = false, springConfig, timingConfig } = params;

  let anim = spring
    ? withSpring(to, springConfig)
    : withTiming(to, { duration, ...(timingConfig ?? {}) });

  if (loop) {
    const count = loop === true ? -1 : (loop as number) - 1;
    anim = withRepeat(anim, count, alternate);
  }

  sv.value = delayMs > 0 ? withDelay(delayMs, anim) : anim;
}

function applyParams(
  target: RNAnimeTarget,
  params: RNAnimeParams,
  index: number,
  total: number,
  cancelFns: Array<() => void>,
): void {
  const rawDelay = params.delay;
  const delayMs = typeof rawDelay === "function"
    ? rawDelay(index, total)
    : (rawDelay ?? 0);

  for (const [key, sv] of Object.entries(target)) {
    if (RESERVED_KEYS.has(key) || !(key in params)) continue;
    const val = params[key] as number | [number, number];
    const from = Array.isArray(val) ? val[0] : undefined;
    const to   = Array.isArray(val) ? val[1] : val;

    if (from !== undefined) sv.value = from;
    buildAnimation(sv, to, params, delayMs);
    cancelFns.push(() => cancelAnimation(sv));
  }
}

/* ─── useAnime ────────────────────────────────────────────────────────────── */

/**
 * Run Reanimated animations with automatic cleanup on unmount.
 *
 * Usage:
 *   const opacity    = useSharedValue(0);
 *   const translateY = useSharedValue(24);
 *   const { play, pause } = useAnime();
 *
 *   play(
 *     { opacity, translateY },
 *     { opacity: [0, 1], translateY: [24, 0], duration: 400 },
 *   );
 */
export function useAnime() {
  const instanceRef  = useRef<AnimeInstance | null>(null);
  const cancelFnsRef = useRef<Array<() => void>>([]);
  const initialRef   = useRef<Record<string, number>>({});

  useEffect(() => {
    return () => {
      cancelFnsRef.current.forEach((fn) => fn());
      cancelFnsRef.current = [];
      instanceRef.current  = null;
    };
  }, []);

  const play = useCallback(
    (
      targets: RNAnimeTarget | RNAnimeTarget[],
      params: RNAnimeParams,
    ): AnimeInstance => {
      // Cancel any in-flight animations.
      cancelFnsRef.current.forEach((fn) => fn());
      cancelFnsRef.current = [];

      const targetArr = Array.isArray(targets) ? targets : [targets];

      // Snapshot initial values before animating (needed for restart()).
      const snap: Record<string, number> = {};
      for (const target of targetArr) {
        for (const [key, sv] of Object.entries(target)) {
          snap[key] = sv.value;
        }
      }
      initialRef.current = snap;

      // Schedule animations.
      const total = targetArr.length;
      targetArr.forEach((target, idx) => {
        applyParams(target, params, idx, total, cancelFnsRef.current);
      });

      // Fire onComplete via JS timeout — best effort.
      if (params.onComplete) {
        const rawDelay = typeof params.delay === "function" ? 0 : (params.delay ?? 0);
        const totalMs  = (params.duration ?? 400) + rawDelay;
        const tid      = setTimeout(params.onComplete, totalMs);
        cancelFnsRef.current.push(() => clearTimeout(tid));
      }

      const instance: AnimeInstance = {
        pause() {
          cancelFnsRef.current.forEach((fn) => fn());
          cancelFnsRef.current = [];
        },
        play() {
          // Re-run from current state (no seek-to-start).
          play(targets, params);
        },
        seek(_progressMs: number) {
          // Best-effort: Reanimated animations running on the UI thread cannot
          // be seeked imperatively from JS. Callers that need precise seek
          // control should manage SharedValues directly.
        },
      };
      instanceRef.current = instance;
      return instance;
    },
    [],
  );

  const pause = useCallback(() => {
    instanceRef.current?.pause();
  }, []);

  const restart = useCallback(() => {
    const inst = instanceRef.current;
    if (inst) {
      inst.pause();
      inst.play();
    }
  }, []);

  return { play, pause, restart, instanceRef };
}

/* ─── useAnimeOnMount ─────────────────────────────────────────────────────── */

/**
 * Run a Reanimated animation when the component mounts and whenever `deps`
 * change. Automatically cancels the previous animation before re-running.
 * Cleans up on unmount.
 *
 * Web signature used a DOM ref:
 *   const ref = useAnimeOnMount<HTMLDivElement>(el => ({ opacity:[0,1] }));
 *   return <div ref={ref} />;
 *
 * RN signature passes SharedValues directly:
 *   const opacity = useSharedValue(0);
 *   useAnimeOnMount(
 *     (target) => { target.opacity.value = withTiming(1, { duration: 500 }); },
 *     { opacity },
 *   );
 *
 * @param factory - Receives the target dict; applies animations imperatively.
 * @param target  - SharedValue dict. Must be stable (from useRef / useMemo).
 * @param deps    - Re-runs the factory when any dep changes (default: []).
 */
export function useAnimeOnMount(
  factory: (target: RNAnimeTarget) => void,
  target: RNAnimeTarget,
  deps: unknown[] = [],
): void {
  const cancelFnsRef = useRef<Array<() => void>>([]);
  const factoryRef   = useRef(factory);
  useEffect(() => { factoryRef.current = factory; });

  useEffect(() => {
    // Cancel previous.
    cancelFnsRef.current.forEach((fn) => fn());
    cancelFnsRef.current = [];

    // Register cancel hooks for every SharedValue in target.
    for (const sv of Object.values(target)) {
      cancelFnsRef.current.push(() => cancelAnimation(sv));
    }

    factoryRef.current(target);

    return () => {
      cancelFnsRef.current.forEach((fn) => fn());
      cancelFnsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
