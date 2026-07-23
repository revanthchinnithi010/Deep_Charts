/**
 * MobileChartLayout.tsx — React Native port (Phase 9.25.1 Pass A)
 *
 * Pass A scope:
 *   ✅ Root layout shell
 *   ✅ SafeArea handling
 *   ✅ Screen container
 *   ✅ Main chart container
 *   ✅ Landscape / portrait layout switching
 *   ✅ Responsive sizing
 *   ✅ React Navigation integration
 *   ✅ Expo Router screen integration
 *   ✅ Layout composition (single + multi-chart grid)
 *   ✅ Initial component mounting
 *
 * NOT in Pass A (Pass B+):
 *   ❌ MiniControlBar / DrawingMiniBar toolbars
 *   ❌ Bottom sheets (TF, trade, drawing tools, settings, more options, layout)
 *   ❌ Broker panels / BrokerIntegrationModal
 *   ❌ Replay controls
 *   ❌ Drawing interaction / FloatingDrawingPill
 *   ❌ Settings panel sheets
 *
 * Web source: src/components/charts/MobileChartLayout.tsx
 *
 * Web → RN changes (Pass A):
 *   div / HTMLDivElement         → View
 *   button / onPointerDownCapture → Pressable / onPressIn
 *   position:absolute+inset:0   → StyleSheet.absoluteFillObject
 *   display:grid                → flex-based equivalents
 *   overflow:hidden             → overflow:'hidden'
 *   background:                 → backgroundColor:
 *   touchAction:'none'          → removed (not applicable in RN)
 *   document.createElement/body → removed
 *   createPortal                → removed (RN Modal if needed in Pass B)
 *   wouter useLocation          → useFocusEffect (screen-level focus)
 *   window.dispatchEvent        → no-op stub (chart reset via Pass B)
 *   localStorage                → AsyncStorage (handled in charts.tsx)
 *   chartAreaRef type           → RefObject<View | null>
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
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import CustomChart from "./CustomChart";
import MiniChart from "./MiniChart";
import DrawingOverlay from "./DrawingOverlay";
import IndicatorRenderer from "./IndicatorRenderer";
import CustomIndicatorRenderer from "./CustomIndicatorRenderer";
import { MobileWatchlistOverlay } from "./MobileWatchlistOverlay";

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
import type { Drawing, ToolType, DrawingStyle } from "@/types/drawing";
import { useDrawingStore } from "@/store/drawingStore";
import { useBrokerStore } from "@/store/brokerStore";
import { getSymbolTick } from "@/store/tickStore";
// useLiveMarketContext is a Pass B dependency (wsStatus drives toolbar
// connected-indicator). The LiveMarketContext tablet implementation is
// pending Phase 6.x — imported as type-only stub for now.
import type { WsStatus } from "@/contexts/LiveMarketContext";
import {
  type ChartLayoutType,
  type NamedLayout,
} from "@/components/charts/RightToolbar";

// ── Shared palette constants (preserved from web) ──────────────────────────
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
const NEON          = "rgba(255,255,255,0.55)";
const GL_TEAL       = "rgba(255,255,255,0.82)";
const GL_BG         = "rgba(8,9,16,0.97)";
const GL_BORDER     = "rgba(255,255,255,0.12)";

// Active-slot selection border — matches the web's outline:#38bdf8
const SLOT_ACTIVE_BORDER = "#38bdf8";
const SLOT_IDLE_BORDER   = "rgba(255,255,255,0.06)";

// ── Layout options (preserved from web) ───────────────────────────────────
const LAYOUT_OPTIONS = [
  { cols: 1, rows: 1, label: "Single",  icon: [[1,1]] },
  { cols: 2, rows: 1, label: "2 Left",  icon: [[1,2]] },
  { cols: 1, rows: 2, label: "2 Top",   icon: [[2,1]] },
  { cols: 2, rows: 2, label: "4-Grid",  icon: [[2,2]] },
];

// ── Props (exported — preserved from web, chartAreaRef updated to View) ────
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
}

// ── Main Component ─────────────────────────────────────────────────────────
export const MobileChartLayout = memo(function MobileChartLayout(
  props: MobileChartLayoutProps,
) {
  const {
    activeKey, interval, selectInterval, selectSymbol,
    chartSettings, handleSettings, handleSaveAsDefault,
    replayBarSlice, alertDrawingIds, handleDrawingAlert, addAlertDrawingId,
    showIndicators, setShowIndicators,
    showAlertCenter, setShowAlertCenter,
    showQuickAlert, setShowQuickAlert, alertDrawing, closeAlertModal,
    openSidebar, handleScreenshot, chartAreaRef,
    onBarReplay,
    layoutCount, onLayoutChange, syncTF, onSyncTFChange,
    namedLayouts, defaultLayoutName, onSaveNamedLayout, onLoadNamedLayout,
    onRenameNamedLayout, onDeleteNamedLayout, activeLayoutId,
  } = props;

  // ── Responsive / orientation ─────────────────────────────────────────────
  const { width: screenW, height: screenH } = useWindowDimensions();
  const isLandscape = screenW > screenH;
  const insets = useSafeAreaInsets();

  // ── Store subscriptions (narrow — avoid broad re-renders on every tick) ──
  const chartType           = useChartStore(s => s.chartType);
  const setChartType        = useChartStore(s => s.setChartType);
  const setMobileFullscreen = useChartStore(s => s.setMobileChartFullscreen);
  // wsStatus: Pass B — useLiveMarketContext full implementation pending Phase 6.x.
  // The value is consumed only by MiniControlBar (Pass B toolbar).
  // Cast prevents TS narrowing the literal "disconnected" to a non-"connected"
  // type, which would make the downstream === "connected" check a type error.
  const wsStatus = ("disconnected" as WsStatus); // stub; replaced in Pass B
  const { items: watchlistItems } = useWatchlist();

  // Drawing store — narrow selectors
  const selectedDrawingId = useDrawingStore(s => s.selectedDrawingId);
  const drawings          = useDrawingStore(s => s.drawings);
  const activeTool        = useDrawingStore(s => s.activeTool);
  const setActiveTool     = useDrawingStore(s => s.setActiveTool);
  const selectedDrawing   = drawings.find(d => d.id === selectedDrawingId) ?? null;

  // Broker store
  const {
    openSelectModal, showSelectModal, showAuthModal,
    activeAccount, connectionStatus,
  } = useBrokerStore();
  const brokerConnected = !!activeAccount && connectionStatus === "connected";

  // ── Sheet / overlay visibility state ────────────────────────────────────
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

  // ── Multi-chart slot state ────────────────────────────────────────────────
  const [activeChartSlot, setActiveChartSlot] = useState(0);
  const [slotSymbols,     setSlotSymbols]     = useState<string[]>([
    "ETHUSD", "SOLUSD", "DOGEUSD",
  ]);
  const [slotIntervals, setSlotIntervals] = useState<string[]>(() => [
    interval, interval, interval,
  ]);
  const slotInitRef = useRef(false);

  // ── Close watchlist overlay when screen loses focus ──────────────────────
  // Mirrors the wouter useLocation effect from the web version: when the
  // user navigates away from the charts tab, dismiss any open overlays.
  useFocusEffect(
    useCallback(() => {
      // On focus: no-op (overlays open on demand)
      return () => {
        // On blur: close watchlist overlay
        setShowWatchlist(false);
      };
    }, []),
  );

  // ── One-time init: seed slot symbols from watchlist ───────────────────────
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

  // ── Reset store fullscreen flag when layout unmounts ─────────────────────
  useEffect(() => {
    return () => { setMobileFullscreen(false); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Non-reactive live price read (avoids re-renders on every tick) ───────
  const connected     = wsStatus === "connected";
  const livePrice     = getSymbolTick(activeKey)?.price ?? null;
  const liveChangePct = getSymbolTick(activeKey)?.changePct ?? 0;
  const isUp          = liveChangePct >= 0;

  // ── Symbol metadata ──────────────────────────────────────────────────────
  const catEntry = SYMBOL_CATALOG[activeKey];
  const wlEntry  = watchlistItems.find(i => i.symbol === activeKey);
  const badge    = wlEntry?.badge
    ?? catEntry?.badge
    ?? activeKey.slice(0, 4).toUpperCase();

  // ── Active slot derived values ────────────────────────────────────────────
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

  // ── Symbol / interval routing — routes to active slot ───────────────────
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

  const handleSelectInterval = useCallback((tf: string) => {
    if (activeChartSlot === 0 || layoutCount <= 1) {
      selectInterval(tf);
    } else {
      setSlotIntervals(prev => {
        const next = [...prev];
        next[activeChartSlot - 1] = tf;
        return next;
      });
    }
  }, [activeChartSlot, layoutCount, selectInterval]);

  // ── Prev / Next symbol (routes to active slot) ───────────────────────────
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

  // ── Stable sheet-open handlers (useCallback keeps memo'd children stable) ─
  const handleCloseDrawingSheet = useCallback(() => setShowDrawingSheet(false), []);
  const handleCloseSettings     = useCallback(() => setShowSettings(false),    []);
  const handleCloseObjectTree   = useCallback(() => setShowObjectTree(false),  []);
  const handleOpenSettings      = useCallback(() => setShowSettings(true),     []);
  const handleOpenTFSheet       = useCallback(() => setShowTFSheet(true),      []);
  const handleOpenDrawingSheet  = useCallback(() => setShowDrawingSheet(true), []);
  const handleOpenBrokerSheet   = useCallback(() => setShowBrokerIntegration(true), []);
  const handleOpenMoreSheet     = useCallback(() => setShowMoreSheet(true),    []);
  const handleOpenTradeSheet    = useCallback(() => setShowTradeSheet(true),   []);

  // ── Chart reset (Pass B: will emit event to CustomChart) ─────────────────
  // Web: window.dispatchEvent(new CustomEvent("tj:chart-reset"))
  // RN:  no window — Pass B will wire a module-level emitter.
  const handleResetChart = useCallback(() => {
    // Pass B implementation
  }, []);

  // ── Fullscreen (syncs to chartStore for nav hide) ────────────────────────
  const handleFullscreen = useCallback(() => {
    setIsFullscreen(prev => {
      const next = !prev;
      setMobileFullscreen(next);
      return next;
    });
  }, [setMobileFullscreen]);

  // ── Multi-chart grid helpers ──────────────────────────────────────────────

  /** Border style applied to a slot pane based on whether it is active */
  const slotBorderStyle = useCallback(
    (slot: number) =>
      slot === activeChartSlot
        ? styles.slotActive
        : styles.slotIdle,
    [activeChartSlot],
  );

  /** Main chart pane (slot 0) — always CustomChart with full overlays */
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

  /** Mini-chart pane for slot i+1 (slotSymbols[i]) */
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

  // ── Chart grid renderer ───────────────────────────────────────────────────
  //
  // Web uses CSS grid; RN uses nested flex Views.
  //
  // layoutCount=1: single chart fills container
  // layoutCount=2: [main | mini[0]] side-by-side (1:1)
  // layoutCount=3: [main(flex:2) | column[mini[0], mini[1]](flex:1)]
  // layoutCount=4: [col[main, mini[1]] | col[mini[0], mini[2]]] — 2×2
  //
  // Gap between panes: 2px (matches web's gap:2)
  // Active pane has a 2px blue border inset; idle pane has dim border.

  const renderChartGrid = () => {
    if (layoutCount === 1) {
      return (
        <View style={StyleSheet.absoluteFillObject}>
          {mainChartPane}
        </View>
      );
    }

    if (layoutCount === 2) {
      // Side-by-side: [main | mini[0]]
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
      // [main(flex:2) | column(flex:1)[mini[0], mini[1]]]
      // Mirrors CSS: gridTemplateColumns:"2fr 1fr", gridTemplateRows:"1fr 1fr",
      // slot 0 gridRow:"1 / 3"
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

    // layoutCount === 4: 2×2 grid
    // Mirrors CSS: gridTemplateColumns:"1fr 1fr", gridTemplateRows:"1fr 1fr"
    // slot 0 = top-left, mini[0] = top-right, mini[1] = bottom-left, mini[2] = bottom-right
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.gridCol, { gap: 2 }]}>
        {/* Top row */}
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
        {/* Bottom row */}
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

  // ── Render ────────────────────────────────────────────────────────────────
  //
  // Root container:
  //   • backgroundColor:#08090f  (matches web's background:"#08090f")
  //   • flex:1 fills the screen given by Expo Router's tab container
  //   • Bottom SafeArea inset is reserved; Pass B MiniControlBar will sit
  //     above insets.bottom so it floats above the home indicator.
  //
  // chartArea:
  //   • flex:1 expands to remaining height above the control bar
  //   • overflow:'hidden' prevents chart canvas from bleeding outside bounds
  //   • chartAreaRef forwarded from charts.tsx (e.g. for screenshot capture)
  //
  // Sheets / toolbars are stubs in Pass A — implemented in Pass B.

  return (
    <View style={styles.container}>
      {/* ── Chart area ─────────────────────────────────────────────────── */}
      <View
        ref={chartAreaRef}
        style={[
          styles.chartArea,
          // In landscape, side insets apply (notch on left/right)
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
      </View>

      {/* ── Pass B: MiniControlBar / DrawingMiniBar ─────────────────────
           Rendered below chartArea; height ~58px + insets.bottom padding.
           Preserved as a comment block so Pass B has an exact insertion point.
      ─────────────────────────────────────────────────────────────────── */}

      {/* ── Pass B: Bottom sheets (TradeSheet, TFSheet, DrawingToolsSheet,
           BrokerIntegrationModal, ChartTypeSheet, MoreOptionsSheet,
           LayoutBottomSheet, ChartSettingsSheet, IndicatorsPanel,
           AlertSheet, DrawingAlertModal, BrokerSelectModal, BrokerAuthModal,
           ObjectTreeSheet) ───────────────────────────────────────────────── */}

      {/* ── Watchlist overlay — always present so it can animate in/out ── */}
      <MobileWatchlistOverlay
        visible={showWatchlist}
        activeSymbol={activeSlotSymbol}
        onClose={() => setShowWatchlist(false)}
        onSelect={handleSelectSymbol}
        onOpenChart={() => setShowWatchlist(false)}
      />
    </View>
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#08090f",
  },

  chartArea: {
    flex: 1,
    overflow: "hidden",
  },

  // Solid bg painted behind the chart canvas so the dark color shows during
  // initial load before the first frame renders.
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

  // Individual chart slot — fills its flex cell, clips overflow
  gridCell: {
    overflow: "hidden",
  },

  // Active slot: 2px inset border matching web's outline:#38bdf8 2px
  slotActive: {
    borderWidth: 2,
    borderColor: SLOT_ACTIVE_BORDER,
  },

  // Idle slot: dim 1px border matching web's outline:rgba(255,255,255,0.06)
  slotIdle: {
    borderWidth: 1,
    borderColor: SLOT_IDLE_BORDER,
  },
});
