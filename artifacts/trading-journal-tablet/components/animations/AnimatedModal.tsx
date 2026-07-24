/**
 * components/animations/AnimatedModal.tsx — React Native (Reanimated)
 *
 * Migration of: artifacts/trading-journal/src/components/animations/AnimatedModal.tsx
 * Phase 12.4 — Composite Animation Wrappers (React → React Native)
 *
 * Web → RN replacements:
 *   createPortal(content, document.body)→ Modal (react-native) — always top-level
 *   AnimatePresence (Motion.dev)         → useEffect on isVisible + close timeout
 *   motion.div backdrop                  → Animated.View + BlurView (expo-blur)
 *   motion.div panel                     → Animated.View with Reanimated transitions
 *   backdropFilter: "blur(4px)"          → BlurView intensity={20} tint="dark"
 *   position: fixed; inset: 0           → StyleSheet.absoluteFillObject
 *   position: fixed; bottom/left/right   → Animated.View + safe-area insets
 *   top:50%,left:50%,translate(-50%)     → flex centering (flexbox in Modal)
 *   panelClassName                       → preserved in interface; unused in RN
 *   panelStyle: React.CSSProperties      → panelStyle: StyleProp<ViewStyle>
 *   zIndex (CSS)                         → not needed; Modal is always on top
 *
 * Open animation:
 *   Triggered via Modal's onShow callback (fires once the native modal is ready).
 *   backdrop: opacity 0→1 (220ms, from backdropVariants.visible)
 *   dialog panel: opacity 0→1 + translateY 20→0 + scale 0.985→1 (220ms easeOut)
 *   sheet panel: opacity 0→1 + translateY CLOSED→0 (SPRING_PANEL spring)
 *
 * Close animation:
 *   Triggered when isVisible becomes false (prop change).
 *   backdrop: opacity 1→0 (180ms, from backdropVariants.exit)
 *   dialog panel: opacity 1→0 + translateY 0→10 + scale 1→0.96 (160ms)
 *   sheet panel: opacity 1→0.3 + translateY 0→CLOSED (240ms)
 *   After animation completes, Modal is hidden via setTimeout.
 *
 * Keyboard avoidance: KeyboardAvoidingView (iOS: "padding"; Android: undefined).
 * Safe area: useSafeAreaInsets for sheet mode bottom padding.
 * Accessibility: Modal's accessible prop; backdrop is pressable for dismiss.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from "react-native-reanimated";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { SHEET_TRANSLATE_CLOSED, SPRING_PANEL } from "@/animations/motion";

/* ─── Timing constants (mirror variant exit durations) ────────────────────── */

const BACKDROP_ENTER_MS  = 220;
const BACKDROP_EXIT_MS   = 180;
const DIALOG_ENTER_MS    = 220;
const DIALOG_EXIT_MS     = 160;
const SHEET_EXIT_MS      = 240;

/* ─── Types ───────────────────────────────────────────────────────────────── */

interface AnimatedModalProps {
  open?:           boolean;
  /** Alias for `open` — for call sites that pass `isOpen`. */
  isOpen?:         boolean;
  onClose:         () => void;
  children:        React.ReactNode;
  /** Optional title rendered as a header inside the panel. */
  title?:          string;
  /** "dialog" (centered overlay) or "sheet" (bottom drawer). Default: "dialog" */
  mode?:           "dialog" | "sheet";
  /** Preserved for API compat; unused in RN (no class-name system). */
  panelClassName?: string;
  panelStyle?:     StyleProp<ViewStyle>;
  /** Preserved for API compat; Modal is always on top in RN (no zIndex layering). */
  zIndex?:         number;
  /** Show a blurred backdrop. Default: true */
  backdrop?:       boolean;
}

/* ─── Component ───────────────────────────────────────────────────────────── */

