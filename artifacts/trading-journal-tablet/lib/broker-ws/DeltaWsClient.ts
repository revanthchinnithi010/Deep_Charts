/**
 * DeltaWsClient.ts — resilient public market-data WebSocket client.
 *
 * Delta migrated public market channels away from the legacy private socket.
 * This client uses the current public endpoint + `ticker` channel, while
 * retaining backwards-compatible parsing for the legacy `v2/ticker` shape.
 */

import { WsConnection } from "./WsConnection";
import type {
  IBrokerWsClient, WsClientState, BrokerEventHandler,
  TickEvent, StatusEvent,
} from "./types";

const DELTA_WS_INDIA = "wss://public-socket.india.delta.exchange";
const DELTA_WS_INTL  = "wss://public-socket.delta.exchange";

interface LegacyDeltaTicker {
  type: "v2/ticker";
  symbol: string;
  close?: number;
  mark_price?: string | number;
  spot_price?: string | number;
  best_bid_price?: string | number;
  best_ask_price?: string | number;
}

interface PublicDeltaTickerItem {
  s?: string;
  m?: string | number;
  ohlc?: Array<number | string>;
  q?: Array<string | number | null>;
}

interface PublicDeltaTicker {
  type: "ticker";
  d?: PublicDeltaTickerItem[];
  sy?: string;
  sp?: string | number;
  ts?: number;
}

type DeltaMsg =
  | LegacyDeltaTicker
  | PublicDeltaTicker
  | { type: "heartbeat" | "pong" | "subscriptions" | "auth" | "key-auth" | string; [key: string]: unknown };

function finiteNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
}

/**
 * Direct React Native → Delta Exchange public WebSocket client.
 *
 * Public market data does not require API credentials. The client subscribes
 * to `ticker` and automatically re-subscribes after every reconnect.
 */
export class DeltaWsClient implements IBrokerWsClient {
  readonly brokerId = "delta" as const;

  private readonly conn: WsConnection;
  private readonly handlers = new Set<BrokerEventHandler>();
  private _state: WsClientState = {
    status: "idle",
    latencyMs: null,
    reconnectAttempts: 0,
    lastConnectedAt: null,
    lastPongAt: null,
  };

  private _wsUrl: string = DELTA_WS_INDIA;
  private subscribedSymbols = new Set<string>();

  constructor(wsUrl?: string) {
    if (wsUrl) this._wsUrl = DeltaWsClient.resolveWsUrl(wsUrl);

    this.conn = new WsConnection({
      url: () => this._wsUrl,
      name: "Delta Public Ticker WS",
      heartbeatIntervalMs: 25_000,
      heartbeatTimeoutMs: 10_000,
      reconnectOptions: {
        initialDelayMs: 1_000,
        maxDelayMs: 30_000,
        backoffFactor: 1.5,
      },
      onOpen: () => {
        // Keep the connection active even if ticker traffic pauses.
        this.conn.send({ type: "enable_heartbeat" });
        this.resubscribeAll();
      },
      onMessage: (data) => this.handleMessage(data as DeltaMsg),
      onStatusChange: (status) => {
        this._state = { ...this._state, status };
        this.emit({ kind: "status", broker: "delta", status, ts: Date.now() } as StatusEvent);
      },
      onLatency: (ms) => {
        this._state = { ...this._state, latencyMs: ms };
        this.emit({ kind: "latency", broker: "delta", latencyMs: ms, ts: Date.now() });
      },
    });
  }

  /** Update the WS URL before connect(). Legacy private Delta URLs are mapped
   * to the current public market-data endpoint automatically. */
  setWsUrl(url: string): void {
    if (url) this._wsUrl = DeltaWsClient.resolveWsUrl(url);
  }

