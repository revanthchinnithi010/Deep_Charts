/**
 * DrawingAlertsList.tsx — React Native port (Phase 10.3 Pass B)
 *
 * Migrated from src/components/charts/DrawingAlertsList.tsx
 *
 * Web → RN changes:
 *   lucide-react icons                → Ionicons (@expo/vector-icons)
 *   fmtPrice from LiveMarketContext   → @/lib/fmtPrice
 *   useLiveMarketContext alertEvents  → removed (LiveMarketContext is a stub on
 *                                        tablet; re-enable this effect when
 *                                        Phase 6.x lands and alertEvents is live)
 *   className (Tailwind)              → StyleSheet
 *   <div>/<p>/<span>/<button>         → View/Text/Pressable
 *   overflow-y: auto scroll           → ScrollView / FlatList
 *   CSS grid layout                   → flex row with fixed widths
 *   position:fixed inset-0 backdrop   → Modal transparent backdrop Pressable
 *   animate-pulse green dot           → Animated loop (opacity)
 *   relative fetch URLs               → getApiBase() prefix
 *   scrollbarWidth: none              → showsVerticalScrollIndicator={false}
 *   animate-spin spinner              → ActivityIndicator
 *
 * Exports (unchanged):
 *   DrawingAlertsList (named export)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, Pressable, ScrollView, FlatList,
  StyleSheet, Modal, Animated, ActivityIndicator,
} from "react-native";
import {
  TrendingUp, ArrowRight, Minus, Square, LayoutGrid, AlertCircle,
  Activity, CheckCircle2, Timer, MoreHorizontal, Pencil, Copy, RefreshCw,
  Play, Pause, Trash2, Clock, Globe, Plus,
} from "lucide-react-native";
import { DrawingAlertModal, type DrawingAlertRow } from "./DrawingAlertModal";
import { fmtPrice } from "@/lib/fmtPrice";
import { getApiBase } from "@/lib/apiBase";

const BASE = getApiBase();

// ── Constants ─────────────────────────────────────────────────────────────────

type LucideIcon = React.ComponentType<{ size: number; color: string }>;
const DRAWING_ICONS: Record<string, LucideIcon> = {
  trendline:       TrendingUp,
  ray:             ArrowRight,
  horizontal_line: Minus,
  rectangle:       Square,
  channel:         LayoutGrid,
};

const DRAWING_LABELS: Record<string, string> = {
  trendline:       "Trendline",
  ray:             "Ray",
  horizontal_line: "H. Line",
  rectangle:       "Zone",
  channel:         "Channel",
};

const DRAWING_COLORS: Record<string, string> = {
  trendline:       "#B7FF5A",
  ray:             "#38bdf8",
  horizontal_line: "#fb923c",
  rectangle:       "#a78bfa",
  channel:         "#34d399",
};

const CONDITION_LABELS: Record<string, string> = {
  cross_above: "Cross Above",
  cross_below: "Cross Below",
  touch:       "Touch",
  breakout:    "Breakout",
  above_price: "Above Price",
  below_price: "Below Price",
  touch_price: "Touch Price",
  enter_zone:  "Enter Zone",
  exit_zone:   "Exit Zone",
  rejection:   "Rejection",
  retest:      "Retest",
  break:       "Break",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcProjected(row: DrawingAlertRow, nowMs: number): number | null {
  if (row.drawingType === "horizontal_line") return row.point1Price;
  const t1 = new Date(row.point1Time).getTime();
  const t2 = new Date(row.point2Time).getTime();
  if (t2 === t1) return null;
  const slope = (row.point2Price - row.point1Price) / (t2 - t1);
  return row.point1Price + slope * (nowMs - t1);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── PulseDot — animated green dot for Active badge ────────────────────────────

function PulseDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,    duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[s.pulseDot, { opacity }]} />
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status, isTriggered }: { status: string; isTriggered: boolean }) {
  if (isTriggered || status === "triggered") {
    return (
      <View style={[s.badge, { backgroundColor: "rgba(239,68,68,0.15)" }]}>
        <CheckCircle2 size={10} color="#f87171" />
        <Text style={[s.badgeText, { color: "#f87171" }]}>Triggered</Text>
      </View>
    );
  }
  if (status === "paused") {
    return (
      <View style={[s.badge, { backgroundColor: "rgba(251,191,36,0.15)" }]}>
        <Clock size={10} color="#fbbf24" />
        <Text style={[s.badgeText, { color: "#fbbf24" }]}>Paused</Text>
      </View>
    );
  }
  if (status === "expired") {
    return (
      <View style={[s.badge, { backgroundColor: "rgba(107,114,128,0.2)" }]}>
        <AlertCircle size={10} color="#9ca3af" />
        <Text style={[s.badgeText, { color: "#9ca3af" }]}>Expired</Text>
      </View>
    );
  }
  return (
    <View style={[s.badge, { backgroundColor: "rgba(183,255,90,0.12)" }]}>
      <PulseDot />
      <Text style={[s.badgeText, { color: "#B7FF5A" }]}>Active</Text>
    </View>
  );
}

function RowMenu({
  row,
  onEdit,
  onDelete,
  onTogglePause,
  onReset,
  onClone,
}: {
  row: DrawingAlertRow;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePause: () => void;
  onReset: () => void;
  onClone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isPaused    = row.alertStatus === "paused";
  const isTriggered = row.isTriggered || row.alertStatus === "triggered";

  const close = () => setOpen(false);

  return (
    <View>
      <Pressable
        onPress={() => setOpen(v => !v)}
        hitSlop={8}
        style={s.menuBtn}
      >
        <MoreHorizontal size={14} color="rgba(167,184,169,0.5)" />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
        statusBarTranslucent
      >
        {/* Backdrop */}
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />

        {/* Dropdown panel — anchored top-right of the alerts panel */}
        <View style={s.menuDropdown}>
          <Pressable
            onPress={() => { close(); onEdit(); }}
            style={s.menuItem}
          >
            <Pencil size={12} color="rgba(167,184,169,0.9)" />
            <Text style={s.menuItemText}>Edit Alert</Text>
          </Pressable>

          <Pressable
            onPress={() => { close(); onClone(); }}
            style={s.menuItem}
          >
            <Copy size={12} color="rgba(167,184,169,0.9)" />
            <Text style={s.menuItemText}>Clone</Text>
          </Pressable>

          {isTriggered ? (
            <Pressable
              onPress={() => { close(); onReset(); }}
              style={s.menuItem}
            >
              <RefreshCw size={12} color="rgba(167,184,169,0.9)" />
              <Text style={s.menuItemText}>Reset Alert</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => { close(); onTogglePause(); }}
              style={s.menuItem}
            >
              {isPaused
                ? <Play size={12} color="rgba(167,184,169,0.9)" />
                : <Pause size={12} color="rgba(167,184,169,0.9)" />}
              <Text style={s.menuItemText}>{isPaused ? "Resume" : "Pause"}</Text>
            </Pressable>
          )}

          <View style={s.menuDivider} />

          <Pressable
            onPress={() => { close(); onDelete(); }}
            style={s.menuItem}
          >
            <Trash2 size={12} color="rgba(248,113,113,0.8)" />
            <Text style={[s.menuItemText, { color: "rgba(248,113,113,0.8)" }]}>Delete</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