export function AnimatedModal({
  open,
  isOpen,
  onClose,
  children,
  title,
  mode           = "dialog",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  panelClassName: _panelClassName,
  panelStyle,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  zIndex:        _zIndex = 1000,
  backdrop       = true,
}: AnimatedModalProps) {
  const reduced    = useReducedMotion();
  const insets     = useSafeAreaInsets();
  const isVisible  = open ?? isOpen ?? false;

  // ── Internal visibility — Modal hides only after close animation completes ─
  const [modalShown, setModalShown]     = useState(isVisible);
  const closeTimerRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasVisibleRef                   = useRef(isVisible);

  // ── Shared values ──────────────────────────────────────────────────────────
  const backdropOpacity  = useSharedValue(0);
  const panelOpacity     = useSharedValue(0);
  const panelTranslateY  = useSharedValue(mode === "sheet" ? SHEET_TRANSLATE_CLOSED : 20);
  const panelScale       = useSharedValue(mode === "dialog" ? 0.985 : 1);

  // ── Animated styles ────────────────────────────────────────────────────────
  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const panelAnimStyle = useAnimatedStyle(() => ({
    opacity:   panelOpacity.value,
    transform: [
      { translateY: panelTranslateY.value },
      ...(mode === "dialog" ? [{ scale: panelScale.value }] : []),
    ],
  }));

  // ── Enter animation — called from onShow once Modal is rendered ────────────
  const runEnter = useCallback(() => {
    if (reduced) {
      backdropOpacity.value = 1;
      panelOpacity.value    = 1;
      panelTranslateY.value = 0;
      panelScale.value      = 1;
      return;
    }

    backdropOpacity.value = withTiming(1, { duration: BACKDROP_ENTER_MS });

    if (mode === "sheet") {
      panelTranslateY.value = withSpring(0, SPRING_PANEL);
      panelOpacity.value    = withTiming(1, { duration: BACKDROP_ENTER_MS });
    } else {
      const ease = Easing.out(Easing.ease);
      panelOpacity.value    = withTiming(1, { duration: DIALOG_ENTER_MS, easing: ease });
      panelTranslateY.value = withTiming(0, { duration: DIALOG_ENTER_MS, easing: ease });
      panelScale.value      = withTiming(1, { duration: DIALOG_ENTER_MS, easing: ease });
    }
  }, [reduced, mode, backdropOpacity, panelOpacity, panelTranslateY, panelScale]);

  // ── Exit animation — runs when isVisible becomes false ─────────────────────
  const runExit = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);

    if (reduced) {
      backdropOpacity.value = 0;
      panelOpacity.value    = 0;
      panelTranslateY.value = mode === "sheet" ? SHEET_TRANSLATE_CLOSED : 20;
      panelScale.value      = mode === "dialog" ? 0.96 : 1;
      setModalShown(false);
      return;
    }

    const exitMs = mode === "sheet" ? SHEET_EXIT_MS : DIALOG_EXIT_MS;

    backdropOpacity.value = withTiming(0, { duration: BACKDROP_EXIT_MS });

    if (mode === "sheet") {
      const exitEase = Easing.bezier(0.4, 0, 1, 1);
      panelTranslateY.value = withTiming(SHEET_TRANSLATE_CLOSED, { duration: exitMs, easing: exitEase });
      panelOpacity.value    = withTiming(0.3,                    { duration: exitMs, easing: exitEase });
    } else {
      panelOpacity.value    = withTiming(0,    { duration: exitMs });
      panelTranslateY.value = withTiming(10,   { duration: exitMs });
      panelScale.value      = withTiming(0.96, { duration: exitMs });
    }

    // Hide modal after exit animation finishes.
    closeTimerRef.current = setTimeout(() => {
      setModalShown(false);
      // Reset shared values for next open.
      panelOpacity.value    = 0;
      panelTranslateY.value = mode === "sheet" ? SHEET_TRANSLATE_CLOSED : 20;
      panelScale.value      = mode === "dialog" ? 0.985 : 1;
      backdropOpacity.value = 0;
    }, exitMs + 20);
  }, [reduced, mode, backdropOpacity, panelOpacity, panelTranslateY, panelScale]);

  // ── Respond to prop changes ────────────────────────────────────────────────
  useEffect(() => {
    const prev = wasVisibleRef.current;
    wasVisibleRef.current = isVisible;

    if (isVisible && !prev) {
      // Opening: show Modal first, then onShow starts the enter animation.
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      setModalShown(true);
    } else if (!isVisible && prev) {
      // Closing: start exit animation, hide Modal after it completes.
      runExit();
    }
  }, [isVisible, runExit]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // ── Sheet bottom padding (safe area) ───────────────────────────────────────
  const sheetBottomPad = mode === "sheet" ? insets.bottom : 0;

  return (
    <Modal
      visible={modalShown}
      transparent
      animationType="none"
      onRequestClose={onClose}
      onShow={runEnter}
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* ── Backdrop ───────────────────────────────────────────────────── */}
        {backdrop && (
          <Animated.View style={[StyleSheet.absoluteFillObject, backdropAnimStyle]}>
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={onClose}
              accessibilityLabel="Close modal"
              accessibilityRole="button"
            >
              <BlurView
                intensity={20}
                tint="dark"
                style={StyleSheet.absoluteFillObject}
              />
              <View style={[StyleSheet.absoluteFillObject, styles.backdropOverlay]} />
            </Pressable>
          </Animated.View>
        )}

        {/* ── Panel ──────────────────────────────────────────────────────── */}
        <View
          style={[
            styles.flex,
            mode === "sheet" ? styles.sheetOuter : styles.dialogOuter,
          ]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              mode === "sheet"
                ? [styles.sheetPanel, { paddingBottom: sheetBottomPad }]
                : styles.dialogPanel,
              panelAnimStyle,
              panelStyle,
            ]}
          >
            {title && (
              <View style={styles.titleRow}>
                <Text style={styles.titleText}>{title}</Text>
              </View>
            )}
            {children}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ─── Styles ──────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  backdropOverlay: {
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  // Dialog (centered)
  dialogOuter: {
    justifyContent: "center",
    alignItems:     "center",
    padding:        20,
  },
  dialogPanel: {
    width:           "100%",
    maxWidth:        480,
    borderRadius:    12,
    backgroundColor: "rgba(15,20,18,0.98)",
    overflow:        "hidden",
  },
  // Sheet (bottom drawer)
  sheetOuter: {
    justifyContent: "flex-end",
  },
  sheetPanel: {
    width:           "100%",
    borderTopLeftRadius:  16,
    borderTopRightRadius: 16,
    backgroundColor:      "rgba(15,20,18,0.98)",
    overflow:             "hidden",
  },
  // Title header
  titleRow: {
    paddingHorizontal: 16,
    paddingTop:        14,
    paddingBottom:     0,
  },
  titleText: {
    fontSize:   14,
    fontWeight: "700",
    color:      "#ffffff",
  },
});
