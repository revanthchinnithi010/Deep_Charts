/**
 * AccountValueWidget — React Native port
 *
 * Web source: artifacts/trading-journal/src/components/AccountValueWidget.tsx
 *
 * Web → RN replacements:
 *   div / span             → View / Text
 *   framer-motion          → Pressable built-in press feedback (no dep needed)
 *   useLocation (wouter)   → onNavigate callback prop (caller owns routing)
 *   lucide-react icons     → Ionicons (@expo/vector-icons, already installed)
 *   CSS var(--stat-*)      → inline StyleSheet color tokens (matched exactly)
 *   CSS grid               → View flexbox rows
 *   CSS ::before gradient  → LinearGradient absolute overlay
 *   CSS box-shadow         → iOS shadow props + Android elevation
 *
 * Design tokens (matched 1-to-1 from .dash-account-card in index.css):
 *   --stat-title  rgba(255,255,255,0.72)   title label "Account Value"
 *   --stat-value  #FFFFFF                  main number + positions count
 *   --stat-sub    #A7A7A7                  sub-cell labels (UPNL, Net PNL …)
 *   --stat-icon   #6E7578                  chevrons + eye icon
 *   PROFIT        #22C55E                  positive PnL values
 *   LOSS          #EF4444                  negative PnL values
 *   card bg       rgba(6,6,8,0.97)  ≈ #060608
 *   card border   rgba(255,255,255,0.12)
 *   card radius   24px
 *   sub-grid bg   rgba(255,255,255,0.04)
 *   sub-grid bdr  rgba(255,255,255,0.08)
 *   positions chip linear-gradient(135deg,#f97316,#ea580c) + orange glow shadow
 */

import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight, Wallet, Eye, EyeOff, Layers } from "lucide-react-native";
import React, { memo, useCallback, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Skeleton } from "@/components/ui/skeleton";
import {
  formatAmount,
  useCurrencyStore,
  type Currency,
} from "@/store/currencyStore";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountValueWidgetProps {
  // ── Raw USD totals ───────────────────────────────────────────────────────
  /** Raw USD total account value — kept for API compatibility. */
  accountValueUSD: number;
  /** Raw USD unrealised PnL. */
  upnlUSD: number;
  /** Raw USD realised PnL. */
  realizedPnlUSD?: number;
  /** Raw USD net PnL (uPnL + realised). Computed if omitted. */
  netPnlUSD?: number;

  // ── Pre-converted display values ─────────────────────────────────────────
  /**
   * Account value already converted to the user's selected currency using
   * each broker's own conversion rule. Do NOT re-multiply by the global rate.
   */
  accountValueDisplay: number;
  /** uPnL in the user's selected currency. */
  upnlDisplay: number;
  /** Realised PnL in the user's selected currency. Defaults to 0. */
  realizedPnlDisplay?: number;
  /** Net PnL in the user's selected currency. Computed if omitted. */
  netPnlDisplay?: number;

  // ── Counts ───────────────────────────────────────────────────────────────
  openPositions: number;
  openOrders: number;

  // ── State flags ──────────────────────────────────────────────────────────
  /** Show skeleton loading placeholders. */
  loading?: boolean;
  /** Show empty / unconnected state. */
  empty?: boolean;

  // ── Navigation callbacks (replaces wouter useLocation) ───────────────────
  onShowPositions?: () => void;
  onShowPnl?: () => void;
  onShowBalances?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — matched exactly to web .dash-account-card in index.css
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  // card surface
  cardBg: "#060608", // rgba(6,6,8,0.97)
  cardBorder: "rgba(255,255,255,0.12)", // web: border rgba(255,255,255,0.12)
  cardRadius: 24, // web: border-radius 24px

  // sub-widget panel
  subBg: "rgba(255,255,255,0.04)", // web: rgba(255,255,255,0.04)
  divider: "rgba(255,255,255,0.08)", // web: DIVIDER const

  // text — mapped from CSS custom properties
  statTitle: "rgba(255,255,255,0.72)", // --stat-title
  statValue: "#FFFFFF", // --stat-value
  statSub: "#A7A7A7", // --stat-sub
  statIcon: "#6E7578", // --stat-icon

  // PnL colours — matched from web PROFIT/LOSS constants
  profit: "#22C55E", // PROFIT = "#22C55E"
  loss: "#EF4444", // LOSS   = "#EF4444"

  // privacy mask dots — web: bg-white/25 = rgba(255,255,255,0.25)
  maskDot: "rgba(255,255,255,0.25)",

  // positions chip — web: linear-gradient(135deg,#f97316 0%,#ea580c 100%)
  chipFrom: "#f97316" as const,
  chipTo: "#ea580c" as const,
  chipShadow: "rgba(249,115,22,0.35)", // web: boxShadow rgba(249,115,22,0.35)
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Privacy mask dots  (web: bg-white/25 dots, gap-[3px])
// ─────────────────────────────────────────────────────────────────────────────

const Dots = memo(function Dots({ count = 6 }: { count?: number }) {
  return (
    <View
      style={styles.dotsRow}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.dot} />
      ))}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Format helper — mirrors web fmt()
