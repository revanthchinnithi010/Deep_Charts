/**
 * MobileChartLayout.tsx — React Native port
 *
 * Pass A (Phase 9.25.1):
 *   ✅ Root layout shell, SafeArea, screen container
 *   ✅ Landscape / portrait layout switching
 *   ✅ Multi-chart grid (single / 2-pane / 3-pane / 4-pane)
 *   ✅ All sheet visibility state and stable callbacks
 *   ✅ Symbol / interval slot routing + prev / next
 *
 * Pass B (Phase 9.25.2):
 *   ✅ BottomSheet — Modal-based, animated slide-up, HALF/FULL heights
 *   ✅ FloatingDrawingPill — active-tool indicator, anchored left on chart area
 *   ✅ DrawingMiniBar — toolbar shown when a drawing is selected
 *   ✅ MiniControlBar — main bottom toolbar (symbol | TF | prev/next | draw | type | broker | more)
 *   ✅ TFSheet, ChartTypeSheet, DrawingToolsSheet, MoreOptionsSheet
 *   ✅ LayoutBottomSheet — named layouts + layout count + sync-TF
 *   ✅ ObjectTreeSheet — DrawingsList wrapped in BottomSheet
 *   ✅ ChartSettingsSheet — full-screen Modal with SettingsPanel
 *   ✅ TradeSheet — full-screen Modal with BuySellPanel
 *   ✅ BrokerIntegrationModal wired to showBrokerIntegration state
 *   ✅ DrawingSettingsModal wired to selected drawing
 *
 * Pass C (Phase 9.25.3):
 *   ✅ ReplayControls — bar replay controls wired to replayPhase
 *   ✅ ConnectionStatus overlay — compact WS status in chart area
 *   ✅ BrokerStatusBar — always-mounted status bar
 *   ✅ Broker positions / orders / place-order bottom sheets
 *   ✅ BrokerTabs in MoreOptionsSheet (market feed provider selector)
 *
 * Pass D (Phase 9.25.4):
 *   ✅ Gesture conflict resolution — pan vs scroll, pinch vs draw
 *   ✅ BottomSheet drag-to-dismiss — Reanimated SharedValue + Gesture.Pan on handle
 *   ✅ Backdrop fade during drag — interpolated opacity tied to translateY
 *   ✅ Orientation transition — sheetHSV SharedValue tracks dimension changes
 *   ✅ Screen lifecycle — useFocusEffect closes all sheets on tab blur
 *   ✅ handleResetChart — wired to chartApiRef.timeScale().fitContent()
 *   ✅ Overlay touch routing — pointerEvents audit complete
 *   ✅ TypeScript cleanup — removed unused Platform import, fixed marginLeft hack
 *   ✅ Memory leak cleanup — Reanimated animations auto-cancel on unmount
 *
 * Web → RN changes (Pass B):
 *   createPortal(…, document.body)  → Modal (transparent, animationType="slide")
 *   position:fixed / translateY CSS → Reanimated.View + useAnimatedStyle
 *   backdropFilter                  → dropped (not supported in RN)
 *   window.innerHeight              → useWindowDimensions().height
 *   lucide-react icons              → @expo/vector-icons Ionicons
 *   <img src={svgUrl}>              → Ionicons equivalents
 *   HTML <input>                    → TextInput
 *   hover events                    → dropped
 *   useLiveMarketContext (Phase 6+) → wsStatus stub, replaced when context lands
 */

import React, {
  memo,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  TextInput,
  useWindowDimensions,
  Switch,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import {
  X, Pencil, Undo2, SlidersHorizontal, Trash2, Check, ChevronLeft, ChevronRight,
  ChevronUp, BarChart2, TrendingUp, Activity, LineChart, Layers, Circle,
  Server, Maximize2, Minimize2, MoreHorizontal, Bell, LayoutGrid, Shapes,
  Camera, PlayCircle, RefreshCw, RefreshCcw, RotateCcw,
} from "lucide-react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
} from "react-native-reanimated";

import CustomChart from "./CustomChart";
import MiniChart from "./MiniChart";
import DrawingOverlay from "./DrawingOverlay";
import IndicatorRenderer from "./IndicatorRenderer";
import CustomIndicatorRenderer from "./CustomIndicatorRenderer";
import { MobileWatchlistOverlay } from "./MobileWatchlistOverlay";
import DrawingToolbar from "./DrawingToolbar";
import { DrawingsList } from "./DrawingsList";
import { DrawingSettingsModal } from "./DrawingSettingsModal";
import SettingsPanel from "./SettingsPanel";
import BuySellPanel from "./BuySellPanel";
import { BrokerIntegrationModal } from "./BrokerIntegrationModal";
import { tfLabel } from "./TFDropdown";

import type { ChartSettings } from "./chartSettingsTypes";
import {
  type OHLCBar,
  type ChartType,
  useChartStore,
} from "@/store/chartStore";
import {
  useWatchlist,
  SYMBOL_CATALOG,
} from "@/contexts/WatchlistContext";
import type { Drawing, ToolType, DrawingStyle, DrawingPoint } from "@/types/drawing";
import { useDrawingStore } from "@/store/drawingStore";
import { useBrokerStore } from "@/store/brokerStore";
import { getSymbolTick } from "@/store/tickStore";
import type { WsStatus } from "@/contexts/LiveMarketContext";
import {
  type ChartLayoutType,
  type NamedLayout,
} from "@/components/charts/RightToolbar";
import { ReplayControls } from "./ReplayControls";
import { ConnectionStatus } from "./ConnectionStatus";
import { BrokerTabs } from "./BrokerTabs";
import { PositionsList } from "@/components/broker/PositionsList";
import { OrdersList } from "@/components/broker/OrdersList";
import { PlaceOrderPanel } from "@/components/broker/PlaceOrderPanel";
import { BrokerStatusBar } from "@/components/broker/BrokerStatusBar";
import { chartApiRef } from "@/lib/chartApiRef";

// ── Palette constants ────────────────────────────────────────────────────────
const SHEET_BG      = "rgba(10,12,16,0.98)";
const ACCENT        = "#60A5FA";
const ACCENT_BG     = "rgba(96,165,250,0.10)";
const ACCENT_BORDER = "rgba(96,165,250,0.28)";
const DIVIDER       = "rgba(255,255,255,0.07)";
const TEXT_DIM      = "rgba(255,255,255,0.45)";
const TEXT_MED      = "rgba(255,255,255,0.70)";
const TEXT_HI       = "rgba(255,255,255,0.92)";
const BTN_BG        = "rgba(255,255,255,0.06)";
const BTN_BORDER    = "rgba(255,255,255,0.10)";
const NEON          = "#B7FF5A";
const SLOT_ACTIVE_BORDER = "#38bdf8";
const SLOT_IDLE_BORDER   = "rgba(255,255,255,0.06)";
const CTRL_BAR_BG   = "rgba(8,9,16,0.97)";
const CTRL_BAR_BORDER = "rgba(255,255,255,0.08)";
const DANGER        = "#f87171";
const SUCCESS       = "#22c55e";

// ── Layout count options ─────────────────────────────────────────────────────
const LAYOUT_OPTIONS = [
  { cols: 1, rows: 1, label: "Single",  count: 1 as ChartLayoutType },
  { cols: 2, rows: 1, label: "2 Left",  count: 2 as ChartLayoutType },
  { cols: 1, rows: 2, label: "2 Top",   count: 3 as ChartLayoutType },
  { cols: 2, rows: 2, label: "4-Grid",  count: 4 as ChartLayoutType },
];

// ── Chart type options ───────────────────────────────────────────────────────
type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
const CHART_TYPE_OPTIONS: { type: ChartType; label: string; Icon: LucideIcon }[] = [
  { type: "candles",           label: "Candlestick",    Icon: BarChart2   },
  { type: "line",              label: "Line",           Icon: TrendingUp  },
  { type: "bars",              label: "Bars",           Icon: Activity    },
  { type: "area",              label: "Area",           Icon: LineChart   },
  { type: "heikin_ashi",       label: "Heikin Ashi",   Icon: Layers      },
  { type: "line_with_markers", label: "Line + Markers", Icon: Circle     },
];

// ── Timeframe list ───────────────────────────────────────────────────────────
const TF_LIST = ["1","3","5","15","30","60","120","240","D","W","M"];

// ── Tool type → human-readable name ─────────────────────────────────────────
function toolTypeName(t: ToolType | undefined): string {
  if (!t || t === "cursor") return "Drawing";
  const map: Partial<Record<ToolType, string>> = {
    trendline: "Trend Line", ray: "Ray", extended: "Extended", hline: "Horiz. Line",
    hray: "Horiz. Ray", vline: "Vert. Line", channel: "Channel", fib: "Fibonacci",
    fib_channel: "Fib Channel", rect: "Rectangle", ellipse: "Ellipse", text: "Text",
    note: "Note", arrow: "Arrow", position_long: "Long Position", position_short: "Short Position",
  };
  return map[t] ?? t;
}

