#!/usr/bin/env node
/**
 * Wires the tablet Skia chart to the resilient Bybit public market bridge.
 *
 * CustomChart was originally ported with a temporary no-op WS bridge. Keep the
 * patch isolated and idempotent so the chart source stays close to the web
 * implementation while live crypto prices come directly from Bybit.
 */

const fs = require("fs");
const path = require("path");

const chartFile = path.join(__dirname, "../components/charts/CustomChart.tsx");

if (!fs.existsSync(chartFile)) {
  console.warn(`[patch-live-feed] Missing ${chartFile}; skipping.`);
  process.exit(0);
}

let src = fs.readFileSync(chartFile, "utf8");

const importAnchor = 'import {\n  ChartContext, type ChartContextValue,\n  type IChartApi, type ISeriesApi,\n} from "@/contexts/ChartContext";';
const liveImport = `${importAnchor}\nimport { subscribeLiveMarketMessages, sendLiveMarketMessage } from "@/contexts/LiveMarketContext";`;

if (!src.includes("subscribeLiveMarketMessages")) {
  if (!src.includes(importAnchor)) {
    throw new Error("[patch-live-feed] ChartContext import anchor not found; refusing unsafe patch.");
  }
  src = src.replace(importAnchor, liveImport);
}

const subscribeStub = "const subscribeToMessages = _noopSubscribe;";
const subscribeLive = "const subscribeToMessages = subscribeLiveMarketMessages;";
if (src.includes(subscribeStub)) {
  src = src.replace(subscribeStub, subscribeLive);
} else if (!src.includes(subscribeLive)) {
  throw new Error("[patch-live-feed] subscribe bridge anchor not found; refusing unsafe patch.");
}

const sendStub = "const sendMsgRef = useRef(_noopSend);";
const sendLive = "const sendMsgRef = useRef(sendLiveMarketMessage);";
if (src.includes(sendStub)) {
  src = src.replace(sendStub, sendLive);
} else if (!src.includes(sendLive)) {
  throw new Error("[patch-live-feed] send bridge anchor not found; refusing unsafe patch.");
}

fs.writeFileSync(chartFile, src, "utf8");
console.log("[patch-live-feed] CustomChart now consumes the live Bybit feed.");
