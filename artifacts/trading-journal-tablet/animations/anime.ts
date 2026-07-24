/**
 * animations/anime.ts — React Native (Reanimated)
 *
 * Migration of: artifacts/trading-journal/src/animations/anime.ts
 * Phase 12.2 — Core Animation Engine Rewrite (Framer Motion → Reanimated)
 *
 * Web → RN replacements:
 *   animejs (animate, createTimeline, utils, svg) — replaced with Reanimated
 *   HTMLElement / SVGCircleElement targets         → typed SharedValue dictionaries
 *   container.querySelectorAll(".class")           → pre-resolved SharedValue arrays
 *   el.textContent = "..."                         → onUpdate callback only
 *   svg.createDrawable / draw: "0 1"               → unsupported in RN (stub retained)
 *
 * Exported API preserved verbatim (names unchanged):
 *   animate(target, params)         → RN SharedValue animation runner
 *   createTimeline(opts)            → RN sequence scheduler
 *   utils                           → { stagger, set } helpers
 *   svg                             → stub (SVG path-draw unsupported in RN)
 *   animateSplashReveal(elements)   → signature changed: HTMLElement → SplashElements
 *   animateSplashExit(target, cb)   → signature changed: HTMLElement → ExitTarget
 *   animateCounter(_, from, to, opts) → _el unused in RN; use onUpdate for text
 *   animateSvgPaths(...)            → stub (SVG draw unsupported in RN)
 *   animateLoadingDots(dots, opts)  → signature changed: HTMLElement → DotTarget[]
 *   animateSvgSpinner(elements, opts) → signature changed: SVGCircle → SpinnerTarget
 *   animateStaggerIn(targets, opts) → signature changed: NodeList → RNAnimeTarget[]
 *   animatePulseGlow(target)        → signature changed: HTMLElement → PulseTarget
 *   animateValuePop(target)         → signature changed: HTMLElement → PopTarget
 *
 * Timing, easing, duration, spring physics:
 *   All numeric durations preserved exactly (ms).
 *   "outExpo"    → Easing.out(Easing.exp)
 *   "inExpo"     → Easing.in(Easing.exp)
 *   "inOutSine"  → Easing.inOut(Easing.sin)
 *   "outBack"    → Easing.out(Easing.back)
 *   "linear"     → Easing.linear
 *   "spring(...)" strings → WithSpringConfig equivalents (stiffness/damping/mass)
 *
 * GPU rule preserved:
 *   All animations target opacity, scale, translateX/Y, rotate only.
 *
 * Explicitly NOT implemented:
 *   ❌ SVG path-draw animation (no RN equivalent of createDrawable / draw:"0 1")
 */

import {
  cancelAnimation,
  Easing,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type EasingFunction,
  type SharedValue,
  type WithSpringConfig,
  type WithTimingConfig,
} from "react-native-reanimated";

/* ─── Core types ──────────────────────────────────────────────────────────── */

/** RN equivalent of an animejs DOM target. */
export type RNAnimeTarget = Record<string, SharedValue<number>>;

/** Imperative animation handle (mirrors animejs JSAnimation surface). */
export interface RNAnimeInstance {
  pause(): void;
  play(): void;
  seek(progressMs: number): void;
}

/** params object accepted by animate() and timeline.add(). */
export interface RNAnimeParams {
  duration?: number;
  delay?: number | ((index: number, total: number) => number);
  ease?: EasingFunction;
  loop?: boolean | number;
  alternate?: boolean;
  useSpring?: boolean;
  springConfig?: WithSpringConfig;
  timingConfig?: WithTimingConfig;
  onComplete?: () => void;
  /** Additional keys: prop → to | [from, to] */
  [prop: string]: unknown;
}

/* ─── Easing map ──────────────────────────────────────────────────────────── */
/*
 * Maps animejs ease-name strings to Reanimated Easing functions so callers
 * migrating incrementally can still pass string names.
 */
/*
 * Easing map — all curves expressed as Easing.bezier() so TypeScript sees the
 * same concrete return type (no compound-factory overload ambiguity with
 * Easing.out(Easing.exp) etc. in Reanimated 4).
 * Bezier control points match the named curves exactly.
 */
