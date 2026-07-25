/**
 * NotificationPanel — fullscreen modal (React Native).
 *
 * Migration of: artifacts/trading-journal/src/components/NotificationPanel.tsx
 * Phase 11.5 — Notifications Foundation (React → React Native)
 *
 * Web → RN replacements:
 *   createPortal / document.body          → Modal (react-native, transparent,
 *                                            animationType="none")
 *   div / span / p / button               → View / Text / Pressable
 *   lucide-react icons                    → Ionicons (@expo/vector-icons)
 *   CSS opacity+scale transitions          → Animated.timing (useNativeDriver:true)
 *   backdropFilter: blur(10px)            → BlurView (expo-blur, tint="dark")
 *   document.body.style.overflow          → not needed (Modal blocks touch)
 *   window.addEventListener("keydown")    → removed (no keyboard on mobile)
 *   window.history.pushState / popstate   → BackHandler (react-native)
 *   requestAnimationFrame                 → requestAnimationFrame (works in RN)
 *   env(safe-area-inset-bottom)           → useSafeAreaInsets().bottom
 *   overflowY:auto scrollable div         → ScrollView
 *   className / Tailwind CSS              → StyleSheet + inline styles
 *   onMouseEnter / onMouseLeave           → Pressable pressed-state styling
 *   aria-hidden / role="dialog"           → accessibilityViewIsModal
 *   transformOrigin (bell anchor)         → not applicable; scale from center
 *   100dvh                                → Modal fills full screen natively
 *
 * Performance contract preserved:
 *   • Only opacity + scale animated via Animated.Value + useNativeDriver:true
 *     (native compositor-only, equivalent to web's transform+opacity tween)
 *   • No layout animations or React re-renders during the animation
 *   • Sub-rows memoised — toggling open never re-renders the list
 *   • listReady RAF pattern preserved — list render deferred one frame after
 *     open flips so the opening animation gets a clean first frame
 *   • hasOpenedRef guard preserved — returns null until first opened (no
 *     pre-mount cost for the heavy notification list)
 *   • onCloseRef pattern preserved — effects depend only on `open`, not
 *     on the `onClose` callback reference, preventing torn-down/rebuilt
 *     BackHandler listeners on every live-price tick re-render
 *
 * Fullscreen contract preserved:
 *   • Modal fills entire screen (statusBarTranslucent on Android)
 *   • Bottom safe-area inset applied via useSafeAreaInsets
 *   • BackHandler intercepts Android hardware back when panel is open
 *
 * Exported API preserved verbatim:
 *   NotificationPanel — named + memo export
 *   Props             — { open: boolean; onClose: () => void; origin?: { x: number; y: number } | null }
 *
 * Explicitly NOT implemented:
 *   ❌ Push notifications
 *   ❌ Firebase Messaging / Expo Notifications
 *   ❌ Notification permissions
 *   ❌ Notification Center pages
 *   ❌ New notification features
 *   ❌ Business logic changes
 */

import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Animated,
  BackHandler,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useNotifications,
  type AppNotification,
  type NotifType,
} from "@/contexts/NotificationsContext";

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function fmtRelTime(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)  return "just now";
  const m = Math.floor(s / 60);  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ─── type config ─────────────────────────────────────────────────────────── */
/*
 * Icon names are Ionicons equivalents of the lucide-react originals:
 *   TrendingUp   → trending-up
 *   Layers       → layers
 *   GitBranch    → git-branch
 *   Wifi         → wifi
 *   WifiOff      → alert-circle  (no wifi-off in Ionicons; error semantics preserved)
 *   Link2        → link
 *   Send         → send
 *   Activity     → pulse         (closest activity/waveform icon in Ionicons)
 *   Info         → information-circle
 *   Bell         → notifications
 *   ArrowLeft    → arrow-back
 *   CheckCheck   → checkmark-done
 *   Trash2       → trash
 */

