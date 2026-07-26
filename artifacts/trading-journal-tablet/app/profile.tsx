/**
 * app/profile.tsx — Profile Screen (Expo Router)
 *
 * Migration of: artifacts/trading-journal/src/components/ProfilePage.tsx
 * Phase 11.3 — Profile Module (React → React Native)
 *
 * Web → RN replacements:
 *   fixed inset-0 overlay + navStack + pushState/popState
 *                                    → Expo Router stack screen (Stack.Screen)
 *   window.history.pushState/go       → router.push() / router.back()
 *   window.addEventListener("popstate")→ removed (Expo Router handles back)
 *   window.addEventListener("keydown") → removed (no keyboard ESC on mobile)
 *   requestAnimationFrame CSS gate     → removed (Stack animation handles this)
 *   rendered/visible mount-gate state  → removed (Expo Router handles mount)
 *   CSS translateX enter/exit          → Stack "slide_from_right" (settings/_layout)
 *   localStorage (via useProfile)      → AsyncStorage (via useProfile hook)
 *   FileReader + Blob + anchor.click() → Share.share() for export
 *   <input type="file">                → removed (❌ Avatar upload out of scope)
 *   Camera icon overlay (tappable)     → removed (❌ Camera integration out of scope)
 *   Sub-page overlays (settings stack) → router.push("/settings/profile")
 *   div / span / p / button / input   → View / Text / Pressable / TextInput
 *   lucide-react icons                 → Ionicons (@expo/vector-icons)
 *   overflowY: auto / -webkit-overflow → ScrollView
 *   env(safe-area-inset-bottom)        → useSafeAreaInsets()
 *
 * Business logic preserved:
 *   useProfile() hook (name, email, avatarDataUrl, update)
 *   handleSave: 300ms delay, setSaved, 2500ms reset — verbatim from source
 *   handleExportProfile: JSON structure { profile, exportedAt } — verbatim
 *   Sign Out: calls router.back() (preserved: was onClose = handleClose)
 *   Settings gear: navigates to settings (preserved: was pushPage("settings"))
 *   Avatar display: renders avatarDataUrl or initials (display only)
 *   Personal Info: Full Name + Email Address inputs with save button
 *   Responsive layout: maxWidth 480, centered, padded — preserved
 *   Section ordering: Avatar hero → Personal Info → Export Data → Sign Out
 *
 * Explicitly NOT implemented (per Phase 11.3 scope):
 *   ❌ Edit Profile workflow (Avatar upload / Camera / Image picker)
 *   ❌ New profile features
 *   ❌ Theme settings
 *   ❌ Notification settings
 *   ❌ Security settings
 *   ❌ Business logic changes
 *
 * Exported API preserved:
 *   ProfilePageProps  — interface { open, onClose, profile, onUpdate }
 *   ProfilePage       — named export (compat shim: triggers router navigation)
 *
 * Default export: ProfileScreen (Expo Router screen entry point)
 */

import { ArrowLeft, Settings, Check, Save, Download, LogOut, ChevronRight } from "lucide-react-native";
import { router } from "expo-router";
import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";

import {
  useProfile,
  getInitials,
  type ProfileData,
} from "@/components/profile/ProfileMenu";

