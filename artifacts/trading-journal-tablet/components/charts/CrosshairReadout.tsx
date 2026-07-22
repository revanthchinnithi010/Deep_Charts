/**
 * CrosshairReadout.tsx — standalone crosshair OHLCV consumer (Pass C)
 *
 * Subscribes to the module-level crosshair pub-sub in @/lib/crosshairState
 * via useSyncExternalStore. Renders a compact O/H/L/C/Vol row matching the
 * inline tooltip style inside CustomChart.tsx, but as a reusable component
 * that can be mounted anywhere outside the chart (details panels, etc.).
 *
 * Intentionally does NOT replace the tooltip already rendered inside
 * CustomChart — it is an independent consumer, exactly matching the
 * zero-React-perf architecture documented in .agents/memory/zero-react-perf.md.
 *
 * Mount wherever CustomChart is rendered to verify the pub-sub end-to-end;
 * relocate/remove once a real host UI exists (see charts.tsx).
 */

import { useSyncExternalStore } from "react";
import { StyleSheet, View, Text as RNText } from "react-native";
import { getCrosshair, subscribeCrosshair } from "@/lib/crosshairState";
import { fmtPrice } from "@/lib/fmtPrice";
import { fmtVolume } from "@/lib/fmtVolume";
import { useChartStore } from "@/store/chartStore";

const UP_COLOR   = "#B7FF5A";
const DOWN_COLOR = "#ef4444";
const TEXT_COLOR = "#A7B8A9";

export default function CrosshairReadout() {
  const symbol = useChartStore(s => s.symbol);
  const data = useSyncExternalStore(subscribeCrosshair, getCrosshair);

  // Render nothing when crosshair is not active
  if (data.time === null) return null;

  const {
    open, high, low, close, volume,
  } = data;

  if (
    open === null || high === null ||
    low  === null || close === null
  ) return null;

  const bull = close >= open;
  const ohlcCol = bull ? UP_COLOR : DOWN_COLOR;

  return (
    <View style={styles.container} pointerEvents="none">
      <RNText style={styles.row}>
        <RNText style={styles.label}>O</RNText>
        <RNText style={{ color: ohlcCol }}> {fmtPrice(open,  symbol)}  </RNText>
        <RNText style={styles.label}>H</RNText>
        <RNText style={{ color: ohlcCol }}> {fmtPrice(high,  symbol)}  </RNText>
        <RNText style={styles.label}>L</RNText>
        <RNText style={{ color: ohlcCol }}> {fmtPrice(low,   symbol)}  </RNText>
        <RNText style={styles.label}>C</RNText>
        <RNText style={{ color: ohlcCol }}> {fmtPrice(close, symbol)}  </RNText>
        <RNText style={styles.label}>Vol</RNText>
        <RNText style={{ color: TEXT_COLOR }}>
          {" "}{volume !== null ? fmtVolume(volume) : "—"}
        </RNText>
      </RNText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(7,17,13,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  row: {
    fontSize: 11,
    fontFamily: "monospace",
    letterSpacing: 0.2,
  },
  label: {
    color: "rgba(255,255,255,0.45)",
    fontWeight: "600",
  },
});
