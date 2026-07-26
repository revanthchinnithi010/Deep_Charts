/**
 * IndicatorsPanel.tsx — React Native port (Phase 10.4 Pass C)
 *
 * Migrated from src/components/charts/IndicatorsPanel.tsx
 *
 * Web → RN changes:
 *   lucide-react icons                   → Ionicons (@expo/vector-icons)
 *   createPortal + motion.div            → Modal (transparent, animationType="slide")
 *   anchorEl: HTMLElement | null         → anchorEl: unknown | null
 *                                           (presence = panel visible; DOM position
 *                                            is irrelevant on touch — panel is a sheet)
 *   AnimatedModal                        → Modal (transparent, animationType="fade")
 *   AnimatedList / AnimatedListItem      → plain View (animations deferred)
 *   position:fixed / getBoundingClientRect → removed (Modal handles overlay)
 *   window.addEventListener scroll/resize → removed (Modal overlay, not anchored)
 *   document.addEventListener pointerdown → Modal backdrop Pressable / onRequestClose
 *   maxHeight:80vh overflow-y:auto       → ScrollView
 *   position:sticky header               → View above ScrollView (outside scroll)
 *   onMouseEnter/Leave hover effects     → removed
 *   <input type="text">                  → TextInput
 *   <textarea>                           → TextInput multiline
 *   onFocus/onBlur border color          → local focusedField state
 *   opacity/transform delete animation   → instant removal (animations deferred)
 *   backdropFilter blur                  → rgba background only
 *   requestAnimationFrame mount fade     → Modal animationType
 *   setTimeout(removeIndicator, 260)     → immediate removeIndicator (no exit anim)
 *   X, TrendingUp, Trash2, Plus          → Ionicons
 *
 * Exports (unchanged):
 *   IndicatorsPanel (default export)
 */

import { memo, useState, useCallback } from "react";
import {
  View, Text, Pressable, ScrollView,
  StyleSheet, Modal, TextInput,
} from "react-native";
import { Trash2, TrendingUp, X, Plus } from "lucide-react-native";
import { useIndicatorStore, type IndicatorType } from "@/store/indicatorStore";

// ── WaveTrend built-in Pine Script ────────────────────────────────────────────

const WAVETREND_CODE = `//@version=6
indicator(title="WaveTrend [Revanth]", shorttitle="WT_LB", overlay=false)
n1 = input.int(10, "Channel Length")
n2 = input.int(21, "Average Length")
obLevel1 = input.int(60, "Over Bought Level 1")
obLevel2 = input.int(53, "Over Bought Level 2")
osLevel1 = input.int(-60, "Over Sold Level 1")
osLevel2 = input.int(-53, "Over Sold Level 2")
ap = hlc3
esa = ta.ema(ap, n1)
d = ta.ema(math.abs(ap - esa), n1)
ci = (ap - esa) / (0.015 * d)
tci = ta.ema(ci, n2)
wt1 = tci
wt2 = ta.sma(wt1, 4)
plot(wt1, color=color.green)
plot(wt2, color=color.red)
plot(wt1 - wt2, color=color.new(color.blue, 80), style=plot.style_area)`;

// ── Preset lists ──────────────────────────────────────────────────────────────

const EMA_PRESETS = [
  { period: 9,   color: "#f59e0b" },
  { period: 21,  color: "#38bdf8" },
  { period: 50,  color: "#a78bfa" },
  { period: 100, color: "#fb923c" },
  { period: 200, color: "#f87171" },
];

const SMA_PRESETS = [
  { period: 20,  color: "#60a5fa" },
  { period: 50,  color: "#818cf8" },
  { period: 200, color: "#c084fc" },
];

const OTHER_PRESETS: { type: IndicatorType; label: string; color: string; settings: Record<string, unknown> }[] = [
  { type: "RSI",        label: "RSI (14)",   color: "#c084fc", settings: { period: 14 } },
  { type: "VWAP",       label: "VWAP",       color: "#60a5fa", settings: {} },
  { type: "SUPERTREND", label: "Supertrend", color: "#22c55e", settings: { period: 10, multiplier: 3 } },
];

// ── Custom indicator modal ────────────────────────────────────────────────────

interface CustomModalProps { onClose: () => void; onAdd: (name: string, pineCode: string) => void; }

