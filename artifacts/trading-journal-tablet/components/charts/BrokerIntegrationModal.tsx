/**
 * BrokerIntegrationModal — React Native port (Phase 9.24 Pass A)
 *
 * Migrated from src/components/charts/BrokerIntegrationModal.tsx
 *
 * Web → RN changes:
 *   createPortal(modal, document.body) → Modal (transparent, slide animationType)
 *   document.body.style.overflow       → removed (no body scroll lock needed in RN)
 *   window.addEventListener("keydown") → removed (no keyboard event in RN)
 *   window.history.pushState /
 *     window.addEventListener("popstate") → BackHandler (react-native)
 *   <style> CSS @keyframes             → removed (Pass A; sheet slides via animationType)
 *   overflowY:"auto"/overscrollBehavior → ScrollView
 *   WebkitOverflowScrolling            → removed
 *   <form onSubmit>                    → View + Pressable
 *   <input type="text/password">       → TextInput
 *   <button>                           → Pressable
 *   <div>/<span>/<p>                   → View/Text
 *   Lucide icons                       → Ionicons (@expo/vector-icons)
 *   Loader2 className="animate-spin"   → ActivityIndicator
 *   localStorage.setItem               → AsyncStorage
 *   cursor/outline/transition/         → removed
 *     boxSizing/whiteSpace/touchAction
 *   env(safe-area-inset-bottom)        → useSafeAreaInsets().bottom
 *   BrokerListContent import           → @/components/broker/BrokerSelectBottomSheet
 *   relative fetch URLs                → getApiBase() + path
 *   height:"calc(100dvh - 44px)"       → useWindowDimensions().height - 44
 *
 * Exports (unchanged):
 *   BrokerIntegrationModal (named export)
 */
import { useState, useEffect, useCallback } from "react";
import {
  View, Text, Pressable, TextInput, ScrollView,
  Modal, BackHandler, ActivityIndicator, StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ShieldCheck, Server, Wifi, Zap, Globe, CheckCircle2,
  Eye, EyeOff, XCircle, RefreshCw, ChevronLeft, X,
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CtraderWidget } from "@/components/charts/CtraderWidget";
import { BrokerListContent } from "@/components/broker/BrokerSelectBottomSheet";
import { DeltaApiConnectForm } from "@/components/broker/DeltaApiConnectForm";
import { BrokerLogo } from "@/components/broker/BrokerLogos";
import { BROKERS } from "@/types/broker";
import { useBrokerStore } from "@/store/brokerStore";
import { getApiBase } from "@/lib/apiBase";
import type { BrokerId } from "@/types/broker";

// ── Types ──────────────────────────────────────────────────────────────────────
type BrokerTab    = "ctrader" | "delta" | "fusion";
type ActiveBroker = "delta" | "mt5" | null;

type LucideIcon = React.ComponentType<{ size: number; color: string }>;
const TABS: { id: BrokerTab; label: string; Icon: LucideIcon; badge?: string }[] = [
  { id: "ctrader", label: "cTrader", Icon: Wifi              },
  { id: "delta",   label: "Delta",   Icon: Zap,   badge: "Δ" },
  { id: "fusion",  label: "Fusion",  Icon: Globe             },
];

