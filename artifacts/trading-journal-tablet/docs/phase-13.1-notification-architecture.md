# Phase 13.1 — Notification Architecture Decision
**Date**: 2026-07-24  
**Status**: DECIDED  
**Scope**: Architecture analysis only — no files migrated, no TypeScript changes, no runtime changes.

---

## 1. Existing Architecture Analysis

### 1.1 Notification Sources

The application has **two distinct notification surfaces** that share the same delivery infrastructure:

| Surface | What it shows | Where |
|---|---|---|
| **In-app notification history** | Alert triggers, WS status changes | `NotificationsContext` → `NotificationPanel` |
| **Alerts management** | User-defined price/zone/trendline alerts | `alertStore` → `alerts.tsx` tab |

There is **no push notification system**. Telegram is entirely server-side (`TelegramService.ts`) — the client never receives a Telegram push directly. There are no push tokens, no APNS/FCM registration, and no background delivery anywhere in the codebase.

### 1.2 Notification Transport

```
Backend AlertEngine
      │
      │  evaluateTick() → firePriceAlert() / fireZoneAlert() / fireDrawingAlert()
      │
      ├──► TelegramService.sendAlertTriggered()   (server-side only; client never sees this)
      │
      └──► WSManager.broadcast("alert_triggered") ──► WebSocket /api/ws
                                                            │
                                                   LiveMarketContext (web: real; tablet: STUB)
                                                            │
                                                   alertEvents: AlertTriggeredMsg[]
                                                            │
                                                   NotificationsContext.useEffect
                                                            │
                                                   addNotification() → AppNotification[]
                                                            │
                                           ┌────────────────┴────────────────┐
                                    NotificationPanel                  alerts.tsx bell badge
                                    (fullscreen modal)                 (unread count)
```

### 1.3 Notification Lifecycle

1. **Creation**: Server `AlertEngine` evaluates each market tick against registered alerts. On condition match it calls `WSManager.broadcast()` with an `alert_triggered` payload.
2. **Delivery**: `LiveMarketContext` receives the WS message and appends it to `alertEvents`.
3. **Conversion**: `NotificationsContext` watches `alertEvents` via `useEffect`. New entries are mapped to typed `AppNotification` objects and prepended to the in-memory list (capped at 60).
4. **WS status events**: `wsStatus` transitions (`connecting → reconnecting / error / connected`) also generate system notifications via a second `useEffect` in `NotificationsContext`.
5. **Rendering**: `NotificationPanel` reads from `useNotifications()`. The `alerts.tsx` tab's bell badge reads `unreadCount`.
6. **Dismissal**: `markRead(id)`, `markAllRead()`, `clearAll()` — all in-memory only; no persistence.

### 1.4 Notification Storage

| Data | Storage | Key | Persistence |
|---|---|---|---|
| Alert definitions (user-created) | Zustand + AsyncStorage | `tj_global_alerts_v1` | ✅ Persists across sessions |
| Notification history (triggered events) | React state only | — | ❌ In-memory; cleared on app restart |
| Notification preferences (sound, duration) | AsyncStorage | `tj_notification_prefs` | ✅ Persists across sessions |
| "Splash seen" flag | AsyncStorage | `tj_splash_seen_v1` | ✅ Persists across sessions |

### 1.5 Notification State Flow

```
[WS message arrives]
       │
LiveMarketContext.subscribeToMessages
       │
       └──► alertEvents[] grows by 1
                   │
          NotificationsContext useEffect
                   │
                   └──► addNotification() → setNotifications(prev => [new, ...prev].slice(0, 60))
                                   │
                         ┌─────────┴────────────┐
                   notifications[]          unreadCount (useMemo)
                         │                        │
                  NotificationPanel         Bell badge / Alerts tab header
```

### 1.6 Notification Rendering Flow