const CustomIndicatorModal = memo(function CustomIndicatorModal({ onClose, onAdd }: CustomModalProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [focusedField, setFocusedField] = useState<"name" | "code" | null>(null);

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), code.trim());
    onClose();
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={cm.backdrop} onPress={onClose} />
      <View style={cm.card}>
        {/* Header */}
        <View style={cm.header}>
          <Text style={cm.headerTitle}>Custom Indicator</Text>
          <Pressable onPress={onClose} hitSlop={8} style={cm.closeBtn}>
            <Text style={cm.closeX}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={cm.body} keyboardShouldPersistTaps="handled">
          {/* Name field */}
          <View style={cm.fieldGroup}>
            <Text style={cm.label}>Indicator Name</Text>
            <TextInput
              style={[cm.input, focusedField === "name" && cm.inputFocused]}
              value={name}
              onChangeText={setName}
              placeholder="e.g. My EMA, BOS, FVG"
              placeholderTextColor="rgba(209,212,220,0.3)"
              onFocus={() => setFocusedField("name")}
              onBlur={() => setFocusedField(null)}
            />
          </View>

          {/* Pine Script field */}
          <View style={cm.fieldGroup}>
            <Text style={cm.label}>Pine Script Code</Text>
            <Text style={cm.hint}>
              Supports: ta.ema, ta.sma, ta.rsi, ta.vwap, BOS/CHoCH, FVG, OB, Liquidity
            </Text>
            <TextInput
              style={[cm.textarea, focusedField === "code" && cm.inputFocused]}
              value={code}
              onChangeText={setCode}
              multiline
              numberOfLines={8}
              placeholder={`indicator("My Strategy")\n\n// Detects BOS/CHoCH automatically\n// FVG, Order Blocks, Liquidity\n// or: plot(ta.ema(close, 200))`}
              placeholderTextColor="rgba(209,212,220,0.25)"
              textAlignVertical="top"
              onFocus={() => setFocusedField("code")}
              onBlur={() => setFocusedField(null)}
            />
          </View>

          {/* Actions */}
          <View style={cm.actions}>
            <Pressable onPress={onClose} style={cm.cancelBtn}>
              <Text style={cm.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleAdd}
              disabled={!name.trim()}
              style={[cm.addBtn, !name.trim() && cm.addBtnDisabled]}
            >
              <Text style={[cm.addText, !name.trim() && cm.addTextDisabled]}>
                Add Indicator
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
});

const cm = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  card: {
    position: "absolute",
    top: "15%" as any,
    left: 16,
    right: 16,
    backgroundColor: "#131722",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    overflow: "hidden",
    maxHeight: "75%" as any,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#d1d4dc",
  },
  closeBtn: {
    padding: 4,
    borderRadius: 6,
  },
  closeX: {
    fontSize: 14,
    color: "rgba(255,255,255,0.4)",
  },
  body: {
    padding: 16,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(167,184,169,0.7)",
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  hint: {
    fontSize: 10,
    color: "rgba(255,255,255,0.3)",
    lineHeight: 15,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 12,
    color: "#d1d4dc",
  },
  textarea: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    color: "#d1d4dc",
    fontFamily: "monospace",
    lineHeight: 19,
    minHeight: 140,
    textAlignVertical: "top",
  },
  inputFocused: {
    borderColor: "rgba(41,98,255,0.6)",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  cancelBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cancelText: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
  },
  addBtn: {
    backgroundColor: "rgba(34,197,94,0.15)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.5)",
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  addBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.08)",
  },
  addText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#22c55e",
  },
  addTextDisabled: {
    color: "rgba(255,255,255,0.3)",
  },
});

// ── Helper sub-components ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <View style={sl.wrapper}>
      <Text style={sl.text}>{children as string}</Text>
    </View>
  );
}

const sl = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 2,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.04)",
  },
  text: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    color: "rgba(167,184,169,0.38)",
    textTransform: "uppercase",
  },
});

