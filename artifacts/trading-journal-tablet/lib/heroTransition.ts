/**
 * lib/heroTransition.ts — React Native
 *
 * Migration of: artifacts/trading-journal/src/lib/heroTransition.ts
 * Phase 12.5 — Splash Screen & Transition Infrastructure
 *
 * Web → RN replacements:
 *   DOMRect  → LayoutRectangle (react-native)
 *             DOMRect is a browser-only type; React Native's layout system
 *             exposes the same bounding-box data (x, y, width, height) via
 *             measure() / onLayout callbacks as LayoutRectangle.
 *             Public API shape is preserved: key + rect in, key + rect out.
 *
 * Architecture is unchanged:
 *   Module-level variables (not Zustand / React state) because the rect is
 *   consumed exactly once per navigation — not subscribed to reactively.
 *   setHeroRect writes immediately before navigation.
 *   consumeHeroRect reads and clears once on destination mount.
 *
 * Usage in React Native:
 *   Source component (before navigation):
 *     ref.current?.measure((x, y, width, height, pageX, pageY) => {
 *       setHeroRect(key, { x: pageX, y: pageY, width, height });
 *       router.push(destination);
 *     });
 *
 *   Destination component (on mount):
 *     const rect = consumeHeroRect(key); // null if no pending transition
 *     if (rect) { // start animation from rect }
 */
import type { LayoutRectangle } from "react-native";

let _rect: LayoutRectangle | null = null;
let _key:  string | null          = null;

/** Record the source element's bounding rect immediately before navigating. */
export function setHeroRect(key: string, rect: LayoutRectangle): void {
  _rect = rect;
  _key  = key;
}

/**
 * Read the stored rect for the given key and clear it.
 * Returns null when no rect is stored or the key does not match.
 * After reading, the value is cleared so it is consumed only once per
 * navigation.
 */
export function consumeHeroRect(key: string): LayoutRectangle | null {
  if (_key !== key || !_rect) return null;
  const r = _rect;
  _rect = null;
  _key  = null;
  return r;
}
