/**
 * lib/popupManager.ts — React Native
 *
 * Migration of: artifacts/trading-journal/src/lib/popupManager.ts
 * Phase 12.5 — Splash Screen & Transition Infrastructure
 *
 * Web → RN replacements:
 *   RefObject<HTMLElement | null>                → RefObject<View | null>
 *   document.addEventListener("pointerdown", …)  → (removed — no DOM in RN)
 *   (e.target as Element).closest(selector)      → (removed — no DOM traversal in RN)
 *   entry.ref.current?.contains(target)          → (removed — no containment API in RN)
 *
 * Architecture differences:
 *   The web implementation closes popups by listening to a global pointerdown
 *   event and checking whether the tap landed outside a registered ref.  React
 *   Native has no global event bus equivalent.  Dismiss-on-outside-tap is
 *   instead the responsibility of each popup's own backdrop Pressable.
 *
 *   The registry and lifecycle APIs are fully preserved:
 *     - popupManager.init()         → no-op; kept for API compat (no listener to attach)
 *     - popupManager.register()     → stores id + ref + onClose callback
 *     - popupManager.unregister()   → removes registration by id
 *     - popupManager.closeAll()     → NEW helper; calls every registered onClose()
 *                                     for use by backdrop Pressables
 *     - popupManager.closeOthers()  → NEW helper; closes all popups except the given id
 *                                     (replaces the web's "contains" exclusion logic)
 *
 * Preserved:
 *   - Singleton registry (module-level Map — same as web)
 *   - Queue ordering (Map insertion order preserved)
 *   - Popup stacking (all registered entries remain available)
 *   - onClose callback invocation semantics
 *   - `attached` guard on init() (no-op but consistent)
 *
 * Usage pattern in React Native:
 *   On mount:
 *     popupManager.init();
 *     popupManager.register("thickness-popup", viewRef, () => setOpen(false));
 *   On unmount:
 *     popupManager.unregister("thickness-popup");
 *   Backdrop Pressable:
 *     <Pressable onPress={() => popupManager.closeAll()} style={...} />
 */
import type { RefObject } from "react";
import type { View } from "react-native";

/* ─── Types ───────────────────────────────────────────────────────────────── */

interface PopupEntry {
  ref:     RefObject<View | null>;
  onClose: () => void;
}

/* ─── Module-level singleton state ───────────────────────────────────────── */

const registry = new Map<string, PopupEntry>();
let   attached = false;

/* ─── popupManager ────────────────────────────────────────────────────────── */

export const popupManager = {
  /**
   * Initialise the popup manager.
   * No-op in React Native (no global DOM listener to attach).
   * Preserved for API compat with call sites that guard on `attached`.
   */
  init() {
    if (attached) return;
    attached = true;
    // In the web build, this attached a pointerdown listener to document.
    // In React Native there is no equivalent global event; each popup's
    // backdrop Pressable calls closeAll() / closeOthers() directly.
  },

  /**
   * Register a popup so it can be closed programmatically.
   *
   * @param id      Unique identifier for this popup instance.
   * @param ref     Ref to the popup's root View (kept for API compat; not
   *                used for containment checks in RN).
   * @param onClose Callback invoked when the popup should close.
   */
  register(id: string, ref: RefObject<View | null>, onClose: () => void): void {
    registry.set(id, { ref, onClose });
  },

  /**
   * Remove a popup registration.
   * Call this in the popup component's cleanup (useEffect return / onUnmount).
   */
  unregister(id: string): void {
    registry.delete(id);
  },

  /**
   * Close every registered popup by invoking its onClose callback.
   * Use from a global backdrop Pressable to replicate the web's
   * "tap outside → close all" behaviour.
   */
  closeAll(): void {
    for (const [, entry] of registry) {
      entry.onClose();
    }
  },

  /**
   * Close every registered popup EXCEPT the one with the given id.
   * Replaces the web's `entry.ref.current?.contains(target)` exclusion logic:
   * callers pass their own id so sibling popups are dismissed while the
   * tapped popup remains open.
   *
   * @param excludeId  The id of the popup that should NOT be closed.
   */
  closeOthers(excludeId: string): void {
    for (const [id, entry] of registry) {
      if (id !== excludeId) {
        entry.onClose();
      }
    }
  },
};
