/**
 * app/pnl-analytics.tsx — PNL Analytics Screen
 *
 * Migration of: artifacts/trading-journal/src/pages/pnl-analytics.tsx
 * Phase 10.8 — Analytics Screens (Final Pass)
 *
 * Web → RN replacements
 * ──────────────────────────────────────────────────────────────────────────
 *   div / span / button    → View / Text / Pressable
 *   CSS classes / grid     → StyleSheet.create
 *   recharts charts        → AreaChartWrapper / BarChartWrapper (Phase 10.6)
 *   lucide-react icons     → @expo/vector-icons Ionicons
 *   useLocation (wouter)   → router.back() (expo-router)
 *   shimmer-loading        → Skeleton component
 *   overflow-x-auto scroll → ScrollView horizontal
 *   CSS hover tooltips     → removed (touch interface, no hover state)
 *
 * Business logic preserved exactly (verbatim variable names and math):
 *   pageState ("loading" | "live" | "demo")
 *   allDaily / filteredDaily / weeklyData / monthlyData
 *   todayPnl / weekPnl / monthPnl / yearPnl / allTimePnl
 *   bestDay / worstDay / avgDailyPnl / avgWeeklyPnl / avgMonthlyPnl
 *   grossProfit / grossLoss
 *   All chart ordering, filter behavior, summary card ordering preserved.
 */

import { Ionicons } from "@expo/vector-icons";
import {
  useGetCalendarHeatmap,
  useGetEquityCurve,
  useGetStatsSummary,
} from "@workspace/api-client-react";
import { router } from "expo-router";
import { memo, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AreaChartWrapper,
  BarChartWrapper,
} from "@/components/analytics";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DEMO_EQUITY_CURVE,
  DEMO_STATS,
  getDemoCalendarHeatmap,
} from "@/data/demoAnalyticsData";
import {
  useCurrencyAxisFormatter,
  useCurrencyFormatter,
  useCurrencyStore,
} from "@/store/currencyStore";

// ── Design tokens ──────────────────────────────────────────────────────────
const BG       = "#000000";
const BG_CARD  = "rgba(12,14,19,0.97)";
const BORDER   = "rgba(255,255,255,0.08)";
const TEXT_PRI = "#EDF0F6";
const TEXT_MUT = "rgba(148,163,184,0.60)";
const TEXT_DIM = "rgba(148,163,184,0.40)";
const GREEN    = "#3ecc79";
const RED      = "#dd4b4b";
const BLUE     = "#60a5fa";

// ── Time filter ────────────────────────────────────────────────────────────
type TimeFilter = "today" | "7d" | "30d" | "3m" | "6m" | "1y" | "all";

const TIME_FILTERS: { id: TimeFilter; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d",   label: "7D"   },
  { id: "30d",  label: "30D"  },
  { id: "3m",   label: "3M"   },
  { id: "6m",   label: "6M"   },
  { id: "1y",   label: "1Y"   },
  { id: "all",  label: "All"  },
];

// ── Date helpers (verbatim from web pnl-analytics.tsx) ─────────────────────

/** Returns YYYY-MM-DD in the local calendar, free from UTC-offset drift. */
function localDateStr(d: Date): string {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function getCutoffDate(filter: TimeFilter): { cutoff: string | null; todayOnly: boolean } {
  const now = new Date();
  if (filter === "all")   return { cutoff: null, todayOnly: false };
  if (filter === "today") return { cutoff: localDateStr(now), todayOnly: true };
  const d = new Date(now);
  if (filter === "7d")   d.setDate(d.getDate() - 6);
  if (filter === "30d")  d.setDate(d.getDate() - 29);
  if (filter === "3m")   d.setMonth(d.getMonth() - 3);
  if (filter === "6m")   d.setMonth(d.getMonth() - 6);
  if (filter === "1y")   d.setFullYear(d.getFullYear() - 1);
  return { cutoff: localDateStr(d), todayOnly: false };
}

function fShortDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}

function fLongDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ── KPI card ───────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, positive, iconName,
}: {
  label:     string;
  value:     string;
  sub?:      string;
  positive?: boolean;
  iconName:  React.ComponentProps<typeof Ionicons>["name"];
}) {
  const valueColor =
    positive === true  ? GREEN :
    positive === false ? RED   :
    TEXT_PRI;
  return (
    <View style={kpi.card}>
      <View style={kpi.headerRow}>
        <Text style={kpi.label} numberOfLines={1}>{label}</Text>
        <View style={kpi.iconWrap}>
          <Ionicons name={iconName} size={12} color={TEXT_MUT} />
        </View>
      </View>
      <Text style={[kpi.value, { color: valueColor }]} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={kpi.sub} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

// ── Chart section header ───────────────────────────────────────────────────
function ChartHeader({
  iconName, title, right,
}: {
  iconName: React.ComponentProps<typeof Ionicons>["name"];
  title:    string;
  right?:   React.ReactNode;
}) {
  return (
    <View style={ch.row}>
      <View style={ch.left}>
        <View style={ch.iconWrap}>
          <Ionicons name={iconName} size={13} color={BLUE} />
        </View>
        <Text style={ch.title}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

// ── Stat item ──────────────────────────────────────────────────────────────
function StatItem({
  label, value, sub, color,
}: {
  label:  string;
  value:  string;
  sub?:   string;
  color?: string;
}) {
  return (
    <View style={si.cell}>
      <Text style={si.label}>{label}</Text>
      <Text style={[si.value, color ? { color } : null]}>{value}</Text>
      {sub ? <Text style={si.sub}>{sub}</Text> : null}
    </View>
  );
}

// ── Calendar heatmap ───────────────────────────────────────────────────────
const CalendarHeatmap = memo(function CalendarHeatmap({
  data, year, month,
}: {
  data:  Array<{ date: string; pnl: number; trades: number }>;
  year:  number;
  month: number;
}) {
  const axisFormatter = useCurrencyAxisFormatter();

  const dayMap = useMemo(() => {
    const m: Record<string, { pnl: number; trades: number }> = {};
    data.forEach(d => { m[d.date] = { pnl: d.pnl, trades: d.trades }; });
    return m;
  }, [data]);

  const maxAbs      = useMemo(
    () => Math.max(...data.map(d => Math.abs(d.pnl)), 1),
    [data],
  );
  const firstDay    = useMemo(() => new Date(year, month - 1, 1).getDay(), [year, month]);
  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const monthName   = useMemo(
    () => new Date(year, month - 1).toLocaleDateString("en-US", {
      month: "long", year: "numeric",
    }),
    [year, month],
  );

  // Build cell arrays
  const headerCells = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
    <View key={d} style={cal.cell}>
      <Text style={cal.weekday}>{d}</Text>
    </View>
  ));

  const emptyCells = Array.from({ length: firstDay }, (_, i) => (
    <View key={`e-${i}`} style={cal.cell} />
  ));

  const dayCells = Array.from({ length: daysInMonth }, (_, idx) => {
    const d  = idx + 1;
    const dt = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const entry = dayMap[dt];
    let cellBg     = "rgba(255,255,255,0.03)";
    let cellBorder = "transparent";

    if (entry && entry.trades > 0) {
      const intensity = Math.min(Math.abs(entry.pnl) / maxAbs, 1);
      if (entry.pnl > 0) {
        cellBg     = `rgba(52,211,153,${(0.12 + intensity * 0.55).toFixed(2)})`;
        cellBorder = `rgba(52,211,153,${(0.2  + intensity * 0.3 ).toFixed(2)})`;
      } else if (entry.pnl < 0) {
        cellBg     = `rgba(248,113,113,${(0.12 + intensity * 0.55).toFixed(2)})`;
        cellBorder = `rgba(248,113,113,${(0.2  + intensity * 0.3 ).toFixed(2)})`;
      } else {
        cellBg     = "rgba(255,255,255,0.05)";
        cellBorder = "rgba(255,255,255,0.10)";
      }
    }

    return (
      <View
        key={dt}
        style={[cal.cell, { backgroundColor: cellBg, borderColor: cellBorder, borderWidth: 1 }]}
      >
        <Text style={cal.dayNum}>{d}</Text>
        {entry && entry.trades > 0 && (
          <Text style={[cal.pnlText, { color: entry.pnl > 0 ? GREEN : RED }]}>
            {entry.pnl > 0 ? "+" : ""}{axisFormatter(Math.abs(entry.pnl))}
          </Text>
        )}
      </View>
    );
  });

  return (
    <View>
      <Text style={cal.monthName}>{monthName}</Text>
      <View style={cal.grid}>
        {headerCells}
        {emptyCells}
        {dayCells}
      </View>
    </View>
  );
});

// ── Main screen ────────────────────────────────────────────────────────────
export default function PnlAnalytics() {
  const insets = useSafeAreaInsets();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  const fc            = useCurrencyFormatter();
  const axisFormatter = useCurrencyAxisFormatter();
  const currency      = useCurrencyStore(s => s.currency);
  const setCurrency   = useCurrencyStore(s => s.setCurrency);

  const { data: liveStats,  isFetched: statsFetched  } = useGetStatsSummary();
  const { data: liveEquity, isFetched: equityFetched } = useGetEquityCurve();

  const now = useMemo(() => new Date(), []);
  const { data: liveCalData, isFetched: calFetched } = useGetCalendarHeatmap({
    year: now.getFullYear(), month: now.getMonth() + 1,
  });

  // ── Single state machine: "loading" | "live" | "demo" ─────────────────────
  // All three queries must settle before deciding — prevents flashing demo
  // content while live data is still in-flight.
  const queriesSettled = statsFetched && equityFetched && calFetched;
  const hasLiveData    = (liveEquity?.length ?? 0) > 0 || (liveStats?.totalTrades ?? 0) > 0;
  type PageState = "loading" | "live" | "demo";
  const pageState: PageState = !queriesSettled ? "loading" : hasLiveData ? "live" : "demo";
  const IS_DEMO = pageState === "demo";

  const stats   = pageState === "live" ? liveStats   : pageState === "demo" ? DEMO_STATS   : undefined;
  const equity  = pageState === "live" ? liveEquity  : pageState === "demo" ? DEMO_EQUITY_CURVE : undefined;
  const calData = pageState === "live" ? liveCalData : pageState === "demo" ? getDemoCalendarHeatmap(now.getFullYear(), now.getMonth() + 1) : undefined;

  // ── All daily PNL points from equity curve, sorted ascending ─────────────
  type RawEquityPoint = { date: string; pnl: number; equity: number };
  const allDaily = useMemo(() => {
    const pts = ((equity ?? []) as RawEquityPoint[]).map(p => ({ date: p.date, pnl: p.pnl }));
    pts.sort((a, b) => a.date.localeCompare(b.date));
    return pts;
  }, [equity]);

  // ── Apply time filter ──────────────────────────────────────────────────────
  const filteredDaily = useMemo(() => {
    const { cutoff, todayOnly } = getCutoffDate(timeFilter);
    if (!cutoff) return allDaily;
    if (todayOnly) return allDaily.filter(p => p.date === cutoff);
    return allDaily.filter(p => p.date >= cutoff);
  }, [allDaily, timeFilter]);

  // ── Weekly grouping from filtered daily ───────────────────────────────────
  const weeklyData = useMemo(() => {
    const map = new Map<string, number>();
    filteredDaily.forEach(({ date, pnl }) => {
      const d   = new Date(date + "T00:00:00");
      const day = d.getDay();
      const mon = new Date(d);
      mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      const key = localDateStr(mon);
      map.set(key, (map.get(key) ?? 0) + pnl);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, pnl]) => ({ pnl, label: fShortDate(week) }));
  }, [filteredDaily]);

  // ── Monthly grouping from filtered daily ──────────────────────────────────
  const monthlyData = useMemo(() => {
    const map = new Map<string, number>();
    filteredDaily.forEach(({ date, pnl }) => {
      const key = date.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + pnl);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, pnl]) => ({
        pnl,
        label: new Date(month + "-01T00:00:00").toLocaleDateString("en-US", {
          month: "short", year: "2-digit",
        }),
      }));
  }, [filteredDaily]);

  // ── Summary KPI values (always full dataset, local-calendar dates) ─────────
  const todayStr    = useMemo(() => localDateStr(now), [now]);
  const weekCutoff  = useMemo(() => {
    const d   = new Date(now);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return localDateStr(d);
  }, [now]);
  const monthCutoff = useMemo(() => todayStr.slice(0, 7), [todayStr]);
  const yearStr     = useMemo(() => String(now.getFullYear()), [now]);

  const todayPnl = useMemo(
    () => allDaily.filter(p => p.date === todayStr).reduce((s, p) => s + p.pnl, 0),
    [allDaily, todayStr],
  );
  const weekPnl = useMemo(
    () => allDaily.filter(p => p.date >= weekCutoff).reduce((s, p) => s + p.pnl, 0),
    [allDaily, weekCutoff],
  );
  const monthPnl = useMemo(
    () => allDaily.filter(p => p.date.startsWith(monthCutoff)).reduce((s, p) => s + p.pnl, 0),
    [allDaily, monthCutoff],
  );
  const yearPnl = useMemo(
    () => allDaily.filter(p => p.date.startsWith(yearStr)).reduce((s, p) => s + p.pnl, 0),
    [allDaily, yearStr],
  );
  const allTimePnl = stats?.netPnl ?? 0;

  // ── Stats from filtered data ───────────────────────────────────────────────
  const activeDays       = filteredDaily.filter(d => d.pnl !== 0).length;
  const totalFilteredPnl = filteredDaily.reduce((s, d) => s + d.pnl, 0);

  const bestDay  = filteredDaily.length
    ? filteredDaily.reduce((b, d) => d.pnl > b.pnl ? d : b)
    : null;
  const worstDay = filteredDaily.length
    ? filteredDaily.reduce((w, d) => d.pnl < w.pnl ? d : w)
    : null;

  const avgDailyPnl   = activeDays        > 0 ? totalFilteredPnl / activeDays                              : 0;
  const avgWeeklyPnl  = weeklyData.length  > 0 ? weeklyData.reduce((s, w) => s + w.pnl, 0)  / weeklyData.length  : 0;
  const avgMonthlyPnl = monthlyData.length > 0 ? monthlyData.reduce((s, m) => s + m.pnl, 0) / monthlyData.length : 0;

  const pnlSign    = (v: number) => v > 0 ? "+" : "";
  const filterLabel = TIME_FILTERS.find(f => f.id === timeFilter)?.label ?? "All";

  // ── Chart datasets ─────────────────────────────────────────────────────────

  // 1. Daily bar chart — BarPoint[] using ISO dates for labels
  const dailyBarData = useMemo(
    () => filteredDaily.map(d => ({
      label: fShortDate(d.date),
      value: d.pnl,
      color: d.pnl >= 0 ? GREEN : RED,
    })),
    [filteredDaily],
  );

  // 2. Weekly bar chart
  const weeklyBarData = useMemo(
    () => weeklyData.map(w => ({ label: w.label, value: w.pnl, color: w.pnl >= 0 ? GREEN : RED })),
    [weeklyData],
  );

  // 3. Monthly bar chart
  const monthlyBarData = useMemo(
    () => monthlyData.map(m => ({ label: m.label, value: m.pnl, color: m.pnl >= 0 ? GREEN : RED })),
    [monthlyData],
  );

  // 4. Cumulative area chart — uses ISO dates from filteredDaily directly
  //    (compatible with AreaChartWrapper's formatShortDate x-axis formatter)
  const cumulativeAreaData = useMemo(() => {
    let cum = 0;
    return filteredDaily.map(d => {
      cum += d.pnl;
      return { date: d.date, value: Math.round(cum * 100) / 100 };
    });
  }, [filteredDaily]);

  const lastCumValue = cumulativeAreaData.length > 0
    ? cumulativeAreaData[cumulativeAreaData.length - 1]!.value
    : 0;

  // ── Derived trade stats ────────────────────────────────────────────────────
  const grossProfit = (stats?.averageWin  ?? 0) * (stats?.winCount  ?? 0);
  const grossLoss   = (stats?.averageLoss ?? 0) * (stats?.lossCount ?? 0);

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (pageState === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={[s.header, { paddingTop: insets.top }]}>
          <Skeleton style={{ width: 32, height: 32, borderRadius: 16 }} />
          <Skeleton style={{ width: 160, height: 16, borderRadius: 8 }} />
          <View style={{ width: 60 }} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.skeletonContent}>
          <View style={s.grid2}>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} style={s.skeletonKpiCard} />
            ))}
          </View>
          <Skeleton style={s.skeletonFilter} />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} style={s.skeletonChart} />
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>

      {/* ── Secondary header ─────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color="#E8E8E8" />
        </Pressable>
        <Text style={s.headerTitle}>Net PNL Analytics</Text>
        <Pressable
          onPress={() => setCurrency(currency === "USD" ? "INR" : "USD")}
          style={[s.currencyBtn, currency === "INR" && s.currencyBtnINR]}
          hitSlop={8}
        >
          <Text style={[s.currencyText, currency === "INR" && s.currencyTextINR]}>
            {currency === "USD" ? "$ USD" : "₹ INR"}
          </Text>
        </Pressable>
      </View>

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Demo data banner ─────────────────────────────────────────────── */}
        {IS_DEMO && (
          <View style={s.demoBanner}>
            <View style={s.demoDot} />
            <Text style={s.demoText}>
              Demo data — connect your broker or record trades to see your real analytics
            </Text>
          </View>
        )}

        {/* ── Top 6 KPI cards ──────────────────────────────────────────────── */}
        <View style={s.grid2}>
          <KpiCard
            label="Net PNL"
            iconName={allTimePnl >= 0 ? "trending-up" : "trending-down"}
            value={fc(allTimePnl)}
            positive={allTimePnl > 0 ? true : allTimePnl < 0 ? false : undefined}
            sub="All time"
          />
          <KpiCard
            label="Today"
            iconName="pulse-outline"
            value={`${pnlSign(todayPnl)}${fc(todayPnl)}`}
            positive={todayPnl > 0 ? true : todayPnl < 0 ? false : undefined}
            sub={todayStr}
          />
          <KpiCard
            label="This Week"
            iconName="bar-chart-outline"
            value={`${pnlSign(weekPnl)}${fc(weekPnl)}`}
            positive={weekPnl > 0 ? true : weekPnl < 0 ? false : undefined}
          />
          <KpiCard
            label="This Month"
            iconName="calendar-outline"
            value={`${pnlSign(monthPnl)}${fc(monthPnl)}`}
            positive={monthPnl > 0 ? true : monthPnl < 0 ? false : undefined}
            sub={now.toLocaleDateString("en-US", { month: "long" })}
          />
          <KpiCard
            label="This Year"
            iconName="flash-outline"
            value={`${pnlSign(yearPnl)}${fc(yearPnl)}`}
            positive={yearPnl > 0 ? true : yearPnl < 0 ? false : undefined}
            sub={yearStr}
          />
          <KpiCard
            label="All Time"
            iconName="flame-outline"
            value={fc(allTimePnl)}
            positive={allTimePnl > 0 ? true : allTimePnl < 0 ? false : undefined}
          />
        </View>

        {/* ── Time filter pills ─────────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterScroll}
          contentContainerStyle={s.filterRow}
        >
          {TIME_FILTERS.map(f => (
            <Pressable
              key={f.id}
              onPress={() => setTimeFilter(f.id)}
              style={[s.filterPill, timeFilter === f.id && s.filterPillActive]}
            >
              <Text style={[s.filterPillText, timeFilter === f.id && s.filterPillTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* ── 1. Daily Net PNL Bar Chart ────────────────────────────────────── */}
        <View style={s.card}>
          <ChartHeader
            iconName="bar-chart-outline"
            title="Daily Net PNL"
            right={
              filteredDaily.length > 0 ? (
                <Text style={s.cardRight}>
                  {filteredDaily.length} day{filteredDaily.length !== 1 ? "s" : ""}
                </Text>
              ) : undefined
            }
          />
          {dailyBarData.length === 0 ? (
            <View style={s.emptyChart}>
              <Text style={s.emptyText}>No data for this period</Text>
            </View>
          ) : (
            <BarChartWrapper
              data={dailyBarData}
              formatter={fc}
              axisFormatter={axisFormatter}
              referenceY={0}
              height={200}
            />
          )}
        </View>

        {/* ── 2. Weekly Net PNL Bar Chart ───────────────────────────────────── */}
        <View style={s.card}>
          <ChartHeader iconName="bar-chart-outline" title="Weekly Net PNL" />
          {weeklyBarData.length === 0 ? (
            <View style={s.emptyChart}>
              <Text style={s.emptyText}>No data for this period</Text>
            </View>
          ) : (
            <BarChartWrapper
              data={weeklyBarData}
              formatter={fc}
              axisFormatter={axisFormatter}
              referenceY={0}
              height={180}
            />
          )}
        </View>

        {/* ── 3. Monthly Net PNL Bar Chart ──────────────────────────────────── */}
        <View style={s.card}>
          <ChartHeader iconName="calendar-outline" title="Monthly Net PNL" />
          {monthlyBarData.length === 0 ? (
            <View style={s.emptyChart}>
              <Text style={s.emptyText}>No data for this period</Text>
            </View>
          ) : (
            <BarChartWrapper
              data={monthlyBarData}
              formatter={fc}
              axisFormatter={axisFormatter}
              referenceY={0}
              height={180}
            />
          )}
        </View>

        {/* ── 4. Cumulative Net PNL (Equity Curve) ──────────────────────────── */}
        <View style={s.card}>
          <ChartHeader
            iconName="pulse-outline"
            title="Cumulative Net PNL"
            right={
              cumulativeAreaData.length > 0 ? (
                <Text style={[s.cumValue, { color: lastCumValue >= 0 ? GREEN : RED }]}>
                  {pnlSign(lastCumValue)}{fc(lastCumValue)}
                </Text>
              ) : undefined
            }
          />
          {cumulativeAreaData.length === 0 ? (
            <View style={s.emptyChart}>
              <Text style={s.emptyText}>No data for this period</Text>
            </View>
          ) : (
            <AreaChartWrapper
              data={cumulativeAreaData}
              color={BLUE}
              formatter={fc}
              axisFormatter={axisFormatter}
              height={200}
            />
          )}
        </View>

        {/* ── 5. PNL Calendar Heatmap ───────────────────────────────────────── */}
        <View style={s.card}>
          <ChartHeader
            iconName="calendar-outline"
            title="PNL Calendar"
            right={
              <View style={s.calLegend}>
                <View style={s.calLegendItem}>
                  <View style={[s.calDot, { backgroundColor: "rgba(52,211,153,0.6)" }]} />
                  <Text style={s.calLegendText}>Profit</Text>
                </View>
                <View style={s.calLegendItem}>
                  <View style={[s.calDot, { backgroundColor: "rgba(248,113,113,0.6)" }]} />
                  <Text style={s.calLegendText}>Loss</Text>
                </View>
              </View>
            }
          />
          <View style={s.calPad}>
            <CalendarHeatmap
              data={calData ?? []}
              year={now.getFullYear()}
              month={now.getMonth() + 1}
            />
          </View>
        </View>

        {/* ── Trade Statistics grid ─────────────────────────────────────────── */}
        <View style={s.card}>
          <ChartHeader iconName="trophy-outline" title="Trade Statistics" />
          <View style={si.grid}>
            {/* Row 1 */}
            <StatItem
              label="Win Rate"
              value={stats ? `${stats.winRate.toFixed(1)}%` : "—"}
              sub="Trades closed positive"
              color="#34d399"
            />
            <StatItem
              label="Profit Factor"
              value={stats ? stats.profitFactor.toFixed(2) : "—"}
              sub="Gross profit / gross loss"
              color={stats && stats.profitFactor >= 1 ? "#34d399" : "#f87171"}
            />
            <StatItem
              label="Avg Risk / Reward"
              value={stats ? `${stats.averageRR.toFixed(2)}R` : "—"}
              sub="Average RR across winners"
              color="#60a5fa"
            />
            <StatItem
              label="Total Trades"
              value={stats ? String(stats.totalTrades) : "—"}
              sub={
                stats
                  ? `${stats.winCount}W · ${stats.lossCount}L${stats.breakevenCount ? ` · ${stats.breakevenCount}B` : ""}`
                  : undefined
              }
            />
            {/* Row 2 */}
            <StatItem
              label="Average Win"
              value={stats && stats.averageWin > 0 ? `+${fc(stats.averageWin)}` : "—"}
              sub="Per winning trade"
              color="#34d399"
            />
            <StatItem
              label="Average Loss"
              value={stats && stats.averageLoss > 0 ? `-${fc(stats.averageLoss)}` : "—"}
              sub="Per losing trade"
              color="#f87171"
            />
            <StatItem
              label="Best Trade"
              value={stats && stats.largestWin > 0 ? `+${fc(stats.largestWin)}` : "—"}
              sub="Single trade high"
              color="#34d399"
            />
            <StatItem
              label="Worst Trade"
              value={stats && stats.largestLoss > 0 ? `-${fc(stats.largestLoss)}` : "—"}
              sub="Single trade low"
              color="#f87171"
            />
            {/* Row 3 */}
            <StatItem
              label="Net Profit"
              value={stats ? `${pnlSign(stats.netPnl)}${fc(stats.netPnl)}` : "—"}
              sub="Gross profit − gross loss"
              color={stats && stats.netPnl >= 0 ? "#34d399" : "#f87171"}
            />
            <StatItem
              label="Gross Profit"
              value={grossProfit > 0 ? `+${fc(grossProfit)}` : "—"}
              sub={`${stats?.winCount ?? 0} winning trades`}
              color="#34d399"
            />
            <StatItem
              label="Gross Loss"
              value={grossLoss > 0 ? `-${fc(grossLoss)}` : "—"}
              sub={`${stats?.lossCount ?? 0} losing trades`}
              color="#f87171"
            />
            <StatItem
              label="Win Streak"
              value={
                stats && stats.currentStreak > 0  ? `+${stats.currentStreak}`  :
                stats && stats.currentStreak < 0  ? String(stats.currentStreak) :
                "—"
              }
              sub="Current streak"
              color={
                stats && stats.currentStreak > 0 ? "#34d399" :
                stats && stats.currentStreak < 0 ? "#f87171" :
                undefined
              }
            />
          </View>
        </View>

        {/* ── PNL Statistics (period stats) ─────────────────────────────────── */}
        <View style={s.card}>
          <ChartHeader
            iconName="stats-chart-outline"
            title="PNL Statistics"
            right={
              <View style={s.filterBadge}>
                <Text style={s.filterBadgeText}>{filterLabel} range</Text>
              </View>
            }
          />
          <View style={si.grid}>
            <StatItem
              label="Best Profit Day"
              value={bestDay && bestDay.pnl > 0 ? fLongDate(bestDay.date) : "—"}
              sub={bestDay && bestDay.pnl > 0 ? `+${fc(bestDay.pnl)}` : undefined}
              color={bestDay && bestDay.pnl > 0 ? "#34d399" : undefined}
            />
            <StatItem
              label="Worst Loss Day"
              value={worstDay && worstDay.pnl < 0 ? fLongDate(worstDay.date) : "—"}
              sub={worstDay && worstDay.pnl < 0 ? fc(worstDay.pnl) : undefined}
              color={worstDay && worstDay.pnl < 0 ? "#f87171" : undefined}
            />
            <StatItem
              label="Highest Daily Profit"
              value={bestDay && bestDay.pnl > 0 ? `+${fc(bestDay.pnl)}` : "—"}
              sub={bestDay && bestDay.pnl > 0 ? fLongDate(bestDay.date) : undefined}
              color={bestDay && bestDay.pnl > 0 ? "#34d399" : undefined}
            />
            <StatItem
              label="Highest Daily Loss"
              value={worstDay && worstDay.pnl < 0 ? fc(worstDay.pnl) : "—"}
              sub={worstDay && worstDay.pnl < 0 ? fLongDate(worstDay.date) : undefined}
              color={worstDay && worstDay.pnl < 0 ? "#f87171" : undefined}
            />
            <StatItem
              label="Avg Daily Net PNL"
              value={activeDays > 0 ? `${pnlSign(avgDailyPnl)}${fc(avgDailyPnl)}` : "—"}
              sub={activeDays > 0 ? `${activeDays} active day${activeDays !== 1 ? "s" : ""}` : undefined}
              color={avgDailyPnl >= 0 ? "#34d399" : "#f87171"}
            />
            <StatItem
              label="Avg Weekly Net PNL"
              value={weeklyData.length > 0 ? `${pnlSign(avgWeeklyPnl)}${fc(avgWeeklyPnl)}` : "—"}
              sub={weeklyData.length > 0 ? `${weeklyData.length} week${weeklyData.length !== 1 ? "s" : ""}` : undefined}
              color={avgWeeklyPnl >= 0 ? "#34d399" : "#f87171"}
            />
            <StatItem
              label="Avg Monthly Net PNL"
              value={monthlyData.length > 0 ? `${pnlSign(avgMonthlyPnl)}${fc(avgMonthlyPnl)}` : "—"}
              sub={monthlyData.length > 0 ? `${monthlyData.length} month${monthlyData.length !== 1 ? "s" : ""}` : undefined}
              color={avgMonthlyPnl >= 0 ? "#34d399" : "#f87171"}
            />
            <StatItem
              label="Total Net PNL"
              value={`${pnlSign(totalFilteredPnl)}${fc(totalFilteredPnl)}`}
              sub={filterLabel !== "All" ? `${filterLabel} period` : "All time"}
              color={totalFilteredPnl >= 0 ? "#34d399" : "#f87171"}
            />
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StyleSheets
// ─────────────────────────────────────────────────────────────────────────────

