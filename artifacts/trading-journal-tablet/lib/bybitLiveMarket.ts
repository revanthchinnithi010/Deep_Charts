import { AppState, type AppStateStatus } from "react-native";

export type BybitFeedStatus = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

export interface BybitTick {
  type: "tick";
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  timestamp: number;
}

type StateHandler = (status: BybitFeedStatus, latencyMs: number | null) => void;
type TickHandler = (tick: BybitTick) => void;

const BYBIT_LINEAR_WS = "wss://stream.bybit.com/v5/public/linear";
const PING_INTERVAL_MS = 20_000;
const WATCHDOG_INTERVAL_MS = 10_000;
const STALE_AFTER_MS = 35_000;
const MAX_BACKOFF_MS = 30_000;

function normalizeSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  // The app's display/catalog symbol is FARTCOINUSD; Bybit's linear perpetual is FARTCOINUSDT.
  if (s === "FARTCOINUSD") return "FARTCOINUSDT";
  return s;
}

export class BybitLiveMarket {
  private ws: WebSocket | null = null;
  private destroyed = false;
  private active = AppState.currentState === "active";
  private currentSymbol = "";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private lastMessageAt = 0;
  private lastTickAt = 0;
  private pingSentAt = 0;
  private latencyMs: number | null = null;
  private status: BybitFeedStatus = "idle";
  private generation = 0;
  private stateHandlers = new Set<StateHandler>();
  private tickHandlers = new Set<TickHandler>();
  private appStateSubscription: { remove: () => void } | null = null;

