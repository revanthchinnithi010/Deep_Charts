/**
 * ReplayControls.tsx — React Native port (Phase 9.23 Pass A)
 *
 * Migrated from src/components/charts/ReplayControls.tsx
 *
 * Web → RN changes (Pass A):
 *   <div> → View
 *   <button> → Pressable
 *   onMouseEnter/Leave hover → removed (no hover on touch)
 *   position: "absolute", left: "50%", transform: translateX(-50%)
 *            → position: "absolute", bottom: 28, alignSelf: "center"
 *   Speed popup (absolute div) → absolute View within component
 *   WebkitBackdropFilter / backdropFilter → removed
 *   userSelect / cursor / whiteSpace → removed
 *   boxShadow → elevation + shadowColor
 *   lucide-react Play/Pause/SkipBack/SkipForward/X/ChevronUp/ChevronDown
 *            → Ionicons equivalents
 *   style prop refs (e.currentTarget as HTML…).style.x = y → Pressable state styling
 *
 * Exports (unchanged):
 *   ReplayControlsProps (interface)
 *   ReplayControls (memo, default export)
 */

import { memo, useState } from "react";
import {
  View, Text, Pressable, StyleSheet,
} from "react-native";
import { SkipBack, Pause, Play, SkipForward, ChevronUp, ChevronDown, X } from "lucide-react-native";
import type { OHLCBar } from "@/store/chartStore";

// ── Types (preserved exactly) ─────────────────────────────────────────────────
export interface ReplayControlsProps {
  currentBar: OHLCBar | null;
  playing: boolean;
  speed: number;
  currentIdx: number;
  totalBars: number;
  interval: string;
  onPlay: () => void;
  onPause: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSpeedChange: (s: number) => void;
  onExit: () => void;
}

const SPEEDS = [0.5, 1, 2, 5, 10, 20];

