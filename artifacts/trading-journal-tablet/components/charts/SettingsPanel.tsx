/**
 * SettingsPanel.tsx — React Native port (Phase 9.22 Pass A)
 *
 * Migrated from src/components/charts/SettingsPanel.tsx
 *
 * Web → RN changes (Pass A):
 *   <div>/<span>/<p>/<button> → View/Text/Pressable
 *   <select>                  → SelectModal (custom bottom-sheet picker)
 *   lucide-react X/ChevronDown → Ionicons
 *   AnimatedModal              → Modal (centered dialog card)
 *   AnimatedList/AnimatedListItem → plain View (animations deferred)
 *   ColorPickerGlass           → PresetColorModal (preset-swatch bottom sheet)
 *   HTMLButtonElement refs     → View refs + measure()
 *   getBoundingClientRect()    → removed (bottom-sheet picker is anchor-independent)
 *   useLayoutEffect (DOM sync) → useEffect (no synchronous layout flush needed in RN)
 *   hover events               → removed
 *   backdropFilter             → removed (elevation/shadow instead)
 *   CSS inline / Tailwind      → StyleSheet
 *   import.meta.env            → N/A (not used in this file)
 *   window.*                   → Dimensions
 *
 * Exports (unchanged):
 *   ColorBoxProps  (interface)
 *   ColorBox       (memo)
 *   ColorSwatch    (component alias)
 *   Section        (memo)
 *   Row            (memo)
 *   ColorPair      (memo)
 *   StyledSelect   (component alias)
 *   Toggle         (memo)
 *   ThicknessButtons (memo)
 *   ToggleRow      (memo)
 *   SidebarSection (type)
 *   SaveAsDefaultButton (function)
 *   default SettingsPanel
 */

import {
  memo, useRef, useEffect, useState, useCallback,
} from "react";
import {
  View, Text, Pressable, ScrollView, Modal, TextInput,
  StyleSheet, FlatList,
} from "react-native";
import { X, Check, ChevronDown } from "lucide-react-native";
import type { ChartSettings } from "@/components/charts/chartSettingsTypes";
import { DEFAULT_CHART_SETTINGS } from "@/components/charts/chartSettingsTypes";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  accent:        "#60A5FA",
  accentBg:      "rgba(96,165,250,0.10)",
  accentBorder:  "rgba(96,165,250,0.28)",
  accentGlow:    "rgba(96,165,250,0.20)",
  modalBg:       "rgba(10,10,15,0.99)",
  sectionBg:     "rgba(255,255,255,0.04)",
  sectionBorder: "rgba(255,255,255,0.08)",
  rowDivider:    "rgba(255,255,255,0.06)",
  rowHover:      "rgba(255,255,255,0.04)",
  btnBg:         "rgba(255,255,255,0.06)",
  btnBorder:     "rgba(255,255,255,0.10)",
  textHi:        "rgba(255,255,255,0.92)",
  textMed:       "rgba(255,255,255,0.65)",
  textDim:       "rgba(255,255,255,0.40)",
  textXDim:      "rgba(255,255,255,0.25)",
  divider:       "rgba(255,255,255,0.08)",
} as const;

function safeColor(v: unknown, fallback = "#000000"): string {
  if (typeof v === "string" && v.length > 0) return v;
  return fallback;
}

// ── Preset colors for color picker ────────────────────────────────────────────
const PRESET_COLORS = [
  "#ffffff", "#000000", "#60A5FA", "#34d399", "#f472b6",
  "#f59e0b", "#fb923c", "#f87171", "#818cf8", "#B7FF5A",
  "#089981", "#f23645", "#3b82f6", "#a855f7", "#64748b",
  "#C28D39", "#EFE5D2", "#22c55e", "#ef4444", "#e2e8f0",
];

// ── One-at-a-time color picker registry (same Map<symbol,fn> pattern as web) ──
const _colorBoxClosers = new Map<symbol, () => void>();

