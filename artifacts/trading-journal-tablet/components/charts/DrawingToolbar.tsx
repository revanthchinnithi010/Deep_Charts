/**
 * DrawingToolbar.tsx — React Native port (Phase 9.21 Pass A)
 *
 * Migrated from src/components/charts/DrawingToolbar.tsx
 *
 * Web → RN changes (Pass A):
 *   <img src={svgUrl}>           → inline react-native-svg components
 *   createPortal                 → Modal (ToolPopup) / absolute View (FavoritesBar)
 *   localStorage                 → AsyncStorage (async hydration, same keys)
 *   window.innerHeight/Width     → Dimensions.get("screen")
 *   document.addEventListener    → removed (Modal backdrop handles outside-tap)
 *   motion / AnimatePresence     → removed (plain View; animation deferred)
 *   onMouseEnter/Leave hover     → removed (no hover on touch)
 *   keyboard shortcuts (Esc/…)   → removed; TODO(Pass-B)
 *   usePopup hook                → removed (Modal handles dismissal)
 *   StyleFlyout (drawing style)  → TODO(Pass-B): Settings panels out of Pass A scope
 *   FavoritesBar drag-to-move    → TODO(Pass-B): Drag-and-drop customization out of Pass A scope
 *   Tip tooltip                  → removed (no hover; TODO(Pass-B) long-press)
 *   AnimatedList/AnimatedListItem → plain View wrapper
 *   binTrashUrl <img>            → inline react-native-svg IcoTrash
 *   lucide-react Star/Undo2/etc  → Ionicons equivalents
 *
 * Exports (unchanged):
 *   default DrawingToolbar
 */

