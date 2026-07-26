/**
 * DrawingAlertModal.tsx — React Native port (Phase 10.2 Pass A)
 *
 * Migrated from src/components/charts/DrawingAlertModal.tsx
 *
 * Web → RN changes:
 *   framer-motion (motion.div/button, AnimatePresence) → View/Pressable + conditional rendering
 *   className (Tailwind)                → StyleSheet
 *   <input type="date">                 → TextInput with placeholder "YYYY-MM-DD"
 *   <input type="number">               → TextInput keyboardType="decimal-pad"/"numeric"
 *   <textarea>                          → TextInput multiline
 *   <button>                            → Pressable
 *   <div>/<p>/<span>                    → View/Text
 *   usePersisted localStorage           → usePersisted with AsyncStorage
 *   backdrop-filter blur                → rgba background only (not supported in RN)
 *   overflow-y:auto scrollable body     → ScrollView
 *   CSS animate-spin spinner            → ActivityIndicator
 *   onFocus/onBlur parentElement style  → local focused state
 *   scrollbarWidth / MozAppearance      → removed
 *   relative fetch URLs                 → getApiBase() + path
 *   Toggle motion.div thumb             → Animated.Value
 *   Lucide icons                        → Ionicons (@expo/vector-icons)
 *   KeyboardAvoidingView                → KeyboardAvoidingView + Platform
 *
 * Exports (unchanged):
 *   DrawingType (type)
 *   DrawingAlertRow (interface)
 *   DrawingAlertModal (named export)
 */

import { useState, useEffect, useCallback, useRef, memo } from "react";
import {
  View, Text, Pressable, TextInput, ScrollView,
  Modal, StyleSheet, Animated, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from "react-native";
import {
  TrendingUp, ArrowRight, Minus, Square, LayoutGrid,
  ChevronUp, ChevronDown, X, Clock, AlertTriangle, Check,
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Drawing } from "@/types/drawing";
import { useAlertStore } from "@/store/alertStore";
import type { TrendlineAlert } from "@/data/alertsData";
import { getApiBase } from "@/lib/apiBase";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DrawingType = "trendline" | "ray" | "horizontal_line" | "rectangle" | "channel";

export interface DrawingAlertRow {
  id: number;
  symbol: string;
  timeframe: string;
  drawingType: string;
  condition: string;
  alertStatus: string;
  point1Price: number;
  point1Time: string;
  point2Price: number;
  point2Time: string;
  notes: string | null;
  telegramEnabled: boolean;
  isActive: boolean;
  isTriggered: boolean;
  triggeredAt: string | null;
  triggeredPrice: number | null;
  cooldownUntil: string | null;
  createdAt: string;
}

// ── Config ────────────────────────────────────────────────────────────────────

type LucideIcon = React.ComponentType<{ size: number; color: string }>;
const DRAWING_OPTIONS: { value: DrawingType; label: string; Icon?: LucideIcon }[] = [
  { value: "trendline",       label: "Trendline", Icon: TrendingUp   },
  { value: "ray",             label: "Ray",        Icon: ArrowRight   },
  { value: "horizontal_line", label: "H. Line",    Icon: Minus        },
  { value: "rectangle",       label: "Zone",       Icon: Square       },
  { value: "channel",         label: "Channel",    Icon: LayoutGrid   },
];

const CONDITIONS: Record<DrawingType, { value: string; label: string }[]> = {
  trendline:       [
    { value: "cross_above", label: "Cross ↑" },
    { value: "cross_below", label: "Cross ↓" },
    { value: "touch",       label: "Touch" },
    { value: "breakout",    label: "Breakout" },
  ],
  ray:             [
    { value: "cross_above", label: "Cross ↑" },
    { value: "cross_below", label: "Cross ↓" },
    { value: "touch",       label: "Touch" },
    { value: "breakout",    label: "Breakout" },
  ],
  horizontal_line: [
    { value: "above_price", label: "Above" },
    { value: "below_price", label: "Below" },
    { value: "touch_price", label: "Touch" },
  ],
  rectangle:       [
    { value: "enter_zone",  label: "Enter" },
    { value: "exit_zone",   label: "Exit" },
    { value: "breakout",    label: "Break" },
    { value: "rejection",   label: "Reject" },
  ],
  channel:         [
    { value: "cross_above", label: "Cross ↑" },
    { value: "cross_below", label: "Cross ↓" },
    { value: "touch",       label: "Touch" },
    { value: "breakout",    label: "Breakout" },
  ],
};

const TIMEFRAMES = ["1m","5m","15m","30m","1H","4H","1D","1W"];

// ── UTC helpers ───────────────────────────────────────────────────────────────

/** Returns { dateStr:"YYYY-MM-DD", hh:"HH", mm:"MM" } in UTC for given ms */
function msToUtcParts(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    dateStr: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    hh: pad(d.getUTCHours()),
    mm: pad(d.getUTCMinutes()),
  };
}