// ─────────────────────────────────────────────────────────────────────────────
// Exported interface — ProfilePageProps
// Preserved verbatim from source (controlled-component props).
// In the tablet this component is a router screen; the props are preserved
// for source compatibility — see ProfilePage compat shim below.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfilePageProps {
  open:     boolean;
  onClose:  () => void;
  profile:  ProfileData;
  onUpdate: (p: Partial<ProfileData>) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout helpers — preserved from source
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function Card({
  children,
  noPad,
  style,
}: {
  children: React.ReactNode;
  noPad?:   boolean;
  style?:   import("react-native").ViewStyle;
}) {
  return (
    <View style={[styles.card, noPad && styles.cardNoPad, style]}>
      {children}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProfileScreen — Expo Router screen
// ─────────────────────────────────────────────────────────────────────────────

function ProfileScreen() {
  const insets = useSafeAreaInsets();

  // Profile data from AsyncStorage-backed hook (AsyncStorage replaces localStorage)
  const { profile, update } = useProfile();

  // Local edit state — mirrors web source's useState for name/email/saving/saved
  const [name,   setName]   = useState(profile.name);
  const [email,  setEmail]  = useState(profile.email);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  // Sync name/email when profile loads from AsyncStorage
  // Mirrors web: "sync name/email when profile prop changes externally"
  useEffect(() => {
    setName(profile.name);
    setEmail(profile.email);
  }, [profile.name, profile.email]);

  // ── handleSave — preserved verbatim from source ──────────────────────────
  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    await new Promise<void>(r => setTimeout(r, 300));
    update({ name: name.trim(), email: email.trim() });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, [name, email, update]);

  // ── handleExportProfile — preserved verbatim (Blob → Share.share) ────────
  const handleExportProfile = useCallback(() => {
    const payload = JSON.stringify(
      {
        profile: { name: profile.name, email: profile.email },
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    );
    // Blob + anchor.click() → Share.share (react-native built-in)
    Share.share({ message: payload, title: "tradevault-profile.json" }).catch(() => {});
  }, [profile.name, profile.email]);

  const initials = getInitials(profile.name);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      {/* ── Sticky header — mirrors web's <header> 60px fixed bar ───────── */}
      <View style={styles.header}>
        {/* Back — router.back() mirrors web's handleClose() */}
        <Pressable
          onPress={() => router.back()}
          style={styles.headerBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={18} color="rgba(255,255,255,0.72)" />
        </Pressable>

        <Text style={styles.headerTitle}>Profile</Text>

        {/* Settings gear — pushPage("settings") → router.push("/settings/profile") */}
        <Pressable
          onPress={() => router.push("/settings/profile")}
          style={styles.headerBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Settings size={16} color="rgba(255,255,255,0.72)" />
        </Pressable>
      </View>

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inner}>

          {/* ── Avatar hero ─────────────────────────────────────────────────
              Web: camera icon overlay + file input for upload.
              RN:  display only — ❌ avatar upload out of scope in Phase 11.3.
              Shape, size, border, shadow preserved from source.
          */}
          <View style={styles.avatarHero}>
            <View style={styles.avatarOuter}>
              {profile.avatarDataUrl ? (
                <Image
                  source={{ uri: profile.avatarDataUrl }}
                  style={styles.avatarImage}
                  contentFit="cover"
                  cachePolicy="memory"
                  accessibilityLabel={profile.name}
                />
              ) : (
                <Text style={styles.avatarInitials}>{initials}</Text>
              )}
            </View>

            {/* Name + email — below avatar, centered */}
            <View style={styles.avatarNameBlock}>
              <Text style={styles.avatarName}>{profile.name}</Text>
              {!!profile.email && (
                <Text style={styles.avatarEmail}>{profile.email}</Text>
              )}
            </View>

            {/* Remove photo — only shown when avatarDataUrl is set */}
            {!!profile.avatarDataUrl && (
              <Pressable
                onPress={() => update({ avatarDataUrl: null })}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
              >
                <Text style={styles.removePhoto}>Remove photo</Text>
              </Pressable>
            )}
          </View>

          {/* ── Personal Info card ─────────────────────────────────────────── */}
          <Card>
            <SectionLabel>Personal Info</SectionLabel>
            <View style={styles.cardForm}>

              {/* Full Name */}
              <View style={styles.fieldGroup}>
                <FieldLabel>Full Name</FieldLabel>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor="rgba(148,163,184,0.35)"
                  style={styles.input}
                  returnKeyType="next"
                  autoCapitalize="words"
                  accessibilityLabel="Full Name"
                />
              </View>

              {/* Email Address */}
              <View style={styles.fieldGroup}>
                <FieldLabel>Email Address</FieldLabel>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@email.com"
                  placeholderTextColor="rgba(148,163,184,0.35)"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                  accessibilityLabel="Email Address"
                />
              </View>

              {/* Save button — mirrors web's icon + text button */}
              <SaveButton
                saving={saving}
                saved={saved}
                disabled={saving || !name.trim()}
                onPress={handleSave}
              />
            </View>
          </Card>

          {/* ── Export Data card ─────────────────────────────────────────────
              Mirrors web: Download icon, label, ChevronRight.
              Blob + anchor.click() → Share.share().
          */}
          <Card noPad>
            <Pressable
              onPress={handleExportProfile}
              style={({ pressed }) => [
                styles.actionRow,
                pressed && styles.actionRowPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Export Data — Download your profile as JSON"
            >
              <View style={[styles.actionIcon, styles.actionIconExport]}>
                <Download size={17} color="#60a5fa" />
              </View>
              <View style={styles.actionText}>
                <Text style={styles.actionTitle}>Export Data</Text>
                <Text style={styles.actionSub}>Download your profile as JSON</Text>
              </View>
              <ChevronRight size={16} color="rgba(148,163,184,0.30)" />
            </Pressable>
          </Card>

          {/* ── Sign Out card ─────────────────────────────────────────────────
              Mirrors web: red LogOut icon, "Sign Out" label.
              Web: handleClose() → RN: router.back() (UI-only, no auth sign-out).
          */}
          <Card noPad style={styles.cardSignOut}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.actionRow,
                pressed && styles.signOutRowPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Sign Out"
            >
              <View style={[styles.actionIcon, styles.actionIconSignOut]}>
                <LogOut size={17} color="#f87171" />
              </View>
              <Text style={styles.signOutLabel}>Sign Out</Text>
            </Pressable>
          </Card>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SaveButton — extracted to avoid inline function in JSX
// Preserves web's Save/Saving…/✓ Saved label states exactly.
// ─────────────────────────────────────────────────────────────────────────────

interface SaveButtonProps {
  saving:   boolean;
  saved:    boolean;
  disabled: boolean;
  onPress:  () => void;
}

const SaveButton = memo(function SaveButton({
  saving, saved, disabled, onPress,
}: SaveButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.saveBtn,
        saved    && styles.saveBtnSaved,
        disabled && styles.saveBtnDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={saved ? "Saved" : saving ? "Saving" : "Save Changes"}
      accessibilityState={{ disabled }}
    >
      {saved
        ? <Check size={13} color="#34d399" />
        : <Save size={13} color="#a5b4fc" />}
      <Text style={[styles.saveBtnLabel, saved && styles.saveBtnLabelSaved]}>
        {saved ? "Saved" : saving ? "Saving…" : "Save Changes"}
      </Text>
    </Pressable>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ProfilePage — named export (compatibility shim)
//
// In the web, ProfilePage is a controlled overlay rendered inside the layout.
// In the tablet it is an Expo Router screen. This shim preserves the exported
// API so any import of { ProfilePage } from "@/components/profile/ProfileMenu"
// (or the screen path) continues to compile.
//
// Behavior: when open=true, pushes /profile on the navigation stack once.
//           When open=false, does nothing (router.back() is the user gesture).
// ─────────────────────────────────────────────────────────────────────────────

export const ProfilePage = memo(function ProfilePage({
  open,
}: ProfilePageProps) {
  const pushedRef = useRef(false);

  useEffect(() => {
    if (open && !pushedRef.current) {
      pushedRef.current = true;
      router.push("/profile");
    }
    if (!open) {
      pushedRef.current = false;
    }
  }, [open]);

  return null;
});

// ─────────────────────────────────────────────────────────────────────────────
// Default export — Expo Router screen entry point
// ─────────────────────────────────────────────────────────────────────────────

export default ProfileScreen;

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Root ──────────────────────────────────────────────────────────────────
  root: {
    flex:            1,
    backgroundColor: "#000000",
  },

  // ── Header — mirrors web's <header> h-60 sticky bar ───────────────────────
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
  headerBtn: {
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

  // ── Scroll ─────────────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    // paddingBottom set inline (safe area + 32)
  },
  inner: {
    maxWidth:      480,
    alignSelf:     "center",
    width:         "100%",
    paddingHorizontal: 16,
    paddingTop:    0,
    gap:           16,
  },

  // ── Avatar hero — mirrors web's flex col items-center pt-28 gap-12 ────────
  avatarHero: {
    alignItems:    "center",
    gap:           12,
    paddingTop:    28,
    paddingBottom: 8,
  },
  avatarOuter: {
    width:          88,
    height:         88,
    borderRadius:   44,
    overflow:       "hidden",
    alignItems:     "center",
    justifyContent: "center",
    backgroundColor: "rgba(16,185,129,0.12)",
    borderWidth:    2.5,
    borderColor:    "rgba(255,255,255,0.14)",
  },
  avatarImage: {
    width:  "100%",
    height: "100%",
  },
  avatarInitials: {
    fontSize:   30,
    fontWeight: "700",
    color:      "#34d399",
    lineHeight: 36,
  },
  avatarNameBlock: {
    alignItems: "center",
  },
  avatarName: {
    fontSize:      17,
    fontWeight:    "700",
    color:         "rgba(255,255,255,0.90)",
    letterSpacing: -0.2,
    lineHeight:    22,
    textAlign:     "center",
  },
  avatarEmail: {
    fontSize:  12,
    color:     "rgba(148,163,184,0.60)",
    marginTop: 4,
    textAlign: "center",
  },
  removePhoto: {
    fontSize: 11,
    color:    "#f87171",
    padding:  4,
  },

  // ── Card ─────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: "#121212",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.07)",
    borderRadius:    20,
    overflow:        "hidden",
    paddingBottom:   4,
  },
  cardNoPad: {
    paddingBottom: 0,
  },
  cardSignOut: {
    marginBottom: 8,
  },

  // ── SectionLabel ──────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize:          10,
    fontWeight:        "700",
    letterSpacing:     1.3,
    textTransform:     "uppercase",
    paddingTop:        18,
    paddingHorizontal: 20,
    paddingBottom:     8,
    color:             "rgba(148,163,184,0.45)",
    lineHeight:        12,
  },

  // ── FieldLabel ────────────────────────────────────────────────────────────
  fieldLabel: {
    fontSize:      10,
    fontWeight:    "700",
    color:         "rgba(148,163,184,0.50)",
    textTransform: "uppercase",
    letterSpacing: 1.0,
  },

  // ── Card form ─────────────────────────────────────────────────────────────
  cardForm: {
    paddingHorizontal: 16,
    paddingBottom:     16,
    gap:               12,
  },
  fieldGroup: {
    gap: 6,
  },

  // ── TextInput ─────────────────────────────────────────────────────────────
  input: {
    width:           "100%",
    backgroundColor: "#1A1A1A",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.09)",
    borderRadius:    12,
    paddingHorizontal: 14,
    paddingVertical:   10,
    fontSize:        14,
    color:           "rgba(255,255,255,0.88)",
  },

  // ── Save button ───────────────────────────────────────────────────────────
  saveBtn: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            8,
    paddingVertical:   11,
    paddingHorizontal: 20,
    borderRadius:   14,
    backgroundColor: "rgba(165,180,252,0.12)",
    borderWidth:    1,
    borderColor:    "rgba(165,180,252,0.22)",
  },
  saveBtnSaved: {
    backgroundColor: "rgba(16,185,129,0.16)",
    borderColor:     "rgba(16,185,129,0.28)",
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnLabel: {
    fontSize:   13,
    fontWeight: "600",
    color:      "#a5b4fc",
  },
  saveBtnLabelSaved: {
    color: "#34d399",
  },

  // ── Action row (Export / Sign Out) ────────────────────────────────────────
  actionRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           14,
    padding:       17,
  },
  actionRowPressed: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  actionIcon: {
    width:          40,
    height:         40,
    borderRadius:   13,
    flexShrink:     0,
    alignItems:     "center",
    justifyContent: "center",
  },
  actionIconExport: {
    backgroundColor: "rgba(96,165,250,0.10)",
    borderWidth:     1,
    borderColor:     "rgba(96,165,250,0.20)",
  },
  actionIconSignOut: {
    backgroundColor: "rgba(248,113,113,0.09)",
    borderWidth:     1,
    borderColor:     "rgba(248,113,113,0.18)",
  },
  actionText: {
    flex: 1,
  },
  actionTitle: {
    fontSize:   14,
    fontWeight: "600",
    color:      "rgba(255,255,255,0.85)",
    lineHeight: 19,
  },
  actionSub: {
    fontSize:  11,
    color:     "rgba(148,163,184,0.55)",
    marginTop: 2,
  },
  signOutRowPressed: {
    backgroundColor: "rgba(248,113,113,0.06)",
  },
  signOutLabel: {
    flex:       1,
    fontSize:   14,
    fontWeight: "600",
    color:      "#f87171",
  },
});
