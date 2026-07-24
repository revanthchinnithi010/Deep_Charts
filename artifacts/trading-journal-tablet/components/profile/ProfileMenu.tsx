/**
 * src/components/profile/ProfileMenu.tsx — React Native ProfileMenu
 *
 * Migration of: artifacts/trading-journal/src/components/ProfileMenu.tsx
 * Phase 11.3 — Profile Module (React → React Native)
 *
 * Web → RN replacements:
 *   localStorage.getItem/setItem     → AsyncStorage (same key "tradevault_profile")
 *   createPortal / document.body     → BottomSheetModal (@gorhom/bottom-sheet)
 *   CSS opacity/transform transition → BottomSheet built-in gesture + snap animations
 *   window.addEventListener          → removed (no window in RN)
 *   getBoundingClientRect            → bottom sheet positions itself natively
 *   document.body.classList          → removed (no DOM)
 *   wouter useLocation / navigate    → router.push() (Expo Router)
 *   Blob + URL.createObjectURL       → Share.share (react-native built-in)
 *   lucide-react icons               → Ionicons (@expo/vector-icons)
 *   <div> / <span> / <button> / <img> → View / Text / Pressable / Image
 *   HTMLElement anchorRef            → View ref (type updated, unused in sheet)
 *   onMouseEnter / onMouseLeave      → onPressIn / onPressOut
 *   AnimatePresence / motion.div     → removed (BottomSheet handles animation)
 *   AnimatedModal / ProfileModal     → not implemented (❌ Edit Profile out of scope)
 *   SidebarSystemSections            → not rendered (web-only sidebar widget)
 *
 * Bottom sheet behavior preserved:
 *   ✅ open/close animations         — BottomSheet built-in snap animation
 *   ✅ gesture interactions          — GestureHandlerRootView in _layout.tsx
 *   ✅ snap points                   — ["55%", "80%"]
 *   ✅ backdrop behavior             — BottomSheetBackdrop, opacity 0.68
 *   ✅ drag-to-dismiss               — enablePanDownToClose={true}
 *   ✅ keyboard handling             — android:keyboardInputMode via BottomSheet
 *   ✅ accessibility                 — accessibilityRole on all interactive elements
 *
 * Exported API preserved verbatim:
 *   ProfileData       — interface { name, email, avatarDataUrl }
 *   useProfile()      — hook (async AsyncStorage load, same localStorage key)
 *   getInitials()     — pure function (unchanged)
 *   DropdownProps     — interface (anchorRef typed to View; side prop accepted)
 *   ProfileDropdown   — component (BottomSheetModal replaces portal dropdown)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeMode } from "@/contexts/ThemeContext";

// ─────────────────────────────────────────────────────────────────────────────
// Exported interface — ProfileData
// Preserved verbatim from source.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfileData {
  name: string;
  email: string;
  avatarDataUrl: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile persistence — AsyncStorage replaces localStorage
// Same storage key "tradevault_profile" preserved for continuity.
// loadProfileSync() provides a synchronous default for useState initializer;
// the async load fires immediately in useProfile()'s first useEffect.
// ─────────────────────────────────────────────────────────────────────────────

const PROFILE_KEY = "tradevault_profile";

function loadProfileSync(): ProfileData {
  return { name: "Trader", email: "", avatarDataUrl: null };
}

async function loadProfileAsync(): Promise<ProfileData> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw) as ProfileData;
  } catch { /**/ }
  return { name: "Trader", email: "", avatarDataUrl: null };
}

function saveProfile(p: ProfileData): void {
  // Fire-and-forget — same pattern as web's localStorage.setItem in catch block
  AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p)).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// useProfile — exported hook
// Preserved: { profile, update } shape, partial-update pattern, save on update.
// Changed:   initial load is async (unavoidable with AsyncStorage).
// ─────────────────────────────────────────────────────────────────────────────

export function useProfile() {
  const [profile, setProfile] = useState<ProfileData>(loadProfileSync);

  useEffect(() => {
    let cancelled = false;
    loadProfileAsync().then(p => {
      if (!cancelled) setProfile(p);
    });
    return () => { cancelled = true; };
  }, []);

  const update = useCallback((p: Partial<ProfileData>) => {
    setProfile(prev => {
      const next = { ...prev, ...p };
      saveProfile(next);
      return next;
    });
  }, []);

  return { profile, update };
}

