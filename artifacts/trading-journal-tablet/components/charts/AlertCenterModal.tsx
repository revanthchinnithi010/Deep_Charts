/**
 * AlertCenterModal.tsx — React Native port (Phase 10.2 Pass A)
 *
 * Migrated from src/components/charts/AlertCenterModal.tsx
 *
 * Web → RN changes:
 *   createPortal(modal, document.body)  → Modal (transparent, animationType="fade")
 *   <div>/<p>/<span>/<button>           → View/Text/Pressable
 *   <input>                             → TextInput
 *   <textarea>                          → TextInput multiline
 *   <select> for timeframe/zoneType     → Pressable pill buttons
 *   position:fixed/sticky               → View above ScrollView
 *   overflowY:"auto" alert list         → ScrollView
 *   CSS @keyframes / <style> blocks     → removed (Pass A)
 *   onMouseEnter/Leave hover effects    → removed
 *   document.addEventListener           → Modal backdrop Pressable
 *   WatchlistSymbolPicker CSS dropdown  → Modal-based full-screen picker
 *   toast from sonner                   → toast from @/hooks/use-toast
 *   Lucide icons                        → Ionicons (@expo/vector-icons)
 *   requestAnimationFrame fade-in       → Modal animationType="fade"
 *   setTimeout(onClose, 200) fade-out   → Modal onRequestClose
 *
 * Exports (unchanged):
 *   AlertCenterModalProps (interface)
 *   AlertSheetContent (named export)
 *   default AlertCenterModal
 */

import { useState, useCallback, useRef, memo } from "react";
import {
  View, Text, Pressable, TextInput, ScrollView,
  Modal, StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  TIMEFRAMES,
  type AnyAlert, type AlertStatus, type AlertType,
  type PriceAlert, type ZoneAlert, type TrendlineAlert,
} from "@/data/alertsData";
import { useAlertStore } from "@/store/alertStore";
import { useWatchlist, type WatchlistEntry, SYMBOL_CATALOG } from "@/contexts/WatchlistContext";
import { toast } from "@/hooks/use-toast";