- `NotificationPanel` — `Modal` (transparent, `animationType="none"`) with `BlurView` backdrop; `BackHandler` intercepts Android back; `ScrollView` for the list; `Animated.Value` for open/close opacity+scale. Memoised sub-rows prevent list re-renders during live price ticks.
- `alerts.tsx` — Expo Router tab screen; `useAlertStore` for CRUD; REST polling (`/api/delta/status`, `/api/telegram/status`) every 8 s for connection status; `alertEvents` are **always `[]`** until `LiveMarketContext` stub is replaced.

### 1.7 Badge Update Flow

**In-app badge only** — `unreadCount = notifications.filter(n => !n.read).length` via `useMemo`.  
**No OS-level badge** (home screen icon) — there is no `expo-notifications` badge call anywhere.

The `alerts.tsx` bell button renders a `View` badge with the unread count when `unreadCount > 0`. Currently always 0 on tablet because `LiveMarketContext` is a stub.

### 1.8 Background Requirements

**None.** The notification system is entirely foreground-driven:
- WS connection is maintained by `LiveMarketContext` while the app is active.
- No background fetch, background task, or push token is registered.
- If the app is backgrounded, no new `alert_triggered` messages are received and no notifications accumulate.
- Telegram handles out-of-band delivery for users who need background alerting.

### 1.9 Foreground Requirements

- Active WS connection to `/api/ws` (managed by `LiveMarketContext`).
- `NotificationsProvider` and `LiveMarketProvider` mounted in the app tree (both are in `_layout.tsx` via the context tree).

---

## 2. Expo Notifications Decision

### Decision: **NO — expo-notifications is NOT required.**

**Justification:**

| Question | Answer |
|---|---|
| Does the project use push notifications today? | No |
| Does the backend register push tokens? | No |
| Does `AlertEngine` target mobile push endpoints? | No — only WS broadcast + Telegram |
| Is there FCM / APNS infrastructure? | No |
| Do users expect background alerts from the app? | No — Telegram covers this |
| Would adding expo-notifications change existing behavior? | Yes — it would introduce new infrastructure the backend doesn't support |

The architecture is **in-app / foreground only**. Adding `expo-notifications` would require backend changes (push token registration routes, token storage, push delivery logic) that are explicitly outside scope and would redesign the notification behavior.

**Do NOT install `expo-notifications`.**

---

## 3. Migration Status Inventory

### 3.1 Already Migrated (complete — do not touch)

| Web source file | Tablet target | Migrated in |
|---|---|---|
| `contexts/NotificationsContext.tsx` | `contexts/NotificationsContext.tsx` | Phase 11.5 |
| `components/NotificationPanel.tsx` | `components/NotificationPanel.tsx` | Phase 11.5 |
| `components/NotificationsSettingsPage.tsx` | `app/settings/notifications.tsx` | Phase 11.2 |
| `pages/alerts.tsx` | `app/(tabs)/alerts.tsx` | Phase 10.7 |
| `components/charts/AlertCenterModal.tsx` | `components/charts/AlertCenterModal.tsx` | Phase 10.2 |
| `components/charts/DrawingAlertModal.tsx` | `components/charts/DrawingAlertModal.tsx` | Phase 10.2 |
| `components/charts/DrawingAlertsList.tsx` | `components/charts/DrawingAlertsList.tsx` | Phase 10.3 |
| `store/alertStore.ts` | `store/alertStore.ts` | (exists on tablet) |
| `data/alertsData.ts` | `data/alertsData.ts` | (exists on tablet) |

### 3.2 Remaining — Phase 13 Migration Scope

**One structural gap prevents end-to-end notification delivery on the tablet:**

#### GAP: `contexts/LiveMarketContext.tsx` (STUB → REAL)

| | Detail |
|---|---|
| **Current state** | Stub — returns safe defaults; `alertEvents` is always `[]`; `wsStatus` is always `"connecting"` |
| **Required state** | Real WS client connection to `/api/ws` with reconnect logic, `alert_triggered` message routing, and `wsStatus` state machine |
| **Impact** | Until this is real: `NotificationsContext` never fires alert notifications; `alerts.tsx` "Recent Triggers" is always empty; unread count is always 0 |
| **Web source** | `src/contexts/LiveMarketContext.tsx` |
| **Tablet target** | `contexts/LiveMarketContext.tsx` |
| **Phase** | Phase 13.2 |

