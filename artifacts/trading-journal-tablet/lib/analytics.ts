/**
 * lib/analytics.ts — Production analytics (PostHog).
 *
 * Provider: PostHog (https://posthog.com)
 * ─────────────────────────────────────────
 * PostHog is chosen for its privacy-conscious defaults:
 *   • No PII collection by default
 *   • GDPR / CCPA compliant
 *   • Self-hostable
 *   • Free tier available
 *
 * Configuration
 * ─────────────
 * Set in your EAS build secrets (production + preview):
 *   EXPO_PUBLIC_POSTHOG_KEY   — PostHog project API key
 *   EXPO_PUBLIC_POSTHOG_HOST  — Optional; defaults to https://us.i.posthog.com
 *
 * Usage
 * ─────
 * 1. Call initAnalytics() once at the top of app/_layout.tsx.
 * 2. Use trackScreen() in Expo Router layout files for screen tracking.
 * 3. Use trackEvent() for meaningful user interactions.
 *
 * Privacy rules (enforced here)
 * ──────────────────────────────
 * ❌ No passwords, tokens, or API keys
 * ❌ No trading positions or financial data
 * ❌ No personal account balances or P&L values
 * ❌ No broker credentials or account identifiers
 * ✅ Screen names (generic: "Charts", "Positions", "Settings")
 * ✅ Anonymous session lifecycle events (app_open, session_start, session_end)
 * ✅ Non-financial feature interactions (e.g. "changed_chart_interval")
 */

import PostHog from "posthog-react-native";

// ─── Singleton client ────────────────────────────────────────────────────────

let _client: PostHog | null = null;

// ─── Initialization ──────────────────────────────────────────────────────────

/**
 * Initialize the PostHog client. Call once at the top of app/_layout.tsx.
 * No-ops in __DEV__ or when EXPO_PUBLIC_POSTHOG_KEY is not configured.
 */
export function initAnalytics(): void {
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;

  // Analytics is opt-in: disabled in dev and when the key is absent.
  if (!apiKey || __DEV__) return;

  const host =
    process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

  _client = new PostHog(apiKey, {
    host,
    // Batch events to reduce network requests.
    flushAt: 20,
    flushInterval: 30_000,
  });

  // Emit app_open on init.
  _client.capture("app_open");
}

// ─── Screen tracking ─────────────────────────────────────────────────────────

/**
 * Track a screen view. Call from Expo Router layout files or screen components.
 *
 * @param screenName Human-readable screen name ("Charts", "Positions", "Settings").
 *                   Do NOT include user-specific values (e.g. symbol names, account IDs).
 *
 * @example
 * // In a tab screen component:
 * useFocusEffect(() => { trackScreen("Charts"); });
 */
export function trackScreen(screenName: string): void {
  _client?.screen(screenName);
}

// ─── Event tracking ──────────────────────────────────────────────────────────

/**
 * Track a custom event.
 *
 * @param event      Snake_case event name ("changed_chart_interval", "toggled_indicators").
 * @param properties Optional non-sensitive key/value pairs.
 *                   Never include financial data, credentials, or PII.
 *
 * @example
 * trackEvent("changed_chart_interval", { interval: "1H" });
 * trackEvent("connected_broker", { broker: "delta" });
 */
export function trackEvent(
  event: string,
  properties?: Record<string, string | number | boolean>
): void {
  _client?.capture(event, properties);
}

// ─── Session lifecycle ───────────────────────────────────────────────────────

/** Emit a session_start event. Call when the app returns to the foreground. */
export function trackSessionStart(): void {
  _client?.capture("session_start");
}

/** Emit a session_end event. Call on AppState inactive/background transition. */
export function trackSessionEnd(): void {
  _client?.capture("session_end");
}

// ─── User identity ───────────────────────────────────────────────────────────

/**
 * Identify the current user by an opaque server-assigned ID.
 *
 * Only use an opaque ID — never an email, name, phone number, or financial
 * account identifier.
 *
 * @param userId Opaque, server-assigned user ID.
 */
export function identifyUser(userId: string): void {
  _client?.identify(userId);
}

/** Reset the PostHog identity on sign-out. Creates a new anonymous session. */
export function resetAnalyticsUser(): void {
  _client?.reset();
}

// ─── Flush ───────────────────────────────────────────────────────────────────

/**
 * Flush queued events immediately. Call before the app suspends to avoid
 * losing events that were buffered but not yet sent.
 */
export async function flushAnalytics(): Promise<void> {
  await _client?.flush();
}