// ─────────────────────────────────────────────────────────────────────────────
// BottomSheet — Modal-based sheet with animated slide-up entry
// ─────────────────────────────────────────────────────────────────────────────
interface BottomSheetProps {
  visible:     boolean;
  onClose:     () => void;
  title?:      string;
  height?:     "half" | "full";
  showHandle?: boolean;
  children:    React.ReactNode;
}

const BottomSheet = memo(function BottomSheet({
  visible, onClose, title, height = "half", showHandle = true, children,
}: BottomSheetProps) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetH = height === "full" ? Math.round(screenH * 0.90) : Math.round(screenH * 0.46);

  // Reanimated shared values.
  // translateY drives the slide animation on the UI thread (no bridge round-trips).
  // sheetHSV mirrors sheetH so that gesture worklets always read the current
  // height even after an orientation change (avoids stale JS closure capture).
  const translateY = useSharedValue(sheetH);
  const sheetHSV   = useSharedValue(sheetH);

  // Keep sheetHSV in sync whenever sheetH recalculates (orientation transition)
  useEffect(() => {
    sheetHSV.value = sheetH;
  }, [sheetH, sheetHSV]);

  const [mounted, setMounted] = useState(false);

  // Entry / exit animation driven by `visible`
  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = sheetH;
      translateY.value = withSpring(0, { damping: 22, stiffness: 200, mass: 0.9 });
    } else if (mounted) {
      translateY.value = withTiming(sheetH, { duration: 210 }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Stable dismiss — safe to call from the Reanimated UI thread via runOnJS
  const dismiss = useCallback(() => onClose(), [onClose]);

  // Drag-to-dismiss pan gesture attached only to the handle area.
  // Pan arbitration:
  //   • Dragging the handle downward ≥35 % of sheet height → dismiss
  //   • Flicking down fast (velocityY > 500 dp/s) → dismiss
  //   • Anything less → spring back to fully-open position
  // The gesture does NOT cover ScrollView content, so scroll-within-sheet
  // works unimpeded (pan gesture only activates on the handle hit-area).
  const panGesture = useMemo(() =>
    Gesture.Pan()
      .onUpdate((e) => {
        translateY.value = Math.max(0, e.translationY);
      })
      .onEnd((e) => {
        const threshold = sheetHSV.value * 0.35;
        if (e.translationY > threshold || e.velocityY > 500) {
          translateY.value = withTiming(sheetHSV.value, { duration: 200 }, (finished) => {
            if (finished) runOnJS(dismiss)();
          });
        } else {
          translateY.value = withSpring(0, { damping: 22, stiffness: 300 });
        }
      }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [dismiss]);

  // Sheet slides up from the bottom; translateY 0 = fully visible
  const animSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Backdrop fades from full opacity (sheet open) to transparent (sheet dragged away)
  const animBackdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, sheetHSV.value], [1, 0]),
  }));

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={bs.root}>
        {/* Backdrop — fades as sheet is dragged away */}
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose}>
          <Reanimated.View style={[StyleSheet.absoluteFillObject, bs.backdrop, animBackdropStyle]} />
        </Pressable>

        {/* Sheet — Reanimated.View so translateY runs on the UI thread */}
        <Reanimated.View
          style={[
            bs.sheet,
            { height: sheetH, paddingBottom: insets.bottom + 8 },
            animSheetStyle,
          ]}
        >
          {/* Handle area — wide hit target for drag-to-dismiss gesture.
              GestureDetector wraps only this area so ScrollViews in the
              sheet content area are not affected by the pan gesture. */}
          {showHandle && (
            <GestureDetector gesture={panGesture}>
              <View style={bs.handleArea}>
                <View style={bs.handle} />
              </View>
            </GestureDetector>
          )}

          {title !== undefined && (
            <View style={bs.titleRow}>
              <Text style={bs.titleText}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={12} style={bs.closeBtn}>
                <X size={20} color={TEXT_MED} />
              </Pressable>
            </View>
          )}

          {children}
        </Reanimated.View>
      </View>
    </Modal>
  );
});