// ── KPI card ──────────────────────────────────────────────────────────────────
const kpi = StyleSheet.create({
  card: {
    width:           "48%",
    backgroundColor: BG_CARD,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     BORDER,
    padding:         14,
    gap:             4,
  },
  headerRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    marginBottom:   6,
  },
  label: {
    fontSize:      10,
    color:         TEXT_MUT,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    flex:          1,
  },
  iconWrap: {
    padding:         5,
    borderRadius:    7,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  value: {
    fontSize:    20,
    fontWeight:  "700",
    color:       TEXT_PRI,
    letterSpacing: -0.4,
  },
  sub: {
    fontSize: 10,
    color:    TEXT_MUT,
    marginTop: 2,
  },
});

// ── Chart header ──────────────────────────────────────────────────────────────
const ch = StyleSheet.create({
  row: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    padding:        16,
    paddingBottom:  8,
  },
  left: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  iconWrap: {
    width:           24,
    height:          24,
    borderRadius:    6,
    backgroundColor: "rgba(96,165,250,0.15)",
    alignItems:      "center",
    justifyContent:  "center",
  },
  title: {
    fontSize:   13,
    fontWeight: "600",
    color:      TEXT_PRI,
  },
});

// ── Stat item ─────────────────────────────────────────────────────────────────
const si = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap:      "wrap",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  cell: {
    width:          "50%",
    padding:        14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    borderRightWidth:  StyleSheet.hairlineWidth,
    borderRightColor:  BORDER,
  },
  label: {
    fontSize:      10,
    fontWeight:    "600",
    color:         TEXT_DIM,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom:  4,
  },
  value: {
    fontSize:    16,
    fontWeight:  "700",
    color:       TEXT_PRI,
    lineHeight:  20,
  },
  sub: {
    fontSize:  10,
    color:     TEXT_MUT,
    marginTop: 3,
  },
});

