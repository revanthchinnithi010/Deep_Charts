/**
 * IndicatorTags.tsx — React Native port (Phase 10.4 Pass C)
 *
 * Migrated from src/components/charts/IndicatorTags.tsx
 *
 * Web → RN changes:
 *   lucide-react icons                → Ionicons (@expo/vector-icons)
 *   createPortal(PineModal)           → Modal (transparent, animationType="fade")
 *   createPortal(MoreMenu)            → Modal (transparent, animationType="fade")
 *   getBoundingClientRect() anchor    → Modal shown without DOM-position anchoring
 *                                        (touch devices: menu appears at fixed position)
 *   onMouseEnter/Leave hover state    → removed; action buttons always visible on touch
 *   <div>/<button>/<span>/<textarea>  → View/Text/Pressable/TextInput
 *   backdropFilter blur               → rgba background only (not supported in RN)
 *   position:absolute overlay         → View style position:"absolute" (identical)
 *   userSelect:none                   → removed (not applicable in RN)
 *   requestAnimationFrame mount fade  → Modal animationType="fade"
 *   document.addEventListener         → Modal onRequestClose
 *   HTMLButtonElement ref             → View ref (used only for MoreMenu anchor; dropped
 *                                        in favour of Modal-based menu placement)
 *   transition / transform CSS        → removed (animations deferred)
 *
 * Exports (unchanged):
 *   IndicatorTags (default export)
 */

import { memo, useState } from "react";
import {
  View, Text, Pressable, ScrollView,
  StyleSheet, Modal, TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useIndicatorStore, type AppliedIndicator } from "@/store/indicatorStore";

// ── PineModal ─────────────────────────────────────────────────────────────────

interface PineModalProps {
  code: string;
  name: string;
  onClose: () => void;
}

function PineModal({ code, name, onClose }: PineModalProps) {
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={pm.backdrop} onPress={onClose} />
      <View style={pm.card}>
        {/* Header */}
        <View style={pm.header}>
          <View style={pm.headerLeft}>
            <Ionicons name="code-slash-outline" size={13} color="#22c55e" />
            <Text style={pm.headerTitle}>{name} — Pine Script</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={pm.closeBtn}>
            <Text style={pm.closeX}>✕</Text>
          </Pressable>
        </View>

        {/* Code body */}
        <View style={pm.body}>
          <TextInput
            style={pm.codeInput}
            value={code || "(no code)"}
            multiline
            editable={false}
            scrollEnabled
            selectTextOnFocus={false}
          />
        </View>
      </View>
    </Modal>
  );
}

const pm = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  card: {
    position: "absolute",
    top: "10%" as any,
    left: 16,
    right: 16,
    backgroundColor: "#131722",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 14,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#d1d4dc",
  },
  closeBtn: {
    padding: 4,
    borderRadius: 6,
  },
  closeX: {
    fontSize: 14,
    color: "rgba(255,255,255,0.4)",
  },
  body: {
    padding: 16,
  },
  codeInput: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: 12,
    fontSize: 12,
    color: "#d1d4dc",
    fontFamily: "monospace",
    minHeight: 180,
    textAlignVertical: "top",
  },
});

// ── MoreMenu ──────────────────────────────────────────────────────────────────

interface MoreMenuProps {
  indicator: AppliedIndicator;
  onClose: () => void;
  onDelete: () => void;
  onShowPine: () => void;
  onDuplicate: () => void;
}

