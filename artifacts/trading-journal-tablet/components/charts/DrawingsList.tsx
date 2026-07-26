/**
 * DrawingsList.tsx — React Native port (Phase 9.22 Pass A)
 *
 * Migrated from src/components/charts/DrawingsList.tsx
 *
 * Web → RN changes (Pass A):
 *   import.meta.env.BASE_URL   → getApiBase()
 *   lucide-react icons         → Ionicons
 *   <div>/<span>/<p>/<button>  → View/Text/Pressable
 *   Tailwind CSS classes       → StyleSheet
 *   group-hover opacity trick  → always-visible action buttons (no hover on touch)
 *   AnimatedList/AnimatedListItem → plain View (animations deferred)
 *   overflow-y auto            → FlatList (virtualized scroll)
 *
 * Exports (unchanged):
 *   DrawingsList (named export, memo)
 */

import { memo, useState, useCallback } from "react";
import {
  View, Text, Pressable, FlatList, StyleSheet,
} from "react-native";
import {
  TrendingUp, ArrowRight, Minus, AlignJustify, Square, GitMerge,
  Eye, EyeOff, Trash2, Layers,
} from "lucide-react-native";
import { useDrawingStore } from "@/store/drawingStore";
import type { Drawing } from "@/types/drawing";
import { getApiBase } from "@/lib/apiBase";

const BASE = getApiBase();

// ── Icon + label maps (matching web TOOL_ICONS / TOOL_LABELS) ─────────────────
type LucideIcon = React.ComponentType<{ size: number; color: string }>;
const TOOL_ICONS: Record<string, LucideIcon> = {
  trendline: TrendingUp,
  ray:       ArrowRight,
  hline:     Minus,
  vline:     AlignJustify,
  rect:      Square,
  fib:       GitMerge,
};

const TOOL_LABELS: Record<string, string> = {
  trendline: "Trendline",
  ray:       "Ray",
  hline:     "H. Line",
  vline:     "V. Line",
  rect:      "Rectangle",
  fib:       "Fibonacci",
};

