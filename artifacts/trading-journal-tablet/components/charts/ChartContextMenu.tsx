/**
 * ChartContextMenu.tsx — React Native port (Phase 9.23 Pass A)
 *
 * Migrated from src/components/charts/ChartContextMenu.tsx
 *
 * Web → RN changes (Pass A):
 *   createPortal                     → Modal
 *   document.addEventListener keydown/mousedown → Modal onRequestClose + backdrop Pressable
 *   import.meta.env.BASE_URL         → getApiBase()
 *   window.innerWidth/Height         → Dimensions.get("window")
 *   dynamic import("@/store/…")      → static imports (Metro bundler; no code-splitting benefit in RN)
 *   CSS className (.cmi/.ctx-lbl/…)  → StyleSheet
 *   CSS @keyframes ctxFadeIn         → removed (Modal slide-in is sufficient in RN)
 *   backdropFilter blur              → removed (elevation/shadow instead)
 *   <button> onClick                 → Pressable onPress
 *   onMouseEnter/Leave hover         → removed (no hover on touch)
 *   userSelect / cursor              → removed
 *   lucide-react icons               → Ionicons equivalents
 *
 * Exports (unchanged):
 *   Props (interface)
 *   ChartContextMenu (memo, default export)
 */

import { memo } from "react";
import {
  View, Text, Pressable, Modal, StyleSheet,
  Dimensions, TouchableWithoutFeedback,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useChartStore } from "@/store/chartStore";
import { useDrawingStore } from "@/store/drawingStore";
import { chartApiRef } from "@/lib/chartApiRef";
import { getApiBase } from "@/lib/apiBase";

const BASE = getApiBase();

// ── Design tokens ─────────────────────────────────────────────────────────────
const NEON   = "#B7FF5A";
const ITEM   = "#C8E4CC";
const ICON   = "rgba(167,184,169,0.5)";

// ── Props (preserved exactly) ─────────────────────────────────────────────────
export interface Props {
  x: number;
  y: number;
  isOpen: boolean;
  onClose: () => void;
  onScreenshot: () => void;
  onShowSettings: () => void;
  onSelectInterval: (v: string) => void;
}

const TIMEFRAMES = [
  { label: "1m",  value: "1"   },
  { label: "5m",  value: "5"   },
  { label: "15m", value: "15"  },
  { label: "30m", value: "30"  },
  { label: "1H",  value: "60"  },
  { label: "4H",  value: "240" },
  { label: "1D",  value: "D"   },
  { label: "1W",  value: "W"   },
];

