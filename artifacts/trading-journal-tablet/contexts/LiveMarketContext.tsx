import { useEffect, useState } from "react";
import { useChartStore } from "@/store/chartStore";
import { getSymbolTick, useTickStore, type TickState } from "@/store/tickStore";
import { BybitLiveMarket, type BybitFeedStatus } from "@/lib/bybitLiveMarket";

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

function mapStatus(status: BybitFeedStatus): WsStatus {
  return status === "idle" ? "disconnected" : status;
}

class LiveMarketBridge {
  private readonly client = new BybitLiveMarket();
  private readonly stateListeners = new Set<StateListener>();
  private readonly messageHandlers = new Set<MessageHandler>();
  private started = false;
  private currentSymbol = "";

  constructor() {
    this.client.onState((status, latencyMs) => {
      this.notifyState({ wsStatus: mapStatus(status), latencyMs });
    });

    this.client.onTick((tick) => {
      this.updateTickStore(this.currentSymbol, tick.price, tick.bid, tick.ask);
      const message = {
        type: "tick",
        broker: "bybit",
        symbol: this.currentSymbol,
        price: tick.price,
        bid: tick.bid,
        ask: tick.ask,
        timestamp: tick.timestamp,
      };
      for (const handler of this.messageHandlers) {
        try { handler(message); } catch (error) { console.error("[LiveMarketBridge] message handler error", error); }
      }
    });
  }

  ensureStarted(): void {
    if (this.started) return;
    this.started = true;
    this.currentSymbol = useChartStore.getState().symbol;

    useChartStore.subscribe((state) => {
      if (state.symbol === this.currentSymbol) return;
      this.currentSymbol = state.symbol;
      this.client.setSymbol(this.currentSymbol);
    });

    this.client.start(this.currentSymbol);
  }

  subscribeState(listener: StateListener): () => void {
    this.ensureStarted();
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  subscribeMessages(handler: MessageHandler): () => void {
    this.ensureStarted();
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  sendMessage(_msg: object): void {
    this.ensureStarted();
    // Historical candles continue through the existing REST/cache path.
    // Live updates are supplied directly by Bybit's public ticker stream.
  }

  getSnapshot(): { wsStatus: WsStatus; latencyMs: number | null } {
    const snapshot = this.client.getSnapshot();
    return { wsStatus: mapStatus(snapshot.status), latencyMs: snapshot.latencyMs };
  }

  private notifyState(snapshot: { wsStatus: WsStatus; latencyMs: number | null }): void {
    for (const listener of this.stateListeners) {
      try { listener(snapshot); } catch { /* isolate UI listeners */ }
    }
  }

  private updateTickStore(displaySymbol: string, price: number, bid?: number, ask?: number): void {
    const previous = getSymbolTick(displaySymbol);
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

    useTickStore.getState()._setTick(displaySymbol, next);
    if (displaySymbol === useChartStore.getState().symbol) {
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