// ── Time-ago helper ───────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── DrawingRow ────────────────────────────────────────────────────────────────
const DrawingRow = memo(function DrawingRow({ drawing }: { drawing: Drawing }) {
  const { updateDrawing, removeDrawing } = useDrawingStore();
  const [deleting, setDeleting] = useState(false);

  const DrawingIcon = TOOL_ICONS[drawing.toolType] ?? TrendingUp;
  const label    = TOOL_LABELS[drawing.toolType]    ?? drawing.toolType;
  const anchor   = drawing.points[0];
  const priceStr = anchor
    ? anchor.price.toFixed(anchor.price > 1000 ? 2 : 5)
    : "—";

  const handleToggle = useCallback(async () => {
    const next = !(drawing.isVisible !== false);
    updateDrawing(drawing.id, { isVisible: next });
    try {
      await fetch(`${BASE}/api/drawings/${drawing.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ isVisible: next }),
      });
    } catch { /* ignore */ }
  }, [drawing.id, drawing.isVisible, updateDrawing]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    removeDrawing(drawing.id);
    try { await fetch(`${BASE}/api/drawings/${drawing.id}`, { method: "DELETE" }); }
    catch { /* ignore */ }
    finally { setDeleting(false); }
  }, [drawing.id, removeDrawing]);

  const colorBg  = `${drawing.style.color}14`;
  const colorBdr = `${drawing.style.color}30`;

  return (
    <View style={[s.row, drawing.isVisible === false && s.rowHidden]}>
      {/* Tool icon */}
      <View style={[s.iconBox, { backgroundColor: colorBg, borderColor: colorBdr }]}>
        <DrawingIcon size={12} color={drawing.style.color} />
      </View>

      {/* Info */}
      <View style={s.info}>
        <View style={s.infoTop}>
          <Text style={s.infoLabel} numberOfLines={1}>{label}</Text>
          {drawing.points.length > 1 && (
            <View style={s.ptBadge}>
              <Text style={s.ptBadgeText}>{drawing.points.length}pt</Text>
            </View>
          )}
        </View>
        <View style={s.infoMeta}>
          <Text style={s.infoPrice}>@ {priceStr}</Text>
          {drawing.createdAt && (
            <Text style={s.infoTime}> · {timeAgo(drawing.createdAt)}</Text>
          )}
        </View>
      </View>

      {/* Color dot */}
      <View style={[s.colorDot, { backgroundColor: drawing.style.color }]} />

      {/* Actions — always visible on touch (no hover) */}
      <View style={s.actions}>
        <Pressable
          onPress={handleToggle}
          style={s.actionBtn}
          hitSlop={6}
        >
          {drawing.isVisible !== false
            ? <Eye size={12} color="rgba(167,184,169,0.5)" />
            : <EyeOff size={12} color="rgba(167,184,169,0.5)" />}
        </Pressable>
        <Pressable
          onPress={handleDelete}
          disabled={deleting}
          style={[s.actionBtn, deleting && s.actionBtnDisabled]}
          hitSlop={6}
        >
          <Trash2 size={12} color="rgba(248,113,113,0.6)" />
        </Pressable>
      </View>
    </View>
  );
});

// ── DrawingsList ──────────────────────────────────────────────────────────────
interface Props {
  symbol:    string;
  timeframe: string;
}

export const DrawingsList = memo(function DrawingsList({ symbol, timeframe }: Props) {
  const { drawings } = useDrawingStore();

  const filtered = drawings.filter(
    d => d.symbol === symbol && d.timeframe === timeframe,
  );

  if (filtered.length === 0) {
    return (
      <View style={s.emptyState}>
        <Layers size={24} color="rgba(167,184,169,0.2)" />
        <Text style={s.emptyTitle}>No drawings on this chart</Text>
        <Text style={s.emptySubtitle}>
          Use the toolbar on the left to draw trendlines, Fibonacci, and more
        </Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Column headers */}
      <View style={s.columnHeader}>
        <Text style={s.columnHeaderLabel}>Drawing / Price</Text>
        <Text style={s.columnHeaderCount}>{filtered.length} total</Text>
      </View>

      {/* Virtualized list */}
      <FlatList
        data={filtered}
        keyExtractor={d => String(d.id)}
        renderItem={({ item }) => <DrawingRow drawing={item} />}
        showsVerticalScrollIndicator={false}
        style={s.list}
      />
    </View>
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Container
  container: {
    flex: 1,
    backgroundColor: "#07110D",
  },

  // Column header
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(57,91,67,0.1)",
    flexShrink: 0,
  },
  columnHeaderLabel: {
    flex: 1,
    fontSize: 8.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "rgba(167,184,169,0.35)",
  },
  columnHeaderCount: {
    fontSize: 8.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "rgba(167,184,169,0.35)",
    marginRight: 8,
  },

  // Scrollable list
  list: {
    flex: 1,
  },

  // Drawing row
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(57,91,67,0.08)",
  },
  rowHidden: {
    opacity: 0.45,
  },

  // Tool icon box
  iconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
  },

  // Info
  info: {
    flex: 1,
    minWidth: 0,
  },
  infoTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoLabel: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#F3FFF3",
  },
  infoMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  infoPrice: {
    fontSize: 9,
    fontFamily: "monospace",
    color: "rgba(167,184,169,0.5)",
  },
  infoTime: {
    fontSize: 8.5,
    color: "rgba(167,184,169,0.3)",
  },

  // Points badge
  ptBadge: {
    backgroundColor: "rgba(57,91,67,0.2)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  ptBadgeText: {
    fontSize: 8.5,
    color: "rgba(167,184,169,0.6)",
  },

  // Color dot
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },

  // Action buttons
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  actionBtn: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 32,
  },
  emptyTitle: {
    fontSize: 11,
    color: "rgba(167,184,169,0.4)",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 9.5,
    color: "rgba(167,184,169,0.25)",
    textAlign: "center",
    lineHeight: 14,
  },
});
