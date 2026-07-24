/**
 * app/settings/security.tsx — Security Settings Screen
 *
 * Migration of: artifacts/trading-journal/src/components/SecuritySettingsPage.tsx
 * Phase 11.2 — Settings Sub-Pages (React → React Native)
 *
 * Web → RN replacements
 * ──────────────────────────────────────────────────────────────────────────
 *   Controlled component (open/onClose props) → Expo Router screen
 *   CSS translateX slide animation            → Stack navigator animation
 *   div / span / p                            → View / Text
 *   button (Back)                             → Pressable + router.back()
 *   position:fixed inset:0                   → full-screen View
 *   overflowY:auto                            → ScrollView
 *   lucide-react icons                        → Ionicons equivalents
 *   window.addEventListener("keydown")        → removed (no keyboard on mobile)
 *   requestAnimationFrame CSS gate            → removed
 *   rendered/visible mount-gate state         → removed
 *
 * Business logic preserved exactly:
 *   Section: Account Protection
 *   Rows: Password (Set), Two-Factor Authentication (Off),
 *         API Keys (Managed in Connections), Active Sessions (1 device)
 *   Row layout constants: ROW_HEIGHT=72, ICON_SIZE=52, ROW_GAP=16,
 *                         ROW_PADDING=24, DIVIDER_INSET=92
 *   Icon colours: green (#34d399), purple (#a78bfa),
 *                 yellow (#fde047), blue (#60a5fa)
 *
 * Exported API preserved:
 *   SecuritySettingsPageProps  — original controlled-component props
 *   SecuritySettingsPage       — named export (delegates to screen)
 */

import { Ionicons } from "@expo/vector-icons";
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

export interface SecuritySettingsPageProps {
  open:    boolean;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants — preserved verbatim from source
// ─────────────────────────────────────────────────────────────────────────────

const ROW_HEIGHT    = 72;
const ICON_SIZE     = 52;
const ROW_GAP       = 16;
const ROW_PADDING   = 24;
const DIVIDER_INSET = ROW_PADDING + ICON_SIZE + ROW_GAP; // 92

// ─────────────────────────────────────────────────────────────────────────────
// SectionLabel
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({
  children, first,
}: {
  children: React.ReactNode;
  first?:   boolean;
}) {
  return (
    <Text style={[styles.sectionLabel, first ? styles.sectionLabelFirst : styles.sectionLabelRest]}>
      {children}
    </Text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Divider — marginLeft aligns with title start
// ─────────────────────────────────────────────────────────────────────────────

function Divider() {
  return <View style={[styles.divider, { marginLeft: DIVIDER_INSET }]} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row — display-only info row (no navigation)
// ─────────────────────────────────────────────────────────────────────────────

function Row({
  ionName, iconBg, iconColor, label, rightContent, last,
}: {
  ionName:       React.ComponentProps<typeof Ionicons>["name"];
  iconBg:        string;
  iconColor:     string;
  label:         string;
  rightContent?: React.ReactNode;
  last?:         boolean;
}) {
  return (
    <>
      <View
        style={[
          styles.row,
          {
            paddingHorizontal: ROW_PADDING,
            height:            ROW_HEIGHT,
            gap:               ROW_GAP,
          },
        ]}
      >
        <View
          style={[
            styles.iconBox,
            { width: ICON_SIZE, height: ICON_SIZE, backgroundColor: iconBg },
          ]}
        >
          <Ionicons name={ionName} size={22} color={iconColor} />
        </View>

        <Text style={styles.rowLabel}>{label}</Text>

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

function SecurityScreen() {
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
          <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.72)" />
        </Pressable>

        <Text style={styles.headerTitle}>Security</Text>

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
        {/* ── Account Protection section ─────────────────────────────────── */}
        <SectionLabel first>Account Protection</SectionLabel>

        {/* Password — rightContent: "Set" */}
        <Row
          ionName="lock-closed-outline"
          iconBg="rgba(52,211,153,0.14)"
          iconColor="#34d399"
          label="Password"
          rightContent={
            <Text style={styles.rightLabel}>Set</Text>
          }
        />

        {/* Two-Factor Authentication — rightContent: "Off" (dimmer) */}
        <Row
          ionName="phone-portrait-outline"
          iconBg="rgba(139,92,246,0.14)"
          iconColor="#a78bfa"
          label="Two-Factor Authentication"
          rightContent={
            <Text style={[styles.rightLabel, { color: "rgba(148,163,184,0.40)" }]}>Off</Text>
          }
        />

        {/* API Keys — rightContent: "Managed in Connections" */}
        <Row
          ionName="key-outline"
          iconBg="rgba(234,179,8,0.14)"
          iconColor="#fde047"
          label="API Keys"
          rightContent={
            <Text style={styles.rightLabel}>Managed in Connections</Text>
          }
        />

        {/* Active Sessions — rightContent: "1 device" (last row) */}
        <Row
          ionName="shield-checkmark-outline"
          iconBg="rgba(96,165,250,0.14)"
          iconColor="#60a5fa"
          label="Active Sessions"
          rightContent={
            <Text style={styles.rightLabel}>1 device</Text>
          }
          last
        />
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Named export — preserved for source compatibility
// ─────────────────────────────────────────────────────────────────────────────

export const SecuritySettingsPage = memo(SecurityScreen);

// ─────────────────────────────────────────────────────────────────────────────
// Default export — Expo Router screen entry point
// ─────────────────────────────────────────────────────────────────────────────

export default SecurityScreen;

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
    // paddingBottom set inline with safe area
  },

  // ── Section label ─────────────────────────────────────────────────────────
  // first: padding "24px 24px 10px"
  // rest:  padding "32px 24px 10px"
  sectionLabel: {
    fontSize:          11,
    fontWeight:        "700",
    letterSpacing:     1.1,
    textTransform:     "uppercase",
    paddingBottom:     10,
    paddingHorizontal: 24,
    color:             "rgba(148,163,184,0.40)",
    lineHeight:        11,
  },
  sectionLabelFirst: {
    paddingTop: 24,
  },
  sectionLabelRest: {
    paddingTop: 32,
  },

  // ── Row ───────────────────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems:    "center",
  },
  iconBox: {
    borderRadius:   16,
    flexShrink:     0,
    alignItems:     "center",
    justifyContent: "center",
  },
  rowLabel: {
    flex:       1,
    fontSize:   15,
    fontWeight: "600",
    color:      "rgba(255,255,255,0.90)",
  },
  rowRight: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
    flexShrink:    0,
  },
  rightLabel: {
    fontSize: 13,
    color:    "rgba(148,163,184,0.65)",
  },

  // ── Divider ───────────────────────────────────────────────────────────────
  divider: {
    height:          1,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
});
