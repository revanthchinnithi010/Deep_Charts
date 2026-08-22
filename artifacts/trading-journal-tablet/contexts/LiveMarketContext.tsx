import { AppState, type AppStateStatus } from "react-native";
import { useEffect, useState } from "react";
import { DeltaWsClient } from "@/lib/broker-ws/DeltaWsClient";
import { useChartStore } from "@/store/chartStore";
import { getSymbolTick, useTickStore, type TickState } from "@/store/tickStore";

export type WsStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "error";

export interface AlertTriggeredMsg {
  type: "alert_triggered";
  alertType: "price" | "zone" | "trendline";
  alertId: number;
  symbol: string;
  condition: string;
  conditionLabel?: string;
  triggeredPrice: number;
  triggeredAt: string;
  message?: string | null;
  targetPrice?: number;
  upperPrice?: number;
  lowerPrice?: number;
  zoneType?: string;
  direction?: string;
  projectedPrice?: number;
  timeframe?: string;
  drawingType?: string;
}

interface LiveMarketContextValue {
  wsStatus: WsStatus;
  latencyMs: number | null;
  alertEvents: AlertTriggeredMsg[];
  subscribeToMessages: (handler: (msg: unknown) => void) => () => void;
  sendMessage: (msg: object) => void;
}

type StateListener = (snapshot: { wsStatus: WsStatus; latencyMs: number | null }) => void;
type MessageHandler = (msg: unknown) => void;

class LiveMarketBridge {
  private readonly client = new DeltaWsClient();
  private readonly stateListeners = new Set<StateListener>();
  private readonly messageHandlers = new Set<MessageHandler>();
  private started = false;
  private currentSymbol = "";
  private wsStatus: WsStatus = "disconnected";
  private latencyMs: number | null = null;
  private appState: AppStateStatus = AppState.currentState;
  private lastTickAt = 0;

  constructor() {
    this.client.onEvent((event) => {
      if (event.kind === "status") {
        this.wsStatus = event.status as WsStatus;
        this.notifyState();
        return;
      }

      if (event.kind === "latency") {
        this.latencyMs = event.latencyMs;
        this.notifyState();
        return;
      }

      if (event.kind === "tick") {
        this.lastTickAt = Date.now();
        this.updateTickStore(event.symbol, event.price, event.bid, event.ask);
        const message = {
          type: "tick",
          broker: "delta",
          symbol: event.symbol,
          price: event.price,
          bid: event.bid,
          ask: event.ask,
          timestamp: event.ts,
        };
        for (const handler of this.messageHandlers) {
          try { handler(message); } catch (error) { console.error("[LiveMarketBridge] message handler error", error); }
        }
      }
    });
  }

  ensureStarted(): void {
    if (this.started) return;
    this.started = true;
    this.currentSymbol = useChartStore.getState().symbol;

    useChartStore.subscribe((state) => {
      if (state.symbol === this.currentSymbol) return;
      const previous = this.currentSymbol;
      this.currentSymbol = state.symbol;
      if (previous) this.client.unsubscribeSymbol(previous);
      if (this.currentSymbol) this.client.subscribeSymbol(this.currentSymbol);
    });

    AppState.addEventListener("change", (next) => {
      const previous = this.appState;
      this.appState = next;

      if (previous !== "active" && next === "active") {
        this.client.connect();
        if (this.currentSymbol) this.client.subscribeSymbol(this.currentSymbol);
      } else if (previous === "active" && next === "background") {
        this.client.disconnect();
      }
    });

    setInterval(() => {
      if (this.appState !== "active" || !this.currentSymbol) return;
      if (this.wsStatus !== "connected") return;
      if (this.lastTickAt !== 0 && Date.now() - this.lastTickAt > 45_000) {
        this.client.subscribeSymbol(this.currentSymbol);
      }
    }, 15_000);

    this.client.subscribeSymbol(this.currentSymbol);
    this.client.connect();
  }

  subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  subscribeMessages(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  sendMessage(msg: object): void {
    this.ensureStarted();
    // The Skia chart's legacy bridge message is not needed with the direct
    // ticker connection; the live tick stream is already subscribed by symbol.
    if ((msg as { type?: string }).type === "subscribe_candles") return;
    this.client.send(msg);
  }

  getSnapshot(): { wsStatus: WsStatus; latencyMs: number | null } {
    return { wsStatus: this.wsStatus, latencyMs: this.latencyMs };
  }

  private notifyState(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.stateListeners) {
      try { listener(snapshot); } catch { /* ignore listener errors */ }
    }
  }

  private updateTickStore(symbol: string, price: number, bid?: number, ask?: number): void {
    const previous = getSymbolTick(symbol);
    const openPrice = previous?.openPrice && previous.openPrice > 0 ? previous.openPrice : price;
    const change = price - openPrice;
    const changePct = openPrice > 0 ? (change / openPrice) * 100 : 0;
    const history = previous?.history ?? [];
    const nextHistory = history.length >= 200 ? [...history.slice(-199), price] : [...history, price];

    const next: TickState = {
      price,
      prevPrice: previous?.price ?? null,
      openPrice,
      change,
      changePct,
      history: nextHistory,
      lastTick: Date.now(),
      flashDir: previous?.price == null ? null : price > previous.price ? "up" : price < previous.price ? "down" : null,
      flashKey: (previous?.flashKey ?? 0) + 1,
      tickCount: (previous?.tickCount ?? 0) + 1,
      bid,
      ask,
      spread: bid !== undefined && ask !== undefined ? Math.max(0, ask - bid) : undefined,
    };

    useTickStore.getState()._setTick(symbol, next);
    if (symbol === useChartStore.getState().symbol) {
      useChartStore.getState().setLivePrice(price);
      useChartStore.getState().setLiveOpen(openPrice);
    }
  }
}

const bridge = new LiveMarketBridge();

export function subscribeLiveMarketMessages(handler: (msg: unknown) => void): () => void {
  bridge.ensureStarted();
  return bridge.subscribeMessages(handler);
}

export function sendLiveMarketMessage(msg: object): void {
  bridge.sendMessage(msg);
}

export function useLiveMarketContext(): LiveMarketContextValue {
  const [snapshot, setSnapshot] = useState(bridge.getSnapshot());

  useEffect(() => {
    bridge.ensureStarted();
    setSnapshot(bridge.getSnapshot());
    return bridge.subscribeState(setSnapshot);
  }, []);

  return {
    wsStatus: snapshot.wsStatus,
    latencyMs: snapshot.latencyMs,
    alertEvents: [],
    subscribeToMessages: (handler) => bridge.subscribeMessages(handler),
    sendMessage: (msg) => bridge.sendMessage(msg),
  };
}
