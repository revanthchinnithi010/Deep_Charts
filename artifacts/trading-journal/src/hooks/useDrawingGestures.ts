/**
 * useDrawingGestures
 *
 * A single-instance, pointer-ID-scoped gesture state machine for the drawing overlay.
 * Returns `startGesture(e, callbacks, options?)` — call it from any pointerdown
 * handler.  The hook owns its window-level move / up / cancel listeners and cleans
 * them up automatically when the gesture resolves or is cancelled.
 *
 * State machine:
 *
 *   idle ──(pointerdown)──► pressed
 *   pressed ──(hold ≥ longPressMs, dist < tapMaxDist)──► long_press  → idle
 *   pressed ──(dist ≥ panMinDist)──────────────────────► pan
 *   pressed ──(pointerup, dist < tapMaxDist)───────────► tap          → idle
 *   pan     ──(pointerup)──────────────────────────────► idle
 *   any     ──(pointercancel | cancelActive())─────────► idle
 *
 * Gesture synchronization rules enforced here:
 *   • Long-press timer is cancelled the moment movement exceeds tapMaxDist.
 *   • Pan suppresses tap — if the gesture ever enters "pan", tap is never fired.
 *   • Only one gesture is tracked at a time — starting a new one cancels the previous.
 *   • pointercancel (e.g. incoming call, browser scroll takeover) always resolves cleanly.
 */

import { useRef, useCallback, useEffect } from "react";

// ── Public types ───────────────────────────────────────────────────────────────

export type GesturePhase = "idle" | "pressed" | "pan" | "long_press";

export interface GestureCallbacks {
  /** Fired on a clean pointer-up with movement below tapMaxDist. */
  onTap?: (e: PointerEvent) => void;
  /**
   * Fired once when movement first exceeds panMinDist.
   * The caller's own window pointermove handler tracks subsequent pan moves —
   * the gesture hook does not forward individual move events.
   */
  onPanStart?: (e: PointerEvent) => void;
  /**
   * Fired after the pointer holds still for ≥ longPressMs without exceeding
   * tapMaxDist.  The long-press timer is cancelled the moment movement goes
   * beyond tapMaxDist, so long_press and pan are mutually exclusive.
   */
  onLongPress?: (e: PointerEvent) => void;
  /** Fired on pointercancel or explicit cancelActive(). */
  onCancel?: () => void;
}

export interface GestureOptions {
  /**
   * Maximum movement (px) for tap / long-press to be recognized.
   * Default: 6 px (mouse/stylus) or 12 px (touch).
   */
  tapMaxDist?: number;
  /** Minimum movement (px) before onPanStart fires. Default: 4. */
  panMinDist?: number;
  /** Hold duration (ms) before onLongPress fires. Default: 500. */
  longPressMs?: number;
}

// ── Internal state (one per active gesture) ────────────────────────────────────

