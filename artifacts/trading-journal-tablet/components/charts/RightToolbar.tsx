/**
 * RightToolbar.tsx — React Native port (Phase 9.21 Pass A)
 *
 * Migrated from src/components/charts/RightToolbar.tsx
 *
 * Web → RN changes (Pass A):
 *   import.meta.env.BASE_URL     → getApiBase()
 *   lucide-react icons           → Ionicons (full mapping in TOOL_ICON_NAMES)
 *   <img src={svgUrl}>           → Ionicons
 *   createPortal / camera menu   → Modal
 *   SlidePanel (Framer Motion)   → Modal slide panel
 *   PanelHeader X button         → Pressable + Ionicons "close"
 *   document.addEventListener    → Modal's onRequestClose + Pressable backdrop
 *   motion / AnimatePresence     → removed (plain View; animation deferred)
 *   hover effects                → removed
 *   overflowY: "auto"            → ScrollView
 *   display: "grid"              → flexDirection + flexWrap (View)
 *   <input>                      → TextInput
 *   <button>                     → Pressable
 *   AnimatedList/AnimatedListItem → plain View wrapper
 *   WatchlistSlide (unused)      → BrokerWatchlist component (same as web runtime)
 *   BrokerWatchlist              → tablet's already-migrated BrokerWatchlist
 *   fmtPrice from LiveMarketContext → @/lib/fmtPrice
 *   NamedLayout from @/hooks/…   → defined locally and re-exported
 *
 * Exports (unchanged):
 *   ChartLayoutType
 *   RightToolbarProps
 *   TOOLBAR_W
 *   default RightToolbar
 */

import { memo, useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, Pressable, ScrollView, TextInput,
  Modal, StyleSheet, Dimensions, ActivityIndicator,
} from "react-native";
import {
  TrendingUp, TrendingDown, ArrowRight, Minus, GitMerge, Square, Circle as CircleIcon,
  Type, FileText, Paintbrush, Highlighter, PenLine, Spline,
  List, Bell, GitBranch, LayoutGrid, Calculator, Camera, Minimize2, Maximize2, Settings,
  Eye, EyeOff, Lock, Trash2, ChevronRight as ChevronRightIcon, ChevronDown as ChevronDownIcon,
  Link2, Unlink, LayoutDashboard,
} from "lucide-react-native";
import { useDrawingStore } from "@/store/drawingStore";
import { useTickStore } from "@/store/tickStore";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { BrokerWatchlist } from "@/components/charts/BrokerWatchlist";
import { fmtPrice } from "@/lib/fmtPrice";
import { getApiBase } from "@/lib/apiBase";

const BASE = getApiBase();

// ── Types ─────────────────────────────────────────────────────────────────────
type PanelId = "watchlist" | "objects" | "layout" | null;

export type ChartLayoutType = 1 | 2 | 3 | 4;

/** Minimal NamedLayout shape (mirrors @/hooks/useNamedLayouts on the web) */
export interface NamedLayout {
  id:           string;
  name:         string;
  symbol:       string;
  interval:     string;
  chartType?:   string;
  indicators?:  string[];
  layoutCount?: number;
  [key: string]: unknown;
}

export interface RightToolbarProps {
  activeSymbol:    string;
  activeTimeframe: string;
  alertCount:      number;
  onSelectSymbol:  (sym: string) => void;
  layoutCount:     ChartLayoutType;
  onLayoutChange:  (n: ChartLayoutType) => void;
  syncTF:          boolean;
  onSyncTFChange:  (v: boolean) => void;
  onAlertClick?:   () => void;
  onScreenshot?:   () => void;
  onCopyLiveLink?: () => void;
  onFullscreen?:   () => void;
  onSettings?:     () => void;
  isFullscreen?:   boolean;
  showSettings?:   boolean;
  namedLayouts:         NamedLayout[];
  defaultLayoutName:    string;
  onSaveNamedLayout:    (name: string) => void;
  onLoadNamedLayout:    (layout: NamedLayout) => void;
  onRenameNamedLayout:  (id: string, name: string) => void;
  onDeleteNamedLayout:  (id: string) => void;
  activeLayoutId:       string | null;
}

/** Width of the icon rail column */
export const TOOLBAR_W = 52;

// ── Object tree icon / label maps ──────────────────────────────────────────────
type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const TOOL_ICON_NAMES: Record<string, LucideIcon> = {
  trendline:      TrendingUp,
  ray:            ArrowRight,
  extended:       ArrowRight,
  hline:          Minus,
  hray:           Minus,
  vline:          Minus,
  channel:        GitMerge,
  fib:            GitMerge,
  fib_channel:    GitMerge,
  rect:           Square,
  ellipse:        CircleIcon,
  text:           Type,
  note:           FileText,
  arrow:          ArrowRight,
  position_long:  TrendingUp,
  position_short: TrendingDown,
  brush:          Paintbrush,
  highlighter:    Highlighter,
  path:           PenLine,
  curve:          Spline,
};
const TOOL_LABELS: Record<string, string> = {
  trendline: "Trendline", ray: "Ray", extended: "Extended",
  hline: "H. Line", hray: "H. Ray", vline: "V. Line", arrow: "Arrow",
  channel: "Channel", fib: "Fib", fib_channel: "Fib Channel",
  rect: "Rectangle", ellipse: "Circle", text: "Text", note: "Note",
  position_long: "Long Position", position_short: "Short Position",
  brush: "Brush", highlighter: "Highlighter", path: "Path", curve: "Curve",
  date_range: "Date Range", price_range: "Price Range",
};

