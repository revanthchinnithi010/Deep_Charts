/**
 * BuySellPanel — React Native port (Phase 9.24 Pass A)
 *
 * Migrated from src/components/charts/BuySellPanel.tsx
 *
 * Web → RN changes:
 *   <div>/<span>/<button>/<input> → View/Text/Pressable/TextInput
 *   React.CSSProperties           → ViewStyle / TextStyle (inline)
 *   linear-gradient background    → LinearGradient (expo-linear-gradient)
 *   fontFamily: "monospace"       → "Courier New"
 *   onMouseEnter/Leave            → removed (no hover on touch)
 *   onFocus/onBlur border change  → focusedInput state
 *   cursor / outline / transition → removed
 *   fmtPrice from LiveMarketCtx   → @/lib/fmtPrice
 *
 * Exports (unchanged):
 *   BuySellPanel (default export, memo)
 */
import { useState, useCallback, memo } from "react";
import {
  View, Text, Pressable, TextInput, StyleSheet,
} from "react-native";
import { X, TrendingUp, TrendingDown, AlertCircle } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { fmtPrice } from "@/lib/fmtPrice";

interface Props {
  symbol:       string;
  currentPrice: number | null;
  onClose:      () => void;
}

type OrderType = "market" | "limit" | "stop";
type Side      = "buy"    | "sell";

const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: "market", label: "Market" },
  { value: "limit",  label: "Limit"  },
  { value: "stop",   label: "Stop"   },
];

const QUICK_SIZES = ["25%", "50%", "75%", "100%"];

