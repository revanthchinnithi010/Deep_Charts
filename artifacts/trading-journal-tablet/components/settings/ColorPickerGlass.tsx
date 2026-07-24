/**
 * components/settings/ColorPickerGlass.tsx — React Native ColorPickerGlass
 *
 * Migration of: artifacts/trading-journal/src/components/ColorPickerGlass.tsx
 * Phase 11.4 — Color Picker Migration (React → React Native)
 *
 * Web → RN replacements:
 *   createPortal / document.body     → Modal (react-native, transparent, animationType="fade")
 *   <input type="range"> opacity     → OpacitySlider (reanimated-color-picker)
 *   <style> + CSS class injection    → removed (StyleSheet)
 *   localStorage                     → AsyncStorage (same key "tj_recent_colors_v1")
 *   window.innerWidth/Height         → not needed (Modal fills screen)
 *   anchorRect positioning           → Modal centers panel (anchorRect prop kept for API compat)
 *   DOMRect                          → typed as unknown (no DOM in RN)
 *   document.addEventListener        → removed (Modal backdrop Pressable handles outside tap)
 *   useId() CSS class names          → removed (no CSS classes in RN)
 *   onMouseEnter / onMouseLeave      → onPressIn / onPressOut
 *   div / span / button / input      → View / Text / Pressable / TextInput
 *   HTML <input> ref focus           → TextInput ref .focus()
 *
 * Library integration (reanimated-color-picker@5.1.2):
 *   ColorPicker — context wrapper for the OpacitySlider
 *   OpacitySlider — animated alpha slider (replaces custom CSS range input)
 *   key={hex6} on ColorPicker — forces re-init when color changes from grid
 *   onChangeJS — regular JS callback (not worklet) for alpha extraction
 *   sliderThickness={14} — matches web's slider track height:14
 *   thumbSize={18} — matches web's 18px thumb
 *   thumbShape="circle" + thumbColor="#ffffff" — matches web's white circle thumb
 *
 * Business logic preserved verbatim:
 *   parseHexColor     — pure function, unchanged
 *   toH2              — pure helper, unchanged
 *   hexWithAlpha      — pure helper, unchanged
 *   hex6FromValue     — parses hex + rgb/rgba strings, unchanged
 *   alphaFromValue    — parses rgba alpha + 8-digit hex alpha, unchanged
 *   TV_GRID           — 10×8 TradingView-style color grid, unchanged
 *   RECENTS_KEY       — "tj_recent_colors_v1" (same key as web)
 *   DEFAULT_RECENTS   — same 8 default colors
 *   pushRecent        — normalized uppercase, max 8 slots, unchanged
 *   hex6 / alpha state — same two-field color model
 *   hexIn state        — hex text input value
 *   showHexInput state — toggle hex input visibility on % click
 *   pickColor()        — sets hex6, hexIn, alpha=1, pushes recent, emits
 *   addCurrentToRecents() — pushes current hex6 to recents
 *   applyHexInput()    — validates 6-char hex and emits
 *   emit()             — calls onChange(hexWithAlpha(h6, a))
 *   currentHex         — hexWithAlpha(hex6, alpha)
 *   SWATCH_SIZE=22, SWATCH_GAP=3 — grid cell dimensions preserved
 *
 * Exported API preserved verbatim:
 *   parseHexColor       — named export (pure function, unchanged)
 *   ColorPickerGlassProps — interface (anchorRect typed to unknown for RN compat)
 *   ColorPickerGlass    — named + default export (memo component)
 *
 * Explicitly NOT implemented:
 *   ❌ Color history UI redesign
 *   ❌ Saved palettes
 *   ❌ Eye-dropper
 *   ❌ Gradient editor
 *   ❌ Business logic changes
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import ColorPicker, {
  OpacitySlider,
  type ColorFormatsObject,
} from "reanimated-color-picker";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — preserved verbatim from source (pure functions, no browser APIs)
// ─────────────────────────────────────────────────────────────────────────────

export function parseHexColor(hex: string): { r: number; g: number; b: number; a: number } {
  let h = (hex || "#000000").replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  let a = 1;
  if (h.length === 8) { a = parseInt(h.slice(6, 8), 16) / 255; h = h.slice(0, 6); }
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
    a,
  };
}

function toH2(n: number) {
  return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0").toUpperCase();
}

function hexWithAlpha(hex6: string, alpha: number): string {
  const base = hex6.replace("#", "").slice(0, 6).padEnd(6, "0");
  if (alpha >= 0.999) return `#${base}`;
  return `#${base}${toH2(alpha * 255)}`;
}

function hex6FromValue(val: string): string {
  const v = (val || "#FF9800").trim();
  // Parse rgba() / rgb() strings
  const rgba = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgba) return (toH2(+rgba[1]) + toH2(+rgba[2]) + toH2(+rgba[3])).toUpperCase();
  // Hex
  const h = v.replace("#", "");
  return (h.length >= 6 ? h.slice(0, 6) : h.padEnd(6, "0")).toUpperCase();
}

function alphaFromValue(val: string): number {
  const v = (val || "").trim();
  // Parse rgba() alpha channel
  const rgba = v.match(/rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/i);
  if (rgba) return Math.max(0, Math.min(1, parseFloat(rgba[1])));
  // 8-digit hex alpha
  const h = v.replace("#", "");
  if (h.length === 8) return parseInt(h.slice(6, 8), 16) / 255;
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// TradingView-style 10×8 color grid — preserved verbatim from source
// ─────────────────────────────────────────────────────────────────────────────

const TV_GRID: string[][] = [
  // Row 1 — Grays
  ["#ffffff","#d6d6d6","#b3b3b3","#8c8c8c","#696969","#494949","#313131","#1e1e1e","#111111","#000000"],
  // Row 2 — Vivid
  ["#f44336","#ff9800","#ffc107","#4caf50","#26a69a","#29b6f6","#2196f3","#9c27b0","#e91e63","#ff5722"],
  // Row 3 — Pastel light
  ["#ffcdd2","#ffe0b2","#fff9c4","#c8e6c9","#b2dfdb","#b3e5fc","#bbdefb","#e1bee7","#fce4ec","#fbe9e7"],
  // Row 4 — Light
  ["#ef9a9a","#ffcc80","#fff59d","#a5d6a7","#80cbc4","#81d4fa","#90caf9","#ce93d8","#f48fb1","#ffab91"],
  // Row 5 — Medium-light
  ["#e57373","#ffa726","#ffee58","#66bb6a","#4db6ac","#4fc3f7","#64b5f6","#ba68c8","#f06292","#ff8a65"],
  // Row 6 — Medium-dark
  ["#e53935","#fb8c00","#fdd835","#43a047","#00897b","#039be5","#1e88e5","#8e24aa","#d81b60","#f4511e"],
  // Row 7 — Dark
  ["#c62828","#e65100","#f9a825","#2e7d32","#00695c","#0277bd","#1565c0","#6a1b9a","#ad1457","#bf360c"],
  // Row 8 — Very dark
  ["#7f0000","#6d3200","#827717","#1b5e20","#004d40","#01427a","#0d47a1","#4a148c","#880e4f","#7c2d12"],
];

// ─────────────────────────────────────────────────────────────────────────────
// Recent colors persistence — AsyncStorage replaces localStorage
// Same key "tj_recent_colors_v1" preserved for data continuity.
// ─────────────────────────────────────────────────────────────────────────────

const RECENTS_KEY     = "tj_recent_colors_v1";
const DEFAULT_RECENTS = ["#1A237E","#FFEB3B","#558B2F","#9ACD32","#EF4444","#22C55E","#AB47BC","#000000"];

// saveRecents — fire-and-forget (AsyncStorage replaces localStorage.setItem)
function saveRecents(list: string[]): void {
  AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(list)).catch(() => {});
}

// pushRecent — preserved verbatim from source (normalize → dedup → slice 8)
function pushRecent(list: string[], color: string): string[] {
  const c        = "#" + color.replace("#", "").toUpperCase();
  const filtered = list.filter(x => x.toUpperCase() !== c.toUpperCase());
  const next     = [c, ...filtered].slice(0, 8);
  saveRecents(next);
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// Props — exported interface
// anchorRect: DOMRect → unknown (DOMRect doesn't exist in RN; kept for API compat)
// ─────────────────────────────────────────────────────────────────────────────

interface ColorPickerGlassProps {
  value:       string;
  onChange:    (v: string) => void;
  onClose:     () => void;
  /** Accepted for API compatibility; unused — Modal positions itself. */
  anchorRect?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants — preserved from source