import { memo, useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, Pressable, ScrollView, Modal, Dimensions,
  StyleSheet, Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import Svg, {
  Line, Circle, Path, Rect, Polyline, Text as SvgText,
} from "react-native-svg";
import { useDrawingStore } from "@/store/drawingStore";
import type { ToolType } from "@/types/drawing";

// ── Color presets ─────────────────────────────────────────────────────────────
const PRESET_COLORS = [
  "#B7FF5A", "#34d399", "#38bdf8", "#818cf8", "#f472b6",
  "#f59e0b", "#fb923c", "#f87171", "#e2e8f0", "#ffffff",
];

// ── Icon system ───────────────────────────────────────────────────────────────
// All icons accept { c: string } (stroke/fill color) matching the web IcoComp type.
// Asset-based icons (makeIcon) are replaced with inline react-native-svg equivalents
// that visually match the original SVG assets.
const S = 22; // standard icon size
const SL = 30; // large icon size (padded assets)

type IcoComp = React.ComponentType<{ c: string }>;

function IcoTrendline({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Line x1="3" y1="16" x2="17" y2="4" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <Circle cx="3" cy="16" r="1.5" fill={c}/>
      <Circle cx="17" cy="4" r="1.5" fill={c}/>
    </Svg>
  );
}
function IcoRayLine({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Line x1="3" y1="15" x2="17" y2="5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <Circle cx="3" cy="15" r="1.5" fill={c}/>
      <Polyline points="13,5 17,5 17,9" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </Svg>
  );
}
function IcoExtendedLine({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Line x1="2" y1="15" x2="18" y2="5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <Polyline points="4,7 2,8 3,10" stroke={c} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <Polyline points="16,13 18,12 17,10" stroke={c} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </Svg>
  );
}
function IcoHLine({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Line x1="2" y1="10" x2="18" y2="10" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <Circle cx="2" cy="10" r="1.5" fill={c}/>
    </Svg>
  );
}
function IcoHRay({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Line x1="2" y1="10" x2="18" y2="10" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <Circle cx="2" cy="10" r="1.5" fill={c}/>
      <Polyline points="15,7 18,10 15,13" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </Svg>
  );
}
function IcoVLine({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Line x1="10" y1="2" x2="10" y2="18" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <Circle cx="10" cy="2" r="1.5" fill={c}/>
    </Svg>
  );
}
function IcoChannel({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Line x1="2" y1="6" x2="18" y2="6" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <Line x1="2" y1="14" x2="18" y2="14" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <Circle cx="2" cy="6" r="1.3" fill={c}/>
      <Circle cx="2" cy="14" r="1.3" fill={c}/>
    </Svg>
  );
}
function IcoFibSvg({ c }: { c: string }) {
  return (
    <Svg width={SL} height={SL} viewBox="0 0 20 20">
      <Line x1="3" y1="5" x2="17" y2="5" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <Line x1="3" y1="10" x2="17" y2="10" stroke={c} strokeWidth="1.1" strokeLinecap="round" strokeDasharray="4 2" strokeOpacity="0.85"/>
      <Line x1="3" y1="15" x2="17" y2="15" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <Circle cx="3" cy="5" r="1.3" fill={c}/>
      <Circle cx="3" cy="15" r="1.3" fill={c}/>
      <Line x1="3" y1="5" x2="3" y2="15" stroke={c} strokeWidth="1.2" strokeOpacity="0.5"/>
    </Svg>
  );
}
function IcoFibChannelSvg({ c }: { c: string }) {
  return (
    <Svg width={SL} height={SL} viewBox="0 0 20 20">
      <Line x1="2" y1="4" x2="18" y2="4" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <Line x1="2" y1="8" x2="18" y2="8" stroke={c} strokeWidth="1.1" strokeLinecap="round" strokeDasharray="3 2" strokeOpacity="0.85"/>
      <Line x1="2" y1="12" x2="18" y2="12" stroke={c} strokeWidth="1.1" strokeLinecap="round" strokeDasharray="3 2" strokeOpacity="0.7"/>
      <Line x1="2" y1="16" x2="18" y2="16" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <Circle cx="2" cy="4" r="1.3" fill={c}/>
      <Circle cx="2" cy="16" r="1.3" fill={c}/>
    </Svg>
  );
}
function IcoZoomSvg({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Circle cx="9" cy="9" r="5.5" stroke={c} strokeWidth="1.4" fill="none"/>
      <Line x1="13.5" y1="13.5" x2="17.5" y2="17.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <Line x1="7" y1="9" x2="11" y2="9" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
      <Line x1="9" y1="7" x2="9" y2="11" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
    </Svg>
  );
}
function IcoScaleSvg({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Line x1="3" y1="17" x2="17" y2="3" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <Polyline points="3,17 3,13 7,17" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <Polyline points="17,3 17,7 13,3" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </Svg>
  );
}
function IcoLongPosSvg(_: { c: string }) {
  return (
    <Svg width={SL} height={SL} viewBox="0 0 30 30">
      <Rect x="3" y="9" width="24" height="12" fill="rgba(8,153,129,0.15)"/>
      <Line x1="3" y1="9" x2="27" y2="9" stroke="#089981" strokeWidth="1.5" strokeLinecap="round"/>
      <Line x1="3" y1="21" x2="27" y2="21" stroke="#f23645" strokeWidth="1.5" strokeLinecap="round"/>
      <SvgText x="15" y="17" textAnchor="middle" fontSize="7" fontWeight="800" fill="#089981" fontFamily="monospace">L</SvgText>
    </Svg>
  );
}
function IcoShortPosSvg(_: { c: string }) {
  return (
    <Svg width={SL} height={SL} viewBox="0 0 30 30">
      <Rect x="3" y="9" width="24" height="12" fill="rgba(242,54,69,0.15)"/>
      <Line x1="3" y1="9" x2="27" y2="9" stroke="#f23645" strokeWidth="1.5" strokeLinecap="round"/>
      <Line x1="3" y1="21" x2="27" y2="21" stroke="#089981" strokeWidth="1.5" strokeLinecap="round"/>
      <SvgText x="15" y="17" textAnchor="middle" fontSize="7" fontWeight="800" fill="#f23645" fontFamily="monospace">S</SvgText>
    </Svg>
  );
}
function IcoDateRangeSvg({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Line x1="4" y1="10" x2="16" y2="10" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <Line x1="4" y1="7" x2="4" y2="13" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <Line x1="16" y1="7" x2="16" y2="13" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
    </Svg>
  );
}
function IcoPriceRangeSvg({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Line x1="10" y1="4" x2="10" y2="16" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <Line x1="7" y1="4" x2="13" y2="4" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <Line x1="7" y1="16" x2="13" y2="16" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
    </Svg>
  );
}
function IcoTextNewSvg({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Line x1="4" y1="5" x2="16" y2="5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <Line x1="10" y1="5" x2="10" y2="16" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <Line x1="7" y1="16" x2="13" y2="16" stroke={c} strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.6"/>
    </Svg>
  );
}
function IcoNoteSvg({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Rect x="3" y="3" width="14" height="14" rx="2" stroke={c} strokeWidth="1.4" fill="none"/>
      <Line x1="6" y1="7" x2="14" y2="7" stroke={c} strokeWidth="1.1" strokeLinecap="round"/>
      <Line x1="6" y1="10" x2="14" y2="10" stroke={c} strokeWidth="1.1" strokeLinecap="round"/>
      <Line x1="6" y1="13" x2="11" y2="13" stroke={c} strokeWidth="1.1" strokeLinecap="round"/>
    </Svg>
  );
}
function IcoLockSvg({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Rect x="4" y="9" width="12" height="9" rx="2" stroke={c} strokeWidth="1.4" fill="none"/>
      <Path d="M7 9 L7 6 A3 3 0 0 1 13 6 L13 9" stroke={c} strokeWidth="1.4" strokeLinecap="round" fill="none"/>
      <Circle cx="10" cy="14" r="1.2" fill={c}/>
    </Svg>
  );
}
function IcoMagnetSvg({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Path d="M5 4 L5 11 A5 5 0 0 0 15 11 L15 4" stroke={c} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <Line x1="3" y1="4" x2="7" y2="4" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
      <Line x1="13" y1="4" x2="17" y2="4" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    </Svg>
  );
}
function IcoPencilLockSvg({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Path d="M3 15 L4 12 L12 4 L16 8 L8 16 Z" stroke={c} strokeWidth="1.3" strokeLinejoin="round" fill="none"/>
      <Line x1="10" y1="6" x2="14" y2="10" stroke={c} strokeWidth="1.1" strokeOpacity="0.5"/>
      <Rect x="12.5" y="14" width="5" height="4" rx="1" stroke={c} strokeWidth="1.1" fill="none"/>
      <Path d="M13.5 14 L13.5 13 A1.5 1.5 0 0 1 16.5 13 L16.5 14" stroke={c} strokeWidth="1.1" fill="none"/>
    </Svg>
  );
}
function IcoEyeBrushSvg({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Path d="M2 8 C5 4 15 4 18 8 C15 12 5 12 2 8Z" stroke={c} strokeWidth="1.3" strokeLinecap="round" fill="none"/>
      <Circle cx="10" cy="8" r="2" stroke={c} strokeWidth="1.2" fill="none"/>
      <Line x1="14" y1="12" x2="18" y2="16" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </Svg>
  );
}
function IcoHighlighterSvg({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Path d="M4 16 L8 12 L14 6 L16 8 L10 14 Z" stroke={c} strokeWidth="1.3" fill="none" strokeLinejoin="round"/>
      <Line x1="4" y1="16" x2="7" y2="16" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <Line x1="14" y1="6" x2="16" y2="4" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
    </Svg>
  );
}
function IcoRectangleSvg({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Rect x="3" y="5" width="14" height="10" rx="1" stroke={c} strokeWidth="1.4" fill="none"/>
      <Circle cx="3" cy="5" r="1.4" fill={c}/>
      <Circle cx="17" cy="5" r="1.4" fill={c}/>
      <Circle cx="3" cy="15" r="1.4" fill={c}/>
      <Circle cx="17" cy="15" r="1.4" fill={c}/>
    </Svg>
  );
}
function IcoPathSvg({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Path d="M3 15 C5 8 8 5 10 10 C12 15 15 12 17 5" stroke={c} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <Circle cx="3" cy="15" r="1.3" fill={c}/>
    </Svg>
  );
}
function IcoCircleBrushSvg({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Circle cx="10" cy="10" r="7.5" stroke={c} strokeWidth="1.4" fill="none"/>
      <Circle cx="10" cy="2.5" r="1.4" fill={c}/>
      <Circle cx="17.5" cy="10" r="1.4" fill={c}/>
      <Circle cx="10" cy="17.5" r="1.4" fill={c}/>
      <Circle cx="2.5" cy="10" r="1.4" fill={c}/>
    </Svg>
  );
}
function IcoCurveSvg({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Path d="M3 16 C3 6 17 6 17 16" stroke={c} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <Circle cx="3" cy="16" r="1.3" fill={c}/>
      <Circle cx="17" cy="16" r="1.3" fill={c}/>
    </Svg>
  );
}
function IcoBrushSvg({ c }: { c: string }) {
  return (
    <Svg width={SL} height={SL} viewBox="0 0 20 20">
      <Line x1="5" y1="15" x2="15" y2="5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <Path d="M3.5 16.5 C4 15 5 14.5 6.5 15.5 C5.5 17 4 17.5 3.5 16.5Z" stroke={c} strokeWidth="1.1" fill="none"/>
      <Line x1="9" y1="11" x2="12" y2="8" stroke={c} strokeWidth="1.1" strokeOpacity="0.5" strokeLinecap="round"/>
    </Svg>
  );
}

/** Cursor: crosshair with arrows */
function IcoCursor({ c }: { c: string }) {
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Line x1="10" y1="2" x2="10" y2="8" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <Line x1="10" y1="12" x2="10" y2="18" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <Line x1="2" y1="10" x2="8" y2="10" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <Line x1="12" y1="10" x2="18" y2="10" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <Rect x="7.5" y="7.5" width="5" height="5" rx="1" stroke={c} strokeWidth="1.2" fill="none"/>
    </Svg>
  );
}

