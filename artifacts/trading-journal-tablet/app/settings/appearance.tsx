/**
 * app/settings/appearance.tsx — Appearance Settings Screen
 *
 * Migration of: artifacts/trading-journal/src/components/AppearanceSettingsPage.tsx
 * Phase 11.2 — Settings Sub-Pages (React → React Native)
 *
 * Web → RN replacements
 * ──────────────────────────────────────────────────────────────────────────
 *   Controlled component (open/onClose props) → Expo Router screen
 *   CSS translateX slide animation            → Stack navigator animation
 *   div / span / p                            → View / Text
 *   button                                    → Pressable
 *   overflowY:auto                            → ScrollView
 *   lucide-react Sun/Moon/Monitor/Check       → Ionicons equivalents
 *   onPointerDown/Up/Leave                    → onPressIn / onPressOut
 *   window.addEventListener("keydown")        → removed (no keyboard on mobile)
 *   requestAnimationFrame CSS gate            → removed (Stack handles animation)
 *   rendered/visible mount-gate state         → removed
 *
 * Business logic preserved exactly:
 *   ThemeMode type:  "light" | "dark" | "system"
 *   OPTIONS array:   Light / Dark / System Default with exact colours
 *   Active indicator: filled #a5b4fc circle + dark checkmark
 *   Inactive indicator: 2px border rgba(255,255,255,0.20) circle
 *   Press feedback: rgba(255,255,255,0.04) background on row
 *   Dividers between options (not after the last)
 *   setThemeMode() called on selection — ThemeContext preserved
 *
 * Exported API preserved:
 *   AppearanceSettingsPageProps  — original controlled-component props
 *   AppearanceSettingsPage       — named export (delegates to screen)
 *   ThemeMode                    — re-exported from ThemeContext
 */

import { ChevronLeft, Check, Sun, Moon, Monitor } from "lucide-react-native";
import { router } from "expo-router";
import React, { memo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeMode } from "@/contexts/ThemeContext";

// ─────────────────────────────────────────────────────────────────────────────
// Exported interface — preserved verbatim from source
// ─────────────────────────────────────────────────────────────────────────────

export interface AppearanceSettingsPageProps {
  open:    boolean;
  onClose: () => void;
}

// Re-export ThemeMode for source compatibility
export type { ThemeMode };

// ─────────────────────────────────────────────────────────────────────────────
// Options — preserved verbatim from source
// ─────────────────────────────────────────────────────────────────────────────