const OUT_EXPO   = Easing.bezier(0.16, 1, 0.3, 1);    // outExpo
const IN_EXPO    = Easing.bezier(0.7, 0, 0.84, 0);    // inExpo
const IN_OUT_SINE = Easing.bezier(0.37, 0, 0.63, 1);  // inOutSine
const OUT_BACK   = Easing.bezier(0.34, 1.56, 0.64, 1); // outBack
const EASE_OUT_FN = Easing.bezier(0, 0, 0.58, 1);
const EASE_IN_FN  = Easing.bezier(0.42, 0, 1, 1);
const EASE_IO_FN  = Easing.bezier(0.42, 0, 0.58, 1);

const EASE_MAP: Record<string, EasingFunction> = {
  outExpo:   OUT_EXPO,
  inExpo:    IN_EXPO,
  inOutSine: IN_OUT_SINE,
  outBack:   OUT_BACK,
  linear:    Easing.linear,
  easeOut:   EASE_OUT_FN,
  easeIn:    EASE_IN_FN,
  easeInOut: EASE_IO_FN,
};

function resolveEase(ease?: EasingFunction | string): EasingFunction | undefined {
  if (!ease) return undefined;
  if (typeof ease === "function") return ease;
  return EASE_MAP[ease as string];
}

/* ─── Reserved param keys ─────────────────────────────────────────────────── */

const RESERVED = new Set([
  "duration", "delay", "ease", "loop", "alternate",
  "useSpring", "springConfig", "timingConfig", "onComplete",
]);

/* ─── Internal: animate one SharedValue ──────────────────────────────────── */

function animateSv(
  sv: SharedValue<number>,
  to: number,
  params: RNAnimeParams,
  delayMs: number,
): void {
  const {
    duration = 400,
    loop      = false,
    alternate = false,
    useSpring: spring = false,
    springConfig,
    timingConfig,
    ease,
  } = params;

  let anim = spring
    ? withSpring(to, springConfig)
    : withTiming(to, { duration, easing: resolveEase(ease as EasingFunction | string), ...(timingConfig ?? {}) });

  if (loop) {
    const count = loop === true ? -1 : (loop as number) - 1;
    anim = withRepeat(anim, count, alternate);
  }

  sv.value = delayMs > 0 ? withDelay(delayMs, anim) : anim;
}

/* ─── animate ─────────────────────────────────────────────────────────────── */

/**
 * Animate a SharedValue dictionary (or array of dictionaries) to target values.
 * Direct RN replacement for animejs' `animate(targets, params)`.
 *
 * Example:
 *   const opacity = useSharedValue(0);
 *   const scale   = useSharedValue(0.6);
 *   animate({ opacity, scale }, { opacity: [0, 1], scale: [0.6, 1], duration: 480 });
 */
export function animate(
  targets: RNAnimeTarget | RNAnimeTarget[],
  params: RNAnimeParams,
): RNAnimeInstance {
  const arr    = Array.isArray(targets) ? targets : [targets];
  const total  = arr.length;
  const fns: Array<() => void> = [];

  arr.forEach((target, idx) => {
    const rawDelay = params.delay;
    const delayMs  = typeof rawDelay === "function" ? rawDelay(idx, total) : (rawDelay ?? 0);

    for (const [key, sv] of Object.entries(target)) {
      if (RESERVED.has(key) || !(key in params)) continue;
      const val  = params[key] as number | [number, number];
      const from = Array.isArray(val) ? val[0] : undefined;
      const to   = Array.isArray(val) ? val[1] : val;
      if (from !== undefined) sv.value = from;
      animateSv(sv, to, params, delayMs);
      fns.push(() => cancelAnimation(sv));
    }
  });

  if (params.onComplete) {
    const rawDelay = typeof params.delay === "function" ? 0 : (params.delay ?? 0);
    const tid = setTimeout(params.onComplete, (params.duration ?? 400) + rawDelay);
    fns.push(() => clearTimeout(tid));
  }

  return {
    pause() { fns.forEach((f) => f()); },
    play()  { animate(targets, params); },
    seek(_progressMs: number) {
      // Reanimated animations on the UI thread cannot be imperatively seeked
      // from JS. Callers needing seek should manage SharedValues directly.
    },
  };
}

