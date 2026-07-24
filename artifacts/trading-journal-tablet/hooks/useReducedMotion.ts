/**
 * hooks/useReducedMotion.ts — React Native
 *
 * Migration of: artifacts/trading-journal/src/hooks/useReducedMotion.ts
 * Phase 12.2 — Core Animation Engine Rewrite (Framer Motion → Reanimated)
 *
 * Web → RN replacements:
 *   window.matchMedia("(prefers-reduced-motion: reduce)")
 *                  → AccessibilityInfo.isReduceMotionEnabled() +
 *                    AccessibilityInfo.addEventListener("reduceMotionChanged", ...)
 *
 * Hook signature preserved verbatim:
 *   useReducedMotion(): boolean
 *
 * Behaviour preserved:
 *   • Returns true when the OS accessibility "Reduce Motion" setting is on.
 *   • Updates reactively when the setting changes (no app restart needed).
 *   • Initial state is synchronously false while the async OS query is in
 *     flight — same as the web version whose useState initialiser returns
 *     false when window is undefined (SSR) or the media query hasn't resolved.
 */

import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Returns true when the user has requested reduced motion.
 * All Reanimated / imperative animation helpers should respect this.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Async initial read — sets state once resolved.
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduced(value);
    });

    // Live updates when the user toggles the OS setting.
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (isEnabled) => {
        if (mounted) setReduced(isEnabled);
      },
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
