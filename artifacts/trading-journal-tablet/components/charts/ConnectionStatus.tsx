/**
 * ConnectionStatus.tsx — React Native port (Phase 9.23 Pass A)
 *
 * Migrated from src/components/charts/ConnectionStatus.tsx
 *
 * Web → RN changes (Pass A):
 *   <div>/<span>            → View / Text
 *   CSS @keyframes ping     → Animated.loop with parallel scale + opacity
 *   backdropFilter          → removed
 *   userSelect / cursor     → removed
 *   borderRadius: "50%"     → borderRadius: 100 (pill/circle in RN)
 *   useLiveMarketContext    → tablet stub (LiveMarketContext not yet fully
 *                             implemented on tablet; returns safe defaults
 *                             until Phase 6.x completes the WS layer)
 *   <style>{`…`}</style>   → removed (Animated handles the pulse ring)
 *   inset: -2               → top/left/right/bottom: -2 (RN)
 *   boxShadow               → elevation + shadowColor (limited to Android/iOS)
 *
 * Exports (unchanged):
 *   ConnectionStatusProps (interface)
 *   STATUS_CONFIG (constant)
 *   ConnectionStatus (memo, default export)
 */

import { memo, useRef, useEffect } from "react";
import {
  View, Text, Animated, StyleSheet,
} from "react-native";
import type { WsStatus } from "@/contexts/LiveMarketContext";

// ── Types (preserved exactly) ─────────────────────────────────────────────────
export interface ConnectionStatusProps {
  compact?: boolean;
  /** Optional overrides — tablet callers may pass status/latency directly */
  wsStatus?: WsStatus;
  latencyMs?: number | null;
}

// ── Status config (preserved exactly) ────────────────────────────────────────
export const STATUS_CONFIG: Record<WsStatus, { color: string; label: string; pulse: boolean }> = {
  connected:    { color: "#B7FF5A", label: "Live",          pulse: true  },
  connecting:   { color: "#F59E0B", label: "Connecting…",   pulse: true  },
  reconnecting: { color: "#F59E0B", label: "Reconnecting…", pulse: true  },
  disconnected: { color: "#6B7280", label: "Offline",       pulse: false },
  error:        { color: "#EF4444", label: "Error",         pulse: false },
};

// ── Tablet stub for useLiveMarketContext ──────────────────────────────────────
// LiveMarketContext is not yet fully implemented on tablet (Phase 6.x).
// Components pass wsStatus/latencyMs as props when available; otherwise
// these safe defaults are used.
function useLiveMarketContextSafe(): { wsStatus: WsStatus; latencyMs: number | null } {
  return { wsStatus: "disconnected", latencyMs: null };
}

// ── ConnectionStatus ──────────────────────────────────────────────────────────
export const ConnectionStatus = memo(function ConnectionStatus({
  compact,
  wsStatus: wsStatusProp,
  latencyMs: latencyMsProp,
}: ConnectionStatusProps) {
  // Use prop overrides when provided; fall back to context stub
  const ctx = useLiveMarketContextSafe();
  const wsStatus = wsStatusProp ?? ctx.wsStatus;
  const latencyMs = latencyMsProp !== undefined ? latencyMsProp : ctx.latencyMs;

  const cfg = STATUS_CONFIG[wsStatus] ?? STATUS_CONFIG.disconnected;

  // ── Pulse ring animation ──────────────────────────────────────────────────
  const pingScale   = useRef(new Animated.Value(1)).current;
  const pingOpacity = useRef(new Animated.Value(0.55)).current;
  const animRef     = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Reset to start state
    pingScale.setValue(1);
    pingOpacity.setValue(0.55);

    if (!cfg.pulse) return;

    const anim = Animated.loop(
      Animated.parallel([
        Animated.timing(pingScale, {
          toValue:         2.5,
          duration:        1800,
          useNativeDriver: true,
        }),
        Animated.timing(pingOpacity, {
          toValue:         0,
          duration:        1800,
          useNativeDriver: true,
        }),
      ])
    );
    animRef.current = anim;
    anim.start();

    return () => {
      anim.stop();
      pingScale.setValue(1);
      pingOpacity.setValue(0.55);
    };
  }, [cfg.pulse, wsStatus]);

  const tooltipLabel = `WebSocket: ${cfg.label}${latencyMs !== null ? ` · ${latencyMs}ms` : ""}`;

  return (
    <View
      accessibilityLabel={tooltipLabel}
      style={[
        ss.container,
        compact ? ss.containerCompact : ss.containerNormal,
        { borderColor: cfg.color + "22" },
      ]}
    >
      {/* Status dot + pulse ring */}
      <View style={ss.dotWrapper}>
        {/* Core dot */}
        <View style={[ss.dot, { backgroundColor: cfg.color }]} />

        {/* Pulse ring (only when pulsing) */}
        {cfg.pulse && (
          <Animated.View
            style={[
              ss.pingRing,
              {
                borderColor: cfg.color,
                opacity: pingOpacity,
                transform: [{ scale: pingScale }],
              },
            ]}
          />
        )}
      </View>

      {/* Label */}
      {!compact && (
        <Text style={[ss.statusLabel, { color: cfg.color }]}>
          {cfg.label}
        </Text>
      )}

      {/* Latency */}
      {!compact && latencyMs !== null && wsStatus === "connected" && (
        <Text style={ss.latencyLabel}>{latencyMs}ms</Text>
      )}
    </View>
  );
});

// ── Styles ────────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  container: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            5,
    borderRadius:   20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth:    1,
    flexShrink:     0,
  },
  containerNormal: {
    paddingVertical:   4,
    paddingHorizontal: 10,
  },
  containerCompact: {
    paddingVertical:   3,
    paddingHorizontal: 8,
  },
  dotWrapper: {
    width:    7,
    height:   7,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width:        7,
    height:       7,
    borderRadius: 100,
  },
  pingRing: {
    position:     "absolute",
    top:          -2,
    left:         -2,
    right:        -2,
    bottom:       -2,
    borderRadius: 100,
    borderWidth:  1.5,
  },
  statusLabel: {
    fontSize:      10.5,
    fontWeight:    "600",
    letterSpacing: 0.1,
  },
  latencyLabel: {
    fontSize:      9.5,
    fontWeight:    "500",
    color:         "rgba(167,184,169,0.45)",
    marginLeft:    1,
  },
});

export default ConnectionStatus;