const BuySellPanel = memo(function BuySellPanel({ symbol, currentPrice, onClose }: Props) {
  const [side,         setSide]         = useState<Side>("buy");
  const [orderType,    setOrderType]    = useState<OrderType>("market");
  const [quantity,     setQuantity]     = useState("");
  const [price,        setPrice]        = useState(currentPrice ? currentPrice.toFixed(2) : "");
  const [stopPrice,    setStopPrice]    = useState("");
  const [submitted,    setSubmitted]    = useState(false);
  const [focusedInput, setFocusedInput] = useState<"price" | "stopPrice" | "quantity" | null>(null);

  const isUp      = side === "buy";
  const accentCol = isUp ? "#B7FF5A" : "#ef4444";
  const accentBg  = isUp ? "rgba(183,255,90,0.12)" : "rgba(239,68,68,0.12)";
  const accentBdr = isUp ? "rgba(183,255,90,0.35)" : "rgba(239,68,68,0.35)";

  const totalValue = (() => {
    const q = parseFloat(quantity);
    const p = orderType === "market" ? (currentPrice ?? 0) : parseFloat(price);
    if (!isNaN(q) && !isNaN(p) && q > 0 && p > 0) return q * p;
    return null;
  })();

  const handleSubmit = useCallback(() => {
    if (!quantity || parseFloat(quantity) <= 0) return;
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
    setQuantity("");
  }, [quantity]);

  const inputBase = {
    backgroundColor: "rgba(7,17,13,0.6)",
    borderRadius:    7,
    paddingVertical: 6,
    paddingHorizontal: 10,
    color:           "#F3FFF3",
    fontSize:        12,
    fontFamily:      "Inter" as const,
  };

  const labelStyle = {
    fontSize:      9,
    fontWeight:    "700" as const,
    color:         "rgba(167,184,169,0.55)",
    textTransform: "uppercase" as const,
    letterSpacing: 0.07 * 9,
    marginBottom:  4,
  };

  const hasQty    = parseFloat(quantity) > 0;
  const btnActive = hasQty && !submitted;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.symbolMain}>{symbol.replace("USD", "")}</Text>
          <Text style={s.symbolSub}>/ USD</Text>
        </View>
        {currentPrice !== null && (
          <Text style={s.livePrice}>{fmtPrice(currentPrice, symbol)}</Text>
        )}
        <Pressable onPress={onClose} style={s.closeBtn} hitSlop={8}>
          <X size={13} color="rgba(167,184,169,0.45)" />
        </Pressable>
      </View>

      <View style={s.body}>
        {/* Buy / Sell tabs */}
        <View style={s.sideTabs}>
          {(["buy", "sell"] as const).map(s_ => (
            <Pressable
              key={s_}
              onPress={() => setSide(s_)}
              style={{
                flex:           1,
                height:         32,
                justifyContent: "center",
                alignItems:     "center",
                flexDirection:  "row",
                gap:            4,
                backgroundColor: side === s_
                  ? (s_ === "buy" ? "rgba(183,255,90,0.18)" : "rgba(239,68,68,0.18)")
                  : "transparent",
              }}
            >
              {s_ === "buy"
                ? <TrendingUp size={11} color={side === s_ ? "#B7FF5A" : "rgba(167,184,169,0.5)"} />
                : <TrendingDown size={11} color={side === s_ ? "#ef4444" : "rgba(167,184,169,0.5)"} />}
              <Text style={{
                fontWeight: "800",
                fontSize:   11,
                color:      side === s_ ? (s_ === "buy" ? "#B7FF5A" : "#ef4444") : "rgba(167,184,169,0.5)",
              }}>
                {s_.toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Order type */}
        <View>
          <Text style={labelStyle}>Order Type</Text>
          <View style={{ flexDirection: "row", gap: 3 }}>
            {ORDER_TYPES.map(ot => (
              <Pressable
                key={ot.value}
                onPress={() => setOrderType(ot.value)}
                style={{
                  flex:            1,
                  height:          26,
                  borderRadius:    6,
                  borderWidth:     1,
                  borderColor:     orderType === ot.value ? accentBdr : "rgba(57,91,67,0.25)",
                  backgroundColor: orderType === ot.value ? accentBg : "transparent",
                  justifyContent:  "center",
                  alignItems:      "center",
                }}
              >
                <Text style={{
                  fontSize:   10,
                  fontWeight: "700",
                  color:      orderType === ot.value ? accentCol : "rgba(167,184,169,0.6)",
                }}>
                  {ot.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Limit / Stop price (hidden for market) */}
        {orderType !== "market" && (
          <View>
            <Text style={labelStyle}>
              {orderType === "stop" ? "Stop Price" : "Price"}
            </Text>
            <View style={{ position: "relative" }}>
              <TextInput
                keyboardType="decimal-pad"
                value={orderType === "stop" ? stopPrice : price}
                onChangeText={v => orderType === "stop" ? setStopPrice(v) : setPrice(v)}
                placeholder={currentPrice?.toFixed(2) ?? "0.00"}
                placeholderTextColor="rgba(167,184,169,0.35)"
                onFocus={() => setFocusedInput(orderType === "stop" ? "stopPrice" : "price")}
                onBlur={() => setFocusedInput(null)}
                style={{
                  ...inputBase,
                  borderWidth: 1,
                  borderColor: focusedInput === (orderType === "stop" ? "stopPrice" : "price")
                    ? accentBdr : "rgba(57,91,67,0.3)",
                  paddingRight: 36,
                }}
              />
              <Text style={{
                position: "absolute", right: 8, top: 0, bottom: 0,
                textAlignVertical: "center",
                fontSize: 9, color: "rgba(167,184,169,0.4)",
              }}>
                USD
              </Text>
            </View>
          </View>
        )}

        {/* Quantity */}
        <View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={labelStyle}>Amount</Text>
            {totalValue !== null && (
              <Text style={{ fontSize: 9, color: "rgba(167,184,169,0.45)" }}>
                ≈ ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </Text>
            )}
          </View>
          <View style={{ position: "relative" }}>
            <TextInput
              keyboardType="decimal-pad"
              value={quantity}
              onChangeText={setQuantity}
              placeholder="0.000"
              placeholderTextColor="rgba(167,184,169,0.35)"
              onFocus={() => setFocusedInput("quantity")}
              onBlur={() => setFocusedInput(null)}
              style={{
                ...inputBase,
                borderWidth: 1,
                borderColor: focusedInput === "quantity" ? accentBdr : "rgba(57,91,67,0.3)",
                paddingRight: 36,
              }}
            />
            <Text style={{
              position: "absolute", right: 8, top: 0, bottom: 0,
              textAlignVertical: "center",
              fontSize: 9, color: "rgba(167,184,169,0.4)",
            }}>
              {symbol.replace("USD", "")}
            </Text>
          </View>

          {/* Quick size buttons */}
          <View style={{ flexDirection: "row", gap: 3, marginTop: 5 }}>
            {QUICK_SIZES.map(pct => (
              <Pressable
                key={pct}
                onPress={() => setQuantity(String((parseFloat(pct) / 100 * 0.1).toFixed(4)))}
                style={({ pressed }) => ({
                  flex:            1,
                  height:          20,
                  borderRadius:    4,
                  borderWidth:     1,
                  borderColor:     "rgba(57,91,67,0.25)",
                  backgroundColor: pressed ? accentBg : "rgba(57,91,67,0.1)",
                  justifyContent:  "center",
                  alignItems:      "center",
                })}
              >
                <Text style={{ fontSize: 9, fontWeight: "600", color: "rgba(167,184,169,0.55)" }}>
                  {pct}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Order info row */}
        {orderType === "market" && currentPrice !== null && (
          <View style={{
            flexDirection:   "row",
            justifyContent:  "space-between",
            padding:         8,
            paddingVertical: 6,
            backgroundColor: "rgba(57,91,67,0.08)",
            borderRadius:    6,
          }}>
            <Text style={{ fontSize: 9, color: "rgba(167,184,169,0.5)" }}>Est. Price</Text>
            <Text style={{ fontSize: 9, fontWeight: "700", color: "#F3FFF3", fontFamily: "Courier New" }}>
              {fmtPrice(currentPrice, symbol)}
            </Text>
          </View>
        )}

        {/* Submit button */}
        {btnActive ? (
          <LinearGradient
            colors={isUp ? ["#7CBF4B", "#B7FF5A"] : ["#dc2626", "#ef4444"]}
            start={{ x: 0.15, y: 0.15 }}
            end={{ x: 0.85, y: 0.85 }}
            style={{ borderRadius: 8 }}
          >
            <Pressable
              onPress={handleSubmit}
              style={{
                height:         36,
                borderRadius:   8,
                justifyContent: "center",
                alignItems:     "center",
              }}
            >
              <Text style={{
                fontWeight:    "800",
                fontSize:      12,
                letterSpacing: 0.36,
                color:         isUp ? "#07110D" : "#fff",
              }}>
                {`${side === "buy" ? "Buy" : "Sell"} ${symbol.replace("USD", "")}`}
              </Text>
            </Pressable>
          </LinearGradient>
        ) : (
          <Pressable
            onPress={handleSubmit}
            style={{
              height:          36,
              borderRadius:    8,
              justifyContent:  "center",
              alignItems:      "center",
              backgroundColor: submitted
                ? "rgba(255,255,255,0.08)"
                : "rgba(57,91,67,0.15)",
            }}
          >
            <Text style={{
              fontWeight:    "800",
              fontSize:      12,
              letterSpacing: 0.36,
              color:         submitted
                ? "rgba(148,163,184,0.9)"
                : "rgba(167,184,169,0.35)",
            }}>
              {submitted
                ? "✓ Placed"
                : `${side === "buy" ? "Buy" : "Sell"} ${symbol.replace("USD", "")}`}
            </Text>
          </Pressable>
        )}

        {/* Disclaimer */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 4 }}>
          <AlertCircle size={9} color="rgba(167,184,169,0.3)" style={{ marginTop: 1 }} />
          <Text style={{ fontSize: 8.5, color: "rgba(167,184,169,0.3)", lineHeight: 12, flex: 1 }}>
            Paper trading only. No real orders placed.
          </Text>
        </View>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  container: {
    width:           220,
    backgroundColor: "rgba(9,18,14,0.96)",
    borderWidth:     1,
    borderColor:     "rgba(57,91,67,0.3)",
    borderRadius:    12,
    overflow:        "hidden",
  },
  header: {
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "space-between",
    padding:           10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(57,91,67,0.2)",
  },
  symbolMain: {
    fontSize:   12,
    fontWeight: "800",
    color:      "#F3FFF3",
  },
  symbolSub: {
    fontSize:   9,
    color:      "rgba(167,184,169,0.5)",
    marginLeft: 4,
  },
  livePrice: {
    fontSize:   11,
    fontWeight: "700",
    color:      "#B7FF5A",
    fontFamily: "Courier New",
  },
  closeBtn: {
    padding: 2,
  },
  body: {
    padding:        10,
    paddingHorizontal: 12,
    gap:            10,
  },
  sideTabs: {
    flexDirection:   "row",
    borderRadius:    8,
    overflow:        "hidden",
    borderWidth:     1,
    borderColor:     "rgba(57,91,67,0.25)",
  },
});

export default BuySellPanel;