function PresetRow({ color, label, applied, isDeleting, onAdd, onDelete, customBadge, paneBadge }: {
  color: string; label: string; applied: boolean; isDeleting: boolean;
  onAdd?: () => void; onDelete?: () => void; customBadge?: boolean; paneBadge?: boolean;
}) {
  return (
    <View style={[pr.row, isDeleting && pr.rowDeleting]}>
      <Pressable
        onPress={() => { if (!applied) onAdd?.(); }}
        style={[pr.mainBtn, applied && pr.mainBtnApplied]}
      >
        <View style={[pr.colorDot, { backgroundColor: color }]} />
        <Text style={pr.labelText} numberOfLines={1}>{label}</Text>
        {applied && !customBadge && !paneBadge && (
          <Text style={pr.activeBadge}>active</Text>
        )}
        {customBadge && (
          <Text style={pr.customBadge}>custom</Text>
        )}
        {paneBadge && !applied && (
          <View style={pr.paneBadgeBox}>
            <Text style={pr.paneBadgeText}>pane</Text>
          </View>
        )}
        {paneBadge && applied && (
          <Text style={pr.activeBadge}>active</Text>
        )}
      </Pressable>

      {applied && onDelete && (
        <Pressable
          onPress={onDelete}
          hitSlop={6}
          style={pr.deleteBtn}
        >
          <Trash2 size={12} color="rgba(255,255,255,0.25)" />
        </Pressable>
      )}
    </View>
  );
}

const pr = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowDeleting: {
    opacity: 0,
  },
  mainBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  mainBtnApplied: {
    opacity: 0.55,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  labelText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#d1d4dc",
  },
  activeBadge: {
    fontSize: 10,
    color: "rgba(255,255,255,0.3)",
    marginLeft: "auto",
  },
  customBadge: {
    fontSize: 9,
    color: "rgba(34,197,94,0.6)",
    marginLeft: "auto",
  },
  paneBadgeBox: {
    marginLeft: "auto",
    backgroundColor: "rgba(56,189,248,0.08)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  paneBadgeText: {
    fontSize: 9,
    color: "rgba(56,189,248,0.65)",
  },
  deleteBtn: {
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 6,
    flexShrink: 0,
  },
});

// ── Main panel ────────────────────────────────────────────────────────────────

// On web, anchorEl is HTMLElement | null — presence drives visibility, position
// drives panel coordinates. On RN there are no DOM elements; presence alone
// drives visibility and the panel renders as a bottom sheet Modal.
interface Props { anchorEl: unknown | null; onClose: () => void; }

