/**
 * alertStore.ts — Zustand global alerts store.
 *
 * React Native port of src/store/alertStore.ts
 * ─────────────────────────────────────────────
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. localStorage → Zustand persist middleware backed by AsyncStorage.
 *    Web: load() / save() use localStorage directly with synchronous reads.
 *    RN:  Zustand's `persist` middleware with `zustandStorage` (AsyncStorage)
 *         handles serialisation and rehydration asynchronously.
 *         The store initialises from ALL_ALERTS (same fallback as web's load())
 *         and rehydrates from AsyncStorage on first mount.
 *    The `load` and `save` helpers are removed; persist middleware replaces them.
 *
 * All state shape, actions, selectors, and public API signatures are
 * preserved exactly.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { zustandStorage } from "@/lib/rnStorage";
import {
  ALL_ALERTS,
  type AnyAlert,
  type AlertStatus,
} from "@/data/alertsData";

// ── Persistence key (kept identical to the web original) ──────────────────────
const LS_KEY = "tj_global_alerts_v1";

// ── Store interface ───────────────────────────────────────────────────────────
interface AlertStore {
  alerts: AnyAlert[];
  addAlert:    (alert: AnyAlert) => void;
  updateAlert: (id: string, patch: Partial<AnyAlert> & { status?: AlertStatus }) => void;
  deleteAlert: (id: string) => void;
  setAlerts:   (alerts: AnyAlert[]) => void;
}

export const useAlertStore = create<AlertStore>()(
  persist(
    (set) => ({
      // Initial state mirrors web's load() fallback: a fresh copy of ALL_ALERTS.
      // On subsequent launches the persist middleware rehydrates from AsyncStorage.
      alerts: ALL_ALERTS.map(a => ({ ...a })),

      addAlert: (alert) => set((state) => {
        const next = [alert, ...state.alerts.filter(a => a.id !== alert.id)];
        return { alerts: next };
      }),

      updateAlert: (id, patch) => set((state) => {
        const next = state.alerts.map(a =>
          a.id === id ? ({ ...a, ...patch } as AnyAlert) : a
        );
        return { alerts: next };
      }),

      deleteAlert: (id) => set((state) => {
        const next = state.alerts.filter(a => a.id !== id);
        return { alerts: next };
      }),

      setAlerts: (alerts) => set({ alerts }),
    }),
    {
      name:    LS_KEY,
      storage: zustandStorage,
    },
  ),
);
