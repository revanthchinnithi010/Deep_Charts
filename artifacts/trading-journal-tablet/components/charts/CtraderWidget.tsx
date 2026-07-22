/**
 * CtraderWidget — React Native port of src/components/charts/CtraderWidget.tsx
 *
 * Reusable cTrader OAuth + symbol management widget.
 * Used in BrokerIntegrationModal and the standalone ctrader-test screen.
 *
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. import.meta.env.BASE_URL → getApiBase()
 *    Absolute API base URL constructed by getApiBase() (EXPO_PUBLIC_API_BASE_URL
 *    env var). All fetch() calls are prefixed with BASE = getApiBase().
 *
 * 2. Lucide icons → Ionicons (@expo/vector-icons)
 *    RefreshCw    → "refresh-outline"
 *    Plug         → "power-outline"
 *    PlugZap      → "flash-outline"
 *    CheckCircle2 → "checkmark-circle"
 *    XCircle      → "close-circle"
 *    Clock        → "time-outline"
 *    ChevronDown  → "chevron-down"
 *    ChevronRight → "chevron-forward"
 *    Copy         → "copy-outline"
 *    Check        → "checkmark"
 *    Loader2      → ActivityIndicator (animated natively)
 *    Wifi         → "wifi-outline"
 *    WifiOff      → "cloud-offline-outline"
 *    Key          → "key-outline"
 *    Users        → "people-outline"
 *    UserCheck    → "person-circle-outline"
 *    BookOpen     → "book-outline"
 *    Radio        → "radio-outline"
 *    StopCircle   → "stop-circle-outline"
 *
 * 3. navigator.clipboard.writeText → Clipboard.setStringAsync (expo-clipboard)
 *
 * 4. window.open + window.addEventListener("message") → stubbed for Pass B
 *    OAuth popup flow has no direct RN equivalent. startOAuth() is preserved
 *    but stubbed with a TODO comment. The expo-web-browser integration will be
 *    wired in Pass B.
 *
 * 5. popupRef (Window reference) → removed
 *    Only used for the OAuth popup lifecycle, which is Pass B scope.
 *
 * 6. useRef<HTMLDivElement> (logsEndRef) → useRef<ScrollView>
 *    scrollIntoView({ behavior: "smooth" }) → scrollToEnd({ animated: true })
 *
 * 7. div/button/span/p/input/code → View/Pressable/Text/TextInput
 *
 * 8. CSS inline styles → React Native StyleSheet / inline RN style objects
 *    Removed: boxSizing, cursor, touchAction, transition, wordBreak,
 *             boxShadow, overflowY, display:"flex"/"grid", gridTemplateColumns
 *    Adapted: overflowY:"auto" + maxHeight → ScrollView with maxHeight
 *             gridTemplateColumns:"1fr 60px 60px" → flexDirection:"row" + explicit widths
 *             gridTemplateColumns:"1fr 1fr" → flexDirection:"row" flexWrap:"wrap" width:"50%"
 *             gridTemplateColumns:"repeat(3,1fr)" → flexDirection:"row" flexWrap:"wrap" width:"33.33%"
 *             fontFamily:"monospace" → Platform.select({ ios:"Courier New", android:"monospace" })
 *             @keyframes spin → ActivityIndicator (no manual animation needed)
 *
 * 9. flexDirection defaults to "column" in RN (matches web "flex-direction:column" default).
 *    Rows explicitly set flexDirection:"row".
 *
 * All exported APIs, types, interfaces, widget lifecycle, initialization sequence,
 * cleanup/disposal, loading/error states, and broker store interactions are preserved
 * exactly from the web source.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, Pressable, TextInput, ScrollView,
  ActivityIndicator, Platform, StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useBrokerStore } from "@/store/brokerStore";
import type { BrokerAccount } from "@/types/broker";
import { getApiBase } from "@/lib/apiBase";

const BASE = getApiBase();
const MONO = Platform.select({ ios: "Courier New", android: "monospace" }) ?? "monospace";

// ─── Safe JSON helper ────────────────────────────────────────────────────────
/**
 * Safe JSON helper — reads the response body as text first so we never
 * call .json() on an empty body ("Unexpected end of JSON input").
 *
 * Logs full diagnostics (URL, HTTP status, body length, preview) before
 * throwing, making it clear whether the failure is:
 *   - empty body       → server crashed before writing response
 *   - non-JSON body    → server returned HTML error page
 *   - non-200 status   → structured API error (returned, not thrown)
 *   - network/timeout  → caught by the outer fetch() try/catch
 */
async function safeJson<T>(
  res: Response,
  url: string,
  context?: Record<string, unknown>,
): Promise<T> {
  const text = await res.text();
  const diag = {
    url:        url.replace(/[?&](oauth_token|token|access_token)=[^&]+/g, "$1=***"),
    status:     res.status,
    bodyLength: text.length,
    ...context,
  };

  if (!text.trim()) {
    const msg = `[cTrader] Empty response body — HTTP ${res.status} from ${url.split("?")[0]}`;
    console.error("[cTrader] Empty body", diag);
    throw new Error(msg);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const preview = text.slice(0, 400);
    console.error("[cTrader] Non-JSON body", { ...diag, preview });
    throw new Error(
      `[cTrader] Non-JSON response — HTTP ${res.status} from ${url.split("?")[0]}: ${preview}`,
    );
  }

  if (!res.ok) {
    // Non-200 but valid JSON — log for diagnostics; caller inspects {ok, error}
    console.warn("[cTrader] HTTP error (JSON body)", { ...diag, preview: text.slice(0, 300) });
  }

  return parsed as T;
}

// ─── Types ───────────────────────────────────────────────────────────────────

type LogLevel = "info" | "success" | "error" | "warn" | "step";
interface LogEntry { ts: number; level: LogLevel; msg: string; }

interface OAuthConfig  { configured: boolean; hasClientId: boolean; hasClientSecret: boolean; redirectUri: string; authUrl: string | null; }
interface TokenStatus  { ok: boolean; masked_token: string | null; expires_at: number; expired: boolean; error?: string; }
interface OAuthStatus  { connected: boolean; expires_at?: number; expired?: boolean; updated_at?: string; error?: string; }
interface SessionInfo {
  sessionRestored:       boolean;
  tokenValid:            boolean;
  tokenExpired:          boolean;
  tokenExists:           boolean;
  expiresAt:             number;
  hasRefreshToken:       boolean;
  needsReauth:           boolean;
  accountRestored:       boolean;
  accountId:             number | null;
  isLive:                boolean;
  symbolsRestored:       number;
  subscriptionsRestored: number;
  engineStatus:          string;
}
interface SessionRestoreResult {
  ok:                     boolean;
  reason?:                string;
  needsReauth?:           boolean;
  needsSetup?:            boolean;
  tokenRefreshed?:        boolean;
  accountId?:             number;
  isLive?:                boolean;
  symbolsRestored?:       number;
  subscriptionsRestored?: number;
  engineStatus?:          string;
  error?:                 string;
}
interface CtraderAccount {
  ctidTraderAccountId: number;
  traderLogin?: number;
  isLive: boolean;
  brokerName?: string;
  depositCurrency?: string;
  balance?: number;
  leverage?: number;
  accountType?: string;
  accountName?: string;
}
interface AccountsResult {
  ok: boolean; http_status: number; accounts: CtraderAccount[] | null; raw?: string;
  note?: string; error?: string; endpoint_url?: string;
}
interface CtraderSymbol { symbolId: number; symbolName: string; description: string; pipPosition: number; digits: number; }
interface TraceEntry {
  seq: number; direction: "→" | "←"; msgName: string;
  payloadType: number; payloadBytes: number; summary: Record<string, unknown>; tsMs: number;
}
interface SymbolsResult {
  ok: boolean; trace?: TraceEntry[]; acctAuthOk?: boolean;
  acctAuthFields?: Record<string, unknown>; errorCodes?: string[];
  totalSymbols?: number; first20?: CtraderSymbol[]; durationMs?: number;
  error?: string; count?: number; via?: string; symbols?: CtraderSymbol[];
}
interface SpotsStatus { running: boolean; symbolCount: number; accountId?: number; }

