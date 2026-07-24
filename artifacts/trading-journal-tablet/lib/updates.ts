/**
 * lib/updates.ts — Expo OTA update management.
 *
 * Strategy
 * ────────
 * • Updates are checked on app launch and on foreground resume.
 * • A found update is downloaded silently in the background.
 * • The update is NOT applied immediately — it takes effect on the next
 *   cold start, preserving the current user session.
 * • Force-updating the running session is explicitly avoided per product
 *   requirements: a trader mid-session must never be interrupted.
 *
 * Safety
 * ──────
 * • Disabled in __DEV__ and when expo-updates is not enabled (bare workflow,
 *   Expo Go, or a build without the updates plugin).
 * • All errors are silently swallowed — update failures must never crash
 *   or degrade the app.
 * • Rollback is automatic: Expo's runtime version policy ensures that an
 *   update incompatible with the native binary is never applied.
 *
 * Configuration
 * ─────────────
 * app.json:
 *   "runtimeVersion": { "policy": "appVersion" }
 *   "updates": { "url": "https://u.expo.dev/YOUR_EAS_PROJECT_ID" }
 *
 * eas.json:
 *   build.production.channel  = "production"
 *   build.preview.channel     = "preview"
 *
 * Publish an update:
 *   eas update --channel production --message "Patch notes here"
 */

import * as Updates from "expo-updates";
import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

// ─── OTA update hook ─────────────────────────────────────────────────────────

/**
 * Mount this hook once in the root layout. It:
 *  1. Checks for a pending update on mount.
 *  2. Re-checks whenever the app returns to the foreground.
 *  3. Downloads any available update silently in the background.
 *  4. Does NOT force-reload the running session.
 */
export function useOTAUpdates(): void {
  useEffect(() => {
    // Expo Updates is disabled in Expo Go, __DEV__, and bare workflow builds
    // that were not built with `eas build`. Guard before calling any Updates API.
    if (__DEV__ || !Updates.isEnabled) return;

    const checkAndDownload = async (): Promise<void> => {
      try {
        const result = await Updates.checkForUpdateAsync();
        if (result.isAvailable) {
          // Download silently — the update is staged for the next cold start.
          await Updates.fetchUpdateAsync();
          // Do NOT call Updates.reloadAsync() here.
          // Reloading mid-session interrupts a trader's workflow.
          // The staged update is applied automatically on the next app launch.
        }
      } catch {
        // Silently ignore network errors, server unavailability, and all other
        // update failures. The app must continue running regardless.
      }
    };

    // Initial check on mount.
    void checkAndDownload();

    // Re-check on foreground resume. React Native fires "active" when the app
    // returns from background on both iOS and Android.
    const handleAppState = (next: AppStateStatus): void => {
      if (next === "active") void checkAndDownload();
    };

    const subscription = AppState.addEventListener("change", handleAppState);
    return () => subscription.remove();
  }, []);
}
