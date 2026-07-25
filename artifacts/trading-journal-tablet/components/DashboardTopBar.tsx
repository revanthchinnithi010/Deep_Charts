/**
 * DashboardTopBar — React Native port of the web Layout header (mobile view).
 *
 * Web source: artifacts/trading-journal/src/components/layout.tsx
 *             (the <header> block, mobile branch — see isMobile path)
 *
 * Web → RN replacements:
 *   div / span / button        → View / Text / Pressable
 *   lucide-react icons         → Ionicons (@expo/vector-icons)
 *   CSS var(--surface-*)       → hardcoded dark-theme tokens (see C below)
 *   profile avatar <img>       → Image / LinearGradient + Text initials
 *   SVG currency icons         → react-native-svg Svg/Path (exact same paths)
 *   env(safe-area-inset-top)   → useSafeAreaInsets().top
 *   setProfilePageOpen         → router.push("/profile")
 *   useNotifications()         → useNotifications (NotificationsContext)
 *   bellShake CSS animation    → omitted (no hover/transition equivalent)
 *   NotificationPanel origin   → omitted (RN panel is fullscreen, no anchor)
 *
 * Design tokens (matched exactly from index.css dark theme):
 *   --surface-header          #000000
 *   --surface-header-border   rgba(255,255,255,0.05)
 *   --surface-btn-border      rgba(255,255,255,0.06)
 *   --surface-avatar-bg       linear-gradient(135deg, rgba(255,255,255,0.08), rgba(5,7,10,0.70))
 *   --surface-avatar-border   rgba(255,255,255,0.12)   [pill/active border]
 *   --surface-avatar-text     #94a3b8
 *   pill bg                   #1E1E20
 *   pill border               rgba(255,255,255,0.08)
 *   badge bg                  hsl(0,72%,56%) ≈ #DC2626
 *   badge border              #05070A
 *
 * Layout (web: px-4, gap-3, h-[60px]):
 *   paddingHorizontal: 16
 *   gap between left+right: flex row justify-between
 *   content height: 60px (below the safe-area inset)
 *
 * Left side:
 *   Avatar circle  w-[46px] h-[46px] rounded-full
 *   Logo column    gap-[2.5] = 10px; AreaLabLogo height=18.5 + "by Revanth" 11.3px italic
 *
 * Right side:
 *   Oval pill      bg #1E1E20, border rgba(255,255,255,0.08), radius 99, padding 3px
 *   Currency btn   w-9 h-9 = 36×36, rounded-full, colour #FFFFFF, $ or ₹ SVG 16×16
 *   Bell btn       w-9 h-9 = 36×36, rounded-full, colour #FFFFFF, bell SVG 16×16
 *   Badge          16×16, bg hsl(0,72%,56%), border 2px #05070A, text-[9px] bold white
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { memo, useCallback, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Svg, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NotificationPanel } from "@/components/NotificationPanel";
import { useNotifications } from "@/contexts/NotificationsContext";
import { useProfile, getInitials } from "@/components/profile/ProfileMenu";
import { useCurrencyStore } from "@/store/currencyStore";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — matched exactly from index.css dark theme vars
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  headerBg:         "#000000",                   // --surface-header
  headerBorder:     "rgba(255,255,255,0.05)",     // --surface-header-border
  avatarBorder:     "rgba(255,255,255,0.06)",     // --surface-btn-border (normal state)
  avatarBorderActive: "rgba(255,255,255,0.16)",   // --surface-btn-active-border
  avatarText:       "#94a3b8",                    // --surface-avatar-text
  pillBg:           "#1E1E20",                    // merged oval pill bg
  pillBorder:       "rgba(255,255,255,0.08)",     // merged oval pill border
  iconColor:        "#FFFFFF",                    // currency + bell icons
  badgeBg:          "#DC2626",                    // hsl(0,72%,56%) notification badge
  badgeBorder:      "#05070A",                    // --notification-badge-border
  // Logo "area" gradient midpoint — web: #7B3FE4→#C4359A→#F05C86
  logoAreaColor:    "#C4359A",
  logoLabColor:     "#FFFFFF",
  byLineColor:      "rgba(255,255,255,0.45)",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// AreaLabLogo — text-based approximation of the SVG wordmark
// web SVG: "area" fill url(#gradient) + ".lab" italic white, font-size 118 in 524×102 box
// RN: Text row split into "area" (purple-pink) + "." (white) + "lab" (white italic)
// height matches web's 18.5px by using fontSize 17
// ─────────────────────────────────────────────────────────────────────────────

const AreaLabLogo = memo(function AreaLabLogo() {
  return (
    <View style={logoStyles.row}>
      <Text style={logoStyles.area}>area</Text>
      <Text style={logoStyles.dot}>.</Text>
      <Text style={logoStyles.lab}>lab</Text>
    </View>
  );
});

const logoStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems:    "baseline",
  },
  // web: font-weight 800, fill gradient → use Inter_700Bold + purple-pink colour
  area: {
    fontFamily:  "Inter_700Bold",
    fontWeight:  "700",
    fontSize:    17,
    color:       C.logoAreaColor,
    letterSpacing: -0.3,
    lineHeight:  20,
  },
  dot: {
    fontFamily:  "Inter_700Bold",
    fontWeight:  "700",
    fontSize:    17,
    color:       C.logoLabColor,
    letterSpacing: -0.3,
    lineHeight:  20,
  },
  // web: font-family Georgia serif, font-style italic, font-weight 400
  lab: {
    fontFamily:  "Inter_400Regular",
    fontWeight:  "400",
    fontStyle:   "italic",
    fontSize:    17,
    color:       C.logoLabColor,
    letterSpacing: -0.5,
    lineHeight:  20,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Currency SVG icons — exact Bootstrap Icons paths from web layout.tsx
// viewBox "0 0 16 16"
// ─────────────────────────────────────────────────────────────────────────────

const DollarIcon = memo(function DollarIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill={C.iconColor}>
      <Path d="M4 10.781c.148 1.667 1.513 2.85 3.591 3.003V15h1.043v-1.216c2.27-.179 3.678-1.438 3.678-3.3 0-1.59-.947-2.51-2.956-3.028l-.722-.187V3.467c1.122.11 1.879.714 2.07 1.616h1.47c-.166-1.6-1.54-2.748-3.54-2.875V1H7.591v1.233c-1.939.23-3.27 1.472-3.27 3.156 0 1.454.966 2.483 2.661 2.917l.61.162v4.031c-1.149-.17-1.94-.8-2.131-1.718zm3.391-3.836c-1.043-.263-1.6-.825-1.6-1.616 0-.944.704-1.641 1.8-1.828v3.495l-.2-.05zm1.591 1.872c1.287.323 1.852.859 1.852 1.769 0 1.097-.826 1.828-2.2 1.939V8.73z" />
    </Svg>
  );
});

const RupeeIcon = memo(function RupeeIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill={C.iconColor}>
      <Path d="M4 3.06h2.726c1.22 0 2.12.575 2.325 1.724H4v1.051h5.051C8.855 7.001 8 7.558 6.788 7.558H4v1.317L8.437 14h2.11L6.095 8.884h.855c2.316-.018 3.465-1.476 3.688-3.049H12V4.784h-1.345c-.08-.778-.357-1.335-.793-1.732H12V2H4z" />
    </Svg>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

function DashboardTopBar() {
  const insets           = useSafeAreaInsets();
  const { profile }      = useProfile();
  const { unreadCount }  = useNotifications();
  const { currency, setCurrency } = useCurrencyStore();

  const [notifOpen, setNotifOpen] = useState(false);

  const initials    = getInitials(profile.name);
  const badgeCount  = unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : null;
  const isProfileActive = false; // no press state needed on RN (no hover)

  const toggleCurrency = useCallback(() => {
    setCurrency(currency === "USD" ? "INR" : "USD");
  }, [currency, setCurrency]);

  const openProfile = useCallback(() => {
    router.push("/profile" as never);
  }, []);

  const toggleNotif = useCallback(() => {
    setNotifOpen(v => !v);
  }, []);

  const closeNotif = useCallback(() => setNotifOpen(false), []);

  return (
    <>
      {/*
        * Bar surface — mirrors web:
        *   background: #000000  (--surface-header)
        *   border-bottom: 1px solid rgba(255,255,255,0.05)  (--surface-header-border)
        *   height: 60px (content) + safe-area-inset-top
        */}
      <View style={[styles.bar, { paddingTop: insets.top }]}>
        <View style={styles.content}>

          {/* ── Left: Avatar + Logo column ── */}
          {/* web: flex items-center gap-2.5 (10px) */}
          <View style={styles.left}>

            {/*
              * Circular profile avatar — web: w-[46px] h-[46px] rounded-full
              * background: --surface-avatar-bg = linear-gradient(135deg,
              *   rgba(255,255,255,0.08), rgba(5,7,10,0.70))
              * border: 1.5px solid rgba(255,255,255,0.06)  (--surface-btn-border)
              */}
            <Pressable
              onPress={openProfile}
              style={({ pressed }) => [
                styles.avatarWrap,
                pressed && styles.avatarWrapActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Profile — ${profile.name}`}
            >
              <LinearGradient
                colors={["rgba(255,255,255,0.08)", "rgba(5,7,10,0.70)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarGradient}
              >
                {profile.avatarDataUrl ? (
                  <Image
                    source={{ uri: profile.avatarDataUrl }}
                    style={styles.avatarImage}
                    accessibilityLabel={profile.name}
                  />
                ) : (
                  // web: text-[14px] font-bold --surface-avatar-text = #94a3b8
                  <Text style={styles.avatarInitials}>{initials}</Text>
                )}
              </LinearGradient>
            </Pressable>

            {/* Logo column — web: flex flex-col items-start justify-center */}
            <View style={styles.logoCol}>
              <AreaLabLogo />
              {/*
                * "by Revanth chinnithi" — web:
                *   font-family: 'Dancing Script', cursive
                *   font-size: 11.3px, font-style: italic, font-weight: 400
                *   letter-spacing: 0px, line-height: 12.4px
                *   color: rgba(255,255,255,0.45)
                *   margin-top: 2px, margin-left: 7px
                */}
              <Text style={styles.byLine} numberOfLines={1}>
                by Revanth chinnithi
              </Text>
            </View>
          </View>

          {/* ── Right: Currency + Notification merged oval pill ── */}
          {/*
            * web: background #1E1E20, border rgba(255,255,255,0.08),
            *      border-radius 99, padding 3px, gap 0
            */}
          <View style={styles.pill}>

            {/* Currency toggle — web: w-9 h-9 rounded-full text-[15px] font-bold */}
            <Pressable
              onPress={toggleCurrency}
              style={({ pressed }) => [
                styles.pillBtn,
                pressed && styles.pillBtnActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Switch to ${currency === "USD" ? "INR (₹)" : "USD ($)"}`}
            >
              {currency === "USD" ? <DollarIcon /> : <RupeeIcon />}
            </Pressable>

            {/* Notification bell */}
            <Pressable
              onPress={toggleNotif}
              style={({ pressed }) => [
                styles.pillBtn,
                (notifOpen || pressed) && styles.pillBtnActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              {/* web: Bootstrap Icons bell SVG 16×16, colour #FFFFFF */}
              <Ionicons
                name={notifOpen ? "notifications" : "notifications-outline"}
                size={16}
                color={C.iconColor}
              />

              {/* Badge — web: -top-1 -right-1, minWidth 16px, height 16px,
                  bg hsl(0,72%,56%), border 2px --notification-badge-border = #05070A */}
              {badgeCount && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badgeCount}</Text>
                </View>
              )}
            </Pressable>
          </View>

        </View>
      </View>

      {/* Notification panel — fullscreen modal (mirrors web NotificationPanel portal) */}
      <NotificationPanel open={notifOpen} onClose={closeNotif} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const AVATAR_SIZE   = 46;   // web: w-[46px] h-[46px]
const PILL_BTN_SIZE = 36;   // web: w-9 h-9

const styles = StyleSheet.create({

  // ── Bar surface ─────────────────────────────────────────────────────────
  // web: height 60px, background #000000, border-bottom rgba(255,255,255,0.05)
  bar: {
    backgroundColor: C.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: C.headerBorder,
    // Android status-bar elevation
    ...Platform.select({
      android: { elevation: 4 },
    }),
  },

  // Visible content row — always 60px tall regardless of safe area
  // web: flex items-center justify-between px-4 h-[60px]
  content: {
    height:            60,
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "space-between",
    paddingHorizontal: 16,
  },

  // ── Left side ─────────────────────────────────────────────────────────
  // web: flex items-center gap-2.5 (10px)
  left: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           10,
    flex:          1,
    minWidth:      0,
  },

  // ── Avatar ─────────────────────────────────────────────────────────────
  // web: w-[46px] h-[46px] rounded-full overflow-hidden border 1.5px solid rgba(255,255,255,0.06)
  avatarWrap: {
    width:         AVATAR_SIZE,
    height:        AVATAR_SIZE,
    borderRadius:  AVATAR_SIZE / 2,
    overflow:      "hidden",
    borderWidth:   1.5,
    borderColor:   C.avatarBorder,
    flexShrink:    0,
  },
  // web: border-color: --surface-btn-active-border on open/active
  avatarWrapActive: {
    borderColor: C.avatarBorderActive,
  },
  avatarGradient: {
    flex:           1,
    alignItems:     "center",
    justifyContent: "center",
  },
  avatarImage: {
    width:  "100%",
    height: "100%",
  },
  // web: text-[14px] font-bold color #94a3b8
  avatarInitials: {
    color:      C.avatarText,
    fontSize:   14,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    lineHeight: 17,
  },

  // ── Logo column ────────────────────────────────────────────────────────
  // web: flex flex-col items-start justify-center min-w-0
  logoCol: {
    flexDirection:  "column",
    alignItems:     "flex-start",
    justifyContent: "center",
    minWidth:       0,
    flexShrink:     1,
  },

  // web: Dancing Script cursive 11.3px italic rgba(255,255,255,0.45)
  //      margin-top 2px margin-left 7px line-height 12.4px
  byLine: {
    fontFamily:    "Inter_400Regular",
    fontWeight:    "400",
    fontStyle:     "italic",
    fontSize:      11,
    lineHeight:    13,
    color:         C.byLineColor,
    marginTop:     2,
    marginLeft:    7,
  },

  // ── Oval pill (currency + bell) ────────────────────────────────────────
  // web: background #1E1E20, border rgba(255,255,255,0.08), radius 99, padding 3px
  pill: {
    flexDirection:  "row",
    alignItems:     "center",
    backgroundColor: C.pillBg,
    borderWidth:    1,
    borderColor:    C.pillBorder,
    borderRadius:   99,
    padding:        3,
    flexShrink:     0,
  },

  // web: w-9 h-9 = 36×36, rounded-full
  pillBtn: {
    width:          PILL_BTN_SIZE,
    height:         PILL_BTN_SIZE,
    borderRadius:   PILL_BTN_SIZE / 2,
    alignItems:     "center",
    justifyContent: "center",
  },
  // web: hover/active → background rgba(255,255,255,0.08)
  pillBtnActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },

  // ── Notification badge ─────────────────────────────────────────────────
  // web: absolute -top-1 -right-1, minWidth 16px, height 16px,
  //      bg hsl(0,72%,56%)=#DC2626, border 2px #05070A
  badge: {
    position:       "absolute",
    top:            -2,
    right:          -2,
    minWidth:       16,
    height:         16,
    borderRadius:   8,
    backgroundColor: C.badgeBg,
    borderWidth:    2,
    borderColor:    C.badgeBorder,
    alignItems:     "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  // web: text-[9px] font-bold text-white leading-none
  badgeText: {
    color:      "#FFFFFF",
    fontSize:   8,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    lineHeight: 10,
  },
});

export default memo(DashboardTopBar);
