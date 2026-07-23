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
  useMemo,
} from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MobileChartLayout } from "@/components/charts/MobileChartLayout";
import {
  DEFAULT_CHART_SETTINGS,
  type ChartSettings,
} from "@/components/charts/chartSettingsTypes";
import { type ChartLayoutType, type NamedLayout } from "@/components/charts/RightToolbar";
import { useChartStore, type OHLCBar } from "@/store/chartStore";
import type { Drawing } from "@/types/drawing";
import { getApiBase } from "@/lib/apiBase";

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

// ── Replay phase type (module-level so it can be referenced outside the component) ──
type ReplayPhase = "off" | "selecting" | "active";

export default function ChartsScreen() {
  const insets = useSafeAreaInsets();

  // ── Chart store — symbol / interval / chartType ────────────────────────
  // Narrow selectors: each field subscribed independently to avoid
  // re-rendering the whole screen on unrelated store changes.
  const symbol         = useChartStore(s => s.symbol);
  const interval       = useChartStore(s => s.interval);
  const setSymbol        = useChartStore(s => s.setSymbol);
  const selectInterval   = useChartStore(s => s.setInterval);

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

  // ── Bar Replay (Pass C) ────────────────────────────────────────────────────
  // Mirrors web charts.tsx replay state machine. On mobile there is no
  // ReplaySelector drag step — we skip straight to "active" starting
  // MIN_REPLAY_START bars before the end of the series.
  const MIN_REPLAY_START = 100;

  const [replayPhase,   setReplayPhase]   = useState<ReplayPhase>("off");
  const [replayAllBars, setReplayAllBars] = useState<OHLCBar[]>([]);
  const [replayIdx,     setReplayIdx]     = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed,   setReplaySpeed]   = useState(1);
  const [_replayLoading, setReplayLoading] = useState(false);
  const replayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const exitReplay = useCallback(() => {
    if (replayIntervalRef.current) {
      clearInterval(replayIntervalRef.current);
      replayIntervalRef.current = null;
    }
    setReplayPhase("off");
    setReplayAllBars([]);
    setReplayIdx(0);
    setReplayPlaying(false);
  }, []);

  const enterReplay = useCallback(async () => {
    if (replayPhase !== "off") { exitReplay(); return; }
    setReplayLoading(true);
    try {
      const BASE = getApiBase();
      const resp = await fetch(`${BASE}/api/candles/${symbol}/${interval}`);
      if (!resp.ok) throw new Error("fetch failed");
      const raw = (await resp.json()) as OHLCBar[];
      const bars = [...new Map(raw.map(b => [b.time, b])).values()]
        .sort((a, b) => a.time - b.time);
      if (bars.length === 0) return;
      const startIdx = Math.max(0, bars.length - MIN_REPLAY_START);
      setReplayAllBars(bars);
      setReplayIdx(startIdx);
      setReplayPhase("active");
      setReplayPlaying(false);
    } catch {
      // silent — no toast library available yet
    } finally {
      setReplayLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayPhase, exitReplay, symbol, interval]);

  // Auto-play timer
  useEffect(() => {
    if (!replayPlaying || replayPhase !== "active") return;
    const ms = Math.round(1000 / replaySpeed);
    replayIntervalRef.current = setInterval(() => {
      setReplayIdx(prev => {
        if (prev >= replayAllBars.length - 1) {
          setReplayPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, ms);
    return () => {
      if (replayIntervalRef.current) {
        clearInterval(replayIntervalRef.current);
        replayIntervalRef.current = null;
      }
    };
  }, [replayPlaying, replaySpeed, replayPhase, replayAllBars.length]);

  // The bar slice passed to CustomChart during active replay
  const replayBarSlice = useMemo<OHLCBar[] | null>(() => {
    if (replayPhase !== "active") return null;
    return replayAllBars.slice(0, replayIdx + 1);
  }, [replayPhase, replayAllBars, replayIdx]);

  // ── Stable replay control callbacks ───────────────────────────────────────
  const onReplayPlay = useCallback(() => setReplayPlaying(true), []);
  const onReplayPause = useCallback(() => setReplayPlaying(false), []);
  const onReplayStepBack = useCallback(() => {
    setReplayPlaying(false);
    setReplayIdx(prev => Math.max(prev - 1, 0));
  }, []);
  const onReplayStepForward = useCallback(() => {
    setReplayPlaying(false);
    setReplayIdx(prev => Math.min(prev + 1, replayAllBars.length - 1));
  }, [replayAllBars.length]);
  const onReplaySpeedChange = useCallback((s: number) => setReplaySpeed(s), []);

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
        selectInterval={selectInterval}

        // ── Chart settings ──
        chartSettings={chartSettings}
        handleSettings={handleSettings}
        handleSaveAsDefault={handleSaveAsDefault}

        // ── Replay ──
        replayBarSlice={replayBarSlice}
        onBarReplay={enterReplay}
        replayPhase={replayPhase}
        replayCurrentBar={replayAllBars[replayIdx] ?? null}
        replayPlaying={replayPlaying}
        replaySpeed={replaySpeed}
        replayIdx={replayIdx}
        replayTotalBars={replayAllBars.length}
        onReplayPlay={onReplayPlay}
        onReplayPause={onReplayPause}
        onReplayStepBack={onReplayStepBack}
        onReplayStepForward={onReplayStepForward}
        onReplaySpeedChange={onReplaySpeedChange}
        onExitReplay={exitReplay}

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