// ─────────────────────────────────────────────────────────────────────────────

function formatValue(v: number, currency: Currency, masked: boolean): string {
  if (masked) return "";
  return `${v >= 0 ? "+" : ""}${formatAmount(v, currency)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-metric cell
// ─────────────────────────────────────────────────────────────────────────────

interface SubCellProps {
  label: string;
  value: number;
  currency: Currency;
  masked: boolean;
  isPositive?: boolean;
  useSignColor?: boolean;
  loading?: boolean;
  onPress?: () => void;
  borderRight?: boolean;
  borderBottom?: boolean;
}

const SubCell = memo(function SubCell({
  label,
  value,
  currency,
  masked,
  isPositive = true,
  useSignColor = true,
  loading = false,
  onPress,
  borderRight = false,
  borderBottom = false,
}: SubCellProps) {
  const valueColor = useSignColor
    ? isPositive
      ? C.profit
      : C.loss
    : C.statValue;

  const cellStyle = [
    styles.subCell,
    borderRight && styles.subCellBorderRight,
    borderBottom && styles.subCellBorderBottom,
  ];

  const content = (
    <View style={cellStyle}>
      {/* Label row with optional chevron */}
      <View style={styles.subLabelRow}>
        <Text style={styles.subLabel} numberOfLines={1}>
          {label}
        </Text>
        {onPress && (
          <ChevronRight size={10} color={C.statIcon} />
        )}
      </View>

      {/* Value */}
      {loading ? (
        <Skeleton style={styles.subValueSkeleton} />
      ) : masked ? (
        <Dots count={5} />
      ) : (
        <Text
          style={[styles.subValue, { color: valueColor }]}
          numberOfLines={1}
        >
          {formatValue(value, currency, false)}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {content}
      </Pressable>
    );
  }
  return content;
});

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

function AccountValueWidget({
  accountValueDisplay,
  upnlDisplay,
  realizedPnlDisplay = 0,
  netPnlDisplay,
  openPositions,
  openOrders,
  loading = false,
  empty = false,
  onShowPositions,
  onShowPnl,
  onShowBalances,
}: AccountValueWidgetProps) {
  const [masked, setMasked] = useState(false);
  const currency = useCurrencyStore((s) => s.currency);

  const resolvedNetPnlDisplay =
    netPnlDisplay ?? upnlDisplay + realizedPnlDisplay;

  const upPos = upnlDisplay >= 0;
  const realPos = realizedPnlDisplay >= 0;
  const netPos = resolvedNetPnlDisplay >= 0;

  const toggleMask = useCallback(() => setMasked((m) => !m), []);

  // ── Empty / unconnected state ─────────────────────────────────────────────

  if (empty && !loading) {
    return (
      <View style={styles.card}>
        <View style={styles.emptyState}>
          <Wallet size={28} color={C.statSub} />
          <Text style={styles.emptyTitle}>No account connected</Text>
          <Text style={styles.emptySubtitle}>
            Connect Delta Exchange or cTrader to see your account value.
          </Text>
        </View>
      </View>
    );
  }

  // ── Main card ─────────────────────────────────────────────────────────────

  return (
    <View style={styles.card}>
      {/*
       * Gradient sheen — mirrors web .dash-account-card::before
       * layer 1: radial ellipse burst from crown (bright centre highlight)
       * layer 2: linear top-to-bottom fade (diffuse sheen)
       * Purely additive, pointer-events ignored.
       */}
      <LinearGradient
        colors={[
          "rgba(255,255,255,0.07)",
          "rgba(255,255,255,0.02)",
          "rgba(255,255,255,0.00)",
        ]}
        locations={[0, 0.5, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.cardSheen}
        pointerEvents="none"
      />

      {/* ── Header section ── */}
      {/* web: px-4 pt-4 pb-3 → paddingHorizontal:16, paddingTop:16, paddingBottom:12 */}
      <View style={styles.headerSection}>
        {/* Title row — web: flex items-start justify-between mb-3 */}
        <View style={styles.titleRow}>
          <View style={styles.titleLeft}>
            {/* "Account Value" label + link chevron — web: text-[13px] font-semibold --stat-title */}
            <Pressable
              onPress={onShowBalances}
              style={styles.titleLinkBtn}
              accessibilityRole="button"
              accessibilityLabel="Account Value — view balances"
            >
              <Text style={styles.titleLabel}>Account Value</Text>
              {onShowBalances && (
                <ChevronRight size={14} color={C.statIcon} />
              )}
            </Pressable>

            {/* Privacy toggle — web: w-4 h-4 --stat-icon */}
            <Pressable
              onPress={toggleMask}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={masked ? "Show values" : "Hide values"}
              accessibilityState={{ checked: masked }}
            >
              {masked ? <EyeOff size={16} color={C.statIcon} /> : <Eye size={16} color={C.statIcon} />}
            </Pressable>
          </View>

          {/*
           * Show Positions chip
           * web: linear-gradient(135deg,#f97316 0%,#ea580c 100%)
           *      boxShadow: "0 2px 10px rgba(249,115,22,0.35)"
           *      px-3 py-1.5 rounded-full text-[12px] font-semibold
           */}
          <View style={styles.chipShadowWrapper}>
            <LinearGradient
              colors={[C.chipFrom, C.chipTo]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.positionsChip}
            >
              <Pressable
                onPress={onShowPositions}
                style={({ pressed }) => [
                  styles.chipInner,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Show positions"
              >
                <Layers size={12} color="#fff" />
                <Text
                  style={styles.positionsChipText}
                  numberOfLines={1}
                  adjustsFontSizeToFit={false}
                >
                  Show Positions
                </Text>
              </Pressable>
            </LinearGradient>
          </View>
        </View>

        {/*
         * Main account value
         * web: text-[28px] font-black tracking-tight leading-none --stat-value
         */}
        <View style={styles.mainValueRow}>
          {loading ? (
            <Skeleton style={styles.mainValueSkeleton} />
          ) : masked ? (
            <Dots count={9} />
          ) : (
            <Text
              style={styles.mainValue}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatAmount(accountValueDisplay, currency)}
            </Text>
          )}
        </View>
      </View>

      {/*
       * Sub-metrics 2×2 grid
       * web: mx-3 mb-3 rounded-xl grid grid-cols-2
       *      background rgba(255,255,255,0.04)  border rgba(255,255,255,0.08)
       */}
      <View style={styles.subGrid}>
        {/* Row 1: UPNL | Realized PNL */}
        <View style={styles.subRow}>
          <SubCell
            label="UPNL"
            value={upnlDisplay}
            currency={currency}
            masked={masked}
            isPositive={upPos}
            loading={loading}
            onPress={onShowPositions}
            borderRight
            borderBottom
          />
          <SubCell
            label="Realized PNL"
            value={realizedPnlDisplay}
            currency={currency}
            masked={masked}
            isPositive={realPos}
            loading={loading}
            onPress={onShowPositions}
            borderBottom
          />
        </View>

        {/* Row 2: Net PNL | Positions / Orders */}
        <View style={styles.subRow}>
          <SubCell
            label="Net PNL"
            value={resolvedNetPnlDisplay}
            currency={currency}
            masked={masked}
            isPositive={netPos}
            loading={loading}
            onPress={onShowPnl}
            borderRight
          />

          {/* Positions / Orders — raw counts, not currency */}
          <View style={styles.subCell}>
            <Pressable
              onPress={onShowPositions}
              style={styles.subLabelRow}
              accessibilityRole="button"
              accessibilityLabel="Positions and Orders"
            >
              <Text style={styles.subLabel} numberOfLines={1}>
                Positions / Orders
              </Text>
              {onShowPositions && (
                <ChevronRight size={10} color={C.statIcon} />
              )}
            </Pressable>
            {loading ? (
              <Skeleton style={styles.subValueSkeleton} />
            ) : (
              <View style={styles.positionCountRow}>
                <Text style={[styles.subValue, { color: C.statValue }]}>
                  {openPositions}
                </Text>
                <Text style={[styles.subValue, { color: C.statSub }]}>/</Text>
                <Text style={[styles.subValue, { color: C.statValue }]}>
                  {openOrders}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Card surface ─────────────────────────────────────────────────────────
  // web: background rgba(6,6,8,0.97), border rgba(255,255,255,0.12),
  //      border-radius 24px, box-shadow 0 18px 48px rgba(0,0,0,0.55)
  //
  // ANDROID BUG: overflow:"hidden" + elevation on the same View causes
  // canvas.clipRect() to clip children with their own elevation (the chip).
  // On Android the shadow and the View itself get clipped at the card edge.
  // The cardSheen LinearGradient already carries its own borderRadius so it
  // self-clips without needing the parent to clip it. Safe to remove.
  card: {
    backgroundColor: C.cardBg,
    borderRadius: C.cardRadius,
    borderWidth: 1,
    borderColor: C.cardBorder,
    // overflow:"hidden" intentionally removed — see note above
    ...Platform.select({
      ios: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 18 },
        shadowOpacity: 0.55,
        shadowRadius: 24,
      },
      android: {
        elevation: 20,
      },
    }),
  },

  // ── Gradient sheen (::before equivalent) ─────────────────────────────────
  // web: radial ellipse from crown + linear top-to-bottom fade
  cardSheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    // covers the top ~45% of card where the sheen is visible
    height: "45%",
    borderRadius: C.cardRadius,
    zIndex: 1,
  },

  // ── Header section ────────────────────────────────────────────────────────
  // web: px-4 pt-4 pb-3 → padding 16/16/12
  headerSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    zIndex: 2,
  },

  // web: flex items-start justify-between mb-3
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  // web: flex items-center gap-2 (8px)
  // flex:1 + minWidth:0 ensures this side shrinks when chip needs space
  titleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },

  titleLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 1,
    minWidth: 0,
  },

  // web: text-[13px] font-semibold --stat-title = rgba(255,255,255,0.72)
  titleLabel: {
    color: C.statTitle,
    fontSize: 13,
    fontFamily: "SFProDisplay-Semibold",
    fontWeight: "600",
    flexShrink: 1, // allow text to truncate before pushing chip off-screen
  },

  // ── Show Positions chip ───────────────────────────────────────────────────
  // web: linear-gradient(135deg,#f97316,#ea580c), boxShadow rgba(249,115,22,0.35)
  //      px-3 py-1.5 rounded-full
  chipShadowWrapper: {
    borderRadius: 14,
    flexShrink: 0,       // never compress the chip
    minWidth: 130,       // floor: fits "Show Positions" + icon at fontSize:12
    marginRight: 16,     // 16px gap between chip right edge and card content boundary
    // Android elevation intentionally omitted: nesting an elevated child inside
    // an elevated parent (card elevation:20) causes Android to clip the child's
    // hardware-accelerated surface at the parent's borderRadius:24 corner.
    // Android elevation also can't render coloured shadows (always dark grey),
    // so the orange glow from C.chipShadow only applies on iOS anyway.
    ...Platform.select({
      ios: {
        shadowColor: C.chipShadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1,
        shadowRadius: 10,
      },
    }),
  },
  positionsChip: {
    borderRadius: 14,
    // overflow:"hidden" intentionally removed — see chipShadowWrapper note.
    // borderRadius alone shapes the pill; children are sized to fit within.
  },
  chipInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,              // 8px between Layers icon and "Show Positions" text
    paddingHorizontal: 16,
    paddingVertical: 8,  // symmetric vertical breathing room; height floats naturally
  },
  // web: text-[12px] font-semibold color #fff
  positionsChipText: {
    color: "#fff",
    fontSize: 12,
    // Explicit lineHeight prevents Android from using inflated platform font
    // metrics. 14 matches browser's "normal" ratio for 12px sans-serif (~1.17×).
    lineHeight: 14,
    // includeFontPadding: Android adds extra space above the ascender by default,
    // pushing the text visual centre below the layout centre and making the icon
    // appear to float above the text. Setting false aligns visual and layout centres.
    includeFontPadding: false,
    fontFamily: "SFProDisplay-Semibold",
    fontWeight: "600",
  },

  // ── Main account value ────────────────────────────────────────────────────
  // web: text-[28px] font-black tracking-tight leading-none --stat-value=#FFFFFF
  mainValueRow: {
    minHeight: 36,
    justifyContent: "center",
  },
  mainValue: {
    color: C.statValue,
    fontSize: 28,
    fontFamily: "Inter_900Black",
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  mainValueSkeleton: {
    maxWidth: 160,
    width: "100%",
    height: 32,
    borderRadius: 6,
  },

  // ── Sub-metrics 2×2 grid ─────────────────────────────────────────────────
  // web: mx-3 mb-3 rounded-xl (12px)
  //      background rgba(255,255,255,0.04), border rgba(255,255,255,0.08)
  subGrid: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: C.subBg,
    borderWidth: 1,
    borderColor: C.divider,
    overflow: "hidden",
    zIndex: 2,
  },
  subRow: {
    flexDirection: "row",
  },

  // web: px-3.5 py-3 = paddingHorizontal:14, paddingVertical:12
  subCell: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  subCellBorderRight: {
    borderRightWidth: 1,
    borderRightColor: C.divider,
  },
  subCellBorderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },

  // web: flex items-center gap-0.5 mb-1.5 → gap:2, marginBottom:6
  subLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginBottom: 6,
  },

  // web: text-[11px] font-semibold --stat-sub = #A7A7A7
  subLabel: {
    color: C.statSub,
    fontSize: 11,
    fontFamily: "SFProDisplay-Semibold",
    fontWeight: "600",
  },

  // web: text-[15px] font-black leading-none
  subValue: {
    fontSize: 15,
    fontFamily: "SFProDisplay-Bold",
    fontWeight: "900",
    lineHeight: 18,
  },
  subValueSkeleton: {
    width: 72,
    height: 16,
    borderRadius: 4,
  },

  // ── Positions count row ───────────────────────────────────────────────────
  positionCountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  // ── Privacy dots ─────────────────────────────────────────────────────────
  // web: gap-[3px], w-[6px] h-[6px] rounded-full bg-white/25
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.maskDot,
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    color: C.statValue,
    fontSize: 15,
    fontFamily: "SFProDisplay-Semibold",
    fontWeight: "600",
    marginTop: 4,
  },
  emptySubtitle: {
    color: C.statSub,
    fontSize: 13,
    fontFamily: "SFProDisplay-Regular",
    textAlign: "center",
    lineHeight: 18,
  },

  // ── Press feedback ────────────────────────────────────────────────────────
  pressed: {
    opacity: 0.75,
  },
});

export default memo(AccountValueWidget);