// ─────────────────────────────────────────────────────────────────────────────
// getInitials — exported pure function
// Identical to web source — no browser APIs involved.
// ─────────────────────────────────────────────────────────────────────────────

export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Static data — preserved verbatim from source
// Icons mapped: Lucide → Ionicons equivalents
// ─────────────────────────────────────────────────────────────────────────────

// MENU_ITEMS — action strings preserved exactly ("profile", "settings", etc.)
const MENU_ITEMS = [
  { ionName: "person-outline",        label: "My Profile",  action: "profile",    danger: false },
  { ionName: "settings-outline",      label: "Settings",    action: "settings",   danger: false },
  { ionName: "color-palette-outline", label: "Appearance",  action: "appearance", danger: false },
  { ionName: "download-outline",      label: "Export Data", action: "export",     danger: false },
  { ionName: "log-out-outline",       label: "Sign Out",    action: "signout",    danger: true  },
] as const;

// THEME_OPTIONS — mode strings and label/sub text preserved verbatim
const THEME_OPTIONS: {
  mode: ThemeMode;
  label: string;
  sub: string;
  ionName: string;
}[] = [
  { mode: "light",  label: "Light",          sub: "Always use light theme",   ionName: "sunny-outline"    },
  { mode: "dark",   label: "Dark",           sub: "Always use dark theme",    ionName: "moon-outline"     },
  { mode: "system", label: "System Default", sub: "Follow device preference", ionName: "contrast-outline" },
];

// ─────────────────────────────────────────────────────────────────────────────
// ThemeRow — sub-component
// Preserved: mode, label, sub, active, onSelect props.
// Changed:   HTML button → Pressable; className → StyleSheet; Icon → Ionicons.
// ─────────────────────────────────────────────────────────────────────────────

interface ThemeRowProps {
  mode:     ThemeMode;
  label:    string;
  sub:      string;
  ionName:  string;
  active:   boolean;
  onSelect: (m: ThemeMode) => void;
}

