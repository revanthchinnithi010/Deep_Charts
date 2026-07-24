/**
 * components/SplashScreen.tsx — React Native (Reanimated + expo-splash-screen)
 *
 * Migration of: artifacts/trading-journal/src/components/animations/SplashScreen.tsx
 * Phase 12.5 — Splash Screen & Transition Infrastructure
 *
 * Web → RN replacements:
 *   Anime.js (animateSplashReveal/animateSplashExit) → Reanimated withTiming/withSpring/withDelay
 *   sessionStorage flag                              → AsyncStorage (async; starts hidden until checked)
 *   position:fixed inset:0, zIndex:9999             → StyleSheet.absoluteFillObject + zIndex
 *   document.createElement / DOM refs               → Animated.View / View / Animated.Text
 *   Zap (lucide-react)                              → Ionicons "flash" (@expo/vector-icons)
 *   radial-gradient CSS background                  → solid dark bg (gradients require
 *                                                     expo-linear-gradient; kept simple)
 *   willChange: "transform,opacity"                 → not needed (Reanimated handles GPU)
 *   userSelect / touchAction CSS                    → pointerEvents="none" on overlay
 *   HTML <span> per char                            → SplashChar sub-component (one
 *                                                     useSharedValue per char via component)
 *
 * Animation sequence (durations preserved from web source):
 *   t=0 ms    Glow halo: opacity 0→1, scale 0.5→1    (timing 400 ms)
 *   t=80 ms   Ring:      opacity 0→1, scale 0.4→1    (spring SPRING_FAST)
 *   t=260 ms  Logo icon: opacity 0→1, scale 0→1      (spring SPRING_FAST)
 *   t=520 ms  Title chars: translateY 16→0, opacity 0→1 (staggered +40 ms/char, timing 280 ms)
 *   t=870 ms  Tagline: opacity 0→1                    (timing 300 ms)
 *   t=dismissAfter (1 650 ms default)
 *             Container fade-out: opacity 1→0         (timing 200 ms) → onDone
 *
 * expo-splash-screen integration:
 *   The native splash screen is controlled by app/_layout.tsx
 *   (preventAutoHideAsync → hideAsync after fonts + Skia load).
 *   This component is an in-app branded overlay that plays once the native
 *   splash has been dismissed and the app tree is mounted.  It does NOT call
 *   SplashScreen.hideAsync() itself — that is solely _layout.tsx's job.
 *
 * Reduced-motion / noMotion / seen-flag:
 *   reduced → skip all animations; wait 600 ms then call onDone (same as web).
 *   Session flag stored in AsyncStorage key "tj_splash_seen_v1".
 *   Returns null until AsyncStorage resolves (covered by native splash on first launch).
 */
import React, { useEffect } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { SPRING_FAST } from "@/animations/motion";

/* ─── Constants ───────────────────────────────────────────────────────────── */

const SESSION_KEY    = "tj_splash_seen_v1";
const TITLE          = "TradeVault";
const TITLE_CHARS    = TITLE.split("") as string[]; // 10 chars

const CHAR_START_MS  = 520;
const CHAR_STAGGER   = 40;
const TAGLINE_MS     = 870;
const EXIT_DURATION  = 200;
const REDUCED_DELAY  = 600;

/* ─── Props ───────────────────────────────────────────────────────────────── */

interface SplashScreenProps {
  /** Override the auto-dismiss timeout (ms). Default: 1 650 */
  dismissAfter?: number;
  /** Callback fired after the splash finishes and is removed */
  onDone?: () => void;
}

/* ─── SplashChar — sub-component so each char has its own useSharedValue ─── */

interface SplashCharProps {
  char:    string;
  index:   number;
  reduced: boolean;
}