// ─────────────────────────────────────────────────────────────────────────────

const SWATCH_SIZE = 22;
const SWATCH_GAP  = 3;

// Panel width: match web's W=272; clamp to screen width with padding
const SCREEN_W  = Dimensions.get("window").width;
const PANEL_W   = Math.min(272, SCREEN_W - 32);

// ─────────────────────────────────────────────────────────────────────────────
// ColorSwatchRow — sub-component (one row of the TV_GRID)
// Replaces the inner <div key={ri}> with a View + map of Pressable swatches.
// onMouseEnter/Leave scale → onPressIn/Out (no hover in RN).
// ─────────────────────────────────────────────────────────────────────────────

interface SwatchProps {
  color:      string;
  isSelected: boolean;
  onPick:     (c: string) => void;
}

const Swatch = memo(function Swatch({ color, isSelected, onPick }: SwatchProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => onPick(color)}
      style={[
        styles.swatch,
        { backgroundColor: color },
        isSelected && styles.swatchSelected,
        isSelected && { borderColor: "#ffffff", shadowColor: color } as object,
        pressed     && styles.swatchPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={color}
    />
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ColorPickerGlass — main component
// ─────────────────────────────────────────────────────────────────────────────

export const ColorPickerGlass = memo(function ColorPickerGlass({
  value, onChange, onClose,
}: ColorPickerGlassProps) {
  const hexInputRef = useRef<TextInput>(null);

  // ── State — preserved verbatim from source ────────────────────────────────
  const [hex6,         setHex6]         = useState(() => hex6FromValue(value));
  const [alpha,        setAlpha]        = useState(() => alphaFromValue(value));
  const [hexIn,        setHexIn]        = useState(() => hex6FromValue(value));
  const [recents,      setRecents]      = useState<string[]>(DEFAULT_RECENTS);
  const [showHexInput, setShowHexInput] = useState(false);

  // Load recents from AsyncStorage on mount (replaces synchronous localStorage.getItem)
  useEffect(() => {
    AsyncStorage.getItem(RECENTS_KEY)
      .then(s => { if (s) setRecents(JSON.parse(s) as string[]); })
      .catch(() => {});
  }, []);

  // Focus hex input when shown (replaces setTimeout + .focus() on HTMLInputElement)
  useEffect(() => {
    if (showHexInput) {
      setTimeout(() => hexInputRef.current?.focus(), 50);
    }
  }, [showHexInput]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const currentHex = hexWithAlpha(hex6, alpha);

  // ── Callbacks — preserved verbatim from source ────────────────────────────

  const emit = useCallback((h6: string, a: number) => {
    onChange(hexWithAlpha(h6, a));
  }, [onChange]);

  const pickColor = useCallback((raw: string) => {
    const h6 = raw.replace("#", "").slice(0, 6).toUpperCase();
    setHex6(h6);
    setHexIn(h6);
    setAlpha(1);
    setRecents(prev => pushRecent(prev, h6));
    emit(h6, 1);
  }, [emit]);

  const addCurrentToRecents = useCallback(() => {
    setRecents(prev => pushRecent(prev, hex6));
  }, [hex6]);

  const applyHexInput = useCallback((raw: string) => {
    const clean = raw.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
    if (clean.length === 6) {
      setHex6(clean.toUpperCase());
      emit(clean.toUpperCase(), alpha);
    }
  }, [alpha, emit]);

  // ── Opacity change — called by OpacitySlider via ColorPicker.onChangeJS ───
  // Extracts alpha from the rgba field; hex6 is not changed (only alpha moves).
  const handleOpacityChange = useCallback((colors: ColorFormatsObject) => {
    const a = alphaFromValue(colors.rgba);
    setAlpha(a);
    emit(hex6, a);
  }, [hex6, emit]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/*
        Backdrop — tapping outside the panel closes the picker.
        Mirrors web's "outside click → close" pointerdown listener.
      */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/*
          Panel — stopPropagation equivalent: inner Pressable absorbs taps
          so they don't bubble to the backdrop and close prematurely.
          Glass styling matches web: rgba(28,32,40,0.98) + blur + border.
        */}
        <Pressable
          style={styles.panel}
          onPress={() => { /* absorb; do not close */ }}
        >

          {/* ── Color grid — TV_GRID 10×8 ─────────────────────────────────── */}
          <View style={styles.grid}>
            {TV_GRID.map((row, ri) => (
              <View key={ri} style={styles.gridRow}>
                {row.map(color => {
                  const c6 = color.replace("#", "").toUpperCase();
                  return (
                    <Swatch
                      key={color}
                      color={color}
                      isSelected={c6 === hex6.toUpperCase()}
                      onPick={pickColor}
                    />
                  );
                })}
              </View>
            ))}
          </View>

          {/* ── Separator ─────────────────────────────────────────────────── */}
          <View style={styles.separator} />

          {/* ── Recent colors ─────────────────────────────────────────────── */}
          <View style={styles.recentsRow}>
            {recents.map((c, i) => {
              const c6 = c.replace("#", "").toUpperCase();
              return (
                <Swatch
                  key={`${c}-${i}`}
                  color={c}
                  isSelected={c6 === hex6.toUpperCase()}
                  onPick={pickColor}
                />
              );
            })}

            {/* + button — add current color to recents */}
            <Pressable
              onPress={addCurrentToRecents}
              style={({ pressed }) => [
                styles.recentAdd,
                pressed && styles.recentAddPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add current color to recents"
            >
              <Text style={styles.recentAddText}>+</Text>
            </Pressable>
          </View>

          {/* ── Separator ─────────────────────────────────────────────────── */}
          <View style={styles.separator} />

          {/* ── Opacity section ───────────────────────────────────────────── */}
          <View style={styles.opacityRow}>
            {/* "Opacity" label — mirrors web's minWidth:50 flex-shrink-0 */}
            <Text style={styles.opacityLabel}>Opacity</Text>

            {/*
              OpacitySlider from reanimated-color-picker.
              Wrapped in ColorPicker context provider.
              key={hex6} forces re-init when color changes from grid tap,
              so the slider thumb repositions to reflect new alpha=1.

              sliderThickness={14} — matches web's height:14 slider track
              thumbSize={18} — matches web's 18px thumb
              thumbShape="circle" + thumbColor="#ffffff" — white circle thumb
              boundedThumb — thumb stays within track edges
            */}
            <View style={styles.opacitySliderWrap}>
              <ColorPicker
                key={hex6}
                value={currentHex}
                onChangeJS={handleOpacityChange}
                sliderThickness={14}
                thumbSize={18}
                thumbShape="circle"
                thumbColor="#ffffff"
                boundedThumb
              >
                <OpacitySlider style={styles.opacitySlider} />
              </ColorPicker>
            </View>

            {/* % button — tap to toggle hex input (mirrors web's % div onClick) */}
            <Pressable
              onPress={() => setShowHexInput(v => !v)}
              style={styles.alphaPctBtn}
              accessibilityRole="button"
              accessibilityLabel={`Opacity ${Math.round(alpha * 100)} percent, tap to enter hex`}
            >
              <Text style={styles.alphaPctText}>
                {Math.round(alpha * 100)}%
              </Text>
            </Pressable>
          </View>

          {/* ── Hex input (shown on % click) ──────────────────────────────── */}
          {showHexInput && (
            <View style={styles.hexRow}>
              {/* Color preview swatch — matches web's 24×24 rounded preview */}
              <View style={[styles.hexPreview, { backgroundColor: `#${hex6}` }]} />

              {/* # prefix + TextInput */}
              <View style={styles.hexInputWrap}>
                <Text style={styles.hexHash}>#</Text>
                <TextInput
                  ref={hexInputRef}
                  value={hexIn}
                  onChangeText={t =>
                    setHexIn(t.toUpperCase().replace(/[^0-9A-F]/g, "").slice(0, 6))
                  }
                  onBlur={() => applyHexInput(hexIn)}
                  onSubmitEditing={() => {
                    applyHexInput(hexIn);
                    setShowHexInput(false);
                  }}
                  maxLength={6}
                  placeholder="FF9800"
                  placeholderTextColor="rgba(200,200,200,0.30)"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  keyboardType="default"
                  returnKeyType="done"
                  style={styles.hexInput}
                  accessibilityLabel="Hex color value"
                />
              </View>
            </View>
          )}

        </Pressable>
      </Pressable>
    </Modal>
  );
});

export default ColorPickerGlass;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Modal backdrop — semi-transparent, closes on tap ─────────────────────
  backdrop: {
    flex:            1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems:      "center",
    justifyContent:  "center",
  },

  // ── Glass panel — mirrors web's rgba(28,32,40,0.98) popup ────────────────
  panel: {
    width:           PANEL_W,
    backgroundColor: "rgba(28,32,40,0.98)",
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.08)",
    padding:         10,
    paddingBottom:   12,
    // Shadow — matches web's boxShadow: "0 8px 40px rgba(0,0,0,0.65)"
    shadowColor:     "#000000",
    shadowOffset:    { width: 0, height: 8 },
    shadowOpacity:   0.65,
    shadowRadius:    20,
    elevation:       20,
  },

  // ── Color grid ────────────────────────────────────────────────────────────
  grid: {
    gap: SWATCH_GAP,
  },
  gridRow: {
    flexDirection: "row",
    gap:           SWATCH_GAP,
  },

  // ── Swatch — matches web's SWATCH_SIZE=22 rounded squares ────────────────
  swatch: {
    width:        SWATCH_SIZE,
    height:       SWATCH_SIZE,
    borderRadius: 5,
    flexShrink:   0,
    borderWidth:  1.5,
    borderColor:  "rgba(255,255,255,0.07)",
  },
  swatchSelected: {
    borderWidth:   2.5,
    // shadowColor set inline per color
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius:  5,
    elevation:     4,
  },
  swatchPressed: {
    transform: [{ scale: 1.18 }],
  },

  // ── Separator — matches web's height:1 rgba(255,255,255,0.08) ────────────
  separator: {
    height:          1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical:  9,
  },

  // ── Recents row — 8 small swatches + "+" button ──────────────────────────
  recentsRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           4,
    marginBottom:  9,
  },
  recentAdd: {
    width:           20,
    height:          20,
    borderRadius:    4,
    flexShrink:      0,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth:     1.5,
    borderColor:     "rgba(255,255,255,0.12)",
    alignItems:      "center",
    justifyContent:  "center",
  },
  recentAddPressed: {
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  recentAddText: {
    fontSize:   15,
    lineHeight: 17,
    color:      "rgba(255,255,255,0.6)",
    fontWeight: "600",
  },

  // ── Opacity row — label + slider + % button ───────────────────────────────
  opacityRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           10,
  },
  opacityLabel: {
    fontSize:   12,
    color:      "rgba(200,205,215,0.65)",
    fontWeight: "500",
    flexShrink: 0,
    minWidth:   50,
  },
  opacitySliderWrap: {
    flex:           1,
    justifyContent: "center",
  },
  opacitySlider: {
    // OpacitySlider fills the wrapper; thickness controlled via ColorPicker.sliderThickness
    borderRadius: 999,
  },
  alphaPctBtn: {
    flexShrink:      0,
    minWidth:        46,
    height:          28,
    borderRadius:    6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.10)",
    alignItems:      "center",
    justifyContent:  "center",
    paddingHorizontal: 6,
  },
  alphaPctText: {
    fontSize:    12,
    color:       "rgba(220,225,235,0.9)",
    fontFamily:  "monospace",
    fontWeight:  "600",
  },

  // ── Hex input (shown on % click) ──────────────────────────────────────────
  hexRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
    marginTop:     10,
  },
  hexPreview: {
    width:        24,
    height:       24,
    borderRadius: 5,
    flexShrink:   0,
    borderWidth:  1,
    borderColor:  "rgba(255,255,255,0.15)",
  },
  hexInputWrap: {
    flex:           1,
    position:       "relative",
    flexDirection:  "row",
    alignItems:     "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth:    1,
    borderColor:    "rgba(255,255,255,0.14)",
    borderRadius:   6,
    height:         30,
    paddingLeft:    6,
  },
  hexHash: {
    fontSize:    11,
    color:       "rgba(200,200,200,0.35)",
    fontFamily:  "monospace",
    flexShrink:  0,
    paddingRight: 2,
  },
  hexInput: {
    flex:       1,
    fontSize:   12,
    color:      "#f0f4f8",
    fontFamily: "monospace",
    fontWeight: "600",
    height:     30,
    padding:    0,
  },
});
