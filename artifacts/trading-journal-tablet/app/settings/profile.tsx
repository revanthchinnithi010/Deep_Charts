/**
 * app/settings/profile.tsx — Profile Settings Screen (Settings List)
 *
 * Migration of: artifacts/trading-journal/src/components/ProfileSettingsPage.tsx
 * Phase 11.2 — Settings Sub-Pages (React → React Native)
 *
 * Web → RN replacements
 * ──────────────────────────────────────────────────────────────────────────
 *   Controlled component (open/onClose/onOpenX props) → Expo Router screen
 *   CSS translateX slide animation                    → Stack navigator animation
 *   onOpenAppearance()    → router.push("/settings/appearance")
 *   onOpenNotifications() → router.push("/settings/notifications")
 *   onOpenSecurity()      → router.push("/settings/security")
 *   onOpenAbout()         → router.push("/settings/about")
 *   onClose() [SignOut]   → router.back()
 *   div / span / p / button                           → View / Text / Pressable
 *   overflowY:auto                                    → ScrollView
 *   lucide-react icons                                → Ionicons equivalents
 *   import.meta.env.BASE_URL                          → getApiBase()
 *   navigator.clipboard.writeText()                   → Clipboard.setStringAsync()
 *   window.addEventListener("keydown")                → removed (no keyboard)
 *   requestAnimationFrame CSS gate                    → removed
 *   rendered/visible mount-gate state                 → removed
 *   onPointerDown/Up/Leave                            → onPressIn / onPressOut
 *
 * Business logic preserved exactly:
 *   DbStatus / DeltaStatus types (preserved)
 *   LiveData interface (preserved)
 *   fetchStatus() — fetches /api/health + /api/delta/status concurrently
 *   fetchIp()     — fetches /api/my-ip
 *   pollRef — 15_000ms interval on fetchStatus while screen is mounted
 *   mountedRef — guards setState calls after unmount
 *   copyIp() — clipboard copy with 2s "Copied" feedback
 *   derived display values: themeName, dbDot/Label, deltaDot/Label,
 *                           ctraderDot/Label (all verbatim)
 *   useBrokerStore(s => s.brokerStatuses["ctrader"] ?? "disconnected")
 *   StatusDot: ok=green, warn=amber, error=red, loading=slate
 *   Section order: General → Connections → Account
 *   Row layout constants: ROW_HEIGHT=72, ICON_SIZE=52, ROW_GAP=16,
 *                         ROW_PADDING=24, DIVIDER_INSET=92
 *
 * Exported API preserved:
 *   ProfileSettingsPageProps  — original controlled-component props
 *   ProfileSettingsPage       — named export (delegates to screen)
 *   DbStatus, DeltaStatus     — exported types
 *   LiveData                  — exported interface
 */

import {
  ChevronLeft, ChevronRight, Check, Copy, RefreshCw, LogOut,
  Palette, Bell, Server, Activity, Globe, ShieldCheck, Info,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";

type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
import { router } from "expo-router";
import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getApiBase } from "@/lib/apiBase";
import { useTheme } from "@/contexts/ThemeContext";
import { useBrokerStore } from "@/store/brokerStore";

