/**
 * app/(tabs)/charts.tsx — Charts tab screen (Phase 9.25.1 Pass A)
 *
 * Pass A scope:
 *   ✅ Expo Router screen integration
 *   ✅ React Navigation tab integration
 *   ✅ Full state management for MobileChartLayout props
 *   ✅ chartStore integration (symbol, interval, selectSymbol, selectInterval)
 *   ✅ chartSettings state (DEFAULT_CHART_SETTINGS, AsyncStorage persistence)
 *   ✅ Layout state (layoutCount, syncTF)
 *   ✅ Alert state (alertDrawingIds, alertDrawing, showQuickAlert)
 *   ✅ Sheet visibility state (showIndicators, showAlertCenter)
 *   ✅ chartAreaRef forwarded to MobileChartLayout
 *   ✅ SafeArea top padding (bottom handled inside MobileChartLayout)
 *
 * NOT in Pass A (Pass B+):
 *   ❌ Named layout persistence (AsyncStorage for namedLayouts)
 *   ❌ layoutCount / syncTF AsyncStorage persistence
 *   ❌ chartSettings AsyncStorage load (skeleton in place for Pass B)
 *   ❌ Screenshot capture
 *   ❌ Replay controls
 *
 * Web equivalent: artifacts/trading-journal/src/pages/charts.tsx
 *   (the isMobile branch which renders <MobileChartLayout>)
 */

import React, {
  useCallback,
  useRef,
  useState,
  useEffect,
} from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MobileChartLayout } from "@/components/charts/MobileChartLayout";
import {
  DEFAULT_CHART_SETTINGS,
  type ChartSettings,
} from "@/components/charts/chartSettingsTypes";
import { type ChartLayoutType, type NamedLayout } from "@/components/charts/RightToolbar";
import { useChartStore } from "@/store/chartStore";
import type { Drawing } from "@/types/drawing";

// ── ChartsScreen ────────────────────────────────────────────────────────────
//
// Thin orchestrator that owns all state fed into MobileChartLayout.
// Mirrors charts.tsx (web) in the isMobile rendering branch, stripped of
// desktop-only concerns (sidebar, BuySellPanel, desktop toolbar, replay UI).
//
// Layout:
//   SafeArea top pad (header-equivalent space) — not present on mobile charts
//   MobileChartLayout (flex:1) — owns chart area + Pass B bottom toolbar
//
// The component is kept mounted by Expo Router's tab navigator (keep-alive
// semantics matching the web's keep-alive opacity toggle). State persists
// across tab switches without re-mounting.

