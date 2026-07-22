/**
 * PositionToolbar.tsx — React Native port (Phase 9.21 Pass A)
 *
 * Migrated from src/components/charts/PositionToolbar.tsx
 *
 * Web → RN changes (Pass A):
 *   createPortal               → absolute View overlay (no portal in RN)
 *   window.innerWidth/Height   → Dimensions.get("screen")
 *   document.addEventListener  → Modal onRequestClose + Pressable backdrop
 *   <img src={svgUrl}>         → inline react-native-svg / Ionicons
 *   <input type="number">      → TextInput with keyboardType="numeric"
 *   <button>                   → Pressable
 *   HTMLDivElement refs        → View refs + ref.measure()
 *   getBoundingClientRect()    → View.measure()
 *   setPointerCapture          → PanResponder
 *   requestAnimationFrame      → requestAnimationFrame (same in RN)
 *   ColorPickerGlass           → inline preset-color picker Modal
 *   motion / animations        → removed (plain View; animation deferred)
 *   hover / mouse events       → removed
 *   userSelect: "none"         → no equivalent (RN default)
 *   backdropFilter             → no RN equivalent (elevation shadow instead)
 *   CSS @keyframes ptPop       → removed (deferred to Pass-B)
 *
 * Exports (unchanged):
 *   PositionToolbar (named export, memo)
 */

import { memo, useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, Pressable, TextInput, Modal, ScrollView,
  StyleSheet, Dimensions, PanResponder,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path, Rect, Line, Circle } from "react-native-svg";
import type { Drawing, DrawingStyle, DrawingPoint } from "@/types/drawing";

// ── Constants ──────────────────────────────────────────────────────────────────
const PROFIT_DEFAULT = "#089981";
const STOP_DEFAULT   = "#f23645";

const TIMEFRAME_OPTIONS = [
  { label: "1m",  value: "1"   },
  { label: "5m",  value: "5"   },
  { label: "15m", value: "15"  },
  { label: "30m", value: "30"  },
  { label: "1H",  value: "60"  },
  { label: "4H",  value: "240" },
  { label: "1D",  value: "D"   },
  { label: "1W",  value: "W"   },
];

