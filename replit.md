# Trading Journal — area.lab

A full-stack trading journal and charting platform. Tracks positions, PnL, and trade history across Delta Exchange and cTrader broker accounts. Includes real-time charts with drawing tools, price alerts, and a trading calendar.

## Run & Operate

- **Web app** (`artifacts/trading-journal`): workflow `artifacts/trading-journal: web` — Vite dev server, auto-assigned port
- **API server** (`artifacts/api-server`): workflow `artifacts/api-server: API Server` — Express on port 8080
- **Tablet app** (`artifacts/trading-journal-tablet`): workflow `artifacts/trading-journal-tablet: expo` — Expo dev server
- **Mockup sandbox** (`artifacts/mockup-sandbox`): workflow `artifacts/mockup-sandbox: Component Preview Server`

```
pnpm run typecheck          # full typecheck across all packages
pnpm run build              # typecheck + build all packages
pnpm --filter @workspace/db run push   # push DB schema changes (dev only)
```

## Required Secrets

| Secret | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (auto-provisioned on Replit) |
| `SESSION_SECRET` | Express session secret — set in Replit Secrets |
| `BROKER_ENCRYPTION_KEY` | AES key for encrypting broker credentials — set in Replit Secrets |
| `CTRADER_CLIENT_ID` | cTrader OAuth app client ID |
| `CTRADER_CLIENT_SECRET` | cTrader OAuth app client secret |
| `DELTA_CLIENT_ID` | Delta Exchange OAuth client ID (optional) |
| `TELEGRAM_BOT_TOKEN` | Telegram alerts bot token (optional) |
| `TELEGRAM_CHAT_ID` | Telegram alerts chat ID (optional) |

## Stack

- **Monorepo**: pnpm workspaces, Node.js 20, TypeScript 5.9
- **Frontend**: React 19, Vite 7, Tailwind CSS 4, Framer Motion, lightweight-charts
- **API**: Express 5, Drizzle ORM, PostgreSQL
- **Mobile**: Expo (React Native) — tablet companion app
- **Market data**: Delta Exchange (WebSocket ticks), cTrader (ProtoOA over TLS)
- **Build**: esbuild (API bundle), Vite (web)

## Where things live

- `artifacts/trading-journal/src/` — main web app source
  - `pages/` — route components (dashboard, charts, brokers, markets, alerts, reports)
  - `components/charts/` — chart + drawing overlay components
  - `store/` — Zustand stores (chartStore, brokerStore, tickStore, alertStore, etc.)
  - `lib/` — broker adapters, tick engine, market feed manager
- `artifacts/api-server/src/` — Express API
  - `routes/` — REST endpoints
  - `services/` — business logic (Delta, cTrader, alerts, market data)
  - `ws/` — WebSocket server and dispatcher
- `artifacts/trading-journal-tablet/` — Expo tablet companion
- `lib/` — shared workspace packages (db schema, API types, tar-stub, etc.)

## Architecture decisions

- **Keep-alive pages**: Dashboard and Charts are mounted permanently and toggled via CSS opacity (not AnimatePresence) to avoid canvas GPU texture eviction and re-fetch flicker.
- **Zero-React tick path**: Live ticks write to a `tickDataRef` and a Zustand `tickStore` capped at ≤1 setState/rAF frame; chart rendering uses a RAF loop reading refs directly, never React state.
- **Canvas2D drawing layer**: All drawing visuals render on a Canvas2D overlay; SVG retains only anchor handles and hit areas for selected drawings.
- **Broker encryption**: Broker API credentials are AES-256-CBC encrypted at rest using `BROKER_ENCRYPTION_KEY`; absent key falls back to an insecure dev key with a warning.
- **tar stub**: All `tar` npm versions are 403'd by the Replit firewall; a `lib/tar-stub` workspace package is aliased via pnpm overrides.

## User preferences

- Dark monochrome theme (#0F1618 background), profit = green, loss = red.
- Fix root cause — no temporary patches.
- Mobile-first design; never break desktop layouts.
- Delta Exchange and cTrader only — no mock data, no Finnhub.

## Gotchas

- `BROKER_ENCRYPTION_KEY` must be set in Replit Secrets before connecting any broker account. Missing key causes 401 "reconnect required" errors.
- Replit Secrets added after a process starts are invisible until the workflow restarts.
- cTrader OAuth redirect URI is derived from `x-forwarded-host` at runtime — do not hard-code a fixed env var.
- cTrader ProtoOA uses raw TLS TCP on port 5035 (`tls.connect`), NOT WebSocket.
- Metro (Expo) crashes if a package creates/deletes tmp dirs; add patterns to `metro.config.js` blockList.

## Pointers

- See `.agents/memory/MEMORY.md` for a full index of architecture decisions and gotchas accumulated across sessions.
- See `PROJECT_RULES.md` for coding and design rules.