// ── Alert History ─────────────────────────────────────────────────────────────

interface AlertHistoryRow {
  id: number;
  sourceId: number | null;
  sourceType: string;
  symbol: string;
  timeframe: string | null;
  drawingType: string | null;
  condition: string;
  priceAtTrigger: number;
  projectedPrice: number | null;
  message: string | null;
  createdAt: string;
}

function HistoryPanel({ symbol, allSymbols, refreshKey }: { symbol: string; allSymbols: boolean; refreshKey: number }) {
  const [rows,    setRows]    = useState<AlertHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = allSymbols
        ? `${BASE}/api/alert-history`
        : `${BASE}/api/alert-history?symbol=${symbol}`;
      const res = await fetch(url);
      if (res.ok) setRows(await res.json() as AlertHistoryRow[]);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [symbol, allSymbols]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="small" color="rgba(183,255,90,0.5)" />
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={s.emptyState}>
        <Ionicons name="hourglass-outline" size={24} color="rgba(167,184,169,0.2)" />
        <Text style={s.emptyTitle}>No alert history yet</Text>
        <Text style={s.emptySubtitle}>Alerts will appear here after they fire</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.historyScroll} showsVerticalScrollIndicator={false}>
      {rows.map(row => {
        const iconName  = DRAWING_ICON_NAMES[row.drawingType ?? ""] ?? "alert-circle-outline";
        const color     = DRAWING_COLORS[row.drawingType ?? ""] ?? "#A7B8A9";
        const condLabel = CONDITION_LABELS[row.condition] ?? row.condition;
        return (
          <View
            key={row.id}
            style={s.historyRow}
          >
            <View style={[s.historyIcon, { backgroundColor: `${color}14`, borderColor: `${color}30` }]}>
              <Ionicons name={iconName as any} size={14} color={color} />
            </View>

            <View style={s.historyInfo}>
              <View style={s.historyInfoTop}>
                <Text style={s.historySymbol}>{row.symbol}</Text>
                <View style={s.historyCondBadge}>
                  <Text style={s.historyCondText}>{condLabel}</Text>
                </View>
              </View>
              <View style={s.historyInfoMeta}>
                <Text style={s.historyDrawingType}>
                  {DRAWING_LABELS[row.drawingType ?? ""] ?? row.drawingType ?? row.sourceType}
                </Text>
                {row.timeframe ? (
                  <Text style={s.historyTfText}> · {row.timeframe}</Text>
                ) : null}
              </View>
            </View>

            <View style={s.historyRight}>
              <Text style={s.historyPrice}>{fmtPrice(row.priceAtTrigger, row.symbol)}</Text>
              <Text style={s.historyTime}>{timeAgo(row.createdAt)}</Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type DrawingsTab = "active" | "triggered" | "history";

interface Props {
  symbol: string;
  currentInterval: string;
  currentPrice: number | null;
}

export function DrawingAlertsList({ symbol, currentInterval, currentPrice }: Props) {
  // NOTE: alertEvents from useLiveMarketContext is not available on tablet —
  // LiveMarketContext is a stub (Phase 6.x). The auto-refresh on new alert
  // events will activate automatically when the full context is implemented.
  const prevAlertCountRef = useRef(0);

  const [rows,       setRows]       = useState<DrawingAlertRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [editItem,   setEditItem]   = useState<DrawingAlertRow | null>(null);
  const [projNow,    setProjNow]    = useState(Date.now());
  const [subTab,     setSubTab]     = useState<DrawingsTab>("active");
  const [allSymbols, setAllSymbols] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/trendlines`);
      if (res.ok) {
        const data = await res.json() as DrawingAlertRow[];
        setRows(data);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const id = setInterval(() => setProjNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const handleDelete = async (id: number) => {
    await fetch(`${BASE}/api/trendlines/${id}`, { method: "DELETE" });
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const handleTogglePause = async (row: DrawingAlertRow) => {
    const newStatus = row.alertStatus === "paused" ? "active" : "paused";
    const res = await fetch(`${BASE}/api/trendlines/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertStatus: newStatus }),
    });
    if (res.ok) {
      const updated = await res.json() as DrawingAlertRow;
      setRows(prev => prev.map(r => r.id === row.id ? updated : r));
    }
  };

  const handleReset = async (row: DrawingAlertRow) => {
    const res = await fetch(`${BASE}/api/trendlines/${row.id}/reset`, { method: "POST" });
    if (res.ok) {
      const updated = await res.json() as DrawingAlertRow;
      setRows(prev => prev.map(r => r.id === row.id ? updated : r));
    }
  };

  const handleClone = async (row: DrawingAlertRow) => {
    const res = await fetch(`${BASE}/api/trendlines/${row.id}/clone`, { method: "POST" });
    if (res.ok) { await load(); }
  };

  const baseRows = allSymbols ? rows : rows.filter(r => r.symbol === symbol);

  const activeRows    = baseRows.filter(r => r.isActive && !r.isTriggered && r.alertStatus !== "paused");
  const pausedRows    = baseRows.filter(r => r.alertStatus === "paused" && !r.isTriggered);
  const triggeredRows = baseRows.filter(r => r.isTriggered || r.alertStatus === "triggered");

  const displayRows = subTab === "active"
    ? [...activeRows, ...pausedRows]
    : triggeredRows;

  const activeCount    = activeRows.length;
  const triggeredCount = triggeredRows.length;

  const tabs: [DrawingsTab, string, number | null, string][] = [
    ["active",    "Active",    activeCount,    "pulse-outline"],
    ["triggered", "Triggered", triggeredCount, "checkmark-circle-outline"],
    ["history",   "History",   null,           "hourglass-outline"],
  ];

  return (
    <View style={s.container}>

      {/* ── Sub-header ── */}
      <View style={s.subHeader}>
        {/* Tabs */}
        <View style={s.tabRow}>
          {tabs.map(([val, label, count, iconName]) => {
            const active = subTab === val;
            return (
              <Pressable
                key={val}
                onPress={() => setSubTab(val)}
                style={[
                  s.tab,
                  active && s.tabActive,
                ]}
              >
                <Ionicons
                  name={iconName as any}
                  size={10}
                  color={active ? "#B7FF5A" : "rgba(167,184,169,0.5)"}
                />
                <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
                {count !== null && count > 0 ? (
                  <View style={[
                    s.tabBadge,
                    { backgroundColor: val === "triggered" ? "rgba(239,68,68,0.2)" : "rgba(183,255,90,0.15)" },
                  ]}>
                    <Text style={[
                      s.tabBadgeText,
                      { color: val === "triggered" ? "#f87171" : "#B7FF5A" },
                    ]}>
                      {count}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* Right controls */}
        <View style={s.rightControls}>
          {/* All symbols toggle */}
          <Pressable
            onPress={() => setAllSymbols(v => !v)}
            style={[
              s.globeBtn,
              allSymbols && s.globeBtnActive,
            ]}
          >
            <Ionicons
              name="globe-outline"
              size={10}
              color={allSymbols ? "#38bdf8" : "rgba(167,184,169,0.55)"}
            />
            <Text style={[s.globeText, allSymbols && s.globeTextActive]}>
              {allSymbols ? "All" : symbol}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => { setEditItem(null); setShowModal(true); }}
            style={s.newBtn}
          >
            <Ionicons name="add-outline" size={10} color="#B7FF5A" />
            <Text style={s.newBtnText}>New Alert</Text>
          </Pressable>
        </View>
      </View>

      {/* ── History panel ── */}
      {subTab === "history" ? (
        <View style={s.flex1}>
          <HistoryPanel symbol={symbol} allSymbols={allSymbols} refreshKey={historyRefreshKey} />
        </View>
      ) : (
        <View style={s.flex1}>
          {/* ── Column headers ── */}
          {displayRows.length > 0 && (
            <View style={s.colHeader}>
              {["Drawing / Condition", "Projected", "Dist%", "Status", ""].map((h, i) => (
                <Text
                  key={i}
                  style={[
                    s.colHeaderText,
                    i === 0 && s.colFlex,
                    i === 1 && s.col88,
                    i === 2 && s.col72,
                    i === 3 && s.col72,
                    i === 4 && s.col32,
                  ]}
                >
                  {h}
                </Text>
              ))}
            </View>
          )}

          {/* ── Rows ── */}
          {loading ? (
            <View style={s.centered}>
              <ActivityIndicator size="small" color="rgba(183,255,90,0.5)" />
            </View>
          ) : displayRows.length === 0 ? (
            <View style={s.emptyState}>
              {subTab === "triggered" ? (
                <>
                  <Ionicons name="checkmark-circle-outline" size={24} color="rgba(167,184,169,0.2)" />
                  <Text style={s.emptyTitle}>
                    No triggered alerts{allSymbols ? "" : ` for ${symbol}`}
                  </Text>
                  <Text style={s.emptySubtitle}>
                    Triggered alerts are preserved here — use Reset to reactivate
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="trending-up-outline" size={24} color="rgba(167,184,169,0.2)" />
                  <Text style={s.emptyTitle}>
                    No drawing alerts{allSymbols ? "" : ` for ${symbol}`}
                  </Text>
                  <Pressable
                    onPress={() => { setEditItem(null); setShowModal(true); }}
                    style={s.createFirstBtn}
                  >
                    <Ionicons name="add-outline" size={12} color="#B7FF5A" />
                    <Text style={s.newBtnText}>Create First Alert</Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : (
            <FlatList
              data={displayRows}
              keyExtractor={item => String(item.id)}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: row }) => {
                const color     = DRAWING_COLORS[row.drawingType] ?? "#A7B8A9";
                const iconName  = DRAWING_ICON_NAMES[row.drawingType] ?? "trending-up-outline";
                const projected = calcProjected(row, projNow);
                const condLabel = CONDITION_LABELS[row.condition] ?? row.condition;
                const dtLabel   = DRAWING_LABELS[row.drawingType] ?? row.drawingType;
                const dist      = projected !== null && currentPrice
                  ? ((currentPrice - projected) / projected) * 100
                  : null;
                const isNear    = dist !== null && Math.abs(dist) < 0.3;
                const isTrig    = row.isTriggered || row.alertStatus === "triggered";
                const isPaused  = row.alertStatus === "paused";

                return (
                  <View
                    style={[
                      s.alertRow,
                      isNear && !isTrig && s.alertRowNear,
                      (isPaused || isTrig) && s.alertRowDimmed,
                      { borderLeftColor: isNear && !isTrig ? color : "transparent" },
                    ]}
                  >
                    {/* Drawing type + condition */}
                    <View style={[s.colFlex, s.drawingCell]}>
                      <View style={[
                        s.drawingIcon,
                        {
                          backgroundColor: isTrig ? "rgba(239,68,68,0.12)" : `${color}14`,
                          borderColor:     isTrig ? "rgba(239,68,68,0.3)"  : `${color}30`,
                        },
                      ]}>
                        <Ionicons
                          name={iconName as any}
                          size={12}
                          color={isTrig ? "#f87171" : color}
                        />
                      </View>
                      <View style={s.drawingInfo}>
                        <View style={s.drawingInfoTop}>
                          <Text
                            style={[s.drawingLabel, { color: isTrig ? "#f87171" : "#F3FFF3" }]}
                            numberOfLines={1}
                          >
                            {dtLabel}
                          </Text>
                          {allSymbols && (
                            <View style={s.symbolBadge}>
                              <Text style={s.symbolBadgeText}>{row.symbol}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={s.drawingMeta} numberOfLines={1}>
                          {condLabel} · {row.timeframe}
                        </Text>
                      </View>
                    </View>

                    {/* Projected price */}
                    <View style={s.col88}>
                      {isTrig && row.triggeredPrice ? (
                        <View>
                          <Text style={s.projPriceTriggered}>
                            {fmtPrice(row.triggeredPrice, row.symbol)}
                          </Text>
                          <Text style={s.projTriggeredLabel}>triggered</Text>
                        </View>
                      ) : projected !== null ? (
                        <Text style={[s.projPrice, { color: isNear ? color : "rgba(167,184,169,0.8)" }]}>
                          {fmtPrice(projected, row.symbol)}
                        </Text>
                      ) : (
                        <Text style={s.projDash}>—</Text>
                      )}
                    </View>

                    {/* Distance % */}
                    <View style={s.col72}>
                      {dist !== null ? (
                        <Text style={[
                          s.distText,
                          { color: dist >= 0 ? "#B7FF5A" : "#ef4444" },
                          Math.abs(dist) < 0.5 && s.distNear,
                        ]}>
                          {dist >= 0 ? "+" : ""}{dist.toFixed(2)}%
                        </Text>
                      ) : (
                        <Text style={s.projDash}>—</Text>
                      )}
                    </View>

                    {/* Status */}
                    <View style={s.col72}>
                      <StatusBadge status={row.alertStatus} isTriggered={row.isTriggered} />
                    </View>

                    {/* Menu */}
                    <View style={s.col32}>
                      <RowMenu
                        row={row}
                        onEdit={() => { setEditItem(row); setShowModal(true); }}
                        onDelete={() => handleDelete(row.id)}
                        onTogglePause={() => handleTogglePause(row)}
                        onReset={() => handleReset(row)}
                        onClone={() => handleClone(row)}
                      />
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <DrawingAlertModal
          symbol={symbol}
          currentInterval={currentInterval}
          currentPrice={currentPrice}
          editItem={editItem}
          onClose={() => { setShowModal(false); setEditItem(null); }}
          onCreated={() => { void load(); }}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#07110D",
  },
  flex1: {
    flex: 1,
  },

  // ── Sub-header ────────────────────────────────────────────────────────────
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(57,91,67,0.15)",
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabActive: {
    backgroundColor: "rgba(183,255,90,0.1)",
    borderColor: "rgba(183,255,90,0.25)",
  },
  tabText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "rgba(167,184,169,0.5)",
  },
  tabTextActive: {
    color: "#B7FF5A",
  },
  tabBadge: {
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  tabBadgeText: {
    fontSize: 8,
    fontWeight: "700",
  },

  // ── Right controls ────────────────────────────────────────────────────────
  rightControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  globeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: 8,
    backgroundColor: "rgba(57,91,67,0.1)",
    borderWidth: 1,
    borderColor: "rgba(57,91,67,0.25)",
  },
  globeBtnActive: {
    backgroundColor: "rgba(56,189,248,0.12)",
    borderColor: "rgba(56,189,248,0.3)",
  },
  globeText: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "rgba(167,184,169,0.55)",
  },
  globeTextActive: {
    color: "#38bdf8",
  },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    height: 24,
    borderRadius: 8,
    backgroundColor: "rgba(183,255,90,0.12)",
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.3)",
  },
  newBtnText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#B7FF5A",
  },

  // ── Column headers ────────────────────────────────────────────────────────
  colHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(57,91,67,0.1)",
  },
  colHeaderText: {
    fontSize: 8.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "rgba(167,184,169,0.35)",
  },

  // ── Column widths ─────────────────────────────────────────────────────────
  colFlex: { flex: 1 },
  col88:   { width: 88 },
  col72:   { width: 72 },
  col32:   { width: 32, alignItems: "flex-end" },

  // ── Alert rows ────────────────────────────────────────────────────────────
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(57,91,67,0.08)",
    borderLeftWidth: 2,
    borderLeftColor: "transparent",
  },
  alertRowNear: {
    backgroundColor: "rgba(183,255,90,0.025)",
  },
  alertRowDimmed: {
    opacity: 0.65,
  },

  // ── Drawing cell ──────────────────────────────────────────────────────────
  drawingCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 4,
  },
  drawingIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
  },
  drawingInfo: {
    flex: 1,
    minWidth: 0,
  },
  drawingInfoTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  drawingLabel: {
    fontSize: 10.5,
    fontWeight: "600",
    flexShrink: 1,
  },
  drawingMeta: {
    fontSize: 9,
    color: "rgba(167,184,169,0.55)",
    marginTop: 2,
  },
  symbolBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: "rgba(57,91,67,0.2)",
    flexShrink: 0,
  },
  symbolBadgeText: {
    fontSize: 8,
    color: "rgba(167,184,169,0.6)",
  },

  // ── Projected price ───────────────────────────────────────────────────────
  projPrice: {
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  projPriceTriggered: {
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "700",
    color: "#f87171",
  },
  projTriggeredLabel: {
    fontSize: 8.5,
    color: "rgba(167,184,169,0.35)",
    marginTop: 1,
  },
  projDash: {
    fontSize: 10,
    color: "rgba(167,184,169,0.25)",
  },

  // ── Distance % ────────────────────────────────────────────────────────────
  distText: {
    fontSize: 10,
    fontFamily: "monospace",
    fontWeight: "700",
  },
  distNear: {
    color: "#facc15",
  },

  // ── Status badge ──────────────────────────────────────────────────────────
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 8.5,
    fontWeight: "700",
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#B7FF5A",
  },

  // ── Row menu ──────────────────────────────────────────────────────────────
  menuBtn: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  menuDropdown: {
    position: "absolute",
    top: 80,
    right: 12,
    width: 160,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0D1C16",
    borderWidth: 1,
    borderColor: "rgba(57,91,67,0.45)",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  menuItemText: {
    fontSize: 11,
    color: "rgba(167,184,169,0.9)",
  },
  menuDivider: {
    height: 1,
    backgroundColor: "rgba(57,91,67,0.22)",
  },

  // ── History panel ─────────────────────────────────────────────────────────
  historyScroll: {
    flex: 1,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(57,91,67,0.08)",
  },
  historyIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
  },
  historyInfo: {
    flex: 1,
    minWidth: 0,
  },
  historyInfoTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  historySymbol: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#F3FFF3",
  },
  historyCondBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(239,68,68,0.12)",
  },
  historyCondText: {
    fontSize: 9,
    color: "#f87171",
  },
  historyInfoMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  historyDrawingType: {
    fontSize: 9,
    color: "rgba(167,184,169,0.5)",
  },
  historyTfText: {
    fontSize: 9,
    color: "rgba(167,184,169,0.35)",
  },
  historyRight: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  historyPrice: {
    fontSize: 10.5,
    fontFamily: "monospace",
    fontWeight: "700",
    color: "#F3FFF3",
  },
  historyTime: {
    fontSize: 9,
    color: "rgba(167,184,169,0.4)",
    marginTop: 2,
  },

  // ── Empty / loading states ────────────────────────────────────────────────
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 32,
  },
  emptyTitle: {
    fontSize: 11,
    color: "rgba(167,184,169,0.4)",
  },
  emptySubtitle: {
    fontSize: 9.5,
    color: "rgba(167,184,169,0.25)",
    textAlign: "center",
    paddingHorizontal: 24,
  },
  createFirstBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(183,255,90,0.1)",
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.25)",
    marginTop: 4,
  },
});