function MoreMenu({ indicator, onClose, onDelete, onShowPine, onDuplicate }: MoreMenuProps) {
  const items: { iconName: string; label: string; action: () => void; danger?: boolean }[] = [
    { iconName: "eye-outline",    label: "Toggle visibility", action: () => { onClose(); } },
    { iconName: "copy-outline",   label: "Duplicate",         action: () => { onDuplicate(); onClose(); } },
    ...(indicator.type === "CUSTOM" ? [
      { iconName: "code-slash-outline", label: "Show PineScript", action: () => { onShowPine(); onClose(); } },
    ] : []),
    { iconName: "trash-outline",  label: "Remove",            action: () => { onDelete(); onClose(); }, danger: true },
  ];

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={mm.menu}>
        {items.map((item, i) => (
          <Pressable
            key={i}
            onPress={item.action}
            style={mm.item}
          >
            <Ionicons
              name={item.iconName as any}
              size={12}
              color={item.danger ? "#f87171" : "rgba(200,228,204,0.85)"}
            />
            <Text style={[mm.itemText, item.danger && mm.itemTextDanger]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const mm = StyleSheet.create({
  menu: {
    position: "absolute",
    top: 80,
    left: 12,
    minWidth: 168,
    backgroundColor: "rgba(7,17,13,0.97)",
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.13)",
    borderRadius: 10,
    overflow: "hidden",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  itemText: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(200,228,204,0.85)",
  },
  itemTextDanger: {
    color: "#f87171",
  },
});

// ── IndicatorTag ──────────────────────────────────────────────────────────────

function IndicatorTag({ indicator, onToggleVisible, onDelete }: {
  indicator: AppliedIndicator;
  onToggleVisible: () => void;
  onDelete: () => void;
}) {
  const { duplicateIndicator } = useIndicatorStore();
  const [showMore, setShowMore] = useState(false);
  const [showPine, setShowPine] = useState(false);

  return (
    <>
      <View style={t.tag}>
        {/* Color dot */}
        <View style={[
          t.colorDot,
          {
            backgroundColor: indicator.color,
            opacity: indicator.visible ? 1 : 0.3,
          },
        ]} />

        {/* Label */}
        <Text style={[t.label, !indicator.visible && t.labelHidden]}>
          {indicator.label}
        </Text>

        {indicator.type === "CUSTOM" && (
          <Text style={t.customBadge}>custom</Text>
        )}

        {/* Action buttons — always visible on touch (no hover on mobile) */}
        <View style={t.actions}>
          <Pressable
            hitSlop={6}
            onPress={onToggleVisible}
            style={t.iconBtn}
          >
            <Ionicons
              name={indicator.visible ? "eye-outline" : "eye-off-outline"}
              size={12}
              color="rgba(183,220,190,0.55)"
            />
          </Pressable>
          <Pressable
            hitSlop={6}
            onPress={() => {}}
            style={t.iconBtn}
          >
            <Ionicons name="settings-outline" size={12} color="rgba(183,220,190,0.55)" />
          </Pressable>
          <Pressable
            hitSlop={6}
            onPress={onDelete}
            style={t.iconBtn}
          >
            <Ionicons name="trash-outline" size={12} color="rgba(183,220,190,0.55)" />
          </Pressable>
          <Pressable
            hitSlop={6}
            onPress={() => setShowMore(true)}
            style={t.iconBtn}
          >
            <Ionicons name="ellipsis-horizontal" size={12} color="rgba(183,220,190,0.55)" />
          </Pressable>
        </View>
      </View>

      {showMore && (
        <MoreMenu
          indicator={indicator}
          onClose={() => setShowMore(false)}
          onDelete={onDelete}
          onShowPine={() => setShowPine(true)}
          onDuplicate={() => duplicateIndicator(indicator.id)}
        />
      )}

      {showPine && (
        <PineModal
          code={(indicator.pineCode as string) ?? ""}
          name={indicator.label}
          onClose={() => setShowPine(false)}
        />
      )}
    </>
  );
}

const t = StyleSheet.create({
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 28,
    backgroundColor: "rgba(7,17,13,0.82)",
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.1)",
    borderRadius: 6,
    paddingLeft: 8,
    paddingRight: 4,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
    marginRight: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(200,228,204,0.95)",
  },
  labelHidden: {
    color: "rgba(183,220,190,0.3)",
  },
  customBadge: {
    fontSize: 9,
    color: "#B7FF5A",
    marginLeft: 5,
    opacity: 0.65,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 5,
  },
  iconBtn: {
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ── IndicatorTags (default export) ────────────────────────────────────────────

const IndicatorTags = memo(function IndicatorTags({ topOffset = 8 }: { topOffset?: number }) {
  const { appliedIndicators, toggleVisible, removeIndicator } = useIndicatorStore();
  const [collapsed, setCollapsed] = useState(false);

  if (appliedIndicators.length === 0) return null;

  return (
    <View style={[s.container, { top: topOffset }]}>
      {/* Header row with collapse toggle */}
      <View style={[s.headerRow, collapsed ? s.headerRowCollapsed : s.headerRowExpanded]}>
        <Pressable
          onPress={() => setCollapsed(c => !c)}
          style={s.collapseBtn}
          hitSlop={6}
        >
          <Ionicons
            name={collapsed ? "chevron-down-outline" : "chevron-up-outline"}
            size={10}
            color="rgba(183,220,190,0.6)"
          />
          <Text style={s.collapseBtnText}>
            {appliedIndicators.length} indicator{appliedIndicators.length !== 1 ? "s" : ""}
          </Text>
        </Pressable>
      </View>

      {/* Indicator tags */}
      {!collapsed && appliedIndicators.map(ind => (
        <IndicatorTag
          key={ind.id}
          indicator={ind}
          onToggleVisible={() => toggleVisible(ind.id)}
          onDelete={() => removeIndicator(ind.id)}
        />
      ))}
    </View>
  );
});

const s = StyleSheet.create({
  container: {
    position: "absolute",
    left: 8,
    zIndex: 20,
    flexDirection: "column",
    gap: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerRowExpanded: {
    marginBottom: 2,
  },
  headerRowCollapsed: {
    marginBottom: 0,
  },
  collapseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 20,
    paddingHorizontal: 7,
    backgroundColor: "rgba(7,17,13,0.75)",
    borderWidth: 1,
    borderColor: "rgba(183,255,90,0.15)",
    borderRadius: 5,
  },
  collapseBtnText: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(183,220,190,0.6)",
  },
});

export default IndicatorTags;