/** Combine dateStr + hh + mm → UTC ISO string */
function partsToISO(dateStr: string, hh: string, mm: string): string | null {
  if (!dateStr || hh === "" || mm === "") return null;
  const iso = `${dateStr}T${hh.padStart(2,"0")}:${mm.padStart(2,"0")}:00Z`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Parse existing ISO → parts */
function isoToParts(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    dateStr: `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`,
    hh: pad(d.getUTCHours()),
    mm: pad(d.getUTCMinutes()),
  };
}

// ── Custom 24h DateTime Picker ────────────────────────────────────────────────

interface DTState { dateStr: string; hh: string; mm: string }

interface DateTimePickerProps {
  label: string;
  value: DTState;
  onChange: (v: DTState) => void;
  presets?: { label: string; offsetMs: number }[];
  error?: boolean;
}

const DATE_TIME_PRESETS = [
  { label: "Now",  offsetMs: 0 },
  { label: "+5m",  offsetMs: 5 * 60_000 },
  { label: "+15m", offsetMs: 15 * 60_000 },
  { label: "+1H",  offsetMs: 60 * 60_000 },
];

const DateTimePicker = memo(function DateTimePicker({ label, value, onChange, error }: DateTimePickerProps) {
  const hhRef = useRef<TextInput>(null);
  const mmRef = useRef<TextInput>(null);
  const [dateFocused, setDateFocused] = useState(false);
  const [hhFocused,   setHhFocused]   = useState(false);
  const [mmFocused,   setMmFocused]   = useState(false);

  const applyPreset = useCallback((offsetMs: number) => {
    const parts = msToUtcParts(Date.now() + offsetMs);
    onChange(parts);
  }, [onChange]);

  const setHH = useCallback((raw: string) => {
    const n = parseInt(raw, 10);
    if (raw === "") { onChange({ ...value, hh: "" }); return; }
    if (isNaN(n) || n < 0 || n > 23) return;
    const hh = String(n).padStart(2, "0");
    onChange({ ...value, hh });
    if (raw.length >= 2) mmRef.current?.focus();
  }, [value, onChange]);

  const setMM = useCallback((raw: string) => {
    const n = parseInt(raw, 10);
    if (raw === "") { onChange({ ...value, mm: "" }); return; }
    if (isNaN(n) || n < 0 || n > 59) return;
    onChange({ ...value, mm: String(n).padStart(2, "0") });
  }, [value, onChange]);

  const borderColor = error ? "rgba(239,68,68,0.5)" : "rgba(57,91,67,0.4)";
  const focusedBorderColor = "rgba(183,255,90,0.6)";

  return (
    <View style={{ gap: 8 }}>
      <Text style={s.sectionLabel}>{label}</Text>

      {/* Preset chips */}
      <View style={s.presetRow}>
        {DATE_TIME_PRESETS.map(p => (
          <Pressable
            key={p.label}
            onPress={() => applyPreset(p.offsetMs)}
            style={({ pressed }) => [s.presetChip, pressed && s.presetChipPressed]}
          >
            <Text style={s.presetChipText}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Date + Time row */}
      <View style={s.dtRow}>
        {/* Date input — YYYY-MM-DD */}
        <TextInput
          value={value.dateStr}
          onChangeText={v => onChange({ ...value, dateStr: v })}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="rgba(167,184,169,0.35)"
          keyboardType="numbers-and-punctuation"
          style={[s.dtDateInput, {
            borderColor: dateFocused ? focusedBorderColor : borderColor,
          }]}
          onFocus={() => setDateFocused(true)}
          onBlur={() => setDateFocused(false)}
        />

        {/* HH:MM time */}
        <View style={[s.dtTimeBox, {
          borderColor: (hhFocused || mmFocused) ? focusedBorderColor : borderColor,
        }]}>
          <TextInput
            ref={hhRef}
            value={value.hh}
            onChangeText={setHH}
            placeholder="HH"
            placeholderTextColor="rgba(167,184,169,0.35)"
            keyboardType="number-pad"
            maxLength={2}
            style={[s.dtTimeInput, { color: value.hh ? "#B7FF5A" : "rgba(167,184,169,0.35)" }]}
            onFocus={() => setHhFocused(true)}
            onBlur={() => setHhFocused(false)}
          />
          <Text style={s.dtColon}>:</Text>
          <TextInput
            ref={mmRef}
            value={value.mm}
            onChangeText={setMM}
            placeholder="MM"
            placeholderTextColor="rgba(167,184,169,0.35)"
            keyboardType="number-pad"
            maxLength={2}
            style={[s.dtTimeInput, { color: value.mm ? "#B7FF5A" : "rgba(167,184,169,0.35)" }]}
            onFocus={() => setMmFocused(true)}
            onBlur={() => setMmFocused(false)}
          />
          <Text style={s.dtUtc}>UTC</Text>
        </View>
      </View>

      {/* Formatted preview */}
      {value.dateStr !== "" && value.hh !== "" && value.mm !== "" && (
        <Text style={s.dtPreview}>
          {value.dateStr} {String(value.hh).padStart(2,"0")}:{String(value.mm).padStart(2,"0")} UTC
        </Text>
      )}
    </View>
  );
});

// ── Number Stepper ────────────────────────────────────────────────────────────

function NumberStepper({
  label, value, onChange, min = 0, step = 1, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  min?: number; step?: number; placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);

  const inc = () => {
    const n = parseFloat(value) || 0;
    onChange(String(Math.round((n + step) * 1e6) / 1e6));
  };
  const dec = () => {
    const n = parseFloat(value) || 0;
    const next = Math.round((n - step) * 1e6) / 1e6;
    if (next < min) return;
    onChange(String(next));
  };

  return (
    <View style={{ gap: 6 }}>
      <Text style={s.sectionLabel}>{label}</Text>
      <View style={[s.stepper, focused && s.stepperFocused]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="rgba(167,184,169,0.35)"
          keyboardType="decimal-pad"
          style={s.stepperInput}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <View style={s.stepperBtns}>
          <Pressable onPress={inc} style={s.stepperBtn}>
            <ChevronUp size={12} color="rgba(167,184,169,0.5)" />
          </Pressable>
          <View style={s.stepperDivider} />
          <Pressable onPress={dec} style={s.stepperBtn}>
            <ChevronDown size={12} color="rgba(167,184,169,0.5)" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ── Pill Selector ─────────────────────────────────────────────────────────────

function PillSelector<T extends string>({
  label, options, value, onChange, accent = "#B7FF5A",
}: {
  label: string;
  options: { value: T; label: string; Icon?: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
  accent?: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.sectionLabel}>{label}</Text>
      <View style={s.pillRow}>
        {options.map(opt => {
          const active = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={({ pressed }) => [
                s.pill,
                {
                  backgroundColor: active ? `${accent}18` : "rgba(13,28,22,0.8)",
                  borderColor:     active ? `${accent}55` : "rgba(57,91,67,0.35)",
                },
                pressed && s.pillPressed,
              ]}
            >
              {opt.Icon && (
                <opt.Icon size={12} color={active ? accent : "rgba(167,184,169,0.65)"} />
              )}
              <Text style={[s.pillText, { color: active ? accent : "rgba(167,184,169,0.65)" }]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const anim = useRef(new Animated.Value(checked ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: checked ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [checked, anim]);

  const left = anim.interpolate({ inputRange: [0, 1], outputRange: [4, 24] });

  return (
    <Pressable
      onPress={() => onChange(!checked)}
      style={[s.toggle, checked && s.toggleOn]}
    >
      <Animated.View style={[s.toggleThumb, { left }]} />
    </Pressable>
  );
}

// ── Live UTC clock ────────────────────────────────────────────────────────────

function useUtcClock() {
  const [parts, setParts] = useState(() => msToUtcParts(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setParts(msToUtcParts(Date.now())), 15_000);
    return () => clearInterval(id);
  }, []);
  return parts;
}

// ── AsyncStorage persistence (replaces localStorage usePersisted) ─────────────

function usePersisted<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [state, setState] = useState<T>(fallback);

  useEffect(() => {
    AsyncStorage.getItem(key)
      .then(raw => {
        if (raw !== null) {
          try { setState(JSON.parse(raw) as T); } catch { /* ignore */ }
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only run once on mount; key is a stable string literal

  const set = useCallback((v: T) => {
    setState(v);
    AsyncStorage.setItem(key, JSON.stringify(v)).catch(() => {});
  }, [key]);

  return [state, set];
}

// ── toolType → DrawingType helper ─────────────────────────────────────────────

function toolTypeToDrawingType(toolType: string): DrawingType {
  const map: Record<string, DrawingType> = {
    trendline:  "trendline",
    ray:        "ray",
    hline:      "horizontal_line",
    rect:       "rectangle",
    channel:    "channel",
    extended:   "trendline",
  };
  return map[toolType] ?? "trendline";
}

// ── Main Modal ────────────────────────────────────────────────────────────────

const EMPTY_DT: DTState = { dateStr: "", hh: "", mm: "" };

interface Props {
  symbol: string;
  currentInterval: string;
  currentPrice: number | null;
  onClose: () => void;
  onCreated: () => void;
  editItem?: DrawingAlertRow | null;
  prefillDrawing?: Drawing;
}

export function DrawingAlertModal({
  symbol, currentInterval, currentPrice, onClose, onCreated, editItem, prefillDrawing,
}: Props) {
  const utcClock = useUtcClock();

  // ── Persisted preferences ───────────────────────────────────────────────────
  const defaultTF = editItem?.timeframe
    ?? (() => {
      const map: Record<string,string> = {
        "1":"1m","5":"5m","15":"15m","30":"30m","60":"1H","240":"4H","D":"1D","W":"1W",
      };
      return map[currentInterval] ?? "1H";
    })();
  const defaultCond = editItem?.condition ?? "cross_above";

  const [drawingType, setDrawingType]   = useState<DrawingType>(() => {
    if (editItem) return (editItem.drawingType ?? "trendline") as DrawingType;
    if (prefillDrawing) return toolTypeToDrawingType(prefillDrawing.toolType);
    return "trendline";
  });
  const [timeframe,   setTimeframe]     = usePersisted<string>("dal_tf",   defaultTF);
  const [condition,   setCondition]     = usePersisted<string>("dal_cond", defaultCond);
  const [telegram,    setTelegram]      = useState(editItem?.telegramEnabled ?? true);
  const [notes,       setNotes]         = useState(editItem?.notes ?? "");
  const [saving,      setSaving]        = useState(false);
  const [error,       setError]         = useState("");
  const [notesFocused, setNotesFocused] = useState(false);

  // Price states — auto-fill from prefillDrawing if available
  const defaultP1 = String(
    editItem?.point1Price ??
    prefillDrawing?.points[0]?.price ??
    currentPrice ?? ""
  );
  const defaultP2 = String(
    editItem?.point2Price ??
    prefillDrawing?.points[1]?.price ??
    currentPrice ?? ""
  );
  const [p1Price,  setP1Price]  = useState(defaultP1);
  const [p2Price,  setP2Price]  = useState(defaultP2);

  // Datetime states — auto-fill from prefillDrawing points (time is in Unix seconds)
  const [p1DT, setP1DT] = useState<DTState>(() => {
    if (editItem) return isoToParts(editItem.point1Time);
    if (prefillDrawing?.points[0]?.time) return msToUtcParts(prefillDrawing.points[0].time * 1000);
    return EMPTY_DT;
  });
  const [p2DT, setP2DT] = useState<DTState>(() => {
    if (editItem) return isoToParts(editItem.point2Time);
    if (prefillDrawing?.points[1]?.time) return msToUtcParts(prefillDrawing.points[1].time * 1000);
    return EMPTY_DT;
  });

  const isHLine = drawingType === "horizontal_line";

  // Sync condition when drawing type changes
  useEffect(() => {
    const conds = CONDITIONS[drawingType];
    if (!conds.some(c => c.value === condition)) {
      setCondition(conds[0].value);
    }
  }, [drawingType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time time validation
  const p1ISO = partsToISO(p1DT.dateStr, p1DT.hh, p1DT.mm);
  const p2ISO = partsToISO(p2DT.dateStr, p2DT.hh, p2DT.mm);
  const timeOrderError = !isHLine && p1ISO && p2ISO && new Date(p1ISO) >= new Date(p2ISO)
    ? "Point 2 must be after Point 1"
    : null;

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError("");

    const p1p = parseFloat(p1Price);
    const p2p = isHLine ? p1p : parseFloat(p2Price);
    if (isNaN(p1p) || p1p <= 0) { setError("Enter a valid Point 1 price."); return; }
    if (!isHLine && (isNaN(p2p) || p2p <= 0)) { setError("Enter a valid Point 2 price."); return; }
    if (!isHLine && !p1ISO) { setError("Enter Point 1 date and time (UTC)."); return; }
    if (!isHLine && !p2ISO) { setError("Enter Point 2 date and time (UTC)."); return; }
    if (timeOrderError) { setError(timeOrderError); return; }

    const body = {
      symbol,
      timeframe,
      drawingType,
      condition,
      point1Price: p1p,
      point1Time:  isHLine ? new Date(Date.now() - 3_600_000).toISOString() : p1ISO!,
      point2Price: p2p,
      point2Time:  isHLine ? new Date().toISOString() : p2ISO!,
      telegramEnabled: telegram,
      notes: notes.trim() || undefined,
    };

    setSaving(true);
    try {
      const BASE   = getApiBase();
      const url    = editItem ? `${BASE}/api/trendlines/${editItem.id}` : `${BASE}/api/trendlines`;
      const method = editItem ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        setError(j.error ?? `Server error (${res.status})`); return;
      }
      const saved = await res.json().catch(() => ({})) as Record<string, unknown>;
      // Sync to global alert store
      const mapCond = (c: string): "touch" | "break" | "retest" => {
        if (c === "retest" || c === "rejection") return "retest";
        if (c === "breakout" || c === "enter_zone" || c === "exit_zone" || c === "break") return "break";
        return "touch";
      };
      useAlertStore.getState().addAlert({
        id: `tl-${(saved.id as number | undefined) ?? Date.now()}`,
        type: "trendline",
        symbol,
        timeframe,
        condition: mapCond(condition),
        point1Price: p1p,
        point1Time: isHLine ? new Date(Date.now() - 3_600_000).toISOString() : p1ISO!,
        point2Price: p2p,
        point2Time: isHLine ? new Date().toISOString() : p2ISO!,
        notes: notes.trim() || "",
        status: "active",
        createdAt: new Date().toISOString(),
        triggeredAt: null,
      } as TrendlineAlert);
      onCreated(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally { setSaving(false); }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Modal
      transparent
      animationType="fade"
      visible
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={s.backdrop}
        onPress={onClose}
      >
        <Pressable onPress={() => {}} style={s.panel}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            {/* ── Header ── */}
            <View style={s.header}>
              <View style={s.headerLeft}>
                <View style={s.headerIconBox}>
                  <TrendingUp size={14} color="#B7FF5A" />
                </View>
                <View>
                  <Text style={s.headerTitle}>
                    {editItem ? "Edit Alert" : "New Drawing Alert"}
                  </Text>
                  <Text style={s.headerSymbol}>{symbol}</Text>
                </View>
              </View>
              {/* Live UTC */}
              <View style={s.headerRight}>
                <View style={s.utcChip}>
                  <Clock size={10} color="rgba(167,184,169,0.5)" />
                  <Text style={s.utcChipTime}>{utcClock.hh}:{utcClock.mm}</Text>
                  <Text style={s.utcChipLabel}>UTC</Text>
                </View>
                <Pressable onPress={onClose} hitSlop={8} style={s.headerCloseBtn}>
                  <X size={16} color="rgba(167,184,169,0.5)" />
                </Pressable>
              </View>
            </View>

            {/* ── Body (scrollable) ── */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={s.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Chart UTC notice */}
              <View style={s.utcNotice}>
                <Text style={s.utcNoticeText}>
                  Chart time uses UTC. Enter the exact candle time shown on TradingView.
                </Text>
              </View>

              {/* Drawing type */}
              <PillSelector
                label="Drawing Type"
                value={drawingType}
                onChange={(v) => setDrawingType(v as DrawingType)}
                options={DRAWING_OPTIONS}
              />

              {/* Condition */}
              <PillSelector
                label="Alert Condition"
                value={condition as DrawingType}
                onChange={setCondition as (v: DrawingType) => void}
                options={CONDITIONS[drawingType] as { value: DrawingType; label: string }[]}
              />

              {/* Timeframe */}
              <View style={{ gap: 8 }}>
                <Text style={s.sectionLabel}>Timeframe</Text>
                <View style={s.pillRow}>
                  {TIMEFRAMES.map(tf => {
                    const active = timeframe === tf;
                    return (
                      <Pressable
                        key={tf}
                        onPress={() => setTimeframe(tf)}
                        style={({ pressed }) => [
                          s.pill,
                          { minWidth: 40,
                            backgroundColor: active ? "rgba(183,255,90,0.14)" : "rgba(13,28,22,0.8)",
                            borderColor:     active ? "rgba(183,255,90,0.45)" : "rgba(57,91,67,0.3)" },
                          pressed && s.pillPressed,
                        ]}
                      >
                        <Text style={[s.pillText, { color: active ? "#B7FF5A" : "rgba(167,184,169,0.6)" }]}>
                          {tf}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* ── Coordinates ── */}
              {isHLine ? (
                <NumberStepper
                  label="Price Level"
                  value={p1Price}
                  onChange={setP1Price}
                  min={0}
                  step={0.0001}
                  placeholder="e.g. 1.16384"
                />
              ) : (
                <>
                  {/* Point 1 */}
                  <View style={s.pointBox}>
                    <Text style={s.pointBoxLabel}>Point 1</Text>
                    <NumberStepper
                      label="Price"
                      value={p1Price}
                      onChange={setP1Price}
                      min={0}
                      step={0.0001}
                      placeholder="Price"
                    />
                    <DateTimePicker
                      label="Time (UTC)"
                      value={p1DT}
                      onChange={setP1DT}
                      error={!!timeOrderError}
                    />
                  </View>

                  {/* Validation warning */}
                  {!!timeOrderError && (
                    <View style={s.warnBox}>
                      <AlertTriangle size={14} color="#fbbf24" />
                      <Text style={s.warnText}>{timeOrderError}</Text>
                    </View>
                  )}

                  {/* Point 2 */}
                  <View style={s.pointBox}>
                    <Text style={s.pointBoxLabel}>Point 2</Text>
                    <NumberStepper
                      label="Price"
                      value={p2Price}
                      onChange={setP2Price}
                      min={0}
                      step={0.0001}
                      placeholder="Price"
                    />
                    <DateTimePicker
                      label="Time (UTC)"
                      value={p2DT}
                      onChange={setP2DT}
                      error={!!timeOrderError}
                    />
                  </View>
                </>
              )}

              {/* Telegram toggle */}
              <View style={s.toggleRow}>
                <View>
                  <Text style={s.toggleLabel}>Telegram Alert</Text>
                  <Text style={s.toggleSub}>Push notification when triggered</Text>
                </View>
                <Toggle checked={telegram} onChange={setTelegram} />
              </View>

              {/* Notes */}
              <View style={{ gap: 8 }}>
                <Text style={s.sectionLabel}>Notes (optional)</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Setup description, trade thesis…"
                  placeholderTextColor="rgba(167,184,169,0.4)"
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                  style={[s.notesInput, notesFocused && s.notesInputFocused]}
                  onFocus={() => setNotesFocused(true)}
                  onBlur={() => setNotesFocused(false)}
                />
              </View>

              {/* Error */}
              {!!error && (
                <View style={s.errorBox}>
                  <AlertTriangle size={16} color="#f87171" />
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}
            </ScrollView>

            {/* ── Footer ── */}
            <View style={s.footer}>
              <Pressable
                onPress={onClose}
                disabled={saving}
                style={({ pressed }) => [s.cancelBtn, pressed && s.cancelBtnPressed]}
              >
                <Text style={s.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={saving || !!timeOrderError}
                style={[
                  s.submitBtn,
                  (saving || !!timeOrderError) && s.submitBtnDisabled,
                ]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#07110D" />
                ) : (
                  <Check size={16} color="#07110D" />
                )}
                <Text style={s.submitBtnText}>
                  {editItem ? "Save Changes" : "Create Alert"}
                </Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── StyleSheet ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Modal layout
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  panel: {
    width: "100%",
    maxWidth: 500,
    maxHeight: "92%",
    borderRadius: 16,
    backgroundColor: "rgba(7,17,13,0.98)",
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.12)",
    overflow: "hidden",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(57,91,67,0.18)",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerIconBox: {
    width: 28, height: 28, borderRadius: 12,
    backgroundColor: "rgba(183,255,90,0.1)",
    borderWidth: 1, borderColor: "rgba(183,255,90,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 13.5, fontWeight: "700", color: "#ffffff" },
  headerSymbol: { fontSize: 10, color: "rgba(167,184,169,0.5)", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  utcChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    backgroundColor: "rgba(13,28,22,0.8)",
    borderWidth: 1, borderColor: "rgba(57,91,67,0.3)",
  },
  utcChipTime: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 10.5, fontWeight: "700", color: "#B7FF5A" },
  utcChipLabel: { fontSize: 8.5, color: "rgba(167,184,169,0.4)" },
  headerCloseBtn: {
    width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 8,
  },

  // Body
  bodyContent: { paddingHorizontal: 20, paddingVertical: 16, gap: 20 },

  // UTC notice
  utcNotice: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8,
    backgroundColor: "rgba(56,189,248,0.06)",
    borderWidth: 1, borderColor: "rgba(56,189,248,0.15)",
  },
  utcNoticeText: { fontSize: 9.5, textAlign: "center", color: "rgba(56,189,248,0.75)" },

  // Section label
  sectionLabel: {
    fontSize: 9, fontWeight: "700", textTransform: "uppercase",
    letterSpacing: 2, color: "rgba(167,184,169,0.5)",
  },

  // Presets
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  presetChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    backgroundColor: "rgba(183,255,90,0.08)",
    borderWidth: 1, borderColor: "rgba(183,255,90,0.22)",
  },
  presetChipPressed: { backgroundColor: "rgba(183,255,90,0.18)" },
  presetChipText: { fontSize: 10, fontWeight: "700", color: "#B7FF5A" },

  // DateTime
  dtRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dtDateInput: {
    flex: 1, height: 40, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1,
    backgroundColor: "rgba(13,28,22,0.9)",
    color: "#F3FFF3", fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  dtTimeBox: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 8, height: 40, borderRadius: 10, borderWidth: 1,
    backgroundColor: "rgba(13,28,22,0.9)",
  },
  dtTimeInput: {
    width: 32, textAlign: "center", fontSize: 13, fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    paddingVertical: 0,
  },
  dtColon: { fontSize: 14, fontWeight: "700", color: "rgba(167,184,169,0.4)", paddingBottom: 2 },
  dtUtc: { fontSize: 9, fontWeight: "700", color: "rgba(167,184,169,0.3)", marginLeft: 4 },
  dtPreview: {
    fontSize: 9.5, color: "rgba(167,184,169,0.45)",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    paddingLeft: 4,
  },

  // Stepper
  stepper: {
    flexDirection: "row", alignItems: "center", height: 40, borderRadius: 12,
    borderWidth: 1, borderColor: "rgba(57,91,67,0.4)",
    backgroundColor: "rgba(13,28,22,0.9)",
    overflow: "hidden",
  },
  stepperFocused: {
    borderColor: "rgba(183,255,90,0.6)",
  },
  stepperInput: {
    flex: 1, paddingHorizontal: 12, color: "#F3FFF3",
    fontSize: 12.5, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    paddingVertical: 0,
  },
  stepperBtns: {
    flexDirection: "column", borderLeftWidth: 1, borderLeftColor: "rgba(57,91,67,0.3)",
    height: "100%",
  },
  stepperBtn: {
    flex: 1, paddingHorizontal: 8, alignItems: "center", justifyContent: "center",
  },
  stepperDivider: { height: 1, backgroundColor: "rgba(57,91,67,0.25)" },

  // Pills
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1, minHeight: 36,
  },
  pillPressed: { opacity: 0.8 },
  pillText: { fontSize: 11, fontWeight: "700" },

  // Toggle
  toggle: {
    width: 44, height: 24, borderRadius: 12,
    backgroundColor: "rgba(57,91,67,0.35)",
    justifyContent: "center",
  },
  toggleOn: { backgroundColor: "#B7FF5A" },
  toggleThumb: {
    position: "absolute", top: 4, width: 16, height: 16,
    borderRadius: 8, backgroundColor: "#ffffff",
  },

  // Toggle row
  toggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
    backgroundColor: "rgba(13,28,22,0.8)",
    borderWidth: 1, borderColor: "rgba(57,91,67,0.25)",
  },
  toggleLabel: { fontSize: 12, fontWeight: "600", color: "#ffffff" },
  toggleSub: { fontSize: 9.5, color: "rgba(167,184,169,0.45)", marginTop: 2 },

  // Point box
  pointBox: {
    borderRadius: 12, padding: 16, gap: 16,
    backgroundColor: "rgba(13,28,22,0.6)",
    borderWidth: 1, borderColor: "rgba(57,91,67,0.25)",
  },
  pointBoxLabel: {
    fontSize: 10, fontWeight: "700", textTransform: "uppercase",
    letterSpacing: 2, color: "rgba(167,184,169,0.45)",
  },

  // Warning
  warnBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    backgroundColor: "rgba(251,191,36,0.08)",
    borderWidth: 1, borderColor: "rgba(251,191,36,0.25)",
  },
  warnText: { fontSize: 10.5, fontWeight: "600", color: "#fbbf24", flex: 1 },

  // Notes
  notesInput: {
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
    backgroundColor: "rgba(13,28,22,0.9)",
    borderWidth: 1, borderColor: "rgba(57,91,67,0.35)",
    color: "#F3FFF3", fontSize: 12, lineHeight: 18, minHeight: 60,
  },
  notesInputFocused: {
    borderColor: "rgba(183,255,90,0.5)",
  },

  // Error
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
    backgroundColor: "rgba(239,68,68,0.1)",
    borderWidth: 1, borderColor: "rgba(239,68,68,0.3)",
  },
  errorText: { fontSize: 11.5, color: "#f87171", flex: 1 },

  // Footer
  footer: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: "rgba(57,91,67,0.18)",
  },
  cancelBtn: {
    flex: 1, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(57,91,67,0.3)",
  },
  cancelBtnPressed: { backgroundColor: "rgba(255,255,255,0.06)" },
  cancelBtnText: { fontSize: 12, fontWeight: "600", color: "rgba(167,184,169,0.7)" },
  submitBtn: {
    flex: 2, height: 44, borderRadius: 12,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#B7FF5A",
  },
  submitBtnDisabled: { backgroundColor: "rgba(183,255,90,0.3)" },
  submitBtnText: { fontSize: 13, fontWeight: "700", color: "#07110D" },
});
