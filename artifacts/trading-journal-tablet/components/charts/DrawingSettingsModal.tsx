/**
 * DrawingSettingsModal.tsx — React Native port (Phase 9.22 Pass A)
 *
 * Migrated from src/components/charts/DrawingSettingsModal.tsx
 *
 * Web → RN changes (Pass A):
 *   createPortal                → Modal (full-screen transparent)
 *   <div>/<span>/<p>/<button>   → View/Text/Pressable
 *   <input type="number">       → TextInput keyboardType="numeric"
 *   <textarea>                  → TextInput multiline
 *   <svg> inline icons          → react-native-svg equivalents
 *   ColorPickerGlass            → PresetColorModal (preset bottom-sheet)
 *   HTMLButtonElement refs      → no measure() needed (bottom-sheet is anchor-independent)
 *   DOMRect / getBoundingClientRect() → removed
 *   window.innerWidth/Height    → Dimensions
 *   CSS @keyframes / animations → removed (deferred to Pass-B)
 *   className / inline CSS      → StyleSheet
 *   hover / mouse events        → removed
 *   document.body portal        → Modal
 *   onClick+stopPropagation     → onPress (Modal backdrop handles dismissal)
 *
 * Exports (unchanged):
 *   DrawingSettingsModal (named export, memo)
 */

import { memo, useState, useRef, useCallback } from "react";
import {
  View, Text, Pressable, TextInput, ScrollView,
  Modal, StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Rect, Line, Path } from "react-native-svg";
import type { Drawing, DrawingStyle, DrawingPoint } from "@/types/drawing";

// ── Constants ──────────────────────────────────────────────────────────────────
type Tab = "style" | "text" | "coordinates" | "visibility";

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

const LINE_TOOLS = new Set([
  "trendline", "ray", "extended", "hline", "hray", "vline", "channel",
]);

const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24];

const TOOL_NAMES: Record<string, string> = {
  trendline:      "Trendline",
  ray:            "Ray",
  extended:       "Extended Line",
  hline:          "Horizontal Line",
  hray:           "Horizontal Ray",
  vline:          "Vertical Line",
  channel:        "Channel",
  rect:           "Rectangle",
  ellipse:        "Ellipse",
  arrow:          "Arrow",
  text:           "Text",
  note:           "Note",
  fib:            "Fibonacci",
  fib_channel:    "Fib Channel",
  position_long:  "Long Position",
  position_short: "Short Position",
};

const PRESET_COLORS = [
  "#ffffff", "#000000", "#B7FF5A", "#34d399", "#38bdf8",
  "#818cf8", "#f472b6", "#f59e0b", "#fb923c", "#f87171",
  "#089981", "#f23645", "#3b82f6", "#a855f7", "#64748b",
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtTime(unixSec: number): string {
  const d   = new Date(unixSec * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

// ── Preset color picker modal ──────────────────────────────────────────────────
function PresetColorModal({
  visible, value, onSelect, onClose,
}: {
  visible: boolean; value: string;
  onSelect: (hex: string) => void; onClose: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <View style={s.colorModal}>
        <View style={s.colorModalHeader}>
          <Text style={s.colorModalTitle}>Line Color</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={14} color="rgba(255,255,255,0.4)" />
          </Pressable>
        </View>
        <View style={s.colorGrid}>
          {PRESET_COLORS.map(hex => (
            <Pressable
              key={hex}
              onPress={() => { onSelect(hex); onClose(); }}
              style={[s.colorDot, { backgroundColor: hex }, value === hex && s.colorDotActive]}
            />
          ))}
        </View>
      </View>
    </Modal>
  );
}

// ── SRow: settings row with left label ────────────────────────────────────────
function SRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.sRow}>
      <Text style={s.sRowLabel}>{label}</Text>
      <View style={s.sRowRight}>{children}</View>
    </View>
  );
}

// ── Sep: horizontal divider ───────────────────────────────────────────────────
function Sep() {
  return <View style={s.sep} />;
}

// ── ThkBtn: thickness / style toggle button ───────────────────────────────────
function ThkBtn({ active, onPress, children }: { active: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.thkBtn, active && s.thkBtnActive]}
    >
      {children}
    </Pressable>
  );
}

