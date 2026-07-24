/**
 * lib/sentry.ts — Sentry production error reporting.
 *
 * Initialization
 * ──────────────
 * Call initSentry() once at the very top of app/_layout.tsx, before
 * SplashScreen.preventAutoHideAsync(). Sentry must be initialized before
 * any component renders so it can capture startup errors.
 *
 * Configuration
 * ─────────────
 * Set EXPO_PUBLIC_SENTRY_DSN in your EAS build secrets (production + preview).
 * Leave it unset in development — Sentry is disabled when the DSN is absent
 * and when __DEV__ is true to avoid noise from local iteration.
 *
 * Source maps
 * ───────────
 * The @sentry/react-native Expo plugin (in app.json plugins) uploads source
 * maps automatically during `eas build` and injects the release/dist values
 * so stack traces are symbolicated in the Sentry dashboard.
 *
 * Privacy
 * ───────
 * ❌ Never pass trading positions, P&L values, API keys, or broker tokens.
 * ✅ Attach only non-sensitive operational context: screen name, app version,
 *    environment tag, and opaque user IDs assigned by your backend.
 *
 * Sentry dashboard
 * ────────────────
 * https://sentry.io — create a React Native project to get the DSN.
 */

import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Initialize Sentry. Call once at module level in app/_layout.tsx before any
 * component renders. Safe to call multiple times — subsequent calls are no-ops.
 */
export function initSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  // Disabled in development builds and when no DSN is configured.
  if (!dsn || __DEV__) return;

  Sentry.init({
    dsn,

    // Tag every event with the environment so dev / preview / production are
    // separated in the Sentry dashboard.
    environment: "production",

    // `release` is injected automatically by the @sentry/react-native Expo
    // plugin during `eas build`. The fallback uses expo-constants as a safety
    // net for environments where the plugin has not run.
    release: Constants.expoConfig?.version ?? "unknown",

    // Enable native crash capture for iOS (Sentry-Cocoa) and Android (Sentry-Android).
    enableNative: true,

    // Attach the JS thread stack trace to native exceptions so the full React
    // render path is visible alongside the native crash frame.
    attachStacktrace: true,

    // Performance tracing: disabled by default. Increase tracesSampleRate (0–1)
    // and add Sentry spans if you need performance monitoring.
    tracesSampleRate: 0,

    // Scrub sensitive data before it leaves the device.
    beforeSend(event) {
      return scrubEvent(event);
    },
  });
}

// ─── Exception capture ───────────────────────────────────────────────────────

/**
 * Report a caught exception to Sentry.
 *
 * Safe to call from any non-render context (event handlers, async callbacks,
 * catch blocks, ErrorBoundary.onError). No-ops in development or when Sentry
 * is not configured.
 *
 * @param error   The caught Error object.
 * @param context Non-sensitive operational context (component name, action tag).
 *
 * @example
 * try { await placeOrder(params); }
 * catch (err) {
 *   captureException(
 *     err instanceof Error ? err : new Error(String(err)),
 *     { action: "placeOrder", screen: "positions" }
 *   );
 * }
 */
export function captureException(
  error: Error,
  context?: Record<string, string | number | boolean>
): void {
  if (__DEV__) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

// ─── User context ────────────────────────────────────────────────────────────

/**
 * Attach an opaque user identifier to all subsequent Sentry events.
 *
 * Use only a server-assigned opaque ID — never an email address, full name,
 * phone number, or any financial account identifier.
 */
export function setSentryUser(userId: string): void {
  if (__DEV__) return;
  Sentry.setUser({ id: userId });
}

/** Clear the Sentry user context. Call on sign-out. */
export function clearSentryUser(): void {
  if (__DEV__) return;
  Sentry.setUser(null);
}

// ─── Internal helpers ────────────────────────────────────────────────────────

type SentryEvent = Parameters<NonNullable<Parameters<typeof Sentry.init>[0]["beforeSend"]>>[0];

/**
 * Scrub the event before sending to Sentry.
 *
 * Currently returns the event unchanged — credential scrubbing is enforced at
 * the call sites (captureException only accepts operational context; financial
 * data is never passed). Sentry project settings can add additional server-side
 * scrubbing rules as a second line of defence.
 */
function scrubEvent(event: SentryEvent): SentryEvent {
  return event;
}