**Supporting files to verify/complete during Phase 13:**

| File | Status | Action |
|---|---|---|
| `contexts/LiveMarketContext.tsx` | Stub | Replace with real WS implementation |
| `store/alertStore.ts` | Exists on tablet | Verify AsyncStorage persistence matches web contract; confirm `ALL_ALERTS` seed data sourced from `data/alertsData.ts` not `localStorage` fallback |
| `data/alertsData.ts` | Exists on tablet | Verify all types exported match web (`AnyAlert`, `AlertStatus`, `AlertType`, `PriceAlert`, `ZoneAlert`, `TrendlineAlert`, `TIMEFRAMES`, `SYMBOLS`, `NOTIFICATION_HISTORY`) |

---

## 4. Dependency Recommendations

No new packages are required for the notification system.

All dependencies are already present:

| Package | Purpose | Status |
|---|---|---|
| `react-native-toast-message` | Transient toasts | ✅ In `package.json` |
| `expo-blur` | `BlurView` backdrop in `NotificationPanel` | ✅ In `package.json` |
| `react-native-safe-area-context` | Bottom inset in `NotificationPanel` | ✅ In `package.json` |
| `@react-native-async-storage/async-storage` | Alert + prefs persistence | ✅ In `package.json` (via Expo) |
| `zustand` | `alertStore` | ✅ In `package.json` |

**Do NOT add**: `expo-notifications`, Firebase Messaging, OneSignal, AWS SNS, or any push infrastructure.

---

## 5. Migration Strategy for Phase 13.2

### Objective
Replace the `LiveMarketContext` stub with the real WS implementation so that `alertEvents` flows through `NotificationsContext` and surfaces in-app notifications.

### Approach
1. **Migrate `LiveMarketContext`** from the web source (`src/contexts/LiveMarketContext.tsx`).
   - Replace `document`/browser APIs with RN equivalents (none expected — the web `LiveMarketContext` uses `WebSocket` which is available in RN).
   - Preserve the exported contract exactly: `WsStatus`, `AlertTriggeredMsg`, `LiveMarketContextValue`, `useLiveMarketContext`.
   - `alertEvents` must accumulate `alert_triggered` WS messages (same behaviour as web).
   - `wsStatus` must reflect real connection state.
   - Heartbeat / reconnect logic must be preserved.

2. **Validate** that `NotificationsContext` correctly converts new `alertEvents` entries to `AppNotification` objects once the real context is wired in (no changes to `NotificationsContext` itself — it is already correct).

3. **No changes** to `NotificationPanel`, `alerts.tsx`, `alertStore`, `AlertCenterModal`, `DrawingAlertModal`, `DrawingAlertsList`, or `app/settings/notifications.tsx`.

### Data flow after Phase 13.2
```
WebSocket /api/ws
      │  alert_triggered
      ▼
LiveMarketContext (real)
      │  alertEvents grows
      ▼
NotificationsContext useEffect
      │  addNotification()
      ▼
AppNotification[] in React state
      │
      ├── NotificationPanel (bell → modal)
      └── alerts.tsx header badge (unreadCount)
```

---

## 6. Summary

| Decision | Outcome |
|---|---|
| Notification type | In-app / foreground only |
| Transport | WebSocket `alert_triggered` → `LiveMarketContext` → `NotificationsContext` |
| expo-notifications required? | **NO** |
| New dependencies required? | **None** |
| Files migrated this phase | **0** (architecture decision only) |
| Files to migrate in Phase 13.2 | **1** — `contexts/LiveMarketContext.tsx` (stub → real) |
| Blocking issue | `LiveMarketContext` stub prevents end-to-end notification delivery |
| All notification UI | ✅ Already migrated in Phases 10.x–11.x |