// ── TogBtn: text toggle button (extend left/right, bold/italic) ───────────────
function TogBtn({ active, onPress, children }: { active: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.togBtn, active && s.togBtnActive]}
    >
      {children}
    </Pressable>
  );
}

// ── ChkRow: checkbox row ───────────────────────────────────────────────────────
function ChkRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable onPress={() => onChange(!checked)} style={s.chkRow}>
      <View style={[s.chkBox, checked && s.chkBoxChecked]}>
        {checked && (
          <Svg width={9} height={7} viewBox="0 0 9 7" fill="none">
            <Path d="M1 3.5l2.5 2.5L8 1" stroke="#0a1510" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round"/>
          </Svg>
        )}
      </View>
      <Text style={[s.chkLabel, checked && s.chkLabelChecked]}>{label}</Text>
    </Pressable>
  );
}

// ── PointCard: coordinate card ────────────────────────────────────────────────
function PointCard({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <View style={s.pointCard}>
      <Text style={[s.pointCardLabel, { color }]}>{label}</Text>
      <View style={s.pointCardBody}>{children}</View>
    </View>
  );
}

// ── CoordField: label + input row ─────────────────────────────────────────────
function CoordField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.coordField}>
      <Text style={s.coordFieldLabel}>{label}</Text>
      <View style={s.coordFieldValue}>{children}</View>
    </View>
  );
}

// ── HAlignIcon ────────────────────────────────────────────────────────────────
function HAlignIcon({ dir, active }: { dir: "left" | "center" | "right"; active: boolean }) {
  const fill = active ? "#B7FF5A" : "rgba(200,200,200,0.5)";
  return (
    <Svg width={18} height={14} viewBox="0 0 18 14">
      {dir === "left" && (
        <>
          <Rect x={0} y={0}  width={18} height={2} rx={1} fill={fill}/>
          <Rect x={0} y={6}  width={11} height={2} rx={1} fill={fill}/>
          <Rect x={0} y={12} width={14} height={2} rx={1} fill={fill}/>
        </>
      )}
      {dir === "center" && (
        <>
          <Rect x={0}   y={0}  width={18} height={2} rx={1} fill={fill}/>
          <Rect x={3.5} y={6}  width={11} height={2} rx={1} fill={fill}/>
          <Rect x={2}   y={12} width={14} height={2} rx={1} fill={fill}/>
        </>
      )}
      {dir === "right" && (
        <>
          <Rect x={0} y={0}  width={18} height={2} rx={1} fill={fill}/>
          <Rect x={7} y={6}  width={11} height={2} rx={1} fill={fill}/>
          <Rect x={4} y={12} width={14} height={2} rx={1} fill={fill}/>
        </>
      )}
    </Svg>
  );
}

// ── VAlignIcon ────────────────────────────────────────────────────────────────
function VAlignIcon({ dir, active }: { dir: "top" | "middle" | "bottom"; active: boolean }) {
  const stroke = active ? "#B7FF5A" : "rgba(200,200,200,0.5)";
  return (
    <Svg width={18} height={16} viewBox="0 0 18 16" fill="none">
      {dir === "top" && (
        <>
          <Line x1={0} y1={1}  x2={18} y2={1}  stroke={stroke} strokeWidth={1.5} strokeLinecap="round"/>
          <Line x1={4} y1={5}  x2={14} y2={5}  stroke={stroke} strokeWidth={1.5} strokeLinecap="round"/>
          <Line x1={4} y1={9}  x2={14} y2={9}  stroke={stroke} strokeWidth={1.5} strokeLinecap="round"/>
          <Line x1={9} y1={1}  x2={9}  y2={4}  stroke={stroke} strokeWidth={1.5} strokeLinecap="round"/>
          <Path d="M6.5 3.5L9 1L11.5 3.5" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
        </>
      )}
      {dir === "middle" && (
        <>
          <Line x1={0} y1={8}  x2={18} y2={8}  stroke={stroke} strokeWidth={1.5} strokeLinecap="round"/>
          <Line x1={4} y1={4}  x2={14} y2={4}  stroke={stroke} strokeWidth={1.5} strokeLinecap="round"/>
          <Line x1={4} y1={12} x2={14} y2={12} stroke={stroke} strokeWidth={1.5} strokeLinecap="round"/>
          <Line x1={9} y1={8}  x2={9}  y2={5}  stroke={stroke} strokeWidth={1.5} strokeLinecap="round"/>
          <Path d="M6.5 6.5L9 4L11.5 6.5"   stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
          <Line x1={9} y1={8}  x2={9}  y2={11} stroke={stroke} strokeWidth={1.5} strokeLinecap="round"/>
          <Path d="M6.5 9.5L9 12L11.5 9.5"  stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
        </>
      )}
      {dir === "bottom" && (
        <>
          <Line x1={0} y1={15} x2={18} y2={15} stroke={stroke} strokeWidth={1.5} strokeLinecap="round"/>
          <Line x1={4} y1={7}  x2={14} y2={7}  stroke={stroke} strokeWidth={1.5} strokeLinecap="round"/>
          <Line x1={4} y1={11} x2={14} y2={11} stroke={stroke} strokeWidth={1.5} strokeLinecap="round"/>
          <Line x1={9} y1={15} x2={9}  y2={12} stroke={stroke} strokeWidth={1.5} strokeLinecap="round"/>
          <Path d="M6.5 12.5L9 15L11.5 12.5" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
        </>
      )}
    </Svg>
  );
}

