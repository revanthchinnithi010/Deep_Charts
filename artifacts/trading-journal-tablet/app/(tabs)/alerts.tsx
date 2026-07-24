/**
 * app/(tabs)/alerts.tsx — Alerts tab screen (Phase 10.7)
 *
 * Full port of artifacts/trading-journal/src/pages/alerts.tsx
 *
 * Web → RN substitutions:
 *   createPortal / framer-motion        → Modal / plain View
 *   useIsMobile                         → removed (tablet = always card layout)
 *   wouter useLocation / "/settings"    → router.push("/brokers")
 *   fetch("/api/...")                   → fetch(`${BASE}/api/...`)
 *   useLiveMarketContext alertEvents    → [] (LiveMarketContext is a stub — Phase 6.x)
 *   Lucide icons                        → Ionicons
 *   className / Tailwind                → StyleSheet.create
 *   HTML table                          → FlatList rows
 *   AnimatePresence / motion.*          → plain View conditionals
 *   document.body.overflow              → noop
 *   requestAnimationFrame               → useEffect / setTimeout
 *
 * Screen layout:
 *   Fixed header  — "Alerts Center" title + bell (unread badge, always 0 until Phase 6.x)
 *   Stats strip   — 4-card grid (Active / Triggered / Paused / Total)
 *   Tab bar       — 3-segment pill: "Alerts" | "Drawing" | "Info"
 *   Tab content   — fills remaining height; each section owns its scroll:
 *     "Alerts"  → AlertSheetContent (inline, has own ScrollView + create flow)
 *     "Drawing" → DrawingAlertsList (symbol/interval from chartStore)
 *     "Info"    → ScrollView: connection status + recent triggers + stats
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { AlertSheetContent } from "@/components/charts/AlertCenterModal";
import { DrawingAlertsList } from "@/components/charts/DrawingAlertsList";
import { useAlertStore } from "@/store/alertStore";
import { useChartStore } from "@/store/chartStore";
import { getApiBase } from "@/lib/apiBase";

const BASE = getApiBase();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ScreenTab = "alerts" | "drawing" | "info";

interface ConnState {
  delta: boolean | null;
  telegram: boolean | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtInterval(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  if (n < 60)  return `${n}m`;
  if (n < 1440) return `${n / 60}H`;
  return `${n / 1440}D`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats Strip — 4-card grid
// ─────────────────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  iconName: string;
  iconColor: string;
  iconBg: string;
  pulse?: boolean;
}

function StatCard({ label, value, iconName, iconColor, iconBg, pulse = false }: StatCardProps) {
  return (
    <View
      style={styles.statCard}
      accessible={true}
      accessibilityLabel={`${label}: ${value}`}
    >
      <View style={[styles.statIconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName as "notifications"} size={15} color={iconColor} />
      </View>
      <View style={styles.statText}>
        <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
        <View style={styles.statValueRow}>
          <Text style={styles.statValue}>{value}</Text>
          {pulse && value > 0 && (
            <View style={styles.pulseDotOuter}>
              <View style={styles.pulseDotInner} />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection Status — "Info" tab section
// ─────────────────────────────────────────────────────────────────────────────

function ConnectionStatusSection({
  conn,
  loading,
}: {
  conn: ConnState;
  loading: boolean;
}) {
  const router = useRouter();

  const rows = [
    { key: "delta",    label: "Delta Exchange", iconName: "pulse-outline",  color: "#8B5CF6" },
    { key: "telegram", label: "Telegram Bot",   iconName: "send-outline",   color: "#2CA5E0" },
  ] as const;

  return (
    <View style={styles.infoCard}>
      {/* Card header */}
      <View style={styles.infoCardHeader}>
        <Ionicons name="radio-outline" size={14} color="#B7FF5A" />
        <Text style={styles.infoCardTitle}>Connections</Text>
        <Pressable
          onPress={() => router.push("/brokers")}
          style={styles.manageBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Manage broker connections"
        >
          <Ionicons name="settings-outline" size={11} color="#B7FF5A" />
          <Text style={styles.manageBtnText}>Manage</Text>
        </Pressable>
      </View>

      {/* Status rows */}
      <View style={{ gap: 10 }}>
        {rows.map(r => {
          const ok = r.key === "delta" ? conn.delta : conn.telegram;
          const loaded = ok !== null && !loading;
          return (
            <View key={r.key} style={styles.connRow}>
              <Ionicons name={r.iconName} size={14} color={r.color} />
              <Text style={styles.connLabel}>{r.label}</Text>
              {!loaded ? (
                <Text style={styles.connDots}>…</Text>
              ) : ok ? (
                <View style={styles.connLive}>
                  <View style={[styles.connDot, { backgroundColor: "#60a5fa" }]} />
                  <Text style={[styles.connStatus, { color: "#60a5fa" }]}>Live</Text>
                </View>
              ) : (
                <Text style={styles.connOff}>Off</Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Open Brokers button */}
      <Pressable
        onPress={() => router.push("/brokers")}
        style={({ pressed }) => [styles.openBrokersBtn, pressed && styles.openBrokersBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel="Open Broker Settings"
      >
        <Ionicons name="settings-outline" size={11} color="rgba(167,184,169,0.55)" />
        <Text style={styles.openBrokersBtnText}>Open Broker Settings</Text>
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent Triggers — "Info" tab section
// wsAlertEvents is always [] on tablet (LiveMarketContext stub)
// ─────────────────────────────────────────────────────────────────────────────

function RecentTriggersSection() {
  // wsAlertEvents not yet available on tablet (Phase 6.x pending)
  const wsAlertEvents: unknown[] = [];

  return (
    <View style={styles.infoCard}>
      <View style={styles.infoCardHeader}>
        <Ionicons name="notifications-outline" size={14} color="#B7FF5A" />
        <Text style={styles.infoCardTitle}>Recent Triggers</Text>
      </View>
      {wsAlertEvents.length === 0 ? (
        <Text style={styles.noTriggersText}>No alerts triggered yet</Text>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert Stats Breakdown — "Info" tab section
// ─────────────────────────────────────────────────────────────────────────────

function AlertStatsSection() {
  const alerts = useAlertStore(s => s.alerts);

  const priceCount     = alerts.filter(a => a.type === "price").length;
  const zoneCount      = alerts.filter(a => a.type === "zone").length;
  const trendlineCount = alerts.filter(a => a.type === "trendline").length;
  const total          = alerts.length;

  const rows = [
    { label: "Price Alerts", val: priceCount,     color: "#60a5fa"  },
    { label: "Zone Alerts",  val: zoneCount,      color: "#fb923c"  },
    { label: "Trendlines",   val: trendlineCount, color: "#B7FF5A"  },
  ];

  return (
    <View style={styles.infoCard}>
      <View style={styles.infoCardHeader}>
        <Ionicons name="bar-chart-outline" size={14} color="#B7FF5A" />
        <Text style={styles.infoCardTitle}>Alert Breakdown</Text>
      </View>

      <View style={{ gap: 10 }}>
        {rows.map(r => (
          <View key={r.label} style={styles.statsRow}>
            <View style={[styles.statsDot, { backgroundColor: r.color }]} />
            <Text style={styles.statsRowLabel}>{r.label}</Text>
            <Text style={styles.statsRowVal}>{r.val}</Text>
            <View style={styles.statsBar}>
              <View
                style={[
                  styles.statsBarFill,
                  {
                    backgroundColor: r.color,
                    width: total > 0 ? `${(r.val / total) * 100}%` : "0%",
                  },
                ]}
              />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.statsTip}>
        <Ionicons name="information-circle-outline" size={11} color="rgba(167,184,169,0.3)" />
        <Text style={styles.statsTipText}>Alerts persist across sessions via local storage</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Info Tab — ScrollView wrapping all info sections
// ─────────────────────────────────────────────────────────────────────────────

function InfoTab({ conn, connLoading, onRefresh, refreshing }: {
  conn: ConnState;
  connLoading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.infoScroll}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#B7FF5A"
          colors={["#B7FF5A"]}
        />
      }
    >
      <ConnectionStatusSection conn={conn} loading={connLoading} />
      <RecentTriggersSection />
      <AlertStatsSection />

      {/* Bottom padding */}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function AlertsScreen() {
  const insets   = useSafeAreaInsets();
  const router   = useRouter();

  // Alert store
  const alerts = useAlertStore(s => s.alerts);

  const totalActive    = alerts.filter(a => a.status === "active").length;
  const totalTriggered = alerts.filter(a => a.status === "triggered").length;
  const totalPaused    = alerts.filter(a => a.status === "paused").length;
  const totalAlerts    = alerts.length;

  // wsAlertEvents is always [] on tablet (LiveMarketContext is a stub)
  const unreadCount = 0;

  // Tab state
  const [activeTab, setActiveTab] = useState<ScreenTab>("alerts");

  // Chart store — for Drawing tab defaults
  const symbol   = useChartStore(s => s.symbol);
  const interval = useChartStore(s => s.interval);

  // Connection status state
  const [conn, setConn]             = useState<ConnState>({ delta: null, telegram: null });
  const [connLoading, setConnLoading] = useState(false);
  const [infoRefreshing, setInfoRefreshing] = useState(false);

  // AlertSheetContent noop close (it's inline, not in a modal)
  const noop = useCallback(() => {}, []);

  // Fetch connection status
  const fetchConn = useCallback(async () => {
    setConnLoading(true);
    try {
      const [dlRes, tgRes] = await Promise.allSettled([
        fetch(`${BASE}/api/delta/status`).then(r => r.json()) as Promise<{ connected: boolean }>,
        fetch(`${BASE}/api/telegram/status`)
          .then(r => r.json())
          .catch(() => fetch(`${BASE}/api/telegram/config`).then(r => r.json())) as Promise<{ enabled?: boolean; configured?: boolean }>,
      ]);

      setConn({
        delta:    dlRes.status === "fulfilled" ? dlRes.value.connected : false,
        telegram: tgRes.status === "fulfilled"
          ? !!(tgRes.value.enabled ?? (tgRes.value as { configured?: boolean }).configured)
          : false,
      });
    } catch {
      /* ignore */
    } finally {
      setConnLoading(false);
    }
  }, []);

  // Load connection status on mount + periodic refresh
  useEffect(() => {
    fetchConn();
    const t = setInterval(fetchConn, 8000);
    return () => clearInterval(t);
  }, [fetchConn]);

  // Pull-to-refresh for Info tab
  const handleInfoRefresh = useCallback(async () => {
    setInfoRefreshing(true);
    await fetchConn();
    setInfoRefreshing(false);
  }, [fetchConn]);

  // Tab definitions
  const TABS: { key: ScreenTab; label: string; iconName: string }[] = [
    { key: "alerts",  label: "Alerts",  iconName: "notifications-outline" },
    { key: "drawing", label: "Drawing", iconName: "git-branch-outline"    },
    { key: "info",    label: "Info",    iconName: "information-circle-outline" },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Alerts Center</Text>
          <Text style={styles.headerSubtitle}>
            Monitor price levels, zones &amp; trendlines
          </Text>
        </View>

        <Pressable
          onPress={() => setActiveTab("info")}
          style={({ pressed }) => [styles.bellBtn, pressed && styles.bellBtnPressed]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <Ionicons name="notifications-outline" size={18} color="rgba(167,184,169,0.7)" />
          {unreadCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* ── Stats strip ───────────────────────────────────────────────── */}
      <View style={styles.statsStrip}>
        <StatCard
          label="Active Alerts"
          value={totalActive}
          iconName="pulse-outline"
          iconColor="#60a5fa"
          iconBg="rgba(96,165,250,0.12)"
          pulse
        />
        <StatCard
          label="Triggered"
          value={totalTriggered}
          iconName="flash-outline"
          iconColor="#B7FF5A"
          iconBg="rgba(183,255,90,0.12)"
        />
        <StatCard
          label="Paused"
          value={totalPaused}
          iconName="pause-circle-outline"
          iconColor="#FFC857"
          iconBg="rgba(255,200,87,0.12)"
        />
        <StatCard
          label="Total"
          value={totalAlerts}
          iconName="notifications-outline"
          iconColor="#60a5fa"
          iconBg="rgba(96,165,250,0.10)"
        />
      </View>

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <View style={styles.tabBar}>
        {TABS.map(t => {
          const active = activeTab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setActiveTab(t.key)}
              style={({ pressed }) => [
                styles.tabPill,
                active && styles.tabPillActive,
                pressed && !active && styles.tabPillPressed,
              ]}
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: active }}
            >
              <Ionicons
                name={t.iconName as "notifications-outline"}
                size={13}
                color={active ? "#fff" : "rgba(167,184,169,0.5)"}
              />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Tab content — each section manages its own scroll ─────────── */}
      <View style={styles.tabContent}>
        {/* ─ Alerts tab: AlertSheetContent inline ─ */}
        {activeTab === "alerts" && (
          <AlertSheetContent onClose={noop} />
        )}

        {/* ─ Drawing tab: DrawingAlertsList ─ */}
        {activeTab === "drawing" && (
          <View style={{ flex: 1 }}>
            {/* Symbol / interval indicator */}
            <View style={styles.drawingHeader}>
              <Ionicons name="git-branch-outline" size={12} color="rgba(167,184,169,0.45)" />
              <Text style={styles.drawingHeaderText}>
                Chart-linked drawings for{" "}
                <Text style={styles.drawingHeaderSymbol}>{symbol}</Text>
                {" · "}
                {fmtInterval(interval)}
              </Text>
            </View>

            <DrawingAlertsList
              symbol={symbol}
              currentInterval={interval}
              currentPrice={null}
            />
          </View>
        )}

        {/* ─ Info tab: connection status + recent triggers + stats ─ */}
        {activeTab === "info" && (
          <InfoTab
            conn={conn}
            connLoading={connLoading}
            onRefresh={handleInfoRefresh}
            refreshing={infoRefreshing}
          />
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StyleSheet
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Root
  root: {
    flex: 1,
    backgroundColor: "#05070A",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#F3FFF3",
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: "rgba(167,184,169,0.45)",
    marginTop: 2,
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center",
  },
  bellBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  bellBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    fontSize: 9,
    fontWeight: "900",
    color: "#fff",
  },

  // Stats strip
  statsStrip: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  statCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    minWidth: 0,
  },
  statIconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statText: {
    flex: 1,
    minWidth: 0,
  },
  statLabel: {
    fontSize: 9,
    color: "rgba(167,184,169,0.5)",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#F3FFF3",
  },
  pulseDotOuter: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(96,165,250,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  pulseDotInner: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#60a5fa",
  },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 3,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    gap: 2,
  },
  tabPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 7,
    borderRadius: 10,
  },
  tabPillActive: {
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  tabPillPressed: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  tabLabel: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "rgba(167,184,169,0.5)",
  },
  tabLabelActive: {
    color: "#F3FFF3",
  },

  // Tab content
  tabContent: {
    flex: 1,
    overflow: "hidden",
  },

  // Drawing tab header
  drawingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
    backgroundColor: "rgba(255,255,255,0.015)",
  },
  drawingHeaderText: {
    fontSize: 10.5,
    color: "rgba(167,184,169,0.45)",
  },
  drawingHeaderSymbol: {
    fontWeight: "700",
    color: "rgba(167,184,169,0.75)",
    fontFamily: "monospace",
  },

  // Info tab scroll
  infoScroll: {
    padding: 14,
    gap: 12,
  },

  // Info cards
  infoCard: {
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    padding: 16,
    gap: 12,
  },
  infoCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  infoCardTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#F3FFF3",
  },

  // Connection status
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.22)",
    backgroundColor: "rgba(183,255,90,0.07)",
  },
  manageBtnText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#B7FF5A",
  },
  connRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  connLabel: {
    flex: 1,
    fontSize: 12,
    color: "rgba(167,184,169,0.75)",
  },
  connDots: {
    fontSize: 11,
    color: "rgba(167,184,169,0.3)",
  },
  connLive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  connDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connStatus: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  connOff: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "rgba(167,184,169,0.35)",
  },
  openBrokersBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "transparent",
    marginTop: 2,
  },
  openBrokersBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  openBrokersBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(167,184,169,0.55)",
  },

  // Recent triggers
  noTriggersText: {
    fontSize: 11,
    color: "rgba(167,184,169,0.35)",
    textAlign: "center",
    paddingVertical: 12,
  },

  // Alert stats breakdown
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statsDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  statsRowLabel: {
    flex: 1,
    fontSize: 11.5,
    color: "rgba(167,184,169,0.7)",
  },
  statsRowVal: {
    fontSize: 11,
    fontWeight: "800",
    color: "#F3FFF3",
    minWidth: 20,
    textAlign: "right",
  },
  statsBar: {
    width: 64,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  statsBarFill: {
    height: "100%",
    borderRadius: 3,
    opacity: 0.65,
  },
  statsTip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.04)",
  },
  statsTipText: {
    fontSize: 10,
    color: "rgba(167,184,169,0.28)",
  },
});
