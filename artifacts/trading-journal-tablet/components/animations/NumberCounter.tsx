/**
 * components/animations/NumberCounter.tsx — React Native (Reanimated)
 *
 * Migration of: artifacts/trading-journal/src/components/animations/NumberCounter.tsx
 * Phase 12.3 — Animation Primitive Wrappers (React → React Native)
 *
 * Web → RN replacements:
 *   IntersectionObserver viewport  → mount-triggered animation (no scroll intersection in RN;
 *                                    `once` and `inView`-style behaviour preserved via ref)
 *   el.textContent = "..."         → setState (animateCounter RN uses onUpdate callback)
 *   _el param (HTMLElement)        → null (unused in RN animateCounter)
 *   <span>                         → <Text>
 *   className                      → preserved in interface; unused in RN
 *   style: React.CSSProperties     → style: StyleProp<TextStyle>
 *
 * All animation timing, easing, formatting, prefix/suffix, and decimals preserved.
 * `once=true`  → animate on mount once; skip re-animation when deps change.
 * `once=false` → re-animate whenever `target` (to/value) changes.
 * `delay`      → setTimeout before starting animateCounter, same as web.
 *
 * Easing note: animateCounter RN always uses Easing.out(Easing.exp) (outExpo),
 *   matching the web's default ease="outExpo". The `ease` prop is preserved in
 *   the interface but custom ease strings have no effect (same as web's animejs
 *   default, which was "outExpo" for this component).
 */
import React, { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import type { StyleProp, TextStyle } from "react-native";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { animateCounter, type RNAnimeInstance } from "@/animations/anime";

/* ─── Types ───────────────────────────────────────────────────────────────── */

interface NumberCounterProps {
  /** Target value to count to. */
  to?:        number;
  /** Alias for `to` — for call sites that pass `value`. */
  value?:     number;
  /** Start value. Default: 0 */
  from?:      number;
  /** Decimal places. Default: 0 */
  decimals?:  number;
  /** Text before the number (e.g. "$") */
  prefix?:    string;
  /** Text after the number (e.g. "%") */
  suffix?:    string;
  /** Animation duration in ms. Default: 1100 */
  duration?:  number;
  /** Easing name. Default: "outExpo" (preserved; RN always uses outExpo). */
  ease?:      string;
  /** Delay before animation starts (ms). Default: 0 */
  delay?:     number;
  /** Animate only once on mount. Default: true. */
  once?:      boolean;
  /** Preserved for API compatibility; unused in RN. */
  className?: string;
  style?:     StyleProp<TextStyle>;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function formatNumber(val: number, decimals: number, prefix: string, suffix: string): string {
  const body = decimals > 0
    ? val.toFixed(decimals)
    : Math.round(val).toLocaleString();
  return `${prefix}${body}${suffix}`;
}

/* ─── Component ───────────────────────────────────────────────────────────── */

export function NumberCounter({
  to,
  value,
  from     = 0,
  decimals = 0,
  prefix   = "",
  suffix   = "",
  duration = 1100,
  ease     = "outExpo",
  delay    = 0,
  once     = true,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  className,
  style,
}: NumberCounterProps) {
  const target  = to ?? value ?? 0;
  const reduced = useReducedMotion();
  const played  = useRef(false);

  // Final formatted value shown immediately (reduced-motion / initial render).
  const finalText = formatNumber(target, decimals, prefix, suffix);

  const [displayText, setDisplayText] = useState(finalText);

  // Sync to new target when it changes externally (and animation is not running).
  useEffect(() => {
    if (reduced) {
      setDisplayText(finalText);
    }
  }, [reduced, finalText]);

  useEffect(() => {
    if (reduced) {
      setDisplayText(finalText);
      return;
    }

    // `once=true` → only animate on the first mount.
    if (once && played.current) return;
    played.current = true;

    let instance: RNAnimeInstance | null = null;
    let cancelled = false;

    const tid = setTimeout(() => {
      if (cancelled) return;
      instance = animateCounter(null, from, target, {
        duration,
        decimals,
        prefix,
        suffix,
        ease,
        onUpdate: (val) => {
          setDisplayText(formatNumber(val, decimals, prefix, suffix));
        },
      });
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(tid);
      instance?.pause();
    };
  // `once` controls whether re-runs happen on dep change; `played` ref enforces it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [once ? null : target, from, decimals, prefix, suffix, duration, ease, delay, reduced]);

  return (
    <Text style={style}>
      {displayText}
    </Text>
  );
}
