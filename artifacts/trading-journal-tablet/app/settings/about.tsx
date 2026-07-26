/**
 * app/settings/about.tsx — About Settings Screen
 *
 * Migration of: artifacts/trading-journal/src/components/AboutSettingsPage.tsx
 * Phase 11.2 — Settings Sub-Pages (React → React Native)
 *
 * Web → RN replacements
 * ──────────────────────────────────────────────────────────────────────────
 *   Controlled component (open/onClose props) → Expo Router screen
 *   CSS translateX slide animation            → Stack navigator animation
 *   div / span                                → View / Text
 *   button (Back)                             → Pressable + router.back()
 *   position:fixed inset:0                   → full-screen View (screen owns it)
 *   overflowY:auto                            → ScrollView
 *   lucide-react icons                        → lucide-react-native
 *   window.addEventListener("keydown")        → removed (no keyboard on mobile)
 *   requestAnimationFrame CSS gate            → removed (Stack handles animation)
 *   rendered/visible mount-gate state         → removed (Expo Router lifecycle)
 *
 * Business logic preserved exactly:
 *   Row layout:  Version 1.0.0, Terms of Service, Privacy Policy
 *   App branding: "arealab" / "by Revanth chinnithi"
 *   Icon colours: indigo (#a5b4fc), blue (#60a5fa), green (#34d399)
 *
 * Exported API preserved (for source compatibility):
 *   AboutSettingsPageProps  — original controlled-component props interface
 *   AboutSettingsPage       — named export (now delegates to the screen component)
 */

import { ChevronLeft, Sparkles, FileText, ShieldCheck } from "lucide-react-native";
import { router } from "expo-router";
import React, { memo } from "react";
import {
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

export interface AboutSettingsPageProps {
  open:    boolean;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — sourced from the web component
// ─────────────────────────────────────────────────────────────────────────────

const BG          = "#000000";
const BORDER      = "rgba(255,255,255,0.06)";
const TEXT_PRI    = "rgba(255,255,255,0.90)";
const TEXT_MUT    = "rgba(148,163,184,0.65)";
const ICON_BACK   = "rgba(255,255,255,0.72)";

// Row layout constants — preserved from source
const ROW_HEIGHT    = 72;
const ICON_SIZE     = 52;
const ROW_GAP       = 16;
const ROW_PADDING   = 24;
const DIVIDER_INSET = ROW_PADDING + ICON_SIZE + ROW_GAP;

type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

// ─────────────────────────────────────────────────────────────────────────────
// Divider
// ─────────────────────────────────────────────────────────────────────────────

function Divider() {
  return (
    <View style={[styles.divider, { marginLeft: DIVIDER_INSET }]} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Row — icon + label + optional right content
// ─────────────────────────────────────────────────────────────────────────────

function Row({
  Icon, iconBg, iconColor, label, rightContent, last,
}: {
  Icon:          LucideIcon;
  iconBg:        string;
  iconColor:     string;
  label:         string;
  rightContent?: React.ReactNode;
  last?:         boolean;
}) {
  return (
    <>
      <View style={[styles.row, { paddingHorizontal: ROW_PADDING, height: ROW_HEIGHT, gap: ROW_GAP }]}>
        <View style={[styles.iconBox, { width: ICON_SIZE, height: ICON_SIZE, backgroundColor: iconBg }]}>
          <Icon size={22} color={iconColor} />
        </View>
        <Text style={[styles.rowLabel, { flex: 1 }]}>{label}</Text>
        {rightContent != null && (
          <View style={styles.rowRight}>{rightContent}</View>
        )}
      </View>
      {!last && <Divider />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen component
// ─────────────────────────────────────────────────────────────────────────────

function AboutScreen() {
  const insets = useSafeAreaInsets();

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
          <ChevronLeft size={18} color={ICON_BACK} />
        </Pressable>

        <Text style={styles.headerTitle}>About</Text>

        {/* Spacer — keeps title centred (mirrors web's empty 40px div) */}
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
        {/* ── App branding ─────────────────────────────────────────────── */}
        {/* Preserved from source: 40px top padding, "arealab" wordmark */}
        <View style={styles.brandingBlock}>
          <Text style={styles.brandingWordmark}>
            <Text style={styles.brandingArea}>area</Text>
            <Text style={styles.brandingLab}>lab</Text>
          </Text>
          <Text style={styles.brandingBy}>by Revanth chinnithi</Text>
        </View>

        {/* ── Rows ─────────────────────────────────────────────────────── */}
        <Row
          Icon={Sparkles}
          iconBg="rgba(165,180,252,0.14)"
          iconColor="#a5b4fc"
          label="Version"
          rightContent={
            <Text style={styles.rightLabel}>1.0.0</Text>
          }
        />

        <Row
          Icon={FileText}
          iconBg="rgba(96,165,250,0.14)"
          iconColor="#60a5fa"
          label="Terms of Service"
        />

        <Row
          Icon={ShieldCheck}
          iconBg="rgba(52,211,153,0.14)"
          iconColor="#34d399"
          label="Privacy Policy"
          last
        />
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Named export — preserved for source compatibility
// The controlled-component interface is kept; as an Expo Router screen it
// receives no props from a parent — navigation replaces open/onClose.
// ─────────────────────────────────────────────────────────────────────────────

export const AboutSettingsPage = memo(AboutScreen);

// ─────────────────────────────────────────────────────────────────────────────
// Default export — Expo Router screen entry point
// ─────────────────────────────────────────────────────────────────────────────

export default AboutScreen;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: BG,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    height:            60,
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "space-between",
    paddingHorizontal: 12,
    backgroundColor:   BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
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
    // paddingBottom set inline with safe-area inset
  },

  // ── Branding block ────────────────────────────────────────────────────────
  // Preserved: 40px top, 24px horizontal, 32px bottom, gap:6, centered
  brandingBlock: {
    alignItems:        "center",
    paddingTop:        40,
    paddingHorizontal: 24,
    paddingBottom:     32,
    gap:               6,
  },
  brandingWordmark: {
    fontSize:      26,
    fontWeight:    "800",
    letterSpacing: -0.5,
  },
  brandingArea: {
    color: "#a5b4fc",
  },
  brandingLab: {
    color:      "rgba(255,255,255,0.55)",
    fontStyle:  "italic",
  },
  brandingBy: {
    fontSize: 12,
    color:    "rgba(148,163,184,0.50)",
  },

  // ── Row ───────────────────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems:    "center",
  },
  iconBox: {
    borderRadius:    16,
    flexShrink:      0,
    alignItems:      "center",
    justifyContent:  "center",
  },
  rowLabel: {
    fontSize:   15,
    fontWeight: "600",
    color:      TEXT_PRI,
  },
  rowRight: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
    flexShrink:    0,
  },
  rightLabel: {
    fontSize: 13,
    color:    TEXT_MUT,
  },

  // ── Divider ───────────────────────────────────────────────────────────────
  divider: {
    height:          1,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
});