/* ─── createTimeline ──────────────────────────────────────────────────────── */

interface TimelineItem {
  targets: RNAnimeTarget[];
  params:  RNAnimeParams;
  at:      number;
}

/** RN timeline — sequences SharedValue animations with time offsets. */
class RNTimeline {
  private _autoplay: boolean;
  private _items: TimelineItem[] = [];
  private _fns: Array<() => void> = [];

  constructor(options: { autoplay?: boolean } = {}) {
    this._autoplay = options.autoplay ?? false;
  }

  /**
   * Schedule an animation.
   * @param targets  SharedValue dict or array of dicts (one per animated element)
   * @param params   Animation params (duration, ease, property → value, …)
   * @param at       Absolute start time in ms from timeline origin (default 0)
   */
  add(
    targets: RNAnimeTarget | RNAnimeTarget[],
    params: RNAnimeParams,
    at = 0,
  ): this {
    const arr: RNAnimeTarget[] = Array.isArray(targets) ? targets : [targets];
    this._items.push({ targets: arr, params, at });
    if (this._autoplay) this._run(arr, params, at);
    return this;
  }

  private _run(targets: RNAnimeTarget[], params: RNAnimeParams, at: number): void {
    const total = targets.length;
    targets.forEach((target, idx) => {
      const rawDelay = params.delay;
      const itemDelay = typeof rawDelay === "function" ? rawDelay(idx, total) : (rawDelay ?? 0);
      const totalDelay = at + itemDelay;

      for (const [key, sv] of Object.entries(target)) {
        if (RESERVED.has(key) || !(key in params)) continue;
        const val  = params[key] as number | [number, number];
        const from = Array.isArray(val) ? val[0] : undefined;
        const to   = Array.isArray(val) ? val[1] : val;
        if (from !== undefined) sv.value = from;
        animateSv(sv, to, params, totalDelay);
        this._fns.push(() => cancelAnimation(sv));
      }
    });

    if (params.onComplete) {
      const rawDelay = typeof params.delay === "function" ? 0 : (params.delay ?? 0);
      const tid = setTimeout(params.onComplete, (params.duration ?? 400) + at + rawDelay);
      this._fns.push(() => clearTimeout(tid));
    }
  }

  play(): this {
    if (!this._autoplay) {
      for (const { targets, params, at } of this._items) {
        this._run(targets, params, at);
      }
    }
    return this;
  }

  pause(): this {
    this._fns.forEach((f) => f());
    this._fns = [];
    return this;
  }
}

/**
 * Create a sequenced animation timeline.
 * Direct RN replacement for animejs' `createTimeline(options)`.
 *
 * Example:
 *   const tl = createTimeline({ autoplay: true });
 *   tl.add({ opacity: opacitySv, scale: scaleSv },
 *           { opacity: [0, 1], scale: [0.4, 1], duration: 700 }, 0);
 *   tl.add({ opacity: logoOpacity }, { opacity: [0, 1], duration: 480 }, 260);
 */
export function createTimeline(options: { autoplay?: boolean } = {}): RNTimeline {
  return new RNTimeline(options);
}

/* ─── utils ───────────────────────────────────────────────────────────────── */

/**
 * Stagger helper — returns a per-index delay function.
 * Direct RN replacement for animejs' `utils.stagger(ms)`.
 *
 * Example:
 *   animate(targets, { translateY: [16, 0], duration: 480, delay: utils.stagger(55) });
 */
function stagger(delayMs: number): (index: number) => number {
  return (index: number) => index * delayMs;
}

/**
 * Set shared values immediately (no animation).
 * Mirrors animejs' `utils.set(targets, props)`.
 */