export default function ChartsScreen() {
  const insets = useSafeAreaInsets();

  // ── Chart store — symbol / interval / chartType ────────────────────────
  // Narrow selectors: each field subscribed independently to avoid
  // re-rendering the whole screen on unrelated store changes.
  const symbol         = useChartStore(s => s.symbol);
  const interval       = useChartStore(s => s.interval);
  const setSymbol      = useChartStore(s => s.setSymbol);
  const setInterval    = useChartStore(s => s.setInterval);

  // ── Chart settings ────────────────────────────────────────────────────────
  // Seeded from DEFAULT_CHART_SETTINGS on mount.
  // Pass B: load from AsyncStorage (replaces web's localStorage load).
  const [chartSettings, setChartSettings] = useState<ChartSettings>(
    DEFAULT_CHART_SETTINGS,
  );

  const handleSettings = useCallback(
    (s: ChartSettings) => setChartSettings(s),
    [],
  );

  // Save-as-default mirrors web behaviour: persist the new settings as the
  // default for future sessions. Pass B: write to AsyncStorage.
  const handleSaveAsDefault = useCallback(
    (s: ChartSettings) => setChartSettings(s),
    [],
  );

  // ── Layout count + TF sync ─────────────────────────────────────────────
  // Pass B: restore from AsyncStorage (web uses localStorage("tv_layout") /
  // localStorage("tv_sync_tf")).
  const [layoutCount, setLayoutCount] = useState<ChartLayoutType>(1);
  const [syncTF,      setSyncTF]      = useState<boolean>(false);

  // ── Alert state ───────────────────────────────────────────────────────────
  const [alertDrawingIds, setAlertDrawingIds] = useState<Set<number>>(
    () => new Set<number>(),
  );
  const [alertDrawing,  setAlertDrawing]  = useState<Drawing | null>(null);
  const [showQuickAlert, setShowQuickAlert] = useState(false);

  const handleDrawingAlert = useCallback((d: Drawing) => {
    setAlertDrawing(d);
  }, []);

  const addAlertDrawingId = useCallback((id: number) => {
    setAlertDrawingIds(prev => new Set(prev).add(id));
  }, []);

  const closeAlertModal = useCallback(() => {
    setAlertDrawing(null);
    setShowQuickAlert(false);
  }, []);

  // ── Sheet visibility — owned here so the parent can open/close panels ────
  // Pass B: these open specific bottom sheets rendered inside MobileChartLayout.
  const [showIndicators,  setShowIndicators]  = useState(false);
  const [showAlertCenter, setShowAlertCenter] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  // chartAreaRef: forwarded to MobileChartLayout's chart area View.
  // Used for screenshot capture (Pass B) and gesture exclusion zones.
  const chartAreaRef = useRef<View>(null);

  // ── Named layouts (Pass B — empty stubs satisfy the prop contract) ────────
  // Pass B: implement AsyncStorage-backed useNamedLayouts hook (mirrors
  // src/hooks/useNamedLayouts.ts on the web).
  const namedLayouts: NamedLayout[]        = [];
  const defaultLayoutName                  = "";
  const activeLayoutId: string | null      = null;

  const onSaveNamedLayout   = useCallback((_name: string) => {}, []);
  const onLoadNamedLayout   = useCallback((_layout: NamedLayout) => {}, []);
  const onRenameNamedLayout = useCallback((_id: string, _name: string) => {}, []);
  const onDeleteNamedLayout = useCallback((_id: string) => {}, []);

  // ── Screenshot (Pass B) ──────────────────────────────────────────────────
  // Web: html2canvas on chartAreaRef. RN: react-native-view-shot or Skia
  // surface capture. Stubbed for Pass A.
  const handleScreenshot = useCallback(() => {
    // Pass B implementation
  }, []);

  // ── Bar replay (Pass B) ──────────────────────────────────────────────────
  // replayBarSlice is null in Pass A; replay mode is driven from MoreOptionsSheet.
  const onBarReplay = useCallback(() => {
    // Pass B implementation
  }, []);

  // ── Sidebar (no-op on mobile — desktop-only concept) ────────────────────
  const openSidebar = useCallback(() => {}, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <MobileChartLayout
        // ── Symbol / interval ──
        activeKey={symbol}
        interval={interval}
        selectSymbol={setSymbol}
        selectInterval={setInterval}

        // ── Chart settings ──
        chartSettings={chartSettings}
        handleSettings={handleSettings}
        handleSaveAsDefault={handleSaveAsDefault}

        // ── Replay ──
        replayBarSlice={null}
        onBarReplay={onBarReplay}

        // ── Alerts ──
        alertDrawingIds={alertDrawingIds}
        handleDrawingAlert={handleDrawingAlert}
        addAlertDrawingId={addAlertDrawingId}
        alertDrawing={alertDrawing}
        closeAlertModal={closeAlertModal}
        showQuickAlert={showQuickAlert}
        setShowQuickAlert={setShowQuickAlert}

        // ── Sheet visibility ──
        showIndicators={showIndicators}
        setShowIndicators={setShowIndicators}
        showAlertCenter={showAlertCenter}
        setShowAlertCenter={setShowAlertCenter}

        // ── Misc ──
        openSidebar={openSidebar}
        handleScreenshot={handleScreenshot}
        chartAreaRef={chartAreaRef}

        // ── Layout ──
        layoutCount={layoutCount}
        onLayoutChange={setLayoutCount}
        syncTF={syncTF}
        onSyncTFChange={setSyncTF}

        // ── Named layouts (Pass B) ──
        namedLayouts={namedLayouts}
        defaultLayoutName={defaultLayoutName}
        onSaveNamedLayout={onSaveNamedLayout}
        onLoadNamedLayout={onLoadNamedLayout}
        onRenameNamedLayout={onRenameNamedLayout}
        onDeleteNamedLayout={onDeleteNamedLayout}
        activeLayoutId={activeLayoutId}
      />
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#08090f",
  },
});
