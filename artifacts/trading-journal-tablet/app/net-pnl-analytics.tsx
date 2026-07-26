/**
 * app/net-pnl-analytics.tsx — Net PNL Analytics Screen
 *
 * Migration of: artifacts/trading-journal/src/pages/NetPnLAnalytics.tsx
 * Phase 10.8 — Analytics Screens (Final Pass)
 *
 * Web → RN replacements
 * ──────────────────────────────────────────────────────────────────────────
 *   div / span / button        → View / Text / Pressable
 *   CSS classes                → StyleSheet.create
 *   recharts LineChart         → LineChartWrapper (Phase 10.6, splitBySign=true)
 *   recharts BarChart          → BarChartWrapper (Phase 10.6)
 *   recharts PieChart          → PieChartWrapper (Phase 10.6)
 *   lucide-react icons         → @expo/vector-icons Ionicons
 *   useLocation (wouter)       → router.back() (expo-router)
 *   useIsMobile                → removed (always mobile in RN)
 *   MonthlyXTick / MonthlyCursor / MonthlyBarShape (recharts custom SVG)
 *                              → Victory Native handles bar rendering natively
 *   shimmer-loading skeleton   → Skeleton component
 *   requestAnimationFrame + setTimeout → same (Hermes supports both)
 *
 * Business logic preserved exactly (verbatim):
 *   TIME_FILTERS (today/7d/30d/3m/1y/all)
 *   getStartIso() / getBucketLabel() / getBucketSortKey()
 *   bucketTrades() / splitAtZero() / buildChartData()
 *   yAxisFmt() / fmtUsd() / fmtUsdShort()
 *   MOCK_SUMMARY / MOCK_DISTRIBUTION / MOCK_MONTHLY
 *   MOCK_TRADING_STATS / MOCK_CUMULATIVE
 *   loading + chartsReady state machine (identical timing logic)
 *   useEffect fetch from /api/stats/equity-curve
 *   chartData = buildChartData(trades, timeFilter)
 *   Chart ordering: line chart → distribution → monthly → trading stats → cumulative
 */

import { ArrowLeft, TrendingUp, TrendingDown, BarChart2, Flame } from "lucide-react-native";
import { router } from "expo-router";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  BarChartWrapper,
  LineChartWrapper,
  PieChartWrapper,
} from "@/components/analytics";
import { Skeleton } from "@/components/ui/skeleton";
// ── Design tokens ──────────────────────────────────────────────────────────
const BG       = "#000000";
const BG_CARD  = "rgba(12,14,19,0.97)";
const BORDER   = "rgba(255,255,255,0.08)";
const TEXT_PRI = "#EDF0F6";
const TEXT_MUT = "rgba(148,163,184,0.60)";
const TEXT_DIM = "rgba(148,163,184,0.40)";
const GREEN    = "#22c55e";
const RED      = "#ef4444";

// ── Types (verbatim from web NetPnLAnalytics.tsx) ──────────────────────────
type TimeFilter = "today" | "7d" | "30d" | "3m" | "1y" | "all";

interface TradeRow {
  pnl:       number;
  exit_date: string;
}

interface RawPoint {
  label:   string;
  cumPnl:  number;
  sortKey: number;
}

interface ChartPoint {
  label:    string;
  cumPnl:   number;
  sortKey:  number;
  greenPnl: number | null;
  redPnl:   number | null;
}

// ── Mock data (verbatim from web NetPnLAnalytics.tsx) ─────────────────────
const MOCK_SUMMARY = {
  netPnl:           2192.45,
  netPnlPct:        219.24,
  totalTrades:      128,
  winRate:          62.5,
  bestTrade:        512.32,
  bestTradeSymbol:  "BTCUSDT",
  worstTrade:       -215.43,
  worstTradeSymbol: "ETHUSDT",
};

const MOCK_DISTRIBUTION = { winning: 80, losing: 48 };