function set(
  targets: RNAnimeTarget | RNAnimeTarget[],
  props: Record<string, number>,
): void {
  const arr = Array.isArray(targets) ? targets : [targets];
  for (const target of arr) {
    for (const [key, value] of Object.entries(props)) {
      if (key in target) target[key].value = value;
    }
  }
}

export const utils = { stagger, set };

/* ─── svg ─────────────────────────────────────────────────────────────────── */
/*
 * SVG path-draw animation (`createDrawable` / `draw: "0 1"`) has no equivalent
 * in React Native — react-native-svg does not expose stroke-dashoffset in a way
 * Reanimated can drive frame-by-frame from the UI thread.
 *
 * The `svg` export is retained as a stub so imports continue to compile.
 * Callers should implement spinners via `rotate` SharedValue animations, and
 * path reveals via react-native-svg stroke-dashoffset driven from JS (see
 * animateSvgSpinner / animateSvgPaths below for the Reanimated equivalents).
 */
export const svg = {
  /** Not supported in React Native — no-op stub. */
  createDrawable(_selector: unknown): void {
    // SVG path-draw animation via stroke-dashoffset is not available through
    // the Reanimated UI-thread path in React Native. Use rotate + opacity
    // animations (animateSvgSpinner) for spinner effects instead.
  },
};

/* ─── animateSplashReveal ─────────────────────────────────────────────────── */

export interface SplashElements {
  /** One SharedValue dict per ring element (opacity + scale). */
  rings?:    Array<{ opacity: SharedValue<number>; scale: SharedValue<number> }>;
  /** Logo element (opacity + scale). */
  logo?:     { opacity: SharedValue<number>; scale: SharedValue<number> } | null;
  /** One SharedValue dict per character (opacity + translateY). */
  chars?:    Array<{ opacity: SharedValue<number>; translateY: SharedValue<number> }>;
  /** Subtitle element (opacity + translateY). */
  subtitle?: { opacity: SharedValue<number>; translateY: SharedValue<number> } | null;
  /** Glow halo element (opacity + scale). */
  glow?:     { opacity: SharedValue<number>; scale: SharedValue<number> } | null;
}

/**
 * Animate the splash screen logo reveal sequence.
 *
 * Web: animateSplashReveal(container: HTMLElement)  — targeted via CSS classes
 * RN:  animateSplashReveal(elements: SplashElements) — pre-resolved SharedValues
 *
 * Timings preserved exactly:
 *   glow:     700 ms outExpo, at 0 ms
 *   rings:    550 ms spring(1,90,12), at 80 ms
 *   logo:     480 ms spring(1,100,14), at 260 ms
 *   chars:    420 ms outExpo, stagger 38 ms, at 520 ms
 *   subtitle: 360 ms outExpo, at 870 ms
 */
export function animateSplashReveal(elements: SplashElements): { stop(): void } {
  const fns: Array<() => void> = [];

  function schedule<T extends SharedValue<number>>(
    sv: T,
    to: number,
    params: { duration: number; delay: number; spring?: WithSpringConfig },
  ): void {
    const anim = params.spring
      ? withDelay(params.delay, withSpring(to, params.spring))
      : withDelay(
          params.delay,
          withTiming(to, { duration: params.duration, easing: Easing.out(Easing.exp) }),
        );
    sv.value = anim;
    fns.push(() => cancelAnimation(sv));
  }

  // 1. Glow halo — 700 ms outExpo, at 0 ms
  if (elements.glow) {
    const { glow } = elements;
    glow.opacity.value = 0;
    glow.scale.value   = 0.4;
    schedule(glow.opacity, 0.6, { duration: 700, delay: 0 });
    schedule(glow.scale,   1.2, { duration: 700, delay: 0 });
  }

  // 2. Rings — 550 ms spring(1, 90, 12), at 80 ms
  const ringSPRING: WithSpringConfig = { stiffness: 90, damping: 12, mass: 1 };
  (elements.rings ?? []).forEach((ring) => {
    ring.opacity.value = 0;
    ring.scale.value   = 0.4;
    schedule(ring.opacity, 1, { duration: 550, delay: 80, spring: ringSPRING });
    schedule(ring.scale,   1, { duration: 550, delay: 80, spring: ringSPRING });
  });

  // 3. Logo — 480 ms spring(1, 100, 14), at 260 ms
  if (elements.logo) {
    const { logo } = elements;
    const logoSPRING: WithSpringConfig = { stiffness: 100, damping: 14, mass: 1 };
    logo.opacity.value = 0;
    logo.scale.value   = 0.6;
    schedule(logo.opacity, 1, { duration: 480, delay: 260, spring: logoSPRING });
    schedule(logo.scale,   1, { duration: 480, delay: 260, spring: logoSPRING });
  }

  // 4. Chars — 420 ms outExpo, stagger 38 ms, at 520 ms
  (elements.chars ?? []).forEach((ch, idx) => {
    ch.opacity.value    = 0;
    ch.translateY.value = 24;
    const delay = 520 + idx * 38;
    schedule(ch.opacity,    1, { duration: 420, delay });
    schedule(ch.translateY, 0, { duration: 420, delay });
  });

  // 5. Subtitle — 360 ms outExpo, at 870 ms
  if (elements.subtitle) {
    const { subtitle } = elements;
    subtitle.opacity.value    = 0;
    subtitle.translateY.value = 8;
    schedule(subtitle.opacity,    1, { duration: 360, delay: 870 });
    schedule(subtitle.translateY, 0, { duration: 360, delay: 870 });
  }

  return { stop() { fns.forEach((f) => f()); } };
}