// ─────────────────────────────────────────────────────────────────────────────
// Exported interface — preserved verbatim from source
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfileSettingsPageProps {
  open:                boolean;
  onClose:             () => void;
  onOpenAppearance:    () => void;
  onOpenNotifications: () => void;
  onOpenSecurity:      () => void;
  onOpenAbout:         () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported types — preserved verbatim from source
// ─────────────────────────────────────────────────────────────────────────────

export type DbStatus    = "connected" | "error" | "loading";
export type DeltaStatus = "connected" | "reconnecting" | "disconnected" | "loading";

export interface LiveData {
  db:        DbStatus;
  dbLatency: number | null;
  delta:     DeltaStatus;
  ip:        string | null;
  ipLoading: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants — preserved verbatim from source
// ─────────────────────────────────────────────────────────────────────────────

const ROW_HEIGHT    = 72;
const ICON_SIZE     = 52;
const ROW_GAP       = 16;
const ROW_PADDING   = 24;
const DIVIDER_INSET = ROW_PADDING + ICON_SIZE + ROW_GAP; // 92

// ─────────────────────────────────────────────────────────────────────────────
// StatusDot — preserved verbatim from source (View instead of span)
// ─────────────────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: "ok" | "warn" | "error" | "loading" }) {
  const COLOR = {
    ok:      "#34d399",
    warn:    "#fbbf24",
    error:   "#f87171",
    loading: "#94a3b8",
  }[status];
  return (
    <View style={[styles.statusDot, { backgroundColor: COLOR }]} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionLabel — preserved verbatim (first vs rest padding)
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return (
    <Text style={[styles.sectionLabel, first ? styles.sectionLabelFirst : styles.sectionLabelRest]}>
      {children as string}
    </Text>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Divider
// ─────────────────────────────────────────────────────────────────────────────

function Divider() {
  return <View style={[styles.divider, { marginLeft: DIVIDER_INSET }]} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// SignOutRow — preserved (calls router.back() instead of onClose in web)
// In the web this was literally `onClose` = history.back(), not an auth sign-out.
// ─────────────────────────────────────────────────────────────────────────────

function SignOutRow({ onPress }: { onPress: () => void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      style={[
        styles.row,
        {
          paddingHorizontal: ROW_PADDING,
          height:            ROW_HEIGHT,
          gap:               ROW_GAP,
        },
        pressed && { backgroundColor: "rgba(239,68,68,0.06)" },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Sign Out"
    >
      <View style={[styles.iconBox, {
        width:           ICON_SIZE,
        height:          ICON_SIZE,
        backgroundColor: "rgba(239,68,68,0.10)",
      }]}>
        <LogOut size={20} color="#f87171" />
      </View>
      <Text style={[styles.rowLabel, { flex: 1, color: "#f87171" }]}>Sign Out</Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NavRow — tappable row navigating to a sub-screen
// ─────────────────────────────────────────────────────────────────────────────

function NavRow({
  Icon, iconBg, iconColor, label, rightContent, onPress, last,
}: {
  Icon:          LucideIcon;
  iconBg:        string;
  iconColor:     string;
  label:         string;
  rightContent?: React.ReactNode;
  onPress:       () => void;
  last?:         boolean;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <>
      <Pressable
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={onPress}
        style={[
          styles.row,
          {
            paddingHorizontal: ROW_PADDING,
            height:            ROW_HEIGHT,
            gap:               ROW_GAP,
          },
          pressed && { backgroundColor: "rgba(255,255,255,0.04)" },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={[styles.iconBox, {
          width:           ICON_SIZE,
          height:          ICON_SIZE,
          backgroundColor: iconBg,
        }]}>
          <Icon size={22} color={iconColor} />
        </View>

        <Text style={[styles.rowLabel, { flex: 1 }]}>{label}</Text>

        <View style={styles.rowRight}>
          {rightContent}
          <ChevronRight size={16} color="rgba(148,163,184,0.30)" />
        </View>
      </Pressable>
      {!last && <Divider />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InfoRow — display-only row, optional onPress (no chevron)
// ─────────────────────────────────────────────────────────────────────────────

function InfoRow({
  Icon, iconBg, iconColor, label, rightContent, onPress, last,
}: {
  Icon:          LucideIcon;
  iconBg:        string;
  iconColor:     string;
  label:         string;
  rightContent?: React.ReactNode;
  onPress?:      () => void;
  last?:         boolean;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <>
      <Pressable
        onPressIn={() => onPress && setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={onPress}
        style={[
          styles.row,
          {
            paddingHorizontal: ROW_PADDING,
            height:            ROW_HEIGHT,
            gap:               ROW_GAP,
          },
          pressed && onPress && { backgroundColor: "rgba(255,255,255,0.04)" },
        ]}
        disabled={!onPress}
        accessibilityRole={onPress ? "button" : "none"}
        accessibilityLabel={label}
      >
        <View style={[styles.iconBox, {
          width:           ICON_SIZE,
          height:          ICON_SIZE,
          backgroundColor: iconBg,
        }]}>
          <Icon size={22} color={iconColor} />
        </View>

        <Text style={[styles.rowLabel, { flex: 1 }]}>{label}</Text>

        {rightContent != null && (
          <View style={styles.rowRight}>{rightContent}</View>
        )}
      </Pressable>
      {!last && <Divider />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen component
// ─────────────────────────────────────────────────────────────────────────────

function ProfileSettingsScreen() {
  const insets = useSafeAreaInsets();

  const { themeMode } = useTheme();

  // useBrokerStore — preserved verbatim from source
  const ctraderStatus = useBrokerStore(
    s => (s.brokerStatuses["ctrader"] as string | undefined) ?? "disconnected",
  );

  // live data — preserved verbatim from source
  const [live, setLive] = useState<LiveData>({
    db:        "loading",
    dbLatency: null,
    delta:     "loading",
    ip:        null,
    ipLoading: true,
  });
  const [copied, setCopied] = useState(false);

  const mountedRef = useRef(true);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── fetchStatus — preserved verbatim (BASE → getApiBase()) ──────────────
  const fetchStatus = useCallback(async () => {
    const BASE = getApiBase();
    try {
      const [health, delta] = await Promise.all([
        fetch(`${BASE}/api/health`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null) as Promise<{
            database?: { connected: boolean; latencyMs: number | null };
          } | null>,
        fetch(`${BASE}/api/delta/status`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null) as Promise<{
            connected?: boolean; status?: string;
          } | null>,
      ]);
      if (!mountedRef.current) return;
      setLive(p => ({
        ...p,
        db:        health?.database?.connected ? "connected" : "error",
        dbLatency: health?.database?.latencyMs ?? null,
        delta:     delta?.connected         ? "connected"
                 : delta?.status === "reconnecting" ? "reconnecting"
                 : "disconnected",
      }));
    } catch { /* ignore */ }
  }, []);

  // ── fetchIp — preserved verbatim ────────────────────────────────────────
  const fetchIp = useCallback(async () => {
    const BASE = getApiBase();
    try {
      const res = await fetch(`${BASE}/api/my-ip`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null) as { ip?: string } | null;
      if (!mountedRef.current) return;
      setLive(p => ({ ...p, ip: res?.ip ?? null, ipLoading: false }));
    } catch {
      if (mountedRef.current) setLive(p => ({ ...p, ipLoading: false }));
    }
  }, []);

  // ── Mount/unmount lifecycle — preserved verbatim ─────────────────────────
  useEffect(() => {
    fetchStatus();
    fetchIp();
    pollRef.current = setInterval(fetchStatus, 15_000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [fetchStatus, fetchIp]);

  // ── copyIp — navigator.clipboard → Clipboard.setStringAsync ─────────────
  const copyIp = useCallback(async () => {
    if (!live.ip) return;
    try {
      await Clipboard.setStringAsync(live.ip);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [live.ip]);

  // ── Derived display values — preserved verbatim ──────────────────────────
  const themeName =
    themeMode === "light"  ? "Light"
    : themeMode === "system" ? "System"
    : "Dark";

  const dbDot: "ok" | "error" | "loading" =
    live.db === "connected" ? "ok" : live.db === "loading" ? "loading" : "error";
  const dbLabel =
    live.db === "connected"
      ? `Connected${live.dbLatency != null ? ` · ${live.dbLatency}ms` : ""}`
      : live.db === "loading"  ? "Checking…"
      : "Unavailable";

  const deltaDot: "ok" | "warn" | "error" | "loading" =
    live.delta === "connected"    ? "ok"
    : live.delta === "reconnecting" ? "warn"
    : live.delta === "loading"      ? "loading"
    : "error";
  const deltaLabel =
    live.delta === "connected"     ? "Live"
    : live.delta === "reconnecting" ? "Reconnecting…"
    : live.delta === "loading"      ? "Checking…"
    : "Offline";

  const ctraderDot: "ok" | "warn" | "error" =
    ctraderStatus === "connected"  ? "ok"
    : ctraderStatus === "connecting" ? "warn"
    : "error";
  const ctraderLabel =
    ctraderStatus === "connected"  ? "Connected"
    : ctraderStatus === "connecting" ? "Connecting…"
    : "Disconnected";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={18} color="rgba(255,255,255,0.72)" />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* ── Scrollable list ──────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── GENERAL ──────────────────────────────────────────────────── */}
        <SectionLabel first>General</SectionLabel>

        <NavRow
          Icon={Palette}
          iconBg="rgba(139,92,246,0.14)"
          iconColor="#a78bfa"
          label="Appearance"
          rightContent={
            <Text style={styles.rightLabel}>{themeName}</Text>
          }
          onPress={() => router.push("/settings/appearance")}
        />

        <NavRow
          Icon={Bell}
          iconBg="rgba(245,158,11,0.14)"
          iconColor="#fbbf24"
          label="Notifications"
          onPress={() => router.push("/settings/notifications")}
          last
        />

        {/* ── CONNECTIONS ──────────────────────────────────────────────── */}
        <SectionLabel>Connections</SectionLabel>

        {/* Database Status */}
        <InfoRow
          Icon={Server}
          iconBg="rgba(59,130,246,0.14)"
          iconColor="#60a5fa"
          label="Database"
          rightContent={
            <View style={styles.statusGroup}>
              <StatusDot status={dbDot} />
              <Text style={styles.rightLabel}>{dbLabel}</Text>
              <Pressable
                onPress={fetchStatus}
                hitSlop={4}
                accessibilityLabel="Refresh database status"
              >
                <RefreshCw size={12} color="rgba(148,163,184,0.35)" />
              </Pressable>
            </View>
          }
        />

        {/* Delta Exchange Status */}
        <InfoRow
          Icon={Activity}
          iconBg="rgba(16,185,129,0.14)"
          iconColor="#34d399"
          label="Delta Exchange"
          rightContent={
            <View style={styles.statusGroup}>
              <StatusDot status={deltaDot} />
              <Text style={styles.rightLabel}>{deltaLabel}</Text>
            </View>
          }
        />

        {/* cTrader Status */}
        <InfoRow
          Icon={Server}
          iconBg="rgba(96,165,250,0.14)"
          iconColor="#60a5fa"
          label="cTrader"
          rightContent={
            <View style={styles.statusGroup}>
              <StatusDot status={ctraderDot} />
              <Text style={styles.rightLabel}>{ctraderLabel}</Text>
            </View>
          }
        />

        {/* Backend Server IP — tappable to copy */}
        <InfoRow
          Icon={Globe}
          iconBg="rgba(234,179,8,0.14)"
          iconColor="#fde047"
          label="Backend Server"
          onPress={live.ip ? copyIp : undefined}
          rightContent={
            <View style={styles.statusGroup}>
              {live.ipLoading ? (
                <Text style={styles.rightLabelDim}>Loading…</Text>
              ) : live.ip ? (
                <>
                  <Text style={[styles.rightLabel, styles.monoFont]}>
                    {live.ip}
                  </Text>
                  {copied
                    ? <Check size={14} color="#34d399" />
                    : <Copy size={14} color="rgba(148,163,184,0.40)" />}
                </>
              ) : (
                <Text style={styles.rightLabelDim}>Unavailable</Text>
              )}
            </View>
          }
          last
        />

        {/* ── ACCOUNT ──────────────────────────────────────────────────── */}
        <SectionLabel>Account</SectionLabel>

        <NavRow
          Icon={ShieldCheck}
          iconBg="rgba(52,211,153,0.14)"
          iconColor="#34d399"
          label="Security"
          onPress={() => router.push("/settings/security")}
        />

        <NavRow
          Icon={Info}
          iconBg="rgba(148,163,184,0.14)"
          iconColor="#cbd5e1"
          label="About"
          onPress={() => router.push("/settings/about")}
          last
        />

        {/* Breathing room before Sign Out */}
        <View style={{ height: 8 }} />

        {/* Sign Out — calls router.back() (preserved: was onClose = history.back()) */}
        <SignOutRow onPress={() => router.back()} />
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Named export — preserved for source compatibility
// ─────────────────────────────────────────────────────────────────────────────

export const ProfileSettingsPage = memo(ProfileSettingsScreen);

// ─────────────────────────────────────────────────────────────────────────────
// Default export — Expo Router screen entry point
// ─────────────────────────────────────────────────────────────────────────────

export default ProfileSettingsScreen;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: "#000000",
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    height:            60,
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "space-between",
    paddingHorizontal: 12,
    backgroundColor:   "#000000",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  backBtn: {
    width:           40,
    height:          40,
    borderRadius:    20,
    alignItems:      "center",
    justifyContent:  "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.09)",
  },
  headerTitle: {
    fontSize:      16,
    fontWeight:    "700",
    color:         "rgba(255,255,255,0.92)",
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 40,
  },

  // ── Scroll ────────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    // paddingBottom set inline
  },

  // ── Section label ─────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize:          11,
    fontWeight:        "700",
    letterSpacing:     1.1,
    textTransform:     "uppercase",
    paddingBottom:     10,
    paddingHorizontal: 24,
    color:             "rgba(148,163,184,0.40)",
    lineHeight:        11,
  },
  sectionLabelFirst: {
    paddingTop: 24,
  },
  sectionLabelRest: {
    paddingTop: 32,
  },

  // ── Row (shared base) ─────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems:    "center",
  },
  iconBox: {
    borderRadius:   16,
    flexShrink:     0,
    alignItems:     "center",
    justifyContent: "center",
  },
  rowLabel: {
    fontSize:   15,
    fontWeight: "600",
    color:      "rgba(255,255,255,0.90)",
  },
  rowRight: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
    flexShrink:    0,
  },

  // ── Status group (StatusDot + label + optional refresh) ───────────────────
  statusGroup: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
  },
  statusDot: {
    width:        7,
    height:       7,
    borderRadius: 3.5,
    flexShrink:   0,
  },

  // ── Right-side labels ─────────────────────────────────────────────────────
  rightLabel: {
    fontSize: 13,
    color:    "rgba(148,163,184,0.65)",
  },
  rightLabelDim: {
    fontSize: 13,
    color:    "rgba(148,163,184,0.40)",
  },
  monoFont: {
    fontFamily: "monospace",
    fontSize:   12,
  },

  // ── Divider ───────────────────────────────────────────────────────────────
  divider: {
    height:          1,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
});