type StepState = "idle" | "loading" | "success" | "error";

// ─── Constants ───────────────────────────────────────────────────────────────

const LOG_COLORS: Record<LogLevel, string> = {
  info:    "rgba(148,163,184,0.85)",
  success: "#34d399",
  error:   "#f87171",
  warn:    "#fbbf24",
  step:    "#60a5fa",
};

// Ionicons names for each step (replaces Lucide React.ElementType map)
const STEP_ICON: Record<string, string> = {
  config:   "wifi-outline",
  token:    "key-outline",
  accounts: "people-outline",
  auth:     "person-circle-outline",
  symbols:  "book-outline",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ts(epoch: number): string {
  return new Date(epoch * 1000).toLocaleString();
}
function fmtTime(epoch: number): string {
  const d = new Date(epoch);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}.${String(d.getMilliseconds()).padStart(3,"0")}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepCard({ icon, title, state, children }: {
  icon: string; title: string; state: StepState; children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const stateColor = state === "success" ? "#34d399" : state === "error" ? "#f87171" : state === "loading" ? "#fbbf24" : "rgba(148,163,184,0.50)";
  const stateIconName = state === "success" ? "checkmark-circle" : state === "error" ? "close-circle" : "time-outline";
  const borderOpacity = state === "idle" ? "0.06" : "0.10";
  return (
    <View style={[ss.card, { borderColor: `rgba(255,255,255,${borderOpacity})` }]}>
      <Pressable
        onPress={() => setExpanded(p => !p)}
        style={ss.cardHeader}
      >
        <View style={ss.stepIconBox}>
          <Ionicons name={icon as any} size={14} color="rgba(148,163,184,0.70)" />
        </View>
        <Text style={ss.cardTitle}>{title}</Text>
        <Ionicons name={stateIconName as any} size={15} color={stateColor} />
        <Ionicons name={expanded ? "chevron-down" : "chevron-forward"} size={13} color="rgba(148,163,184,0.40)" />
      </Pressable>
      {expanded && (
        <View style={ss.cardBody}>
          {children}
        </View>
      )}
    </View>
  );
}

function MonoBox({ label, value, copyable = false }: { label: string; value: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  const doCopy = useCallback(async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);
  return (
    <View style={ss.monoBoxOuter}>
      <Text style={ss.monoBoxLabel}>{label}</Text>
      <View style={ss.monoBoxRow}>
        <Text style={ss.monoBoxValue} selectable>{value}</Text>
        {copyable && (
          <Pressable onPress={doCopy} hitSlop={8}>
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={12}
              color={copied ? "#34d399" : "rgba(148,163,184,0.40)"}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function CWBadge({ label, color, bg, dot = true }: { label: string; color: string; bg: string; dot?: boolean }) {
  return (
    <View style={[ss.badge, { backgroundColor: bg, borderColor: `${color}33` }]}>
      {dot && <View style={[ss.badgeDot, { backgroundColor: color }]} />}
      <Text style={[ss.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function ActionBtn({ onClick, loading, disabled, children, variant = "primary" }: {
  onClick: () => void; loading?: boolean; disabled?: boolean; children: React.ReactNode; variant?: "primary" | "danger" | "ghost" | "success";
}) {
  const variants: Record<string, { bg: string; border: string; color: string }> = {
    primary: { bg: "rgba(59,130,246,0.14)", border: "rgba(59,130,246,0.28)", color: "#60a5fa" },
    danger:  { bg: "rgba(239,68,68,0.10)",  border: "rgba(239,68,68,0.22)",  color: "#f87171" },
    ghost:   { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.65)" },
    success: { bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.22)", color: "#34d399" },
  };
  const s = variants[variant]!;
  const isDisabled = loading || disabled;
  return (
    <Pressable
      onPress={onClick}
      disabled={isDisabled}
      style={[
        ss.actionBtn,
        { backgroundColor: s.bg, borderColor: s.border, opacity: isDisabled ? 0.55 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator size={12} color={s.color} style={{ marginRight: 4 }} />
      ) : null}
      {typeof children === "string" ? (
        <Text style={[ss.actionBtnText, { color: s.color }]}>{children}</Text>
      ) : (
        <View style={ss.actionBtnInner}>
          {children}
        </View>
      )}
    </Pressable>
  );
}

// Helper: renders icon + label row inside ActionBtn
function BtnContent({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <View style={ss.btnContentRow}>
      <Ionicons name={icon as any} size={11} color={color} />
      <Text style={[ss.actionBtnText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function CtraderWidget() {
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  // RN: ScrollView ref for scrollToEnd (replaces HTMLDivElement ref + scrollIntoView)
  const logsScrollRef = useRef<ScrollView>(null);

  const [config,   setConfig]   = useState<OAuthConfig | null>(null);
  const [oaStatus, setOaStatus] = useState<OAuthStatus | null>(null);
  const [tokenSt,  setTokenSt]  = useState<TokenStatus | null>(null);
  const [accounts, setAccounts] = useState<AccountsResult | null>(null);
  const [symbols,  setSymbols]  = useState<SymbolsResult | null>(null);
  const [spotsStatus, setSpotsStatus] = useState<SpotsStatus | null>(null);
  const [accountIdInput, setAccountIdInput] = useState("");
  const [selectedIsLive, setSelectedIsLive] = useState(false);

  const [sessionInfo,    setSessionInfo]    = useState<SessionInfo | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(true);
  const [restoreResult,  setRestoreResult]  = useState<SessionRestoreResult | null>(null);

  const [stepStates, setStepStates] = useState<Record<string, StepState>>({
    config: "idle", token: "idle", accounts: "idle", symbols: "idle",
  });
  const [oauthLoading,      setOauthLoading]      = useState(false);
  const [refreshLoading,    setRefreshLoading]    = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [accountsLoading,   setAccountsLoading]  = useState(false);
  const [symbolsLoading,    setSymbolsLoading]   = useState(false);
  const [wireLoading,       setWireLoading]      = useState(false);
  const [wiredCount,        setWiredCount]       = useState<number | null>(null);
  const [feedLoading,       setFeedLoading]      = useState(false);

  const log = useCallback((level: LogLevel, msg: string) => {
    setLogs(p => [...p.slice(-199), { ts: Date.now(), level, msg }]);
  }, []);

  // RN: scrollToEnd on ScrollView (replaces scrollIntoView on a sentinel div)
  useEffect(() => {
    if (logOpen) {
      // Defer so the new log entry has been rendered
      setTimeout(() => logsScrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [logs, logOpen]);

  // ── API helpers ────────────────────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    log("step", "Fetching OAuth config…");
    setStepStates(p => ({ ...p, config: "loading" }));
    try {
      const res  = await fetch(`${BASE}/api/ctrader/oauth/config`);
      const data = (await res.json()) as OAuthConfig;
      if (!mountedRef.current) return;
      setConfig(data);
      if (data.configured) {
        log("success", `Config OK — Redirect URI: ${data.redirectUri}`);
        setStepStates(p => ({ ...p, config: "success" }));
      } else {
        log("warn", "CTRADER_CLIENT_ID or CTRADER_CLIENT_SECRET not set in Secrets");
        setStepStates(p => ({ ...p, config: "error" }));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Config fetch failed: ${String(err)}`);
      setStepStates(p => ({ ...p, config: "error" }));
    }
  }, [log]);

  const loadStatus = useCallback(async () => {
    try {
      const [statusRes, tokenRes] = await Promise.all([
        fetch(`${BASE}/api/ctrader/oauth/status`),
        fetch(`${BASE}/api/ctrader/oauth/token`),
      ]);
      const statusData = (await statusRes.json()) as OAuthStatus;
      const tokenData  = (await tokenRes.json()) as TokenStatus;
      if (!mountedRef.current) return;
      setOaStatus(statusData);
      setTokenSt(tokenData);
      if (statusData.connected) {
        log("info", `Token in DB — expires ${ts(statusData.expires_at ?? 0)}${statusData.expired ? " [EXPIRED]" : ""}`);
        setStepStates(p => ({ ...p, token: statusData.expired ? "error" : "success" }));
      } else {
        setStepStates(p => ({ ...p, token: "idle" }));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("warn", `Status fetch: ${String(err)}`);
    }
  }, [log]);

  const loadSpotsStatus = useCallback(async () => {
    try {
      const res  = await fetch(`${BASE}/api/ctrader/spots/status`);
      const data = await res.json() as SpotsStatus;
      if (!mountedRef.current) return;
      setSpotsStatus(data);
    } catch { /* no-op */ }
  }, []);

  const connectToBrokerStore = useCallback(async (overrideAccountId?: number, overrideIsLive?: boolean) => {
    const accountId = overrideAccountId ?? (accountIdInput ? Number(accountIdInput) : 0);
    if (!accountId) { log("warn", "No accountId — skipping broker store connect"); return; }
    const isLive = overrideIsLive ?? selectedIsLive;
    const { connect } = useBrokerStore.getState();
    const account: BrokerAccount = {
      id:          accountId,
      broker_id:   "ctrader",
      label:       `cTrader ${isLive ? "Live" : "Demo"} #${accountId}`,
      is_active:   true,
      api_token:   "",
      created_at:  new Date().toISOString(),
    };
    try {
      await connect(account);
      log("success", `Broker connected (account ${accountId}) — balance & positions polling active`);
    } catch (err) {
      log("warn", `Broker store connect failed: ${String(err)}`);
    }
  }, [accountIdInput, selectedIsLive, log]);

  const runFullAutoSetup = useCallback(async () => {
    log("step", "Auto-setup: fetching symbols + connecting broker…");
    try {
      const res  = await fetch(`${BASE}/api/ctrader/auto-setup`, { method: "POST" });
      type SetupResult = { ok: boolean; accountId?: number; isLive?: boolean; symbolCount?: number; error?: string };
      const data = (await res.json()) as SetupResult;
      if (!mountedRef.current) return;
      if (data.ok && data.accountId) {
        log("success", `Auto-setup OK — ${data.symbolCount ?? 0} symbols, account ${data.accountId}`);
        setAccountIdInput(String(data.accountId));
        setSelectedIsLive(data.isLive ?? false);
        setStepStates(_p => ({ config: "success", token: "success", accounts: "success", symbols: "success" }));
        await Promise.all([loadStatus(), loadSpotsStatus()]);
        await connectToBrokerStore(data.accountId, data.isLive ?? false);
      } else {
        log("error", `Auto-setup failed: ${data.error ?? "unknown error"}`);
        await loadStatus();
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Auto-setup error: ${String(err)}`);
    }
  }, [log, loadStatus, loadSpotsStatus, connectToBrokerStore]);

  const restoreSession = useCallback(async () => {
    setRestoreLoading(true);
    log("step", "Checking for existing cTrader session…");
    try {
      const sessionRes  = await fetch(`${BASE}/api/ctrader/session`);
      const session     = (await sessionRes.json()) as SessionInfo;
      if (!mountedRef.current) return;
      setSessionInfo(session);

      if (!session.tokenExists) {
        log("info", "No session stored — please complete OAuth login");
        return;
      }

      if (session.sessionRestored || (session.tokenValid && session.accountRestored && session.symbolsRestored > 0)) {
        log("info", "Existing session found — restoring silently…");
        const restoreRes  = await fetch(`${BASE}/api/ctrader/session-restore`, { method: "POST" });
        const restoreData = (await restoreRes.json()) as SessionRestoreResult;
        if (!mountedRef.current) return;
        setRestoreResult(restoreData);

        if (restoreData.ok) {
          const suffix = restoreData.tokenRefreshed ? " (token refreshed)" : "";
          log("success", `Session restored${suffix} — ${restoreData.subscriptionsRestored ?? 0} subscriptions active`);
          setStepStates(_p => ({ config: "success", token: "success", accounts: "success", symbols: "success" }));
          const acctId  = restoreData.accountId  ?? session.accountId  ?? undefined;
          const acctLive = restoreData.isLive    ?? session.isLive;
          if (acctId) {
            setAccountIdInput(String(acctId));
            setSelectedIsLive(acctLive);
          }
          await loadStatus();
          await loadSpotsStatus();
          if (acctId) await connectToBrokerStore(acctId, acctLive);
        } else if (restoreData.needsReauth) {
          log("warn", "Session expired and refresh failed — please re-authorize");
        } else if (restoreData.needsSetup) {
          log("warn", `Setup incomplete (${restoreData.reason}) — please wire symbols`);
        } else {
          log("warn", `Restore failed: ${restoreData.error ?? restoreData.reason ?? "unknown"}`);
        }
      } else if (session.tokenExpired && session.hasRefreshToken) {
        log("info", "Token expired — attempting silent refresh…");
        const restoreRes  = await fetch(`${BASE}/api/ctrader/session-restore`, { method: "POST" });
        const restoreData = (await restoreRes.json()) as SessionRestoreResult;
        if (!mountedRef.current) return;
        setRestoreResult(restoreData);
        if (restoreData.ok) {
          log("success", "Token refreshed — session restored");
          setStepStates(_p => ({ config: "success", token: "success", accounts: "success", symbols: "success" }));
          await loadStatus();
          await loadSpotsStatus();
          const rId   = restoreData.accountId  ?? session.accountId  ?? undefined;
          const rLive = restoreData.isLive     ?? session.isLive;
          if (rId) await connectToBrokerStore(rId, rLive);
        } else {
          log("warn", "Token refresh failed — please re-authorize");
        }
      } else {
        log("info", "Partial session — complete setup steps below");
        if (session.tokenValid) setStepStates(p => ({ ...p, token: "success" }));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("warn", `Session check error: ${String(err)}`);
    } finally {
      if (mountedRef.current) setRestoreLoading(false);
    }
  }, [log, loadStatus, loadSpotsStatus, connectToBrokerStore]);

  useEffect(() => {
    log("info", "cTrader widget loaded");
    restoreSession().then(() => {
      loadConfig();
      if (!sessionInfo?.tokenValid) loadStatus();
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // TODO(Pass-B): Replace with expo-web-browser polling for OAuth result.
  // Web source used window.addEventListener("message", handler) to receive the
  // cross-window postMessage from the OAuth popup. On RN, expo-web-browser's
  // openAuthSessionAsync/openBrowserAsync result is polled via
  // /api/ctrader/oauth/pending-account after the browser session completes.
  // This effect is intentionally omitted in Pass A.

  const startOAuth = useCallback(async () => {
    // TODO(Pass-B): Wire expo-web-browser OAuth flow.
    // Web: window.open(config.authUrl, "ctrader_oauth", ...)
    // RN:  WebBrowser.openAuthSessionAsync(config.authUrl, redirectUri)
    //      then poll /api/ctrader/oauth/pending-account for the result.
    if (!config?.authUrl) { log("error", "No auth URL — check CTRADER_CLIENT_ID / CTRADER_CLIENT_SECRET"); return; }
    if (oauthLoading) return;
    log("warn", "OAuth login requires Pass B (expo-web-browser) migration");
  }, [config, oauthLoading, log]);

  const handleRefresh = useCallback(async () => {
    if (refreshLoading) return;
    setRefreshLoading(true);
    log("step", "Requesting token refresh…");
    try {
      const res  = await fetch(`${BASE}/api/ctrader/oauth/refresh`, { method: "POST" });
      const data = await res.json() as { ok: boolean; expires_at?: number; error?: string };
      if (!mountedRef.current) return;
      if (data.ok) { log("success", `Token refreshed — expires: ${ts(data.expires_at ?? 0)}`); await loadStatus(); }
      else log("error", `Refresh failed: ${data.error}`);
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Refresh error: ${String(err)}`);
    } finally {
      if (mountedRef.current) setRefreshLoading(false);
    }
  }, [refreshLoading, loadStatus, log]);

  const handleDisconnect = useCallback(async () => {
    if (disconnectLoading) return;
    setDisconnectLoading(true);
    log("step", "Disconnecting — clearing tokens, account config, and stopping engine…");
    try {
      await fetch(`${BASE}/api/ctrader/oauth/disconnect`, { method: "POST" });
      if (!mountedRef.current) return;
      log("success", "Disconnected — all session data cleared");
      setOaStatus(null); setTokenSt(null); setAccounts(null); setSymbols(null); setWiredCount(null);
      setSessionInfo(null); setRestoreResult(null); setAccountIdInput(""); setSelectedIsLive(false);
      setStepStates(_p => ({ config: "success", token: "idle", accounts: "idle", symbols: "idle" }));
      loadSpotsStatus();
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Disconnect error: ${String(err)}`);
    } finally {
      if (mountedRef.current) setDisconnectLoading(false);
    }
  }, [disconnectLoading, log, loadSpotsStatus]);

  const fetchAccounts = useCallback(async () => {
    if (accountsLoading) return;
    setAccountsLoading(true);
    log("step", "Fetching cTrader accounts…");
    setStepStates(p => ({ ...p, accounts: "loading" }));
    try {
      const res  = await fetch(`${BASE}/api/ctrader/accounts`);
      const data = (await res.json()) as AccountsResult;
      if (!mountedRef.current) return;
      setAccounts(data);
      if (data.ok) {
        const list = Array.isArray(data.accounts) ? data.accounts : [];
        log("success", `Accounts received — ${list.length} account${list.length !== 1 ? "s" : ""}`);
        setStepStates(p => ({ ...p, accounts: "success" }));
        if (list.length === 1) {
          const only = list[0]!;
          const id = String(only.ctidTraderAccountId);
          log("info", `Auto-selecting single account: ${id}`);
          setAccountIdInput(id);
          setSelectedIsLive(only.isLive);
        }
      } else {
        log("warn", `Accounts HTTP ${data.http_status}: ${data.error ?? (data.raw ?? "").slice(0, 200)}`);
        setStepStates(p => ({ ...p, accounts: "error" }));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Account fetch error: ${String(err)}`);
      setStepStates(p => ({ ...p, accounts: "error" }));
    } finally {
      if (mountedRef.current) setAccountsLoading(false);
    }
  }, [accountsLoading, log]);

  const fetchSymbols = useCallback(async (overrideId?: string, overrideIsLive?: boolean) => {
    const id     = overrideId     ?? accountIdInput.trim();
    const isLive = overrideIsLive ?? selectedIsLive;
    if (symbolsLoading || !id) return;
    setSymbolsLoading(true);
    setWiredCount(null);
    log("step", `Fetching symbols for account ${id} (${isLive ? "live" : "demo"})…`);
    setStepStates(p => ({ ...p, symbols: "loading" }));
    try {
      const url  = `${BASE}/api/ctrader/symbols-verbose/${encodeURIComponent(id)}?isLive=${isLive}`;
      const res  = await fetch(url);
      const data = (await res.json()) as SymbolsResult;
      if (!mountedRef.current) return;
      setSymbols(data);
      if (data.ok) {
        log("success", `${data.durationMs ?? "?"}ms — ${data.totalSymbols} symbols`);
        setStepStates(p => ({ ...p, symbols: "success" }));
      } else {
        log("warn", `Symbols error: ${data.error ?? "unknown"}`);
        setStepStates(p => ({ ...p, symbols: "error" }));
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Symbol fetch error: ${String(err)}`);
      setStepStates(p => ({ ...p, symbols: "error" }));
    } finally {
      if (mountedRef.current) setSymbolsLoading(false);
    }
  }, [symbolsLoading, accountIdInput, selectedIsLive, log]);

  const wireSymbols = useCallback(async () => {
    if (!symbols?.ok) return;
    const allSymbols = symbols.symbols ?? symbols.first20 ?? [];
    if (!allSymbols.length) return;
    setWireLoading(true);
    log("step", `Wiring ${allSymbols.length} symbols to watchlist…`);
    try {
      const accountId = accountIdInput ? Number(accountIdInput) : undefined;
      const res  = await fetch(`${BASE}/api/ctrader/symbols-cache`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: allSymbols, accountId, isLive: selectedIsLive }),
      });
      const data = await res.json() as { ok: boolean; cached?: number; error?: string };
      if (!mountedRef.current) return;
      if (data.ok) {
        setWiredCount(data.cached ?? allSymbols.length);
        log("success", `Wired ${data.cached ?? allSymbols.length} symbols → cTrader Watchlist`);
        if (accountId) {
          try {
            const startRes  = await fetch(`${BASE}/api/ctrader/spots/start`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accountId, isLive: selectedIsLive }),
            });
            const startData = await startRes.json() as { ok: boolean; symbolCount?: number; error?: string };
            if (startData.ok) {
              log("success", `Live feed started — ${startData.symbolCount ?? "all"} symbols`);
              loadSpotsStatus();
            } else {
              log("warn", `Feed start: ${startData.error ?? "unknown"}`);
            }
          } catch (startErr) {
            log("warn", `Feed start error: ${String(startErr)}`);
          }
        }
      } else {
        log("error", `Wire failed: ${data.error ?? "unknown"}`);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Wire error: ${String(err)}`);
    } finally {
      if (mountedRef.current) setWireLoading(false);
    }
  }, [symbols, accountIdInput, selectedIsLive, log, loadSpotsStatus]);

  const handleStartFeed = useCallback(async () => {
    const accountId = accountIdInput ? Number(accountIdInput) : spotsStatus?.accountId;
    if (!accountId) { log("warn", "Select an account first (Step 3) before starting the live feed"); return; }
    setFeedLoading(true);
    log("step", `Starting live feed for account ${accountId}…`);
    try {
      const res  = await fetch(`${BASE}/api/ctrader/spots/start`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, isLive: selectedIsLive }),
      });
      const data = await res.json() as { ok: boolean; symbolCount?: number; error?: string };
      if (!mountedRef.current) return;
      if (data.ok) { log("success", `Live feed running — ${data.symbolCount ?? "all"} symbols subscribed`); }
      else { log("error", `Start failed: ${data.error ?? "unknown"}`); }
      loadSpotsStatus();
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Start error: ${String(err)}`);
    } finally {
      if (mountedRef.current) setFeedLoading(false);
    }
  }, [accountIdInput, selectedIsLive, spotsStatus, log, loadSpotsStatus]);

  const handleStopFeed = useCallback(async () => {
    setFeedLoading(true);
    log("step", "Stopping live feed…");
    try {
      const res  = await fetch(`${BASE}/api/ctrader/spots/stop`, { method: "POST" });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!mountedRef.current) return;
      if (data.ok) { log("success", "Live feed stopped"); }
      else { log("error", `Stop failed: ${data.error ?? "unknown"}`); }
      loadSpotsStatus();
    } catch (err) {
      if (!mountedRef.current) return;
      log("error", `Stop error: ${String(err)}`);
    } finally {
      if (mountedRef.current) setFeedLoading(false);
    }
  }, [log, loadSpotsStatus]);

  const handleRefreshSymbols = useCallback(async () => {
    if (accountIdInput.trim()) {
      await fetchSymbols();
    } else {
      log("warn", "Enter an account ID in Step 4 to refresh symbols");
    }
  }, [accountIdInput, fetchSymbols, log]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const connected = oaStatus?.connected && !oaStatus.expired;
  const sessionOk = restoreResult?.ok ?? false;
  const engineLive = (restoreResult?.engineStatus ?? sessionInfo?.engineStatus) === "streaming";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={ss.root}>

      {/* ── Session restore banner ── */}
      {restoreLoading ? (
        <View style={ss.bannerNeutral}>
          <ActivityIndicator size={14} color="rgba(148,163,184,0.50)" />
          <Text style={ss.bannerNeutralText}>Checking for existing session…</Text>
        </View>
      ) : sessionOk ? (
        <View style={[ss.bannerRow, ss.bannerSuccess]}>
          <Ionicons name="checkmark-circle" size={14} color="#34d399" />
          <Text style={[ss.bannerLabel, { color: "#34d399" }]}>Session Restored</Text>
          {restoreResult?.tokenRefreshed && (
            <CWBadge label="Token Refreshed" color="#fbbf24" bg="rgba(245,158,11,0.10)" />
          )}
          {engineLive && (
            <CWBadge label={`Live Feed · ${restoreResult?.subscriptionsRestored ?? 0} subs`} color="#60a5fa" bg="rgba(59,130,246,0.10)" />
          )}
          <ActionBtn onClick={() => restoreSession()} variant="ghost" loading={restoreLoading}>
            <BtnContent icon="refresh-outline" label="Re-check" color="rgba(255,255,255,0.65)" />
          </ActionBtn>
        </View>
      ) : sessionInfo?.tokenExists ? (
        <View style={[ss.bannerRow, ss.bannerWarn]}>
          <Ionicons name="time-outline" size={14} color="#fbbf24" />
          <Text style={[ss.bannerLabel, { color: "#fbbf24" }]}>
            {sessionInfo.tokenExpired ? "Token Expired — Re-authorize below" : "Partial Session — Complete setup below"}
          </Text>
        </View>
      ) : null}

      {/* ── Session diagnostics grid ── */}
      {sessionInfo && (
        <View style={ss.diagGrid}>
          {([
            ["Session Restored", sessionInfo.sessionRestored, sessionOk],
            ["Token Valid",      sessionInfo.tokenValid,      sessionInfo.tokenValid],
            ["Account Restored", sessionInfo.accountRestored, sessionInfo.accountRestored],
            [`Symbols (${sessionInfo.symbolsRestored})`,  sessionInfo.symbolsRestored > 0, sessionInfo.symbolsRestored > 0],
            [`Subs (${restoreResult?.subscriptionsRestored ?? sessionInfo.subscriptionsRestored})`, (restoreResult?.subscriptionsRestored ?? sessionInfo.subscriptionsRestored) > 0, (restoreResult?.subscriptionsRestored ?? sessionInfo.subscriptionsRestored) > 0],
            [`Engine: ${restoreResult?.engineStatus ?? sessionInfo.engineStatus}`, engineLive, engineLive],
          ] as [string, boolean, boolean][]).map(([label, _bool, ok]) => (
            <View key={label} style={ss.diagItem}>
              <View style={[ss.diagDot, { backgroundColor: ok ? "#34d399" : "#6b7280" }]} />
              <Text style={[ss.diagLabel, { color: ok ? "rgba(255,255,255,0.70)" : "rgba(148,163,184,0.40)" }]}>
                {label}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Status banner ── */}
      <View style={[ss.bannerRow, connected ? ss.statusConnected : ss.statusDisconnected]}>
        <View style={ss.statusLeft}>
          <Ionicons
            name={connected ? "power-outline" : "flash-outline"}
            size={14}
            color={connected ? "#34d399" : "rgba(148,163,184,0.50)"}
          />
          <Text style={[ss.bannerLabel, { color: connected ? "#34d399" : "rgba(148,163,184,0.70)" }]}>
            {connected ? "Connected" : oaStatus?.connected ? "Token Expired" : "Not Connected"}
          </Text>
        </View>
        {config && (
          <CWBadge
            label={config.configured ? "Credentials OK" : "Credentials Missing"}
            color={config.configured ? "#34d399" : "#f87171"}
            bg={config.configured ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)"}
          />
        )}
        {spotsStatus?.running && (
          <CWBadge label={`Live Feed · ${spotsStatus.symbolCount} symbols`} color="#60a5fa" bg="rgba(59,130,246,0.10)" />
        )}
        {oaStatus?.connected && oaStatus.expires_at && (
          <Text style={ss.expiryText}>
            {oaStatus.expired ? "⚠️ Expired" : "Expires"}: {ts(oaStatus.expires_at)}
          </Text>
        )}
      </View>

      {/* ── Quick actions ── */}
      <View style={ss.actionsRow}>
        <ActionBtn onClick={() => { loadConfig(); loadStatus(); loadSpotsStatus(); }} variant="ghost">
          <BtnContent icon="refresh-outline" label="Reload Status" color="rgba(255,255,255,0.65)" />
        </ActionBtn>
        <ActionBtn onClick={handleRefreshSymbols} loading={symbolsLoading} disabled={!connected} variant="ghost">
          <BtnContent icon="book-outline" label="Refresh Symbols" color="rgba(255,255,255,0.65)" />
        </ActionBtn>
        {spotsStatus?.running ? (
          <ActionBtn onClick={handleStopFeed} loading={feedLoading} variant="danger">
            <BtnContent icon="stop-circle-outline" label="Stop Live Feed" color="#f87171" />
          </ActionBtn>
        ) : (
          <ActionBtn onClick={handleStartFeed} loading={feedLoading} disabled={!connected} variant="success">
            <BtnContent icon="radio-outline" label="Start Live Feed" color="#34d399" />
          </ActionBtn>
        )}
        {connected && (
          <>
            <ActionBtn onClick={handleRefresh} loading={refreshLoading} variant="ghost">
              <BtnContent icon="refresh-outline" label="Refresh Token" color="rgba(255,255,255,0.65)" />
            </ActionBtn>
            <ActionBtn onClick={handleDisconnect} loading={disconnectLoading} variant="danger">
              <BtnContent icon="cloud-offline-outline" label="Disconnect" color="#f87171" />
            </ActionBtn>
          </>
        )}
      </View>

      {/* ── Step 1: Config ── */}
      <StepCard icon={STEP_ICON.config!} title="Step 1 — OAuth Configuration" state={stepStates.config!}>
        {config ? (
          <>
            <View style={ss.actionsRow}>
              <CWBadge
                label={(config.hasClientId ?? config.configured) ? "Client ID ✓" : "Client ID Missing"}
                color={(config.hasClientId ?? config.configured) ? "#34d399" : "#f87171"}
                bg={(config.hasClientId ?? config.configured) ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)"}
              />
              <CWBadge
                label={(config.hasClientSecret ?? config.configured) ? "Client Secret ✓" : "Client Secret Missing"}
                color={(config.hasClientSecret ?? config.configured) ? "#34d399" : "#f87171"}
                bg={(config.hasClientSecret ?? config.configured) ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)"}
              />
            </View>
            <MonoBox label="Redirect URI" value={config.redirectUri} copyable />
            {config.authUrl && (
              <MonoBox
                label="Auth URL Preview"
                value={config.authUrl.slice(0, 120) + (config.authUrl.length > 120 ? "…" : "")}
              />
            )}
            {!config.configured && (
              <View style={ss.errorBox}>
                <Text style={ss.errorBoxText}>
                  {!(config.hasClientId ?? false) && !(config.hasClientSecret ?? false) && (
                    <>{"Missing: "}<Text style={ss.codeInline}>CTRADER_CLIENT_ID</Text>{" and "}<Text style={ss.codeInline}>CTRADER_CLIENT_SECRET</Text></>
                  )}
                  {!(config.hasClientId ?? false) && (config.hasClientSecret ?? false) && (
                    <>{"Missing: "}<Text style={ss.codeInline}>CTRADER_CLIENT_ID</Text></>
                  )}
                  {(config.hasClientId ?? false) && !(config.hasClientSecret ?? false) && (
                    <>{"Missing: "}<Text style={ss.codeInline}>CTRADER_CLIENT_SECRET</Text></>
                  )}
                  {" Add the missing secret(s) in the Secrets panel, then restart the server workflow to pick them up."}
                </Text>
              </View>
            )}
          </>
        ) : (
          <View style={ss.loadingRow}>
            <ActivityIndicator size={13} color="rgba(148,163,184,0.55)" />
            <Text style={ss.loadingText}>Loading config…</Text>
          </View>
        )}
      </StepCard>

      {/* ── Step 2: OAuth Flow ── */}
      <StepCard icon={STEP_ICON.token!} title="Step 2 — OAuth Login" state={stepStates.token!}>
        {connected ? (
          <>
            <View style={ss.actionsRow}>
              <CWBadge label="Access Token Active" color="#34d399" bg="rgba(16,185,129,0.10)" />
              {oaStatus?.expired
                ? <CWBadge label="EXPIRED" color="#f87171" bg="rgba(239,68,68,0.10)" dot={false} />
                : <CWBadge label="Valid" color="#34d399" bg="rgba(16,185,129,0.10)" dot={false} />
              }
            </View>
            {tokenSt?.masked_token && <MonoBox label="Access Token (masked)" value={tokenSt.masked_token} copyable />}
            {oaStatus?.expires_at && <MonoBox label="Expires At" value={ts(oaStatus.expires_at)} />}
            <View style={{ marginTop: 4 }}>
              <ActionBtn
                onClick={startOAuth}
                loading={oauthLoading}
                disabled={!config?.configured || !config.authUrl}
                variant="ghost"
              >
                <BtnContent icon="refresh-outline" label="Reconnect (new OAuth flow)" color="rgba(255,255,255,0.65)" />
              </ActionBtn>
            </View>
          </>
        ) : (
          <View style={ss.col}>
            <Text style={ss.hintText}>
              Tap <Text style={ss.strong}>Start OAuth</Text> to open the cTrader authorization flow. The redirect URI above must match your cTrader Open API app settings.
            </Text>
            <ActionBtn
              onClick={startOAuth}
              loading={oauthLoading}
              disabled={!config?.configured || !config?.authUrl}
            >
              <BtnContent
                icon="flash-outline"
                label={oauthLoading ? "Waiting for OAuth…" : "Start OAuth →"}
                color="#60a5fa"
              />
            </ActionBtn>
          </View>
        )}
      </StepCard>

      {/* ── Step 3: Accounts ── */}
      <StepCard icon={STEP_ICON.accounts!} title="Step 3 — Account List" state={stepStates.accounts!}>
        {!oaStatus?.connected ? (
          <Text style={ss.dimText}>Complete Step 2 first.</Text>
        ) : (
          <>
            <ActionBtn onClick={fetchAccounts} loading={accountsLoading}>
              <BtnContent icon="people-outline" label="Fetch Accounts" color="#60a5fa" />
            </ActionBtn>

            {accounts?.error && (
              <View style={ss.errorBox}>
                <Text style={ss.errorBoxTextRed}>❌ {accounts.error}</Text>
              </View>
            )}

            {accounts?.ok && Array.isArray(accounts.accounts) && accounts.accounts.length > 0 && (
              <View style={ss.col}>
                <View style={ss.accountsHeaderRow}>
                  <Text style={ss.sectionLabel}>
                    {accounts.accounts.length} Account{accounts.accounts.length !== 1 ? "s" : ""} Found
                  </Text>
                  {accounts.accounts.length === 1 && (
                    <View style={ss.autoSelectedBadge}>
                      <Text style={ss.autoSelectedText}>Auto-selected</Text>
                    </View>
                  )}
                </View>

                {accounts.accounts.map(acct => {
                  const id = String(acct.ctidTraderAccountId);
                  const isSelected = accountIdInput === id;
                  const displayBalance = acct.balance != null
                    ? `${(acct.balance / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${acct.depositCurrency ?? ""}`
                    : null;

                  return (
                    <View
                      key={acct.ctidTraderAccountId}
                      style={[
                        ss.accountCard,
                        { borderColor: isSelected ? "rgba(96,165,250,0.40)" : "rgba(255,255,255,0.08)" },
                        { backgroundColor: isSelected ? "rgba(96,165,250,0.07)" : "rgba(255,255,255,0.02)" },
                      ]}
                    >
                      {/* Card header */}
                      <View style={ss.accountCardHeader}>
                        <View style={ss.accountCardHeaderInner}>
                          <View style={ss.accountTitleRow}>
                            <Text style={ss.accountLogin}>
                              {acct.traderLogin ?? acct.ctidTraderAccountId}
                            </Text>
                            <View style={[
                              ss.livedemoBadge,
                              {
                                backgroundColor: acct.isLive ? "rgba(239,68,68,0.14)" : "rgba(59,130,246,0.14)",
                                borderColor: acct.isLive ? "rgba(239,68,68,0.28)" : "rgba(59,130,246,0.28)",
                              },
                            ]}>
                              <Text style={[ss.livedemoBadgeText, { color: acct.isLive ? "#f87171" : "#60a5fa" }]}>
                                {acct.isLive ? "LIVE" : "DEMO"}
                              </Text>
                            </View>
                            {isSelected && (
                              <View style={ss.selectedBadge}>
                                <Ionicons name="checkmark-circle" size={9} color="#34d399" />
                                <Text style={ss.selectedBadgeText}>Selected</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>

                      {/* Card body — field grid (2-column) */}
                      <View style={ss.accountFieldGrid}>
                        <View style={ss.accountFieldHalf}>
                          <Text style={ss.fieldLabel}>Account ID</Text>
                          <Text style={ss.fieldValueMono}>{acct.ctidTraderAccountId}</Text>
                        </View>
                        <View style={ss.accountFieldHalf}>
                          <Text style={ss.fieldLabel}>Type</Text>
                          <Text style={[ss.fieldValue, { color: acct.isLive ? "#f87171" : "#60a5fa" }]}>
                            {acct.isLive ? "Live" : "Demo"}
                          </Text>
                        </View>
                        {acct.brokerName && (
                          <View style={ss.accountFieldFull}>
                            <Text style={ss.fieldLabel}>Broker</Text>
                            <Text style={ss.fieldValue}>{acct.brokerName}</Text>
                          </View>
                        )}
                        {acct.depositCurrency && (
                          <View style={ss.accountFieldHalf}>
                            <Text style={ss.fieldLabel}>Currency</Text>
                            <Text style={ss.fieldValue}>{acct.depositCurrency}</Text>
                          </View>
                        )}
                        {acct.leverage != null && (
                          <View style={ss.accountFieldHalf}>
                            <Text style={ss.fieldLabel}>Leverage</Text>
                            <Text style={ss.fieldValue}>1:{acct.leverage}</Text>
                          </View>
                        )}
                        {displayBalance && (
                          <View style={acct.leverage == null ? ss.accountFieldFull : ss.accountFieldHalf}>
                            <Text style={ss.fieldLabel}>Balance</Text>
                            <Text style={[ss.fieldValueMono, { color: "#34d399", fontWeight: "700" }]}>{displayBalance}</Text>
                          </View>
                        )}
                      </View>

                      {/* Select button */}
                      <View style={ss.accountCardFooter}>
                        <Pressable
                          onPress={() => {
                            setAccountIdInput(id);
                            setSelectedIsLive(acct.isLive);
                          }}
                          disabled={isSelected}
                          style={[
                            ss.selectBtn,
                            {
                              backgroundColor: isSelected ? "rgba(16,185,129,0.10)" : "rgba(96,165,250,0.14)",
                              borderColor: isSelected ? "rgba(16,185,129,0.28)" : "rgba(96,165,250,0.30)",
                            },
                          ]}
                        >
                          <Ionicons
                            name={isSelected ? "checkmark-circle" : "person-circle-outline"}
                            size={13}
                            color={isSelected ? "#34d399" : "#60a5fa"}
                          />
                          <Text style={[ss.selectBtnText, { color: isSelected ? "#34d399" : "#60a5fa" }]}>
                            {isSelected ? "Selected" : "Select Account"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {accounts?.ok && Array.isArray(accounts.accounts) && accounts.accounts.length === 0 && (
              <View style={ss.emptyBox}>
                <Text style={ss.emptyText}>No trading accounts found for this OAuth token.</Text>
              </View>
            )}
          </>
        )}
      </StepCard>

      {/* ── Step 4: Symbol List ── */}
      <StepCard icon={STEP_ICON.symbols!} title="Step 4 — Fetch & Wire Symbols" state={stepStates.symbols!}>
        {!oaStatus?.connected ? (
          <Text style={ss.dimText}>Complete Step 2 first.</Text>
        ) : (
          <>
            <View style={ss.symbolInputRow}>
              <TextInput
                placeholder="ctidTraderAccountId"
                placeholderTextColor="rgba(255,255,255,0.30)"
                value={accountIdInput}
                onChangeText={setAccountIdInput}
                onSubmitEditing={() => fetchSymbols()}
                keyboardType="numeric"
                returnKeyType="search"
                style={ss.accountInput}
              />
              <Pressable
                onPress={() => setSelectedIsLive(v => !v)}
                style={[
                  ss.liveToggle,
                  {
                    backgroundColor: selectedIsLive ? "rgba(239,68,68,0.12)" : "rgba(59,130,246,0.12)",
                    borderColor: selectedIsLive ? "rgba(239,68,68,0.25)" : "rgba(59,130,246,0.25)",
                  },
                ]}
              >
                <Text style={[ss.liveToggleText, { color: selectedIsLive ? "#f87171" : "#60a5fa" }]}>
                  {selectedIsLive ? "LIVE" : "DEMO"}
                </Text>
              </Pressable>
              <ActionBtn onClick={() => fetchSymbols()} loading={symbolsLoading} disabled={!accountIdInput.trim()}>
                <BtnContent icon="book-outline" label="Fetch" color="#60a5fa" />
              </ActionBtn>
            </View>

            {symbols && (
              <>
                <View style={ss.actionsRow}>
                  <CWBadge
                    label={symbols.ok ? "ProtoOA OK" : "Failed"}
                    color={symbols.ok ? "#34d399" : "#f87171"}
                    bg={symbols.ok ? "rgba(16,185,129,0.10)" : "rgba(239,68,68,0.10)"}
                  />
                  {symbols.ok && symbols.totalSymbols !== undefined && (
                    <CWBadge label={`${symbols.totalSymbols} symbols`} color="#60a5fa" bg="rgba(59,130,246,0.10)" dot={false} />
                  )}
                  {symbols.durationMs !== undefined && (
                    <CWBadge label={`${symbols.durationMs}ms`} color="#fbbf24" bg="rgba(245,158,11,0.10)" dot={false} />
                  )}
                  {symbols.ok && (symbols.totalSymbols ?? 0) > 0 && !wiredCount && (
                    <ActionBtn onClick={wireSymbols} loading={wireLoading} variant="success">
                      <BtnContent icon="power-outline" label="Wire to Watchlist" color="#34d399" />
                    </ActionBtn>
                  )}
                  {wiredCount && (
                    <CWBadge label={`✓ Wired ${wiredCount} → Watchlist`} color="#34d399" bg="rgba(16,185,129,0.10)" dot={false} />
                  )}
                </View>
                {symbols.error && (
                  <View style={ss.errorBox}>
                    <Text style={ss.errorBoxTextRed}>❌ {symbols.error}</Text>
                  </View>
                )}
                {symbols.ok && symbols.first20 && symbols.first20.length > 0 && (
                  <View style={ss.col}>
                    <Text style={ss.sectionLabel}>
                      First {symbols.first20.length} Symbols
                      {(symbols.totalSymbols ?? 0) > symbols.first20.length ? ` (of ${symbols.totalSymbols} total)` : ""}
                    </Text>
                    <View style={ss.symbolTable}>
                      {/* Header row */}
                      <View style={[ss.symbolTableRow, ss.symbolTableHeader]}>
                        {["Symbol", "Digits", "ID"].map(h => (
                          <Text
                            key={h}
                            style={[ss.sectionLabel, h === "Symbol" ? { flex: 1 } : { width: 60 }]}
                          >
                            {h}
                          </Text>
                        ))}
                      </View>
                      {/* Data rows */}
                      {symbols.first20.map((s, i) => (
                        <View
                          key={s.symbolId}
                          style={[
                            ss.symbolTableRow,
                            { backgroundColor: i % 2 === 0 ? "rgba(0,0,0,0.15)" : "transparent" },
                          ]}
                        >
                          <Text style={[ss.symbolName, { flex: 1 }]}>{s.symbolName}</Text>
                          <Text style={[ss.symbolMeta, { width: 60 }]}>{s.digits}</Text>
                          <Text style={[ss.symbolId, { width: 60 }]}>{s.symbolId}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </StepCard>

      {/* ── Verbose Log ── */}
      <View style={ss.logContainer}>
        <Pressable onPress={() => setLogOpen(v => !v)} style={ss.logHeader}>
          <Text style={ss.logHeaderLabel}>Verbose Log</Text>
          <View style={ss.logHeaderRight}>
            <Text style={ss.logCount}>{logs.length} entries</Text>
            <Ionicons
              name={logOpen ? "chevron-down" : "chevron-forward"}
              size={13}
              color="rgba(148,163,184,0.40)"
            />
          </View>
        </Pressable>
        {logOpen && (
          <View>
            {/* RN: ScrollView replaces overflowY:"auto" div */}
            <ScrollView
              ref={logsScrollRef}
              style={ss.logScroll}
              contentContainerStyle={ss.logScrollContent}
              onContentSizeChange={() => logsScrollRef.current?.scrollToEnd({ animated: false })}
            >
              {logs.length === 0 && (
                <Text style={ss.logEmpty}>No log entries yet…</Text>
              )}
              {logs.map((entry, i) => (
                <View key={i} style={ss.logEntry}>
                  <Text style={ss.logTime}>{fmtTime(entry.ts)}</Text>
                  <Text style={[ss.logLevel, { color: LOG_COLORS[entry.level], minWidth: 44 }]}>
                    {entry.level.toUpperCase()}
                  </Text>
                  <Text style={[ss.logMsg, { color: LOG_COLORS[entry.level] }]}>{entry.msg}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={ss.logFooter}>
              <Pressable onPress={() => setLogs([])} hitSlop={8}>
                <Text style={ss.logClearBtn}>Clear</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "column",
    gap: 16,
    width: "100%",
  },
  // Banners
  bannerNeutral: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(148,163,184,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  bannerNeutralText: {
    fontSize: 12,
    color: "rgba(148,163,184,0.60)",
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  bannerSuccess: {
    backgroundColor: "rgba(16,185,129,0.06)",
    borderColor: "rgba(16,185,129,0.20)",
  },
  bannerWarn: {
    backgroundColor: "rgba(245,158,11,0.05)",
    borderColor: "rgba(245,158,11,0.18)",
  },
  bannerLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  statusConnected: {
    backgroundColor: "rgba(16,185,129,0.07)",
    borderColor: "rgba(16,185,129,0.20)",
  },
  statusDisconnected: {
    backgroundColor: "rgba(148,163,184,0.05)",
    borderColor: "rgba(255,255,255,0.08)",
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  expiryText: {
    fontSize: 10,
    color: "rgba(148,163,184,0.45)",
    marginLeft: "auto",
  },
  // Diagnostics grid
  diagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.20)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    gap: 8,
  },
  diagItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    width: "33.33%",
  },
  diagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  diagLabel: {
    fontSize: 10,
    fontFamily: MONO,
    flex: 1,
  },
  // Actions row
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  // Cards
  card: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  stepIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.85)",
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
    flexDirection: "column",
  },
  // MonoBox
  monoBoxOuter: {
    gap: 4,
  },
  monoBoxLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.0,
    textTransform: "uppercase",
    color: "rgba(148,163,184,0.45)",
  },
  monoBoxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderRadius: 8,
    padding: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  monoBoxValue: {
    flex: 1,
    fontSize: 11,
    fontFamily: MONO,
    color: "rgba(255,255,255,0.70)",
    lineHeight: 17,
  },
  // Badge
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 99,
    borderWidth: 1,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  // ActionBtn
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 9,
    borderWidth: 1,
  },
  actionBtnInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  btnContentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  // Loading row
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: "rgba(148,163,184,0.55)",
  },
  // Error box
  errorBox: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: "rgba(239,68,68,0.07)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.18)",
  },
  errorBoxText: {
    fontSize: 11,
    lineHeight: 18,
    color: "rgba(255,255,255,0.70)",
  },
  errorBoxTextRed: {
    fontSize: 11,
    lineHeight: 18,
    color: "#f87171",
  },
  codeInline: {
    fontFamily: MONO,
    fontSize: 11,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 4,
    paddingHorizontal: 3,
  },
  // Hint text
  hintText: {
    margin: 0,
    fontSize: 12,
    color: "rgba(148,163,184,0.60)",
    lineHeight: 19,
  },
  strong: {
    fontWeight: "700",
    color: "rgba(255,255,255,0.80)",
  },
  dimText: {
    fontSize: 12,
    color: "rgba(148,163,184,0.50)",
  },
  col: {
    flexDirection: "column",
    gap: 8,
  },
  // Account list
  accountsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.0,
    textTransform: "uppercase",
    color: "rgba(148,163,184,0.45)",
  },
  autoSelectedBadge: {
    paddingVertical: 1,
    paddingHorizontal: 7,
    borderRadius: 99,
    backgroundColor: "rgba(16,185,129,0.10)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.22)",
  },
  autoSelectedText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#34d399",
  },
  // Account card
  accountCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  accountCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 11,
    paddingBottom: 9,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  accountCardHeaderInner: {
    flex: 1,
    minWidth: 0,
  },
  accountTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  },
  accountLogin: {
    fontSize: 14,
    fontWeight: "700",
    color: "rgba(255,255,255,0.92)",
    fontFamily: MONO,
    letterSpacing: -0.1,
  },
  livedemoBadge: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 99,
    borderWidth: 1,
  },
  livedemoBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  selectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 99,
    backgroundColor: "rgba(16,185,129,0.12)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.28)",
  },
  selectedBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#34d399",
  },
  // Account field grid
  accountFieldGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 7,
    rowGap: 7,
  },
  accountFieldHalf: {
    width: "48%",
  },
  accountFieldFull: {
    width: "100%",
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: "rgba(148,163,184,0.38)",
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "600",
  },
  fieldValueMono: {
    fontSize: 12,
    fontFamily: MONO,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "600",
  },
  accountCardFooter: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    width: "100%",
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    fontSize: 13,
    fontWeight: "700",
  } as any,
  selectBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  // Empty
  emptyBox: {
    padding: 12,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 12,
    color: "rgba(148,163,184,0.45)",
  },
  // Symbol list
  symbolInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  accountInput: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    fontSize: 12,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.80)",
    fontFamily: MONO,
  },
  liveToggle: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    borderWidth: 1,
  },
  liveToggleText: {
    fontSize: 11,
    fontWeight: "600",
  },
  symbolTable: {
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  symbolTableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.03)",
  },
  symbolTableHeader: {
    backgroundColor: "rgba(0,0,0,0.30)",
    paddingVertical: 6,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  symbolName: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.82)",
    fontFamily: MONO,
  },
  symbolMeta: {
    fontSize: 11,
    color: "rgba(148,163,184,0.70)",
    fontFamily: MONO,
  },
  symbolId: {
    fontSize: 10,
    color: "rgba(148,163,184,0.40)",
    fontFamily: MONO,
  },
  // Log
  logContainer: {
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  logHeaderLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "rgba(148,163,184,0.50)",
  },
  logHeaderRight: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  logCount: {
    fontSize: 10,
    color: "rgba(148,163,184,0.35)",
  },
  logScroll: {
    maxHeight: 260,
  },
  logScrollContent: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 3,
  },
  logEmpty: {
    color: "rgba(148,163,184,0.30)",
    fontSize: 11,
    fontFamily: MONO,
  },
  logEntry: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  logTime: {
    color: "rgba(148,163,184,0.30)",
    flexShrink: 0,
    fontSize: 10,
    fontFamily: MONO,
    paddingTop: 1,
  },
  logLevel: {
    flexShrink: 0,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontFamily: MONO,
    paddingTop: 1,
  },
  logMsg: {
    flex: 1,
    fontSize: 11,
    fontFamily: MONO,
    lineHeight: 17,
  },
  logFooter: {
    paddingTop: 4,
    paddingBottom: 8,
    paddingHorizontal: 14,
    alignItems: "flex-end",
  },
  logClearBtn: {
    fontSize: 10,
    color: "rgba(148,163,184,0.40)",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 5,
  },
});