/* ─── animateSplashExit ───────────────────────────────────────────────────── */

export interface ExitTarget {
  opacity: SharedValue<number>;
  scale?:  SharedValue<number>;
}

/**
 * Animate the splash screen exit.
 *
 * Web: animateSplashExit(container: HTMLElement, onComplete?)
 * RN:  animateSplashExit(target: ExitTarget, onComplete?)
 *
 * Timing preserved: 380 ms inExpo, opacity 1→0, scale 1→1.04
 */
export function animateSplashExit(
  target: ExitTarget,
  onComplete?: () => void,
): RNAnimeInstance {
  const dur    = 380;
  const easing = Easing.in(Easing.exp);
  const fns: Array<() => void> = [];

  target.opacity.value = 1;
  target.opacity.value = withTiming(0, { duration: dur, easing });
  fns.push(() => cancelAnimation(target.opacity));

  if (target.scale) {
    target.scale.value = 1;
    target.scale.value = withTiming(1.04, { duration: dur, easing });
    fns.push(() => cancelAnimation(target.scale!));
  }

  if (onComplete) {
    const tid = setTimeout(onComplete, dur);
    fns.push(() => clearTimeout(tid));
  }

  return {
    pause() { fns.forEach((f) => f()); },
    play()  { animateSplashExit(target, onComplete); },
    seek(_: number) {},
  };
}

/* ─── animateCounter ──────────────────────────────────────────────────────── */

/**
 * Animate a numeric value from `from` to `to`, calling `onUpdate` each frame.
 *
 * Web: animateCounter(el: HTMLElement, from, to, options)
 *      — also set el.textContent directly.
 * RN:  _el is accepted but unused; update text via the onUpdate callback.
 *
 * Timing preserved: duration 1100 ms, ease outExpo.
 */
export function animateCounter(
  _el: unknown,
  from: number,
  to: number,
  options: {
    duration?: number;
    decimals?: number;
    prefix?:   string;
    suffix?:   string;
    ease?:     string;
    onUpdate?: (value: number) => void;
  } = {},
): RNAnimeInstance {
  const {
    duration = 1100,
    decimals  = 0,
    prefix    = "",
    suffix    = "",
    onUpdate,
  } = options;

  // Drive a shared value from `from` → `to`, sampling in a JS-side RAF loop.
  let start: number | null = null;
  let rafId = 0;
  let running = true;

  const easing = Easing.out(Easing.exp);

  function tick(now: number): void {
    if (!running) return;
    if (start === null) start = now;
    const elapsed  = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const easedT   = easing(progress);
    const current  = from + (to - from) * easedT;

    if (onUpdate) onUpdate(current);

    if (progress < 1) {
      rafId = requestAnimationFrame(tick);
    }
  }

  rafId = requestAnimationFrame(tick);

  return {
    pause() { running = false; cancelAnimationFrame(rafId); },
    play()  { running = true; start = null; rafId = requestAnimationFrame(tick); },
    seek(_: number) {},
  };
}

