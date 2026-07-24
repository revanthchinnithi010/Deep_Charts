# TradeVault — Production Release Checklist

Use this checklist before every App Store / Google Play submission.

Legend: ✅ Done  ❌ Blocked / Missing  ⬜ Not yet checked  ⚠️ Needs attention

---

## 1. App Icon & Adaptive Icons

- [ ] iOS icon: `./assets/images/icon.png` (1024 × 1024 px, no alpha, no rounded corners)
- [ ] Android adaptive icon foreground: `./assets/images/icon.png` — confirmed in `app.json`
- [ ] Android adaptive icon background color: `#0d1117` — confirmed in `app.json`
- [ ] Android monochrome icon: `./assets/images/icon.png` — confirmed in `app.json` (Android 13+)
- [ ] Icon has transparent padding (safe zone: content in inner 66% of canvas)
- [ ] Icon renders correctly at 20 px, 29 px, 40 px, 60 px, 76 px, 83.5 px, 1024 px
- [ ] Adaptive icon tested in Android launcher (circular, rounded square, squircle masks)
- [ ] No copyrighted symbols, trademarked logos, or store-policy violations in icon

---

## 2. Splash Screen

- [ ] `expo-splash-screen` plugin configured in `app.json` with correct image and background
- [ ] Background color matches app background (`#0d1117`) — no white flash on launch
- [ ] `SplashScreen.preventAutoHideAsync()` called before any component renders
- [ ] Splash hidden only after fonts are loaded (or `FONT_TIMEOUT_MS` elapses)
- [ ] No visible flash between splash and first app frame on cold start
- [ ] Dark-mode splash config present in `app.json` → `plugins.expo-splash-screen.dark`
- [ ] Tested on physical device (simulators mask GPU-related flash)

---

## 3. Build Configuration

- [ ] `app.json` — `version` bumped for this release
- [ ] `app.json` — `runtimeVersion.policy` set to `"appVersion"`
- [ ] `app.json` — `updates.url` populated with real EAS Project ID (replace `YOUR_EAS_PROJECT_ID`)
- [ ] `eas.json` — `production` channel set to `"production"`
- [ ] `eas.json` — `autoIncrement: true` enabled for production build
- [ ] `eas.json` — `submit.production.ios.*` fields filled in (appleId, ascAppId, appleTeamId)
- [ ] `eas.json` — `submit.production.android.serviceAccountKeyPath` set
- [ ] EAS CLI authenticated (`eas whoami`)
- [ ] EAS project linked (`eas project:info`)
- [ ] Hermes enabled (`"newArchEnabled": true` in `app.json` — Hermes is default with New Arch)
- [ ] Minification: enabled by default in EAS production profile
- [ ] Source maps: uploaded automatically by `@sentry/react-native` Expo plugin during `eas build`

---

## 4. Environment Variables

### Required in EAS Secrets (production + preview)

- [ ] `EXPO_PUBLIC_API_BASE_URL` — Production API base URL
- [ ] `EXPO_PUBLIC_SENTRY_DSN` — Sentry DSN (from sentry.io project settings)
- [ ] `EXPO_PUBLIC_ANALYTICS_KEY` — Analytics provider API key (see `lib/analytics.ts`)
- [ ] `EXPO_PUBLIC_ANALYTICS_HOST` — Analytics host (optional, provider-dependent)

### Optional

- [ ] `EXPO_PUBLIC_DISABLE_MOCK_DATA` — Set to `"true"` in production/preview EAS envs

### Must NOT be in `EXPO_PUBLIC_*`

- [ ] No broker API keys as `EXPO_PUBLIC_*` (they are bundled into the binary and visible)
- [ ] No broker secrets as `EXPO_PUBLIC_*`
- [ ] No database connection strings as `EXPO_PUBLIC_*`

---

## 5. Sentry Integration

- [ ] `@sentry/react-native` installed
- [ ] `"@sentry/react-native"` in `app.json` plugins
- [ ] `initSentry()` called at module level in `app/_layout.tsx` before `preventAutoHideAsync()`
- [ ] `captureException` wired into `<ErrorBoundary onError={...}>`
- [ ] `EXPO_PUBLIC_SENTRY_DSN` set in EAS Secrets for production + preview
- [ ] Source maps verified in Sentry dashboard after first production build
- [ ] Sentry environment tag is `"production"` in production builds
- [ ] No financial data (positions, P&L, balances) logged to Sentry
- [ ] No API keys or broker tokens logged to Sentry

---

## 6. Analytics (PostHog)

- [ ] Analytics provider SDK installed (see `lib/analytics.ts` for instructions)
- [ ] `initAnalytics()` called at module level in `app/_layout.tsx`
- [ ] `EXPO_PUBLIC_ANALYTICS_KEY` set in EAS Secrets for production + preview
- [ ] Analytics disabled in `__DEV__` (enforced in `lib/analytics.ts`)
- [ ] `trackScreen()` called on meaningful screens
- [ ] `trackSessionStart()` / `trackSessionEnd()` wired to AppState
- [ ] No financial data tracked (positions, P&L, balances)
- [ ] No credentials tracked (API keys, tokens, passwords)
- [ ] Privacy Policy updated to reflect analytics collection

---

## 7. OTA Updates (expo-updates)