interface ActiveGesture {
  pointerId:  number;
  startX:     number;
  startY:     number;
  startEvent: PointerEvent;
  phase:      GesturePhase;
  timer:      ReturnType<typeof setTimeout> | null;
  tapMax:     number;
  panMin:     number;
  callbacks:  GestureCallbacks;
  cleanup:    () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDrawingGestures() {
  const activeRef = useRef<ActiveGesture | null>(null);

  // Ensure any in-flight gesture is cancelled on unmount.
  useEffect(() => {
    return () => {
      const g = activeRef.current;
      if (g) {
        if (g.timer !== null) clearTimeout(g.timer);
        g.cleanup();
        activeRef.current = null;
      }
    };
  }, []);

  /** Cancel the currently active gesture without firing any callback. */
  const cancelActive = useCallback(() => {
    const g = activeRef.current;
    if (!g) return;
    if (g.timer !== null) { clearTimeout(g.timer); g.timer = null; }
    g.cleanup();
    const onCancel = g.callbacks.onCancel;
    activeRef.current = null;
    onCancel?.();
  }, []);

  /**
   * Begin tracking a gesture starting at the given pointerdown event.
   * If a gesture is already active it is cancelled first.
   */
  const startGesture = useCallback((
    rawEvent: PointerEvent | React.PointerEvent<Element>,
    callbacks: GestureCallbacks,
    options?: GestureOptions,
  ) => {
    // Cancel any previous in-flight gesture before arming a new one.
    if (activeRef.current) cancelActive();

    const e       = rawEvent as PointerEvent;
    const isTouch = e.pointerType === "touch";
    const tapMax  = options?.tapMaxDist  ?? (isTouch ? 12 : 6);
    const panMin  = options?.panMinDist  ?? 4;
    const lpMs    = options?.longPressMs ?? 500;

    const g: ActiveGesture = {
      pointerId:  e.pointerId,
      startX:     e.clientX,
      startY:     e.clientY,
      startEvent: e,
      phase:      "pressed",
      timer:      null,
      tapMax,
      panMin,
      callbacks,
      cleanup:    () => {}, // overwritten below after listeners are created
    };

    // ── Long-press timer ──────────────────────────────────────────────────────
    // Fires only if pointer remains within tapMaxDist for the full duration.
    g.timer = setTimeout(() => {
      g.timer = null;
      // Guard: another gesture may have started and replaced activeRef.current
      if (activeRef.current !== g || g.phase !== "pressed") return;
      g.phase = "long_press";
      g.cleanup();           // remove window listeners — gesture is resolved
      activeRef.current = null;
      callbacks.onLongPress?.(g.startEvent);
    }, lpMs);

    // ── Window-level move listener ────────────────────────────────────────────
    // Tracks whether the pointer has moved far enough to suppress long-press or
    // trigger pan.  Individual pan-move deltas are NOT forwarded — the caller's
    // own move handler (the global cursor-mode pointermove effect) handles those.
    const onMove = (me: PointerEvent) => {
      if (me.pointerId !== g.pointerId || activeRef.current !== g) return;
      const dist = Math.hypot(me.clientX - g.startX, me.clientY - g.startY);

      if (g.phase === "pressed") {
        if (dist >= tapMax && g.timer !== null) {
          // Moved beyond tap zone — long press cannot fire; cancel its timer.
          clearTimeout(g.timer);
          g.timer = null;
        }
        if (dist >= panMin) {
          g.phase = "pan";
          callbacks.onPanStart?.(me);
        }
      }
      // "pan" phase: no further state changes needed here
    };

    // ── Window-level up listener ──────────────────────────────────────────────
    // Uses capture phase so it fires even if LWC has captured the pointer.
    const onUp = (ue: PointerEvent) => {
      if (ue.pointerId !== g.pointerId || activeRef.current !== g) return;
      if (g.timer !== null) { clearTimeout(g.timer); g.timer = null; }
      g.cleanup();
      activeRef.current = null;

      const dist = Math.hypot(ue.clientX - g.startX, ue.clientY - g.startY);

      if (g.phase === "pan") {
        // Pan ended — tap suppressed; no callback
        return;
      }
      if (dist < tapMax) {
        callbacks.onTap?.(ue);
      }
      // else: ambiguous movement, not classified as tap or pan — silent discard
    };

    // ── Cancel listener ───────────────────────────────────────────────────────
    // Handles browser-initiated cancels (incoming call, scroll takeover, etc.)
    const onPointerCancel = (ce: PointerEvent) => {
      if (ce.pointerId !== g.pointerId || activeRef.current !== g) return;
      if (g.timer !== null) { clearTimeout(g.timer); g.timer = null; }
      g.cleanup();
      activeRef.current = null;
      callbacks.onCancel?.();
    };

    // ── Cleanup factory ───────────────────────────────────────────────────────
    const cleanup = () => {
      window.removeEventListener("pointermove",   onMove);
      window.removeEventListener("pointerup",     onUp,            { capture: true } as EventListenerOptions);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
    g.cleanup = cleanup;

    window.addEventListener("pointermove",   onMove,           { passive: true });
    window.addEventListener("pointerup",     onUp,             { capture: true });
    window.addEventListener("pointercancel", onPointerCancel);

    activeRef.current = g;
  }, [cancelActive]);

  return { startGesture, cancelActive };
}