// ── Calendar heatmap ──────────────────────────────────────────────────────────
const cal = StyleSheet.create({
  monthName: {
    fontSize:    12,
    fontWeight:  "600",
    color:       TEXT_MUT,
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap:      "wrap",
  },
  cell: {
    width:          `${100 / 7}%` as any,
    aspectRatio:    1,
    alignItems:     "center",
    justifyContent: "center",
    borderRadius:   6,
    padding:        1,
  },
  weekday: {
    fontSize:  9,
    fontWeight: "600",
    color:     TEXT_DIM,
  },
  dayNum: {
    fontSize:   9,
    fontWeight: "600",
    color:      "rgba(255,255,255,0.50)",
    lineHeight: 12,
  },
  pnlText: {
    fontSize:  7,
    fontWeight: "700",
    lineHeight: 10,
  },
});

// ── Main layout ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection:   "row",
    alignItems:      "center",
    justifyContent:  "space-between",
    paddingHorizontal: 16,
    paddingBottom:   12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#262626",
    backgroundColor: BG,
  },
  backBtn: {
    width:           32,
    height:          32,
    alignItems:      "center",
    justifyContent:  "center",
    borderRadius:    16,
  },
  headerTitle: {
    fontSize:   17,
    fontWeight: "600",
    color:      "#F3F3F3",
  },
  currencyBtn: {
    height:          28,
    paddingHorizontal: 10,
    borderRadius:    8,
    alignItems:      "center",
    justifyContent:  "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.12)",
  },
  currencyBtnINR: {
    backgroundColor: "rgba(251,191,36,0.12)",
    borderColor:     "rgba(251,191,36,0.35)",
  },
  currencyText: {
    fontSize:      11,
    fontWeight:    "700",
    color:         "#9ca3af",
    letterSpacing: 0.04,
  },
  currencyTextINR: {
    color: "rgba(251,191,36,0.9)",
  },

  // ── Scrollable content ─────────────────────────────────────────────────────
  content: {
    paddingHorizontal: 16,
    paddingTop:        16,
    gap:               12,
  },

  // ── Demo banner ───────────────────────────────────────────────────────────
  demoBanner: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius:    12,
    backgroundColor: "rgba(251,191,36,0.07)",
    borderWidth:     1,
    borderColor:     "rgba(251,191,36,0.22)",
  },
  demoDot: {
    width:           6,
    height:          6,
    borderRadius:    3,
    backgroundColor: "rgba(251,191,36,0.8)",
    flexShrink:      0,
  },
  demoText: {
    flex:       1,
    fontSize:   11,
    fontWeight: "600",
    color:      "rgba(251,191,36,0.85)",
  },

  // ── 2-column card grid ────────────────────────────────────────────────────
  grid2: {
    flexDirection: "row",
    flexWrap:      "wrap",
    gap:           10,
  },

  // ── Time filter scroll ────────────────────────────────────────────────────
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
    borderColor:     "rgba(96,165,250,0.35)",
  },
  filterPillText: {
    fontSize:   12,
    fontWeight: "700",
    color:      "rgba(148,163,184,0.70)",
  },
  filterPillTextActive: {
    color: BLUE,
  },

  // ── Glass card ────────────────────────────────────────────────────────────
  card: {
    backgroundColor: BG_CARD,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     BORDER,
    overflow:        "hidden",
  },
  cardRight: {
    fontSize:   11,
    color:      TEXT_MUT,
  },
  cumValue: {
    fontSize:   13,
    fontWeight: "700",
  },

  // ── Empty chart ───────────────────────────────────────────────────────────
  emptyChart: {
    height:         180,
    alignItems:     "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 12,
    color:    TEXT_DIM,
  },

  // ── Calendar heatmap padding ───────────────────────────────────────────────
  calLegend: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           10,
  },
  calLegendItem: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           5,
  },
  calDot: {
    width:        7,
    height:       7,
    borderRadius: 2,
  },
  calLegendText: {
    fontSize: 10,
    color:    TEXT_DIM,
  },
  calPad: {
    paddingHorizontal: 16,
    paddingBottom:     16,
  },

  // ── Filter badge (period stats header) ────────────────────────────────────
  filterBadge: {
    paddingHorizontal: 10,
    paddingVertical:   3,
    borderRadius:      999,
    backgroundColor:   "rgba(255,255,255,0.04)",
    borderWidth:       1,
    borderColor:       "rgba(255,255,255,0.06)",
  },
  filterBadgeText: {
    fontSize: 10,
    color:    TEXT_MUT,
  },

  // ── Skeleton loading ──────────────────────────────────────────────────────
  skeletonContent: {
    paddingHorizontal: 16,
    paddingTop:        16,
    gap:               12,
    paddingBottom:     24,
  },
  skeletonKpiCard: {
    width:        "48%",
    height:       90,
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
