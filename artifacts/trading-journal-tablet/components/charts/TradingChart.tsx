/**
 * TradingChart — React Native port of src/components/charts/TradingChart.tsx
 *
 * Clean public API wrapper around the internal CustomChart engine.
 * CustomChart reads symbol + interval from chartStore internally. TradingChart
 * accepts them as props and syncs them into chartStore + marketStore so callers
 * don't need to touch the store directly.
 *
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. React.ReactNode → ReactNode (explicit named import instead of namespace access)
 *    No DOM APIs are used in this component. All store imports and CustomChart
 *    resolve to their already-migrated RN equivalents.
 *
 * Usage:
 *   <TradingChart symbol="BTCUSD" interval="60" settings={chartSettings} />
 */
import { useEffect, memo, type ReactNode } from "react";
import { useChartStore } from "@/store/chartStore";
import { useMarketStore } from "@/store/marketStore";
import CustomChart from "@/components/charts/CustomChart";
import type { ChartSettings } from "@/components/charts/chartSettingsTypes";
import type { OHLCBar } from "@/store/chartStore";

interface TradingChartProps {
  symbol:       string;
  interval:     string;
  settings?:    ChartSettings;
  replayBars?:  OHLCBar[] | null;
  children?:    ReactNode;
}

export const TradingChart = memo(function TradingChart({
  symbol,
  interval,
  settings,
  replayBars,
  children,
}: TradingChartProps) {
  const { setSymbol, setInterval } = useChartStore();
  const { setActiveSymbol, setActiveTimeframe } = useMarketStore();

  useEffect(() => {
    setSymbol(symbol);
    setActiveSymbol(symbol);
  }, [symbol, setSymbol, setActiveSymbol]);

  useEffect(() => {
    setInterval(interval);
    setActiveTimeframe(interval);
  }, [interval, setInterval, setActiveTimeframe]);

  return (
    <CustomChart settings={settings} replayBars={replayBars ?? null}>
      {children}
    </CustomChart>
  );
});

export default TradingChart;