function _registerColorBoxCloser(id: symbol, fn: () => void) {
  _colorBoxClosers.set(id, fn);
  return () => { _colorBoxClosers.delete(id); };
}

function _closeAllColorBoxes(exceptId?: symbol) {
  _colorBoxClosers.forEach((fn, id) => { if (id !== exceptId) fn(); });
}

// ── Preset color picker Modal ──────────────────────────────────────────────────
function PresetColorModal({
  visible, value, label, onSelect, onClose,
}: {
  visible: boolean; value: string; label?: string;
  onSelect: (hex: string) => void; onClose: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <View style={s.colorModal}>
        <View style={s.colorModalHeader}>
          <Text style={s.colorModalTitle}>{label ?? "Color"}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={15} color={T.textDim} />
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
        <View style={s.colorCurrentRow}>
          <View style={[s.colorCurrentSwatch, { backgroundColor: safeColor(value, "#ffffff") }]} />
          <Text style={s.colorCurrentHex}>{value}</Text>
        </View>
      </View>
    </Modal>
  );
}

// ── SelectModal: cross-platform replacement for <select> ───────────────────────
function SelectModal({
  visible, options, value, onSelect, onClose,
}: {
  visible: boolean;
  options: { value: string; label: string }[];
  value: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <View style={s.selectModal}>
        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          {options.map(opt => {
            const active = opt.value === value;
            return (
              <Pressable
                key={opt.value}
                style={({ pressed }) => [s.selectOption, active && s.selectOptionActive, pressed && s.selectOptionPressed]}
                onPress={() => { onSelect(opt.value); onClose(); }}
              >
                <Text style={[s.selectOptionText, active && s.selectOptionTextActive]}>
                  {opt.label}
                </Text>
                {active && <Check size={14} color={T.accent} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── ColorBox ──────────────────────────────────────────────────────────────────
export interface ColorBoxProps {
  value:      string;
  onChange:   (v: string) => void;
  label?:     string;
  fallback?:  string;
  autoOpen?:  boolean;    // start with picker visible
  onDismiss?: () => void; // called when picker closes — parent unmounts us
}

export const ColorBox = memo(function ColorBox({
  value, onChange, label, fallback = "#000000", autoOpen, onDismiss,
}: ColorBoxProps) {
  const safe  = safeColor(value, fallback);
  const [open, setOpen] = useState(autoOpen ?? false);
  const idRef = useRef<symbol>(Symbol());

  useEffect(() => {
    return _registerColorBoxCloser(idRef.current, () => setOpen(false));
  }, []);

  const handleOpen = useCallback(() => {
    _closeAllColorBoxes(idRef.current);
    setOpen(prev => !prev);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    onDismiss?.();
  }, [onDismiss]);

  return (
    <>
      <Pressable
        onPress={handleOpen}
        style={[s.colorBox, { backgroundColor: safe }, open && s.colorBoxOpen]}
      />
      <PresetColorModal
        visible={open}
        value={safe}
        label={label}
        onSelect={onChange}
        onClose={handleClose}
      />
    </>
  );
});

// ── ColorSwatch: lightweight lazy wrapper (same pattern as web) ────────────────
const _ColorSwatchImpl = memo(function ColorSwatchImpl({
  value, onChange, label, fallback = "#000000",
}: ColorBoxProps) {
  const safe = safeColor(value, fallback);
  const [pickerOpen, setPickerOpen] = useState(false);
  const idRef = useRef<symbol>(Symbol());

  useEffect(() => {
    return _registerColorBoxCloser(idRef.current, () => setPickerOpen(false));
  }, []);

  return (
    <>
      <Pressable
        onPress={() => {
          _closeAllColorBoxes(idRef.current);
          setPickerOpen(true);
        }}
        style={[s.colorBox, { backgroundColor: safe }]}
      />
      {pickerOpen && (
        <ColorBox
          value={value}
          onChange={onChange}
          label={label}
          fallback={fallback}
          autoOpen
          onDismiss={() => setPickerOpen(false)}
        />
      )}
    </>
  );
});

export const ColorSwatch = (props: ColorBoxProps) => <_ColorSwatchImpl {...props} />;

// ── Section ───────────────────────────────────────────────────────────────────
export const Section = memo(function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionBody}>
        {children}
      </View>
    </View>
  );
});

// ── Row ───────────────────────────────────────────────────────────────────────
export const Row = memo(function Row({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <View style={[s.row, last && s.rowLast]}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.rowRight}>{children}</View>
    </View>
  );
});

// ── ColorPair ─────────────────────────────────────────────────────────────────
export const ColorPair = memo(function ColorPair({ label, bull, bear, onBull, onBear, last }: {
  label: string; bull: string; bear: string;
  onBull: (v: string) => void; onBear: (v: string) => void; last?: boolean;
}) {
  return (
    <Row label={label} last={last}>
      <View style={s.colorPairHalf}>
        <Text style={s.colorPairArrow}>▲</Text>
        <ColorSwatch value={bull} onChange={onBull} label={`${label} Bullish`} />
      </View>
      <View style={s.colorPairDivider} />
      <View style={s.colorPairHalf}>
        <Text style={s.colorPairArrowBear}>▼</Text>
        <ColorSwatch value={bear} onChange={onBear} label={`${label} Bearish`} />
      </View>
    </Row>
  );
});

// ── StyledSelect ──────────────────────────────────────────────────────────────
const _StyledSelectImpl = memo(function StyledSelectImpl({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const currentLabel = options.find(o => o.value === value)?.label ?? value;

  return (
    <>
      <Pressable style={s.selectBtn} onPress={() => setOpen(true)}>
        <Text style={s.selectBtnText} numberOfLines={1}>{currentLabel}</Text>
        <ChevronDown size={12} color={T.textDim} />
      </Pressable>
      <SelectModal
        visible={open}
        options={options}
        value={value}
        onSelect={onChange}
        onClose={() => setOpen(false)}
      />
    </>
  );
});

export const StyledSelect = (props: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) => <_StyledSelectImpl {...props} />;

// ── Toggle ────────────────────────────────────────────────────────────────────
export const Toggle = memo(function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      style={[s.togglePill, checked && s.togglePillOn]}
    >
      <View style={[s.toggleThumb, checked && s.toggleThumbOn]} />
    </Pressable>
  );
});

// ── ThicknessButtons ──────────────────────────────────────────────────────────
export const ThicknessButtons = memo(function ThicknessButtons({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={s.thkRow}>
      {[1, 2, 3].map(w => {
        const act = value === w;
        return (
          <Pressable
            key={w}
            onPress={() => onChange(w)}
            style={[s.thkBtn, act && s.thkBtnActive]}
          >
            <View style={[s.thkBar, { height: w }, act && s.thkBarActive]} />
          </Pressable>
        );
      })}
    </View>
  );
});

// ── ToggleRow ─────────────────────────────────────────────────────────────────
export const ToggleRow = memo(function ToggleRow({
  label, checked, onChange, last,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void; last?: boolean;
}) {
  return (
    <Row label={label} last={last}>
      <Toggle checked={checked} onChange={onChange} />
    </Row>
  );
});

// ── SidebarSection type ───────────────────────────────────────────────────────
export type SidebarSection = "Symbol" | "Canvas" | "Scale";

// ── NavItem ───────────────────────────────────────────────────────────────────
function NavItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Pressable
      onPress={onClick}
      style={[s.navItem, active && s.navItemActive]}
    >
      <Text style={[s.navItemLabel, active && s.navItemLabelActive]}>{label}</Text>
    </Pressable>
  );
}