- [ ] `expo-updates` installed and `"expo-updates"` in `app.json` plugins
- [ ] `app.json` → `updates.url` points to real EAS project (`https://u.expo.dev/<PROJECT_ID>`)
- [ ] `app.json` → `runtimeVersion.policy: "appVersion"` configured
- [ ] `useOTAUpdates()` mounted in `RootLayout` in `app/_layout.tsx`
- [ ] Update check fires on app launch and foreground resume
- [ ] Updates download silently — no force-reload on active session
- [ ] Update applies on next cold start
- [ ] EAS Update channel (`production`) published before release: `eas update --channel production`
- [ ] Rollback tested: old binary still runs if update fails to download

---

## 8. Security Audit

- [ ] No `console.log` in production paths (informational logs wrapped in `__DEV__`)
- [ ] `console.error` / `console.warn` retained for error-level signals (captured by Sentry)
- [ ] No plaintext secrets, tokens, or API keys in source code
- [ ] No `EXPO_PUBLIC_*` variables holding broker credentials or private keys
- [ ] AsyncStorage does not store unencrypted broker API secrets
- [ ] Debug modal (`ErrorFallback` stack trace modal) is `__DEV__`-gated — confirmed
- [ ] Mock data layer (`DEV_MODE`) is `false` in production (uses `__DEV__` — confirmed)
- [ ] No hardcoded development URLs (dev domain, localhost) in production code
- [ ] WebSocket URL construction does not log credentials (wrapped in `__DEV__`)
- [ ] Release signing: certificates managed by EAS (not committed to repo)
- [ ] `google-service-account.json` is in `.gitignore` and managed via EAS secrets
- [ ] Crash-safe startup: `SplashScreen.hideAsync()` has `.catch(() => {})` — confirmed

---

## 9. Store Assets

### App Store (iOS)

- [ ] Screenshots captured for all required device sizes (see `STORE_METADATA.md`)
- [ ] App Preview video recorded (optional)
- [ ] Feature graphic not required for App Store
- [ ] All metadata fields filled in `STORE_METADATA.md`
- [ ] Privacy Nutrition Labels filled in App Store Connect
- [ ] Export Compliance answered (app uses standard HTTPS encryption → "No")
- [ ] IDFA declaration answered

### Google Play (Android)

- [ ] Feature Graphic: 1024 × 500 px
- [ ] Hi-res icon: 512 × 512 px
- [ ] Screenshots for phone and 10" tablet
- [ ] Data Safety form completed in Play Console
- [ ] Content rating questionnaire completed
- [ ] Privacy Policy URL entered in Play Console

---

## 10. Build Validation

- [ ] `pnpm run typecheck` — zero TypeScript errors
- [ ] `eas build --platform ios --profile production` — build succeeds
- [ ] `eas build --platform android --profile production` — build succeeds
- [ ] iOS `.ipa` installed on physical device — app launches without crash
- [ ] Android `.aab` installed on physical device — app launches without crash
- [ ] No startup crash in Sentry within 5 minutes of installing production build

---

## 11. Smoke Testing (Production Build)

Test on physical devices — not simulator/emulator only.

### Core Flows

- [ ] App launches from cold start — no crash, no white flash
- [ ] Splash screen transitions smoothly into app
- [ ] Authentication flow completes successfully
- [ ] Charts load and render for at least one symbol
- [ ] Real-time price feed connects (WebSocket)
- [ ] Broker connection flow works end-to-end
- [ ] Position list loads
- [ ] Alerts list loads
- [ ] Settings screen opens and saves changes
- [ ] Sign out clears session and returns to auth screen

### Platform-Specific

- [ ] iOS: Swipe-back gesture works on all stack screens
- [ ] iOS: Safe area insets respected on iPhone and iPad
- [ ] Android: Back button behaves correctly on all screens
- [ ] Android: Edge-to-edge rendering correct (no UI under nav bar)

---

## 12. Performance Validation

- [ ] Cold start time < 3 seconds on a mid-range device
- [ ] Chart renders within 1 second of screen load
- [ ] No dropped frames (< 60 fps jank) during scroll on Positions / Alerts lists
- [ ] WebSocket reconnects within 5 seconds after network drop
- [ ] Memory usage stable after 10 minutes of active use (no leak trend in Xcode Instruments)

---

## 13. Accessibility

- [ ] All interactive elements have `accessibilityLabel` or `accessibilityRole`
- [ ] Dynamic text resizing does not break layout at Large / Extra Large
- [ ] VoiceOver (iOS) / TalkBack (Android): primary navigation is operable
- [ ] Color contrast meets WCAG AA (4.5:1 for normal text, 3:1 for large text)
- [ ] No information conveyed by color alone

---

## 14. Crash Testing

- [ ] ErrorBoundary tested: force a render error — fallback UI appears, no hard crash
- [ ] Network offline: app degrades gracefully, no unhandled promise rejection crash
- [ ] Token expiry: API returns 401 — handled gracefully, user prompted to reconnect
- [ ] OTA update failure: simulated by killing network during `fetchUpdateAsync` — app continues

---

## Final Sign-Off

| Area                     | Owner      | Status  |
|--------------------------|------------|---------|
| App icons & splash       |            | ⬜      |
| Production configuration |            | ⬜      |
| Sentry integration       |            | ⬜      |
| Analytics integration    |            | ⬜      |
| OTA updates              |            | ⬜      |
| Security audit           |            | ⬜      |
| Store assets             |            | ⬜      |
| Build validation         |            | ⬜      |
| Smoke testing            |            | ⬜      |
| Performance              |            | ⬜      |
| Accessibility            |            | ⬜      |
| Store submission         |            | ⬜      |