// ── Line style SVG preview ─────────────────────────────────────────────────────
function LineStylePreview({ style: ls, active }: { style: "solid" | "dashed" | "dotted"; active: boolean }) {
  const stroke = active ? "#B7FF5A" : "rgba(180,180,180,0.45)";
  const dashArray =
    ls === "dashed" ? "7 3" :
    ls === "dotted" ? "1.5 3.5" :
    undefined;
  return (
    <Svg width={34} height={6} viewBox="0 0 34 6">
      <Line
        x1={0} y1={3} x2={34} y2={3}
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray={dashArray}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ── DrawingSettingsModal ───────────────────────────────────────────────────────
export const DrawingSettingsModal = memo(function DrawingSettingsModal({
  drawing,
  pos,
  onUpdate,
  onUpdatePoints,
  onClose,
}: {
  drawing:        Drawing;
  pos:            { x: number; y: number };
  onUpdate:       (patch: Partial<DrawingStyle>) => void;
  onUpdatePoints: (points: DrawingPoint[]) => void;
  onClose:        () => void;
}) {
  const origStyleRef  = useRef<DrawingStyle>({ ...drawing.style });
  const origPointsRef = useRef<DrawingPoint[]>(drawing.points.map(p => ({ ...p })));

  const [activeTab, setActiveTab]           = useState<Tab>("style");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTextCP,      setShowTextCP]      = useState(false);

  const [pt1Price, setPt1Price] = useState(drawing.points[0]?.price?.toString() ?? "");
  const [pt2Price, setPt2Price] = useState(drawing.points[1]?.price?.toString() ?? "");

  const S          = drawing.style;
  const isLineTool = LINE_TOOLS.has(drawing.toolType);

  const handleCancel = useCallback(() => {
    onUpdate(origStyleRef.current);
    onUpdatePoints(origPointsRef.current);
    onClose();
  }, [onUpdate, onUpdatePoints, onClose]);

  const commitPt1 = useCallback(() => {
    const v = parseFloat(pt1Price);
    if (isNaN(v)) { setPt1Price(drawing.points[0]?.price?.toString() ?? ""); return; }
    const pts = drawing.points.map(p => ({ ...p }));
    if (pts[0]) pts[0] = { ...pts[0], price: v };
    onUpdatePoints(pts);
  }, [pt1Price, drawing.points, onUpdatePoints]);

  const commitPt2 = useCallback(() => {
    const v = parseFloat(pt2Price);
    if (isNaN(v)) { setPt2Price(drawing.points[1]?.price?.toString() ?? ""); return; }
    const pts = drawing.points.map(p => ({ ...p }));
    if (pts[1]) pts[1] = { ...pts[1], price: v };
    onUpdatePoints(pts);
  }, [pt2Price, drawing.points, onUpdatePoints]);

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

  const allVisible     = (S.visibleTimeframes ?? []).length === 0;
  const activeVTLabels = (S.visibleTimeframes ?? [])
    .map(v => TIMEFRAME_OPTIONS.find(t => t.value === v)?.label ?? v)
    .join(", ");

  const TABS: { id: Tab; label: string }[] = [
    { id: "style",       label: "Style"       },
    { id: "text",        label: "Text"        },
    { id: "coordinates", label: "Coordinates" },
    { id: "visibility",  label: "Visibility"  },
  ];

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

      {/* Centered dialog */}
      <View style={s.dialog}>
        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={s.headerTitle}>
            {TOOL_NAMES[drawing.toolType] ?? "Drawing"} Settings
          </Text>
          <Pressable onPress={onClose} style={s.headerClose} hitSlop={8}>
            <Ionicons name="close" size={13} color="rgba(255,255,255,0.55)" />
          </Pressable>
        </View>

        {/* ── Tab bar ── */}
        <View style={s.tabBar}>
          {TABS.map(t => (
            <Pressable
              key={t.id}
              style={s.tabBtn}
              onPress={() => setActiveTab(t.id)}
            >
              <Text style={[s.tabLabel, activeTab === t.id && s.tabLabelActive]}>
                {t.label}
              </Text>
              {activeTab === t.id && <View style={s.tabUnderline} />}
            </Pressable>
          ))}
        </View>

        {/* ── Tab content ── */}
        <ScrollView
          style={s.scroll}
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ════ STYLE TAB ════ */}
          {activeTab === "style" && (
            <View>
              <SRow label="Line Color">
                {/* Color swatch + hex display */}
                <Pressable
                  onPress={() => setShowColorPicker(v => !v)}
                  style={[s.colorSwatch, { backgroundColor: S.color }, showColorPicker && s.colorSwatchOpen]}
                />
                <View style={s.hexDisplay}>
                  <Text style={s.hexHash}>#</Text>
                  <Text style={s.hexValue}>
                    {S.color.replace(/^#/, "").toUpperCase().slice(0, 6)}
                  </Text>
                </View>
              </SRow>

              <Sep />

              <SRow label="Thickness">
                <View style={s.rowFlex}>
                  {[1, 2, 3, 4, 5].map(t => {
                    const act = S.thickness === t;
                    return (
                      <ThkBtn key={t} active={act} onPress={() => onUpdate({ thickness: t })}>
                        <View style={[s.thkBar, { height: t }, act ? s.thkBarActive : s.thkBarDim]} />
                      </ThkBtn>
                    );
                  })}
                </View>
              </SRow>

              <SRow label="Style">
                <View style={s.rowFlex}>
                  {(["solid", "dashed", "dotted"] as const).map(ls => {
                    const act = S.lineStyle === ls;
                    return (
                      <ThkBtn key={ls} active={act} onPress={() => onUpdate({ lineStyle: ls })}>
                        <LineStylePreview style={ls} active={act} />
                      </ThkBtn>
                    );
                  })}
                </View>
              </SRow>

              {isLineTool && (
                <>
                  <Sep />
                  <SRow label="Extend">
                    <View style={s.rowFlex}>
                      <TogBtn active={S.extendLeft ?? false} onPress={() => onUpdate({ extendLeft: !(S.extendLeft ?? false) })}>
                        <Text style={s.togBtnText}>← Left</Text>
                      </TogBtn>
                      <TogBtn active={S.extendRight ?? false} onPress={() => onUpdate({ extendRight: !(S.extendRight ?? false) })}>
                        <Text style={s.togBtnText}>Right →</Text>
                      </TogBtn>
                    </View>
                  </SRow>
                </>
              )}

              <Sep />

              {isLineTool && (
                <ChkRow
                  label="Middle point"
                  checked={S.showMiddlePoint ?? false}
                  onChange={v => onUpdate({ showMiddlePoint: v })}
                />
              )}

              <ChkRow
                label="Price labels"
                checked={S.showPriceLabels ?? false}
                onChange={v => onUpdate({ showPriceLabels: v })}
              />
            </View>
          )}

          {/* ════ TEXT TAB ════ */}
          {activeTab === "text" && (
            <View>
              <SRow label="Text Color">
                <Pressable
                  onPress={() => setShowTextCP(v => !v)}
                  style={[s.colorSwatch, { backgroundColor: S.textColor ?? S.color }, showTextCP && s.colorSwatchOpen]}
                />
                <View style={s.hexDisplay}>
                  <Text style={s.hexValue}>
                    {(S.textColor ?? S.color).replace(/^#/, "").toUpperCase().slice(0, 6)}
                  </Text>
                </View>
              </SRow>

              <Sep />

              <SRow label="Font Size">
                <View style={[s.rowFlex, s.rowWrap]}>
                  {FONT_SIZES.map(fs => {
                    const act = (S.fontSize ?? 13) === fs;
                    return (
                      <Pressable
                        key={fs}
                        onPress={() => onUpdate({ fontSize: fs })}
                        style={[s.fsSizeBtn, act && s.fsSizeBtnActive]}
                      >
                        <Text style={[s.fsSizeText, act && s.fsSizeTextActive]}>
                          {fs}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </SRow>

              <SRow label="Format">
                <View style={s.rowFlex}>
                  <TogBtn active={S.fontBold ?? false} onPress={() => onUpdate({ fontBold: !(S.fontBold ?? false) })}>
                    <Text style={[s.togBtnText, { fontWeight: "900", fontStyle: "normal" }]}>B</Text>
                  </TogBtn>
                  <TogBtn active={S.fontItalic ?? false} onPress={() => onUpdate({ fontItalic: !(S.fontItalic ?? false) })}>
                    <Text style={[s.togBtnText, { fontStyle: "italic", fontWeight: "400" }]}>I</Text>
                  </TogBtn>
                </View>
              </SRow>

              <Sep />

              <View style={s.textAreaContainer}>
                <Text style={s.textAreaLabel}>Text</Text>
                <TextInput
                  defaultValue={S.text ?? ""}
                  multiline
                  numberOfLines={3}
                  placeholder="Enter text…"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  onEndEditing={e => onUpdate({ text: e.nativeEvent.text })}
                  style={s.textArea}
                  textAlignVertical="top"
                />
              </View>

              <Sep />

              <SRow label="H Align">
                <View style={s.rowFlex}>
                  {(["left", "center", "right"] as const).map(a => {
                    const act = (S.textAlignH ?? "left") === a;
                    return (
                      <ThkBtn key={a} active={act} onPress={() => onUpdate({ textAlignH: a })}>
                        <HAlignIcon dir={a} active={act} />
                      </ThkBtn>
                    );
                  })}
                </View>
              </SRow>

              <SRow label="V Align">
                <View style={s.rowFlex}>
                  {(["top", "middle", "bottom"] as const).map(a => {
                    const act = (S.textAlignV ?? "top") === a;
                    return (
                      <ThkBtn key={a} active={act} onPress={() => onUpdate({ textAlignV: a })}>
                        <VAlignIcon dir={a} active={act} />
                      </ThkBtn>
                    );
                  })}
                </View>
              </SRow>
            </View>
          )}

          {/* ════ COORDINATES TAB ════ */}
          {activeTab === "coordinates" && (
            <View style={s.coordTab}>
              {drawing.points[0] && (
                <PointCard label="Point 1" color="rgba(183,255,90,0.85)">
                  <CoordField label="Price">
                    <TextInput
                      value={pt1Price}
                      onChangeText={setPt1Price}
                      onBlur={commitPt1}
                      onSubmitEditing={commitPt1}
                      keyboardType="numeric"
                      returnKeyType="done"
                      style={s.coordInput}
                      placeholderTextColor="rgba(255,255,255,0.25)"
                    />
                  </CoordField>
                  <CoordField label="Time">
                    <View style={s.coordTimeDisplay}>
                      <Text style={s.coordTimeText}>{fmtTime(drawing.points[0].time)}</Text>
                    </View>
                  </CoordField>
                </PointCard>
              )}

              {drawing.points[1] && (
                <PointCard label="Point 2" color="rgba(100,180,255,0.85)">
                  <CoordField label="Price">
                    <TextInput
                      value={pt2Price}
                      onChangeText={setPt2Price}
                      onBlur={commitPt2}
                      onSubmitEditing={commitPt2}
                      keyboardType="numeric"
                      returnKeyType="done"
                      style={s.coordInput}
                      placeholderTextColor="rgba(255,255,255,0.25)"
                    />
                  </CoordField>
                  <CoordField label="Time">
                    <View style={s.coordTimeDisplay}>
                      <Text style={s.coordTimeText}>{fmtTime(drawing.points[1].time)}</Text>
                    </View>
                  </CoordField>
                </PointCard>
              )}

              {drawing.points.length === 1 && (
                <Text style={s.singlePointNote}>Single-point drawing</Text>
              )}
            </View>
          )}

          {/* ════ VISIBILITY TAB ════ */}
          {activeTab === "visibility" && (
            <View style={s.visTab}>
              <Text style={s.visLabel}>Visible on timeframes</Text>
              <View style={s.tfGrid}>
                {TIMEFRAME_OPTIONS.map(tf => {
                  const active = isTFVisible(tf.value);
                  return (
                    <Pressable
                      key={tf.value}
                      onPress={() => toggleTF(tf.value)}
                      style={[s.tfChip, active && s.tfChipActive]}
                    >
                      <Text style={[s.tfChipText, active && s.tfChipTextActive]}>
                        {tf.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={s.visHint}>
                {allVisible
                  ? "Showing on all timeframes"
                  : `Showing on: ${activeVTLabels}`}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <Pressable onPress={handleCancel} style={s.cancelBtn}>
            <Text style={s.cancelBtnText}>Cancel</Text>
          </Pressable>
          <Pressable onPress={onClose} style={s.okBtn}>
            <Text style={s.okBtnText}>OK</Text>
          </Pressable>
        </View>
      </View>

      {/* Color pickers */}
      <PresetColorModal
        visible={showColorPicker}
        value={S.color}
        onSelect={c => onUpdate({ color: c })}
        onClose={() => setShowColorPicker(false)}
      />
      <PresetColorModal
        visible={showTextCP}
        value={S.textColor ?? S.color}
        onSelect={c => onUpdate({ textColor: c })}
        onClose={() => setShowTextCP(false)}
      />
    </Modal>
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Backdrop handled by Pressable + StyleSheet.absoluteFillObject

  // Dialog
  dialog: {
    position: "absolute",
    top: "8%",
    left: "15%",
    right: "15%",
    maxHeight: "84%",
    backgroundColor: "rgba(12,16,22,0.98)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 28 },
    shadowOpacity: 0.88,
    shadowRadius: 56,
    elevation: 28,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255,255,255,0.92)",
  },
  headerClose: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.06)",
  },

  // Tab bar
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    flexShrink: 0,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 9,
    position: "relative",
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255,255,255,0.38)",
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    color: "#B7FF5A",
    fontWeight: "700",
  },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 4,
    right: 4,
    height: 2,
    backgroundColor: "#B7FF5A",
    borderRadius: 1,
  },

  // Scroll area
  scroll: {
    flex: 1,
  },

  // SRow
  sRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 7,
    minHeight: 40,
  },
  sRowLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    width: 70,
    flexShrink: 0,
  },
  sRowRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  // Sep
  sep: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.055)",
    marginVertical: 1,
  },

  // Color swatch
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.18)",
    flexShrink: 0,
  },
  colorSwatchOpen: {
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
  },

  // Hex display
  hexDisplay: {
    flex: 1,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 9,
    gap: 4,
  },
  hexHash: {
    fontSize: 9.5,
    color: "rgba(255,255,255,0.22)",
    fontFamily: "monospace",
  },
  hexValue: {
    fontSize: 12,
    color: "#fff",
    fontFamily: "monospace",
    fontWeight: "600",
    letterSpacing: 0.4,
  },

  // ThkBtn
  thkBtn: {
    flex: 1,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  thkBtnActive: {
    backgroundColor: "rgba(183,255,90,0.11)",
    borderColor: "rgba(183,255,90,0.48)",
  },
  thkBar: {
    width: "62%",
    borderRadius: 2,
  },
  thkBarActive: {
    backgroundColor: "#B7FF5A",
  },
  thkBarDim: {
    backgroundColor: "rgba(200,200,200,0.38)",
  },

  // TogBtn
  togBtn: {
    flex: 1,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  togBtnActive: {
    backgroundColor: "rgba(183,255,90,0.11)",
    borderColor: "rgba(183,255,90,0.48)",
  },
  togBtnText: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(200,200,200,0.65)",
  },

  // rowFlex
  rowFlex: {
    flex: 1,
    flexDirection: "row",
    gap: 4,
  },
  rowWrap: {
    flexWrap: "wrap",
    gap: 3,
  },

  // Font size buttons
  fsSizeBtn: {
    minWidth: 32,
    height: 26,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  fsSizeBtnActive: {
    backgroundColor: "rgba(183,255,90,0.12)",
    borderColor: "rgba(183,255,90,0.5)",
  },
  fsSizeText: {
    fontSize: 10,
    color: "rgba(200,200,200,0.65)",
  },
  fsSizeTextActive: {
    color: "#B7FF5A",
    fontWeight: "700",
  },

  // TextArea
  textAreaContainer: {
    padding: 8,
    paddingHorizontal: 16,
  },
  textAreaLabel: {
    fontSize: 9.5,
    color: "rgba(255,255,255,0.35)",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    fontWeight: "700",
    marginBottom: 7,
  },
  textArea: {
    width: "100%",
    minHeight: 72,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 12,
    padding: 8,
    lineHeight: 18,
  },

  // ChkRow
  chkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 7,
    minHeight: 38,
  },
  chkBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    flexShrink: 0,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  chkBoxChecked: {
    backgroundColor: "#B7FF5A",
    borderColor: "#B7FF5A",
  },
  chkLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.62)",
  },
  chkLabelChecked: {
    color: "rgba(255,255,255,0.88)",
  },

  // Coordinates tab
  coordTab: {
    padding: 10,
    paddingHorizontal: 16,
    gap: 18,
  },
  pointCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 12,
    paddingBottom: 10,
  },
  pointCardLabel: {
    fontSize: 9.5,
    textTransform: "uppercase",
    letterSpacing: 0.9,
    fontWeight: "700",
    marginBottom: 10,
  },
  pointCardBody: {
    gap: 7,
  },
  coordField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  coordFieldLabel: {
    fontSize: 10.5,
    color: "rgba(255,255,255,0.38)",
    width: 34,
    flexShrink: 0,
  },
  coordFieldValue: {
    flex: 1,
  },
  coordInput: {
    width: "100%",
    height: 28,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    color: "#fff",
    fontSize: 12,
    fontFamily: "monospace",
    paddingHorizontal: 9,
  },
  coordTimeDisplay: {
    height: 28,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    justifyContent: "center",
    paddingHorizontal: 9,
  },
  coordTimeText: {
    fontSize: 10,
    color: "rgba(255,255,255,0.38)",
    fontFamily: "monospace",
  },
  singlePointNote: {
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
    textAlign: "center",
    marginTop: 8,
  },

  // Visibility tab
  visTab: {
    padding: 14,
    paddingHorizontal: 16,
  },
  visLabel: {
    fontSize: 9.5,
    color: "rgba(255,255,255,0.35)",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    fontWeight: "700",
    marginBottom: 10,
  },
  tfGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 4,
  },
  tfChip: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tfChipActive: {
    backgroundColor: "rgba(183,255,90,0.12)",
    borderColor: "rgba(183,255,90,0.5)",
  },
  tfChipText: {
    fontSize: 11.5,
    fontWeight: "500",
    color: "rgba(255,255,255,0.3)",
  },
  tfChipTextActive: {
    color: "#B7FF5A",
    fontWeight: "700",
  },
  visHint: {
    fontSize: 10.5,
    color: "rgba(255,255,255,0.28)",
    marginTop: 12,
    lineHeight: 16,
  },

  // Footer
  footer: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
    flexShrink: 0,
  },
  cancelBtn: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  cancelBtnText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
  },
  okBtn: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(183,255,90,0.14)",
    borderWidth: 1.5,
    borderColor: "rgba(183,255,90,0.42)",
  },
  okBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#B7FF5A",
  },

  // Color modal (preset picker)
  colorModal: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(10,10,15,0.98)",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingBottom: 32,
  },
  colorModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  colorModalTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(255,255,255,0.9)",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    padding: 16,
  },
  colorDot: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.12)",
  },
  colorDotActive: {
    borderWidth: 2.5,
    borderColor: "#ffffff",
  },
});