function fmtReplayDate(ts: number, interval: string): string {
  const d = new Date(ts * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  if (interval === "D" || interval === "W") return date;
  return `${date}  ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// ── ReplayControls ────────────────────────────────────────────────────────────
export const ReplayControls = memo(function ReplayControls({
  currentBar, playing, speed, currentIdx, totalBars, interval,
  onPlay, onPause, onStepBack, onStepForward, onSpeedChange, onExit,
}: ReplayControlsProps) {
  const [showSpeeds, setShowSpeeds] = useState(false);
  const atStart = currentIdx <= 0;
  const atEnd   = currentIdx >= totalBars - 1;
  const dateStr = currentBar ? fmtReplayDate(currentBar.time, interval) : "—";

  return (
    <View style={ss.container}>

      {/* ── Date/time display ── */}
      <View style={ss.dateSection}>
        <View style={[ss.statusDot, playing && ss.statusDotActive]} />
        <Text style={ss.dateText}>{dateStr}</Text>
      </View>

      {/* ── Step back ── */}
      <RpBtn onPress={onStepBack} disabled={atStart}>
        <SkipBack size={13} color="rgba(183,220,190,0.8)" />
      </RpBtn>

      {/* ── Play / Pause ── */}
      <Pressable
        onPress={playing ? onPause : onPlay}
        disabled={atEnd && !playing}
        style={[
          ss.playBtn,
          playing && ss.playBtnActive,
          (atEnd && !playing) && ss.playBtnDisabled,
        ]}
      >
        {playing
          ? <Pause size={15} color="#B7FF5A" />
          : <Play  size={15} color="#B7FF5A" />
        }
      </Pressable>

      {/* ── Step forward ── */}
      <RpBtn onPress={onStepForward} disabled={atEnd}>
        <SkipForward size={13} color="rgba(183,220,190,0.8)" />
      </RpBtn>

      {/* ── Divider ── */}
      <View style={ss.divider} />

      {/* ── Speed selector ── */}
      <View style={ss.speedWrapper}>
        <Pressable
          onPress={() => setShowSpeeds(v => !v)}
          style={ss.speedBtn}
        >
          <Text style={ss.speedLabel}>×{speed}</Text>
          {showSpeeds
            ? <ChevronDown size={9} color="rgba(200,228,204,0.85)" />
            : <ChevronUp   size={9} color="rgba(200,228,204,0.85)" />
          }
        </Pressable>

        {showSpeeds && (
          <View style={ss.speedPopup}>
            {SPEEDS.map(s => (
              <Pressable
                key={s}
                onPress={() => { onSpeedChange(s); setShowSpeeds(false); }}
                style={[ss.speedItem, s === speed && ss.speedItemActive]}
              >
                <Text style={[ss.speedItemLabel, s === speed && ss.speedItemLabelActive]}>
                  ×{s}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* ── Progress ── */}
      <View style={ss.progress}>
        <Text style={ss.progressText}>{currentIdx + 1} / {totalBars}</Text>
      </View>

      {/* ── Divider ── */}
      <View style={ss.divider} />

      {/* ── Exit ── */}
      <Pressable
        onPress={onExit}
        style={({ pressed }) => [ss.exitBtn, pressed && ss.exitBtnPressed]}
      >
        <X size={13} color="rgba(248,113,113,0.7)" />
      </Pressable>
    </View>
  );
});

// ── RpBtn ─────────────────────────────────────────────────────────────────────
function RpBtn({ onPress, disabled, children }: {
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        ss.rpBtn,
        pressed && !disabled && ss.rpBtnPressed,
        disabled && ss.rpBtnDisabled,
      ]}
    >
      {children}
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 28,
    alignSelf: "center",
    zIndex: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "rgba(7,17,13,0.97)",
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.22)",
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 8,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.75,
    shadowRadius: 22,
  },

  // Date section
  dateSection: {
    flexDirection: "row",
    alignItems: "center",
    height: 32,
    paddingLeft: 6,
    paddingRight: 12,
    borderRightWidth: 1,
    borderRightColor: "rgba(183,255,90,0.1)",
    marginRight: 4,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
    backgroundColor: "rgba(183,255,90,0.35)",
  },
  statusDotActive: {
    backgroundColor: "#B7FF5A",
  },
  dateText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B7FF5A",
    fontFamily: "monospace",
    letterSpacing: 0.4,
  },

  // Play button
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(183,255,90,0.10)",
    borderWidth: 1.5,
    borderColor: "rgba(183,255,90,0.22)",
  },
  playBtnActive: {
    backgroundColor: "rgba(183,255,90,0.18)",
    borderColor: "rgba(183,255,90,0.4)",
  },
  playBtnDisabled: {
    opacity: 0.4,
  },

  // Divider
  divider: {
    width: 1,
    height: 22,
    backgroundColor: "rgba(183,255,90,0.1)",
    marginHorizontal: 4,
  },

  // Speed selector
  speedWrapper: {
    position: "relative",
  },
  speedBtn: {
    height: 32,
    paddingHorizontal: 9,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(183,255,90,0.06)",
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.14)",
  },
  speedLabel: {
    minWidth: 22,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(200,228,204,0.85)",
  },
  speedPopup: {
    position: "absolute",
    bottom: "100%",
    marginBottom: 6,
    left: "50%",
    transform: [{ translateX: -32 }],
    backgroundColor: "rgba(7,17,13,0.97)",
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.15)",
    borderRadius: 9,
    overflow: "hidden",
    zIndex: 70,
    elevation: 16,
    minWidth: 64,
  },
  speedItem: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  speedItemActive: {
    backgroundColor: "rgba(183,255,90,0.1)",
  },
  speedItemLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(200,228,204,0.8)",
    textAlign: "center",
  },
  speedItemLabelActive: {
    fontWeight: "700",
    color: "#B7FF5A",
  },

  // Progress
  progress: {
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  progressText: {
    fontSize: 10,
    color: "rgba(167,184,169,0.45)",
    fontFamily: "monospace",
  },

  // Exit button
  exitBtn: {
    width: 30,
    height: 30,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  exitBtnPressed: {
    backgroundColor: "rgba(248,113,113,0.1)",
    borderColor: "rgba(248,113,113,0.25)",
  },

  // RpBtn
  rpBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  rpBtnPressed: {
    backgroundColor: "rgba(183,255,90,0.08)",
    borderColor: "rgba(183,255,90,0.15)",
  },
  rpBtnDisabled: {
    opacity: 0.3,
  },
});

export default ReplayControls;