  static resolveWsUrl(wsUrlFromAccount?: string): string {
    if (!wsUrlFromAccount) return DELTA_WS_INDIA;
    if (wsUrlFromAccount.includes("public-socket.india.delta.exchange")) return DELTA_WS_INDIA;
    if (wsUrlFromAccount.includes("public-socket.delta.exchange")) return DELTA_WS_INTL;
    if (wsUrlFromAccount.includes("socket.india.delta.exchange")) return DELTA_WS_INDIA;
    if (wsUrlFromAccount.includes("socket.delta.exchange")) return DELTA_WS_INTL;
    return wsUrlFromAccount.startsWith("wss://") ? wsUrlFromAccount : DELTA_WS_INDIA;
  }

  get wsUrl(): string { return this._wsUrl; }

  get state(): WsClientState {
    return {
      ...this._state,
      latencyMs: this.conn.latencyMs,
      reconnectAttempts: this.conn.reconnectAttempts,
      lastConnectedAt: this.conn.lastConnectedAt,
      lastPongAt: this.conn.lastPongAt,
    };
  }

  connect(): void { this.conn.connect(); }
  disconnect(): void { this.conn.disconnect(); }
  send(msg: unknown): boolean { return this.conn.send(msg); }

  onEvent(handler: BrokerEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  subscribeSymbol(symbol: string): void {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;
    this.subscribedSymbols.add(normalized);
    this.conn.send({
      type: "subscribe",
      payload: { channels: [{ name: "ticker", symbols: [normalized] }] },
    });
  }

  unsubscribeSymbol(symbol: string): void {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) return;
    this.subscribedSymbols.delete(normalized);
    this.conn.send({
      type: "unsubscribe",
      payload: { channels: [{ name: "ticker", symbols: [normalized] }] },
    });
  }

  private resubscribeAll(): void {
    if (this.subscribedSymbols.size === 0) return;
    this.conn.send({
      type: "subscribe",
      payload: { channels: [{ name: "ticker", symbols: [...this.subscribedSymbols] }] },
    });
  }

  private emit(event: Parameters<BrokerEventHandler>[0]): void {
    for (const h of this.handlers) {
      try { h(event); } catch (e) { console.error("[DeltaWsClient] handler error", e); }
    }
  }

  private emitTick(symbol: string, price: number, bid?: number, ask?: number): void {
    if (!symbol || !Number.isFinite(price) || price <= 0) return;
    this.emit({
      kind: "tick",
      broker: "delta",
      symbol,
      price,
      bid,
      ask,
      ts: Date.now(),
    } as TickEvent);
  }

  private handleMessage(msg: DeltaMsg): void {
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "heartbeat" || msg.type === "pong") {
      this.conn.notifyPong();
      return;
    }

    // Current public endpoint: { type: "ticker", d: [...], sy, ... }
    if (msg.type === "ticker") {
      const publicMsg = msg as PublicDeltaTicker;
      for (const item of publicMsg.d ?? []) {
        const symbol = String(item.s ?? publicMsg.sy ?? "").toUpperCase();
        // New ticker's 24h OHLC close is the current traded close. Prefer it,
        // then mark price as a safe fallback.
        const close = finiteNumber(item.ohlc?.[3]);
        const mark = finiteNumber(item.m);
        const price = close ?? mark;
        if (price === undefined) continue;

        const bid = finiteNumber(item.q?.[2]);
        const ask = finiteNumber(item.q?.[0]);
        this.emitTick(symbol, price, bid, ask);
      }
      return;
    }

    // Legacy parser kept so an older Delta endpoint/environment can still feed
    // the chart during a transition.
    if (msg.type === "v2/ticker") {
      const legacy = msg as LegacyDeltaTicker;
      const rawPrice = legacy.close ?? legacy.mark_price ?? legacy.spot_price;
      const price = finiteNumber(rawPrice);
      if (price === undefined) return;
      this.emitTick(
        legacy.symbol,
        price,
        finiteNumber(legacy.best_bid_price),
        finiteNumber(legacy.best_ask_price),
      );
    }
  }
}

export { DELTA_WS_INDIA, DELTA_WS_INTL };