// ── SaveAsDefaultButton ───────────────────────────────────────────────────────
export function SaveAsDefaultButton({ settings, onSaveAsDefault }: {
  settings: ChartSettings;
  onSaveAsDefault: (s: ChartSettings) => void;
}) {
  const [saved, setSaved] = useState(false);
  const handlePress = () => {
    onSaveAsDefault(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };
  return (
    <Pressable
      onPress={handlePress}
      style={[s.footerBtn, saved && s.footerBtnSaved]}
    >
      <Text style={[s.footerBtnText, saved && s.footerBtnTextSaved]}>
        {saved ? "✓ Saved as Default" : "Save as Default"}
      </Text>
    </Pressable>
  );
}

// ── SettingsPanel (main) ──────────────────────────────────────────────────────
interface Props {
  settings: ChartSettings;
  onChange: (s: ChartSettings) => void;
  onSaveAsDefault?: (s: ChartSettings) => void;
  onClose: () => void;
}

const SettingsPanel = memo(function SettingsPanel({ settings, onChange, onSaveAsDefault, onClose }: Props) {
  const [section, setSection] = useState<SidebarSection>("Symbol");

  const p = useCallback(
    (patch: Partial<ChartSettings>) => onChange({ ...settings, ...patch }),
    [settings, onChange],
  );

  // ── Symbol section ──────────────────────────────────────────────────────────
  const symbolContent = (
    <View>
      <Section title="Candles">
        <ColorPair label="Body"    bull={settings.upColor}       bear={settings.downColor}       onBull={v => p({ upColor: v })}       onBear={v => p({ downColor: v })} />
        <ColorPair label="Borders" bull={settings.upBorderColor} bear={settings.downBorderColor} onBull={v => p({ upBorderColor: v })} onBear={v => p({ downBorderColor: v })} />
        <ColorPair label="Wick"    bull={settings.upWickColor}   bear={settings.downWickColor}   onBull={v => p({ upWickColor: v })}   onBear={v => p({ downWickColor: v })} last />
      </Section>

      <Section title="Price Label">
        <ColorPair
          label="Background"
          bull={settings.priceLabelBullColor ?? "#22c55e"}
          bear={settings.priceLabelBearColor ?? "#ef4444"}
          onBull={v => p({ priceLabelBullColor: v })}
          onBear={v => p({ priceLabelBearColor: v })}
        />
        <Row label="Text Color">
          <ColorBox value={settings.priceLabelTextColor ?? "#ffffff"} onChange={v => p({ priceLabelTextColor: v })} label="Price Label Text" fallback="#ffffff" />
        </Row>
        <Row label="Line Color" last>
          <ColorBox value={settings.priceLabelLineColor ?? "rgba(255,255,255,0.4)"} onChange={v => p({ priceLabelLineColor: v })} label="Price Line" fallback="rgba(255,255,255,0.4)" />
        </Row>
      </Section>

      <Section title="Timezone">
        <Row label="Display Timezone" last>
          <StyledSelect
            value={settings.timezone}
            onChange={v => p({ timezone: v as ChartSettings["timezone"] })}
            options={[
              { value: "UTC",      label: "UTC" },
              { value: "IST",      label: "IST (India)" },
              { value: "Exchange", label: "Exchange" },
              { value: "Local",    label: "Local Time" },
            ]}
          />
        </Row>
      </Section>

      <Section title="Price Precision">
        <Row label="Decimal Places" last>
          <StyledSelect
            value={settings.precision}
            onChange={v => p({ precision: v as ChartSettings["precision"] })}
            options={[
              { value: "2", label: "2 decimals" },
              { value: "4", label: "4 decimals" },
              { value: "5", label: "5 decimals" },
              { value: "8", label: "8 decimals" },
            ]}
          />
        </Row>
      </Section>
    </View>
  );

  // ── Canvas section ──────────────────────────────────────────────────────────
  const canvasContent = (
    <View>
      <Section title="Background">
        <Row label="Type">
          <StyledSelect
            value={settings.bgType}
            onChange={v => p({ bgType: v as ChartSettings["bgType"] })}
            options={[{ value: "solid", label: "Solid" }, { value: "gradient", label: "Gradient" }]}
          />
        </Row>
        <Row label="Color" last>
          <ColorBox value={settings.bgColor} onChange={v => p({ bgColor: v })} label="Background Color" />
        </Row>
      </Section>

      <Section title="Grid Lines">
        <Row label="Display">
          <StyledSelect
            value={settings.gridStyle}
            onChange={v => p({ gridStyle: v as ChartSettings["gridStyle"], gridVisible: v !== "none" })}
            options={[
              { value: "both",       label: "Vertical + Horizontal" },
              { value: "vertical",   label: "Vertical Only" },
              { value: "horizontal", label: "Horizontal Only" },
              { value: "none",       label: "None" },
            ]}
          />
        </Row>
        <Row label="Color" last>
          <ColorBox value={settings.gridColor ?? settings.linesColor} onChange={v => p({ gridColor: v })} label="Grid Color" />
        </Row>
      </Section>

      <Section title="Axis Borders">
        <Row label="Visible">
          <Toggle checked={settings.bordersVisible ?? true} onChange={v => p({ bordersVisible: v })} />
        </Row>
        <Row label="Color" last>
          <ColorBox value={settings.borderColor ?? settings.linesColor} onChange={v => p({ borderColor: v })} label="Axis Border Color" />
        </Row>
      </Section>

      <Section title="Chart Panel Border">
        <Row label="Visible">
          <Toggle checked={settings.panelBorderVisible ?? true} onChange={v => p({ panelBorderVisible: v })} />
        </Row>
        <Row label="Color">
          <ColorBox value={settings.panelBorderColor ?? "rgba(255,255,255,0.22)"} onChange={v => p({ panelBorderColor: v })} label="Panel Border Color" />
        </Row>
        <Row label="Thickness" last>
          <ThicknessButtons value={settings.panelBorderThickness ?? 1} onChange={v => p({ panelBorderThickness: v })} />
        </Row>
      </Section>

      <Section title="Crosshair">
        <Row label="Color">
          <ColorBox value={settings.crosshairColor} onChange={v => p({ crosshairColor: v })} label="Crosshair Color" />
        </Row>
        <Row label="Mode">
          <StyledSelect
            value={settings.crosshair}
            onChange={v => p({ crosshair: v as ChartSettings["crosshair"] })}
            options={[{ value: "normal", label: "Normal" }, { value: "magnet", label: "Magnet" }]}
          />
        </Row>
        <Row label="Line Style">
          <StyledSelect
            value={settings.crosshairStyle}
            onChange={v => p({ crosshairStyle: v as ChartSettings["crosshairStyle"] })}
            options={[{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }]}
          />
        </Row>
        <Row label="Thickness" last>
          <ThicknessButtons value={settings.crosshairWidth ?? 1} onChange={v => p({ crosshairWidth: v })} />
        </Row>
      </Section>

      <Section title="Text">
        <Row label="Color">
          <ColorBox value={settings.textColor} onChange={v => p({ textColor: v })} label="Text Color" />
        </Row>
        <Row label="Font Size" last>
          <StyledSelect
            value={String(settings.fontSize)}
            onChange={v => p({ fontSize: Number(v) })}
            options={[
              { value: "9",  label: "9px" },
              { value: "10", label: "10px" },
              { value: "11", label: "11px (default)" },
              { value: "12", label: "12px" },
              { value: "13", label: "13px" },
              { value: "14", label: "14px" },
            ]}
          />
        </Row>
      </Section>

      <Section title="Scale Labels">
        <Row label="Label Color" last>
          <ColorBox value={settings.linesColor} onChange={v => p({ linesColor: v })} label="Scale Label Color" />
        </Row>
      </Section>
    </View>
  );

  // ── Scale section ───────────────────────────────────────────────────────────
  const scaleContent = (
    <View>
      <Section title="Price Scale Mode">
        <Row label="Scale Type">
          <StyledSelect
            value={settings.scaleMode}
            onChange={v => p({ scaleMode: v as ChartSettings["scaleMode"] })}
            options={[
              { value: "normal",  label: "Normal" },
              { value: "log",     label: "Logarithmic" },
              { value: "percent", label: "Percentage" },
              { value: "indexed", label: "Indexed to 100" },
            ]}
          />
        </Row>
        <Row label="Auto Scale" last>
          <Toggle checked={settings.priceScaleAutoScale} onChange={v => p({ priceScaleAutoScale: v })} />
        </Row>
      </Section>

      <Section title="Interaction">
        <Row label="Drag Price Scale" last>
          <Text style={s.infoText}>Drag the right axis up/down</Text>
        </Row>
      </Section>

      <Section title="Reset">
        <Row label="Double-click Axis" last>
          <Text style={s.infoText}>Double-click price axis to reset</Text>
        </Row>
      </Section>
    </View>
  );

  // ── Modal ───────────────────────────────────────────────────────────────────
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.backdrop} onPress={onClose} />
      <View style={s.dialogCard}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Chart Settings</Text>
          <Pressable onPress={onClose} style={s.headerClose} hitSlop={8}>
            <X size={16} color={T.textDim} />
          </Pressable>
        </View>

        {/* Body: sidebar + content */}
        <View style={s.body}>
          {/* Sidebar */}
          <View style={s.sidebar}>
            <Text style={s.sidebarLabel}>Sections</Text>
            {(["Symbol", "Canvas", "Scale"] as SidebarSection[]).map(sec => (
              <NavItem key={sec} label={sec} active={section === sec} onClick={() => setSection(sec)} />
            ))}
          </View>

          {/* Content */}
          <ScrollView
            style={s.content}
            contentContainerStyle={s.contentPad}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {section === "Symbol" && symbolContent}
            {section === "Canvas" && canvasContent}
            {section === "Scale"  && scaleContent}
          </ScrollView>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Pressable
            onPress={() => onChange(DEFAULT_CHART_SETTINGS)}
            style={s.footerResetBtn}
          >
            <Text style={s.footerResetText}>Reset Defaults</Text>
          </Pressable>
          <View style={s.footerRight}>
            {onSaveAsDefault && (
              <SaveAsDefaultButton settings={settings} onSaveAsDefault={onSaveAsDefault} />
            )}
            <Pressable onPress={onClose} style={s.footerDoneBtn}>
              <Text style={s.footerDoneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
});

export default SettingsPanel;

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Modal backdrop
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  // Dialog card
  dialogCard: {
    position: "absolute",
    top: "5%",
    left: "5%",
    right: "5%",
    bottom: "5%",
    backgroundColor: "rgba(10,10,15,0.99)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.9,
    shadowRadius: 48,
    elevation: 32,
  },
  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: T.textHi,
  },
  headerClose: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  // Body
  body: {
    flex: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  // Sidebar
  sidebar: {
    width: 120,
    borderRightWidth: 1,
    borderRightColor: T.divider,
    flexShrink: 0,
    paddingTop: 10,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  sidebarLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: T.textXDim,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginLeft: 14,
    marginBottom: 8,
  },
  // NavItem
  navItem: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderLeftWidth: 2,
    borderLeftColor: "transparent",
  },
  navItemActive: {
    backgroundColor: T.accentBg,
    borderLeftColor: T.accent,
  },
  navItemLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: T.textMed,
  },
  navItemLabelActive: {
    color: T.accent,
    fontWeight: "700",
  },
  // Content scroll area
  content: {
    flex: 1,
  },
  contentPad: {
    padding: 18,
    paddingBottom: 24,
  },
  // Section
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: "700",
    color: T.textXDim,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 7,
  },
  sectionBody: {
    backgroundColor: T.sectionBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.sectionBorder,
    overflow: "hidden",
  },
  // Row
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.rowDivider,
    minHeight: 42,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontSize: 12,
    color: T.textMed,
    fontWeight: "500",
    flex: 1,
    marginRight: 8,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  // ColorPair
  colorPairHalf: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  colorPairArrow: {
    fontSize: 9,
    color: T.textDim,
    fontWeight: "700",
  },
  colorPairArrowBear: {
    fontSize: 9,
    color: "rgba(239,68,68,0.55)",
    fontWeight: "700",
  },
  colorPairDivider: {
    width: 1,
    height: 14,
    backgroundColor: T.divider,
    marginHorizontal: 5,
  },
  // ColorBox swatch
  colorBox: {
    width: 32,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: T.btnBorder,
    flexShrink: 0,
  },
  colorBoxOpen: {
    borderWidth: 2,
    borderColor: T.accent,
  },
  // Preset color modal
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
    color: T.textHi,
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
  colorCurrentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  colorCurrentSwatch: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.2)",
  },
  colorCurrentHex: {
    fontSize: 12,
    fontWeight: "600",
    color: T.textMed,
    fontFamily: "monospace",
  },
  // StyledSelect trigger button
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: T.btnBg,
    borderWidth: 1,
    borderColor: T.btnBorder,
    borderRadius: 7,
    paddingVertical: 5,
    paddingHorizontal: 10,
    maxWidth: 160,
  },
  selectBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: T.textHi,
    flexShrink: 1,
  },
  // SelectModal
  selectModal: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "50%",
    backgroundColor: "rgba(10,10,15,0.98)",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    paddingBottom: 32,
    paddingTop: 8,
  },
  selectOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  selectOptionActive: {
    backgroundColor: T.accentBg,
  },
  selectOptionPressed: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  selectOptionText: {
    fontSize: 13,
    fontWeight: "500",
    color: T.textMed,
  },
  selectOptionTextActive: {
    color: T.accent,
    fontWeight: "700",
  },
  // Toggle
  togglePill: {
    width: 36,
    height: 20,
    borderRadius: 10,
    backgroundColor: T.btnBg,
    borderWidth: 1,
    borderColor: T.btnBorder,
    position: "relative",
    flexShrink: 0,
  },
  togglePillOn: {
    backgroundColor: T.accentBg,
    borderColor: T.accentBorder,
  },
  toggleThumb: {
    position: "absolute",
    top: 3,
    left: 3,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: T.textDim,
  },
  toggleThumbOn: {
    left: 19,
    backgroundColor: T.accent,
  },
  // ThicknessButtons
  thkRow: {
    flexDirection: "row",
    gap: 4,
  },
  thkBtn: {
    width: 30,
    height: 28,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: T.btnBg,
    borderWidth: 1,
    borderColor: T.btnBorder,
  },
  thkBtnActive: {
    backgroundColor: T.accentBg,
    borderWidth: 1.5,
    borderColor: T.accentBorder,
  },
  thkBar: {
    width: "60%",
    backgroundColor: T.textDim,
    borderRadius: 1,
  },
  thkBarActive: {
    backgroundColor: T.accent,
  },
  // Footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: T.divider,
    flexShrink: 0,
    backgroundColor: "rgba(255,255,255,0.02)",
    gap: 8,
  },
  footerResetBtn: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: T.btnBorder,
  },
  footerResetText: {
    fontSize: 11,
    fontWeight: "600",
    color: T.textDim,
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  footerBtn: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: T.btnBorder,
  },
  footerBtnSaved: {
    backgroundColor: T.accentBg,
    borderColor: T.accentBorder,
  },
  footerBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: T.textMed,
  },
  footerBtnTextSaved: {
    color: T.accent,
  },
  footerDoneBtn: {
    paddingVertical: 7,
    paddingHorizontal: 20,
    borderRadius: 9,
    backgroundColor: T.accentBg,
    borderWidth: 1,
    borderColor: T.accentBorder,
  },
  footerDoneText: {
    fontSize: 11,
    fontWeight: "800",
    color: T.accent,
  },
  // Info text (for Scale section hints)
  infoText: {
    fontSize: 11,
    color: T.textDim,
    fontStyle: "italic",
  },
});