function SplashChar({ char, index, reduced }: SplashCharProps) {
  const opacity    = useSharedValue(0);
  const translateY = useSharedValue(16);

  const charStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  useEffect(() => {
    if (reduced) {
      opacity.value    = 1;
      translateY.value = 0;
      return;
    }
    const delay = CHAR_START_MS + index * CHAR_STAGGER;
    const cfg   = { duration: 280, easing: Easing.out(Easing.ease) };
    opacity.value    = withDelay(delay, withTiming(1, cfg));
    translateY.value = withDelay(delay, withTiming(0, cfg));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return (
    <Animated.Text style={[styles.titleChar, charStyle]}>
      {char}
    </Animated.Text>
  );
}

/* ─── SplashScreen ────────────────────────────────────────────────────────── */

export function SplashScreen({ dismissAfter = 1650, onDone }: SplashScreenProps) {
  const reduced = useReducedMotion();

  // ── Seen-flag (async) — null = "not yet checked" ──────────────────────────
  const [visible, setVisible] = React.useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY)
      .then((val) => { setVisible(val === null); })
      .catch(()  => { setVisible(false); });
  }, []);

  // ── Shared values for each animated layer ─────────────────────────────────
  const containerOpacity = useSharedValue(1);

  const glowOpacity  = useSharedValue(0);
  const glowScale    = useSharedValue(0.5);

  const ringOpacity  = useSharedValue(0);
  const ringScale    = useSharedValue(0.4);

  const logoOpacity  = useSharedValue(0);
  const logoScale    = useSharedValue(0);

  const taglineOpacity = useSharedValue(0);

  // ── Animated styles ───────────────────────────────────────────────────────
  const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity:   glowOpacity.value,
    transform: [{ scale: glowScale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity:   ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity:   logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({ opacity: taglineOpacity.value }));

  // ── Run entrance sequence then schedule dismiss ────────────────────────────
  useEffect(() => {
    if (visible !== true) return;

    // Mark as seen immediately so back-nav / re-render won't replay
    AsyncStorage.setItem(SESSION_KEY, "1").catch(() => {});

    const dismiss = () => {
      setVisible(false);
      onDone?.();
    };

    if (reduced) {
      const t = setTimeout(dismiss, REDUCED_DELAY);
      return () => clearTimeout(t);
    }

    // ── Enter animations ───────────────────────────────────────────────────
    const fadeCfg = (duration: number) =>
      ({ duration, easing: Easing.out(Easing.ease) } as const);

    // Glow — t=0
    glowOpacity.value = withTiming(1, fadeCfg(400));
    glowScale.value   = withTiming(1, fadeCfg(400));

    // Ring — t=80 ms
    ringOpacity.value = withDelay(80,  withTiming(1,   fadeCfg(200)));
    ringScale.value   = withDelay(80,  withSpring(1,   SPRING_FAST));

    // Logo — t=260 ms
    logoOpacity.value = withDelay(260, withTiming(1,   fadeCfg(220)));
    logoScale.value   = withDelay(260, withSpring(1,   SPRING_FAST));

    // Tagline — t=870 ms
    taglineOpacity.value = withDelay(TAGLINE_MS, withTiming(1, fadeCfg(300)));

    // ── Exit ──────────────────────────────────────────────────────────────
    const t = setTimeout(() => {
      containerOpacity.value = withTiming(0, { duration: EXIT_DURATION }, (finished) => {
        if (finished) runOnJS(dismiss)();
      });
    }, dismissAfter);

    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduced, dismissAfter, onDone]);

  // Not yet checked, or already seen
  if (visible !== true) return null;

  return (
    <Animated.View
      style={[styles.container, containerStyle]}
      pointerEvents="none"
    >
      {/* Glow halo */}
      <Animated.View style={[styles.glow, glowStyle]} />

      {/* Icon ring */}
      <Animated.View style={[styles.ring, ringStyle]}>
        <Animated.View style={logoStyle}>
          <Ionicons name="flash" size={40} color="rgba(230,235,255,0.92)" />
        </Animated.View>
      </Animated.View>

      {/* Title — character-by-character */}
      <View style={styles.titleRow}>
        {TITLE_CHARS.map((char, i) => (
          <SplashChar
            key={i}
            char={char}
            index={i}
            reduced={reduced}
          />
        ))}
      </View>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, taglineStyle]}>
        Your trading journal
      </Animated.Text>
    </Animated.View>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex:          9999,
    alignItems:      "center",
    justifyContent:  "center",
    backgroundColor: "rgb(7,8,11)",    // matches radial-gradient dark core
  },
  glow: {
    position:     "absolute",
    width:        280,
    height:       280,
    borderRadius: 140,
    backgroundColor: "rgba(99,102,241,0.18)",
  },
  ring: {
    width:           88,
    height:          88,
    borderRadius:    26,
    borderWidth:     1.5,
    borderColor:     "rgba(165,180,252,0.30)",
    backgroundColor: "rgba(99,102,241,0.10)",
    alignItems:      "center",
    justifyContent:  "center",
    marginBottom:    24,
  },
  titleRow: {
    flexDirection: "row",
    alignItems:    "baseline",
    marginBottom:  10,
    overflow:      "hidden",
  },
  titleChar: {
    fontSize:      34,
    fontWeight:    "700",
    letterSpacing: -0.68,   // approx. -0.02em at 34px
    color:         "rgba(240,244,255,0.96)",
    lineHeight:    40,
  },
  tagline: {
    fontSize:      13,
    color:         "rgba(148,163,184,0.65)",
    fontWeight:    "400",
    letterSpacing: 0.65,    // approx. 0.05em at 13px
    textTransform: "uppercase",
  },
});
