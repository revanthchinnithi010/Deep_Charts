/**
 * app/settings/index.tsx — Settings Root Screen
 *
 * Migration of: artifacts/trading-journal/src/pages/settings.tsx
 * Phase 11.1 — Settings (Pass A — Split into Nested Expo Router Routes)
 *
 * Web → RN replacements (routing layer only)
 * ──────────────────────────────────────────────────────────────────────────
 *   React Router / wouter       → expo-router (router.back())
 *   div / span / button         → View / Text / Pressable
 *   CSS overflow-y scroll       → ScrollView
 *   CSS safe-area / padding     → useSafeAreaInsets
 *   lucide-react ChevronLeft    → Ionicons chevron-back
 *   Framer Motion PageTransition → plain ScrollView (animation deferred)
 *
 * Source structure preserved
 * ──────────────────────────────────────────────────────────────────────────
 * The web Settings page is a single flat route with these sections (in order):
 *   0. System Health          — SystemHealthPanel
 *   1. Market Data Providers  — DeltaPanel
 *   2. Backend Server IP      — ServerIpPanel
 *   3. Telegram Alerts        — TelegramPanel + notification switches
 *   4. Appearance             — toggle list
 *   5. Trading Preferences    — input fields + toggle list + Save button
 *   6. Backup & Restore       — BackupPanel
 *
 * Section content is NOT migrated in this phase.
 * Each section is represented by a clearly-labelled placeholder comment.
 * Content migration happens in Phase 11.2.
 *
 * Navigation hierarchy
 * ──────────────────────────────────────────────────────────────────────────
 *   app/_layout.tsx (root Stack)
 *     └── settings (nested Stack — app/settings/_layout.tsx)
 *           └── index  ← this file
 *
 * To navigate here:
 *   router.push("/settings")          — push onto the current stack
 *   router.replace("/settings")       — replace (no back arrow in some flows)
 */

import { ChevronLeft } from "lucide-react-native";
import { router } from "expo-router";
import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — sourced from the web settings.tsx colour palette
// ─────────────────────────────────────────────────────────────────────────────

const BG          = "#000000";
const BG_SURFACE  = "rgba(12,14,19,0.97)";
const BORDER      = "rgba(255,255,255,0.08)";
const TEXT_PRI    = "#EDF0F6";
const TEXT_MUT    = "rgba(148,163,184,0.60)";
const ICON_BACK   = "rgba(148,163,184,0.80)";

// ─────────────────────────────────────────────────────────────────────────────
// Settings Screen
//
// Renders the shared layout (header + scroll container) that wraps all
// Settings sections.  Section content is injected in Phase 11.2.
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={22} color={ICON_BACK} />
        </Pressable>

        <View style={styles.headerTitles}>
          {/*
            Title and subtitle preserved verbatim from web settings.tsx:
              h1: "Settings"
              p:  "Manage connections, preferences, and trading parameters."
          */}
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>
            Manage connections, preferences, and trading parameters.
          </Text>
        </View>
      </View>

      {/* ── Scrollable content area ────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/*
          ── Section 0: System Health ─────────────────────────────────────
          Source: SystemHealthPanel component (lines 465–539 in settings.tsx)
          SectionHeader: icon=ShieldCheck, title="System Status",
            description="Real-time health of database, market feeds, and notifications"
          Phase 11.2: migrate SystemHealthPanel
        */}

        {/*
          ── Section 1: Market Data Providers ─────────────────────────────
          Source: DeltaPanel component (lines 95–290 in settings.tsx)
          SectionHeader: icon=Radio, title="Market Data Providers",
            description="Manual connect — feeds only start when you click Connect"
          Phase 11.2: migrate DeltaPanel
        */}

        {/*
          ── Section 2: Backend Server IP ─────────────────────────────────
          Source: ServerIpPanel component (lines 548–692 in settings.tsx)
          SectionHeader: icon=Globe, title="Backend Server IP",
            description="Detect the Replit server's outbound IP for Delta Exchange India whitelisting"
          Phase 11.2: migrate ServerIpPanel
        */}

        {/*
          ── Section 3: Telegram Alerts ───────────────────────────────────
          Source: TelegramPanel component (lines 293–455 in settings.tsx)
            + notification switch list (lines 858–876)
          SectionHeader: icon=Bell, title="Telegram Alerts",
            description="Get price alerts and daily summaries in your Telegram chat"
          Phase 11.2: migrate TelegramPanel + notification toggles
        */}

        {/*
          ── Section 4: Appearance ────────────────────────────────────────
          Source: toggle list (lines 886–904 in settings.tsx)
          SectionHeader: icon=Palette, title="Appearance",
            description="Display and layout preferences"
          Toggles: Dark theme · Compact trade table · Show broker column ·
                   Animated price tickers · Show change percentage
          Phase 11.2: migrate appearance toggle list
        */}

        {/*
          ── Section 5: Trading Preferences ──────────────────────────────
          Source: input fields + toggle list + Save button (lines 913–955 in settings.tsx)
          SectionHeader: icon=Zap, title="Trading Preferences",
            description="Default values for trade entry and risk management"
          Fields: Account Size ($) · Max Risk Per Trade (%) · Daily Loss Limit ($)
          Toggles: Default trade direction · Auto-calculate position size ·
                   Show R:R calculator · Require setup tag
          Phase 11.2: migrate trading preferences form
        */}

        {/*
          ── Section 6: Backup & Restore ──────────────────────────────────
          Source: BackupPanel component (lines 695–798 in settings.tsx)
          SectionHeader: icon=Database, title="Backup & Restore",
            description="Export your full config to JSON — import on any device or Replit account"
          Phase 11.2: migrate BackupPanel (export/import JSON)
        */}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: BG,
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection:   "row",
    alignItems:      "flex-start",
    paddingHorizontal: 16,
    paddingVertical:   12,
    backgroundColor: BG_SURFACE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 12,
  },
  backBtn: {
    marginTop:       2,
    width:           32,
    height:          32,
    alignItems:      "center",
    justifyContent:  "center",
    borderRadius:    8,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  headerTitles: {
    flex: 1,
  },

  // ── Typography — mirrors web h1 + p exactly ──────────────────────────────
  //   h1: text-2xl font-black tracking-tight text-white
  //   p:  text-sm text-muted-foreground
  title: {
    fontSize:    22,
    fontWeight:  "900",
    letterSpacing: -0.5,
    color:       TEXT_PRI,
    lineHeight:  28,
  },
  subtitle: {
    fontSize:    13,
    color:       TEXT_MUT,
    marginTop:   2,
    lineHeight:  18,
  },

  // ── Scroll area ──────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop:        16,
    gap:               16,
  },
});