// ── Security badges ────────────────────────────────────────────────────────────
function SecurityBadges() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
      {([
        { Icon: ShieldCheck, label: "AES-256 encrypted"   },
        { Icon: Server,      label: "Backend-only signing" },
        { Icon: Wifi,        label: "Live WS sync"         },
      ] as { Icon: LucideIcon; label: string }[]).map((item, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <item.Icon size={13} color="rgba(0,255,180,0.7)" />
          <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Success banner ─────────────────────────────────────────────────────────────
function SuccessBanner({ brokerName, onBack }: { brokerName: string; onBack: () => void }) {
  return (
    <View style={{
      flexDirection:  "column",
      alignItems:     "center",
      gap:            16,
      padding:        40,
      paddingHorizontal: 24,
    }}>
      <View style={{
        width:           64,
        height:          64,
        borderRadius:    32,
        backgroundColor: "rgba(0,255,180,0.1)",
        borderWidth:     1.5,
        borderColor:     "rgba(0,255,180,0.3)",
        justifyContent:  "center",
        alignItems:      "center",
      }}>
        <CheckCircle2 size={32} color="#00FFB4" />
      </View>
      <View style={{ alignItems: "center" }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: "#00FFB4" }}>
          Connected to {brokerName}
        </Text>
        <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
          Syncing positions, orders &amp; balance…
        </Text>
      </View>
      <Pressable
        onPress={onBack}
        style={{
          marginTop:       8,
          paddingVertical: 8,
          paddingHorizontal: 20,
          borderRadius:    10,
          backgroundColor: "rgba(0,255,180,0.1)",
          borderWidth:     1,
          borderColor:     "rgba(0,255,180,0.25)",
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "500", color: "#00FFB4" }}>Done</Text>
      </Pressable>
    </View>
  );
}

// ── Inline Delta form ──────────────────────────────────────────────────────────
function InlineDeltaForm({ onBack }: { onBack: () => void }) {
  const [done, setDone] = useState(false);
  if (done) return <SuccessBanner brokerName="Delta Exchange" onBack={onBack} />;
  return (
    <View style={{ padding: 20, paddingBottom: 32 }}>
      <SecurityBadges />
      <DeltaApiConnectForm
        onSuccess={() => setDone(true)}
        onError={() => {/* DeltaApiConnectForm shows its own error UI */}}
      />
    </View>
  );
}

// ── Inline MT5 form ────────────────────────────────────────────────────────────
type Mt5Status = "idle" | "loading" | "success" | "error";

function InlineMt5Form({ onBack: _onBack }: { onBack: () => void }) {
  const { loadAccounts, connect } = useBrokerStore();
  const [status,   setStatus]   = useState<Mt5Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [server,   setServer]   = useState("");
  const [login,    setLogin]    = useState("");
  const [password, setPassword] = useState("");
  const [label,    setLabel]    = useState("");
  const [showPass, setShowPass] = useState(false);

  const BASE = getApiBase();

  async function handleSubmit() {
    if (!server.trim() || !login.trim() || !password.trim()) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch(`${BASE}/api/broker-accounts`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          broker_id:    "mt5",
          mt5_server:   server.trim(),
          mt5_login:    login.trim(),
          mt5_password: password.trim(),
          label:        label.trim() || "MT5 Account",
        }),
      });
      const data = await res.json() as {
        ok: boolean;
        account?: { id: string; [k: string]: unknown };
        api_token?: string;
        error?: string;
      };
      if (!data.ok || !data.account || !data.api_token) {
        setStatus("error");
        setErrorMsg(data.error ?? "Connection failed");
        return;
      }
      try {
        await AsyncStorage.setItem(`tj_broker_token_${data.account.id}`, data.api_token);
      } catch { /* ignore */ }
      setStatus("success");
      await loadAccounts();
      setTimeout(() => {
        connect({ ...data.account!, api_token: data.api_token! } as unknown as Parameters<typeof connect>[0]);
      }, 1200);
    } catch (err) {
      setStatus("error");
      setErrorMsg(String(err));
    }
  }

  if (status === "success") return <SuccessBanner brokerName="MetaTrader 5" onBack={_onBack} />;

  const isLoading = status === "loading";

  const inputBase = {
    height:          40,
    borderRadius:    9,
    fontSize:        13,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.10)",
    color:           "#fff" as const,
    fontFamily:      "Courier New" as const,
    paddingHorizontal: 12,
    width:           "100%" as any,
  };

  return (
    <View style={{ padding: 20, paddingBottom: 32 }}>
      <SecurityBadges />
      <View style={{ gap: 14 }}>
        <View style={{ gap: 10 }}>

          {/* Server */}
          <View style={{ gap: 5 }}>
            <Text style={s.fieldLabel}>Server</Text>
            <TextInput
              value={server}
              onChangeText={setServer}
              placeholder="e.g. MetaQuotes-Demo"
              placeholderTextColor="rgba(255,255,255,0.25)"
              editable={!isLoading}
              style={inputBase}
            />
          </View>

          {/* Login */}
          <View style={{ gap: 5 }}>
            <Text style={s.fieldLabel}>Login</Text>
            <TextInput
              value={login}
              onChangeText={setLogin}
              placeholder="Account number"
              placeholderTextColor="rgba(255,255,255,0.25)"
              editable={!isLoading}
              style={inputBase}
            />
          </View>

          {/* Password */}
          <View style={{ gap: 5 }}>
            <Text style={s.fieldLabel}>Password</Text>
            <View style={{
              flexDirection: "row", alignItems: "center",
              ...inputBase, paddingHorizontal: 0,
            }}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Account password"
                placeholderTextColor="rgba(255,255,255,0.25)"
                secureTextEntry={!showPass}
                editable={!isLoading}
                style={{
                  flex: 1, height: 40, color: "#fff",
                  fontFamily: "Courier New", fontSize: 13,
                  paddingHorizontal: 12,
                }}
              />
              <Pressable
                onPress={() => setShowPass(!showPass)}
                style={{ paddingRight: 10 }}
              >
                <Ionicons
                  name={showPass ? "eye-off" : "eye"}
                  size={14}
                  color="rgba(255,255,255,0.4)"
                />
              </Pressable>
            </View>
          </View>

          {/* Label (optional) */}
          <View style={{ gap: 5 }}>
            <Text style={s.fieldLabel}>
              Label <Text style={{ color: "rgba(255,255,255,0.25)" }}>(optional)</Text>
            </Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="My MT5 Account"
              placeholderTextColor="rgba(255,255,255,0.25)"
              editable={!isLoading}
              style={inputBase}
            />
          </View>
        </View>

        {status === "error" && (
          <View style={{
            gap:             8,
            padding:         16,
            paddingVertical: 12,
            borderRadius:    10,
            backgroundColor: "rgba(239,68,68,0.08)",
            borderWidth:     1,
            borderColor:     "rgba(239,68,68,0.2)",
          }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <Ionicons name="close-circle" size={15} color="#EF4444" style={{ marginTop: 1, flexShrink: 0 } as any} />
              <Text style={{ fontSize: 13, color: "#EF4444", lineHeight: 20 }}>{errorMsg}</Text>
            </View>
          </View>
        )}

        <View style={{ flexDirection: "row", gap: 10 }}>
          {status === "error" && (
            <Pressable
              onPress={() => { setStatus("idle"); setErrorMsg(""); }}
              style={{
                flexDirection:   "row",
                alignItems:      "center",
                gap:             6,
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius:    10,
                backgroundColor: "rgba(255,255,255,0.05)",
                borderWidth:     1,
                borderColor:     "rgba(255,255,255,0.08)",
              }}
            >
              <Ionicons name="refresh" size={13} color="rgba(255,255,255,0.6)" />
              <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Retry</Text>
            </Pressable>
          )}
          <Pressable
            onPress={handleSubmit}
            disabled={isLoading}
            style={{
              flex:            1,
              flexDirection:   "row",
              alignItems:      "center",
              justifyContent:  "center",
              gap:             8,
              paddingVertical: 14,
              borderRadius:    12,
              backgroundColor: isLoading
                ? "rgba(34,197,94,0.2)"
                : "#22C55E",
            }}
          >
            {isLoading ? (
              <>
                <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
                <Text style={{ fontSize: 14, fontWeight: "600", color: "rgba(255,255,255,0.4)" }}>
                  Connecting…
                </Text>
              </>
            ) : (
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }}>
                Connect MT5
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ── Fusion placeholder ─────────────────────────────────────────────────────────
function FusionTabContent() {
  return (
    <View style={{
      flexDirection:   "column",
      alignItems:      "center",
      justifyContent:  "center",
      padding:         60,
      paddingHorizontal: 24,
      gap:             14,
    }}>
      <View style={{
        width:           52,
        height:          52,
        borderRadius:    16,
        justifyContent:  "center",
        alignItems:      "center",
        backgroundColor: "rgba(96,165,250,0.08)",
        borderWidth:     1,
        borderColor:     "rgba(96,165,250,0.18)",
      }}>
        <Ionicons name="globe-outline" size={22} color="#60a5fa" />
      </View>
      <View style={{ alignItems: "center" }}>
        <Text style={{ marginBottom: 6, fontSize: 15, fontWeight: "700", color: "rgba(255,255,255,0.82)" }}>
          Fusion Markets
        </Text>
        <Text style={{ fontSize: 12, color: "rgba(148,163,184,0.50)", lineHeight: 20, textAlign: "center" }}>
          Integration coming soon.{"\n"}Fusion Markets support will appear here when available.
        </Text>
      </View>
      <View style={{
        paddingVertical:   5,
        paddingHorizontal: 14,
        borderRadius:      99,
        backgroundColor:   "rgba(96,165,250,0.08)",
        borderWidth:       1,
        borderColor:       "rgba(96,165,250,0.16)",
      }}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: "#60a5fa" }}>Coming Soon</Text>
      </View>
    </View>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────
interface BrokerIntegrationModalProps {
  onClose:      () => void;
  initialTab?:  BrokerTab;
}

export function BrokerIntegrationModal({ onClose, initialTab = "ctrader" }: BrokerIntegrationModalProps) {
  const [activeTab,    setActiveTab]    = useState<BrokerTab>(initialTab);
  const [activeBroker, setActiveBroker] = useState<ActiveBroker>(null);

  const { loadAccounts }              = useBrokerStore();
  const insets                        = useSafeAreaInsets();
  const { height: screenHeight }      = useWindowDimensions();

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  // Android hardware back button: navigate back within the stack, or close
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (activeBroker) { setActiveBroker(null); return true; }
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [activeBroker, onClose]);

  // Called by BrokerListContent "Connect X" button — navigate into the form
  const handleConnectBroker = useCallback((brokerId: string) => {
    setActiveBroker(brokerId as ActiveBroker);
  }, []);

  const goBack = useCallback(() => setActiveBroker(null), []);

  // Broker info for the form header
  const brokerInfo = activeBroker ? BROKERS.find(b => b.id === activeBroker) : null;

  const sheetHeight = screenHeight - 44;

  return (
    <Modal
      visible={true}
      transparent={true}
      statusBarTranslucent={true}
      animationType="slide"
      onRequestClose={() => {
        if (activeBroker) setActiveBroker(null);
        else onClose();
      }}
    >
      <View style={StyleSheet.absoluteFill}>
        {/* ── Backdrop ── */}
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.60)" }]}
          onPress={() => {
            if (activeBroker) setActiveBroker(null);
            else onClose();
          }}
        />

        {/* ── Sheet (anchored to bottom) ── */}
        <View
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, { justifyContent: "flex-end" }]}
        >
          <View style={{
            height:          sheetHeight,
            backgroundColor: "#0b0f14",
            borderTopLeftRadius:  20,
            borderTopRightRadius: 20,
            borderWidth:     1,
            borderBottomWidth: 0,
            borderColor:     "rgba(255,255,255,0.09)",
            overflow:        "hidden",
          }}>

            {/* ── Drag handle ── */}
            <View style={{ justifyContent: "center", alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)" }} />
            </View>

            {/* ── Header — morphs between list and form views ── */}
            <View style={{
              flexDirection:     "row",
              alignItems:        "center",
              padding:           16,
              paddingVertical:   10,
              paddingBottom:     12,
              borderBottomWidth: 1,
              borderBottomColor: "rgba(255,255,255,0.07)",
              gap:               10,
            }}>
              {/* Back button (form view only) */}
              {activeBroker && (
                <Pressable
                  onPress={goBack}
                  style={{
                    width:           34,
                    height:          34,
                    borderRadius:    10,
                    flexShrink:      0,
                    justifyContent:  "center",
                    alignItems:      "center",
                    backgroundColor: "rgba(255,255,255,0.07)",
                    borderWidth:     1,
                    borderColor:     "rgba(255,255,255,0.10)",
                  }}
                >
                  <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.70)" />
                </Pressable>
              )}

              {/* Title */}
              <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 }}>
                {activeBroker && brokerInfo && (
                  <View style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    justifyContent: "center", alignItems: "center", overflow: "hidden",
                  }}>
                    <BrokerLogo brokerId={activeBroker as BrokerId} size={28} />
                  </View>
                )}
                <View style={{ minWidth: 0 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: "rgba(255,255,255,0.92)" }}>
                    {activeBroker && brokerInfo ? `Connect ${brokerInfo.name}` : "Broker Integrations"}
                  </Text>
                  <Text style={{ fontSize: 11, color: "rgba(148,163,184,0.38)", marginTop: 1 }}>
                    {activeBroker && brokerInfo
                      ? brokerInfo.description
                      : "Closing keeps your connections active"}
                  </Text>
                </View>
              </View>

              {/* Close button — always visible, closes the entire sheet */}
              <Pressable
                onPress={onClose}
                style={{
                  width:           34,
                  height:          34,
                  borderRadius:    10,
                  flexShrink:      0,
                  justifyContent:  "center",
                  alignItems:      "center",
                  backgroundColor: "rgba(255,255,255,0.07)",
                  borderWidth:     1,
                  borderColor:     "rgba(255,255,255,0.10)",
                }}
              >
                <Ionicons name="close" size={15} color="rgba(255,255,255,0.55)" />
              </Pressable>
            </View>

            {/* ── Tabs (list view only) ── */}
            {!activeBroker && (
              <View style={{ paddingHorizontal: 14, paddingTop: 10 }}>
                <View style={{
                  flexDirection:   "row",
                  backgroundColor: "rgba(255,255,255,0.05)",
                  borderRadius:    10,
                  padding:         3,
                  borderWidth:     1,
                  borderColor:     "rgba(255,255,255,0.07)",
                  marginBottom:    10,
                  gap:             2,
                }}>
                  {TABS.map(tab => {
                    const active = tab.id === activeTab;
                    return (
                      <Pressable
                        key={tab.id}
                        onPress={() => setActiveTab(tab.id)}
                        style={{
                          flex:            1,
                          flexDirection:   "row",
                          alignItems:      "center",
                          justifyContent:  "center",
                          gap:             5,
                          paddingVertical: 8,
                          paddingHorizontal: 6,
                          borderRadius:    7,
                          backgroundColor: active ? "rgba(245,158,11,0.15)" : "transparent",
                          borderWidth:     active ? 1 : 0,
                          borderColor:     active ? "rgba(245,158,11,0.25)" : "transparent",
                        }}
                      >
                        <Ionicons
                          name={tab.iconName as any}
                          size={12}
                          color={active ? "#f59e0b" : "rgba(148,163,184,0.38)"}
                        />
                        <Text style={{
                          fontSize:   12,
                          fontWeight: active ? "700" : "500",
                          color:      active ? "#f0c060" : "rgba(148,163,184,0.45)",
                        }}>
                          {tab.label}
                        </Text>
                        {tab.badge && (
                          <View style={{
                            paddingVertical:   1,
                            paddingHorizontal: 3,
                            borderRadius:      4,
                            backgroundColor:   active ? "rgba(245,158,11,0.12)" : "rgba(148,163,184,0.06)",
                            borderWidth:       1,
                            borderColor:       active ? "rgba(245,158,11,0.22)" : "rgba(148,163,184,0.08)",
                          }}>
                            <Text style={{
                              fontSize:   8.5,
                              fontWeight: "700",
                              color:      active ? "#f59e0b" : "rgba(148,163,184,0.28)",
                            }}>
                              {tab.badge}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.06)", marginHorizontal: -14 }} />
              </View>
            )}

            {/* ── Scrollable content ── */}
            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* ── Form view (stack level 2) ── */}
              {activeBroker === "delta" && <InlineDeltaForm onBack={goBack} />}
              {activeBroker === "mt5"   && <InlineMt5Form   onBack={goBack} />}

              {/* ── List view (stack level 1) ── */}
              {!activeBroker && (
                <View style={{ padding: 14, width: "100%" }}>
                  {activeTab === "ctrader" && <CtraderWidget />}
                  {activeTab === "delta"   && (
                    <BrokerListContent
                      onClose={onClose}
                      onConnectBroker={handleConnectBroker}
                    />
                  )}
                  {activeTab === "fusion"  && <FusionTabContent />}
                </View>
              )}

              {/* Safe-area spacer */}
              <View style={{ height: Math.max(20, insets.bottom) }} />
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  fieldLabel: {
    fontSize:      11,
    fontWeight:    "600",
    color:         "rgba(255,255,255,0.45)",
    letterSpacing: 0.66,
  },
});
