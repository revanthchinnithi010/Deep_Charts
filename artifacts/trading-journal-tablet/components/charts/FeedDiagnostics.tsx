/**
 * FeedDiagnostics — React Native port (Phase 9.24 Pass A)
 *
 * Migrated from src/components/charts/FeedDiagnostics.tsx
 *
 * Web → RN changes:
 *   <div>/<span>/<button>   → View/Text/Pressable
 *   import.meta.env.BASE_URL → getApiBase() from @/lib/apiBase
 *   backdropFilter /
 *   WebkitBackdropFilter    → removed (unsupported in RN without extra libs)
 *   userSelect: "none"      → removed (not a valid RN style)
 *   pointerEvents:"auto"    → pointerEvents prop on View (not a style)
 *   wordBreak: "break-word" → removed (not a valid RN style)
 *   fontFamily: "monospace" → "Courier New"
 *   Lucide icons            → Ionicons (@expo/vector-icons)
 *   position:absolute       → preserved (valid in RN)
 *
 * Exports (unchanged):
 *   FeedDiagnostics (named export)
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Wifi, ChevronDown, ChevronUp } from "lucide-react-native";
import {
  getAssetClass, getAssetClassLabel, getProviderLabel, getRoutingReason,
  updateSymbolProviderRouting,
  type AssetClass, type DataProvider,
} from "@/lib/assetClass";
import { useTickStore } from "@/store/tickStore";
import { useCtraderSpotStore } from "@/store/ctraderSpotStore";
import { useMarketSession } from "@/lib/marketSession";
import { getApiBase } from "@/lib/apiBase";

interface ProviderStat {
  name:          string;
  displayName?:  string;
  status:        string;
  tickCount:     number;
  lastTickAt:    number | null;
  subscriptions: string[];
}

interface SymbolDiag {
  provider:      string | undefined;
  assetClass:    string | undefined;
  routingReason: string | undefined;
  subscribed:    boolean;
  lastTickAt:    number | null;
  lastPrice:     number | null;
  lastTickAgo:   number | null;
  symbolId:      string | undefined;
}

interface DiagData {
  providers:     ProviderStat[];
  perSymbol:     Record<string, SymbolDiag>;
  subscriptions: string[];
  symbolRouting: Record<string, string>;
  totalTicks:    number;
  ts:            number;
}

interface Props { symbol: string }

const CLASS_COLOR: Record<AssetClass, string> = {
  crypto:    "#8B5CF6",
  forex:     "#3B82F6",
  metal:     "#F59E0B",
  index:     "#10B981",
  commodity: "#EF4444",
  unknown:   "rgba(255,255,255,0.35)",
};

const PROVIDER_COLOR: Record<string, string> = {
  delta:   "#8B5CF6",
  ctrader: "#F59E0B",
  unknown: "rgba(255,255,255,0.35)",
};

// ── Row ────────────────────────────────────────────────────────────────────────
function Row({
  label, value, color = "rgba(255,255,255,0.8)", dimValue = false,
}: {
  label: string; value: string; color?: string; dimValue?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
      <Text style={{ color: "rgba(255,255,255,0.38)", fontSize: 10, flexShrink: 0 }}>{label}</Text>
      <Text style={{
        color:      dimValue ? "rgba(255,255,255,0.45)" : color,
        fontSize:   11,
        fontWeight: "600",
        textAlign:  "right",
        maxWidth:   160,
      }}>
        {value}
      </Text>
    </View>
  );
}

// ── Divider ────────────────────────────────────────────────────────────────────
function Divider() {
  return (
    <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginVertical: 7 }} />
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function FeedDiagnostics({ symbol }: Props) {
  const [open, setOpen] = useState(false);
  const [diag, setDiag] = useState<DiagData | null>(null);
  const [tps,  setTps]  = useState<number>(0);

  const tickCountRef  = useRef(0);
  const lastTpsRef    = useRef(Date.now());
  const prevCountRef  = useRef(0);
  const prevTickTsRef = useRef(0);

  const { isOpen: sessionOpen, type: sessionType } = useMarketSession(symbol);

  // Live cTrader spot data — real-time bid/ask/spread/tickCount (no 3s poll delay)
  const ctraderSpot       = useCtraderSpotStore(s => s.spots[symbol] ?? null);
  const ctraderTickCount  = useCtraderSpotStore(s => s.tickCounts[symbol] ?? 0);
  const ctraderConnStatus = useCtraderSpotStore(s => s.connStatus);

  // ── Asset class must be derived BEFORE isCtrader (which depends on it) ───────
  const symData    = diag?.perSymbol[symbol];
  const assetClass = (symData?.assetClass as AssetClass | undefined) ?? getAssetClass(symbol);

  // cTrader engine running? (regardless of whether a spot quote exists right now)
  const ctraderConnected = ctraderConnStatus === "streaming";
  // This symbol is a cTrader symbol if the engine is connected and it is non-crypto.
  // Do NOT require ctraderSpot !== null — on a closed-market weekend, cTrader is
  // connected but sends no ticks, so ctraderSpot stays null the entire session.
  const isCtrader = ctraderConnected && assetClass !== "crypto";

  // Provider: prefer server routing (definitive), fall back to client priority rule
  const liveProvider  = isCtrader ? "ctrader" : (symData?.provider ?? diag?.symbolRouting?.[symbol]);
  const providerKey   = (liveProvider ?? "unknown") as DataProvider;
  const providerStat  = diag?.providers.find(p => p.name === liveProvider);
  const provOk        = isCtrader ? true : (providerStat?.status === "connected");
  // Routing reason: prefer server-generated, fall back to client derivation
  const reason = isCtrader
    ? "cTrader ProtoOA real-time spot subscription"
    : (symData?.routingReason ?? getRoutingReason(symbol));

  // Feed offline states — shown when the required provider is unavailable
  const isCtraderOffline = assetClass !== "crypto" && !ctraderConnected;
  const isDeltaOffline   = assetClass === "crypto"  && !provOk;

  const feedStatus = isCtrader
    ? sessionOpen ? "streaming" : "market_closed"
    : isCtraderOffline ? "offline"
    : (symData?.subscribed && provOk)
    ? "streaming"
    : "disconnected";

  // Poll /api/feed/diagnostics every 3 s
  useEffect(() => {
    let cancelled = false;
    const BASE = getApiBase();
    const poll = async () => {
      try {
        const r = await fetch(`${BASE}/api/feed/diagnostics`);
        if (r.ok && !cancelled) {
          const data = await r.json() as DiagData;
          setDiag(data);
          // Build per-symbol class + reason maps from perSymbol
          const classes: Record<string, string> = {};
          const reasons: Record<string, string> = {};
          for (const [sym, info] of Object.entries(data.perSymbol)) {
            if (info.assetClass)    classes[sym] = info.assetClass;
            if (info.routingReason) reasons[sym] = info.routingReason;
          }
          updateSymbolProviderRouting(data.symbolRouting, classes, reasons);
        }
      } catch { /* ignore network errors */ }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Count live ticks for the active symbol → tps
  useEffect(() => {
    tickCountRef.current  = 0;
    prevTickTsRef.current = 0;
    const unsub = useTickStore.subscribe((state) => {
      const ts = state.ticks[symbol]?.lastTick ?? 0;
      if (ts !== prevTickTsRef.current) {
        prevTickTsRef.current = ts;
        tickCountRef.current++;
      }
    });
    return unsub;
  }, [symbol]);

  const calcTps = useCallback(() => {
    const now     = Date.now();
    const elapsed = (now - lastTpsRef.current) / 1000;
    if (elapsed < 1) return;
    const delta   = tickCountRef.current - prevCountRef.current;
    setTps(Math.round((delta / elapsed) * 10) / 10);
    prevCountRef.current = tickCountRef.current;
    lastTpsRef.current   = now;
  }, []);

  useEffect(() => {
    const id = setInterval(calcTps, 5000);
    return () => clearInterval(id);
  }, [calcTps]);

  // Last tick time: for cTrader use live receivedAt (no poll lag); others use server data
  const lastTickAt = isCtrader ? (ctraderSpot?.receivedAt ?? null) : (symData?.lastTickAt ?? null);
  const tickAgeMs  = lastTickAt ? Date.now() - lastTickAt : null;
  const tickAgeStr = tickAgeMs !== null
    ? tickAgeMs < 60_000   ? `${Math.round(tickAgeMs / 1000)}s ago`
    : tickAgeMs < 3600_000 ? `${Math.round(tickAgeMs / 60_000)}m ago`
    : `${Math.round(tickAgeMs / 3600_000)}h ago`
    : "—";

  const classColor    = CLASS_COLOR[assetClass]     ?? CLASS_COLOR.unknown;
  const providerColor = PROVIDER_COLOR[providerKey] ?? PROVIDER_COLOR.unknown;

  // Pill button appearance
  const pillLive   = isCtrader ? sessionOpen : (provOk && sessionOpen);
  const pillClosed = !sessionOpen;
  const pillColor  = pillClosed        ? "#ef4444"
                   : pillLive          ? "#00FFB4"
                   : isCtraderOffline  ? "#ef4444"
                   : isDeltaOffline    ? "#ef4444"
                   : "#ff6b6b";
  const pillBorder = pillClosed        ? "rgba(239,68,68,0.3)"
                   : pillLive          ? "rgba(0,255,140,0.25)"
                   : isCtraderOffline  ? "rgba(239,68,68,0.3)"
                   : isDeltaOffline    ? "rgba(239,68,68,0.3)"
                   : "rgba(255,100,100,0.25)";
  const pillLabel  = pillClosed        ? "Closed"
                   : isCtrader         ? "cTrader"
                   : isCtraderOffline  ? "cTrader ↓"
                   : isDeltaOffline    ? "Delta ↓"
                   : "Feed";

  return (
    <View
      pointerEvents="auto"
      style={{
        position:  "absolute",
        bottom:    10,
        left:      10,
        zIndex:    25,
      }}
    >
      {/* Toggle pill */}
      <Pressable
        onPress={() => setOpen(o => !o)}
        accessibilityLabel="Feed Diagnostics"
        style={{
          flexDirection:   "row",
          alignItems:      "center",
          gap:             5,
          paddingVertical: 3,
          paddingHorizontal: 9,
          borderRadius:    20,
          backgroundColor: "rgba(0,0,0,0.65)",
          borderWidth:     1,
          borderColor:     pillBorder,
        }}
      >
        <Ionicons
          name={pillLive && !pillClosed ? "wifi" : "wifi-outline"}
          size={9}
          color={pillColor}
        />
        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontFamily: "Courier New" }}>
          {pillLabel}
        </Text>
        <Ionicons
          name={open ? "chevron-down" : "chevron-up"}
          size={9}
          color={pillColor}
        />
      </Pressable>

      {/* Expanded panel */}
      {open && (
        <ScrollView
          style={{
            marginTop:       5,
            backgroundColor: "rgba(5,10,8,0.92)",
            borderWidth:     1,
            borderColor:     "rgba(255,255,255,0.1)",
            borderRadius:    9,
            minWidth:        256,
            maxHeight:       420,
          }}
          contentContainerStyle={{ padding: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Text style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, marginBottom: 9, letterSpacing: 0.72, fontFamily: "Courier New" }}>
            FEED DIAGNOSTICS
          </Text>

          {/* Symbol identity */}
          <Row label="Symbol"      value={symbol}                         color="#F3FFF3" />
          <Row label="Asset Class" value={getAssetClassLabel(assetClass)} color={classColor} />

          {/* Market session status */}
          <Row
            label="Market Status"
            value={sessionOpen ? "Open ✓" : "Closed ✗"}
            color={sessionOpen ? "#00FFB4" : "#ef4444"}
          />
          {!sessionOpen && (
            <View style={{
              marginTop:       4,
              padding:         8,
              paddingVertical: 4,
              borderRadius:    4,
              backgroundColor: "rgba(239,68,68,0.1)",
              borderWidth:     1,
              borderColor:     "rgba(239,68,68,0.25)",
            }}>
              <Text style={{ fontSize: 10, color: "rgba(239,68,68,0.85)", lineHeight: 15 }}>
                {sessionType === "forex" || sessionType === "commodity"
                  ? "Forex/commodity session closed (weekends)"
                  : sessionType === "index"
                  ? "Index session closed (Mon–Fri only)"
                  : "Market session closed"}
              </Text>
            </View>
          )}

          <Divider />

          {/* Provider + feed status */}
          <Row
            label="Provider"
            value={
              isCtrader          ? "cTrader"
              : isCtraderOffline ? "cTrader (offline)"
              : isDeltaOffline   ? "Delta Exchange (offline)"
              : liveProvider ? getProviderLabel(providerKey) : "—"
            }
            color={
              isCtrader          ? "#F59E0B"
              : isCtraderOffline ? "#ef4444"
              : isDeltaOffline   ? "#ef4444"
              : providerColor
            }
          />
          <Row
            label="Live Feed"
            value={
              isCtrader && sessionOpen    ? "Active ✓"
              : isCtrader && !sessionOpen ? "Waiting · Market Closed"
              : isCtraderOffline          ? "cTrader Feed Offline"
              : isDeltaOffline            ? "Delta Feed Offline"
              : feedStatus === "streaming" ? "Streaming ✓"
              : feedStatus
            }
            color={
              isCtrader && sessionOpen    ? "#00FFB4"
              : isCtrader && !sessionOpen ? "#F59E0B"
              : isCtraderOffline          ? "#ef4444"
              : isDeltaOffline            ? "#ef4444"
              : feedStatus === "streaming" ? "#00FFB4"
              : "#FF9F43"
            }
          />
          {symData?.symbolId && (
            <Row label="Symbol ID" value={symData.symbolId} dimValue />
          )}

          {/* Routing reason */}
          {!!reason && (
            <View style={{
              marginTop:       6,
              padding:         8,
              paddingVertical: 5,
              backgroundColor: "rgba(255,255,255,0.04)",
              borderWidth:     1,
              borderColor:     "rgba(255,255,255,0.08)",
              borderRadius:    5,
            }}>
              <Text style={{ color: "rgba(255,255,255,0.22)", fontSize: 9, marginBottom: 3, letterSpacing: 0.54, fontFamily: "Courier New" }}>
                ROUTING REASON
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, lineHeight: 15 }}>
                {reason}
              </Text>
            </View>
          )}

          <Divider />

          {/* Live tick metrics */}
          <Row
            label="Last Tick Time"
            value={tickAgeStr}
            color={tickAgeMs !== null && tickAgeMs < 5_000 ? "#00FFB4" : tickAgeMs !== null ? "#FF9F43" : "rgba(255,255,255,0.35)"}
          />
          <Row
            label="Ticks / sec"
            value={tps > 0 ? String(tps) : "—"}
            color={tps > 0 ? "#00FFB4" : "rgba(255,255,255,0.35)"}
          />
          {symData?.lastPrice != null && (
            <Row label="Last Price" value={String(symData.lastPrice)} dimValue />
          )}

          {/* cTrader section — show whether market is open or closed */}
          {isCtrader && (
            <>
              <Divider />
              <Text style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, marginBottom: 5, letterSpacing: 0.54, fontFamily: "Courier New" }}>
                CTRADER FEED
              </Text>
              {ctraderSpot ? (
                <>
                  <Row label="Bid"    value={ctraderSpot.bid.toFixed(5)}    color="#4ADE80" />
                  <Row label="Ask"    value={ctraderSpot.ask.toFixed(5)}    color="#F87171" />
                  <Row label="Spread" value={ctraderSpot.spread.toFixed(5)} dimValue />
                  <Row
                    label="Tick Count"
                    value={ctraderTickCount > 0 ? ctraderTickCount.toLocaleString() : "0"}
                    color={ctraderTickCount > 0 ? "#00FFB4" : "rgba(255,255,255,0.35)"}
                  />
                  <Row
                    label="Last Tick At"
                    value={new Date(ctraderSpot.receivedAt).toLocaleTimeString("en-US", {
                      hour12: false, hour: "2-digit", minute: "2-digit",
                      second: "2-digit", fractionalSecondDigits: 3,
                    })}
                    color={tickAgeMs !== null && tickAgeMs < 2_000 ? "#00FFB4" : "#FF9F43"}
                  />
                </>
              ) : (
                <View style={{
                  padding:         8,
                  paddingVertical: 5,
                  borderRadius:    4,
                  backgroundColor: "rgba(245,158,11,0.07)",
                  borderWidth:     1,
                  borderColor:     "rgba(245,158,11,0.18)",
                }}>
                  <Text style={{ fontSize: 10, color: "rgba(245,158,11,0.85)", lineHeight: 15 }}>
                    {sessionOpen
                      ? "Engine connected · awaiting first quote…"
                      : "Engine connected · market is closed. Quotes will resume when market opens."}
                  </Text>
                </View>
              )}
            </>
          )}

          {/* cTrader offline banner */}
          {isCtraderOffline && (
            <View style={{
              marginTop:       6,
              padding:         8,
              paddingVertical: 5,
              borderRadius:    4,
              backgroundColor: "rgba(239,68,68,0.07)",
              borderWidth:     1,
              borderColor:     "rgba(239,68,68,0.25)",
            }}>
              <Text style={{ fontSize: 10, color: "rgba(239,68,68,0.9)", lineHeight: 15 }}>
                <Text style={{ fontWeight: "700" }}>cTrader Feed Offline</Text>
                {` — ${getAssetClassLabel(assetClass)} data requires a cTrader connection. Connect via Brokers to restore live feed and candle data.`}
              </Text>
            </View>
          )}

          {/* Delta offline banner */}
          {isDeltaOffline && (
            <View style={{
              marginTop:       6,
              padding:         8,
              paddingVertical: 5,
              borderRadius:    4,
              backgroundColor: "rgba(239,68,68,0.07)",
              borderWidth:     1,
              borderColor:     "rgba(239,68,68,0.25)",
            }}>
              <Text style={{ fontSize: 10, color: "rgba(239,68,68,0.9)", lineHeight: 15 }}>
                <Text style={{ fontWeight: "700" }}>Delta Feed Offline</Text>
                {" — Crypto data requires Delta Exchange. Check your connection or reconnect via Brokers."}
              </Text>
            </View>
          )}

          {/* Not subscribed warning — only for Delta crypto symbols */}
          {!isCtrader && !isCtraderOffline && !isDeltaOffline && !symData?.subscribed && (
            <Text style={{ marginTop: 6, fontSize: 10, color: "#FF9F43", lineHeight: 15 }}>
              Not subscribed — select this symbol in the watchlist to start receiving ticks.
            </Text>
          )}

          {/* Provider catalog summary */}
          {diag && (
            <>
              <Divider />
              <Text style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, marginBottom: 5, letterSpacing: 0.54, fontFamily: "Courier New" }}>
                PROVIDER CATALOG
              </Text>
              {diag.providers.map(p => {
                const routedCount = Object.values(diag.symbolRouting).filter(v => v === p.name).length;
                const isActive    = p.name === liveProvider;
                return (
                  <View
                    key={p.name}
                    style={{
                      flexDirection:   "row",
                      justifyContent:  "space-between",
                      alignItems:      "center",
                      marginBottom:    3,
                      paddingVertical: isActive ? 2 : 2,
                      paddingHorizontal: isActive ? 5 : 0,
                      borderRadius:    4,
                      backgroundColor: isActive ? "rgba(255,255,255,0.05)" : "transparent",
                    }}
                  >
                    <Text style={{ color: isActive ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.25)", fontSize: 9, fontFamily: "Courier New" }}>
                      {isActive ? "▶ " : ""}{p.displayName ?? p.name}
                    </Text>
                    <Text style={{
                      color:      p.status === "connected" ? "#00FFB4" : "rgba(255,80,80,0.8)",
                      fontSize:   9,
                      fontWeight: "600",
                      fontFamily: "Courier New",
                    }}>
                      {routedCount} syms · {p.status}
                    </Text>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