// ── Toolbar button ────────────────────────────────────────────────────────────
function ToolBtn({
  Icon, label, active, badge, onClick, disabled, btnSize = 44, iconSize = 22,
}: {
  Icon: LucideIcon; label: string; active?: boolean;
  badge?: number; onClick?: () => void; disabled?: boolean;
  btnSize?: number; iconSize?: number;
}) {
  return (
    <Pressable
      onPress={onClick}
      disabled={disabled}
      style={[
        styles.toolBtn,
        { width: btnSize, height: btnSize },
        active && styles.toolBtnActive,
        disabled && styles.toolBtnDisabled,
      ]}
    >
      <Icon
        size={iconSize}
        color="#ffffff"
      />
      {badge !== undefined && badge > 0 && (
        <View style={[
          styles.badge,
          label === "Alerts" ? styles.badgeAlert : styles.badgeGreen,
        ]}>
          <Text style={[
            styles.badgeText,
            label === "Alerts" ? styles.badgeTextAlert : styles.badgeTextGreen,
          ]}>
            {badge > 9 ? "9+" : badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Panel header ──────────────────────────────────────────────────────────────
function PanelHeader({ title, Icon, onClose }: {
  title: string; Icon: LucideIcon; onClose: () => void;
}) {
  return (
    <View style={styles.panelHeader}>
      <View style={styles.panelHeaderIcon}>
        <Icon size={14} color="#B7FF5A" />
      </View>
      <Text style={styles.panelHeaderTitle} numberOfLines={1}>{title}</Text>
      <Pressable onPress={onClose} style={styles.panelHeaderClose} hitSlop={8}>
        <X size={13} color="rgba(167,184,169,0.45)" />
      </Pressable>
    </View>
  );
}

// ── Slide panel (Modal-based) ─────────────────────────────────────────────────
function SlidePanel({ open, width = 300, children, onClose }: {
  open: boolean; width?: number; children: React.ReactNode; onClose: () => void;
}) {
  return (
    <Modal transparent visible={open} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <View style={[styles.slidePanel, { width }]}>
        {children}
      </View>
    </Modal>
  );
}

// ── ObjectsSlide ──────────────────────────────────────────────────────────────
const ObjectsSlide = memo(function ObjectsSlide({
  symbol, timeframe, onClose,
}: { symbol: string; timeframe: string; onClose: () => void }) {
  const { drawings, updateDrawing, removeDrawing } = useDrawingStore();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = drawings.filter(d => d.symbol === symbol && d.timeframe === timeframe);

  const byType = filtered.reduce<Record<string, typeof filtered>>((acc, d) => {
    if (!acc[d.toolType]) acc[d.toolType] = [];
    acc[d.toolType].push(d);
    return acc;
  }, {});

  const handleDelete = async (id: number) => {
    removeDrawing(id);
    try { await fetch(`${BASE}/api/drawings/${id}`, { method: "DELETE" }); } catch { /* ignore */ }
  };

  return (
    <View style={{ flex: 1 }}>
      <PanelHeader title="Object Tree" Icon={GitBranch} onClose={onClose} />

      {/* Symbol + timeframe badges */}
      <View style={styles.objectsBadgeRow}>
        <View style={styles.symbolBadge}>
          <Text style={styles.symbolBadgeText}>{symbol}</Text>
        </View>
        <View style={styles.tfBadge}>
          <Text style={styles.tfBadgeText}>{timeframe}</Text>
        </View>
        <View style={{ flex: 1 }} />
        {filtered.length > 0 && (
          <Text style={styles.objectCount}>
            {filtered.length} object{filtered.length !== 1 ? "s" : ""}
          </Text>
        )}
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <GitBranch size={24} color="rgba(255,255,255,0.15)" />
            <Text style={styles.emptyTitle}>No objects</Text>
            <Text style={styles.emptySubtitle}>Drawings placed on the chart{"\n"}will appear here</Text>
          </View>
        ) : (
          Object.entries(byType).map(([type, items]) => {
            const iconName = TOOL_ICON_NAMES[type] ?? "pencil-outline";
            const label = TOOL_LABELS[type] ?? type.replace(/_/g, " ");
            const isCollapsed = collapsed[type];
            const allVisible = items.every(d => d.isVisible !== false);

            return (
              <View key={type} style={styles.objectGroup}>
                {/* Group header */}
                <Pressable
                  style={styles.objectGroupHeader}
                  onPress={() => setCollapsed(p => ({ ...p, [type]: !p[type] }))}
                >
                  {isCollapsed
                    ? <ChevronRightIcon size={11} color="rgba(255,255,255,0.28)" />
                    : <ChevronDownIcon  size={11} color="rgba(255,255,255,0.28)" />}
                  <View style={styles.objectGroupIcon}>
                    <ToolTypeIcon size={12} color="rgba(255,255,255,0.7)" />
                  </View>
                  <Text style={styles.objectGroupLabel} numberOfLines={1}>{label}</Text>
                  <View style={styles.objectGroupCount}>
                    <Text style={styles.objectGroupCountText}>{items.length}</Text>
                  </View>
                  <Pressable
                    style={styles.iconBtn26}
                    onPress={e => {
                      items.forEach(d => updateDrawing(d.id, { isVisible: !allVisible }));
                    }}
                    hitSlop={4}
                  >
                    {allVisible
                      ? <Eye    size={13} color="rgba(255,255,255,0.45)" />
                      : <EyeOff size={13} color="rgba(255,255,255,0.22)" />}
                  </Pressable>
                </Pressable>

                {/* Drawing rows */}
                {!isCollapsed && (
                  <View style={styles.drawingRowsContainer}>
                    {items.map((d, i) => {
                      const priceStr = d.points[0]?.price
                        ? (d.points[0].price > 1000
                          ? d.points[0].price.toFixed(2)
                          : d.points[0].price.toFixed(5))
                        : null;
                      return (
                        <View
                          key={d.id}
                          style={[
                            styles.drawingRow,
                            i > 0 && styles.drawingRowBorder,
                            d.isVisible === false && styles.drawingRowHidden,
                          ]}
                        >
                          <View style={[styles.colorSwatch, { backgroundColor: d.style.color }]} />
                          <Text style={styles.drawingRowLabel} numberOfLines={1}>
                            {priceStr ?? `${label} ${i + 1}`}
                          </Text>
                          <Pressable
                            style={styles.iconBtn26}
                            onPress={() => updateDrawing(d.id, { isVisible: !(d.isVisible !== false) })}
                            hitSlop={4}
                          >
                            {d.isVisible !== false
                              ? <Eye    size={12} color="rgba(255,255,255,0.4)" />
                              : <EyeOff size={12} color="rgba(255,255,255,0.2)" />}
                          </Pressable>
                          <Pressable
                            style={styles.iconBtn26}
                            onPress={() => updateDrawing(d.id, { isLocked: !d.isLocked })}
                            hitSlop={4}
                          >
                            <Lock size={12} color={d.isLocked ? "#B7FF5A" : "rgba(255,255,255,0.28)"} />
                          </Pressable>
                          <Pressable
                            style={styles.iconBtn26}
                            onPress={() => handleDelete(d.id)}
                            hitSlop={4}
                          >
                            <Trash2 size={12} color="rgba(255,255,255,0.25)" />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Footer */}
      {filtered.length > 0 && (
        <View style={styles.objectsFooter}>
          <Pressable
            style={styles.objectsFooterBtn}
            onPress={() => filtered.forEach(d => updateDrawing(d.id, { isVisible: false }))}
          >
            <EyeOff size={11} color="rgba(255,255,255,0.4)" />
            <Text style={styles.objectsFooterText}>Hide all</Text>
          </Pressable>
          <Pressable
            style={styles.objectsFooterBtn}
            onPress={() => filtered.forEach(d => updateDrawing(d.id, { isVisible: true }))}
          >
            <Eye size={11} color="rgba(255,255,255,0.4)" />
            <Text style={styles.objectsFooterText}>Show all</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
});

// ── Layout previews ───────────────────────────────────────────────────────────
function LayoutPreview1() {
  return <View style={{ flex: 1, backgroundColor: "rgba(183,255,90,0.18)", borderRadius: 3 }} />;
}
function LayoutPreview2() {
  return (
    <View style={{ flex: 1, flexDirection: "row", gap: 2 }}>
      {[0,1].map(i => <View key={i} style={{ flex: 1, backgroundColor: "rgba(183,255,90,0.14)", borderRadius: 3 }} />)}
    </View>
  );
}
function LayoutPreview3() {
  return (
    <View style={{ flex: 1, flexDirection: "row", gap: 2 }}>
      <View style={{ flex: 2, backgroundColor: "rgba(183,255,90,0.14)", borderRadius: 3 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flex: 1, backgroundColor: "rgba(183,255,90,0.14)", borderRadius: 3 }} />
        <View style={{ flex: 1, backgroundColor: "rgba(183,255,90,0.14)", borderRadius: 3 }} />
      </View>
    </View>
  );
}
function LayoutPreview4() {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <View style={{ flex: 1, flexDirection: "row", gap: 2 }}>
        <View style={{ flex: 1, backgroundColor: "rgba(183,255,90,0.14)", borderRadius: 3 }} />
        <View style={{ flex: 1, backgroundColor: "rgba(183,255,90,0.14)", borderRadius: 3 }} />
      </View>
      <View style={{ flex: 1, flexDirection: "row", gap: 2 }}>
        <View style={{ flex: 1, backgroundColor: "rgba(183,255,90,0.14)", borderRadius: 3 }} />
        <View style={{ flex: 1, backgroundColor: "rgba(183,255,90,0.14)", borderRadius: 3 }} />
      </View>
    </View>
  );
}

const LAYOUT_PREVIEWS = [LayoutPreview1, LayoutPreview2, LayoutPreview3, LayoutPreview4];
const LAYOUT_LABELS   = ["Single", "Side by Side", "Large + 2", "4 Charts"];

// ── LayoutSlide ───────────────────────────────────────────────────────────────
const LayoutSlide = memo(function LayoutSlide({
  current, onChange, onClose, syncTF, onSyncTFChange,
  namedLayouts, defaultLayoutName, onSaveNamedLayout, onLoadNamedLayout,
  onRenameNamedLayout, onDeleteNamedLayout, activeLayoutId,
}: {
  current: ChartLayoutType; onChange: (n: ChartLayoutType) => void; onClose: () => void;
  syncTF: boolean; onSyncTFChange: (v: boolean) => void;
  namedLayouts: NamedLayout[];
  defaultLayoutName: string;
  onSaveNamedLayout: (name: string) => void;
  onLoadNamedLayout: (layout: NamedLayout) => void;
  onRenameNamedLayout: (id: string, name: string) => void;
  onDeleteNamedLayout: (id: string) => void;
  activeLayoutId: string | null;
}) {
  const [showSave,   setShowSave]   = useState(false);
  const [saveName,   setSaveName]   = useState("");
  const [renameId,   setRenameId]   = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");

  const handleSave = () => {
    if (!saveName.trim()) return;
    onSaveNamedLayout(saveName.trim());
    setSaveName("");
    setShowSave(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <PanelHeader title="Layout Manager" Icon={LayoutDashboard} onClose={onClose} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingTop: 14 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>Chart Grid</Text>

        {/* 2-column grid of layout previews */}
        <View style={styles.layoutGrid}>
          {([1, 2, 3, 4] as ChartLayoutType[]).map((n, idx) => {
            const Preview = LAYOUT_PREVIEWS[idx];
            const active  = current === n;
            return (
              <Pressable
                key={n}
                style={[styles.layoutPreviewBtn, active && styles.layoutPreviewBtnActive]}
                onPress={() => { onChange(n); }}
              >
                <View style={styles.layoutPreviewBox}>
                  <Preview />
                </View>
                <Text style={[styles.layoutPreviewLabel, active && styles.layoutPreviewLabelActive]}>
                  {LAYOUT_LABELS[idx]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Timeframe sync toggle */}
        {current > 1 && (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.sectionLabel}>Timeframe Sync</Text>
            <Pressable
              style={[styles.syncToggleBtn, syncTF && styles.syncToggleBtnActive]}
              onPress={() => onSyncTFChange(!syncTF)}
            >
              <View style={[styles.syncIconBox, syncTF && styles.syncIconBoxActive]}>
                {syncTF
                  ? <Link2  size={15} color="#B7FF5A" />
                  : <Unlink size={15} color="rgba(167,184,169,0.45)" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.syncTitle, syncTF && styles.syncTitleActive]}>
                  {syncTF ? "Synced" : "Independent"}
                </Text>
                <Text style={styles.syncSubtitle}>
                  {syncTF ? "All charts match main timeframe" : "Each chart has own timeframe"}
                </Text>
              </View>
              {/* Toggle pill */}
              <View style={[styles.togglePill, syncTF && styles.togglePillOn]}>
                <View style={[styles.toggleThumb, syncTF && styles.toggleThumbOn]} />
              </View>
            </Pressable>
          </View>
        )}

        {/* Saved layouts */}
        <View style={styles.savedLayoutsSection}>
          <View style={styles.savedLayoutsHeader}>
            <Text style={styles.sectionLabel}>Saved Layouts</Text>
            {!showSave && (
              <Pressable
                onPress={() => { setShowSave(true); setSaveName(defaultLayoutName); }}
                style={styles.saveCurrentBtn}
              >
                <Text style={styles.saveCurrentBtnText}>+ Save Current</Text>
              </Pressable>
            )}
          </View>

          {showSave && (
            <View style={styles.saveInputRow}>
              <TextInput
                value={saveName}
                onChangeText={setSaveName}
                onSubmitEditing={handleSave}
                placeholder="Layout name…"
                placeholderTextColor="rgba(167,184,169,0.4)"
                style={styles.saveInput}
                autoFocus
              />
              <Pressable onPress={handleSave} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>Save</Text>
              </Pressable>
              <Pressable onPress={() => setShowSave(false)} style={styles.saveCancelBtn}>
                <Text style={styles.saveCancelBtnText}>✕</Text>
              </Pressable>
            </View>
          )}

          {namedLayouts.length === 0 ? (
            <Text style={styles.noLayoutsText}>
              No saved layouts yet.{"\n"}Save your current chart state to restore it later.
            </Text>
          ) : (
            namedLayouts.map(layout => {
              const isActive = layout.id === activeLayoutId;
              return (
                <View key={layout.id} style={[styles.namedLayoutCard, isActive && styles.namedLayoutCardActive]}>
                  {renameId === layout.id ? (
                    <TextInput
                      value={renameName}
                      onChangeText={setRenameName}
                      onSubmitEditing={() => { onRenameNamedLayout(layout.id, renameName || layout.name); setRenameId(null); }}
                      onBlur={() => { onRenameNamedLayout(layout.id, renameName || layout.name); setRenameId(null); }}
                      style={styles.renameInput}
                      autoFocus
                    />
                  ) : (
                    <>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                          <Text style={[styles.namedLayoutName, isActive && styles.namedLayoutNameActive]} numberOfLines={1}>
                            {layout.name}
                          </Text>
                          {isActive && (
                            <View style={styles.activeLayoutBadge}>
                              <Text style={styles.activeLayoutBadgeText}>✓ Active</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.namedLayoutMeta, isActive && styles.namedLayoutMetaActive]}>
                          {layout.symbol} · {layout.interval}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => { onLoadNamedLayout(layout); onClose(); }}
                        style={[styles.namedLayoutLoadBtn, isActive && styles.namedLayoutLoadBtnActive]}
                      >
                        <Text style={[styles.namedLayoutLoadText, isActive && styles.namedLayoutLoadTextActive]}>
                          {isActive ? "Reload" : "Load"}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => { setRenameId(layout.id); setRenameName(layout.name); }}
                        style={styles.namedLayoutIconBtn}
                        hitSlop={4}
                      >
                        <Text style={{ fontSize: 11, color: "rgba(167,184,169,0.5)" }}>✏</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => onDeleteNamedLayout(layout.id)}
                        style={styles.namedLayoutIconBtn}
                        hitSlop={4}
                      >
                        <Trash2 size={13} color="rgba(239,68,68,0.5)" />
                      </Pressable>
                    </>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
});

// ── Main RightToolbar ──────────────────────────────────────────────────────────
const RightToolbar = memo(function RightToolbar({
  activeSymbol, activeTimeframe, alertCount, onSelectSymbol,
  layoutCount, onLayoutChange, syncTF, onSyncTFChange, onAlertClick,
  onScreenshot, onCopyLiveLink, onFullscreen, onSettings, isFullscreen, showSettings,
  namedLayouts, defaultLayoutName, onSaveNamedLayout, onLoadNamedLayout,
  onRenameNamedLayout, onDeleteNamedLayout, activeLayoutId,
}: RightToolbarProps) {
  const [openPanel,      setOpenPanel]      = useState<PanelId>(null);
  const [showCameraMenu, setShowCameraMenu] = useState(false);
  const { drawings } = useDrawingStore();
  const drawingCount = drawings.filter(d => d.symbol === activeSymbol && d.timeframe === activeTimeframe).length;

  const toggle = useCallback((panel: PanelId) => {
    setOpenPanel(prev => prev === panel ? null : panel);
  }, []);

  return (
    <>
      {/* Watchlist slide panel */}
      <SlidePanel open={openPanel === "watchlist"} width={300} onClose={() => setOpenPanel(null)}>
        <BrokerWatchlist
          activeSymbol={activeSymbol}
          onSelectSymbol={(s: string) => { onSelectSymbol(s); setOpenPanel(null); }}
        />
      </SlidePanel>

      {/* Objects slide panel */}
      <SlidePanel open={openPanel === "objects"} width={300} onClose={() => setOpenPanel(null)}>
        <ObjectsSlide
          symbol={activeSymbol}
          timeframe={activeTimeframe}
          onClose={() => setOpenPanel(null)}
        />
      </SlidePanel>

      {/* Layout slide panel */}
      <SlidePanel open={openPanel === "layout"} width={272} onClose={() => setOpenPanel(null)}>
        <LayoutSlide
          current={layoutCount}
          onChange={n => { onLayoutChange(n); setOpenPanel(null); }}
          onClose={() => setOpenPanel(null)}
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
      </SlidePanel>

      {/* Camera menu */}
      <Modal transparent visible={showCameraMenu} animationType="none" onRequestClose={() => setShowCameraMenu(false)} statusBarTranslucent>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowCameraMenu(false)} />
        <View style={styles.cameraMenu}>
          <Text style={styles.cameraMenuHeader}>Chart Export</Text>
          <Pressable
            style={styles.cameraMenuItem}
            onPress={() => { setShowCameraMenu(false); onScreenshot?.(); }}
          >
            <View style={styles.cameraMenuIconBox}>
              <Camera size={18} color="#B7FF5A" />
            </View>
            <View>
              <Text style={styles.cameraMenuItemTitle}>Snapshot</Text>
              <Text style={styles.cameraMenuItemSub}>Save full chart image</Text>
            </View>
          </Pressable>
          <View style={styles.cameraMenuDivider} />
          <Pressable
            style={styles.cameraMenuItem}
            onPress={() => { setShowCameraMenu(false); onCopyLiveLink?.(); }}
          >
            <View style={[styles.cameraMenuIconBox, styles.cameraMenuIconBoxBlue]}>
              <Link2 size={14} color="#63B3ED" />
            </View>
            <View>
              <Text style={styles.cameraMenuItemTitle}>Copy Live Chart Link</Text>
              <Text style={styles.cameraMenuItemSub}>Share current view</Text>
            </View>
          </Pressable>
        </View>
      </Modal>

      {/* Icon rail */}
      <View style={styles.rail}>
        <ScrollView
          contentContainerStyle={styles.railContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <ToolBtn
            iconName="list-outline"
            label="Watchlist"
            active={openPanel === "watchlist"}
            onClick={() => toggle("watchlist")}
          />
          <ToolBtn
            iconName="notifications-outline"
            label="Alerts"
            onClick={onAlertClick}
          />
          <ToolBtn
            iconName="git-branch-outline"
            label="Object Tree"
            active={openPanel === "objects"}
            badge={drawingCount > 0 ? drawingCount : undefined}
            onClick={() => toggle("objects")}
          />
          <ToolBtn
            iconName="grid-outline"
            label="Layout"
            active={openPanel === "layout"}
            badge={layoutCount > 1 ? layoutCount : undefined}
            onClick={() => toggle("layout")}
          />
          <ToolBtn
            iconName="calculator-outline"
            label="Calculator"
            onClick={() => console.log("[RightToolbar] Calculator panel coming soon")}
          />

          <View style={styles.railDivider} />

          <ToolBtn
            iconName="camera-outline"
            label="Screenshot"
            active={showCameraMenu}
            onClick={() => setShowCameraMenu(v => !v)}
          />
          <ToolBtn
            iconName={isFullscreen ? "contract-outline" : "expand-outline"}
            label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            onClick={onFullscreen}
          />
          <ToolBtn
            iconName="settings-outline"
            label="Settings"
            active={showSettings}
            onClick={onSettings}
          />

          {/* Active layout indicator */}
          {layoutCount > 1 && (
            <View style={styles.layoutIndicator}>
              <View style={styles.layoutIndicatorGrid}>
                {Array.from({ length: layoutCount }).map((_, i) => (
                  <View key={i} style={styles.layoutIndicatorCell} />
                ))}
              </View>
              <Text style={styles.layoutIndicatorLabel}>{layoutCount}×</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </>
  );
});

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Rail
  rail: {
    width: TOOLBAR_W, flexShrink: 0,
    backgroundColor: "#0a0a0a",
    borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.06)",
  },
  railContent: {
    alignItems: "center", gap: 5,
    paddingTop: 8, paddingBottom: 8,
  },
  railDivider: {
    width: 28, height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginVertical: 5,
  },
  // ToolBtn
  toolBtn: {
    borderRadius: 4,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0, backgroundColor: "transparent",
    position: "relative",
  },
  toolBtnActive: { backgroundColor: "rgba(255,255,255,0.14)" },
  toolBtnDisabled: { opacity: 0.5 },
  // Badge
  badge: {
    position: "absolute", top: 6, right: 6,
    minWidth: 15, height: 15, borderRadius: 8, paddingHorizontal: 3,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(7,17,13,0.8)",
  },
  badgeAlert:      { backgroundColor: "#ef4444" },
  badgeGreen:      { backgroundColor: "rgba(183,255,90,0.9)" },
  badgeText:       { fontSize: 8, fontWeight: "900" },
  badgeTextAlert:  { color: "#fff" },
  badgeTextGreen:  { color: "#07110D" },
  // Slide panel
  slidePanel: {
    position: "absolute", right: TOOLBAR_W, top: 0, bottom: 0,
    backgroundColor: "rgba(6,10,8,0.98)",
    borderLeftWidth: 1, borderLeftColor: "rgba(57,91,67,0.28)",
  },
  // Panel header
  panelHeader: {
    flexDirection: "row", alignItems: "center", gap: 9,
    paddingTop: 13, paddingHorizontal: 14, paddingBottom: 11,
    borderBottomWidth: 1, borderBottomColor: "rgba(57,91,67,0.18)", flexShrink: 0,
  },
  panelHeaderIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: "rgba(183,255,90,0.08)",
    borderWidth: 1, borderColor: "rgba(183,255,90,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  panelHeaderTitle: {
    flex: 1, fontSize: 12.5, fontWeight: "800", color: "#F3FFF3", letterSpacing: 0.1,
  },
  panelHeaderClose: {
    width: 26, height: 26, borderRadius: 7,
    alignItems: "center", justifyContent: "center",
  },
  // Camera menu
  cameraMenu: {
    position: "absolute",
    right: TOOLBAR_W + 8,
    top: 140,
    width: 216,
    backgroundColor: "rgba(8,16,12,0.97)",
    borderRadius: 14,
    borderWidth: 1, borderColor: "rgba(183,255,90,0.15)",
    padding: 6,
    shadowColor: "#000", shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.75, shadowRadius: 28, elevation: 24,
  },
  cameraMenuHeader: {
    paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 10, fontWeight: "700",
    letterSpacing: 1.2, textTransform: "uppercase",
    color: "rgba(183,255,90,0.45)",
  },
  cameraMenuItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 9, paddingHorizontal: 12, borderRadius: 10,
  },
  cameraMenuIconBox: {
    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
    backgroundColor: "rgba(183,255,90,0.1)",
    borderWidth: 1, borderColor: "rgba(183,255,90,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  cameraMenuIconBoxBlue: {
    backgroundColor: "rgba(99,179,237,0.1)", borderColor: "rgba(99,179,237,0.2)",
  },
  cameraMenuItemTitle: { fontSize: 13, fontWeight: "700", color: "#F3FFF3" },
  cameraMenuItemSub:   { fontSize: 10, color: "rgba(167,184,169,0.5)", marginTop: 1 },
  cameraMenuDivider:   { height: 1, backgroundColor: "rgba(255,255,255,0.05)", marginVertical: 4, marginHorizontal: 8 },
  // Layout indicator
  layoutIndicator: { marginTop: "auto", paddingVertical: 4, alignItems: "center" },
  layoutIndicatorGrid: {
    width: 20, height: 20,
    flexDirection: "row", flexWrap: "wrap", gap: 2,
  },
  layoutIndicatorCell: {
    width: 8, height: 8,
    backgroundColor: "rgba(183,255,90,0.35)", borderRadius: 2,
  },
  layoutIndicatorLabel: { fontSize: 8, fontWeight: "700", color: "rgba(183,255,90,0.5)", marginTop: 3 },
  // ObjectsSlide
  objectsBadgeRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)", flexShrink: 0,
  },
  symbolBadge: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", borderRadius: 5,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  symbolBadgeText: { fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.55)" },
  tfBadge: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.07)", borderRadius: 5,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  tfBadgeText: { fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.35)" },
  objectCount: { fontSize: 9.5, fontWeight: "600", color: "rgba(255,255,255,0.28)" },
  emptyState: { alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  emptyTitle: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.3)" },
  emptySubtitle: { fontSize: 10.5, color: "rgba(255,255,255,0.18)", lineHeight: 16, textAlign: "center" },
  objectGroup: { marginBottom: 2 },
  objectGroupHeader: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingLeft: 12, paddingRight: 10, height: 34,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.05)",
  },
  objectGroupIcon: {
    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  objectGroupLabel: {
    flex: 1, fontSize: 11.5, fontWeight: "600", color: "rgba(255,255,255,0.72)",
  },
  objectGroupCount: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.09)", borderRadius: 20,
    paddingHorizontal: 7, paddingVertical: 1,
  },
  objectGroupCountText: { fontSize: 9.5, fontWeight: "700", color: "rgba(255,255,255,0.38)" },
  iconBtn26: { width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: 6 },
  drawingRowsContainer: {
    borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)",
  },
  drawingRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingLeft: 34, paddingRight: 8, height: 34,
  },
  drawingRowBorder: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.04)" },
  drawingRowHidden: { opacity: 0.4 },
  colorSwatch: { width: 8, height: 8, borderRadius: 2, flexShrink: 0 },
  drawingRowLabel: {
    flex: 1, fontSize: 11, fontWeight: "500", color: "rgba(255,255,255,0.55)",
  },
  objectsFooter: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 8, paddingHorizontal: 12,
    borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)", flexShrink: 0,
  },
  objectsFooterBtn: {
    flex: 1, height: 28, borderRadius: 7,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.04)",
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
  },
  objectsFooterText: { fontSize: 10, fontWeight: "600", color: "rgba(255,255,255,0.4)" },
  // LayoutSlide
  sectionLabel: {
    fontSize: 9, fontWeight: "700", color: "rgba(167,184,169,0.32)",
    textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12,
  },
  layoutGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  layoutPreviewBtn: {
    width: "47%",
    paddingVertical: 10, paddingHorizontal: 10, borderRadius: 11,
    backgroundColor: "rgba(57,91,67,0.07)",
    borderWidth: 1, borderColor: "rgba(57,91,67,0.2)",
    alignItems: "center", gap: 8,
  },
  layoutPreviewBtnActive: {
    backgroundColor: "rgba(183,255,90,0.09)",
    borderWidth: 1.5, borderColor: "rgba(183,255,90,0.4)",
    shadowColor: "#B7FF5A", shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.1, shadowRadius: 10,
  },
  layoutPreviewBox: { width: "100%", height: 52 },
  layoutPreviewLabel: { fontSize: 10, fontWeight: "600", color: "rgba(167,184,169,0.6)" },
  layoutPreviewLabelActive: { color: "#B7FF5A", fontWeight: "800" },
  // Sync toggle
  syncToggleBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 10, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: "rgba(57,91,67,0.07)",
    borderWidth: 1, borderColor: "rgba(57,91,67,0.2)",
  },
  syncToggleBtnActive: {
    backgroundColor: "rgba(183,255,90,0.08)",
    borderWidth: 1.5, borderColor: "rgba(183,255,90,0.35)",
  },
  syncIconBox: {
    width: 32, height: 32, borderRadius: 9, flexShrink: 0,
    backgroundColor: "rgba(57,91,67,0.12)",
    borderWidth: 1, borderColor: "rgba(57,91,67,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  syncIconBoxActive: {
    backgroundColor: "rgba(183,255,90,0.12)", borderColor: "rgba(183,255,90,0.3)",
  },
  syncTitle: { fontSize: 11.5, fontWeight: "700", color: "#F3FFF3" },
  syncTitleActive: { color: "#B7FF5A" },
  syncSubtitle: { fontSize: 9.5, color: "rgba(167,184,169,0.4)", marginTop: 1, lineHeight: 14 },
  togglePill: {
    width: 36, height: 20, borderRadius: 10, flexShrink: 0,
    backgroundColor: "rgba(57,91,67,0.3)", position: "relative",
  },
  togglePillOn:   { backgroundColor: "#B7FF5A" },
  toggleThumb:    { position: "absolute", top: 3, left: 3, width: 14, height: 14, borderRadius: 7, backgroundColor: "rgba(167,184,169,0.6)" },
  toggleThumbOn:  { left: 19, backgroundColor: "#07110D" },
  // Saved layouts
  savedLayoutsSection: { marginTop: 16, borderTopWidth: 1, borderTopColor: "rgba(57,91,67,0.18)", paddingTop: 14 },
  savedLayoutsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  saveCurrentBtn: {
    backgroundColor: "rgba(183,255,90,0.08)",
    borderWidth: 1, borderColor: "rgba(183,255,90,0.22)", borderRadius: 7,
    paddingHorizontal: 9, paddingVertical: 3,
  },
  saveCurrentBtnText: { fontSize: 10, fontWeight: "700", color: "#B7FF5A" },
  saveInputRow: { flexDirection: "row", gap: 5, marginBottom: 10 },
  saveInput: {
    flex: 1, height: 28, borderRadius: 7,
    borderWidth: 1, borderColor: "rgba(57,91,67,0.35)",
    backgroundColor: "rgba(57,91,67,0.14)", color: "#F3FFF3",
    fontSize: 11, paddingHorizontal: 8,
  },
  saveBtn: {
    height: 28, paddingHorizontal: 10, borderRadius: 7,
    backgroundColor: "rgba(183,255,90,0.12)",
    borderWidth: 1, borderColor: "rgba(183,255,90,0.32)",
    justifyContent: "center",
  },
  saveBtnText: { fontSize: 11, fontWeight: "700", color: "#B7FF5A" },
  saveCancelBtn: {
    height: 28, paddingHorizontal: 8, borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
  },
  saveCancelBtnText: { fontSize: 11, color: "rgba(167,184,169,0.5)" },
  noLayoutsText: {
    fontSize: 11, color: "rgba(167,184,169,0.28)",
    textAlign: "center", marginVertical: 14, lineHeight: 18,
  },
  namedLayoutCard: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 7, paddingHorizontal: 8, borderRadius: 9,
    backgroundColor: "rgba(57,91,67,0.07)",
    borderWidth: 1, borderColor: "rgba(57,91,67,0.18)",
    marginBottom: 4,
  },
  namedLayoutCardActive: {
    backgroundColor: "rgba(59,130,246,0.12)",
    borderWidth: 2, borderColor: "#3b82f6",
  },
  namedLayoutName: { fontSize: 11, fontWeight: "600", color: "#F3FFF3" },
  namedLayoutNameActive: { color: "#93c5fd", fontWeight: "700" },
  namedLayoutMeta: { fontSize: 9, color: "rgba(167,184,169,0.38)", marginTop: 1 },
  namedLayoutMetaActive: { color: "rgba(147,197,253,0.55)" },
  activeLayoutBadge: {
    backgroundColor: "rgba(59,130,246,0.15)",
    borderWidth: 1, borderColor: "rgba(59,130,246,0.35)", borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  activeLayoutBadgeText: { fontSize: 8.5, fontWeight: "800", color: "#3b82f6", letterSpacing: 0.5 },
  namedLayoutLoadBtn: {
    height: 22, paddingHorizontal: 8, borderRadius: 6,
    backgroundColor: "rgba(183,255,90,0.1)",
    borderWidth: 1, borderColor: "rgba(183,255,90,0.28)",
    justifyContent: "center", flexShrink: 0,
  },
  namedLayoutLoadBtnActive: {
    backgroundColor: "rgba(59,130,246,0.15)", borderColor: "rgba(59,130,246,0.4)",
  },
  namedLayoutLoadText: { fontSize: 10, fontWeight: "700", color: "#B7FF5A" },
  namedLayoutLoadTextActive: { color: "#93c5fd" },
  namedLayoutIconBtn: {
    width: 22, height: 22, borderRadius: 5, flexShrink: 0,
    alignItems: "center", justifyContent: "center",
  },
  renameInput: {
    flex: 1, height: 22, borderRadius: 5,
    borderWidth: 1, borderColor: "rgba(183,255,90,0.35)",
    backgroundColor: "rgba(57,91,67,0.2)", color: "#F3FFF3",
    fontSize: 11, paddingHorizontal: 6,
  },
});

export default RightToolbar;
