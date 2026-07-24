/**
 * LiveMarketContext — React Native stub.
 *
 * On the web, LiveMarketContext manages the market WebSocket connection and
 * exposes wsStatus, subscribeToMessages, sendMessage, and alertEvents.
 *
 * On the tablet this full context is implemented separately (Phase 6.x).
 * This file exists so that brokerStore.ts, NotificationsContext, and other
 * consumers can import types + useLiveMarketContext without modification —
 * the type contract is identical between web and RN.
 *
 * useLiveMarketContext() returns safe defaults (disconnected status, empty
 * alertEvents) until Phase 6.x wires up the real implementation.
 */

import { createContext, useContext } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types — preserved verbatim from web source
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Stub context — safe defaults until Phase 6.x
// ─────────────────────────────────────────────────────────────────────────────

const LiveMarketContext = createContext<LiveMarketContextValue>({
  wsStatus: "disconnected",
  latencyMs: null,
  alertEvents: [],
  subscribeToMessages: () => () => {},
  sendMessage: () => {},
});

export function useLiveMarketContext(): LiveMarketContextValue {
  return useContext(LiveMarketContext);
}