type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const OPTIONS: {
  mode:       ThemeMode;
  label:      string;
  sub:        string;
  Icon:       LucideIcon;
  iconColor:  string;
  iconBg:     string;
}[] = [
  {
    mode:      "light",
    label:     "Light",
    sub:       "Always use light theme",
    Icon:      Sun,
    iconColor: "#fbbf24",
    iconBg:    "rgba(245,158,11,0.14)",
  },
  {
    mode:      "dark",
    label:     "Dark",
    sub:       "Always use dark theme",
    Icon:      Moon,
    iconColor: "#a78bfa",
    iconBg:    "rgba(139,92,246,0.14)",
  },
  {
    mode:      "system",
    label:     "System Default",
    sub:       "Follow device preference",
    Icon:      Monitor,
    iconColor: "#60a5fa",
    iconBg:    "rgba(59,130,246,0.14)",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Screen component
// ─────────────────────────────────────────────────────────────────────────────

function AppearanceScreen() {
  const insets = useSafeAreaInsets();
  const { themeMode, setThemeMode } = useTheme();
  const [pressedMode, setPressedMode] = useState<ThemeMode | null>(null);

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

        <Text style={styles.headerTitle}>Appearance</Text>

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
        {/* ── Section label ──────────────────────────────────────────────── */}
        {/* Preserved from source: "Theme" — uppercase, muted, top 24px pad */}
        <Text style={styles.sectionLabel}>Theme</Text>

        {/* ── Option rows ────────────────────────────────────────────────── */}
        {OPTIONS.map(({ mode, label, sub, Icon, iconColor, iconBg }, i) => {
          const active  = themeMode === mode;
          const pressed = pressedMode === mode;

          return (
            <React.Fragment key={mode}>
              <Pressable
                onPressIn={() => setPressedMode(mode)}
                onPressOut={() => setPressedMode(null)}
                onPress={() => setThemeMode(mode)}
                style={[
                  styles.optionRow,
                  pressed && styles.optionRowPressed,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={label}
              >
                {/* Icon */}
                <View style={[styles.optionIcon, { backgroundColor: iconBg }]}>
                  <Icon size={18} color={iconColor} />
                </View>

                {/* Labels */}
                <View style={styles.optionLabels}>
                  <Text style={styles.optionLabel}>{label}</Text>
                  <Text style={styles.optionSub}>{sub}</Text>
                </View>

                {/* Radio indicator — filled circle with checkmark when active */}
                <View style={[
                  styles.radioOuter,
                  active ? styles.radioActive : styles.radioInactive,
                ]}>
                  {active && (
                    <Check size={11} color="#1e1b4b" />
                  )}
                </View>
              </Pressable>

              {i < OPTIONS.length - 1 && (
                <View style={styles.divider} />
              )}
            </React.Fragment>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Named export — preserved for source compatibility
// ─────────────────────────────────────────────────────────────────────────────

export const AppearanceSettingsPage = memo(AppearanceScreen);

// ─────────────────────────────────────────────────────────────────────────────
// Default export — Expo Router screen entry point
// ─────────────────────────────────────────────────────────────────────────────

export default AppearanceScreen;

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
    // paddingBottom inline with safe area
  },

  // ── Section label ─────────────────────────────────────────────────────────
  // Preserved: font-size 11, weight 700, tracking 0.10em, uppercase, muted
  // padding: "24px 24px 10px"
  sectionLabel: {
    fontSize:        11,
    fontWeight:      "700",
    letterSpacing:   1.1,
    textTransform:   "uppercase",
    paddingTop:      24,
    paddingBottom:   10,
    paddingHorizontal: 24,
    color:           "rgba(148,163,184,0.40)",
    lineHeight:      11,
  },

  // ── Option row ────────────────────────────────────────────────────────────
  // height:68, padding:0 24px, gap:16, button-like
  optionRow: {
    flexDirection:     "row",
    alignItems:        "center",
    height:            68,
    paddingHorizontal: 24,
    gap:               16,
    backgroundColor:   "transparent",
  },
  optionRowPressed: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  optionIcon: {
    width:           40,
    height:          40,
    borderRadius:    12,
    flexShrink:      0,
    alignItems:      "center",
    justifyContent:  "center",
  },
  optionLabels: {
    flex: 1,
  },
  optionLabel: {
    fontSize:    15,
    fontWeight:  "600",
    color:       "rgba(255,255,255,0.90)",
    lineHeight:  21,
  },
  optionSub: {
    fontSize:   12,
    color:      "rgba(148,163,184,0.55)",
    marginTop:  2,
  },

  // ── Radio indicator ───────────────────────────────────────────────────────
  radioOuter: {
    width:          22,
    height:         22,
    borderRadius:   11,
    flexShrink:     0,
    alignItems:     "center",
    justifyContent: "center",
  },
  radioActive: {
    backgroundColor: "#a5b4fc",
    borderWidth:     0,
  },
  radioInactive: {
    backgroundColor: "transparent",
    borderWidth:     2,
    borderColor:     "rgba(255,255,255,0.20)",
  },

  // ── Divider ───────────────────────────────────────────────────────────────
  // marginLeft 80 = 24px padding + 40px icon + 16px gap  (preserved from source)
  divider: {
    height:          1,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginLeft:      80,
  },
});
