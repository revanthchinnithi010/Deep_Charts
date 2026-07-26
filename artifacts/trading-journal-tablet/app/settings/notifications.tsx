/**
 * app/settings/notifications.tsx — Notifications Settings Screen
 *
 * Migration of: artifacts/trading-journal/src/components/NotificationsSettingsPage.tsx
 * Phase 11.2 — Settings Sub-Pages (React → React Native)
 *
 * Web → RN replacements
 * ──────────────────────────────────────────────────────────────────────────
 *   Controlled component (open/onClose/pickerPage/onOpenPicker/onClosePicker)
 *                                                → Expo Router screen
 *   CSS translateX slide animation              → Stack navigator animation
 *   PickerPage (CSS fixed overlay)              → in-screen Animated.View overlay
 *                                                  (local pickerName state replaces
 *                                                  ProfilePage's navStack pickerPage prop)
 *   div / span / p / button                     → View / Text / Pressable
 *   Custom CSS toggle (div-based)               → custom View toggle (same visual)
 *   overflowY:auto                              → ScrollView
 *   lucide-react icons                          → Ionicons equivalents
 *   localStorage ("tj_notification_prefs")      → AsyncStorage (same key)
 *   window.addEventListener("keydown")          → removed (no keyboard on mobile)
 *   requestAnimationFrame CSS gate              → removed (Stack handles animation)
 *   onPointerDown/Up/Leave                      → onPressIn / onPressOut
 *   rendered/visible mount-gate state           → removed
 *
 * Business logic preserved exactly:
 *   LS_KEY = "tj_notification_prefs"  — same key as web (AsyncStorage)
 *   SOUNDS const array: Default, Chime, Ping, Bell, Ding
 *   DURATIONS const array: 3s, 5s, 10s, 30s
 *   SoundType / DurationType union types (preserved)
 *   NotifPrefs interface (preserved — internal)
 *   loadPrefs() / savePrefs() semantics (async in RN)
 *   updatePrefs() callback (preserved)
 *   Toggle row: Alert Sounds (soundEnabled, with disabled state driving Ringtone)
 *   Nav rows: Alert Ringtone (value = prefs.sound), Alert Duration (value = prefs.duration)
 *   Picker: selects value + closes immediately (onSelect → updatePrefs → close)
 *   Dividers: showDivider prop preserved on each row
 *
 * Exported API preserved:
 *   NotificationsSettingsPageProps — original controlled-component props
 *   NotificationsSettingsPage      — named export (delegates to screen)
 *   SOUNDS, DURATIONS              — const arrays
 *   SoundType, DurationType        — union types
 */

import {
  ChevronLeft, ChevronRight, Check,
  Volume2, VolumeX, Music, Timer,
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
import { router } from "expo-router";
import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─────────────────────────────────────────────────────────────────────────────
// Exported interface — preserved verbatim from source
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationsSettingsPageProps {
  open:          boolean;
  onClose:       () => void;
  /** The navStack entry for the active picker, e.g. "picker_sound" or null */
  pickerPage:    string | null;
  onOpenPicker:  (name: string) => void;
  onClosePicker: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants — preserved verbatim from source
// ─────────────────────────────────────────────────────────────────────────────

export const SOUNDS    = ["Default", "Chime", "Ping", "Bell", "Ding"] as const;
export const DURATIONS = ["3 seconds", "5 seconds", "10 seconds", "30 seconds"] as const;

export type SoundType    = typeof SOUNDS[number];
export type DurationType = typeof DURATIONS[number];

// ─────────────────────────────────────────────────────────────────────────────
// NotifPrefs — preserved verbatim from source (internal)
// ─────────────────────────────────────────────────────────────────────────────

interface NotifPrefs {
  soundEnabled: boolean;
  sound:        SoundType;
  duration:     DurationType;
}

const LS_KEY = "tj_notification_prefs";

const DEFAULT_PREFS: NotifPrefs = {
  soundEnabled: true,
  sound:        "Default",
  duration:     "5 seconds",
};

// loadPrefs — async (AsyncStorage replaces localStorage)
async function loadPrefs(): Promise<NotifPrefs> {
  try {
    const raw = await AsyncStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) as Partial<NotifPrefs> };
  } catch { /* ignore */ }
  return { ...DEFAULT_PREFS };
}

