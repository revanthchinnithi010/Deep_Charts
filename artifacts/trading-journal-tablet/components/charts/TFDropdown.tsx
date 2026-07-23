/**
 * TFDropdown.tsx — React Native port (Phase 9.23 Pass A)
 *
 * Migrated from src/components/charts/TFDropdown.tsx
 *
 * Web → RN changes (Pass A):
 *   createPortal (DOM portal)        → Modal (RN modal layer)
 *   getBoundingClientRect()          → ref.measure() (async, native layout query)
 *   window.innerWidth/Height         → Dimensions.get("window")
 *   document.addEventListener        → Modal backdrop Pressable (outside-tap dismiss)
 *   window.addEventListener resize   → removed (Modal re-measures on open)
 *   <input type="text">              → TextInput
 *   onKeyDown (Enter / Escape)       → onSubmitEditing + cancel Pressable
 *   motion / AnimatePresence         → removed (plain View; animation deferred)
 *   AnimatedList / AnimatedListItem  → plain View wrappers
 *   <button>                         → Pressable
 *   onMouseEnter/Leave hover         → removed (no hover on touch)
 *   cursor / userSelect              → removed
 *   scrollbarWidth / scrollbarColor  → ScrollView (no custom scrollbar in RN)
 *   React.MouseEvent in SmallBtn     → GestureResponderEvent (internal only)
 *
 * Exports (unchanged):
 *   tfLabel   (function)
 *   sortTFs   (function)
 *   TFDropdown (function)
 */

import { useState, useRef, useEffect, useCallback, memo } from "react";
import {
  View, Text, Pressable, ScrollView, TextInput,
  Modal, StyleSheet, Dimensions, TouchableWithoutFeedback,
} from "react-native";
import type { GestureResponderEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";

// ── Label helpers ─────────────────────────────────────────────────────────────
export function tfLabel(value: string): string {
  const MAP: Record<string, string> = {
    "1":"1m","2":"2m","3":"3m","5":"5m","10":"10m","12":"12m",
    "15":"15m","20":"20m","30":"30m","45":"45m",
    "60":"1H","90":"90m","120":"2H","180":"3H","240":"4H",
    "360":"6H","480":"8H","720":"12H",
    "D":"1D","W":"1W","M":"1M",
  };
  return MAP[value] ?? value;
}

function parseCustom(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(\d+)\s*(s|m|h|d|w)?$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n <= 0) return null;
  const unit = (m[2] ?? "m").toLowerCase();
  if (unit === "s") return null;
  if (unit === "m") return String(n);
  if (unit === "h") return n === 1 ? "60" : String(n * 60);
  if (unit === "d") return n === 1 ? "D" : String(n * 1440);
  if (unit === "w") return n === 1 ? "W" : String(n * 10080);
  return null;
}

interface TFItem    { label: string; value: string }
interface TFSection { title: string; items: TFItem[] }

const ALL_SECTIONS: TFSection[] = [
  {
    title: "MINUTES",
    items: [
      { label: "1 minute",   value: "1"  },
      { label: "2 minutes",  value: "2"  },
      { label: "3 minutes",  value: "3"  },
      { label: "5 minutes",  value: "5"  },
      { label: "10 minutes", value: "10" },
      { label: "15 minutes", value: "15" },
      { label: "30 minutes", value: "30" },
      { label: "45 minutes", value: "45" },
    ],
  },
  {
    title: "HOURS",
    items: [
      { label: "1 hour",  value: "60"  },
      { label: "2 hours", value: "120" },
      { label: "3 hours", value: "180" },
      { label: "4 hours", value: "240" },
    ],
  },
  {
    title: "DAYS",
    items: [{ label: "1 day", value: "D" }],
  },
  {
    title: "WEEKS",
    items: [{ label: "1 week", value: "W" }],
  },
];

const ALL_VALUES = new Set(ALL_SECTIONS.flatMap(s => s.items.map(i => i.value)));

// ── Canonical timeframe sort order ────────────────────────────────────────────
const TF_ORDER: Record<string, number> = {
  "1":1,"2":2,"3":3,"5":4,"10":5,"12":6,
  "15":7,"20":8,"30":9,"45":10,
  "60":11,"90":12,"120":13,"180":14,"240":15,
  "360":16,"480":17,"720":18,
  "D":19,"W":20,"M":21,
};

export function sortTFs(favs: string[]): string[] {
  return [...new Set(favs)].sort((a, b) => (TF_ORDER[a] ?? 999) - (TF_ORDER[b] ?? 999));
}

