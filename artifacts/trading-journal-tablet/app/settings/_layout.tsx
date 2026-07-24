/**
 * app/settings/_layout.tsx — Settings Nested Stack Layout
 *
 * Migration of: artifacts/trading-journal/src/pages/settings.tsx (routing layer)
 * Phase 11.1 — Settings (Pass A — Split into Nested Expo Router Routes)
 *
 * Architecture notes
 * ──────────────────────────────────────────────────────────────────────────
 * The web Settings page is a single flat route (/settings).  There are no
 * sub-routes in the source.  This nested Stack layout therefore declares only
 * the index screen; future phases may add named child screens (e.g. a dedicated
 * Broker settings screen) inside this directory without touching the root Stack.
 *
 * Navigation hierarchy
 *   app/_layout.tsx        (root Stack)
 *     └── settings         (this nested Stack — registered as Stack.Screen name="settings")
 *           └── index      (Settings root screen — app/settings/index.tsx)
 *
 * headerShown: false — the Settings screen renders its own custom header row
 * with a back button, matching the pattern used by pnl-analytics.tsx and
 * net-pnl-analytics.tsx.
 *
 * animation: "slide_from_right" — standard Expo Router stack push animation.
 * Overrides the root Stack's "none" default so Settings feels navigable rather
 * than appearing/disappearing abruptly.
 */

import { Stack } from "expo-router";
import React from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Settings Layout
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation:   "slide_from_right",
      }}
    >
      {/*
        index — the root Settings screen (app/settings/index.tsx).
        Renders the full Settings page: System Health, Market Data Providers,
        Backend Server IP, Telegram Alerts, Appearance, Trading Preferences,
        and Backup & Restore sections.
        Section content is migrated in Phase 11.2+.
      */}
      <Stack.Screen name="index" />
    </Stack>
  );
}