const IndicatorsPanel = memo(function IndicatorsPanel({ anchorEl, onClose }: Props) {
  const { appliedIndicators, addIndicator, removeIndicator } = useIndicatorStore();
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const handleDelete = useCallback((id: string) => {
    setDeletingIds(prev => new Set(prev).add(id));
    // Web used setTimeout(..., 260) for exit animation; on RN remove immediately
    removeIndicator(id);
    setDeletingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }, [removeIndicator]);

  const handleAddCustom = useCallback((name: string, pineCode: string) => {
    addIndicator("CUSTOM", name, { label: name, color: "#22c55e", settings: {}, pineCode });
  }, [addIndicator]);

  // EMA helpers
  const getAppliedEma   = (period: number) => appliedIndicators.find(i => i.type === "EMA"  && Number(i.settings.period) === period);
  // SMA helpers
  const getAppliedSma   = (period: number) => appliedIndicators.find(i => i.type === "SMA"  && Number(i.settings.period) === period);
  // Other built-ins
  const getAppliedOther = (type: IndicatorType) => appliedIndicators.find(i => i.type === type);
  // WaveTrend (stored as CUSTOM)
  const appliedWT = appliedIndicators.find(i => i.type === "CUSTOM" && (i.label === "WaveTrend" || (i.pineCode as string | undefined)?.includes("WaveTrend")));
  // Custom (excluding WaveTrend built-in)
  const customInds = appliedIndicators.filter(i => i.type === "CUSTOM" && i.id !== appliedWT?.id);

  // anchorEl presence drives visibility (same semantics as web)
  const visible = !!anchorEl;

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        {/* Backdrop */}
        <Pressable style={p.backdrop} onPress={onClose} />

        {/* Panel sheet */}
        <View style={p.sheet}>
          {/* Sticky header — sits above ScrollView */}
          <View style={p.header}>
            <View style={p.headerLeft}>
              <TrendingUp size={13} color="#2962FF" />
              <Text style={p.headerTitle}>Indicators</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={p.closeBtn}>
              <X size={12} color="rgba(255,255,255,0.4)" />
            </Pressable>
          </View>

          {/* Scrollable content */}
          <ScrollView
            style={p.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* EMA section */}
            <SectionLabel>Moving Averages (EMA)</SectionLabel>
            <View style={p.section}>
              {EMA_PRESETS.map(({ period, color }) => {
                const ind = getAppliedEma(period);
                const isDeleting = ind ? deletingIds.has(ind.id) : false;
                return (
                  <PresetRow
                    key={period}
                    color={color}
                    label={`EMA ${period}`}
                    applied={!!ind}
                    isDeleting={isDeleting}
                    onAdd={() => { addIndicator("EMA", "EMA", { color, settings: { period, source: "close", offset: 0 }, label: `EMA (${period})` }); onClose(); }}
                    onDelete={ind ? () => handleDelete(ind.id) : undefined}
                  />
                );
              })}
            </View>

            {/* SMA section */}
            <SectionLabel>Moving Averages (SMA)</SectionLabel>
            <View style={p.section}>
              {SMA_PRESETS.map(({ period, color }) => {
                const ind = getAppliedSma(period);
                const isDeleting = ind ? deletingIds.has(ind.id) : false;
                return (
                  <PresetRow
                    key={period}
                    color={color}
                    label={`SMA ${period}`}
                    applied={!!ind}
                    isDeleting={isDeleting}
                    onAdd={() => { addIndicator("SMA", "SMA", { color, settings: { period, source: "close", offset: 0 }, label: `SMA (${period})` }); onClose(); }}
                    onDelete={ind ? () => handleDelete(ind.id) : undefined}
                  />
                );
              })}
            </View>

            {/* Other built-ins */}
            <SectionLabel>Oscillators & Overlays</SectionLabel>
            <View style={p.section}>
              {OTHER_PRESETS.map(({ type, label, color, settings }) => {
                const ind = getAppliedOther(type);
                const isDeleting = ind ? deletingIds.has(ind.id) : false;
                return (
                  <PresetRow
                    key={type}
                    color={color}
                    label={label}
                    applied={!!ind}
                    isDeleting={isDeleting}
                    onAdd={() => { addIndicator(type, label, { color, settings, label }); onClose(); }}
                    onDelete={ind ? () => handleDelete(ind.id) : undefined}
                  />
                );
              })}

              {/* WaveTrend built-in */}
              {(() => {
                const isDeleting = appliedWT ? deletingIds.has(appliedWT.id) : false;
                return (
                  <PresetRow
                    key="WaveTrend"
                    color="#22c55e"
                    label="WaveTrend"
                    applied={!!appliedWT}
                    isDeleting={isDeleting}
                    paneBadge
                    onAdd={() => {
                      addIndicator("CUSTOM", "WaveTrend", { label: "WaveTrend", color: "#22c55e", settings: {}, pineCode: WAVETREND_CODE });
                      onClose();
                    }}
                    onDelete={appliedWT ? () => handleDelete(appliedWT.id) : undefined}
                  />
                );
              })()}
            </View>

            {/* Custom indicators */}
            {customInds.length > 0 && (
              <>
                <SectionLabel>Custom</SectionLabel>
                <View style={p.section}>
                  {customInds.map(ind => {
                    const isDeleting = deletingIds.has(ind.id);
                    return (
                      <PresetRow
                        key={ind.id}
                        color={ind.color}
                        label={ind.label}
                        applied
                        isDeleting={isDeleting}
                        customBadge
                        onDelete={() => handleDelete(ind.id)}
                      />
                    );
                  })}
                </View>
              </>
            )}

            {/* Add custom button */}
            <View style={p.addCustomWrapper}>
              <Pressable
                onPress={() => setShowCustomModal(true)}
                style={p.addCustomBtn}
              >
                <Plus size={12} color="#22c55e" />
                <Text style={p.addCustomText}>Add Custom Indicator</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {showCustomModal && (
        <CustomIndicatorModal
          onClose={() => setShowCustomModal(false)}
          onAdd={handleAddCustom}
        />
      )}
    </>
  );
});

const p = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "80%",
    backgroundColor: "#131722",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#131722",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#d1d4dc",
  },
  closeBtn: {
    padding: 3,
    borderRadius: 6,
  },
  scroll: {
    flex: 1,
  },
  section: {
    paddingVertical: 4,
  },
  addCustomWrapper: {
    padding: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  addCustomBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: "rgba(34,197,94,0.07)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.3)",
    borderRadius: 8,
  },
  addCustomText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#22c55e",
  },
});

export default IndicatorsPanel;