/** Trash icon — replaces binTrashUrl <img> */
function IcoTrash(_: { c: string }) {
  const c = "rgba(220,80,80,0.82)";
  return (
    <Svg width={S} height={S} viewBox="0 0 20 20">
      <Path d="M5 7 L15 7 L14 17 L6 17 Z" stroke={c} strokeWidth="1.4" strokeLinejoin="round" fill="none"/>
      <Line x1="3" y1="7" x2="17" y2="7" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>
      <Line x1="8" y1="7" x2="8" y2="5" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
      <Line x1="12" y1="7" x2="12" y2="5" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
      <Line x1="10" y1="7" x2="10" y2="5" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeOpacity="0"/>
      <Line x1="8" y1="4" x2="12" y2="4" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
    </Svg>
  );
}

/** Color dot for style button */
function IcoDot({ color }: { color: string }) {
  return (
    <View style={{
      width: 20, height: 20, borderRadius: 10,
      backgroundColor: color, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.18)",
    }} />
  );
}

// ── Tool system ───────────────────────────────────────────────────────────────

interface ToolDef {
  key:       string;
  realType:  ToolType;
  Icon:      IcoComp;
  label:     string;
  shortcut?: string;
}
interface ToolSection { title: string; tools: ToolDef[]; }
interface GroupDef {
  id:          string;
  Icon:        IcoComp;
  label:       string;
  defaultType: ToolType;
  defaultKey:  string;
  sections:    ToolSection[];
}