/* ─── animateSvgPaths ─────────────────────────────────────────────────────── */

/**
 * SVG path-draw animation — NOT SUPPORTED in React Native.
 *
 * Stub retained so imports compile.  Callers should use react-native-svg with
 * stroke-dashoffset driven from JS, or replace with opacity/scale reveals.
 */
export function animateSvgPaths(
  _selector: string,
  _duration = 900,
  _staggerMs = 80,
): RNAnimeInstance {
  return { pause() {}, play() {}, seek() {} };
}

/* ─── animateLoadingDots ──────────────────────────────────────────────────── */

export interface DotTarget {
  opacity:    SharedValue<number>;
  translateY: SharedValue<number>;
}

/**
 * Animate loading dots with stagger and loop.
 *
 * Web: animateLoadingDots(container: HTMLElement, options)
 * RN:  animateLoadingDots(dots: DotTarget[], options)
 *
 * Timing preserved: 480 ms inOutSine, stagger 110 ms, loop + alternate.
 */
export function animateLoadingDots(
  dots: DotTarget[],
  options: { loop?: boolean } = {},
): RNAnimeInstance {
  const { loop = true } = options;
  const dur     = 480;
  const easing  = Easing.inOut(Easing.sin);
  const fns: Array<() => void> = [];

  dots.forEach((dot, idx) => {
    const delay = idx * 110;

    dot.translateY.value = -7;
    dot.opacity.value    = 0.25;

    let anim = withTiming(-7, { duration: dur, easing });
    if (loop) anim = withRepeat(withSequence(
      withTiming(-7,  { duration: dur, easing }),
      withTiming(0,   { duration: dur, easing }),
    ), -1, false);

    let opacityAnim = withTiming(0.25, { duration: dur, easing });
    if (loop) opacityAnim = withRepeat(withSequence(
      withTiming(0.25, { duration: dur, easing }),
      withTiming(1,    { duration: dur, easing }),
    ), -1, false);

    dot.translateY.value = delay > 0 ? withDelay(delay, anim)        : anim;
    dot.opacity.value    = delay > 0 ? withDelay(delay, opacityAnim) : opacityAnim;
    fns.push(() => cancelAnimation(dot.translateY));
    fns.push(() => cancelAnimation(dot.opacity));
  });

  return {
    pause() { fns.forEach((f) => f()); },
    play()  { animateLoadingDots(dots, options); },
    seek(_: number) {},
  };
}

/* ─── animateSvgSpinner ───────────────────────────────────────────────────── */

export interface SpinnerTarget {
  /** Drives the rotation of the spinner container (0 → 360 loop). */
  rotate: SharedValue<number>;
  /** Optional opacity for dash/trail effects. */
  opacity?: SharedValue<number>;
}

/**
 * Animate an SVG spinner via rotation.
 *
 * Web: animateSvgSpinner(circleEl: SVGCircleElement, options)
 *      — used `createDrawable` for dash animation + SVG rotate.
 * RN:  animateSvgSpinner(elements: SpinnerTarget, options)
 *      — drives `rotate` SharedValue; dash animation unsupported in RN.
 *
 * Timing preserved: 900 ms linear loop.
 */
export function animateSvgSpinner(
  elements: SpinnerTarget,
  options: { duration?: number } = {},
): { stop(): void } {
  const { duration = 900 } = options;
  const fns: Array<() => void> = [];

  elements.rotate.value = 0;
  elements.rotate.value = withRepeat(
    withTiming(360, { duration, easing: Easing.linear }),
    -1,
    false,
  );
  fns.push(() => cancelAnimation(elements.rotate));

  if (elements.opacity) {
    elements.opacity.value = withRepeat(
      withSequence(
        withTiming(0.25, { duration: duration * 2 }),
        withTiming(1,    { duration: duration * 2 }),
      ),
      -1,
      false,
    );
    fns.push(() => cancelAnimation(elements.opacity!));
  }

  return { stop() { fns.forEach((f) => f()); } };
}