const MOCK_MONTHLY = [
  { month: "Jul '25", pnl: -120 },
  { month: "Aug '25", pnl:   50 },
  { month: "Sep '25", pnl: -380 },
  { month: "Oct '25", pnl:  210 },
  { month: "Nov '25", pnl:  480 },
  { month: "Dec '25", pnl:  320 },
  { month: "Jan '26", pnl:  640 },
  { month: "Feb '26", pnl:  520 },
  { month: "Mar '26", pnl:  710 },
  { month: "Apr '26", pnl:  380 },
  { month: "May '26", pnl:  850 },
  { month: "Jun '26", pnl:  960 },
  { month: "Jul '26", pnl: 1100 },
];

const MOCK_TRADING_STATS = {
  bestTrade:         512.32,
  worstTrade:       -215.43,
  avgWin:            128.45,
  avgLoss:           -68.32,
  longestWinStreak:    7,
  longestLossStreak:   4,
};

const MOCK_CUMULATIVE = {
  winningDays:        46,
  losingDays:         28,
  breakEvenDays:       6,
  totalTradingDays:   80,
  longestGreenStreak:  9,
  longestRedStreak:    6,
};

// ── Time filter config (verbatim) ──────────────────────────────────────────
const TIME_FILTERS: { id: TimeFilter; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d",   label: "7D"   },
  { id: "30d",  label: "30D"  },
  { id: "3m",   label: "3M"   },
  { id: "1y",   label: "1Y"   },
  { id: "all",  label: "All"  },
];

// ── Date helpers (verbatim from web) ───────────────────────────────────────

function getStartIso(filter: TimeFilter): string | null {
  const now = new Date();
  switch (filter) {
    case "today": {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d.toISOString();
    }
    case "7d": {
      const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString();
    }
    case "30d": {
      const d = new Date(now); d.setDate(d.getDate() - 30); return d.toISOString();
    }
    case "3m": {
      const d = new Date(now); d.setMonth(d.getMonth() - 3); return d.toISOString();
    }
    case "1y": {
      const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d.toISOString();
    }
    case "all":
      return null;
  }
}

function getBucketLabel(date: Date, filter: TimeFilter): string {
  switch (filter) {
    case "today":
      return date.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
    case "7d":
      return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    case "30d":
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "3m": {
      const tmp = new Date(date);
      tmp.setHours(0, 0, 0, 0);
      tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
      const jan4 = new Date(tmp.getFullYear(), 0, 4);
      const wk = 1 + Math.round(
        ((tmp.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getDay() + 6) % 7)) / 7,
      );
      return `W${wk} ${tmp.getFullYear()}`;
    }
    case "1y":
      return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    case "all":
      return String(date.getFullYear());
  }
}

function getBucketSortKey(date: Date, filter: TimeFilter): number {
  switch (filter) {
    case "today":
      return date.getHours() * 60 + date.getMinutes();
    case "7d":
    case "30d":
      return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    case "3m": {
      const tmp = new Date(date);
      tmp.setHours(0, 0, 0, 0);
      tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
      const jan4 = new Date(tmp.getFullYear(), 0, 4);
      const wk = 1 + Math.round(
        ((tmp.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getDay() + 6) % 7)) / 7,
      );
      return tmp.getFullYear() * 1000 + wk;
    }
    case "1y":
      return date.getFullYear() * 12 + date.getMonth();
    case "all":
      return date.getFullYear();
  }
}

// ── Data builders (verbatim from web) ─────────────────────────────────────

function bucketTrades(trades: TradeRow[], filter: TimeFilter): RawPoint[] {
  const buckets = new Map<string, { pnl: number; sortKey: number }>();
  for (const t of trades) {
    const date    = new Date(t.exit_date);
    const label   = getBucketLabel(date, filter);
    const sortKey = getBucketSortKey(date, filter);
    const existing = buckets.get(label);
    if (existing) {
      existing.pnl += t.pnl;
    } else {
      buckets.set(label, { pnl: t.pnl, sortKey });
    }
  }
  const sorted = Array.from(buckets.entries()).sort((a, b) => a[1].sortKey - b[1].sortKey);
  let cum = 0;
  return sorted.map(([label, { pnl, sortKey }]) => {
    cum += pnl;
    return { label, cumPnl: Math.round(cum * 100) / 100, sortKey };
  });
}