const ThemeRow = memo(function ThemeRow({
  mode, label, sub, ionName, active, onSelect,
}: ThemeRowProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => onSelect(mode)}
      style={[
        styles.themeRow,
        active  && styles.themeRowActive,
        pressed && !active && styles.themeRowPressed,
      ]}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={`${label}: ${sub}`}
    >
      {/* Icon box — mirrors web's w-7 h-7 rounded-lg */}
      <View style={[
        styles.themeIconBox,
        active && styles.themeIconBoxActive,
      ]}>
        <Ionicons
          name={ionName as React.ComponentProps<typeof Ionicons>["name"]}
          size={14}
          color={active ? "#a5b4fc" : "rgba(148,163,184,0.55)"}
        />
      </View>

      {/* Text block */}
      <View style={styles.themeTextBlock}>
        <Text style={[styles.themeLabel, active && styles.themeLabelActive]}>
          {label}
        </Text>
        <Text style={styles.themeSub}>{sub}</Text>
      </View>

      {/* Active checkmark — mirrors web's #a5b4fc filled circle */}
      {active && (
        <View style={styles.themeCheck}>
          <Ionicons name="checkmark" size={10} color="#1e1b4b" />
        </View>
      )}
    </Pressable>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// AppearancePanel — sub-component
// Preserved: THEME_OPTIONS rendering, back button, section header.
// Changed:   div → View; button → Pressable; Lucide → Ionicons.
// ─────────────────────────────────────────────────────────────────────────────

const AppearancePanel = memo(function AppearancePanel({
  onBack,
}: { onBack: () => void }) {
  const { themeMode, setThemeMode } = useTheme();

  return (
    <View>
      {/* Header row — mirrors web's border-bottom flex header */}
      <View style={styles.panelHeader}>
        <Pressable
          onPress={onBack}
          style={styles.panelBackBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={14} color="rgba(255,255,255,0.72)" />
        </Pressable>
        <View style={styles.panelTitleRow}>
          <View style={styles.panelTitleIcon}>
            <Ionicons name="color-palette-outline" size={12} color="#a5b4fc" />
          </View>
          <Text style={styles.panelTitleText}>Appearance</Text>
        </View>
      </View>

      {/* Theme mode options */}
      <View style={styles.appearanceBody}>
        <Text style={styles.sectionMini}>Theme Mode</Text>
        <View style={styles.themeOptions}>
          {THEME_OPTIONS.map(o => (
            <ThemeRow
              key={o.mode}
              mode={o.mode}
              label={o.label}
              sub={o.sub}
              ionName={o.ionName}
              active={themeMode === o.mode}
              onSelect={setThemeMode}
            />
          ))}
        </View>
      </View>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// MenuItemRow — sub-component
// Preserved: danger color, chevron on non-danger items, divider before last item.
// Changed:   button → Pressable; onMouseEnter/Leave → onPressIn/Out.
// ─────────────────────────────────────────────────────────────────────────────

interface MenuItemRowProps {
  ionName: string;
  label:   string;
  action:  string;
  danger:  boolean;
  isLast:  boolean;
  onClick: (action: string) => void;
}

const MenuItemRow = memo(function MenuItemRow({
  ionName, label, action, danger, isLast, onClick,
}: MenuItemRowProps) {
  const [pressed, setPressed] = useState(false);

  return (
    <View>
      {/* Divider before the last (danger) item — mirrors web's my-1.5 mx-2 rule */}
      {isLast && <View style={styles.menuDivider} />}

      <Pressable
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        onPress={() => onClick(action)}
        style={[
          styles.menuRow,
          pressed && (danger ? styles.menuRowPressedDanger : styles.menuRowPressed),
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Ionicons
          name={ionName as React.ComponentProps<typeof Ionicons>["name"]}
          size={14}
          color={danger ? "#f87171" : "rgba(148,163,184,0.70)"}
        />
        <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>
          {label}
        </Text>
        {/* Chevron on non-danger rows — mirrors web's opacity-25 ChevronRight */}
        {!danger && (
          <Ionicons
            name="chevron-forward"
            size={12}
            color="rgba(148,163,184,0.25)"
          />
        )}
      </Pressable>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// DropdownProps — exported interface
// Preserved: open, profile, onUpdate, onClose, side.
// Changed:   anchorRef typed to View (HTMLElement → View); side accepted but
//            unused — BottomSheetModal always anchors to screen bottom.
// ─────────────────────────────────────────────────────────────────────────────

export interface DropdownProps {
  open:       boolean;
  profile:    ProfileData;
  onUpdate:   (p: Partial<ProfileData>) => void;
  onClose:    () => void;
  /** Accepted for API compatibility; unused — sheet positions itself. */
  anchorRef?: React.RefObject<View | null>;
  /** Accepted for API compatibility; unused — sheet always opens from bottom. */
  side?:      "left" | "right";
}

// ─────────────────────────────────────────────────────────────────────────────
// ProfileDropdown — exported component
//
// Web: portal-based dropdown anchored to the trigger button rect.
// RN:  BottomSheetModal anchored to screen bottom.
//
// Behavior preserved:
//   open=true  → present()  (mirrors CSS opacity 0→1 + scale 0.96→1)
//   open=false → dismiss()  (mirrors CSS opacity 1→0 + scale 1→0.96)
//   panel reset on close: 130 ms delay mirrors web's 130 ms setTimeout
//   backdrop click closes menu (BottomSheetBackdrop with disappearsOnIndex=-1)
//   swipe-down closes menu (enablePanDownToClose={true})
//   Appearance sub-panel toggle: same panel state machine ("menu" | "appearance")
//   Actions: "profile" → /profile, "settings" → /settings,
//            "appearance" → appearance panel, "export" → Share.share,
//            "signout" → onClose()
// ─────────────────────────────────────────────────────────────────────────────

export const ProfileDropdown = memo(function ProfileDropdown({
  open,
  profile,
  onUpdate: _onUpdate,  // accepted; avatar upload not implemented in this phase
  onClose,
}: DropdownProps) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [panel, setPanel] = useState<"menu" | "appearance">("menu");

  // Sync open ↔ present() / dismiss()
  // Mirrors web's anchorRect computation that fires on open change.
  useEffect(() => {
    if (open) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [open]);

  // Reset panel to "menu" after close animation finishes (130 ms).
  // Mirrors web: "Doing it on open would schedule a setState during the
  //  opening animation — this way the reset happens while invisible."
  const prevOpenRef = useRef(open);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (wasOpen && !open) {
      const t = setTimeout(() => setPanel("menu"), 130);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Snap points — 55% for the default menu height, 80% if content grows
  const snapPoints = useMemo(() => ["55%", "80%"], []);

  // Backdrop — mirrors web's rgba(0,0,0,0.68) dark backdrop
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        opacity={0.68}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [],
  );

  // Handle sheet index change — index=-1 means fully dismissed (swipe or backdrop)
  const handleChange = useCallback(
    (index: number) => {
      if (index === -1) onClose();
    },
    [onClose],
  );

  // Actions — preserved verbatim from source
  const handleAction = useCallback(
    (action: string) => {
      if (action === "settings")   { router.push("/settings"); onClose(); return; }
      if (action === "profile")    { router.push("/profile"); onClose(); return; }
      if (action === "appearance") { setPanel("appearance"); return; }
      if (action === "export") {
        // Blob + anchor download → Share.share (react-native built-in)
        const payload = JSON.stringify(
          {
            profile: { name: profile.name, email: profile.email },
            exportedAt: new Date().toISOString(),
          },
          null,
          2,
        );
        Share.share({ message: payload, title: "tradevault-profile.json" }).catch(() => {});
        return;
      }
      if (action === "signout") { onClose(); return; }
    },
    [profile.name, profile.email, onClose],
  );

  const initials = getInitials(profile.name);

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      onChange={handleChange}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.sheetHandle}
      backgroundStyle={styles.sheetBackground}
      enablePanDownToClose
    >
      <BottomSheetView style={styles.sheetContent}>

        {/* Appearance sub-panel */}
        {panel === "appearance" && (
          <AppearancePanel onBack={() => setPanel("menu")} />
        )}

        {/* Main menu */}
        {panel === "menu" && (
          <>
            {/*
              Profile header — mirrors web's flex items-center gap-3 p-3.5
              with avatar box + name/email info block.
            */}
            <View style={styles.profileHeader}>
              <View style={styles.avatarBox}>
                {profile.avatarDataUrl ? (
                  <Image
                    source={{ uri: profile.avatarDataUrl }}
                    style={styles.avatarImage}
                    accessibilityLabel={profile.name}
                  />
                ) : (
                  <Text style={styles.avatarInitials}>{initials}</Text>
                )}
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {profile.name}
                </Text>
                {!!profile.email && (
                  <Text style={styles.profileEmail} numberOfLines={1}>
                    {profile.email}
                  </Text>
                )}
              </View>
            </View>

            {/* Menu item list — p-1.5 space-y-0.5 from web */}
            <View style={styles.menuList}>
              {MENU_ITEMS.map((item, i) => (
                <MenuItemRow
                  key={item.action}
                  ionName={item.ionName}
                  label={item.label}
                  action={item.action}
                  danger={item.danger}
                  isLast={i === MENU_ITEMS.length - 1}
                  onClick={handleAction}
                />
              ))}
            </View>
          </>
        )}

      </BottomSheetView>
    </BottomSheetModal>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Bottom sheet chrome ───────────────────────────────────────────────────
  sheetBackground: {
    backgroundColor: "rgba(18,18,20,0.97)",
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    borderWidth:   1,
    borderColor:   "rgba(255,255,255,0.06)",
  },
  sheetHandle: {
    backgroundColor: "rgba(255,255,255,0.20)",
    width: 36,
    height: 4,
  },
  sheetContent: {
    flex: 1,
  },

  // ── Profile header ────────────────────────────────────────────────────────
  profileHeader: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            12,
    paddingHorizontal: 14,
    paddingVertical:   14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  avatarBox: {
    width:          40,
    height:         40,
    borderRadius:   12,
    flexShrink:     0,
    overflow:       "hidden",
    alignItems:     "center",
    justifyContent: "center",
    backgroundColor: "rgba(16,185,129,0.14)",
    borderWidth:    1.5,
    borderColor:    "rgba(16,185,129,0.25)",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarInitials: {
    fontSize:   13,
    fontWeight: "700",
    color:      "#34d399",
  },
  profileInfo: {
    flex:    1,
    minWidth: 0,
  },
  profileName: {
    fontSize:   13,
    fontWeight: "600",
    color:      "rgba(255,255,255,0.90)",
    lineHeight: 18,
  },
  profileEmail: {
    fontSize: 10,
    color:    "rgba(148,163,184,0.55)",
    marginTop: 2,
  },

  // ── Menu list ─────────────────────────────────────────────────────────────
  menuList: {
    paddingHorizontal: 6,
    paddingTop:        6,
    paddingBottom:     24,
  },
  menuDivider: {
    height:          1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginHorizontal: 8,
    marginVertical:  6,
  },
  menuRow: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            10,
    paddingHorizontal: 12,
    paddingVertical:   10,
    borderRadius:   12,
  },
  menuRowPressed: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  menuRowPressedDanger: {
    backgroundColor: "rgba(248,113,113,0.09)",
  },
  menuLabel: {
    flex:       1,
    fontSize:   12,
    fontWeight: "500",
    color:      "rgba(148,163,184,0.70)",
  },
  menuLabelDanger: {
    color: "#f87171",
  },

  // ── AppearancePanel ───────────────────────────────────────────────────────
  panelHeader: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            8,
    paddingHorizontal: 12,
    paddingVertical:   12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  panelBackBtn: {
    width:           28,
    height:          28,
    borderRadius:    8,
    alignItems:      "center",
    justifyContent:  "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    flexShrink:      0,
  },
  panelTitleRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  panelTitleIcon: {
    width:           24,
    height:          24,
    borderRadius:    6,
    alignItems:      "center",
    justifyContent:  "center",
    backgroundColor: "rgba(165,180,252,0.12)",
    borderWidth:     1,
    borderColor:     "rgba(165,180,252,0.20)",
  },
  panelTitleText: {
    fontSize:   13,
    fontWeight: "600",
    color:      "rgba(255,255,255,0.90)",
  },
  appearanceBody: {
    padding: 8,
  },
  sectionMini: {
    fontSize:      9,
    fontWeight:    "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color:         "rgba(148,163,184,0.45)",
    paddingHorizontal: 8,
    paddingTop:    4,
    paddingBottom: 8,
  },
  themeOptions: {
    gap: 2,
  },

  // ── ThemeRow ──────────────────────────────────────────────────────────────
  themeRow: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            12,
    paddingHorizontal: 12,
    paddingVertical:   10,
    borderRadius:   12,
    borderWidth:    1,
    borderColor:    "transparent",
  },
  themeRowActive: {
    backgroundColor: "rgba(165,180,252,0.10)",
    borderColor:     "rgba(165,180,252,0.22)",
  },
  themeRowPressed: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  themeIconBox: {
    width:           28,
    height:          28,
    borderRadius:    8,
    alignItems:      "center",
    justifyContent:  "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.09)",
    flexShrink:      0,
  },
  themeIconBoxActive: {
    backgroundColor: "rgba(165,180,252,0.18)",
    borderColor:     "rgba(165,180,252,0.30)",
  },
  themeTextBlock: {
    flex:    1,
    minWidth: 0,
  },
  themeLabel: {
    fontSize:   12,
    fontWeight: "500",
    color:      "rgba(255,255,255,0.80)",
    lineHeight: 16,
  },
  themeLabelActive: {
    color: "#e0e7ff",
  },
  themeSub: {
    fontSize: 10,
    color:    "rgba(148,163,184,0.50)",
    marginTop: 2,
    lineHeight: 13,
  },
  themeCheck: {
    width:           18,
    height:          18,
    borderRadius:    9,
    alignItems:      "center",
    justifyContent:  "center",
    backgroundColor: "#a5b4fc",
    flexShrink:      0,
  },
});