// ── SmallBtn ─────────────────────────────────────────────────────────────────
function SmallBtn({ onPress, children, active = false }: {
  onPress: (e: GestureResponderEvent) => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={[ss.smallBtn, active && ss.smallBtnActive]}
    >
      {children}
    </Pressable>
  );
}

// ── TFDropdown ────────────────────────────────────────────────────────────────
export function TFDropdown({
  interval,
  favorites,
  onSelect,
  onFavoritesChange,
}: {
  interval:          string;
  favorites:         string[];
  onSelect:          (v: string) => void;
  onFavoritesChange: (favs: string[]) => void;
}) {
  const [open,       setOpen]       = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customVal,  setCustomVal]  = useState("");
  const [customErr,  setCustomErr]  = useState(false);
  const [panelPos,   setPanelPos]   = useState<{ top: number; left: number }>({ top: 60, left: 4 });

  const triggerRef = useRef<View>(null);
  const inputRef   = useRef<TextInput>(null);

  const close = useCallback(() => {
    setOpen(false);
    setCustomMode(false);
    setCustomVal("");
    setCustomErr(false);
  }, []);

  const openDropdown = useCallback(() => {
    if (open) { close(); return; }
    // Measure trigger position to place panel below it
    triggerRef.current?.measure((_x, _y, _w, h, pageX, pageY) => {
      const PANEL_W = 224;
      const { width: screenW } = Dimensions.get("window");
      const left = Math.max(4, Math.min(pageX, screenW - PANEL_W - 8));
      setPanelPos({ top: pageY + h + 6, left });
    });
    setOpen(true);
  }, [open, close]);

  useEffect(() => {
    if (customMode) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [customMode]);

  const toggleFav = useCallback((value: string, e: GestureResponderEvent) => {
    e.stopPropagation();
    const next = favorites.includes(value)
      ? favorites.filter(f => f !== value)
      : sortTFs([...favorites, value]);
    onFavoritesChange(next);
  }, [favorites, onFavoritesChange]);

  const selectAndClose = useCallback((v: string) => {
    onSelect(v);
    close();
  }, [onSelect, close]);

  const submitCustom = useCallback(() => {
    const parsed = parseCustom(customVal);
    if (!parsed) { setCustomErr(true); return; }
    if (!favorites.includes(parsed)) onFavoritesChange(sortTFs([...favorites, parsed]));
    selectAndClose(parsed);
  }, [customVal, favorites, onFavoritesChange, selectAndClose]);

  const { width: screenW, height: screenH } = Dimensions.get("window");

  return (
    <View style={ss.root}>
      {/* Trigger button */}
      <Pressable
        ref={triggerRef}
        onPress={openDropdown}
        style={[ss.trigger, open && ss.triggerOpen]}
      >
        <Ionicons
          name="chevron-down"
          size={11}
          color={open ? "#B7FF5A" : "rgba(211,222,218,0.65)"}
          style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
        />
      </Pressable>

      {/* Panel modal */}
      <Modal
        visible={open}
        transparent
        animationType="none"
        onRequestClose={close}
        statusBarTranslucent
      >
        {/* Full-screen backdrop */}
        <TouchableWithoutFeedback onPress={close}>
          <View style={[ss.backdrop, { width: screenW, height: screenH }]} />
        </TouchableWithoutFeedback>

        {/* Dropdown panel */}
        <View style={[ss.panel, { top: panelPos.top, left: panelPos.left }]}>

          {/* Custom interval row */}
          <View style={ss.customRow}>
            {customMode ? (
              <View style={ss.customInputRow}>
                <TextInput
                  ref={inputRef}
                  value={customVal}
                  onChangeText={t => { setCustomVal(t); setCustomErr(false); }}
                  onSubmitEditing={submitCustom}
                  returnKeyType="done"
                  placeholder="2m, 4h, 1D…"
                  placeholderTextColor="rgba(167,184,169,0.35)"
                  style={[
                    ss.customInput,
                    customErr && ss.customInputErr,
                  ]}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable onPress={submitCustom} style={ss.customSubmit}>
                  <Ionicons name="checkmark" size={13} color="#0F1618" />
                </Pressable>
                <SmallBtn onPress={() => { setCustomMode(false); setCustomVal(""); setCustomErr(false); }}>
                  <Ionicons name="close" size={13} color="rgba(167,184,169,0.6)" />
                </SmallBtn>
              </View>
            ) : (
              <Pressable
                onPress={() => setCustomMode(true)}
                style={ss.addCustomBtn}
              >
                <Ionicons name="add" size={13} color="rgba(183,255,90,0.65)" />
                <Text style={ss.addCustomLabel}>Add custom interval…</Text>
              </Pressable>
            )}
          </View>

          {/* Scrollable sections */}
          <ScrollView
            style={ss.sectionsScroll}
            showsVerticalScrollIndicator={false}
          >
            {ALL_SECTIONS.map(section => (
              <View key={section.title}>
                <Text style={ss.sectionTitle}>{section.title}</Text>
                {section.items.map(item => (
                  <TFRow
                    key={item.value}
                    item={item}
                    isActive={item.value === interval}
                    isFav={favorites.includes(item.value)}
                    onSelect={selectAndClose}
                    onToggleFav={toggleFav}
                  />
                ))}
              </View>
            ))}

            {/* Custom timeframes (in favorites but not in ALL_VALUES) */}
            {favorites.filter(f => !ALL_VALUES.has(f)).length > 0 && (
              <View>
                <Text style={ss.sectionTitle}>CUSTOM</Text>
                {favorites
                  .filter(f => !ALL_VALUES.has(f))
                  .map(f => (
                    <TFRow
                      key={f}
                      item={{ label: tfLabel(f), value: f }}
                      isActive={f === interval}
                      isFav={true}
                      onSelect={selectAndClose}
                      onToggleFav={toggleFav}
                    />
                  ))}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── TFRow ─────────────────────────────────────────────────────────────────────
const TFRow = memo(function TFRow({
  item, isActive, isFav, onSelect, onToggleFav,
}: {
  item:        TFItem;
  isActive:    boolean;
  isFav:       boolean;
  onSelect:    (v: string) => void;
  onToggleFav: (v: string, e: GestureResponderEvent) => void;
}) {
  return (
    <Pressable
      onPress={() => onSelect(item.value)}
      style={({ pressed }) => [
        ss.tfRow,
        isActive  && ss.tfRowActive,
        pressed   && !isActive && ss.tfRowPressed,
      ]}
    >
      <Text style={[ss.tfRowLabel, isActive && ss.tfRowLabelActive]}>
        {item.label}
      </Text>
      <SmallBtn
        onPress={e => onToggleFav(item.value, e)}
        active={isFav}
      >
        <Ionicons
          name={isFav ? "star" : "star-outline"}
          size={12}
          color={isFav ? "#B7FF5A" : "rgba(167,184,169,0.35)"}
        />
      </SmallBtn>
    </Pressable>
  );
});

// ── Styles ────────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  root: {
    position: "relative",
    flexShrink: 0,
  },
  trigger: {
    width: 22,
    height: 26,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(211,222,218,0.10)",
    backgroundColor: "transparent",
  },
  triggerOpen: {
    backgroundColor: "rgba(183,255,90,0.10)",
    borderColor: "rgba(183,255,90,0.28)",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  panel: {
    position: "absolute",
    width: 224,
    backgroundColor: "rgba(9,22,16,0.99)",
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.15)",
    borderRadius: 10,
    overflow: "hidden",
    zIndex: 9999,
    elevation: 20,
  },
  customRow: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  customInputRow: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
  },
  customInput: {
    flex: 1,
    height: 28,
    borderRadius: 5,
    fontSize: 11,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.25)",
    color: "#E8F0E8",
    paddingHorizontal: 8,
    fontFamily: "monospace",
  },
  customInputErr: {
    borderColor: "rgba(239,68,68,0.6)",
    color: "#f87171",
  },
  customSubmit: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 5,
    backgroundColor: "#B7FF5A",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  addCustomBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  addCustomLabel: {
    color: "rgba(183,255,90,0.65)",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  sectionsScroll: {
    maxHeight: 360,
  },
  sectionTitle: {
    paddingTop: 9,
    paddingHorizontal: 12,
    paddingBottom: 3,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.0,
    color: "rgba(167,184,169,0.38)",
  },
  tfRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 12,
    paddingRight: 10,
    height: 32,
  },
  tfRowActive: {
    backgroundColor: "rgba(183,255,90,0.10)",
  },
  tfRowPressed: {
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  tfRowLabel: {
    fontSize: 12,
    fontWeight: "400",
    color: "rgba(211,222,218,0.85)",
  },
  tfRowLabelActive: {
    fontWeight: "700",
    color: "#B7FF5A",
  },
  smallBtn: {
    padding: 3,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  smallBtnActive: {
    backgroundColor: "rgba(183,255,90,0.15)",
  },
});

export default TFDropdown;