// ── Helpers ────────────────────────────────────────────────────────────────────
const STATUS_CFG: Record<AlertStatus, { label: string; dot: string; text: string; bg: string }> = {
  active:    { label: "Active",    dot: "#60a5fa", text: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
  triggered: { label: "Triggered", dot: "#B7FF5A", text: "#B7FF5A", bg: "rgba(183,255,90,0.12)"  },
  paused:    { label: "Paused",    dot: "#FFC857", text: "#FFC857", bg: "rgba(255,200,87,0.12)"  },
  expired:   { label: "Expired",   dot: "#9ca3af", text: "#9ca3af", bg: "rgba(156,163,175,0.10)" },
};

const TYPE_CFG: Record<AlertType, { label: string; iconName: string; color: string; bg: string }> = {
  price:     { label: "Price",     iconName: "radio-button-on-outline", color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
  zone:      { label: "Zone",      iconName: "layers-outline",          color: "#fb923c", bg: "rgba(251,146,60,0.12)"  },
  trendline: { label: "Trendline", iconName: "git-branch-outline",      color: "#B7FF5A", bg: "rgba(183,255,90,0.12)"  },
};

const FILTER_OPTIONS = [
  { label: "All",       value: "all"       },
  { label: "Active",    value: "active"    },
  { label: "Triggered", value: "triggered" },
  { label: "Paused",    value: "paused"    },
  { label: "Expired",   value: "expired"   },
] as const;

type FilterValue = typeof FILTER_OPTIONS[number]["value"];

const MARKET_ORDER = ["Favorites", "Crypto", "Forex", "Indices", "Commodities", "Stocks", "Recently Viewed", "Other"] as const;

function fmtAlertDesc(a: AnyAlert): string {
  if (a.type === "price") {
    const cond = a.condition === "above" ? "↑ Above" : a.condition === "below" ? "↓ Below" : "⟷ Touch";
    return `${cond} ${a.targetPrice.toLocaleString()}`;
  }
  if (a.type === "zone") {
    return `${a.lowerPrice.toLocaleString()} – ${a.upperPrice.toLocaleString()}`;
  }
  if (a.type === "trendline") {
    return `${a.point1Price.toLocaleString()} → ${a.point2Price.toLocaleString()}`;
  }
  return "";
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString([], {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function getTimeframe(a: AnyAlert): string {
  if (a.type === "price") return "—";
  return (a as ZoneAlert | TrendlineAlert).timeframe ?? "—";
}

function getConditionLabel(a: AnyAlert): string {
  const c = a.condition;
  const map: Record<string, string> = {
    above: "Price Above", below: "Price Below", touch: "Touch",
    break: "Breakout", retest: "Retest",
  };
  return map[c] ?? c;
}

// ── Small UI atoms ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: AlertStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <View style={[s.badge, { backgroundColor: cfg.bg, borderColor: cfg.text + "25" }]}>
      <View style={[s.badgeDot, { backgroundColor: cfg.dot }]} />
      <Text style={[s.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

function TypeBadge({ type }: { type: AlertType }) {
  const cfg = TYPE_CFG[type];
  return (
    <View style={[s.typeBadge, { backgroundColor: cfg.bg }]}>
      <Ionicons name={cfg.iconName as "layers-outline"} size={10} color={cfg.color} />
      <Text style={[s.typeBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function ActionBtn({
  label, bg, color, iconName, onPress,
}: {
  label?: string; bg: string; color: string;
  iconName: string; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.actionBtn, { backgroundColor: pressed ? bg.replace("0.12", "0.22") : bg }]}
    >
      <Ionicons name={iconName as "play"} size={11} color={color} />
      {label ? <Text style={[s.actionBtnLabel, { color }]}>{label}</Text> : null}
    </Pressable>
  );
}

// ── Alert Card ─────────────────────────────────────────────────────────────────
const AlertCard = memo(function AlertCard({
  alert, onPause, onResume, onDelete, onEdit, triggering,
}: {
  alert: AnyAlert;
  onPause: () => void; onResume: () => void;
  onDelete: () => void; onEdit: () => void;
  triggering: boolean;
}) {
  return (
    <View style={[s.cardRow, triggering && s.cardRowTriggering]}>
      {/* Top row */}
      <View style={s.cardTopRow}>
        <Text style={s.cardSymbol}>{alert.symbol}</Text>
        <TypeBadge type={alert.type} />
        <StatusBadge status={alert.status} />
        <View style={s.cardTimestamp}>
          <Ionicons name="time-outline" size={10} color="rgba(167,184,169,0.4)" />
          <Text style={s.cardTimestampText}>{fmtTime(alert.createdAt)}</Text>
        </View>
      </View>

      {/* Detail row */}
      <View style={s.cardDetailRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={s.cardDescRow}>
            <Text style={s.cardCondLabel}>{getConditionLabel(alert)}</Text>
            <Text style={s.cardDesc} numberOfLines={1}>{fmtAlertDesc(alert)}</Text>
            {getTimeframe(alert) !== "—" && (
              <View style={s.cardTfBadge}>
                <Text style={s.cardTfText}>{getTimeframe(alert)}</Text>
              </View>
            )}
          </View>
          {!!alert.notes && (
            <Text style={s.cardNotes} numberOfLines={1}>{alert.notes}</Text>
          )}
          {alert.status === "triggered" && alert.triggeredAt && (
            <View style={s.cardTriggeredRow}>
              <Ionicons name="checkmark-circle" size={10} color="#B7FF5A" />
              <Text style={s.cardTriggeredText}>Triggered {fmtTime(alert.triggeredAt)}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Action buttons */}
      <View style={s.cardActions}>
        {alert.status === "paused" && (
          <ActionBtn iconName="play" label="Resume" bg="rgba(183,255,90,0.12)" color="#B7FF5A" onPress={onResume} />
        )}
        {(alert.status === "active" || alert.status === "triggered") && (
          <ActionBtn iconName="pause" label="Pause" bg="rgba(255,200,0,0.12)" color="#FFC857" onPress={onPause} />
        )}
        <ActionBtn iconName="create-outline" label="Edit" bg="rgba(171,185,182,0.10)" color="#D3DEDA" onPress={onEdit} />
        <ActionBtn iconName="trash-outline" label="Delete" bg="rgba(255,80,80,0.12)" color="#FF5C5C" onPress={onDelete} />
      </View>
    </View>
  );
});

// ── Edit Alert sub-modal ───────────────────────────────────────────────────────
function EditAlertModal({
  alert, onClose, onSave,
}: { alert: AnyAlert; onClose: () => void; onSave: (updated: AnyAlert) => void }) {
  const [notes, setNotes] = useState(alert.notes);
  const [status, setStatus] = useState<AlertStatus>(alert.status);

  const handleSave = () => {
    onSave({ ...alert, notes, status });
    onClose();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFillObject, s.subBackdrop]} onPress={onClose}>
        <Pressable onPress={() => {}} style={s.editPanel}>
          {/* Header */}
          <View style={s.editHeader}>
            <View style={s.editIconBox}>
              <Ionicons name="create-outline" size={14} color="#B7FF5A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.editTitle}>Edit Alert</Text>
              <Text style={s.editSubtitle}>{alert.symbol} · {TYPE_CFG[alert.type].label}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={s.editCloseBtn}>
              <Ionicons name="close" size={14} color="rgba(167,184,169,0.4)" />
            </Pressable>
          </View>

          {/* Status */}
          <View style={s.editSection}>
            <Text style={s.fieldLabel}>STATUS</Text>
            <View style={s.statusRow}>
              {(["active", "paused", "expired"] as AlertStatus[]).map(sv => {
                const cfg = STATUS_CFG[sv];
                const active = status === sv;
                return (
                  <Pressable
                    key={sv}
                    onPress={() => setStatus(sv)}
                    style={[s.statusPill,
                      { borderColor: active ? cfg.text + "50" : "rgba(255,255,255,0.06)",
                        backgroundColor: active ? cfg.bg : "transparent" }]}
                  >
                    <Text style={[s.statusPillText, { color: active ? cfg.text : "rgba(167,184,169,0.5)" }]}>
                      {cfg.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Notes */}
          <View style={[s.editSection, { marginBottom: 18 }]}>
            <Text style={s.fieldLabel}>NOTES</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Alert notes..."
              placeholderTextColor="rgba(167,184,169,0.3)"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              style={s.notesInput}
            />
          </View>

          {/* Actions */}
          <View style={s.editFooter}>
            <Pressable onPress={onClose} style={s.cancelBtn}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSave} style={s.saveBtn}>
              <Text style={s.saveBtnText}>Save Changes</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Watchlist Symbol Picker ────────────────────────────────────────────────────
function WatchlistSymbolPicker({
  value, onChange,
}: { value: string; onChange: (sym: string) => void }) {
  const { items } = useWatchlist();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<TextInput>(null);

  const currentLabel = (() => {
    const found = items.find(it => it.symbol === value);
    if (found) return found.badge || found.symbol;
    const cat = SYMBOL_CATALOG[value];
    return cat ? (cat as { badge?: string }).badge || value : value;
  })();

  const q = query.trim().toLowerCase();
  const filtered: WatchlistEntry[] = items.filter(it => {
    if (!q) return true;
    return (
      it.symbol.toLowerCase().includes(q) ||
      it.label.toLowerCase().includes(q) ||
      it.badge.toLowerCase().includes(q)
    );
  });

  const grouped = (MARKET_ORDER as readonly string[]).reduce<Record<string, WatchlistEntry[]>>((acc, mkt) => {
    const group = filtered.filter(it => {
      if (mkt === "Favorites") return it.isFavorite;
      return it.market === mkt && !it.isFavorite;
    });
    if (group.length) acc[mkt] = group;
    return acc;
  }, {});

  const handleOpen = () => {
    setOpen(true);
    setQuery("");
    setTimeout(() => searchRef.current?.focus(), 100);
  };

  const handleClose = () => {
    setOpen(false);
    setQuery("");
  };

  const handleSelect = (sym: string) => {
    onChange(sym);
    handleClose();
  };

  return (
    <>
      <Pressable
        onPress={handleOpen}
        style={[s.symBtn]}
      >
        <Text style={s.symBtnText}>{currentLabel || value}</Text>
        <Ionicons name="chevron-down" size={12} color="rgba(167,184,169,0.45)" />
      </Pressable>

      <Modal transparent animationType="fade" visible={open} onRequestClose={handleClose} statusBarTranslucent>
        <Pressable style={[StyleSheet.absoluteFillObject, s.subBackdrop]} onPress={handleClose}>
          <Pressable onPress={() => {}} style={s.symPickerPanel}>
            {/* Search */}
            <View style={s.symSearchRow}>
              <Ionicons name="search" size={11} color="rgba(167,184,169,0.4)" />
              <TextInput
                ref={searchRef}
                value={query}
                onChangeText={setQuery}
                placeholder="Search symbols…"
                placeholderTextColor="rgba(167,184,169,0.35)"
                style={s.symSearchInput}
              />
              {!!query && (
                <Pressable onPress={() => setQuery("")} hitSlop={6}>
                  <Ionicons name="close" size={10} color="rgba(167,184,169,0.4)" />
                </Pressable>
              )}
            </View>

            {/* Symbol list */}
            <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
              {Object.keys(grouped).length === 0 ? (
                <View style={s.symEmpty}>
                  <Text style={s.symEmptyText}>No symbols found</Text>
                </View>
              ) : Object.entries(grouped).map(([mkt, syms]) => (
                <View key={mkt}>
                  <Text style={s.symGroupLabel}>
                    {mkt === "Favorites" ? "⭐ Favorites" : mkt}
                  </Text>
                  {syms.map(it => (
                    <Pressable
                      key={it.id}
                      onPress={() => handleSelect(it.symbol)}
                      style={({ pressed }) => [
                        s.symItem,
                        it.symbol === value && s.symItemActive,
                        pressed && s.symItemPressed,
                      ]}
                    >
                      <View style={s.symBadge}>
                        <Text style={s.symBadgeText}>{it.badge}</Text>
                      </View>
                      <Text style={[s.symItemLabel, it.symbol === value && s.symItemLabelActive]}>
                        {it.label}
                      </Text>
                      {it.symbol === value && (
                        <Ionicons name="checkmark-circle" size={11} color="#B7FF5A" />
                      )}
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ── Create Alert sub-modal ─────────────────────────────────────────────────────
function QuickCreateModal({
  onClose, onSave,
}: { onClose: () => void; onSave: (a: AnyAlert) => void }) {
  const { items: wlItems } = useWatchlist();
  const [step, setStep] = useState<"pick" | "price" | "zone" | "trendline">("pick");
  const defaultSymbol = wlItems[0]?.symbol ?? "NAS100";
  const [form, setForm] = useState({
    symbol: defaultSymbol, condition: "above" as string,
    targetPrice: "", notes: "", timeframe: "1H",
    upperPrice: "", lowerPrice: "", zoneType: "supply",
    p1Price: "", p2Price: "",
  });

  const handleCreate = () => {
    if (step === "price") {
      if (!form.targetPrice) return;
      onSave({
        id: `pa${Date.now()}`, type: "price",
        symbol: form.symbol, condition: form.condition as PriceAlert["condition"],
        targetPrice: parseFloat(form.targetPrice), currentPrice: 0,
        notes: form.notes, status: "active",
        expiry: null, createdAt: new Date().toISOString(), triggeredAt: null,
      });
    } else if (step === "zone") {
      if (!form.upperPrice || !form.lowerPrice) return;
      onSave({
        id: `za${Date.now()}`, type: "zone",
        symbol: form.symbol, zoneType: form.zoneType as ZoneAlert["zoneType"],
        upperPrice: parseFloat(form.upperPrice), lowerPrice: parseFloat(form.lowerPrice),
        timeframe: form.timeframe, condition: "touch",
        notes: form.notes, status: "active",
        createdAt: new Date().toISOString(), triggeredAt: null,
      });
    } else if (step === "trendline") {
      if (!form.p1Price || !form.p2Price) return;
      onSave({
        id: `ta${Date.now()}`, type: "trendline",
        symbol: form.symbol, timeframe: form.timeframe,
        point1Price: parseFloat(form.p1Price), point1Time: new Date().toISOString(),
        point2Price: parseFloat(form.p2Price), point2Time: new Date().toISOString(),
        condition: "touch",
        notes: form.notes, status: "active",
        createdAt: new Date().toISOString(), triggeredAt: null,
      });
    }
    onClose();
  };

  const TYPE_OPTIONS = [
    { key: "price"     as const, label: "Price Alert",     iconName: "radio-button-on-outline", color: "#60a5fa", desc: "Trigger when price hits a level" },
    { key: "zone"      as const, label: "Zone Alert",      iconName: "layers-outline",          color: "#fb923c", desc: "Trigger when price enters a zone" },
    { key: "trendline" as const, label: "Trendline Alert", iconName: "git-branch-outline",      color: "#B7FF5A", desc: "Trigger on trendline interaction" },
  ];

  const ZONE_TYPES = ["supply", "demand", "support_resistance", "order_block"] as const;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFillObject, s.subBackdrop]} onPress={onClose}>
        <Pressable onPress={() => {}} style={s.createPanel}>
          {/* Header */}
          <View style={s.editHeader}>
            <View style={s.editIconBox}>
              <Ionicons name="add" size={14} color="#B7FF5A" />
            </View>
            <Text style={s.editTitle}>
              {step === "pick" ? "Create Alert" : `New ${step.charAt(0).toUpperCase() + step.slice(1)} Alert`}
            </Text>
            <Pressable onPress={onClose} hitSlop={8} style={s.editCloseBtn}>
              <Ionicons name="close" size={14} color="rgba(167,184,169,0.4)" />
            </Pressable>
          </View>

          {/* Step: pick type */}
          {step === "pick" && (
            <View style={{ gap: 8 }}>
              <Text style={s.pickPrompt}>Choose alert type:</Text>
              {TYPE_OPTIONS.map(({ key, label, iconName, color, desc }) => (
                <Pressable
                  key={key}
                  onPress={() => setStep(key)}
                  style={({ pressed }) => [s.typeOptionBtn, pressed && s.typeOptionBtnPressed]}
                >
                  <View style={[s.typeIconBox, { backgroundColor: color + "18" }]}>
                    <Ionicons name={iconName as "layers-outline"} size={15} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.typeOptionLabel}>{label}</Text>
                    <Text style={s.typeOptionDesc}>{desc}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="rgba(167,184,169,0.3)" />
                </Pressable>
              ))}
            </View>
          )}

          {/* Step: form fields */}
          {step !== "pick" && (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={{ gap: 12 }}>
                {/* Symbol + TF */}
                <View style={s.formRow2}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fieldLabel}>SYMBOL</Text>
                    <WatchlistSymbolPicker
                      value={form.symbol}
                      onChange={sym => setForm(f => ({ ...f, symbol: sym }))}
                    />
                  </View>
                  {step !== "price" && (
                    <View style={{ flex: 1 }}>
                      <Text style={s.fieldLabel}>TIMEFRAME</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection: "row", gap: 5 }}>
                          {TIMEFRAMES.map(t => {
                            const active = form.timeframe === t;
                            return (
                              <Pressable
                                key={t}
                                onPress={() => setForm(f => ({ ...f, timeframe: t }))}
                                style={[s.tfPill, active && s.tfPillActive]}
                              >
                                <Text style={[s.tfPillText, active && s.tfPillTextActive]}>{t}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  )}
                </View>

                {/* Price fields */}
                {step === "price" && (
                  <>
                    <View>
                      <Text style={s.fieldLabel}>CONDITION</Text>
                      <View style={s.condRow}>
                        {(["above", "below", "touch"] as const).map(c => (
                          <Pressable
                            key={c}
                            onPress={() => setForm(f => ({ ...f, condition: c }))}
                            style={[s.condPill,
                              form.condition === c && s.condPillActive]}
                          >
                            <Text style={[s.condPillText,
                              form.condition === c && s.condPillTextActive]}>
                              {c.charAt(0).toUpperCase() + c.slice(1)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                    <View>
                      <Text style={s.fieldLabel}>TARGET PRICE</Text>
                      <TextInput
                        value={form.targetPrice}
                        onChangeText={v => setForm(f => ({ ...f, targetPrice: v }))}
                        placeholder="e.g. 18750"
                        placeholderTextColor="rgba(167,184,169,0.3)"
                        keyboardType="decimal-pad"
                        style={s.fieldInput}
                      />
                    </View>
                  </>
                )}

                {/* Zone fields */}
                {step === "zone" && (
                  <>
                    <View>
                      <Text style={s.fieldLabel}>ZONE TYPE</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection: "row", gap: 5 }}>
                          {ZONE_TYPES.map(z => {
                            const active = form.zoneType === z;
                            return (
                              <Pressable
                                key={z}
                                onPress={() => setForm(f => ({ ...f, zoneType: z }))}
                                style={[s.tfPill, active && s.tfPillActive]}
                              >
                                <Text style={[s.tfPillText, active && s.tfPillTextActive]}>
                                  {z.replace(/_/g, " ")}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                    <View style={s.formRow2}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.fieldLabel}>UPPER PRICE</Text>
                        <TextInput
                          value={form.upperPrice}
                          onChangeText={v => setForm(f => ({ ...f, upperPrice: v }))}
                          placeholder="Upper"
                          placeholderTextColor="rgba(167,184,169,0.3)"
                          keyboardType="decimal-pad"
                          style={s.fieldInput}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.fieldLabel}>LOWER PRICE</Text>
                        <TextInput
                          value={form.lowerPrice}
                          onChangeText={v => setForm(f => ({ ...f, lowerPrice: v }))}
                          placeholder="Lower"
                          placeholderTextColor="rgba(167,184,169,0.3)"
                          keyboardType="decimal-pad"
                          style={s.fieldInput}
                        />
                      </View>
                    </View>
                  </>
                )}

                {/* Trendline fields */}
                {step === "trendline" && (
                  <View style={s.formRow2}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.fieldLabel}>POINT 1 PRICE</Text>
                      <TextInput
                        value={form.p1Price}
                        onChangeText={v => setForm(f => ({ ...f, p1Price: v }))}
                        placeholder="e.g. 18100"
                        placeholderTextColor="rgba(167,184,169,0.3)"
                        keyboardType="decimal-pad"
                        style={s.fieldInput}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.fieldLabel}>POINT 2 PRICE</Text>
                      <TextInput
                        value={form.p2Price}
                        onChangeText={v => setForm(f => ({ ...f, p2Price: v }))}
                        placeholder="e.g. 18500"
                        placeholderTextColor="rgba(167,184,169,0.3)"
                        keyboardType="decimal-pad"
                        style={s.fieldInput}
                      />
                    </View>
                  </View>
                )}

                {/* Notes */}
                <View>
                  <Text style={s.fieldLabel}>NOTES (OPTIONAL)</Text>
                  <TextInput
                    value={form.notes}
                    onChangeText={v => setForm(f => ({ ...f, notes: v }))}
                    placeholder="Alert notes..."
                    placeholderTextColor="rgba(167,184,169,0.3)"
                    multiline
                    numberOfLines={2}
                    textAlignVertical="top"
                    style={s.notesInput}
                  />
                </View>

                {/* Footer buttons */}
                <View style={[s.editFooter, { marginTop: 2 }]}>
                  <Pressable onPress={() => setStep("pick")} style={s.cancelBtn}>
                    <Text style={s.cancelBtnText}>Back</Text>
                  </Pressable>
                  <Pressable onPress={handleCreate} style={[s.saveBtn, { flex: 2 }]}>
                    <Text style={s.saveBtnText}>Create Alert</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Alert Sheet Content (BottomSheet body — no Modal wrapper) ──────────────────
// Used by AlertSheet in MobileChartLayout. All sub-components (AlertCard,
// EditAlertModal, QuickCreateModal) are reused.
export function AlertSheetContent({ onClose: _onClose }: { onClose: () => void }) {
  const { alerts, addAlert, updateAlert, deleteAlert: storeDelete } = useAlertStore();
  const [filter, setFilter] = useState<FilterValue>("all");
  const [query, setQuery] = useState("");
  const [editTarget, setEditTarget] = useState<AnyAlert | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const filtered = alerts.filter(a => {
    if (filter !== "all" && a.status !== filter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      a.symbol.toLowerCase().includes(q) ||
      a.type.includes(q) ||
      a.condition.includes(q) ||
      (a.notes || "").toLowerCase().includes(q)
    );
  });

  const handlePause  = useCallback((id: string) => {
    updateAlert(id, { status: "paused" as AlertStatus });
    toast.info("Alert paused", { description: "Alert will no longer trigger until resumed." });
  }, [updateAlert]);

  const handleResume = useCallback((id: string) => {
    updateAlert(id, { status: "active" as AlertStatus });
    toast.success("Alert resumed", { description: "Alert engine restarted." });
  }, [updateAlert]);

  const handleDelete = useCallback((id: string, symbol: string) => {
    storeDelete(id);
    toast.error("Alert deleted", { description: `${symbol} alert removed.` });
  }, [storeDelete]);

  const handleSaveEdit = useCallback((updated: AnyAlert) => {
    updateAlert(updated.id, updated);
    toast.success("Alert updated");
  }, [updateAlert]);

  const handleCreate = useCallback((a: AnyAlert) => {
    addAlert(a);
    setTriggeringId(a.id);
    setTimeout(() => setTriggeringId(null), 1200);
    toast.success("Alert created", { description: `${a.symbol} ${a.type} alert is now active.` });
  }, [addAlert]);

  const counts = {
    all: alerts.length,
    active: alerts.filter(a => a.status === "active").length,
    triggered: alerts.filter(a => a.status === "triggered").length,
    paused: alerts.filter(a => a.status === "paused").length,
    expired: alerts.filter(a => a.status === "expired").length,
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Sticky header */}
      <View style={s.sheetHeader}>
        {/* Summary + create */}
        <View style={s.sheetSummaryRow}>
          <Text style={s.sheetSummaryText}>
            {counts.active} active · {counts.triggered} triggered · {counts.paused} paused
          </Text>
          <Pressable onPress={() => setShowCreate(true)} style={s.createBtn}>
            <Ionicons name="add" size={12} color="#B7FF5A" />
            <Text style={s.createBtnText}>Create Alert</Text>
          </Pressable>
        </View>

        {/* Search */}
        <View style={s.searchBox}>
          <Ionicons name="search" size={13} color="rgba(167,184,169,0.3)" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search alerts..."
            placeholderTextColor="rgba(167,184,169,0.35)"
            style={s.searchInput}
          />
        </View>

        {/* Filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll}>
          <View style={s.filterRow}>
            {FILTER_OPTIONS.map(opt => {
              const active = filter === opt.value;
              const count = counts[opt.value];
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setFilter(opt.value)}
                  style={[s.filterPill, active && s.filterPillActive]}
                >
                  <Text style={[s.filterPillText, active && s.filterPillTextActive]}>{opt.label}</Text>
                  {count > 0 && (
                    <View style={[s.filterCount, active && s.filterCountActive]}>
                      <Text style={s.filterCountText}>{count}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Alert list */}
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
        {filtered.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIconBox}>
              <Ionicons name="notifications-outline" size={24} color="rgba(167,184,169,0.25)" />
            </View>
            <Text style={s.emptyTitle}>
              {query || filter !== "all" ? "No matching alerts" : "No Active Alerts"}
            </Text>
            <Text style={s.emptySubtitle}>
              {query || filter !== "all"
                ? "Try adjusting your search or filter"
                : "Create your first alert to get started"}
            </Text>
            {!query && filter === "all" && (
              <Pressable onPress={() => setShowCreate(true)} style={s.emptyCreateBtn}>
                <Ionicons name="add" size={13} color="#B7FF5A" />
                <Text style={s.createBtnText}>Create First Alert</Text>
              </Pressable>
            )}
          </View>
        ) : (
          filtered.map(alert => (
            <AlertCard
              key={alert.id}
              alert={alert}
              triggering={triggeringId === alert.id}
              onPause={() => handlePause(alert.id)}
              onResume={() => handleResume(alert.id)}
              onDelete={() => handleDelete(alert.id, alert.symbol)}
              onEdit={() => setEditTarget(alert)}
            />
          ))
        )}

        {/* Footer */}
        <View style={s.listFooter}>
          <Text style={s.listFooterLeft}>
            {filtered.length} of {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
          </Text>
          <Text style={s.listFooterRight}>Alerts persist across sessions</Text>
        </View>
      </ScrollView>

      {/* Sub-modals */}
      {editTarget && (
        <EditAlertModal
          alert={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleSaveEdit}
        />
      )}
      {showCreate && (
        <QuickCreateModal
          onClose={() => setShowCreate(false)}
          onSave={handleCreate}
        />
      )}
    </View>
  );
}

// ── Main AlertCenterModal ──────────────────────────────────────────────────────
export interface AlertCenterModalProps {
  onClose: () => void;
}

export default function AlertCenterModal({ onClose }: AlertCenterModalProps) {
  const { alerts, addAlert, updateAlert, deleteAlert: storeDelete } = useAlertStore();
  const [filter, setFilter] = useState<FilterValue>("all");
  const [query, setQuery] = useState("");
  const [editTarget, setEditTarget] = useState<AnyAlert | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const filtered = alerts.filter(a => {
    if (filter !== "all" && a.status !== filter) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      a.symbol.toLowerCase().includes(q) ||
      a.type.includes(q) ||
      a.condition.includes(q) ||
      (a.notes || "").toLowerCase().includes(q)
    );
  });

  const handlePause = useCallback((id: string) => {
    updateAlert(id, { status: "paused" as AlertStatus });
    toast.info("Alert paused", { description: "Alert will no longer trigger until resumed." });
  }, [updateAlert]);

  const handleResume = useCallback((id: string) => {
    updateAlert(id, { status: "active" as AlertStatus });
    toast.success("Alert resumed", { description: "Alert engine restarted." });
  }, [updateAlert]);

  const handleDelete = useCallback((id: string, symbol: string) => {
    storeDelete(id);
    toast.error("Alert deleted", { description: `${symbol} alert removed.` });
  }, [storeDelete]);

  const handleSaveEdit = useCallback((updated: AnyAlert) => {
    updateAlert(updated.id, updated);
    toast.success("Alert updated");
  }, [updateAlert]);

  const handleCreate = useCallback((a: AnyAlert) => {
    addAlert(a);
    setTriggeringId(a.id);
    setTimeout(() => setTriggeringId(null), 1200);
    toast.success("Alert created", { description: `${a.symbol} ${a.type} alert is now active.` });
  }, [addAlert]);

  const counts = {
    all: alerts.length,
    active: alerts.filter(a => a.status === "active").length,
    triggered: alerts.filter(a => a.status === "triggered").length,
    paused: alerts.filter(a => a.status === "paused").length,
    expired: alerts.filter(a => a.status === "expired").length,
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFillObject, s.mainBackdrop]} onPress={onClose}>
        <Pressable onPress={() => {}} style={s.mainPanel}>
          {/* ── Header ── */}
          <View style={s.mainHeader}>
            <View style={s.mainHeaderIcon}>
              <Ionicons name="notifications-outline" size={16} color="#B7FF5A" />
            </View>
            <View>
              <Text style={s.mainHeaderTitle}>Alerts Center</Text>
              <Text style={s.mainHeaderSubtitle}>
                {counts.active} active · {counts.triggered} triggered · {counts.paused} paused
              </Text>
            </View>

            <View style={s.mainHeaderActions}>
              <Pressable onPress={() => setShowCreate(true)} style={s.createBtn}>
                <Ionicons name="add" size={13} color="#B7FF5A" />
                <Text style={s.createBtnText}>Create Alert</Text>
              </Pressable>
              <Pressable onPress={onClose} hitSlop={8} style={s.mainCloseBtn}>
                <Ionicons name="close" size={14} color="rgba(167,184,169,0.5)" />
              </Pressable>
            </View>
          </View>

          {/* ── Search + Filters ── */}
          <View style={s.mainSearchSection}>
            <View style={s.searchBox}>
              <Ionicons name="search" size={13} color="rgba(167,184,169,0.3)" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search alerts..."
                placeholderTextColor="rgba(167,184,169,0.35)"
                style={s.searchInput}
              />
            </View>
            <View style={s.filterRow}>
              {FILTER_OPTIONS.map(opt => {
                const active = filter === opt.value;
                const count = counts[opt.value];
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setFilter(opt.value)}
                    style={[s.filterPill, active && s.filterPillActive]}
                  >
                    <Text style={[s.filterPillText, active && s.filterPillTextActive]}>{opt.label}</Text>
                    {count > 0 && (
                      <View style={[s.filterCount, active && s.filterCountActive]}>
                        <Text style={s.filterCountText}>{count}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Alert List ── */}
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
            {filtered.length === 0 ? (
              <View style={[s.emptyState, { minHeight: 260 }]}>
                <View style={[s.emptyIconBox, { width: 60, height: 60, borderRadius: 18 }]}>
                  <Ionicons name="notifications-outline" size={26} color="rgba(167,184,169,0.25)" />
                </View>
                <Text style={s.emptyTitle}>
                  {query || filter !== "all" ? "No matching alerts" : "No Active Alerts"}
                </Text>
                <Text style={s.emptySubtitle}>
                  {query || filter !== "all"
                    ? "Try adjusting your search or filter"
                    : "Create your first alert to get started"}
                </Text>
                {!query && filter === "all" && (
                  <Pressable onPress={() => setShowCreate(true)} style={[s.emptyCreateBtn, { marginTop: 4 }]}>
                    <Ionicons name="add" size={13} color="#B7FF5A" />
                    <Text style={s.createBtnText}>Create First Alert</Text>
                  </Pressable>
                )}
              </View>
            ) : (
              filtered.map(alert => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  triggering={triggeringId === alert.id}
                  onPause={() => handlePause(alert.id)}
                  onResume={() => handleResume(alert.id)}
                  onDelete={() => handleDelete(alert.id, alert.symbol)}
                  onEdit={() => setEditTarget(alert)}
                />
              ))
            )}
          </ScrollView>

          {/* ── Footer ── */}
          <View style={s.mainFooter}>
            <Text style={s.listFooterLeft}>
              {filtered.length} of {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
            </Text>
            <Text style={s.listFooterRight}>Alerts persist across sessions</Text>
          </View>
        </Pressable>
      </Pressable>

      {/* Sub-modals (rendered inside the main Modal) */}
      {editTarget && (
        <EditAlertModal
          alert={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleSaveEdit}
        />
      )}
      {showCreate && (
        <QuickCreateModal
          onClose={() => setShowCreate(false)}
          onSave={handleCreate}
        />
      )}
    </Modal>
  );
}

// ── StyleSheet ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Badges
  badge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20,
    borderWidth: 1,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
  typeBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
  },
  typeBadgeText: { fontSize: 10, fontWeight: "700" },

  // Action button
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7,
  },
  actionBtnLabel: { fontSize: 10, fontWeight: "700" },

  // Alert card
  cardRow: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)",
  },
  cardRowTriggering: { backgroundColor: "rgba(183,255,90,0.06)" },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  cardSymbol: { fontSize: 13, fontWeight: "800", color: "#F3FFF3", fontFamily: "monospace" },
  cardTimestamp: { flexDirection: "row", alignItems: "center", gap: 3, marginLeft: "auto" as const },
  cardTimestampText: { fontSize: 10, color: "rgba(167,184,169,0.4)" },
  cardDetailRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  cardDescRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  cardCondLabel: { fontSize: 10.5, color: "rgba(167,184,169,0.55)", fontWeight: "600" },
  cardDesc: { fontSize: 11, color: "#D3DEDA", fontWeight: "700", fontFamily: "monospace" },
  cardTfBadge: {
    backgroundColor: "rgba(57,91,67,0.2)", borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  cardTfText: { fontSize: 9, fontWeight: "700", color: "rgba(167,184,169,0.4)" },
  cardNotes: { fontSize: 10, color: "rgba(167,184,169,0.45)" },
  cardTriggeredRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 },
  cardTriggeredText: { fontSize: 9.5, color: "#B7FF5A", fontWeight: "700" },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 5 },

  // Edit sub-modal
  subBackdrop: {
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
  },
  editPanel: {
    width: 380, borderRadius: 16,
    backgroundColor: "#0F1618",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    padding: 20,
  },
  editHeader: {
    flexDirection: "row", alignItems: "center", marginBottom: 16,
  },
  editIconBox: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: "rgba(183,255,90,0.1)",
    borderWidth: 1, borderColor: "rgba(183,255,90,0.2)",
    alignItems: "center", justifyContent: "center", marginRight: 10,
  },
  editTitle: { fontSize: 13, fontWeight: "800", color: "#F3FFF3" },
  editSubtitle: { fontSize: 10, color: "rgba(167,184,169,0.45)" },
  editCloseBtn: {
    marginLeft: "auto" as const, width: 28, height: 28, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  editSection: { marginBottom: 14 },
  statusRow: { flexDirection: "row", gap: 6 },
  statusPill: {
    flex: 1, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  statusPillText: { fontSize: 10, fontWeight: "700" },
  editFooter: { flexDirection: "row", gap: 8 },
  cancelBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 9,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center", justifyContent: "center",
  },
  cancelBtnText: { fontSize: 11, fontWeight: "700", color: "rgba(167,184,169,0.55)" },
  saveBtn: {
    flex: 2, paddingVertical: 8, borderRadius: 9,
    backgroundColor: "rgba(183,255,90,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  saveBtnText: { fontSize: 11, fontWeight: "700", color: "#B7FF5A" },
  notesInput: {
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 9, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)", color: "#F3FFF3",
    fontSize: 11, minHeight: 70,
  },

  // Symbol picker button
  symBtn: {
    height: 34, paddingHorizontal: 10, borderRadius: 8,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  symBtnText: { fontSize: 11, fontWeight: "700", color: "#F3FFF3", letterSpacing: 0.5 },

  // Symbol picker panel (modal)
  symPickerPanel: {
    width: 320, maxHeight: 360, borderRadius: 10,
    backgroundColor: "#0D1416",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  symSearchRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    padding: 8,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 7,
    margin: 8,
  },
  symSearchInput: {
    flex: 1, color: "#F3FFF3", fontSize: 11,
    paddingVertical: 0,
  },
  symEmpty: { padding: 16, alignItems: "center" },
  symEmptyText: { fontSize: 11, color: "rgba(167,184,169,0.4)" },
  symGroupLabel: {
    paddingHorizontal: 10, paddingTop: 6, paddingBottom: 3,
    fontSize: 9, fontWeight: "800", color: "rgba(167,184,169,0.35)",
    letterSpacing: 1, textTransform: "uppercase",
  },
  symItem: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderLeftWidth: 2, borderLeftColor: "transparent",
  },
  symItemActive: {
    backgroundColor: "rgba(183,255,90,0.07)",
    borderLeftColor: "rgba(183,255,90,0.5)",
  },
  symItemPressed: { backgroundColor: "rgba(255,255,255,0.04)" },
  symBadge: {
    backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1, minWidth: 28, alignItems: "center",
  },
  symBadgeText: { fontSize: 9, fontWeight: "800", color: "rgba(167,184,169,0.5)" },
  symItemLabel: { flex: 1, fontSize: 11, fontWeight: "500", color: "#F3FFF3" },
  symItemLabelActive: { fontWeight: "700" },

  // Create modal
  createPanel: {
    width: 400, borderRadius: 16, maxHeight: 600,
    backgroundColor: "#0F1618",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    padding: 20,
  },
  pickPrompt: { fontSize: 11, color: "rgba(167,184,169,0.5)", marginBottom: 4 },
  typeOptionBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  typeOptionBtnPressed: { backgroundColor: "rgba(255,255,255,0.05)" },
  typeIconBox: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  typeOptionLabel: { fontSize: 12, fontWeight: "700", color: "#F3FFF3" },
  typeOptionDesc: { fontSize: 10, color: "rgba(167,184,169,0.45)" },
  formRow2: { flexDirection: "row", gap: 10 },
  fieldLabel: {
    marginBottom: 5, fontSize: 10, fontWeight: "700",
    color: "rgba(167,184,169,0.5)", textTransform: "uppercase",
    letterSpacing: 1,
  },
  fieldInput: {
    height: 34, paddingHorizontal: 10, borderRadius: 8,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)", color: "#F3FFF3",
    fontSize: 11,
  },
  tfPill: {
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "transparent",
  },
  tfPillActive: {
    borderColor: "rgba(183,255,90,0.35)",
    backgroundColor: "rgba(183,255,90,0.12)",
  },
  tfPillText: { fontSize: 10, fontWeight: "700", color: "rgba(167,184,169,0.5)" },
  tfPillTextActive: { color: "#B7FF5A" },
  condRow: { flexDirection: "row", gap: 6 },
  condPill: {
    flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "transparent",
  },
  condPillActive: {
    borderColor: "rgba(96,165,250,0.4)",
    backgroundColor: "rgba(96,165,250,0.15)",
  },
  condPillText: { fontSize: 10, fontWeight: "700", color: "rgba(167,184,169,0.5)" },
  condPillTextActive: { color: "#60a5fa" },

  // Sheet header
  sheetHeader: {
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)",
  },
  sheetSummaryRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8,
  },
  sheetSummaryText: { fontSize: 10, color: "rgba(167,184,169,0.4)" },
  createBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9,
    borderWidth: 1, borderColor: "rgba(183,255,90,0.28)",
    backgroundColor: "rgba(183,255,90,0.1)",
  },
  createBtnText: { fontSize: 11, fontWeight: "700", color: "#B7FF5A" },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 11, height: 34,
    borderRadius: 10, backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)",
  },
  searchInput: { flex: 1, color: "#F3FFF3", fontSize: 11.5, paddingVertical: 0 },
  filterScroll: { marginBottom: 10 },
  filterRow: {
    flexDirection: "row", gap: 6,
    paddingHorizontal: 16,
  },
  filterPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "transparent",
  },
  filterPillActive: {
    borderColor: "rgba(183,255,90,0.35)",
    backgroundColor: "rgba(183,255,90,0.12)",
  },
  filterPillText: { fontSize: 10.5, fontWeight: "700", color: "rgba(167,184,169,0.5)" },
  filterPillTextActive: { color: "#B7FF5A" },
  filterCount: {
    minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center", justifyContent: "center",
  },
  filterCountActive: { backgroundColor: "rgba(183,255,90,0.2)" },
  filterCountText: { fontSize: 9, fontWeight: "900", color: "#F3FFF3" },

  // Empty state
  emptyState: {
    alignItems: "center", justifyContent: "center",
    paddingHorizontal: 20, paddingVertical: 48, gap: 12,
  },
  emptyIconBox: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: "rgba(57,91,67,0.1)",
    borderWidth: 1, borderColor: "rgba(57,91,67,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: "rgba(167,184,169,0.5)" },
  emptySubtitle: { fontSize: 11, color: "rgba(167,184,169,0.28)", textAlign: "center" },
  emptyCreateBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(183,255,90,0.28)",
    backgroundColor: "rgba(183,255,90,0.08)",
  },

  // List footer
  listFooter: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.04)",
  },
  listFooterLeft: { fontSize: 10, color: "rgba(167,184,169,0.28)" },
  listFooterRight: { fontSize: 10, color: "rgba(167,184,169,0.2)" },

  // Main modal
  mainBackdrop: {
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center", justifyContent: "center",
  },
  mainPanel: {
    width: "95%", maxWidth: 720,
    height: "80%",
    borderRadius: 20,
    backgroundColor: "#0F1618",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  mainHeader: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)",
  },
  mainHeaderIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: "rgba(183,255,90,0.1)",
    borderWidth: 1, borderColor: "rgba(183,255,90,0.22)",
    alignItems: "center", justifyContent: "center",
  },
  mainHeaderTitle: { fontSize: 15, fontWeight: "800", color: "#F3FFF3" },
  mainHeaderSubtitle: { fontSize: 10, color: "rgba(167,184,169,0.4)" },
  mainHeaderActions: { flexDirection: "row", gap: 8, alignItems: "center", marginLeft: "auto" as const },
  mainCloseBtn: {
    width: 32, height: 32, borderRadius: 9,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center", justifyContent: "center",
  },
  mainSearchSection: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)",
    gap: 10,
  },
  mainFooter: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.04)",
  },
});