const GROUPS: GroupDef[] = [
  {
    id: "lines", Icon: IcoTrendline, label: "Lines", defaultType: "trendline", defaultKey: "trendline",
    sections: [
      { title: "LINES", tools: [
        { key: "trendline", realType: "trendline", Icon: IcoTrendline,    label: "Trendline",        shortcut: "Alt+T" },
        { key: "ray",       realType: "ray",        Icon: IcoRayLine,      label: "Ray" },
        { key: "extended",  realType: "extended",   Icon: IcoExtendedLine, label: "Extended line" },
        { key: "hline",     realType: "hline",      Icon: IcoHLine,        label: "Horizontal line",  shortcut: "Alt+H" },
        { key: "hray",      realType: "hray",       Icon: IcoHRay,         label: "Horizontal ray" },
        { key: "vline",     realType: "vline",      Icon: IcoVLine,        label: "Vertical line",    shortcut: "Alt+V" },
      ]},
      { title: "CHANNELS", tools: [
        { key: "channel", realType: "channel", Icon: IcoChannel, label: "Parallel channel" },
      ]},
    ],
  },
  {
    id: "fib", Icon: IcoFibSvg, label: "Fibonacci", defaultType: "fib", defaultKey: "fib",
    sections: [
      { title: "FIBONACCI", tools: [
        { key: "fib",         realType: "fib",         Icon: IcoFibSvg,        label: "Fib retracement", shortcut: "Alt+F" },
        { key: "fib_channel", realType: "fib_channel", Icon: IcoFibChannelSvg, label: "Fib channel" },
      ]},
    ],
  },
  {
    id: "forecast", Icon: IcoLongPosSvg, label: "Forecast & Measure", defaultType: "position_long", defaultKey: "position_long",
    sections: [
      { title: "FORECASTING", tools: [
        { key: "position_long",  realType: "position_long",  Icon: IcoLongPosSvg,   label: "Long position" },
        { key: "position_short", realType: "position_short", Icon: IcoShortPosSvg,  label: "Short position" },
      ]},
      { title: "MEASURERS", tools: [
        { key: "date_range",  realType: "date_range",  Icon: IcoDateRangeSvg,  label: "Date Range" },
        { key: "price_range", realType: "price_range", Icon: IcoPriceRangeSvg, label: "Price Range" },
      ]},
    ],
  },
  {
    id: "text", Icon: IcoTextNewSvg, label: "Text", defaultType: "text", defaultKey: "text",
    sections: [
      { title: "TEXT AND NOTES", tools: [
        { key: "text", realType: "text", Icon: IcoTextNewSvg, label: "Text", shortcut: "Alt+X" },
        { key: "note", realType: "note", Icon: IcoNoteSvg,    label: "Note" },
      ]},
    ],
  },
  {
    id: "brushes_shapes", Icon: IcoBrushSvg, label: "Brushes & Shapes", defaultType: "brush", defaultKey: "brush_brush",
    sections: [
      { title: "BRUSHES", tools: [
        { key: "brush_brush",       realType: "brush",       Icon: IcoBrushSvg,       label: "Brush" },
        { key: "brush_highlighter", realType: "highlighter", Icon: IcoHighlighterSvg, label: "Highlighter" },
        { key: "brush_arrow",       realType: "arrow",       Icon: IcoRayLine,        label: "Arrow" },
      ]},
      { title: "SHAPES", tools: [
        { key: "shape_rect",   realType: "rect",    Icon: IcoRectangleSvg,  label: "Rectangle" },
        { key: "shape_path",   realType: "path",    Icon: IcoPathSvg,       label: "Path" },
        { key: "shape_circle", realType: "ellipse", Icon: IcoCircleBrushSvg, label: "Circle" },
        { key: "shape_curve",  realType: "curve",   Icon: IcoCurveSvg,      label: "Curve" },
      ]},
    ],
  },
];

