/**
 * lib/analytics.ts — Production analytics abstraction layer.
 *
 * This module provides a provider-agnostic analytics API. Wire in your
 * chosen analytics SDK by implementing the adapter below.
 *
 * Recommended providers (all support React Native / Expo):
 *   • PostHog      — posthog-react-native (privacy-focused, self-hostable)
 *   • Mixpanel     — mixpanel-react-native
 *   • Amplitude    — @amplitude/analytics-react-native
 *   • Firebase     — @react-native-firebase/analytics
 *
 * IMPORTANT — Metro / pnpm compatibility note:
 * ─────────────────────────────────────────────
 * This monorepo sets `unstable_enablePackageExports: false` in metro.config.js
 * to work around pnpm symlink resolution loops. Some analytics packages use
 * package.json `exports` sub-path entries (e.g. `@posthog/core/surveys`) that
 * Metro cannot resolve with that setting. Before installing a provider, verify
 * it resolves cleanly with Metro in this configuration, or add a resolver stub
 * in metro.config.js for any missing sub-path.
 *
 * To activate a provider:
 *   1. Install the SDK: `pnpm add <package>`
 *   2. Implement `initProvider()` and the event methods below in the
 *      "─── Provider adapter ───" section.
 *   3. Set the required EXPO_PUBLIC_* key in EAS Secrets.
 *
 * Privacy rules (enforced at call sites — never pass these values):
 * ❌ Passwords, tokens, API keys
 * ❌ Trading positions, P&L, account balances
 * ❌ Broker credentials or account identifiers
 * ✅ Generic screen names ("Charts", "Positions", "Settings")
 * ✅ Anonymous session events (app_open, session_start, session_end)
 * ✅ Non-financial feature interactions ("changed_chart_interval")
 */

// ─── Provider adapter ────────────────────────────────────────────────────────
//
// Replace every `/* TODO */` with your chosen SDK call.
// All methods are no-ops until you implement them — the app runs fine
// without analytics configured.

type Properties = Record<string, string | number | boolean>;

let _initialized = false;

function initProvider(_apiKey: string, _host: string): void {
  // TODO: initialize your analytics SDK here.
  // Example (PostHog — after verifying Metro compatibility):
  //   const client = new PostHog(_apiKey, { host: _host, flushAt: 20, flushInterval: 30_000 });
  //   _client = client;
  _initialized = true;
}

function providerScreen(_name: string): void {
  // TODO: posthog.screen(name) / mixpanel.track("Screen View", { screen: name }) / etc.
}

function providerCapture(_event: string, _props?: Properties): void {
  // TODO: posthog.capture(event, props) / mixpanel.track(event, props) / etc.
}

function providerIdentify(_userId: string): void {
  // TODO: posthog.identify(userId) / mixpanel.identify(userId) / etc.
}

function providerReset(): void {
  // TODO: posthog.reset() / mixpanel.reset() / etc.
}

async function providerFlush(): Promise<void> {
  // TODO: await posthog.flush() / etc.
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Initialize the analytics provider. Call once at module level in
 * app/_layout.tsx before any component renders.
 * No-ops in __DEV__ or when EXPO_PUBLIC_ANALYTICS_KEY is not configured.
 */
export function initAnalytics(): void {
  const apiKey = process.env.EXPO_PUBLIC_ANALYTICS_KEY;
  if (!apiKey || __DEV__) return;

  const host =
    process.env.EXPO_PUBLIC_ANALYTICS_HOST ?? "https://us.i.posthog.com";

  initProvider(apiKey, host);
}

/**
 * Track a screen view. Call from Expo Router layout files or useFocusEffect.
 *
 * @param screenName Human-readable screen name — no user data, no symbol names.
 * @example trackScreen("Charts");
 */
export function trackScreen(screenName: string): void {
  if (!_initialized) return;
  providerScreen(screenName);
}

/**
 * Track a custom event.
 *
 * @param event      Snake_case event name ("changed_chart_interval").
 * @param properties Non-sensitive key/value context.
 * @example trackEvent("connected_broker", { broker: "delta" });
 */
export function trackEvent(event: string, properties?: Properties): void {
  if (!_initialized) return;
  providerCapture(event, properties);
}

/** Emit a session_start event. Call when the app enters the foreground. */
export function trackSessionStart(): void {
  if (!_initialized) return;
  providerCapture("session_start");
}

/** Emit a session_end event. Call when the app enters the background. */
export function trackSessionEnd(): void {
  if (!_initialized) return;
  providerCapture("session_end");
}

/**
 * Identify the current user by an opaque server-assigned ID.
 * Never pass emails, names, phone numbers, or financial account identifiers.
 */
export function identifyUser(userId: string): void {
  if (!_initialized) return;
  providerIdentify(userId);
}

/** Reset the analytics identity. Call on sign-out. */
export function resetAnalyticsUser(): void {
  if (!_initialized) return;
  providerReset();
}

/**
 * Flush queued events. Call before the app suspends to avoid losing buffered
 * events. Safe to call even when analytics are not configured.
 */
export async function flushAnalytics(): Promise<void> {
  if (!_initialized) return;
  await providerFlush();
}