const PRESET_COLORS = [
  "#B7FF5A", "#34d399", "#38bdf8", "#818cf8", "#f472b6",
  "#f59e0b", "#fb923c", "#f87171", "#e2e8f0", "#ffffff",
  "#089981", "#f23645", "#3b82f6", "#a855f7", "#64748b",
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function hexToRgba(hex: string, alpha: number): string {
  const h = (hex || PROFIT_DEFAULT).replace("#", "").slice(0, 6).padEnd(6, "0");
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Inline SVG icons ───────────────────────────────────────────────────────────
function IcoReverse({ c }: { c: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M7 16V4m0 0L3 8m4-4 4 4" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <Path d="M17 8v12m0 0 4-4m-4 4-4-4" stroke={c} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}
function IcoClone({ c }: { c: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Rect x="9" y="9" width="13" height="13" rx="2" stroke={c} strokeWidth="1.6"/>
      <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke={c} strokeWidth="1.6" strokeLinecap="round"/>
    </Svg>
  );
}
function IcoGrip({ c }: { c: string }) {
  const dots = [
    [4, 5], [4, 10], [4, 15],
    [9, 5], [9, 10], [9, 15],
  ];
  return (
    <Svg width={14} height={20} viewBox="0 0 14 20">
      {dots.map(([cx, cy], i) => (
        <Circle key={i} cx={cx} cy={cy} r={1.8} fill={c} />
      ))}
    </Svg>
  );
}
function IcoBucket({ c, barColor }: { c: string; barColor: string }) {
  return (
    <Svg width={18} height={20} viewBox="0 0 18 20">
      <Path d="M2 13 C2 8 16 8 16 13 C16 16.5 13 19 9 19 C5 19 2 16.5 2 13Z" stroke={c} strokeWidth="1.4" fill="none"/>
      <Line x1="9" y1="2" x2="9" y2="8" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <Line x1="5" y1="5" x2="13" y2="5" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <Line x1="3" y1="18" x2="15" y2="18" stroke={barColor} strokeWidth="3" strokeLinecap="round"/>
    </Svg>
  );
}
function IcoDots({ c }: { c: string }) {
  return (
    <Svg width={17} height={5} viewBox="0 0 17 5">
      <Circle cx={2.5} cy={2.5} r={2} fill={c}/>
      <Circle cx={8.5} cy={2.5} r={2} fill={c}/>
      <Circle cx={14.5} cy={2.5} r={2} fill={c}/>
    </Svg>
  );
}

// ── PtBtn — toolbar button ─────────────────────────────────────────────────────
function PtBtn({
  children, active = false, danger = false, onPress,
}: {
  children: React.ReactNode;
  active?: boolean;
  danger?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.ptBtn,
        active && styles.ptBtnActive,
        danger && styles.ptBtnDanger,
        pressed && styles.ptBtnPressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

function PtSep() {
  return <View style={styles.ptSep} />;
}

// ── Color picker Modal ─────────────────────────────────────────────────────────
function ColorPickerModal({
  visible, value, title, onSelect, onClose,
}: {
  visible: boolean; value: string; title: string;
  onSelect: (hex: string) => void; onClose: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <View style={styles.colorModal}>
        <View style={styles.colorModalHeader}>
          <Text style={styles.colorModalTitle}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={14} color="rgba(167,184,169,0.5)" />
          </Pressable>
        </View>
        <View style={styles.colorGrid}>
          {PRESET_COLORS.map(hex => (
            <Pressable
              key={hex}
              onPress={() => { onSelect(hex); onClose(); }}
              style={[
                styles.colorSwatch,
                { backgroundColor: hex },
                value === hex && styles.colorSwatchActive,
              ]}
            />
          ))}
        </View>
        {/* Current color preview */}
        <View style={styles.currentColorRow}>
          <View style={[styles.currentColorDot, { backgroundColor: value }]} />
          <Text style={styles.currentColorHex}>{value}</Text>
        </View>
      </View>
    </Modal>
  );
}

// ── More menu Modal ────────────────────────────────────────────────────────────
function MoreMenu({
  visible, isLocked, onDuplicate, onHide, onReverse, onLock, onClose,
}: {
  visible: boolean; isLocked: boolean;
  onDuplicate: () => void; onHide: () => void;
  onReverse: () => void; onLock: () => void; onClose: () => void;
}) {
  const items = [
    { label: "Clone",            icon: "copy-outline",                   action: onDuplicate, highlight: false },
    { label: "Reverse",          icon: "swap-vertical-outline",          action: onReverse,   highlight: false },
    { label: isLocked ? "Unlock" : "Lock", icon: isLocked ? "lock-open-outline" : "lock-closed-outline",
      action: onLock, highlight: isLocked },
    { label: "Hide",             icon: "eye-off-outline",                action: onHide,      highlight: false },
  ];

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <View style={styles.moreMenu}>
        {items.map(item => (
          <Pressable
            key={item.label}
            style={({ pressed }) => [styles.moreMenuItem, pressed && styles.moreMenuItemPressed]}
            onPress={() => { item.action(); onClose(); }}
          >
            <Ionicons
              name={item.icon as any}
              size={15}
              color={item.highlight ? "#B7FF5A" : "rgba(200,205,215,0.8)"}
            />
            <Text style={[styles.moreMenuLabel, item.highlight && styles.moreMenuLabelHighlight]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

// ── Settings Modal ─────────────────────────────────────────────────────────────
type SettingsTab = "inputs" | "style" | "visibility";

function PositionSettingsModal({
  visible, drawing, onUpdate, onUpdatePoints, onClose,
}: {
  visible: boolean;
  drawing: Drawing;
  onUpdate: (patch: Partial<DrawingStyle>) => void;
  onUpdatePoints: (pts: DrawingPoint[]) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("inputs");
  const S   = drawing.style;
  const pts = drawing.points;

  const [entryVal, setEntryVal] = useState(pts[0]?.price?.toString() ?? "");
  const [tpVal,    setTpVal]    = useState(pts[1]?.price?.toString() ?? "");
  const [slVal,    setSlVal]    = useState(pts[2]?.price?.toString() ?? (
    pts[0] && pts[1]
      ? (drawing.toolType === "position_long"
        ? (pts[0].price - Math.abs(pts[1].price - pts[0].price) * 0.5).toFixed(6)
        : (pts[0].price + Math.abs(pts[1].price - pts[0].price) * 0.5).toFixed(6))
      : ""
  ));

  const [showProfitCP, setShowProfitCP] = useState(false);
  const [showStopCP,   setShowStopCP]   = useState(false);

  const profitHex = S.profitColor ?? PROFIT_DEFAULT;
  const stopHex   = S.stopColor   ?? STOP_DEFAULT;

  // Reset local state when drawing changes
  useEffect(() => {
    setEntryVal(pts[0]?.price?.toString() ?? "");
    setTpVal(pts[1]?.price?.toString() ?? "");
    setSlVal(pts[2]?.price?.toString() ?? "");
    setTab("inputs");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing.id]);

  const commitEntry = useCallback(() => {
    const v = parseFloat(entryVal);
    if (isNaN(v)) { setEntryVal(pts[0]?.price?.toString() ?? ""); return; }
    const newPts = pts.map(p => ({ ...p }));
    if (newPts[0]) newPts[0] = { ...newPts[0], price: v };
    if (newPts[2]) newPts[2] = { ...newPts[2], price: v + (pts[2]?.price ?? 0) - (pts[0]?.price ?? 0) };
    onUpdatePoints(newPts);
  }, [entryVal, pts, onUpdatePoints]);

  const commitTp = useCallback(() => {
    const v = parseFloat(tpVal);
    if (isNaN(v)) { setTpVal(pts[1]?.price?.toString() ?? ""); return; }
    const newPts = pts.map(p => ({ ...p }));
    if (newPts[1]) newPts[1] = { ...newPts[1], price: v };
    onUpdatePoints(newPts);
  }, [tpVal, pts, onUpdatePoints]);

  const commitSl = useCallback(() => {
    const v = parseFloat(slVal);
    if (isNaN(v)) return;
    const newPts = pts.map(p => ({ ...p }));
    if (newPts[2]) newPts[2] = { ...newPts[2], price: v };
    else if (newPts[0]) newPts.push({ time: newPts[0].time, price: v });
    onUpdatePoints(newPts);
  }, [slVal, pts, onUpdatePoints]);

  const isTFVisible = (value: string) => {
    const vt = S.visibleTimeframes ?? [];
    return vt.length === 0 || vt.includes(value);
  };

  const toggleTF = (value: string) => {
    const cur = S.visibleTimeframes ?? [];
    let next: string[];
    if (cur.length === 0) {
      next = TIMEFRAME_OPTIONS.map(t => t.value).filter(v => v !== value);
    } else if (cur.includes(value)) {
      next = cur.filter(v => v !== value);
      if (next.length === TIMEFRAME_OPTIONS.length) next = [];
    } else {
      const added = [...cur, value];
      next = added.length === TIMEFRAME_OPTIONS.length ? [] : added;
    }
    onUpdate({ visibleTimeframes: next });
  };

  return (
    <>
      <Modal
        transparent
        visible={visible}
        animationType="none"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.settingsModal}>
          {/* Header */}
          <View style={styles.settingsHeader}>
            <View style={[styles.settingsHeaderDot, {
              backgroundColor: drawing.toolType === "position_long" ? "#089981" : "#f23645",
            }]} />
            <Text style={styles.settingsHeaderTitle}>
              {drawing.toolType === "position_long" ? "Long" : "Short"} Position
            </Text>
            <Pressable onPress={onClose} style={styles.settingsCloseBtn} hitSlop={8}>
              <Ionicons name="close" size={13} color="rgba(255,255,255,0.5)" />
            </Pressable>
          </View>

          {/* Tabs */}
          <View style={styles.tabBar}>
            {(["inputs", "style", "visibility"] as SettingsTab[]).map(t => (
              <Pressable key={t} style={styles.tabBtn} onPress={() => setTab(t)}>
                <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
                {tab === t && <View style={styles.tabUnderline} />}
              </Pressable>
            ))}
          </View>

          {/* Content */}
          <ScrollView style={styles.settingsContent} bounces={false} showsVerticalScrollIndicator={false}>
            {/* Inputs tab */}
            {tab === "inputs" && (
              <View style={{ paddingVertical: 4 }}>
                {[
                  { label: "Entry",       val: entryVal, set: setEntryVal, commit: commitEntry },
                  { label: "Take Profit", val: tpVal,    set: setTpVal,    commit: commitTp   },
                  { label: "Stop Loss",   val: slVal,    set: setSlVal,    commit: commitSl   },
                ].map(({ label, val, set, commit }) => (
                  <View key={label} style={styles.inputRow}>
                    <Text style={styles.inputLabel}>{label}</Text>
                    <TextInput
                      value={val}
                      onChangeText={set}
                      onBlur={commit}
                      onSubmitEditing={commit}
                      keyboardType="numeric"
                      style={styles.numInput}
                      placeholderTextColor="rgba(167,184,169,0.35)"
                      returnKeyType="done"
                    />
                  </View>
                ))}
              </View>
            )}

            {/* Style tab */}
            {tab === "style" && (
              <View style={{ paddingVertical: 4 }}>
                <View style={styles.inputRow}>
                  <Text style={styles.inputLabel}>Profit zone</Text>
                  <Pressable
                    onPress={() => { setShowProfitCP(true); setShowStopCP(false); }}
                    style={[styles.colorSwatch28, { backgroundColor: profitHex }]}
                  />
                </View>
                <View style={styles.inputRow}>
                  <Text style={styles.inputLabel}>Stop zone</Text>
                  <Pressable
                    onPress={() => { setShowStopCP(true); setShowProfitCP(false); }}
                    style={[styles.colorSwatch28, { backgroundColor: stopHex }]}
                  />
                </View>
              </View>
            )}

            {/* Visibility tab */}
            {tab === "visibility" && (
              <View style={styles.tfGrid}>
                {TIMEFRAME_OPTIONS.map(({ label, value }) => {
                  const on = isTFVisible(value);
                  return (
                    <Pressable
                      key={value}
                      onPress={() => toggleTF(value)}
                      style={[styles.tfChip, on && styles.tfChipOn]}
                    >
                      <Text style={[styles.tfChipLabel, on && styles.tfChipLabelOn]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Profit color picker */}
      <ColorPickerModal
        visible={showProfitCP}
        value={profitHex}
        title="Profit zone color"
        onSelect={c => onUpdate({ profitColor: c })}
        onClose={() => setShowProfitCP(false)}
      />
      {/* Stop color picker */}
      <ColorPickerModal
        visible={showStopCP}
        value={stopHex}
        title="Stop zone color"
        onSelect={c => onUpdate({ stopColor: c })}
        onClose={() => setShowStopCP(false)}
      />
    </>
  );
}

// ── Main PositionToolbar ───────────────────────────────────────────────────────

export const PositionToolbar = memo(function PositionToolbar({
  pos, drawing, visible = true,
  onUpdate, onUpdatePoints, onDelete, onLock, onHide, onDuplicate, onReverse,
}: {
  pos:            { x: number; y: number };
  drawing:        Drawing;
  visible?:       boolean;
  onUpdate:       (patch: Partial<DrawingStyle>) => void;
  onUpdatePoints: (pts: DrawingPoint[]) => void;
  onDelete:       () => void;
  onLock:         () => void;
  onHide:         () => void;
  onDuplicate:    () => void;
  onReverse:      () => void;
}) {
  const [showProfitCP, setShowProfitCP] = useState(false);
  const [showStopCP,   setShowStopCP]   = useState(false);
  const [showMore,     setShowMore]     = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Drag offset state
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const prevIdRef = useRef(drawing.id);

  const { width: sw, height: sh } = Dimensions.get("screen");
  const TW = 400;
  const TH = 56;

  // Reset drag offset when a different drawing is selected
  useEffect(() => {
    if (drawing.id !== prevIdRef.current) {
      prevIdRef.current = drawing.id;
      setDragOffset({ x: 0, y: 0 });
    }
  }, [drawing.id]);

  // Close sub-panels when toolbar hides
  useEffect(() => {
    if (!visible) {
      setShowProfitCP(false);
      setShowStopCP(false);
      setShowMore(false);
      setShowSettings(false);
      setDragOffset({ x: 0, y: 0 });
    }
  }, [visible]);

  // Clamp base position
  const baseLeft = Math.max(8, Math.min(pos.x - TW / 2, sw - TW - 8));
  const baseTop  = pos.y - TH - 14 < 8
    ? Math.min(pos.y + 16, sh - TH - 8)
    : Math.max(8, Math.min(pos.y - TH - 14, sh - TH - 8));

  const finalLeft = Math.max(4, Math.min(sw - TW - 4, baseLeft + dragOffset.x));
  const finalTop  = Math.max(4, Math.min(sh - TH - 4, baseTop  + dragOffset.y));

  // PanResponder for drag handle
  const dragOriginRef = useRef<{ ox: number; oy: number } | null>(null);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder:        () => true,
      onMoveShouldSetPanResponder:         () => true,
      onPanResponderGrant: (_, gs) => {
        dragOriginRef.current = { ox: dragOffset.x, oy: dragOffset.y };
      },
      onPanResponderMove: (_, gs) => {
        if (!dragOriginRef.current) return;
        setDragOffset({
          x: dragOriginRef.current.ox + gs.dx,
          y: dragOriginRef.current.oy + gs.dy,
        });
      },
      onPanResponderRelease:  () => { dragOriginRef.current = null; },
      onPanResponderTerminate: () => { dragOriginRef.current = null; },
    })
  ).current;

  const S         = drawing.style;
  const profitHex = S.profitColor ?? PROFIT_DEFAULT;
  const stopHex   = S.stopColor   ?? STOP_DEFAULT;

  const closeAllPickers = useCallback(() => {
    setShowProfitCP(false);
    setShowStopCP(false);
  }, []);

  if (!visible) return null;

  return (
    <>
      {/* Floating toolbar */}
      <View
        pointerEvents="box-none"
        style={[styles.toolbar, { left: finalLeft, top: finalTop, width: TW }]}
      >
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={styles.dragHandle}>
          <IcoGrip c="rgba(255,255,255,0.35)" />
        </View>

        {/* Object list icon */}
        <PtBtn>
          <Ionicons name="git-branch-outline" size={17} color="rgba(255,255,255,0.82)" />
        </PtBtn>

        {/* Text style icon */}
        <PtBtn>
          <Ionicons name="text-outline" size={17} color="rgba(255,255,255,0.82)" />
        </PtBtn>

        <PtSep />

        {/* Profit fill color */}
        <PtBtn
          active={showProfitCP}
          onPress={() => { setShowProfitCP(v => !v); setShowStopCP(false); }}
        >
          <IcoBucket c="rgba(255,255,255,0.82)" barColor={hexToRgba(profitHex, 0.95)} />
        </PtBtn>

        {/* Stop fill color */}
        <PtBtn
          active={showStopCP}
          onPress={() => { setShowStopCP(v => !v); setShowProfitCP(false); }}
        >
          <IcoBucket c="rgba(255,255,255,0.82)" barColor={hexToRgba(stopHex, 0.95)} />
        </PtBtn>

        <PtSep />

        {/* Reverse */}
        <PtBtn onPress={onReverse}>
          <IcoReverse c="rgba(255,255,255,0.82)" />
        </PtBtn>

        {/* Alert */}
        <PtBtn>
          <Ionicons name="notifications-outline" size={17} color="rgba(255,255,255,0.82)" />
        </PtBtn>

        {/* Settings */}
        <PtBtn
          active={showSettings}
          onPress={() => { setShowSettings(v => !v); closeAllPickers(); }}
        >
          <Ionicons name="settings-outline" size={17} color={showSettings ? "#B7FF5A" : "rgba(255,255,255,0.82)"} />
        </PtBtn>

        <PtSep />

        {/* Delete */}
        <PtBtn danger onPress={onDelete}>
          <Ionicons name="trash-outline" size={17} color="rgba(220,80,80,0.85)" />
        </PtBtn>

        <PtSep />

        {/* More */}
        <PtBtn
          active={showMore}
          onPress={() => { setShowMore(v => !v); closeAllPickers(); }}
        >
          <IcoDots c={showMore ? "#B7FF5A" : "rgba(255,255,255,0.75)"} />
        </PtBtn>
      </View>

      {/* Profit color picker */}
      <ColorPickerModal
        visible={showProfitCP}
        value={profitHex}
        title="Profit zone color"
        onSelect={c => onUpdate({ profitColor: c })}
        onClose={() => setShowProfitCP(false)}
      />

      {/* Stop color picker */}
      <ColorPickerModal
        visible={showStopCP}
        value={stopHex}
        title="Stop zone color"
        onSelect={c => onUpdate({ stopColor: c })}
        onClose={() => setShowStopCP(false)}
      />

      {/* More menu */}
      <MoreMenu
        visible={showMore}
        isLocked={drawing.isLocked ?? false}
        onDuplicate={() => { onDuplicate(); setShowMore(false); }}
        onHide={() => { onHide(); setShowMore(false); }}
        onReverse={() => { onReverse(); setShowMore(false); }}
        onLock={() => { onLock(); setShowMore(false); }}
        onClose={() => setShowMore(false)}
      />

      {/* Settings modal */}
      <PositionSettingsModal
        visible={showSettings}
        drawing={drawing}
        onUpdate={onUpdate}
        onUpdatePoints={onUpdatePoints}
        onClose={() => setShowSettings(false)}
      />
    </>
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Floating toolbar
  toolbar: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 56,
    backgroundColor: "rgba(28,28,30,0.97)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    paddingHorizontal: 5,
    paddingVertical: 5,
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.65,
    shadowRadius: 14,
    elevation: 14,
    zIndex: 200,
  },
  // Drag handle
  dragHandle: {
    paddingLeft: 2,
    paddingRight: 7,
    marginRight: 1,
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.08)",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    cursor: "grab" as any,
  },
  // Toolbar button
  ptBtn: {
    width: 36,
    height: 36,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    flexShrink: 0,
  },
  ptBtnActive: {
    backgroundColor: "rgba(183,255,90,0.10)",
  },
  ptBtnDanger: {
    // danger state handled via icon color
  },
  ptBtnPressed: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  ptSep: {
    width: 1,
    height: 22,
    backgroundColor: "rgba(255,255,255,0.09)",
    flexShrink: 0,
    marginHorizontal: 3,
  },
  // Color picker Modal
  colorModal: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(10,16,14,0.98)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34,
  },
  colorModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  colorModalTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255,255,255,0.85)",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    padding: 16,
  },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.12)",
  },
  colorSwatchActive: {
    borderWidth: 2.5,
    borderColor: "#ffffff",
  },
  currentColorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  currentColorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.2)",
  },
  currentColorHex: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
    fontFamily: "monospace",
  },
  // More menu
  moreMenu: {
    position: "absolute",
    right: 60,
    bottom: 80,
    minWidth: 160,
    backgroundColor: "rgba(16,18,21,0.98)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 20,
    zIndex: 230,
  },
  moreMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  moreMenuItemPressed: {
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  moreMenuLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(200,205,215,0.85)",
  },
  moreMenuLabelHighlight: {
    color: "rgba(183,255,90,0.9)",
  },
  // Settings modal
  settingsModal: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "65%",
    backgroundColor: "rgba(12,16,22,0.98)",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
  },
  settingsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  settingsHeaderDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  settingsHeaderTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255,255,255,0.92)",
  },
  settingsCloseBtn: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  // Tabs
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    position: "relative",
  },
  tabLabel: {
    fontSize: 12.5,
    fontWeight: "500",
    color: "rgba(255,255,255,0.38)",
  },
  tabLabelActive: {
    color: "rgba(255,255,255,0.92)",
    fontWeight: "600",
  },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: "10%",
    right: "10%",
    height: 2,
    backgroundColor: "rgba(183,255,90,0.7)",
    borderRadius: 1,
  },
  settingsContent: {
    flex: 1,
  },
  // Inputs
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  inputLabel: {
    fontSize: 12.5,
    color: "rgba(200,205,215,0.65)",
    width: 90,
    flexShrink: 0,
  },
  numInput: {
    flex: 1,
    height: 34,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 8,
    color: "rgba(255,255,255,0.85)",
    fontSize: 12.5,
    paddingHorizontal: 10,
    fontFamily: "monospace",
  },
  colorSwatch28: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.18)",
  },
  // TF visibility chips
  tfGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 14,
  },
  tfChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tfChipOn: {
    backgroundColor: "rgba(183,255,90,0.12)",
    borderColor: "rgba(183,255,90,0.3)",
  },
  tfChipLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(200,205,215,0.45)",
  },
  tfChipLabelOn: {
    color: "rgba(183,255,90,0.9)",
    fontWeight: "700",
  },
});