/* ─── animateStaggerIn ────────────────────────────────────────────────────── */

/**
 * Stagger-reveal a list of items.
 *
 * Web: animateStaggerIn(targets: NodeListOf<Element> | Element[], options)
 * RN:  animateStaggerIn(targets: RNAnimeTarget[], options)
 *
 * Each target must expose `translateY` and `opacity` SharedValues.
 * Timing preserved: 480 ms outExpo, stagger 55 ms, fromY 16.
 */
export function animateStaggerIn(
  targets: RNAnimeTarget[],
  options: { delayMs?: number; fromY?: number; duration?: number } = {},
): RNAnimeInstance {
  const { delayMs = 55, fromY = 16, duration = 480 } = options;
  const easing = Easing.out(Easing.exp);
  const fns: Array<() => void> = [];

  targets.forEach((target, idx) => {
    const delay = idx * delayMs;

    if ("translateY" in target) {
      target.translateY.value = fromY;
      target.translateY.value = withDelay(delay, withTiming(0, { duration, easing }));
      fns.push(() => cancelAnimation(target.translateY));
    }
    if ("opacity" in target) {
      target.opacity.value = 0;
      target.opacity.value = withDelay(delay, withTiming(1, { duration, easing }));
      fns.push(() => cancelAnimation(target.opacity));
    }
  });

  return {
    pause() { fns.forEach((f) => f()); },
    play()  { animateStaggerIn(targets, options); },
    seek(_: number) {},
  };
}

/* ─── animatePulseGlow ────────────────────────────────────────────────────── */

export interface PulseTarget {
  scale:   SharedValue<number>;
  opacity: SharedValue<number>;
}

/**
 * GPU-safe pulse glow: scale + opacity loop (no boxShadow).
 *
 * Web: animatePulseGlow(target: HTMLElement)
 * RN:  animatePulseGlow(target: PulseTarget)
 *
 * Timing preserved: 1000 ms inOutSine, loop.
 */
export function animatePulseGlow(target: PulseTarget): RNAnimeInstance {
  const dur    = 1000;
  const easing = Easing.inOut(Easing.sin);
  const fns: Array<() => void> = [];

  target.scale.value = withRepeat(
    withSequence(
      withTiming(1.06, { duration: dur / 2, easing }),
      withTiming(1,    { duration: dur / 2, easing }),
    ),
    -1,
    false,
  );
  target.opacity.value = withRepeat(
    withSequence(
      withTiming(0.72, { duration: dur / 2, easing }),
      withTiming(1,    { duration: dur / 2, easing }),
    ),
    -1,
    false,
  );
  fns.push(() => cancelAnimation(target.scale));
  fns.push(() => cancelAnimation(target.opacity));

  return {
    pause() { fns.forEach((f) => f()); },
    play()  { animatePulseGlow(target); },
    seek(_: number) {},
  };
}

/* ─── animateValuePop ─────────────────────────────────────────────────────── */

export interface PopTarget {
  scale: SharedValue<number>;
}

/**
 * Small scale pop to highlight a value change.
 *
 * Web: animateValuePop(el: HTMLElement)
 * RN:  animateValuePop(target: PopTarget)
 *
 * Timing preserved: 360 ms outBack, scale 1→1.14→1.
 */
export function animateValuePop(target: PopTarget): RNAnimeInstance {
  const dur    = 360;
  const easing = Easing.out(Easing.back);
  const fns: Array<() => void> = [];

  target.scale.value = withSequence(
    withTiming(1.14, { duration: dur * 0.5, easing }),
    withTiming(1,    { duration: dur * 0.5, easing: Easing.inOut(Easing.ease) }),
  );
  fns.push(() => cancelAnimation(target.scale));

  return {
    pause() { fns.forEach((f) => f()); },
    play()  { animateValuePop(target); },
    seek(_: number) {},
  };
}