function splitAtZero(raw: RawPoint[]): ChartPoint[] {
  if (raw.length === 0) return [];
  const out: ChartPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    const curr = raw[i]!;
    const prev = i > 0 ? raw[i - 1] : null;
    if (prev !== null) {
      const pv = prev.cumPnl;
      const cv = curr.cumPnl;
      if ((pv > 0 && cv < 0) || (pv < 0 && cv > 0)) {
        const t = pv / (pv - cv);
        out.push({
          label:    "",
          cumPnl:   0,
          sortKey:  prev.sortKey + t * (curr.sortKey - prev.sortKey),
          greenPnl: 0,
          redPnl:   0,
        });
      }
    }
    if (curr.cumPnl === 0) {
      out.push({ ...curr, greenPnl: 0, redPnl: 0 });
    } else if (curr.cumPnl > 0) {
      out.push({ ...curr, greenPnl: curr.cumPnl, redPnl: null });
    } else {
      out.push({ ...curr, greenPnl: null, redPnl: curr.cumPnl });
    }
  }
  return out;
}

function buildChartData(trades: TradeRow[], filter: TimeFilter): ChartPoint[] {
  return splitAtZero(bucketTrades(trades, filter));
}

// ── Formatters (verbatim from web) ─────────────────────────────────────────

