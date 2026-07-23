/**
 * BrokerTabs — React Native port (Phase 9.24 Pass A)
 *
 * Migrated from src/components/charts/BrokerTabs.tsx
 *
 * Web → RN changes:
 *   <div>                    → View
 *   <button>                 → Pressable
 *   className (sm:hidden …)  → removed (tablet always shows full label)
 *   onMouseEnter/Leave       → removed (touch device, no hover)
 *   style.className prop     → style prop (ViewStyle)
 *
 * Exports (unchanged):
 *   BrokerTabs (named + default export, memo)
 */
import { memo } from "react";
import { View, Text, Pressable } from "react-native";
import { useMarketStore, type BrokerName } from "@/store/marketStore";

interface BrokerTabsProps {
  style?: object;
}

const BROKERS: { id: BrokerName; label: string; shortLabel: string; color: string; glow: string }[] = [
  {
    id:         "delta",
    label:      "Delta Exchange",
    shortLabel: "Delta",
    color:      "#00BFFF",
    glow:       "rgba(0,191,255,0.18)",
  },
];

export const BrokerTabs = memo(function BrokerTabs({ style }: BrokerTabsProps) {
  const { activeBroker, setActiveBroker } = useMarketStore();

  return (
    <View
      style={[{
        flexDirection:   "row",
        alignItems:      "center",
        gap:             3,
        padding:         3,
        borderRadius:    10,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderWidth:     1,
        borderColor:     "rgba(255,255,255,0.07)",
        flexShrink:      0,
      }, style]}
    >
      {BROKERS.map(b => {
        const active = activeBroker === b.id;
        return (
          <Pressable
            key={b.id}
            onPress={() => setActiveBroker(b.id)}
            accessibilityLabel={b.label}
            style={{
              height:            26,
              paddingHorizontal: 10,
              borderRadius:      7,
              borderWidth:       1,
              borderColor:       active ? `${b.color}44` : "transparent",
              backgroundColor:   active ? b.glow : "transparent",
              justifyContent:    "center",
              alignItems:        "center",
            }}
          >
            <Text style={{
              fontSize:      11,
              fontWeight:    active ? "800" : "500",
              color:         active ? b.color : "rgba(167,184,169,0.55)",
              letterSpacing: 0.11,
            }}>
              {b.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

export default BrokerTabs;