const TYPE_CFG: Record<NotifType, { iconName: string; color: string; bg: string }> = {
  price_alert:     { iconName: "trending-up",          color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
  zone_alert:      { iconName: "layers",               color: "#fb923c", bg: "rgba(251,146,60,0.12)"  },
  trendline_alert: { iconName: "git-branch",           color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  ws_reconnect:    { iconName: "wifi",                 color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
  ws_error:        { iconName: "alert-circle",         color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  broker:          { iconName: "link",                 color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  },
  telegram:        { iconName: "send",                 color: "#38bdf8", bg: "rgba(56,189,248,0.12)"  },
  feed:            { iconName: "pulse",                color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
  system:          { iconName: "information-circle",   color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
};

/* ─── animation constants ─────────────────────────────────────────────────── */

const OPEN_MS  = 220;   // fast enough to feel instant, long enough to feel smooth
const CLOSE_MS = 180;   // slightly faster dismiss

/* ─── memoised sub-components ─────────────────────────────────────────────── */

const NotifItem = memo(function NotifItem({
  n, onRead,
}: { n: AppNotification; onRead: (id: string) => void }) {
  const { iconName, color, bg } = TYPE_CFG[n.type];
  return (
    <Pressable
      onPress={() => onRead(n.id)}
      style={({ pressed }) => [
        styles.notifItem,
        pressed && styles.notifItemPressed,
      ]}
    >
      <View style={[styles.notifIconWrap, { backgroundColor: bg }]}>
        <Ionicons name={iconName as any} size={16} color={color} />
      </View>
      <View style={styles.notifBody}>
        <View style={styles.notifTitleRow}>
          <Text style={styles.notifTitle} numberOfLines={1}>{n.title}</Text>
          {!n.read && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.notifDesc} numberOfLines={2}>{n.description}</Text>
        <Text style={styles.notifTime}>{fmtRelTime(n.timestamp)}</Text>
      </View>
    </Pressable>
  );
});

const EmptyState = memo(function EmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="notifications" size={28} color="rgba(255,255,255,0.28)" />
      </View>
      <Text style={styles.emptyTitle}>No Notifications</Text>
      <Text style={styles.emptyDesc}>
        Price alerts, executions and system updates will appear here.
      </Text>
    </View>
  );
});

const NotifList = memo(function NotifList({
  notifications, onRead,
}: { notifications: AppNotification[]; onRead: (id: string) => void }) {
  return notifications.length === 0
    ? <EmptyState />
    : <>{notifications.map(n => <NotifItem key={n.id} n={n} onRead={onRead} />)}</>;
});

/* ─── component ───────────────────────────────────────────────────────────── */

interface Props {
  open: boolean;
  onClose: () => void;
  /** Accepted for API compatibility; unused — RN scales from center. */
  origin?: { x: number; y: number } | null;
}

export const NotificationPanel = memo(function NotificationPanel({ open, onClose }: Props) {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const insets = useSafeAreaInsets();

  const hasOpenedRef = useRef(open);
  if (open) hasOpenedRef.current = true;

  /* Lazy-render the notification list one frame after `open` flips true so
     the scale+opacity animation gets a clean first frame with nothing else
     competing for layout/paint. Data is already in memory (context). */
  const [listReady, setListReady] = useState(false);
  useEffect(() => {
    if (!open) { setListReady(false); return; }
    const id = requestAnimationFrame(() => setListReady(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  /* `onClose` may be a fresh arrow function on every parent re-render
     (live-price ticks). Effects depend ONLY on `open` — onCloseRef keeps
     the callback fresh without making it a dependency. */
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  /* Animated values — all compositor-only (useNativeDriver:true):
       backdropOpacity  0 → 1 on open, 1 → 0 on close  (blur backdrop)
       panelOpacity     0 → 1 on open, 1 → 0 on close  (panel fade)
       panelScale       0.96 → 1 on open, 1 → 0.96 on close  (subtle emerge)

     The scale range (0.96–1.0) is intentionally tiny — it adds depth without
     any "grow from centre" artifact, because at 0.96 the panel already covers
     most of the screen. This is the standard iOS fullscreen-overlay pattern. */
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const panelOpacity    = useRef(new Animated.Value(0)).current;
  const panelScale      = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (open) {
      /* ── OPEN: fade in + gentle scale-up emerge ─────────────────────────
         Stop any in-flight close first so there's no fighting. Then snap
         back to start values before animating — ensures every open starts
         clean regardless of where a prior interrupted close left things. */
      backdropOpacity.stopAnimation();
      panelOpacity.stopAnimation();
      panelScale.stopAnimation();
      backdropOpacity.setValue(0);
      panelOpacity.setValue(0);
      panelScale.setValue(0.96);

      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue:         1,
          duration:        OPEN_MS,
          easing:          Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(panelOpacity, {
          toValue:         1,
          duration:        OPEN_MS,
          easing:          Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(panelScale, {
          toValue:         1,
          duration:        OPEN_MS,
          easing:          Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      /* ── CLOSE: fade out + gentle scale-down ───────────────────────────
         Reverse of open — panel fades and shrinks back to 0.96 and out. */
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue:         0,
          duration:        CLOSE_MS,
          easing:          Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(panelOpacity, {
          toValue:         0,
          duration:        CLOSE_MS,
          easing:          Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(panelScale, {
          toValue:         0.96,
          duration:        CLOSE_MS,
          easing:          Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Android hardware back button — close panel instead of navigating away.
     Depends ONLY on `open` (see onCloseRef note above). */
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onCloseRef.current();
      return true; // prevent default back navigation
    });
    return () => sub.remove();
  }, [open]);

  /* Never mount the heavy list DOM until first opened; after that it stays
     mounted (per contract) and only visibility toggles via the animation. */
  if (!hasOpenedRef.current) return null;

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => onCloseRef.current()}
      accessibilityViewIsModal
    >
      {/* Backdrop — fades in behind the panel, tap-to-close */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          { opacity: backdropOpacity, pointerEvents: "box-none" },
        ]}
      >
        <BlurView
          intensity={60}
          tint="dark"
          style={StyleSheet.absoluteFillObject}
        />
        {/* Pressable covers the backdrop; the panel is rendered on top so
            touches on the panel do not reach this layer. */}
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={() => onCloseRef.current()}
          accessibilityLabel="Close notifications"
        />
      </Animated.View>

      {/* Fullscreen panel — fade + gentle emerge scale (0.96 → 1).
          The 4% scale range is imperceptible as "growth from centre" but
          gives the panel a polished depth feel on both open and close. */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          {
            opacity:         panelOpacity,
            transform:       [{ scale: panelScale }],
            backgroundColor: "#000000",
            flexDirection:   "column",
            paddingBottom:   insets.bottom,
          },
        ]}
      >
        {/* Header — back button + title, sits directly below the status bar */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
              accessibilityLabel="Back"
              accessibilityRole="button"
            >
              <Ionicons name="arrow-back" size={18} color="rgba(255,255,255,0.85)" />
            </Pressable>
            <Text style={styles.headerTitle}>Notifications</Text>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 99 ? "99+" : String(unreadCount)}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.headerRight}>
            {unreadCount > 0 && (
              <Pressable
                onPress={markAllRead}
                style={({ pressed }) => [styles.iconBtn, styles.iconBtnSm, pressed && styles.iconBtnPressed]}
                accessibilityLabel="Mark all read"
                accessibilityRole="button"
              >
                <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.55)" />
              </Pressable>
            )}
            {notifications.length > 0 && (
              <Pressable
                onPress={clearAll}
                style={({ pressed }) => [styles.iconBtn, styles.iconBtnSm, pressed && styles.iconBtnPressed]}
                accessibilityLabel="Clear all notifications"
                accessibilityRole="button"
              >
                <Ionicons name="trash" size={14} color="rgba(255,255,255,0.55)" />
              </Pressable>
            )}
          </View>
        </View>

        {/* Notification list — the only scrollable region */}
        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={[
            styles.listContent,
            notifications.length === 0 && styles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          bounces
        >
          {listReady && <NotifList notifications={notifications} onRead={markRead} />}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
});

/* ─── styles ──────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  /* Header */
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 8,
  },

  /* Badge */
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#ffffff",
    lineHeight: 12,
  },

  /* Icon buttons */
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnSm: {
    width: 32,
    height: 32,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  iconBtnPressed: {
    opacity: 0.6,
  },

  /* List scroll */
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 6,
  },
  listContentEmpty: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },

  /* Notification item */
  notifItem: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  notifItemPressed: {
    backgroundColor: "rgba(255,255,255,0.055)",
  },
  notifIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  notifBody: {
    flex: 1,
    minWidth: 0,
  },
  notifTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  notifTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
    flex: 1,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#22C55E",
    flexShrink: 0,
  },
  notifDesc: {
    fontSize: 12,
    lineHeight: 17,
    color: "rgba(255,255,255,0.55)",
    marginTop: 2,
  },
  notifTime: {
    fontSize: 10.5,
    fontWeight: "500",
    color: "rgba(255,255,255,0.35)",
    marginTop: 6,
  },

  /* Empty state */
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 32,
    paddingTop: 20,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
  },
  emptyDesc: {
    fontSize: 13,
    marginTop: 6,
    maxWidth: 260,
    lineHeight: 18,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
  },
});