function yAxisFmt(v: number): string {
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v}`;
}

function fmtUsd(v: number): string {
  return (v >= 0 ? "+" : "−") + "$" +
    Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUsdShort(v: number): string {
  const abs = Math.abs(v);
  const str = abs >= 1_000
    ? (abs / 1_000).toFixed(1) + "k"
    : abs.toFixed(0);
  return (v >= 0 ? "+" : "−") + "$" + str;
}

// ── sortKey → ISO date string (for LineChartWrapper x-axis labels) ─────────
// Each filter's sortKey uses a different numeric encoding; this helper converts
// each back to a YYYY-MM-DD string so formatShortDate() produces a valid label.
function sortKeyToISO(sortKey: number, filter: TimeFilter): string {
  switch (filter) {
    case "today": {
      // sortKey = h*60+m — use today's actual date (all buckets on the same day)
      const n = new Date();
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    }
    case "7d":
    case "30d":
      // sortKey is a JS timestamp in ms → convert directly
      return new Date(sortKey).toISOString().slice(0, 10);
    case "3m": {
      // sortKey = year*1000 + isoWeek
      const year = Math.floor(sortKey / 1000);
      const week = Math.round(sortKey % 1000);
      // Approximate: Jan 1 + (week-1)*7 days
      const d = new Date(year, 0, 1 + (week - 1) * 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    case "1y": {
      // sortKey = year*12 + month (0-based)
      const year  = Math.floor(sortKey / 12);
      const month = Math.round(sortKey % 12);
      return `${year}-${String(month + 1).padStart(2, "0")}-01`;
    }
    case "all": {
      // sortKey = year
      return `${Math.floor(sortKey)}-01-01`;
    }
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────

/** 4-column stats summary card — mirrors web SummaryCard */
function SummaryCard({
  label, value, sub, valueColor,
}: {
  label:       string;
  value:       string;
  sub?:        string;
  valueColor?: string;
}) {
  return (
    <View style={sc.card}>
      <Text style={sc.label} numberOfLines={1}>{label}</Text>
      <Text style={[sc.value, valueColor ? { color: valueColor } : null]} numberOfLines={1}>
        {value}
      </Text>
      {sub ? <Text style={sc.sub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

/** Trading statistics row card — mirrors web TradingStatCard */
type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

function TradingStatCard({
  label, value, Icon, positive,
}: {
  label:     string;
  value:     string;
  Icon:      LucideIcon;
  positive?: boolean;
}) {
  const valueColor =
    positive === true  ? GREEN :
    positive === false ? RED   :
    TEXT_PRI;
  const iconBg =
    positive === true  ? "rgba(34,197,94,0.12)"  :
    positive === false ? "rgba(239,68,68,0.12)"  :
    "rgba(255,255,255,0.06)";
  const iconColor =
    positive === true  ? GREEN :
    positive === false ? RED   :
    TEXT_MUT;
  return (
    <View style={tsc.card}>
      <View style={tsc.left}>
        <Text style={tsc.label}>{label}</Text>
        <Text style={[tsc.value, { color: valueColor }]}>{value}</Text>
      </View>
      <View style={[tsc.iconWrap, { backgroundColor: iconBg }]}>
        <Icon size={16} color={iconColor} />
      </View>
    </View>
  );
}

/** Cumulative statistics card — mirrors web CumulativeStatCard */
function CumulativeStatCard({
  label, value, sub, Icon, valueColor, iconColor, iconBg,
}: {
  label:      string;
  value:      string;
  sub:        string;
  Icon:       LucideIcon;
  valueColor: string;
  iconColor:  string;
  iconBg:     string;
}) {
  return (
    <View style={csc.card}>
      <View style={[csc.iconWrap, { backgroundColor: iconBg }]}>
        <Icon size={16} color={iconColor} />
      </View>
      <Text style={[csc.value, { color: valueColor }]}>{value}</Text>
      <Text style={csc.sub}>{sub}</Text>
      <Text style={csc.label}>{label}</Text>
    </View>
  );
}

/** Section wrapper — mirrors web Section component */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={sect.wrap}>
      <View style={sect.header}>
        <Text style={sect.title}>{title}</Text>
      </View>
      <View style={sect.body}>{children}</View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────
export default function NetPnLAnalytics() {
  const insets = useSafeAreaInsets();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [trades,     setTrades]     = useState<TradeRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  // Defer heavy chart mount until the entry animation (≈260ms) has finished.
  // Matches the web version's exact timing logic.
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;
    const rafId = requestAnimationFrame(() => {
      timerId = setTimeout(() => setChartsReady(true), 260);
    });
    return () => { cancelAnimationFrame(rafId); clearTimeout(timerId); };
  }, []);

  // ── Load trades (verbatim from web useEffect) ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch("/api/stats/equity-curve");
        if (cancelled) return;
        if (!res.ok) {
          setError(`Failed to load trades (${res.status})`);
          setTrades([]);
          return;
        }
        const points = (await res.json()) as Array<{ date: string; pnl: number }>;
        const startIso = getStartIso(timeFilter);
        const startMs  = startIso ? new Date(startIso).getTime() : null;
        const valid = points
          .filter(r => {
            if (typeof r.pnl !== "number" || isNaN(r.pnl)) return false;
            if (!r.date) return false;
            const t = new Date(r.date).getTime();
            if (isNaN(t)) return false;
            return startMs === null || t >= startMs;
          })
          .map(r => ({ pnl: r.pnl, exit_date: r.date }));
        setTrades(valid);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unknown error");
        setTrades([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [timeFilter]);

  const chartData = useMemo(() => buildChartData(trades, timeFilter), [trades, timeFilter]);
  const isEmpty   = !loading && !error && chartData.length === 0;

  // ── Line chart data → AreaPoint[] for LineChartWrapper (splitBySign=true) ─
  // sortKey values are converted to ISO date strings so formatShortDate()
  // produces meaningful x-axis labels across all time filters.
  const lineChartData = useMemo(
    () => chartData.map(pt => ({
      date:  sortKeyToISO(pt.sortKey, timeFilter),
      value: pt.cumPnl,
    })),
    [chartData, timeFilter],
  );

  // ── Monthly bar chart data ─────────────────────────────────────────────────
  const monthlyBarData = useMemo(
    () => MOCK_MONTHLY.map(m => ({
      label: m.month,
      value: m.pnl,
      color: m.pnl >= 0 ? GREEN : RED,
    })),
    [],
  );

  // ── Distribution donut data ───────────────────────────────────────────────
  const total   = MOCK_DISTRIBUTION.winning + MOCK_DISTRIBUTION.losing;
  const winPct  = ((MOCK_DISTRIBUTION.winning / total) * 100).toFixed(1);
  const losePct = ((MOCK_DISTRIBUTION.losing  / total) * 100).toFixed(1);

  const donutData = useMemo(() => [
    { name: "Winning", value: MOCK_DISTRIBUTION.winning, color: GREEN },
    { name: "Losing",  value: MOCK_DISTRIBUTION.losing,  color: RED   },
  ], []);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

      {/* ── Secondary header ─────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <Pressable
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color="#E8E8E8" />
        </Pressable>
        <Text style={s.headerTitle}>Net PNL Analytics</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Skeleton shown while loading OR charts not yet mounted ────────── */}
        {(loading || !chartsReady) && (
          <>
            <View style={s.grid2}>
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} style={s.skeletonKpiCard} />
              ))}
            </View>
            <Skeleton style={s.skeletonFilter} />
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} style={s.skeletonChart} />
            ))}
          </>
        )}

        {/* ── Content (shown only when not loading and charts ready) ─────────── */}
        {!loading && chartsReady && (
          <>

            {/* ── Time filter chips ──────────────────────────────────────────── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.filterScroll}
              contentContainerStyle={s.filterRow}
            >
              {TIME_FILTERS.map(f => {
                const active = timeFilter === f.id;
                return (
                  <Pressable
                    key={f.id}
                    onPress={() => setTimeFilter(f.id)}
                    style={[s.filterPill, active && s.filterPillActive]}
                    accessibilityRole="button"
                    accessibilityLabel={f.label}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[s.filterPillText, active && s.filterPillTextActive]}>
                      {f.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* ── Net PNL Report card (line chart + summary row) ─────────────── */}
            <View style={s.reportCard}>
              {/* Line chart */}
              <View style={s.lineChartWrap}>
                {error ? (
                  <View style={s.stateWrap}>
                    <Text style={s.errorText}>{error}</Text>
                  </View>
                ) : isEmpty ? (
                  <View style={s.stateWrap}>
                    <Text style={s.emptyTitle}>No trades found for this period</Text>
                    <Text style={s.emptySubtitle}>
                      Log trades or connect a broker to see your Net PNL
                    </Text>
                  </View>
                ) : (
                  <LineChartWrapper
                    data={lineChartData}
                    formatter={fmtUsd}
                    axisFormatter={yAxisFmt}
                    height={300}
                    splitBySign
                    profitColor={GREEN}
                    lossColor={RED}
                  />
                )}
              </View>

              {/* Stats summary row */}
              <View style={s.summaryGrid}>
                <SummaryCard
                  label="Net PNL"
                  value={fmtUsd(MOCK_SUMMARY.netPnl)}
                  sub={`+${MOCK_SUMMARY.netPnlPct.toFixed(2)}% ROI`}
                  valueColor={GREEN}
                />
                <SummaryCard
                  label="Total Trades"
                  value={String(MOCK_SUMMARY.totalTrades)}
                  sub={`${(MOCK_SUMMARY.totalTrades / MOCK_MONTHLY.length).toFixed(1)}/mo avg`}
                />
                <SummaryCard
                  label="Best Trade"
                  value={fmtUsd(MOCK_SUMMARY.bestTrade)}
                  sub={MOCK_SUMMARY.bestTradeSymbol || undefined}
                  valueColor={GREEN}
                />
                <SummaryCard
                  label="Worst Trade"
                  value={fmtUsd(MOCK_SUMMARY.worstTrade)}
                  sub={MOCK_SUMMARY.worstTradeSymbol || undefined}
                  valueColor={RED}
                />
              </View>
            </View>

            {/* ── PNL Distribution + Monthly PNL ────────────────────────────── */}

            {/* PNL Distribution — donut */}
            <Section title="PNL Distribution">
              <View style={s.distRow}>
                {/* Donut chart */}
                <View style={s.donutWrap}>
                  <PieChartWrapper
                    data={donutData}
                    height={180}
                    showLegend={false}
                    centreValue={String(total)}
                    centreLabel="Trades"
                    centreColor={TEXT_PRI}
                  />
                </View>

                {/* Legend with bars */}
                <View style={s.distLegend}>
                  {/* Winning */}
                  <View style={s.distLegendRow}>
                    <View style={[s.distDot, { backgroundColor: GREEN }]} />
                    <View style={s.distLegendText}>
                      <Text style={s.distLegendLabel}>Winning Trades</Text>
                      <Text style={[s.distLegendValue, { color: GREEN }]}>
                        {MOCK_DISTRIBUTION.winning}
                        <Text style={[s.distLegendPct, { color: "rgba(34,197,94,0.70)" }]}>
                          {" "}({winPct}%)
                        </Text>
                      </Text>
                    </View>
                  </View>
                  <View style={s.distBarTrack}>
                    <View style={[s.distBarFill, { width: `${winPct}%` as any, backgroundColor: GREEN }]} />
                  </View>

                  {/* Losing */}
                  <View style={s.distLegendRow}>
                    <View style={[s.distDot, { backgroundColor: RED }]} />
                    <View style={s.distLegendText}>
                      <Text style={s.distLegendLabel}>Losing Trades</Text>
                      <Text style={[s.distLegendValue, { color: RED }]}>
                        {MOCK_DISTRIBUTION.losing}
                        <Text style={[s.distLegendPct, { color: "rgba(239,68,68,0.70)" }]}>
                          {" "}({losePct}%)
                        </Text>
                      </Text>
                    </View>
                  </View>
                  <View style={s.distBarTrack}>
                    <View style={[s.distBarFill, { width: `${losePct}%` as any, backgroundColor: RED }]} />
                  </View>
                </View>
              </View>
            </Section>

            {/* Monthly PNL — vertical bar chart */}
            <Section title="Monthly PNL (USD)">
              <BarChartWrapper
                data={monthlyBarData}
                formatter={fmtUsd}
                axisFormatter={fmtUsdShort}
                referenceY={0}
                height={300}
                xLabelMaxLen={8}
              />
            </Section>

            {/* ── Trading Statistics ─────────────────────────────────────────── */}
            <Section title="Trading Statistics">
              <View style={s.tradingStatsGrid}>
                <TradingStatCard
                  label="Best Trade"
                  value={fmtUsd(MOCK_TRADING_STATS.bestTrade)}
                  iconName="trending-up"
                  positive={true}
                />
                <TradingStatCard
                  label="Worst Trade"
                  value={fmtUsd(MOCK_TRADING_STATS.worstTrade)}
                  iconName="trending-down"
                  positive={false}
                />
                <TradingStatCard
                  label="Average Win"
                  value={fmtUsd(MOCK_TRADING_STATS.avgWin)}
                  iconName="bar-chart-outline"
                  positive={true}
                />
                <TradingStatCard
                  label="Average Loss"
                  value={fmtUsd(MOCK_TRADING_STATS.avgLoss)}
                  iconName="bar-chart-outline"
                  positive={false}
                />
                <TradingStatCard
                  label="Largest Winning Streak"
                  value={String(MOCK_TRADING_STATS.longestWinStreak)}
                  iconName="flame-outline"
                  positive={true}
                />
                <TradingStatCard
                  label="Largest Losing Streak"
                  value={String(MOCK_TRADING_STATS.longestLossStreak)}
                  iconName="flame-outline"
                  positive={false}
                />
              </View>
            </Section>

            {/* ── Cumulative Statistics ──────────────────────────────────────── */}
            <Section title="Cumulative Statistics">
              <View style={s.cumulativeGrid}>
                <CumulativeStatCard
                  label="Winning Days"
                  value={String(MOCK_CUMULATIVE.winningDays)}
                  sub={`${((MOCK_CUMULATIVE.winningDays / MOCK_CUMULATIVE.totalTradingDays) * 100).toFixed(1)}% of trading days`}
                  iconName="calendar-outline"
                  valueColor={GREEN}
                  iconColor={GREEN}
                  iconBg="rgba(34,197,94,0.12)"
                />
                <CumulativeStatCard
                  label="Losing Days"
                  value={String(MOCK_CUMULATIVE.losingDays)}
                  sub={`${((MOCK_CUMULATIVE.losingDays / MOCK_CUMULATIVE.totalTradingDays) * 100).toFixed(1)}% of trading days`}
                  iconName="calendar-outline"
                  valueColor={RED}
                  iconColor={RED}
                  iconBg="rgba(239,68,68,0.12)"
                />
                <CumulativeStatCard
                  label="Break-even Days"
                  value={String(MOCK_CUMULATIVE.breakEvenDays)}
                  sub={`${((MOCK_CUMULATIVE.breakEvenDays / MOCK_CUMULATIVE.totalTradingDays) * 100).toFixed(1)}% of trading days`}
                  iconName="remove-circle-outline"
                  valueColor="#eab308"
                  iconColor="#eab308"
                  iconBg="rgba(234,179,8,0.12)"
                />
                <CumulativeStatCard
                  label="Longest Green Streak"
                  value={String(MOCK_CUMULATIVE.longestGreenStreak)}
                  sub="Days"
                  iconName="trending-up"
                  valueColor={GREEN}
                  iconColor={GREEN}
                  iconBg="rgba(34,197,94,0.12)"
                />
                <CumulativeStatCard
                  label="Longest Red Streak"
                  value={String(MOCK_CUMULATIVE.longestRedStreak)}
                  sub="Days"
                  iconName="trending-down"
                  valueColor={RED}
                  iconColor={RED}
                  iconBg="rgba(239,68,68,0.12)"
                />
              </View>
            </Section>

          </>
        )}

      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StyleSheets
// ─────────────────────────────────────────────────────────────────────────────

// ── SummaryCard ───────────────────────────────────────────────────────────────
const sc = StyleSheet.create({
  card: {
    flex:            1,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius:    12,
    padding:         12,
    gap:             2,
  },
  label: {
    fontSize:      10,
    fontWeight:    "600",
    color:         TEXT_MUT,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  value: {
    fontSize:    15,
    fontWeight:  "700",
    color:       TEXT_PRI,
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 10,
    color:    TEXT_MUT,
    fontWeight: "500",
  },
});

// ── TradingStatCard ───────────────────────────────────────────────────────────
const tsc = StyleSheet.create({
  card: {
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "space-between",
    backgroundColor: BG_CARD,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     BORDER,
    padding:         14,
  },
  left: {
    flex: 1,
    gap:  3,
  },
  label: {
    fontSize:      10,
    fontWeight:    "600",
    color:         TEXT_MUT,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  value: {
    fontSize:    18,
    fontWeight:  "700",
    color:       TEXT_PRI,
    letterSpacing: -0.3,
  },
  iconWrap: {
    width:          36,
    height:         36,
    borderRadius:   10,
    alignItems:     "center",
    justifyContent: "center",
    marginLeft:     12,
    flexShrink:     0,
  },
});

// ── CumulativeStatCard ────────────────────────────────────────────────────────
const csc = StyleSheet.create({
  card: {
    flex:            1,
    minWidth:        "45%",
    backgroundColor: BG_CARD,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     BORDER,
    padding:         14,
    gap:             4,
  },
  iconWrap: {
    width:          32,
    height:         32,
    borderRadius:   8,
    alignItems:     "center",
    justifyContent: "center",
    marginBottom:   4,
  },
  value: {
    fontSize:    22,
    fontWeight:  "700",
    letterSpacing: -0.5,
    lineHeight:  26,
  },
  sub: {
    fontSize:  10,
    color:     TEXT_MUT,
    lineHeight: 14,
  },
  label: {
    fontSize:      10,
    fontWeight:    "600",
    color:         TEXT_DIM,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    marginTop:     2,
  },
});

// ── Section ───────────────────────────────────────────────────────────────────
const sect = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    overflow:     "hidden",
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth:  1,
    borderColor:  "rgba(255,255,255,0.07)",
  },
  header: {
    paddingHorizontal: 18,
    paddingTop:        14,
    paddingBottom:     12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  title: {
    fontSize:   13,
    fontWeight: "700",
    color:      TEXT_PRI,
    letterSpacing: -0.2,
  },
  body: {
    padding: 16,
  },
});

// ── Main layout ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "space-between",
    paddingHorizontal: 16,
    paddingBottom:     12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#262626",
    backgroundColor:   BG,
  },
  backBtn: {
    width:          32,
    height:         32,
    alignItems:     "center",
    justifyContent: "center",
    borderRadius:   16,
  },
  headerTitle: {
    fontSize:   17,
    fontWeight: "600",
    color:      "#F3F3F3",
  },

  // ── Content ────────────────────────────────────────────────────────────────
  content: {
    paddingHorizontal: 16,
    paddingTop:        16,
    gap:               14,
  },

  // ── Time filter ─────────────────────────────────────────────────────────────
  filterScroll: {
    flexGrow: 0,
  },
  filterRow: {
    flexDirection: "row",
    gap:           8,
    paddingVertical: 2,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical:   6,
    borderRadius:      10,
    backgroundColor:   "rgba(255,255,255,0.04)",
    borderWidth:       1,
    borderColor:       "rgba(255,255,255,0.07)",
  },
  filterPillActive: {
    backgroundColor: "rgba(96,165,250,0.12)",
    borderColor:     "rgba(96,165,250,0.30)",
  },
  filterPillText: {
    fontSize:   12,
    fontWeight: "700",
    color:      "#6b7280",
  },
  filterPillTextActive: {
    color: "#60a5fa",
  },

  // ── Net PNL Report card ────────────────────────────────────────────────────
  reportCard: {
    backgroundColor: "rgba(255,255,255,0.02)",
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.07)",
    overflow:        "hidden",
  },
  lineChartWrap: {
    height:  300,
    width:   "100%",
    padding: 4,
    paddingTop: 12,
  },
  summaryGrid: {
    flexDirection:   "row",
    gap:             8,
    padding:         12,
    borderTopWidth:  StyleSheet.hairlineWidth,
    borderTopColor:  "rgba(255,255,255,0.06)",
  },

  // ── State views (loading / empty / error) ─────────────────────────────────
  stateWrap: {
    flex:           1,
    alignItems:     "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap:            6,
  },
  errorText: {
    fontSize:  12,
    color:     "rgba(248,113,113,0.70)",
    textAlign: "center",
  },
  emptyTitle: {
    fontSize:  13,
    color:     TEXT_MUT,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize:  11,
    color:     TEXT_DIM,
    textAlign: "center",
  },

  // ── PNL Distribution ───────────────────────────────────────────────────────
  distRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           16,
  },
  donutWrap: {
    width:      176,
    flexShrink: 0,
  },
  distLegend: {
    flex: 1,
    gap:  10,
  },
  distLegendRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  distDot: {
    width:        10,
    height:       10,
    borderRadius: 5,
    flexShrink:   0,
  },
  distLegendText: {
    flex: 1,
    gap:  2,
  },
  distLegendLabel: {
    fontSize: 11,
    color:    TEXT_MUT,
  },
  distLegendValue: {
    fontSize:   17,
    fontWeight: "700",
  },
  distLegendPct: {
    fontSize:   11,
    fontWeight: "600",
  },
  distBarTrack: {
    width:           "100%",
    height:          6,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius:    999,
    overflow:        "hidden",
  },
  distBarFill: {
    height:       "100%",
    borderRadius: 999,
    opacity:      0.85,
  },

  // ── Trading statistics grid ────────────────────────────────────────────────
  tradingStatsGrid: {
    gap: 10,
  },

  // ── Cumulative statistics grid ─────────────────────────────────────────────
  cumulativeGrid: {
    flexDirection: "row",
    flexWrap:      "wrap",
    gap:           10,
  },

  // ── 2-column flex ─────────────────────────────────────────────────────────
  grid2: {
    flexDirection: "row",
    flexWrap:      "wrap",
    gap:           10,
  },

  // ── Skeleton ──────────────────────────────────────────────────────────────
  skeletonKpiCard: {
    width:        "48%",
    height:       80,
    borderRadius: 14,
  },
  skeletonFilter: {
    height:       36,
    width:        280,
    borderRadius: 10,
  },
  skeletonChart: {
    height:       200,
    borderRadius: 16,
  },
});