const ChartContextMenu = memo(function ChartContextMenu({
  x, y, isOpen, onClose, onScreenshot, onShowSettings, onSelectInterval,
}: Props) {
  const { interval: currentInterval } = useChartStore();

  if (!isOpen) return null;

  const menuW = 210;
  const { width: vw, height: vh } = Dimensions.get("window");
  const px = x + menuW + 8 > vw ? x - menuW : x;
  const py = y + 310   + 8 > vh ? y - 310   : y;

  const run = (fn: () => void) => { fn(); onClose(); };

  const resetChart = () => {
    const chart = chartApiRef.current;
    if (!chart) return;
    // Cast to extended time-scale shape (available on the Skia impl, absent from
    // the minimal IChartTimeScale stub in ChartContext.tsx).
    const ts = chart.timeScale() as {
      resetTimeScale?: () => void;
      fitContent?: () => void;
    };
    ts.resetTimeScale?.();
    ts.fitContent?.();
  };

  const hideAllDrawings = () => {
    const { drawings, updateDrawing } = useDrawingStore.getState();
    const hasVisible = drawings.some(d => d.isVisible !== false);
    for (const d of drawings) {
      updateDrawing(d.id, { isVisible: !hasVisible });
      fetch(`${BASE}/api/drawings/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVisible: !hasVisible }),
      }).catch(() => {});
    }
  };

  const lockAllDrawings = () => {
    const { drawings, updateDrawing } = useDrawingStore.getState();
    const hasUnlocked = drawings.some(d => !d.isLocked);
    for (const d of drawings) {
      updateDrawing(d.id, { isLocked: hasUnlocked });
      fetch(`${BASE}/api/drawings/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isLocked: hasUnlocked }),
      }).catch(() => {});
    }
  };

  const removeAllDrawings = () => {
    const { drawings, removeDrawing } = useDrawingStore.getState();
    for (const d of drawings) {
      removeDrawing(d.id);
      fetch(`${BASE}/api/drawings/${d.id}`, { method: "DELETE" }).catch(() => {});
    }
  };

  const activateRuler = () => {
    useDrawingStore.getState().setActiveTool("ruler");
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Full-screen backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={[ss.backdrop, { width: vw, height: vh }]} />
      </TouchableWithoutFeedback>

      {/* Menu panel */}
      <View style={[ss.menu, { top: py, left: px, width: menuW }]}>

        {/* SECTION 1 — TIMEFRAME */}
        <Text style={ss.sectionLabel}>TIMEFRAME</Text>
        <View style={ss.tfGrid}>
          {TIMEFRAMES.map(tf => (
            <Pressable
              key={tf.value}
              onPress={() => run(() => onSelectInterval(tf.value))}
              style={[ss.tfBtn, currentInterval === tf.value && ss.tfBtnActive]}
            >
              <Ionicons name="flash" size={7} color={currentInterval === tf.value ? NEON : "rgba(167,184,169,0.65)"} />
              <Text style={[ss.tfBtnLabel, currentInterval === tf.value && ss.tfBtnLabelActive]}>
                {tf.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={ss.sep} />

        {/* SECTION 2 — CHART ACTIONS */}
        <Text style={ss.sectionLabel}>CHART ACTIONS</Text>
        <Btn icon="refresh-outline"  label="Reset Chart View"     onPress={() => run(resetChart)} />
        <Btn icon="eye-off-outline"  label="Hide Drawings"        onPress={() => run(hideAllDrawings)} />
        <Btn icon="lock-closed-outline" label="Lock Drawings"     onPress={() => run(lockAllDrawings)} />
        <Btn icon="trash-outline"    label="Remove All Drawings"  onPress={() => run(removeAllDrawings)} danger />
        <Btn icon="camera-outline"   label="Screenshot Chart"     onPress={() => run(onScreenshot)} />

        <View style={ss.sep} />

        {/* SECTION 3 — DRAWING TOOLS */}
        <Text style={ss.sectionLabel}>DRAWING TOOLS</Text>
        <Btn
          icon="trending-up-outline"
          label="Long Position"
          accentColor="#22c55e"
          onPress={() => run(() => useDrawingStore.getState().setActiveTool("position_long"))}
        />
        <Btn
          icon="trending-down-outline"
          label="Short Position"
          accentColor="#f87171"
          onPress={() => run(() => useDrawingStore.getState().setActiveTool("position_short"))}
        />
        <Btn icon="analytics-outline" label="Measure Tool" onPress={() => run(activateRuler)} />

        <View style={ss.sep} />

        {/* SECTION 4 — SETTINGS */}
        <Text style={ss.sectionLabel}>SETTINGS</Text>
        <Btn icon="settings-outline" label="Chart Settings" onPress={() => run(onShowSettings)} />
      </View>
    </Modal>
  );
});

// ── Btn ───────────────────────────────────────────────────────────────────────
function Btn({
  icon, label, onPress, danger, accentColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  accentColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        ss.menuItem,
        pressed && (danger ? ss.menuItemDangerPressed : ss.menuItemPressed),
      ]}
    >
      {({ pressed }) => (
        <>
          <Ionicons
            name={icon}
            size={12}
            color={
              accentColor
                ? accentColor
                : pressed && danger
                  ? "#f87171"
                  : pressed
                    ? NEON
                    : ICON
            }
            style={ss.menuItemIcon}
          />
          <Text
            style={[
              ss.menuItemLabel,
              pressed && danger && ss.menuItemLabelDanger,
              pressed && !danger && ss.menuItemLabelActive,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  menu: {
    position: "absolute",
    backgroundColor: "rgba(7,17,13,0.97)",
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.13)",
    borderRadius: 10,
    overflow: "hidden",
    zIndex: 9999,
    elevation: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
  },
  sep: {
    height: 1,
    backgroundColor: "rgba(183,255,90,0.07)",
    marginVertical: 2,
  },
  sectionLabel: {
    paddingHorizontal: 11,
    paddingTop: 6,
    paddingBottom: 2,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.9,
    color: "rgba(167,184,169,0.38)",
  },
  tfGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    paddingBottom: 7,
  },
  tfBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.13)",
    backgroundColor: "transparent",
  },
  tfBtnActive: {
    backgroundColor: "rgba(183,255,90,0.16)",
    borderColor: "rgba(183,255,90,0.45)",
  },
  tfBtnLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "rgba(167,184,169,0.65)",
  },
  tfBtnLabelActive: {
    color: NEON,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  menuItemPressed: {
    backgroundColor: "rgba(183,255,90,0.09)",
  },
  menuItemDangerPressed: {
    backgroundColor: "rgba(239,68,68,0.1)",
  },
  menuItemIcon: {
    flexShrink: 0,
  },
  menuItemLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: ITEM,
  },
  menuItemLabelActive: {
    color: NEON,
  },
  menuItemLabelDanger: {
    color: "#f87171",
  },
});

export default ChartContextMenu;
