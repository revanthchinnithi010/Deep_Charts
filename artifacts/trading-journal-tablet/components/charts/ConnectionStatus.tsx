import { memo, useRef, useEffect } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
import { useLiveMarketContext, type WsStatus } from "@/contexts/LiveMarketContext";

export interface ConnectionStatusProps {
  compact?: boolean;
  /** Optional status override retained for compatibility. */
  wsStatus?: WsStatus;
  latencyMs?: number | null;
}

export const STATUS_CONFIG: Record<WsStatus, { color: string; label: string; pulse: boolean }> = {
  connected:    { color: "#B7FF5A", label: "Live",          pulse: true  },
  connecting:   { color: "#F59E0B", label: "Connecting…",   pulse: true  },
  reconnecting: { color: "#F59E0B", label: "Reconnecting…", pulse: true  },
  disconnected: { color: "#6B7280", label: "Offline",       pulse: false },
  error:        { color: "#EF4444", label: "Error",         pulse: false },
};

export const ConnectionStatus = memo(function ConnectionStatus({
  compact,
  wsStatus: wsStatusProp,
  latencyMs: latencyMsProp,
}: ConnectionStatusProps) {
  const ctx = useLiveMarketContext();
  // Prefer the real bridge state. The prop is retained only as a fallback for
  // legacy callers that do not have a live context mounted yet.
  const wsStatus = ctx.wsStatus !== "disconnected" ? ctx.wsStatus : (wsStatusProp ?? ctx.wsStatus);
  const latencyMs = latencyMsProp !== undefined ? latencyMsProp : ctx.latencyMs;
  const cfg = STATUS_CONFIG[wsStatus] ?? STATUS_CONFIG.disconnected;

  const pingScale   = useRef(new Animated.Value(1)).current;
  const pingOpacity = useRef(new Animated.Value(0.55)).current;
  const animRef     = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    pingScale.setValue(1);
    pingOpacity.setValue(0.55);

    if (!cfg.pulse) return;

    const anim = Animated.loop(
      Animated.parallel([
        Animated.timing(pingScale, {
          toValue: 2.5,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(pingOpacity, {
          toValue: 0,
          duration: 1800,
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
  }, [cfg.pulse, wsStatus, pingOpacity, pingScale]);

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
      <View style={ss.dotWrapper}>
        <View style={[ss.dot, { backgroundColor: cfg.color }]} />
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

      {!compact && (
        <Text style={[ss.statusLabel, { color: cfg.color }]}>
          {cfg.label}
        </Text>
      )}

      {!compact && latencyMs !== null && wsStatus === "connected" && (
        <Text style={ss.latencyLabel}>{latencyMs}ms</Text>
      )}
    </View>
  );
});

const ss = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    flexShrink: 0,
  },
  containerNormal: {
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  containerCompact: {
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  dotWrapper: {
    width: 7,
    height: 7,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 100,
  },
  pingRing: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 100,
    borderWidth: 1.5,
  },
  statusLabel: {
    fontSize: 10.5,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  latencyLabel: {
    fontSize: 9.5,
    fontWeight: "500",
    color: "rgba(167,184,169,0.45)",
    marginLeft: 1,
  },
});

export default ConnectionStatus;