// savePrefs — fire-and-forget (preserved semantics, async in RN)
function savePrefs(p: NotifPrefs): void {
  AsyncStorage.setItem(LS_KEY, JSON.stringify(p)).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Animation constants — preserved from source
// ─────────────────────────────────────────────────────────────────────────────

const DUR_OPEN  = 240;
const DUR_CLOSE = 210;

// ─────────────────────────────────────────────────────────────────────────────
// PickerPage — in-screen overlay (replaces CSS fixed overlay)
//
// In the web, PickerPage was a CSS-fixed full-screen overlay managed by
// ProfilePage's navStack. In RN it is an Animated.View with position:absolute
// inset:0 rendered within the notifications screen, driven by local state.
// The translateX animation matches the DUR_OPEN/DUR_CLOSE from the source.
// ─────────────────────────────────────────────────────────────────────────────

function PickerPage<T extends string>({
  open, onClose, title, options, selected, onSelect,
}: {
  open:     boolean;
  onClose:  () => void;
  title:    string;
  options:  readonly T[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  const insets   = useSafeAreaInsets();
  const slideX   = useRef(new Animated.Value(1)).current; // 0=visible, 1=offscreen
  const [rendered, setRendered] = useState(open);
  const [pressed, setPressed]   = useState<T | null>(null);

  useEffect(() => {
    if (open) {
      setRendered(true);
      Animated.timing(slideX, {
        toValue:         0,
        duration:        DUR_OPEN,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideX, {
        toValue:         1,
        duration:        DUR_CLOSE,
        useNativeDriver: true,
      }).start(() => setRendered(false));
    }
  }, [open, slideX]);

  if (!rendered) return null;

  // translateX: 0 = visible, "100%" cannot be used with Animated.Value directly.
  // Use a sufficiently large pixel offset (768px) — matches tablet viewport width.
  const translateX = slideX.interpolate({
    inputRange:  [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Animated.View
      style={[
        styles.pickerOverlay,
        { transform: [{ translateX }] },
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={18} color="rgba(255,255,255,0.72)" />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Options */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* Section label: "Select {title}" */}
        <Text style={styles.pickerSectionLabel}>Select {title}</Text>

        {options.map((opt, i) => {
          const active    = selected === opt;
          const isPressed = pressed === opt;
          return (
            <React.Fragment key={opt}>
              <Pressable
                onPressIn={() => setPressed(opt)}
                onPressOut={() => setPressed(null)}
                onPress={() => { onSelect(opt); onClose(); }}
                style={[
                  styles.pickerRow,
                  isPressed && styles.pickerRowPressed,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
              >
                <Text style={styles.pickerRowLabel}>{opt}</Text>
                {active && (
                  <View style={styles.pickerCheckCircle}>
                    <Check size={11} color="#1e1b4b" />
                  </View>
                )}
              </Pressable>
              {i < options.length - 1 && (
                <View style={[styles.divider, { marginLeft: 24 }]} />
              )}
            </React.Fragment>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ToggleRow — custom toggle (matches web's div-based toggle exactly)
// ─────────────────────────────────────────────────────────────────────────────

function ToggleRow({
  Icon, IconOff, iconColor, iconColorOff, iconBg, iconBgOff,
  label, sub, value, onChange, showDivider,
}: {
  Icon:          LucideIcon;
  IconOff?:      LucideIcon;
  iconColor:     string;
  iconColorOff?: string;
  iconBg:        string;
  iconBgOff?:    string;
  label:         string;
  sub?:          string;
  value:         boolean;
  onChange:      (v: boolean) => void;
  showDivider:   boolean;
}) {
  const ResolvedIcon  = value ? Icon : (IconOff ?? Icon);
  const resolvedIconColor = value ? iconColor : (iconColorOff ?? iconColor);
  const resolvedIconBg    = value ? iconBg : (iconBgOff ?? iconBg);

  return (
    <>
      <Pressable
        onPress={() => onChange(!value)}
        style={styles.navRow}
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        accessibilityLabel={label}
      >
        <View style={[styles.iconBox, { backgroundColor: resolvedIconBg }]}>
          <ResolvedIcon size={18} color={resolvedIconColor} />
        </View>

        <View style={styles.rowLabels}>
          <Text style={styles.rowLabel}>{label}</Text>
          {sub != null && <Text style={styles.rowSub}>{sub}</Text>}
        </View>

        {/* Custom toggle — matches web's div-based toggle (46×26, borderRadius 13) */}
        <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
          <View style={[styles.toggleThumb, value ? styles.toggleThumbOn : styles.toggleThumbOff]} />
        </View>
      </Pressable>
      {showDivider && <View style={[styles.divider, { marginLeft: 80 }]} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NavRow — tappable row with value + chevron
// ─────────────────────────────────────────────────────────────────────────────

function NavRow({
  Icon, iconColor, iconBg, label, value, onPress, showDivider, disabled,
}: {
  Icon:        LucideIcon;
  iconColor:   string;
  iconBg:      string;
  label:       string;
  value?:      string;
  onPress:     () => void;
  showDivider: boolean;
  disabled?:   boolean;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <>
      <Pressable
        onPressIn={() => !disabled && setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={onPress}
        disabled={disabled}
        style={[
          styles.navRow,
          pressed && styles.navRowPressed,
          disabled && styles.navRowDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
      >
        <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
          <Icon size={18} color={iconColor} />
        </View>

        <Text style={[styles.rowLabel, { flex: 1 }]}>{label}</Text>

        <View style={styles.rowRight}>
          {value != null && (
            <Text style={styles.rowValue}>{value}</Text>
          )}
          <ChevronRight size={16} color="rgba(148,163,184,0.30)" />
        </View>
      </Pressable>
      {showDivider && <View style={[styles.divider, { marginLeft: 80 }]} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen component
// ─────────────────────────────────────────────────────────────────────────────

function NotificationsScreen() {
  const insets = useSafeAreaInsets();

  const [prefs, setPrefs]           = useState<NotifPrefs>(DEFAULT_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  // pickerName drives which PickerPage overlay is open
  // "sound" | "duration" | null — replaces ProfilePage's navStack pickerPage prop
  const [pickerName, setPickerName] = useState<"sound" | "duration" | null>(null);

  // Load prefs from AsyncStorage on mount (replaces localStorage.getItem)
  useEffect(() => {
    loadPrefs().then(p => {
      setPrefs(p);
      setPrefsLoaded(true);
    }).catch(() => {
      setPrefsLoaded(true);
    });
  }, []);

  const updatePrefs = useCallback((patch: Partial<NotifPrefs>) => {
    setPrefs(p => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  // Don't render until prefs are loaded (avoids flicker from default → stored)
  if (!prefsLoaded) return null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={18} color="rgba(255,255,255,0.72)" />

        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* ── Scrollable content ───────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Section label: "Alerts" */}
        <Text style={styles.sectionLabel}>Alerts</Text>

        {/* Alert Sounds toggle */}
        <ToggleRow
          Icon={Volume2}
          IconOff={VolumeX}
          iconColor={prefs.soundEnabled ? "#34d399" : "#94a3b8"}
          iconBg={prefs.soundEnabled ? "rgba(16,185,129,0.14)" : "rgba(148,163,184,0.10)"}
          label="Alert Sounds"
          sub="Play a sound when alerts trigger"
          value={prefs.soundEnabled}
          onChange={v => updatePrefs({ soundEnabled: v })}
          showDivider
        />

        {/* Alert Ringtone nav row — disabled when soundEnabled is false */}
        <NavRow
          Icon={Music}
          iconColor="#a78bfa"
          iconBg="rgba(139,92,246,0.14)"
          label="Alert Ringtone"
          value={prefs.sound}
          onPress={() => setPickerName("sound")}
          showDivider
          disabled={!prefs.soundEnabled}
        />

        {/* Alert Duration nav row */}
        <NavRow
          Icon={Timer}
          iconColor="#fbbf24"
          iconBg="rgba(245,158,11,0.14)"
          label="Alert Duration"
          value={prefs.duration}
          onPress={() => setPickerName("duration")}
          showDivider={false}
        />
      </ScrollView>

      {/* ── Picker overlays ─────────────────────────────────────────────── */}
      {/* Controlled by local pickerName state — replaces ProfilePage navStack */}

      <PickerPage
        open={pickerName === "sound"}
        onClose={() => setPickerName(null)}
        title="Alert Ringtone"
        options={SOUNDS}
        selected={prefs.sound}
        onSelect={v => updatePrefs({ sound: v as SoundType })}
      />

      <PickerPage
        open={pickerName === "duration"}
        onClose={() => setPickerName(null)}
        title="Alert Duration"
        options={DURATIONS}
        selected={prefs.duration}
        onSelect={v => updatePrefs({ duration: v as DurationType })}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Named export — preserved for source compatibility
// ─────────────────────────────────────────────────────────────────────────────

export const NotificationsSettingsPage = memo(NotificationsScreen);

// ─────────────────────────────────────────────────────────────────────────────
// Default export — Expo Router screen entry point
// ─────────────────────────────────────────────────────────────────────────────

export default NotificationsScreen;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: "#000000",
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    height:            60,
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "space-between",
    paddingHorizontal: 12,
    backgroundColor:   "#000000",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  backBtn: {
    width:           40,
    height:          40,
    borderRadius:    20,
    alignItems:      "center",
    justifyContent:  "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.09)",
  },
  headerTitle: {
    fontSize:      16,
    fontWeight:    "700",
    color:         "rgba(255,255,255,0.92)",
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 40,
  },

  // ── Scroll ────────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    // paddingBottom set inline
  },

  // ── Section label ─────────────────────────────────────────────────────────
  // padding: "24px 24px 10px" — preserved from source
  sectionLabel: {
    fontSize:          11,
    fontWeight:        "700",
    letterSpacing:     1.1,
    textTransform:     "uppercase",
    paddingTop:        24,
    paddingBottom:     10,
    paddingHorizontal: 24,
    color:             "rgba(148,163,184,0.40)",
    lineHeight:        11,
  },

  // ── Nav/Toggle row (shared base) ──────────────────────────────────────────
  // height:68, padding 0 24px, gap:16
  navRow: {
    flexDirection:     "row",
    alignItems:        "center",
    height:            68,
    paddingHorizontal: 24,
    gap:               16,
  },
  navRowPressed: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  navRowDisabled: {
    opacity: 0.40,
  },
  iconBox: {
    width:          40,
    height:         40,
    borderRadius:   12,
    flexShrink:     0,
    alignItems:     "center",
    justifyContent: "center",
  },
  rowLabels: {
    flex: 1,
  },
  rowLabel: {
    fontSize:   15,
    fontWeight: "600",
    color:      "rgba(255,255,255,0.90)",
    lineHeight: 20,
  },
  rowSub: {
    fontSize:  12,
    color:     "rgba(148,163,184,0.55)",
    marginTop: 2,
  },
  rowRight: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
  },
  rowValue: {
    fontSize: 13,
    color:    "rgba(148,163,184,0.65)",
  },

  // ── Custom toggle — 46×26, borderRadius 13 ────────────────────────────────
  // Preserved from source's div-based CSS toggle
  toggleTrack: {
    width:           46,
    height:          26,
    borderRadius:    13,
    flexShrink:      0,
    backgroundColor: "rgba(255,255,255,0.12)",
    position:        "relative",
  },
  toggleTrackOn: {
    backgroundColor: "#a5b4fc",
  },
  toggleThumb: {
    position:     "absolute",
    top:          3,
    width:        20,
    height:       20,
    borderRadius: 10,
  },
  toggleThumbOff: {
    left:            3,
    backgroundColor: "rgba(255,255,255,0.70)",
  },
  toggleThumbOn: {
    left:            23,
    backgroundColor: "#1e1b4b",
  },

  // ── Divider ───────────────────────────────────────────────────────────────
  divider: {
    height:          1,
    backgroundColor: "rgba(255,255,255,0.05)",
  },

  // ── Picker overlay — covers the entire screen ─────────────────────────────
  // Replaces CSS position:fixed inset:0 zIndex:204
  pickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex:          10,
    backgroundColor: "#000000",
    flexDirection:   "column",
  },

  // ── Picker section label ──────────────────────────────────────────────────
  pickerSectionLabel: {
    fontSize:          11,
    fontWeight:        "700",
    letterSpacing:     1.1,
    textTransform:     "uppercase",
    paddingTop:        24,
    paddingBottom:     10,
    paddingHorizontal: 24,
    color:             "rgba(148,163,184,0.40)",
    lineHeight:        11,
  },

  // ── Picker option row — height:64, padding 0 24px ────────────────────────
  pickerRow: {
    flexDirection:     "row",
    alignItems:        "center",
    height:            64,
    paddingHorizontal: 24,
    gap:               16,
  },
  pickerRowPressed: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  pickerRowLabel: {
    flex:       1,
    fontSize:   15,
    fontWeight: "500",
    color:      "rgba(255,255,255,0.88)",
  },
  pickerCheckCircle: {
    width:          22,
    height:         22,
    borderRadius:   11,
    backgroundColor:"#a5b4fc",
    alignItems:     "center",
    justifyContent: "center",
    flexShrink:     0,
  },
});
