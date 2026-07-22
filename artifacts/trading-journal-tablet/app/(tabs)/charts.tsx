/**
 * app/(tabs)/charts.tsx — Charts tab stub
 *
 * Structural placeholder for the Charts / Terminal screen.
 * Actual content will be migrated in a future phase.
 *
 * Web equivalent: artifacts/trading-journal/src/pages/charts.tsx
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CrosshairReadout from "@/components/charts/CrosshairReadout";

export default function ChartsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Charts</Text>
      <Text style={styles.subtitle}>Migration in progress</Text>
      {/* CrosshairReadout mounted here for pub-sub verification (Pass C);
          remove/relocate once a real host UI exists. */}
      <View style={styles.readoutRow}>
        <CrosshairReadout />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#05070A",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: {
    color: "#EDF0F6",
    fontSize: 20,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  subtitle: {
    color: "rgba(148,163,184,0.60)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  readoutRow: {
    marginTop: 8,
  },
});
