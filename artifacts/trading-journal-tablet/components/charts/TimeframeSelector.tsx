/**
 * TimeframeSelector.tsx — React Native port (Phase 9.23 Pass A)
 *
 * Migrated from src/components/charts/TimeframeSelector.tsx
 *
 * Web → RN changes (Pass A):
 *   <div onWheel>            → ScrollView horizontal (native scrolling)
 *   <button onClick>         → Pressable onPress
 *   useRef<HTMLDivElement>   → removed (ScrollView handles scroll natively)
 *   onMouseEnter/Leave hover → removed (no hover on touch)
 *   motion / AnimatePresence → removed (plain View; animation deferred)
 *   AnimatedList/AnimatedListItem → plain View wrappers
 *   CSS scrollbarWidth:none  → ScrollView (scrollbar hidden by default in RN)
 *   cursor / userSelect      → removed (not applicable in RN)
 *
 * Exports (unchanged):
 *   TimeframeSelector (memo, default export)
 */

import { memo } from "react";
import {
  View, Text, Pressable, ScrollView, StyleSheet,
} from "react-native";
import { useChartStore } from "@/store/chartStore";

// ── Types ─────────────────────────────────────────────────────────────────────
interface TF { label: string; value: string }

const TIMEFRAMES: TF[] = [
  { label: "1m",  value: "1"   },
  { label: "5m",  value: "5"   },
  { label: "15m", value: "15"  },
  { label: "30m", value: "30"  },
  { label: "1H",  value: "60"  },
  { label: "4H",  value: "240" },
  { label: "1D",  value: "D"   },
  { label: "1W",  value: "W"   },
];

interface TimeframeSelectorProps {
  value?: string;
  onChange?: (tf: string) => void;
  compact?: boolean;
  style?: import("react-native").StyleProp<import("react-native").ViewStyle>;
  /** className prop is accepted but unused in RN (preserved for API parity) */
  className?: string;
}

export const TimeframeSelector = memo(function TimeframeSelector({
  value: valueProp,
  onChange: onChangeProp,
  compact,
  style,
}: TimeframeSelectorProps) {
  const { interval, setInterval } = useChartStore();
  const active   = valueProp  ?? interval;
  const onChange = onChangeProp ?? setInterval;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      style={[styles.root, style]}
    >
      {TIMEFRAMES.map(tf => {
        const isActive = tf.value === active;
        return (
          <View key={tf.value}>
            <Pressable
              onPress={() => onChange(tf.value)}
              style={({ pressed }) => [
                styles.btn,
                compact ? styles.btnCompact : styles.btnNormal,
                isActive && styles.btnActive,
                pressed && !isActive && styles.btnPressed,
              ]}
            >
              <Text
                style={[
                  styles.label,
                  compact ? styles.labelCompact : styles.labelNormal,
                  isActive ? styles.labelActive : styles.labelInactive,
                ]}
              >
                {tf.label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
});

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flexShrink: 1,
    minWidth: 0,
  },
  strip: {
    alignItems:  "center",
    gap:         2,
    paddingVertical: 2,
    paddingHorizontal: 1,
  },
  btn: {
    borderRadius: 6,
    flexShrink:  0,
    alignItems:  "center",
    justifyContent: "center",
  },
  btnNormal: {
    height:  26,
    paddingHorizontal: 9,
    borderWidth:  1,
    borderColor:  "transparent",
  },
  btnCompact: {
    height:  22,
    paddingHorizontal: 7,
    borderWidth:  1,
    borderColor:  "transparent",
  },
  btnActive: {
    borderColor:  "rgba(183,255,90,0.4)",
    backgroundColor: "rgba(183,255,90,0.12)",
  },
  btnPressed: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  label: {
    letterSpacing: 0.1,
  },
  labelNormal: {
    fontSize:   11,
  },
  labelCompact: {
    fontSize:   10.5,
  },
  labelActive: {
    fontWeight: "800",
    color:      "#B7FF5A",
  },
  labelInactive: {
    fontWeight: "500",
    color:      "rgba(167,184,169,0.55)",
  },
});

export default TimeframeSelector;