const bs = StyleSheet.create({
  root: {
    flex: 1, justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
  },
  // Wide hit-area for the drag-to-dismiss pan gesture
  handleArea: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 40,
  },
  handle: {
    width: 38, height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.20)",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
  },
  titleText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: TEXT_HI,
    letterSpacing: 0.2,
  },
  closeBtn: {
    padding: 4,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// FloatingDrawingPill — left-side indicator of the active drawing tool
// ─────────────────────────────────────────────────────────────────────────────
interface FloatingDrawingPillProps {
  activeTool:   ToolType;
  onClear:      () => void;
  onOpenTools:  () => void;
}

const FloatingDrawingPill = memo(function FloatingDrawingPill({
  activeTool, onClear, onOpenTools,
}: FloatingDrawingPillProps) {
  return (
    <View style={fp.pill} pointerEvents="box-none">
      <Pressable style={fp.toolBtn} onPress={onOpenTools}>
        <Pencil size={14} color={NEON} />
        <Text style={fp.toolName} numberOfLines={1}>{toolTypeName(activeTool)}</Text>
      </Pressable>
      <View style={fp.divider} />
      <Pressable style={fp.clearBtn} onPress={onClear} hitSlop={8}>
        <X size={14} color={TEXT_MED} />
      </Pressable>
    </View>
  );
});

const fp = StyleSheet.create({
  pill: {
    position: "absolute",
    left: 8,
    top: "50%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(20,22,30,0.92)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.25)",
    paddingLeft: 8,
    paddingRight: 2,
    paddingVertical: 6,
    zIndex: 50,
    gap: 4,
  },
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingRight: 4,
  },
  toolName: {
    fontSize: 11,
    fontWeight: "600",
    color: NEON,
    maxWidth: 80,
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginHorizontal: 2,
  },
  clearBtn: {
    padding: 4,
    borderRadius: 6,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// DrawingMiniBar — bottom bar shown when a drawing is selected
// ─────────────────────────────────────────────────────────────────────────────
interface DrawingMiniBarProps {
  drawing:          Drawing;
  canUndo:          boolean;
  onUndo:           () => void;
  onOpenSettings:   () => void;
  onDelete:         () => void;
  onDone:           () => void;
  bottomInset:      number;
}

const DrawingMiniBar = memo(function DrawingMiniBar({
  drawing, canUndo, onUndo, onOpenSettings, onDelete, onDone, bottomInset,
}: DrawingMiniBarProps) {
  return (
    <View style={[dm.bar, { paddingBottom: bottomInset + 4 }]}>
      <View style={dm.toolInfo}>
        <Pencil size={14} color={NEON} />
        <Text style={dm.toolLabel}>{toolTypeName(drawing.toolType)}</Text>
      </View>

      <View style={dm.spacer} />

      {/* Undo */}
      <Pressable
        style={[dm.iconBtn, !canUndo && dm.iconBtnDisabled]}
        onPress={onUndo}
        disabled={!canUndo}
        hitSlop={8}
      >
        <Undo2 size={19} color={canUndo ? TEXT_HI : TEXT_DIM} />
      </Pressable>

      {/* Settings */}
      <Pressable style={dm.iconBtn} onPress={onOpenSettings} hitSlop={8}>
        <SlidersHorizontal size={19} color={TEXT_MED} />
      </Pressable>

      {/* Delete */}
      <Pressable style={dm.iconBtn} onPress={onDelete} hitSlop={8}>
        <Trash2 size={19} color={DANGER} />
      </Pressable>

      {/* Done */}
      <Pressable style={[dm.iconBtn, dm.doneBtn]} onPress={onDone} hitSlop={8}>
        <Check size={19} color={ACCENT} />
        <Text style={dm.doneText}>Done</Text>
      </Pressable>
    </View>
  );
});

const dm = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CTRL_BAR_BG,
    borderTopWidth: 1,
    borderTopColor: "rgba(183,255,90,0.22)",
    paddingHorizontal: 12,
    paddingTop: 8,
    minHeight: 52,
    gap: 4,
  },
  toolInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "rgba(183,255,90,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.18)",
  },
  toolLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: NEON,
  },
  spacer: { flex: 1 },
  iconBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  iconBtnDisabled: { opacity: 0.35 },
  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    width: "auto",
    backgroundColor: ACCENT_BG,
    borderWidth: 1,
    borderColor: ACCENT_BORDER,
    borderRadius: 9,
  },
  doneText: {
    fontSize: 13,
    fontWeight: "600",
    color: ACCENT,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MiniControlBar — main bottom toolbar
// ─────────────────────────────────────────────────────────────────────────────
interface MiniControlBarProps {
  symbol:         string;
  badge:          string;
  interval:       string;
  livePrice:      number | null;
  changePct:      number;
  isUp:           boolean;
  activeTool:     ToolType;
  chartType:      ChartType;
  brokerConnected: boolean;
  isFullscreen:   boolean;
  bottomInset:    number;
  onSymbolPress:  () => void;
  onTFPress:      () => void;
  onPrev:         () => void;
  onNext:         () => void;
  onDrawPress:    () => void;
  onChartType:    () => void;
  onTrade:        () => void;
  onBroker:       () => void;
  onMore:         () => void;
  onFullscreen:   () => void;
}

const MiniControlBar = memo(function MiniControlBar({
  symbol, badge, interval, livePrice, changePct, isUp,
  activeTool, chartType, brokerConnected, isFullscreen,
  bottomInset,
  onSymbolPress, onTFPress, onPrev, onNext,
  onDrawPress, onChartType, onTrade, onBroker, onMore, onFullscreen,
}: MiniControlBarProps) {
  const isDrawingActive = activeTool !== "cursor";

  const priceStr = livePrice != null
    ? livePrice >= 1000
      ? livePrice.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : livePrice.toFixed(livePrice >= 10 ? 2 : 4)
    : null;

  return (
    <View style={[mc.bar, { paddingBottom: bottomInset + 4 }]}>
      {/* Symbol pill */}
      <Pressable style={mc.symbolPill} onPress={onSymbolPress}>
        <View style={mc.badgeDot}>
          <Text style={mc.badgeText}>{badge.slice(0, 2)}</Text>
        </View>
        <Text style={mc.symbolText} numberOfLines={1}>{symbol}</Text>
        {priceStr != null && (
          <Text style={[mc.priceText, { color: isUp ? SUCCESS : DANGER }]}>
            {priceStr}
          </Text>
        )}
      </Pressable>

      <View style={mc.spacer} />

      {/* Prev */}
      <Pressable style={mc.iconBtn} onPress={onPrev} hitSlop={6}>
        <ChevronLeft size={18} color={TEXT_MED} />
      </Pressable>

      {/* Next */}
      <Pressable style={mc.iconBtn} onPress={onNext} hitSlop={6}>
        <ChevronRight size={18} color={TEXT_MED} />
      </Pressable>

      {/* Timeframe pill */}
      <Pressable style={mc.tfPill} onPress={onTFPress}>
        <Text style={mc.tfText}>{tfLabel(interval)}</Text>
        <ChevronUp size={10} color={TEXT_DIM} />
      </Pressable>

      {/* Separator */}
      <View style={mc.sep} />

      {/* Drawing tool */}
      <Pressable
        style={[mc.iconBtn, isDrawingActive && mc.iconBtnActive]}
        onPress={onDrawPress}
        hitSlop={6}
      >
        <Pencil
          size={18}
          color={isDrawingActive ? NEON : TEXT_MED}
        />
      </Pressable>

      {/* Chart type */}
      <Pressable style={mc.iconBtn} onPress={onChartType} hitSlop={6}>
        <BarChart2 size={18} color={TEXT_MED} />
      </Pressable>

      {/* Separator */}
      <View style={mc.sep} />

      {/* Trade button (broker connected) */}
      {brokerConnected && (
        <Pressable style={mc.tradeBtn} onPress={onTrade}>
          <Text style={mc.tradeBtnText}>Trade</Text>
        </Pressable>
      )}

      {/* Broker status dot + icon */}
      <Pressable style={mc.iconBtn} onPress={onBroker} hitSlop={6}>
        <View style={mc.brokerWrap}>
          <Server size={18} color={TEXT_MED} />
          <View style={[mc.brokerDot, { backgroundColor: brokerConnected ? SUCCESS : "#6b7280" }]} />
        </View>
      </Pressable>

      {/* Fullscreen */}
      <Pressable style={mc.iconBtn} onPress={onFullscreen} hitSlop={6}>
        {isFullscreen
          ? <Minimize2 size={18} color={TEXT_MED} />
          : <Maximize2 size={18} color={TEXT_MED} />
        }
      </Pressable>

      {/* More */}
      <Pressable style={mc.iconBtn} onPress={onMore} hitSlop={6}>
        <MoreHorizontal size={18} color={TEXT_MED} />
      </Pressable>
    </View>
  );
});

const mc = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CTRL_BAR_BG,
    borderTopWidth: 1,
    borderTopColor: CTRL_BAR_BORDER,
    paddingHorizontal: 8,
    paddingTop: 7,
    minHeight: 52,
    gap: 2,
  },
  symbolPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: BTN_BG,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BTN_BORDER,
    maxWidth: 180,
  },
  badgeDot: {
    width: 22, height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(96,165,250,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: ACCENT,
    letterSpacing: 0.3,
  },
  symbolText: {
    fontSize: 13,
    fontWeight: "600",
    color: TEXT_HI,
    letterSpacing: 0.2,
  },
  priceText: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  spacer: { flex: 1 },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  iconBtnActive: {
    backgroundColor: "rgba(183,255,90,0.10)",
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.25)",
  },
  tfPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: BTN_BG,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BTN_BORDER,
  },
  tfText: {
    fontSize: 13,
    fontWeight: "600",
    color: TEXT_HI,
    letterSpacing: 0.2,
  },
  sep: {
    width: 1,
    height: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginHorizontal: 2,
  },
  tradeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(96,165,250,0.15)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ACCENT_BORDER,
  },
  tradeBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: ACCENT,
  },
  brokerWrap: {
    position: "relative",
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  brokerDot: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1,
    borderColor: CTRL_BAR_BG,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// TFSheet — timeframe picker
// ─────────────────────────────────────────────────────────────────────────────
interface TFSheetProps {
  visible:   boolean;
  onClose:   () => void;
  current:   string;
  onSelect:  (tf: string) => void;
}

const TFSheet = memo(function TFSheet({ visible, onClose, current, onSelect }: TFSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Timeframe" height="half">
      <ScrollView
        contentContainerStyle={tf.grid}
        keyboardShouldPersistTaps="handled"
      >
        {TF_LIST.map(t => {
          const active = t === current;
          return (
            <Pressable
              key={t}
              style={[tf.item, active && tf.itemActive]}
              onPress={() => { onSelect(t); onClose(); }}
            >
              <Text style={[tf.itemText, active && tf.itemTextActive]}>
                {tfLabel(t)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
});

const tf = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 16,
    gap: 10,
  },
  item: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: BTN_BG,
    borderWidth: 1,
    borderColor: BTN_BORDER,
    minWidth: 60,
    alignItems: "center",
  },
  itemActive: {
    backgroundColor: ACCENT_BG,
    borderColor: ACCENT_BORDER,
  },
  itemText: {
    fontSize: 14,
    fontWeight: "500",
    color: TEXT_MED,
  },
  itemTextActive: {
    color: ACCENT,
    fontWeight: "700",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// ChartTypeSheet — chart type picker
// ─────────────────────────────────────────────────────────────────────────────
interface ChartTypeSheetProps {
  visible:   boolean;
  onClose:   () => void;
  current:   ChartType;
  onSelect:  (t: ChartType) => void;
}

const ChartTypeSheet = memo(function ChartTypeSheet({
  visible, onClose, current, onSelect,
}: ChartTypeSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Chart Type" height="half">
      <View style={ct.list}>
        {CHART_TYPE_OPTIONS.map(opt => {
          const active = opt.type === current;
          return (
            <Pressable
              key={opt.type}
              style={[ct.row, active && ct.rowActive]}
              onPress={() => { onSelect(opt.type); onClose(); }}
            >
              <opt.Icon
                size={20}
                color={active ? ACCENT : TEXT_MED}
              />
              <Text style={[ct.label, active && ct.labelActive]}>{opt.label}</Text>
              {active && <Check size={16} color={ACCENT} style={ct.check} />}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
});

const ct = StyleSheet.create({
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 10,
    gap: 12,
  },
  rowActive: {
    backgroundColor: ACCENT_BG,
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: TEXT_MED,
  },
  labelActive: {
    color: ACCENT,
    fontWeight: "600",
  },
  check: {
    marginLeft: "auto",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// DrawingToolsSheet — wraps DrawingToolbar in a full-height sheet
// ─────────────────────────────────────────────────────────────────────────────
const DrawingToolsSheet = memo(function DrawingToolsSheet({
  visible, onClose,
}: { visible: boolean; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Drawing Tools" height="full">
      <DrawingToolbar />
    </BottomSheet>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// MoreOptionsSheet — grid of secondary actions
// ─────────────────────────────────────────────────────────────────────────────
interface MoreOptionsSheetProps {
  visible:         boolean;
  onClose:         () => void;
  isFullscreen:    boolean;
  syncTF:          boolean;
  onSyncTFChange:  (v: boolean) => void;
  onIndicators:    () => void;
  onAlerts:        () => void;
  onLayout:        () => void;
  onObjects:       () => void;
  onScreenshot:    () => void;
  onReplay:        () => void;
  onReset:         () => void;
  onFullscreen:    () => void;
}

const MoreOptionsSheet = memo(function MoreOptionsSheet({
  visible, onClose, isFullscreen, syncTF, onSyncTFChange,
  onIndicators, onAlerts, onLayout, onObjects,
  onScreenshot, onReplay, onReset, onFullscreen,
}: MoreOptionsSheetProps) {
  type Option = {
    id: string;
    label: string;
    Icon: LucideIcon;
    color?: string;
    onPress: () => void;
  };

  const options: Option[] = [
    { id: "indicators", label: "Indicators",                            Icon: TrendingUp,                          onPress: () => { onClose(); onIndicators(); } },
    { id: "alerts",     label: "Alerts",                                Icon: Bell,                                onPress: () => { onClose(); onAlerts(); } },
    { id: "layout",     label: "Layout",                                Icon: LayoutGrid,                          onPress: () => { onClose(); onLayout(); } },
    { id: "objects",    label: "Objects",                               Icon: Shapes,                              onPress: () => { onClose(); onObjects(); } },
    { id: "screenshot", label: "Screenshot",                            Icon: Camera,                              onPress: () => { onClose(); onScreenshot(); } },
    { id: "replay",     label: "Bar Replay",                            Icon: PlayCircle,                          onPress: () => { onClose(); onReplay(); } },
    { id: "reset",      label: "Reset Chart",                           Icon: RotateCcw,                           onPress: () => { onClose(); onReset(); } },
    {
      id: "fullscreen",
      label: isFullscreen ? "Exit Fullscreen" : "Fullscreen",
      Icon: isFullscreen ? Minimize2 : Maximize2,
      onPress: () => { onClose(); onFullscreen(); },
    },
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose} title="More" height="half">
      <ScrollView contentContainerStyle={mo.container} keyboardShouldPersistTaps="handled">
        {/* Sync TF toggle row */}
        <View style={mo.toggleRow}>
          <RefreshCw size={18} color={syncTF ? ACCENT : TEXT_MED} style={{ marginRight: 10 }} />
          <Text style={[mo.toggleLabel, syncTF && { color: TEXT_HI }]}>Sync Timeframe</Text>
          <Switch
            value={syncTF}
            onValueChange={onSyncTFChange}
            thumbColor={syncTF ? ACCENT : "#6b7280"}
            trackColor={{ false: "rgba(255,255,255,0.12)", true: ACCENT_BG }}
          />
        </View>

        <View style={mo.divider} />

        {/* Market feed broker tabs */}
        <View style={mo.feedRow}>
          <Activity size={15} color={TEXT_DIM} style={{ marginRight: 8 }} />
          <Text style={mo.feedLabel}>Market Feed</Text>
          <BrokerTabs />
        </View>

        <View style={mo.divider} />

        {/* Options grid */}
        <View style={mo.grid}>
          {options.map(opt => (
            <Pressable key={opt.id} style={mo.cell} onPress={opt.onPress}>
              <View style={mo.cellIcon}>
                <opt.Icon size={22} color={opt.color ?? TEXT_MED} />
              </View>
              <Text style={mo.cellLabel} numberOfLines={1}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </BottomSheet>
  );
});

const mo = StyleSheet.create({
  container: { padding: 16 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 6,
    marginBottom: 4,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: TEXT_MED,
  },
  divider: {
    height: 1,
    backgroundColor: DIVIDER,
    marginVertical: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  cell: {
    width: "22%",
    minWidth: 72,
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
  },
  cellIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: BTN_BG,
    borderWidth: 1,
    borderColor: BTN_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  cellLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: TEXT_MED,
    textAlign: "center",
  },

  // Market Feed row in MoreOptionsSheet (Pass C)
  feedRow: {
    flexDirection:  "row",
    alignItems:     "center",
    paddingHorizontal: 4,
    paddingVertical:   6,
    marginBottom:   4,
  },
  feedLabel: {
    flex:       1,   // push BrokerTabs to the right edge without marginLeft hacks
    fontSize:   13,
    fontWeight: "500",
    color:      TEXT_MED,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// LayoutBottomSheet — named layouts + layout count + sync-TF
// ─────────────────────────────────────────────────────────────────────────────
interface LayoutBottomSheetProps {
  visible:             boolean;
  onClose:             () => void;
  layoutCount:         ChartLayoutType;
  onLayoutChange:      (n: ChartLayoutType) => void;
  syncTF:              boolean;
  onSyncTFChange:      (v: boolean) => void;
  namedLayouts:        NamedLayout[];
  defaultLayoutName:   string;
  onSaveNamedLayout:   (name: string) => void;
  onLoadNamedLayout:   (layout: NamedLayout) => void;
  onRenameNamedLayout: (id: string, name: string) => void;
  onDeleteNamedLayout: (id: string) => void;
  activeLayoutId:      string | null;
}

const LayoutBottomSheet = memo(function LayoutBottomSheet({
  visible, onClose,
  layoutCount, onLayoutChange,
  syncTF, onSyncTFChange,
  namedLayouts, defaultLayoutName,
  onSaveNamedLayout, onLoadNamedLayout,
  onRenameNamedLayout, onDeleteNamedLayout, activeLayoutId,
}: LayoutBottomSheetProps) {
  const [saveName,     setSaveName]     = useState(defaultLayoutName);
  const [renamingId,   setRenamingId]   = useState<string | null>(null);
  const [renameText,   setRenameText]   = useState("");

  // Sync saveName with defaultLayoutName prop
  useEffect(() => { setSaveName(defaultLayoutName); }, [defaultLayoutName]);

  const handleSave = useCallback(() => {
    if (saveName.trim()) {
      onSaveNamedLayout(saveName.trim());
      setSaveName("");
    }
  }, [saveName, onSaveNamedLayout]);

  const handleStartRename = useCallback((layout: NamedLayout) => {
    setRenamingId(layout.id);
    setRenameText(layout.name);
  }, []);

  const handleCommitRename = useCallback(() => {
    if (renamingId && renameText.trim()) {
      onRenameNamedLayout(renamingId, renameText.trim());
    }
    setRenamingId(null);
    setRenameText("");
  }, [renamingId, renameText, onRenameNamedLayout]);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Layouts" height="full">
      <ScrollView
        contentContainerStyle={lb.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Layout count section */}
        <Text style={lb.sectionTitle}>Chart Layout</Text>
        <View style={lb.layoutGrid}>
          {LAYOUT_OPTIONS.map(opt => {
            const active = opt.count === layoutCount;
            return (
              <Pressable
                key={opt.count}
                style={[lb.layoutCell, active && lb.layoutCellActive]}
                onPress={() => onLayoutChange(opt.count)}
              >
                {/* Mini grid preview */}
                <View style={lb.miniGrid}>
                  {Array.from({ length: opt.count }).map((_, i) => (
                    <View key={i} style={lb.miniCell} />
                  ))}
                </View>
                <Text style={[lb.layoutLabel, active && lb.layoutLabelActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Sync TF toggle */}
        <View style={lb.toggleRow}>
          <RefreshCw size={16} color={syncTF ? ACCENT : TEXT_MED} style={{ marginRight: 10 }} />
          <Text style={[lb.toggleLabel, syncTF && { color: TEXT_HI }]}>Sync Timeframe across charts</Text>
          <Switch
            value={syncTF}
            onValueChange={onSyncTFChange}
            thumbColor={syncTF ? ACCENT : "#6b7280"}
            trackColor={{ false: "rgba(255,255,255,0.12)", true: ACCENT_BG }}
          />
        </View>

        <View style={lb.divider} />

        {/* Save layout */}
        <Text style={lb.sectionTitle}>Save Current Layout</Text>
        <View style={lb.saveRow}>
          <TextInput
            style={lb.nameInput}
            value={saveName}
            onChangeText={setSaveName}
            placeholder="Layout name…"
            placeholderTextColor={TEXT_DIM}
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />
          <Pressable style={lb.saveBtn} onPress={handleSave}>
            <Text style={lb.saveBtnText}>Save</Text>
          </Pressable>
        </View>

        {/* Named layouts list */}
        {namedLayouts.length > 0 && (
          <>
            <View style={lb.divider} />
            <Text style={lb.sectionTitle}>Saved Layouts</Text>
            {namedLayouts.map(layout => (
              <View key={layout.id} style={lb.layoutRow}>
                {renamingId === layout.id ? (
                  <TextInput
                    style={[lb.nameInput, { flex: 1 }]}
                    value={renameText}
                    onChangeText={setRenameText}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleCommitRename}
                    onBlur={handleCommitRename}
                  />
                ) : (
                  <Pressable
                    style={lb.layoutRowInfo}
                    onPress={() => { onLoadNamedLayout(layout); onClose(); }}
                  >
                    <Text style={[lb.layoutRowName, layout.id === activeLayoutId && lb.layoutRowNameActive]}>
                      {layout.name}
                    </Text>
                    <Text style={lb.layoutRowMeta}>
                      {layout.symbol} · {layout.interval}
                    </Text>
                  </Pressable>
                )}

                <View style={lb.layoutRowActions}>
                  {renamingId === layout.id ? (
                    <Pressable onPress={handleCommitRename} hitSlop={8}>
                      <Check size={18} color={ACCENT} />
                    </Pressable>
                  ) : (
                    <Pressable onPress={() => handleStartRename(layout)} hitSlop={8}>
                      <Pencil size={17} color={TEXT_DIM} />
                    </Pressable>
                  )}
                  <Pressable onPress={() => onDeleteNamedLayout(layout.id)} hitSlop={8}>
                    <Trash2 size={17} color={DANGER} />
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
});

const lb = StyleSheet.create({
  container: { padding: 16, gap: 0 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: TEXT_DIM,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },
  layoutGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  layoutCell: {
    flex: 1,
    minWidth: 72,
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: BTN_BG,
    borderWidth: 1,
    borderColor: BTN_BORDER,
    gap: 8,
  },
  layoutCellActive: {
    backgroundColor: ACCENT_BG,
    borderColor: ACCENT_BORDER,
  },
  miniGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 30, height: 30,
    gap: 2,
  },
  miniCell: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2,
    flex: 1,
    minWidth: 12, minHeight: 12,
  },
  layoutLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: TEXT_MED,
  },
  layoutLabelActive: {
    color: ACCENT,
    fontWeight: "600",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    marginBottom: 4,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: TEXT_MED,
  },
  divider: {
    height: 1,
    backgroundColor: DIVIDER,
    marginVertical: 14,
  },
  saveRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 4,
  },
  nameInput: {
    flex: 1,
    height: 40,
    backgroundColor: BTN_BG,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: BTN_BORDER,
    paddingHorizontal: 12,
    color: TEXT_HI,
    fontSize: 14,
  },
  saveBtn: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 9,
    backgroundColor: ACCENT_BG,
    borderWidth: 1,
    borderColor: ACCENT_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: ACCENT,
  },
  layoutRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
    gap: 10,
  },
  layoutRowInfo: {
    flex: 1,
    gap: 2,
  },
  layoutRowName: {
    fontSize: 14,
    fontWeight: "500",
    color: TEXT_HI,
  },
  layoutRowNameActive: {
    color: ACCENT,
  },
  layoutRowMeta: {
    fontSize: 11,
    color: TEXT_DIM,
  },
  layoutRowActions: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// ObjectTreeSheet — drawings list
// ─────────────────────────────────────────────────────────────────────────────
const ObjectTreeSheet = memo(function ObjectTreeSheet({
  visible, onClose, symbol, timeframe,
}: { visible: boolean; onClose: () => void; symbol: string; timeframe: string }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Objects" height="full">
      <DrawingsList symbol={symbol} timeframe={timeframe} />
    </BottomSheet>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ChartSettingsSheet — full-screen settings modal
// ─────────────────────────────────────────────────────────────────────────────
interface ChartSettingsSheetProps {
  visible:          boolean;
  settings:         ChartSettings;
  onChange:         (s: ChartSettings) => void;
  onSaveAsDefault?: (s: ChartSettings) => void;
  onClose:          () => void;
}

const ChartSettingsSheet = memo(function ChartSettingsSheet({
  visible, settings, onChange, onSaveAsDefault, onClose,
}: ChartSettingsSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={css.root}>
        <SettingsPanel
          settings={settings}
          onChange={onChange}
          onSaveAsDefault={onSaveAsDefault}
          onClose={onClose}
        />
      </SafeAreaView>
    </Modal>
  );
});

const css = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SHEET_BG,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// TradeSheet — full-screen order entry modal
// ─────────────────────────────────────────────────────────────────────────────
interface TradeSheetProps {
  visible:      boolean;
  symbol:       string;
  currentPrice: number | null;
  onClose:      () => void;
}

const TradeSheet = memo(function TradeSheet({
  visible, symbol, currentPrice, onClose,
}: TradeSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={ts.root}>
        <BuySellPanel symbol={symbol} currentPrice={currentPrice} onClose={onClose} />
      </SafeAreaView>
    </Modal>
  );
});

const ts = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SHEET_BG,
  },
});

// ── Replay phase ─────────────────────────────────────────────────────────────
export type ReplayPhase = "off" | "selecting" | "active";

// ─────────────────────────────────────────────────────────────────────────────
// Props interface
// ─────────────────────────────────────────────────────────────────────────────
export interface MobileChartLayoutProps {
  activeKey:           string;
  interval:            string;
  selectInterval:      (v: string) => void;
  selectSymbol:        (k: string) => void;
  chartSettings:       ChartSettings;
  handleSettings:      (s: ChartSettings) => void;
  handleSaveAsDefault: (s: ChartSettings) => void;
  replayBarSlice:      OHLCBar[] | null;
  alertDrawingIds:     Set<number>;
  handleDrawingAlert:  (d: Drawing) => void;
  addAlertDrawingId:   (id: number) => void;
  showIndicators:      boolean;
  setShowIndicators:   React.Dispatch<React.SetStateAction<boolean>>;
  showAlertCenter:     boolean;
  setShowAlertCenter:  React.Dispatch<React.SetStateAction<boolean>>;
  showQuickAlert:      boolean;
  setShowQuickAlert:   React.Dispatch<React.SetStateAction<boolean>>;
  alertDrawing:        Drawing | null;
  closeAlertModal:     () => void;
  openSidebar:         () => void;
  handleScreenshot:    () => void;
  /** Web: RefObject<HTMLDivElement | null> → RN: RefObject<View | null> */
  chartAreaRef:        React.RefObject<View | null>;
  onBarReplay?:        () => void;
  layoutCount:         ChartLayoutType;
  onLayoutChange:      (n: ChartLayoutType) => void;
  syncTF:              boolean;
  onSyncTFChange:      (v: boolean) => void;
  namedLayouts:        NamedLayout[];
  defaultLayoutName:   string;
  onSaveNamedLayout:   (name: string) => void;
  onLoadNamedLayout:   (layout: NamedLayout) => void;
  onRenameNamedLayout: (id: string, name: string) => void;
  onDeleteNamedLayout: (id: string) => void;
  activeLayoutId:      string | null;
  // ── Replay controls (Pass C) ───────────────────────────────────────────────
  replayPhase?:          ReplayPhase;
  replayCurrentBar?:     OHLCBar | null;
  replayPlaying?:        boolean;
  replaySpeed?:          number;
  replayIdx?:            number;
  replayTotalBars?:      number;
  onReplayPlay?:         () => void;
  onReplayPause?:        () => void;
  onReplayStepBack?:     () => void;
  onReplayStepForward?:  () => void;
  onReplaySpeedChange?:  (s: number) => void;
  onExitReplay?:         () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// MobileChartLayout — main export
// ─────────────────────────────────────────────────────────────────────────────
export const MobileChartLayout = memo(function MobileChartLayout(
  props: MobileChartLayoutProps,
) {
  const {
    activeKey, interval, selectInterval, selectSymbol,
    chartSettings, handleSettings, handleSaveAsDefault,
    replayBarSlice, alertDrawingIds, handleDrawingAlert, addAlertDrawingId,
    showIndicators, setShowIndicators,
    showAlertCenter, setShowAlertCenter,
    showQuickAlert: _showQuickAlert, setShowQuickAlert: _setShowQuickAlert,
    alertDrawing: _alertDrawing, closeAlertModal: _closeAlertModal,
    openSidebar: _openSidebar,
    handleScreenshot, chartAreaRef,
    onBarReplay,
    layoutCount, onLayoutChange, syncTF, onSyncTFChange,
    namedLayouts, defaultLayoutName, onSaveNamedLayout, onLoadNamedLayout,
    onRenameNamedLayout, onDeleteNamedLayout, activeLayoutId,
    // ── Replay controls (Pass C) ──────────────────────────────────────────────
    replayPhase      = "off" as ReplayPhase,
    replayCurrentBar = null,
    replayPlaying    = false,
    replaySpeed      = 1,
    replayIdx        = 0,
    replayTotalBars  = 0,
    onReplayPlay,
    onReplayPause,
    onReplayStepBack,
    onReplayStepForward,
    onReplaySpeedChange,
    onExitReplay,
  } = props;

  // ── Responsive / orientation ───────────────────────────────────────────────
  const { width: screenW, height: screenH } = useWindowDimensions();
  const isLandscape = screenW > screenH;
  const insets = useSafeAreaInsets();

  // ── Store subscriptions ────────────────────────────────────────────────────
  const chartType           = useChartStore(s => s.chartType);
  const setChartType        = useChartStore(s => s.setChartType);
  const setMobileFullscreen = useChartStore(s => s.setMobileChartFullscreen);
  // wsStatus: Phase 6.x — livemarketcontext tablet port pending
  const wsStatus = ("disconnected" as WsStatus);
  const { items: watchlistItems } = useWatchlist();

  // Drawing store — narrow selectors
  const selectedDrawingId    = useDrawingStore(s => s.selectedDrawingId);
  const setSelectedDrawingId = useDrawingStore(s => s.setSelectedDrawingId);
  const drawings             = useDrawingStore(s => s.drawings);
  const activeTool           = useDrawingStore(s => s.activeTool);
  const setActiveTool        = useDrawingStore(s => s.setActiveTool);
  const updateDrawing        = useDrawingStore(s => s.updateDrawing);
  const removeDrawing        = useDrawingStore(s => s.removeDrawing);
  const undo                 = useDrawingStore(s => s.undo);
  const canUndo              = useDrawingStore(s => s.canUndo);
  const selectedDrawing      = useMemo(
    () => drawings.find(d => d.id === selectedDrawingId) ?? null,
    [drawings, selectedDrawingId],
  );

  // Broker store — account + connection
  const activeAccount    = useBrokerStore(s => s.activeAccount);
  const connectionStatus = useBrokerStore(s => s.connectionStatus);
  const brokerConnected  = !!activeAccount && connectionStatus === "connected";
  // Broker store — panel visibility (Pass C)
  const showPositions    = useBrokerStore(s => s.showPositions);
  const showOrders       = useBrokerStore(s => s.showOrders);
  const showPlaceOrder   = useBrokerStore(s => s.showPlaceOrder);
  const setShowPositions = useBrokerStore(s => s.setShowPositions);
  const setShowOrders    = useBrokerStore(s => s.setShowOrders);
  const setShowPlaceOrder = useBrokerStore(s => s.setShowPlaceOrder);

  // ── Sheet / overlay visibility state ──────────────────────────────────────
  const [showDrawingSheet,      setShowDrawingSheet]      = useState(false);
  const [showSettings,          setShowSettings]          = useState(false);
  const [showBrokerIntegration, setShowBrokerIntegration] = useState(false);
  const [showTFSheet,           setShowTFSheet]           = useState(false);
  const [showChartType,         setShowChartType]         = useState(false);
  const [showMoreSheet,         setShowMoreSheet]         = useState(false);
  const [showObjectTree,        setShowObjectTree]        = useState(false);
  const [showWatchlist,         setShowWatchlist]         = useState(false);
  const [isFullscreen,          setIsFullscreen]          = useState(false);
  const [showLayoutSheet,       setShowLayoutSheet]       = useState(false);
  const [showTradeSheet,        setShowTradeSheet]        = useState(false);
  const [showDrawingSettings,   setShowDrawingSettings]   = useState(false);

  // ── Multi-chart slot state ─────────────────────────────────────────────────
  const [activeChartSlot, setActiveChartSlot] = useState(0);
  const [slotSymbols,     setSlotSymbols]     = useState<string[]>([
    "ETHUSD", "SOLUSD", "DOGEUSD",
  ]);
  const [slotIntervals, setSlotIntervals] = useState<string[]>(() => [
    interval, interval, interval,
  ]);
  const slotInitRef = useRef(false);

  // ── Close all sheets when screen loses focus (tab switch / navigation) ──────
  // Prevents stale modals from persisting when the user navigates away and
  // returns — matches web keep-alive behaviour where sheets close on route change.
  useFocusEffect(
    useCallback(() => {
      return () => {
        setShowWatchlist(false);
        setShowTFSheet(false);
        setShowChartType(false);
        setShowDrawingSheet(false);
        setShowMoreSheet(false);
        setShowObjectTree(false);
        setShowLayoutSheet(false);
        // Full-screen modals (Settings / Trade) also close — avoids a
        // half-open modal greeting the user on return.
        setShowSettings(false);
        setShowTradeSheet(false);
      };
    }, []),
  );

  // ── Seed slot symbols from watchlist ──────────────────────────────────────
  useEffect(() => {
    if (slotInitRef.current || watchlistItems.length === 0) return;
    slotInitRef.current = true;
    const candidates = watchlistItems.filter(w => w.symbol !== activeKey);
    setSlotSymbols([
      candidates[0]?.symbol ?? "ETHUSD",
      candidates[1]?.symbol ?? "SOLUSD",
      candidates[2]?.symbol ?? "DOGEUSD",
    ]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlistItems.length]);

  // ── Reset fullscreen on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => { setMobileFullscreen(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Live price ─────────────────────────────────────────────────────────────
  const connected     = wsStatus === "connected";
  void connected; // available for future use
  const livePrice     = getSymbolTick(activeKey)?.price ?? null;
  const liveChangePct = getSymbolTick(activeKey)?.changePct ?? 0;
  const isUp          = liveChangePct >= 0;

  // ── Symbol metadata ────────────────────────────────────────────────────────
  const catEntry = SYMBOL_CATALOG[activeKey];
  const wlEntry  = watchlistItems.find(i => i.symbol === activeKey);
  const badge    = wlEntry?.badge
    ?? catEntry?.badge
    ?? activeKey.slice(0, 4).toUpperCase();

  // ── Active slot derived values ─────────────────────────────────────────────
  const activeSlotSymbol = (activeChartSlot === 0 || layoutCount <= 1)
    ? activeKey
    : (slotSymbols[activeChartSlot - 1] ?? activeKey);

  const activeSlotInterval = (activeChartSlot === 0 || layoutCount <= 1)
    ? interval
    : (slotIntervals[activeChartSlot - 1] ?? interval);

  const activeSlotBadge = (activeChartSlot === 0 || layoutCount <= 1)
    ? badge
    : (watchlistItems.find(i => i.symbol === activeSlotSymbol)?.badge
        ?? SYMBOL_CATALOG[activeSlotSymbol]?.badge
        ?? activeSlotSymbol.slice(0, 4).toUpperCase());

  // ── Symbol / interval routing ──────────────────────────────────────────────
  const handleSelectSymbol = useCallback((sym: string) => {
    if (activeChartSlot === 0 || layoutCount <= 1) {
      selectSymbol(sym);
    } else {
      setSlotSymbols(prev => {
        const next = [...prev];
        next[activeChartSlot - 1] = sym;
        return next;
      });
    }
  }, [activeChartSlot, layoutCount, selectSymbol]);

  const handleSelectInterval = useCallback((tfVal: string) => {
    if (activeChartSlot === 0 || layoutCount <= 1) {
      selectInterval(tfVal);
    } else {
      setSlotIntervals(prev => {
        const next = [...prev];
        next[activeChartSlot - 1] = tfVal;
        return next;
      });
    }
  }, [activeChartSlot, layoutCount, selectInterval]);

  // ── Prev / Next symbol ─────────────────────────────────────────────────────
  const handlePrev = useCallback(() => {
    if (activeChartSlot > 0 && layoutCount > 1) {
      const curSym = slotSymbols[activeChartSlot - 1] ?? activeKey;
      const idx = watchlistItems.findIndex(i => i.symbol === curSym);
      if (idx > 0) handleSelectSymbol(watchlistItems[idx - 1].symbol);
    } else {
      const idx = watchlistItems.findIndex(i => i.symbol === activeKey);
      if (idx > 0) selectSymbol(watchlistItems[idx - 1].symbol);
    }
  }, [watchlistItems, activeKey, activeChartSlot, layoutCount, slotSymbols, handleSelectSymbol, selectSymbol]);

  const handleNext = useCallback(() => {
    if (activeChartSlot > 0 && layoutCount > 1) {
      const curSym = slotSymbols[activeChartSlot - 1] ?? activeKey;
      const idx = watchlistItems.findIndex(i => i.symbol === curSym);
      if (idx >= 0 && idx < watchlistItems.length - 1) {
        handleSelectSymbol(watchlistItems[idx + 1].symbol);
      }
    } else {
      const idx = watchlistItems.findIndex(i => i.symbol === activeKey);
      if (idx >= 0 && idx < watchlistItems.length - 1) {
        selectSymbol(watchlistItems[idx + 1].symbol);
      }
    }
  }, [watchlistItems, activeKey, activeChartSlot, layoutCount, slotSymbols, handleSelectSymbol, selectSymbol]);

  // ── Stable sheet-open handlers ─────────────────────────────────────────────
  const handleCloseDrawingSheet = useCallback(() => setShowDrawingSheet(false), []);
  const handleCloseSettings     = useCallback(() => setShowSettings(false),     []);
  const handleCloseObjectTree   = useCallback(() => setShowObjectTree(false),   []);
  const handleOpenSettings      = useCallback(() => setShowSettings(true),      []);
  const handleOpenTFSheet       = useCallback(() => setShowTFSheet(true),       []);
  const handleOpenDrawingSheet  = useCallback(() => setShowDrawingSheet(true),  []);
  const handleOpenBrokerSheet   = useCallback(() => setShowBrokerIntegration(true), []);
  const handleOpenMoreSheet     = useCallback(() => setShowMoreSheet(true),     []);
  const handleOpenTradeSheet    = useCallback(() => setShowTradeSheet(true),    []);

  // ── Chart reset ────────────────────────────────────────────────────────────
  // Web: window.dispatchEvent(new CustomEvent("tj:chart-reset")) → chart calls fitContent()
  // RN:  chartApiRef holds the active IChartApi; calling fitContent() directly
  //      mirrors what the web event listener does without needing a DOM event bus.
  const handleResetChart = useCallback(() => {
    // IChartTimeScale (ChartContext stub) exposes only the subscribe methods.
    // The actual Skia implementation does support fitContent(); cast through
    // unknown so TypeScript doesn't reject the narrower public interface while
    // still calling the method correctly at runtime.
    const ts = chartApiRef.current?.timeScale() as
      | (ReturnType<NonNullable<typeof chartApiRef.current>["timeScale"]> & { fitContent?(): void })
      | undefined;
    ts?.fitContent?.();
  }, []);

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  const handleFullscreen = useCallback(() => {
    setIsFullscreen(prev => {
      const next = !prev;
      setMobileFullscreen(next);
      return next;
    });
  }, [setMobileFullscreen]);

  // ── Drawing store actions ──────────────────────────────────────────────────
  const handleUpdateDrawingStyle = useCallback((patch: Partial<DrawingStyle>) => {
    if (selectedDrawingId == null || !selectedDrawing) return;
    updateDrawing(selectedDrawingId, {
      style: { ...selectedDrawing.style, ...patch } as DrawingStyle,
    });
  }, [selectedDrawingId, selectedDrawing, updateDrawing]);

  const handleUpdateDrawingPoints = useCallback((points: DrawingPoint[]) => {
    if (selectedDrawingId == null) return;
    updateDrawing(selectedDrawingId, { points });
  }, [selectedDrawingId, updateDrawing]);

  const handleDeleteSelectedDrawing = useCallback(() => {
    if (selectedDrawingId == null) return;
    removeDrawing(selectedDrawingId);
    setSelectedDrawingId(null);
  }, [selectedDrawingId, removeDrawing, setSelectedDrawingId]);

  const handleDoneDrawing = useCallback(() => {
    setSelectedDrawingId(null);
  }, [setSelectedDrawingId]);

  const handleClearActiveTool = useCallback(() => {
    setActiveTool("cursor");
  }, [setActiveTool]);

  // ── More options handlers ──────────────────────────────────────────────────
  const handleMoreIndicators = useCallback(() => {
    setShowIndicators(true);
  }, [setShowIndicators]);

  const handleMoreAlerts = useCallback(() => {
    setShowAlertCenter(true);
  }, [setShowAlertCenter]);

  const handleMoreLayout = useCallback(() => {
    setShowLayoutSheet(true);
  }, []);

  const handleMoreObjects = useCallback(() => {
    setShowObjectTree(true);
  }, []);

  const handleMoreScreenshot = useCallback(() => {
    handleScreenshot();
  }, [handleScreenshot]);

  const handleMoreReplay = useCallback(() => {
    onBarReplay?.();
  }, [onBarReplay]);

  // ── Slot border helper ─────────────────────────────────────────────────────
  const slotBorderStyle = useCallback(
    (slot: number) =>
      slot === activeChartSlot
        ? styles.slotActive
        : styles.slotIdle,
    [activeChartSlot],
  );

  // ── Main chart pane ────────────────────────────────────────────────────────
  const mainChartPane = (
    <CustomChart settings={chartSettings} replayBars={replayBarSlice}>
      <DrawingOverlay
        symbol={activeKey}
        timeframe={interval}
        onDrawingAlert={handleDrawingAlert}
        alertDrawingIds={alertDrawingIds}
      />
      <IndicatorRenderer />
      <CustomIndicatorRenderer />
    </CustomChart>
  );

  const miniPane = (i: number) => (
    <MiniChart
      defaultSymbol={slotSymbols[i] ?? "ETHUSD"}
      defaultInterval={interval}
      syncedInterval={syncTF ? interval : undefined}
      headerless
      controlledSymbol={slotSymbols[i]}
      controlledInterval={syncTF ? undefined : slotIntervals[i]}
      settings={chartSettings}
    >
      <DrawingOverlay
        symbol={slotSymbols[i] ?? "ETHUSD"}
        timeframe={syncTF ? interval : (slotIntervals[i] ?? interval)}
        onDrawingAlert={handleDrawingAlert}
        alertDrawingIds={alertDrawingIds}
      />
      <IndicatorRenderer />
      <CustomIndicatorRenderer />
    </MiniChart>
  );

  // ── Chart grid ─────────────────────────────────────────────────────────────
  const renderChartGrid = () => {
    if (layoutCount === 1) {
      return (
        <View style={StyleSheet.absoluteFillObject}>
          {mainChartPane}
        </View>
      );
    }

    if (layoutCount === 2) {
      return (
        <View style={[StyleSheet.absoluteFillObject, styles.gridRow, { gap: 2 }]}>
          <Pressable
            style={[styles.gridCell, { flex: 1 }, slotBorderStyle(0)]}
            onPressIn={() => setActiveChartSlot(0)}
          >
            {mainChartPane}
          </Pressable>
          <Pressable
            style={[styles.gridCell, { flex: 1 }, slotBorderStyle(1)]}
            onPressIn={() => setActiveChartSlot(1)}
          >
            {miniPane(0)}
          </Pressable>
        </View>
      );
    }

    if (layoutCount === 3) {
      return (
        <View style={[StyleSheet.absoluteFillObject, styles.gridRow, { gap: 2 }]}>
          <Pressable
            style={[styles.gridCell, { flex: 2 }, slotBorderStyle(0)]}
            onPressIn={() => setActiveChartSlot(0)}
          >
            {mainChartPane}
          </Pressable>
          <View style={[styles.gridCol, { flex: 1, gap: 2 }]}>
            <Pressable
              style={[styles.gridCell, { flex: 1 }, slotBorderStyle(1)]}
              onPressIn={() => setActiveChartSlot(1)}
            >
              {miniPane(0)}
            </Pressable>
            <Pressable
              style={[styles.gridCell, { flex: 1 }, slotBorderStyle(2)]}
              onPressIn={() => setActiveChartSlot(2)}
            >
              {miniPane(1)}
            </Pressable>
          </View>
        </View>
      );
    }

    // layoutCount === 4: 2×2
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.gridCol, { gap: 2 }]}>
        <View style={[styles.gridRow, { flex: 1, gap: 2 }]}>
          <Pressable
            style={[styles.gridCell, { flex: 1 }, slotBorderStyle(0)]}
            onPressIn={() => setActiveChartSlot(0)}
          >
            {mainChartPane}
          </Pressable>
          <Pressable
            style={[styles.gridCell, { flex: 1 }, slotBorderStyle(1)]}
            onPressIn={() => setActiveChartSlot(1)}
          >
            {miniPane(0)}
          </Pressable>
        </View>
        <View style={[styles.gridRow, { flex: 1, gap: 2 }]}>
          <Pressable
            style={[styles.gridCell, { flex: 1 }, slotBorderStyle(2)]}
            onPressIn={() => setActiveChartSlot(2)}
          >
            {miniPane(1)}
          </Pressable>
          <Pressable
            style={[styles.gridCell, { flex: 1 }, slotBorderStyle(3)]}
            onPressIn={() => setActiveChartSlot(3)}
          >
            {miniPane(2)}
          </Pressable>
        </View>
      </View>
    );
  };

  // ── Derived flags ──────────────────────────────────────────────────────────
  const showDrawingMiniBar = selectedDrawing != null && !isFullscreen;
  const showControlBar     = !showDrawingMiniBar && !isFullscreen;
  const showFloatingPill   = activeTool !== "cursor" && !showDrawingMiniBar;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* ── Chart area ──────────────────────────────────────────────────── */}
      <View
        ref={chartAreaRef}
        style={[
          styles.chartArea,
          isLandscape && {
            paddingLeft:  insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        {/* Background fill so no white flash on mount */}
        <View style={styles.chartBackground} />

        {/* Chart grid — single or multi-pane */}
        {renderChartGrid()}

        {/* FloatingDrawingPill — absolute-positioned inside chart area */}
        {showFloatingPill && (
          <FloatingDrawingPill
            activeTool={activeTool}
            onClear={handleClearActiveTool}
            onOpenTools={handleOpenDrawingSheet}
          />
        )}

        {/* ConnectionStatus — compact overlay top-right of chart area (Pass C) */}
        {!isFullscreen && (
          <View style={styles.connectionStatusOverlay} pointerEvents="none">
            <ConnectionStatus compact wsStatus={wsStatus} />
          </View>
        )}

        {/* ReplayControls — centred above bottom toolbar (Pass C) */}
        {/* Uses its own position:absolute styles (bottom:28, alignSelf:center) */}
        {replayPhase === "active" && (
          <ReplayControls
            currentBar={replayCurrentBar ?? null}
            playing={replayPlaying}
            speed={replaySpeed}
            currentIdx={replayIdx}
            totalBars={replayTotalBars}
            interval={interval}
            onPlay={onReplayPlay      ?? (() => {})}
            onPause={onReplayPause    ?? (() => {})}
            onStepBack={onReplayStepBack    ?? (() => {})}
            onStepForward={onReplayStepForward ?? (() => {})}
            onSpeedChange={onReplaySpeedChange ?? (() => {})}
            onExit={onExitReplay      ?? (() => {})}
          />
        )}
      </View>

      {/* ── Bottom toolbar ──────────────────────────────────────────────── */}
      {showDrawingMiniBar && selectedDrawing && (
        <DrawingMiniBar
          drawing={selectedDrawing}
          canUndo={canUndo}
          onUndo={undo}
          onOpenSettings={() => setShowDrawingSettings(true)}
          onDelete={handleDeleteSelectedDrawing}
          onDone={handleDoneDrawing}
          bottomInset={insets.bottom}
        />
      )}

      {showControlBar && (
        <MiniControlBar
          symbol={activeSlotSymbol}
          badge={activeSlotBadge}
          interval={activeSlotInterval}
          livePrice={livePrice}
          changePct={liveChangePct}
          isUp={isUp}
          activeTool={activeTool}
          chartType={chartType}
          brokerConnected={brokerConnected}
          isFullscreen={isFullscreen}
          bottomInset={insets.bottom}
          onSymbolPress={() => setShowWatchlist(true)}
          onTFPress={handleOpenTFSheet}
          onPrev={handlePrev}
          onNext={handleNext}
          onDrawPress={handleOpenDrawingSheet}
          onChartType={() => setShowChartType(true)}
          onTrade={handleOpenTradeSheet}
          onBroker={handleOpenBrokerSheet}
          onMore={handleOpenMoreSheet}
          onFullscreen={handleFullscreen}
        />
      )}

      {/* ── Bottom sheets ────────────────────────────────────────────────── */}
      <TFSheet
        visible={showTFSheet}
        onClose={() => setShowTFSheet(false)}
        current={activeSlotInterval}
        onSelect={handleSelectInterval}
      />

      <ChartTypeSheet
        visible={showChartType}
        onClose={() => setShowChartType(false)}
        current={chartType}
        onSelect={setChartType}
      />

      <DrawingToolsSheet
        visible={showDrawingSheet}
        onClose={handleCloseDrawingSheet}
      />

      <MoreOptionsSheet
        visible={showMoreSheet}
        onClose={() => setShowMoreSheet(false)}
        isFullscreen={isFullscreen}
        syncTF={syncTF}
        onSyncTFChange={onSyncTFChange}
        onIndicators={handleMoreIndicators}
        onAlerts={handleMoreAlerts}
        onLayout={handleMoreLayout}
        onObjects={handleMoreObjects}
        onScreenshot={handleMoreScreenshot}
        onReplay={handleMoreReplay}
        onReset={handleResetChart}
        onFullscreen={handleFullscreen}
      />

      <LayoutBottomSheet
        visible={showLayoutSheet}
        onClose={() => setShowLayoutSheet(false)}
        layoutCount={layoutCount}
        onLayoutChange={onLayoutChange}
        syncTF={syncTF}
        onSyncTFChange={onSyncTFChange}
        namedLayouts={namedLayouts}
        defaultLayoutName={defaultLayoutName}
        onSaveNamedLayout={onSaveNamedLayout}
        onLoadNamedLayout={onLoadNamedLayout}
        onRenameNamedLayout={onRenameNamedLayout}
        onDeleteNamedLayout={onDeleteNamedLayout}
        activeLayoutId={activeLayoutId}
      />

      <ObjectTreeSheet
        visible={showObjectTree}
        onClose={handleCloseObjectTree}
        symbol={activeSlotSymbol}
        timeframe={activeSlotInterval}
      />

      {/* ── Full-screen modals ───────────────────────────────────────────── */}
      <ChartSettingsSheet
        visible={showSettings}
        settings={chartSettings}
        onChange={handleSettings}
        onSaveAsDefault={handleSaveAsDefault}
        onClose={handleCloseSettings}
      />

      <TradeSheet
        visible={showTradeSheet}
        symbol={activeSlotSymbol}
        currentPrice={livePrice}
        onClose={() => setShowTradeSheet(false)}
      />

      {/* ── Broker integration modal ─────────────────────────────────────── */}
      {showBrokerIntegration && (
        <BrokerIntegrationModal
          onClose={() => setShowBrokerIntegration(false)}
        />
      )}

      {/* ── Broker store-driven modals handled globally by broker store ──── */}
      {/* showSelectModal / showAuthModal are rendered by the global broker
          modal provider in _layout.tsx; no render needed here. */}

      {/* ── Drawing settings modal ───────────────────────────────────────── */}
      {showDrawingSettings && selectedDrawing && (
        <DrawingSettingsModal
          drawing={selectedDrawing}
          pos={{ x: 0, y: 0 }}
          onUpdate={handleUpdateDrawingStyle}
          onUpdatePoints={handleUpdateDrawingPoints}
          onClose={() => setShowDrawingSettings(false)}
        />
      )}

      {/* ── Broker positions / orders — mobile bottom sheet (Pass C) ──────── */}
      {/* Mirrors web charts.tsx: (showPositions || showOrders) && activeAccount */}
      {(showPositions || showOrders) && activeAccount && (
        <BottomSheet
          visible
          onClose={() => {
            setShowPositions(false);
            setShowOrders(false);
          }}
          title="Broker"
          height="full"
        >
          {showPositions && <PositionsList />}
          {showOrders    && <OrdersList />}
        </BottomSheet>
      )}

      {/* ── Place order panel — bottom sheet (Pass C) ───────────────────────── */}
      {showPlaceOrder && activeAccount && (
        <BottomSheet
          visible
          onClose={() => setShowPlaceOrder(false)}
          title="Place Order"
          height="full"
        >
          <PlaceOrderPanel symbol={activeSlotSymbol} />
        </BottomSheet>
      )}

      {/* ── Watchlist overlay ────────────────────────────────────────────── */}
      <MobileWatchlistOverlay
        visible={showWatchlist}
        activeSymbol={activeSlotSymbol}
        onClose={() => setShowWatchlist(false)}
        onSelect={handleSelectSymbol}
        onOpenChart={() => setShowWatchlist(false)}
      />

      {/* ── Broker status bar (Pass C) ───────────────────────────────────────── */}
      {/* Mirrors web layout: rendered at bottom of charts layout, always mounted */}
      <BrokerStatusBar />
    </View>
  );
});

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#08090f",
  },

  chartArea: {
    flex: 1,
    overflow: "hidden",
  },

  chartBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#08090f",
  },

  // Flex helpers for the chart grid
  gridRow: {
    flexDirection: "row",
  },
  gridCol: {
    flexDirection: "column",
  },

  // Individual chart slot
  gridCell: {
    overflow: "hidden",
  },

  // Active slot: 2px border matching web's outline:#38bdf8 2px
  slotActive: {
    borderWidth: 2,
    borderColor: SLOT_ACTIVE_BORDER,
  },

  // Idle slot: dim 1px border
  slotIdle: {
    borderWidth: 1,
    borderColor: SLOT_IDLE_BORDER,
  },

  // ConnectionStatus — top-right overlay inside chart area (Pass C)
  connectionStatusOverlay: {
    position:   "absolute",
    top:        8,
    right:      8,
    zIndex:     20,
  },
});