const ALL_TOOLS: ToolDef[] = GROUPS.flatMap(g => g.sections.flatMap(s => s.tools));

const FAVS_KEY = "tv_toolbar_favorites_v3";
const LAST_KEY = "tv_toolbar_last_v3";
const AKEY_KEY = "tv_toolbar_activekey_v3";

async function saveFavs(s: Set<string>) {
  try { await AsyncStorage.setItem(FAVS_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}
async function saveLast(r: Record<string, string>) {
  try { await AsyncStorage.setItem(LAST_KEY, JSON.stringify(r)); } catch { /* ignore */ }
}

// ── ToolRow (inside ToolPopup) ────────────────────────────────────────────────
function ToolRow({ tool, activeToolKey, favorites, onSelect, onToggleFav }: {
  tool: ToolDef; activeToolKey: string; favorites: Set<string>;
  onSelect: (t: ToolDef) => void; onToggleFav: (key: string) => void;
}) {
  const act = activeToolKey === tool.key;
  const fav = favorites.has(tool.key);
  const ic  = act ? "#B7FF5A" : "rgba(255,255,255,0.72)";

  return (
    <View style={[styles.toolRow, act && styles.toolRowActive]}>
      <Pressable
        style={styles.toolRowMain}
        onPress={() => onSelect(tool)}
        android_ripple={{ color: "rgba(183,255,90,0.1)" }}
      >
        <View style={styles.toolIconBox}>
          <tool.Icon c={ic} />
        </View>
        <Text style={[styles.toolLabel, act && styles.toolLabelActive]} numberOfLines={1}>
          {tool.label}
        </Text>
        {tool.shortcut && (
          <Text style={styles.toolShortcut}>{tool.shortcut}</Text>
        )}
      </Pressable>
      <Pressable
        style={styles.toolStarBtn}
        onPress={() => onToggleFav(tool.key)}
        hitSlop={8}
      >
        <Ionicons
          name={fav ? "star" : "star-outline"}
          size={13}
          color={fav ? "#f59e0b" : "rgba(255,255,255,0.3)"}
        />
      </Pressable>
    </View>
  );
}

// ── ToolPopup (Modal) ─────────────────────────────────────────────────────────
function ToolPopup({ group, activeToolKey, favorites, anchorPos, onSelect, onToggleFav, onClose }: {
  group: GroupDef; activeToolKey: string; favorites: Set<string>;
  anchorPos: { left: number; top: number };
  onSelect: (t: ToolDef) => void; onToggleFav: (key: string) => void;
  onClose: () => void;
}) {
  const { height } = Dimensions.get("screen");
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <View style={[styles.toolPopup, { left: anchorPos.left, top: anchorPos.top }]}>
        <ScrollView
          style={{ maxHeight: height * 0.65 }}
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ paddingVertical: 4 }}>
            {group.sections.map((sec, si) => (
              <View key={sec.title}>
                {si > 0 && <View style={styles.popupDivider} />}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{sec.title}</Text>
                </View>
                {sec.tools.map(tool => (
                  <ToolRow
                    key={tool.key}
                    tool={tool}
                    activeToolKey={activeToolKey}
                    favorites={favorites}
                    onSelect={t => { onSelect(t); }}
                    onToggleFav={onToggleFav}
                  />
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── FavoritesBar (fixed, no drag in Pass A) ────────────────────────────────────
// TODO(Pass-B): Add PanResponder/Reanimated drag-to-reposition.
// Drag-and-drop customization is out of scope for Pass A.
function FavoritesBar({ tools, activeToolKey, onSelect, onToggleFav }: {
  tools: ToolDef[]; activeToolKey: string;
  onSelect: (t: ToolDef) => void; onToggleFav: (key: string) => void;
}) {
  if (tools.length === 0) return null;
  const { width, height } = Dimensions.get("screen");
  const barWidth = 56 + tools.length * 44 + 24;
  const left = Math.max(8, (width - barWidth) / 2);
  const top  = height - 90;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
      <View style={[styles.favBar, { left, top }]}>
        {/* Grip indicator */}
        <View style={styles.favGrip}>
          {[0,1,2,3,4,5].map(i => (
            <View key={i} style={styles.favGripDot} />
          ))}
        </View>
        {tools.map(tool => {
          const active = activeToolKey === tool.key;
          const ic = active ? "#B7FF5A" : "rgba(183,220,190,0.85)";
          return (
            <Pressable
              key={tool.key}
              style={[styles.favBtn, active && styles.favBtnActive]}
              onPress={() => onSelect(tool)}
            >
              <tool.Icon c={ic} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── Main DrawingToolbar ───────────────────────────────────────────────────────
const DrawingToolbar = memo(function DrawingToolbar() {
  const {
    activeTool, setActiveTool,
    stayInDraw, setStayInDraw,
    activeStyle, drawings, setDrawings,
    undo, redo, canUndo, canRedo,
  } = useDrawingStore();

  const [activeToolKey, setActiveToolKey]   = useState<string>("cursor");
  const [openGroup,     setOpenGroup]       = useState<string | null>(null);
  const [popupPos,      setPopupPos]        = useState<{ left: number; top: number } | null>(null);
  const [showStyle,     setShowStyle]       = useState(false); // TODO(Pass-B): StyleFlyout
  const [favs,          setFavs]           = useState<Set<string>>(new Set());
  const [lastInGroup,   setLastInGroup]    = useState<Record<string, string>>({});
  const [hideAll,       setHideAll]        = useState(false);

  // RN View refs for measuring group button positions
  const groupBtnRefs = useRef<Record<string, View | null>>({});

  // ── Hydrate from AsyncStorage ─────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(AKEY_KEY).then(v => { if (v) setActiveToolKey(v); }).catch(() => {});
    AsyncStorage.getItem(FAVS_KEY).then(v => {
      if (v) { try { setFavs(new Set(JSON.parse(v))); } catch { /* ignore */ } }
    }).catch(() => {});
    AsyncStorage.getItem(LAST_KEY).then(v => {
      if (v) { try { setLastInGroup(JSON.parse(v)); } catch { /* ignore */ } }
    }).catch(() => {});
  }, []);

  // ── Sync activeTool from store ─────────────────────────────────────────────
  useEffect(() => {
    if (activeTool === "cursor") {
      setActiveToolKey("cursor");
      AsyncStorage.setItem(AKEY_KEY, "cursor").catch(() => {});
    }
  }, [activeTool]);

  const selectTool = useCallback((key: string, realType: ToolType) => {
    setActiveTool(realType);
    setActiveToolKey(key);
    AsyncStorage.setItem(AKEY_KEY, key).catch(() => {});
    setOpenGroup(null);
    setShowStyle(false);
  }, [setActiveTool]);

  const toggleFav = useCallback((key: string) => {
    setFavs(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveFavs(next);
      return next;
    });
  }, []);

  const activateGroupTool = useCallback((tool: ToolDef, gid: string) => {
    selectTool(tool.key, tool.realType);
    setLastInGroup(prev => {
      const next = { ...prev, [gid]: tool.key };
      saveLast(next);
      return next;
    });
  }, [selectTool]);

  const openGroupPopup = useCallback((gid: string) => {
    const ref = groupBtnRefs.current[gid];
    if (!ref) return;
    ref.measure((_x, _y, w, _h, pageX, pageY) => {
      setPopupPos({ left: pageX + w + 8, top: pageY });
      setOpenGroup(gid);
      setShowStyle(false);
    });
  }, []);

  const resolveGroup = (g: GroupDef) => {
    const lastKey = lastInGroup[g.id];
    const lastTool = lastKey ? ALL_TOOLS.find(t => t.key === lastKey) : null;
    const tool = lastTool ?? g.sections[0].tools[0];
    const groupKeys = new Set(g.sections.flatMap(s => s.tools.map(t => t.key)));
    const isActive = groupKeys.has(activeToolKey);
    return { tool, isActive };
  };

  const favTools = ALL_TOOLS.filter(t => favs.has(t.key));
  const BTN = 44;

  return (
    <>
      {/* Left toolbar rail */}
      <View style={styles.rail}>
        <ScrollView
          contentContainerStyle={styles.railContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* ① Cursor */}
          <Pressable
            style={[styles.btn, activeToolKey === "cursor" && styles.btnActive]}
            onPress={() => selectTool("cursor", "cursor")}
          >
            <IcoCursor c="#ffffff" />
          </Pressable>

          {/* ②–⑥ Tool groups */}
          {GROUPS.map(g => {
            const { tool, isActive } = resolveGroup(g);
            const isOpen = openGroup === g.id;
            return (
              <View
                key={g.id}
                ref={el => { groupBtnRefs.current[g.id] = el; }}
              >
                <Pressable
                  style={[styles.btn, isActive && styles.btnActive]}
                  onPress={() => {
                    if (isOpen) { setOpenGroup(null); }
                    else { openGroupPopup(g.id); }
                  }}
                >
                  <tool.Icon c="#ffffff" />
                </Pressable>
                {isOpen && popupPos && (
                  <ToolPopup
                    group={g}
                    activeToolKey={activeToolKey}
                    favorites={favs}
                    anchorPos={popupPos}
                    onSelect={td => activateGroupTool(td, g.id)}
                    onToggleFav={toggleFav}
                    onClose={() => setOpenGroup(null)}
                  />
                )}
              </View>
            );
          })}

          {/* Separator */}
          <View style={styles.sep} />

          {/* ⑪ Magnet */}
          <Pressable style={styles.btn} onPress={() => { /* TODO(Pass-B): magnet snap */ }}>
            <IcoMagnetSvg c="rgba(232,240,237,0.85)" />
          </Pressable>

          {/* ⑫ Stay in draw mode */}
          <Pressable
            style={[styles.btn, stayInDraw && styles.btnActive]}
            onPress={() => setStayInDraw(!stayInDraw)}
          >
            <IcoPencilLockSvg c="#ffffff" />
          </Pressable>

          {/* ⑬ Lock all */}
          <Pressable
            style={styles.btn}
            onPress={() => setDrawings(drawings.map(d => ({ ...d, isLocked: !d.isLocked })))}
          >
            <IcoLockSvg c="rgba(232,240,237,0.85)" />
          </Pressable>

          {/* ⑭ Hide/Show */}
          <Pressable
            style={[styles.btn, hideAll && styles.btnActive]}
            onPress={() => {
              const n = !hideAll;
              setHideAll(n);
              setDrawings(drawings.map(d => ({ ...d, isVisible: !n })));
            }}
          >
            <IcoEyeBrushSvg c="rgba(232,240,237,0.85)" />
          </Pressable>

          {/* Separator */}
          <View style={styles.sep} />

          {/* ⑮ Trash */}
          <Pressable style={styles.btn} onPress={() => setDrawings([])}>
            <IcoTrash c="rgba(220,80,80,0.82)" />
          </Pressable>

          {/* Separator */}
          <View style={styles.sep} />

          {/* Undo */}
          <Pressable style={[styles.btn, !canUndo && styles.btnDisabled]} onPress={undo} disabled={!canUndo}>
            <Ionicons name="arrow-undo-outline" size={18} color="rgba(232,240,237,0.85)" />
          </Pressable>

          {/* Redo */}
          <Pressable style={[styles.btn, !canRedo && styles.btnDisabled]} onPress={redo} disabled={!canRedo}>
            <Ionicons name="arrow-redo-outline" size={18} color="rgba(232,240,237,0.85)" />
          </Pressable>

          {/* Separator */}
          <View style={styles.sep} />

          {/* Drawing style — StyleFlyout deferred to Pass-B (settings panel) */}
          {/* TODO(Pass-B): implement StyleFlyout modal (color picker, thickness, line style) */}
          <Pressable
            style={[styles.btn, showStyle && styles.btnActive]}
            onPress={() => setShowStyle(v => !v)}
          >
            <IcoDot color={activeStyle.color} />
          </Pressable>
        </ScrollView>
      </View>

      {/* Floating favorites bar (no drag in Pass A) */}
      {favTools.length > 0 && (
        <FavoritesBar
          tools={favTools}
          activeToolKey={activeToolKey}
          onSelect={t => { selectTool(t.key, t.realType); }}
          onToggleFav={toggleFav}
        />
      )}
    </>
  );
});

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  rail: {
    width: 52, flexShrink: 0,
    backgroundColor: "#0a0a0a",
    borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.06)",
  },
  railContent: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  btn: {
    width: 44, height: 44, borderRadius: 4,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "transparent",
  },
  btnActive: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  btnDisabled: {
    opacity: 0.25,
  },
  sep: {
    height: 0,
    // Visual separator removed — gaps handle spacing; use explicit margin if needed
  },
  // ToolPopup
  toolPopup: {
    position: "absolute",
    width: 230,
    backgroundColor: "rgba(7,17,13,0.97)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.13)",
    overflow: "hidden",
    zIndex: 9999,
    // Shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 24,
  },
  popupDivider: {
    height: 1, backgroundColor: "rgba(183,255,90,0.07)", marginVertical: 3,
  },
  sectionHeader: {
    paddingHorizontal: 12, paddingTop: 6, paddingBottom: 2,
  },
  sectionTitle: {
    fontSize: 9, fontWeight: "800", color: "rgba(167,184,169,0.38)",
    textTransform: "uppercase", letterSpacing: 1.3,
  },
  // ToolRow
  toolRow: {
    flexDirection: "row", alignItems: "center", height: 38,
    paddingLeft: 12, paddingRight: 10,
    backgroundColor: "transparent",
  },
  toolRowActive: {
    backgroundColor: "rgba(183,255,90,0.08)",
  },
  toolRowMain: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 10,
  },
  toolIconBox: {
    width: 24, height: 24, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  toolLabel: {
    flex: 1, fontSize: 13, fontWeight: "500", color: "#ffffff",
  },
  toolLabelActive: {
    color: "#B7FF5A", fontWeight: "700",
  },
  toolShortcut: {
    fontSize: 10, fontWeight: "500", color: "rgba(255,255,255,0.45)",
    letterSpacing: 0.3, flexShrink: 0, marginRight: 4,
  },
  toolStarBtn: {
    width: 26, height: 26, alignItems: "center", justifyContent: "center",
    borderRadius: 5, flexShrink: 0,
  },
  // FavoritesBar
  favBar: {
    position: "absolute",
    flexDirection: "row", alignItems: "center", gap: 2,
    paddingHorizontal: 8, paddingVertical: 5,
    backgroundColor: "rgba(30,32,38,0.97)",
    borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.09)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55, shadowRadius: 12,
    elevation: 12,
    // z-index via parent pointerEvents
  },
  favGrip: {
    flexDirection: "row", flexWrap: "wrap", width: 14,
    gap: 2, paddingLeft: 2, paddingRight: 7, marginRight: 1,
    borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
  },
  favGripDot: {
    width: 3, height: 3, borderRadius: 1.5, backgroundColor: "rgba(255,255,255,0.35)",
  },
  favBtn: {
    width: 36, height: 36, borderRadius: 7,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 1, borderColor: "transparent",
  },
  favBtnActive: {
    backgroundColor: "rgba(183,255,90,0.13)",
    borderColor: "rgba(183,255,90,0.28)",
  },
});

export default DrawingToolbar;