  constructor() {
    this.appStateSubscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      const wasActive = this.active;
      this.active = next === "active";

      if (!wasActive && this.active) {
        this.reconnectAttempt = 0;
        this.connect(true);
      } else if (wasActive && !this.active) {
        this.cancelReconnect();
        this.closeSocket(false);
        this.setStatus("disconnected");
      }
    });
  }

  start(symbol: string): void {
    this.currentSymbol = normalizeSymbol(symbol);
    if (!this.currentSymbol || !this.active || this.destroyed) return;
    this.startWatchdog();
    this.connect(true);
  }

  setSymbol(symbol: string): void {
    const next = normalizeSymbol(symbol);
    if (!next || next === this.currentSymbol) return;
    this.currentSymbol = next;
    if (this.active && !this.destroyed) this.connect(true);
  }

  stop(): void {
    this.cancelReconnect();
    this.stopHeartbeat();
    this.closeSocket(false);
    this.setStatus("disconnected");
  }

  destroy(): void {
    this.destroyed = true;
    this.stop();
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    this.stateHandlers.clear();
    this.tickHandlers.clear();
  }

  getSnapshot(): { status: BybitFeedStatus; latencyMs: number | null } {
    return { status: this.status, latencyMs: this.latencyMs };
  }

  onState(handler: StateHandler): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  onTick(handler: TickHandler): () => void {
    this.tickHandlers.add(handler);
    return () => this.tickHandlers.delete(handler);
  }

  private connect(force = false): void {
    if (this.destroyed || !this.active || !this.currentSymbol) return;
    if (!force && this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return;

    this.cancelReconnect();
    this.closeSocket(false);
    const generation = ++this.generation;
    this.setStatus(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(BYBIT_LINEAR_WS);
    } catch (error) {
      console.error("[BybitLiveMarket] WebSocket construction failed", error);
      this.setStatus("error");
      this.scheduleReconnect();
      return;
    }

    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws || generation !== this.generation) return;
      this.reconnectAttempt = 0;
      this.lastMessageAt = Date.now();
      this.lastTickAt = 0;
      this.setStatus("connected");
      this.startHeartbeat();
      this.subscribeCurrent(ws);
    };

    ws.onmessage = (event) => {
      if (this.ws !== ws || generation !== this.generation) return;
      this.lastMessageAt = Date.now();
      this.handleMessage(event.data);
    };

    ws.onerror = () => {
      if (this.ws !== ws || generation !== this.generation) return;
      this.setStatus("error");
    };

    ws.onclose = () => {
      if (this.ws !== ws || generation !== this.generation) return;
      this.ws = null;
      this.stopHeartbeat();
      if (this.destroyed || !this.active) {
        this.setStatus("disconnected");
        return;
      }
      this.scheduleReconnect();
    };
  }

  private subscribeCurrent(ws: WebSocket): void {
    const symbol = normalizeSymbol(this.currentSymbol);
    if (!symbol || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify({
        req_id: `chart-${Date.now()}`,
        op: "subscribe",
        args: [`tickers.${symbol}`],
      }));
    } catch (error) {
      console.error("[BybitLiveMarket] subscribe failed", error);
    }
  }

  private handleMessage(raw: unknown): void {
    let msg: any;
    try {
      msg = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    if (msg.op === "pong") {
      if (this.pingSentAt > 0) {
        this.latencyMs = Math.max(0, Date.now() - this.pingSentAt);
        this.pingSentAt = 0;
        this.notifyState();
      }
      return;
    }

    if (msg.op === "subscribe" || msg.success === true) return;
    if (typeof msg.topic !== "string" || !msg.topic.startsWith("tickers.")) return;

    const data = msg.data;
    const item = Array.isArray(data) ? data[0] : data;
    if (!item || typeof item !== "object") return;

    const symbol = String(item.symbol ?? msg.topic.slice("tickers.".length)).toUpperCase();
    if (symbol !== normalizeSymbol(this.currentSymbol)) return;

    const price = Number(item.lastPrice);
    if (!Number.isFinite(price) || price <= 0) return;

    const bid = Number(item.bid1Price);
    const ask = Number(item.ask1Price);
    this.lastTickAt = Date.now();
    this.tickHandlers.forEach((handler) => {
      try {
        handler({
          type: "tick",
          symbol: this.currentSymbol,
          price,
          bid: Number.isFinite(bid) && bid > 0 ? bid : undefined,
          ask: Number.isFinite(ask) && ask > 0 ? ask : undefined,
          timestamp: Number(msg.ts) || Date.now(),
        });
      } catch (error) {
        console.error("[BybitLiveMarket] tick handler error", error);
      }
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.active) return;
      this.pingSentAt = Date.now();
      try {
        this.ws.send(JSON.stringify({ op: "ping" }));
      } catch {
        try { this.ws.close(); } catch { /* ignore */ }
      }
    }, PING_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.pingSentAt = 0;
  }

  private startWatchdog(): void {
    if (this.watchdogTimer) return;
    this.watchdogTimer = setInterval(() => {
      if (this.destroyed || !this.active || !this.currentSymbol) return;
      const now = Date.now();
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.connect();
        return;
      }
      if (this.lastMessageAt > 0 && now - this.lastMessageAt > STALE_AFTER_MS) {
        try { this.ws.close(4001, "stale Bybit feed"); } catch { /* ignore */ }
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  private scheduleReconnect(): void {
    if (this.destroyed || !this.active || !this.currentSymbol || this.reconnectTimer) return;
    this.reconnectAttempt += 1;
    const delay = Math.min(MAX_BACKOFF_MS, 1_000 * Math.pow(1.7, this.reconnectAttempt - 1));
    this.setStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(true);
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private closeSocket(reconnect = false): void {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    try { ws.close(reconnect ? 4002 : 1000, reconnect ? "reconnect" : "stop"); } catch { /* ignore */ }
  }

  private setStatus(status: BybitFeedStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.notifyState();
  }

  private notifyState(): void {
    const snapshot = this.getSnapshot();
    this.stateHandlers.forEach((handler) => {
      try { handler(snapshot.status, snapshot.latencyMs); } catch { /* ignore */ }
    });
  }
}

export { BYBIT_LINEAR_WS, normalizeSymbol as normalizeBybitSymbol };
