"use client";

import { useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import type { DashboardMeta } from "@/config/dashboards";
import type { DashboardResponse, FiltersState } from "@/dashboards/dto";
import type { DashboardSpec } from "@/dashboards/types";
import { parseFilters, serializeFilters } from "@/lib/filters";

export interface DashboardActions {
  toggleValue: (field: string, value: string) => void;
  setValues: (field: string, values: string[]) => void;
  setText: (field: string, text: string) => void;
  setDates: (field: string, range: { from?: string; to?: string } | null) => void;
  setRange: (from: string, to: string) => void;
  clearAll: () => void;
}

interface Ctx extends DashboardActions {
  spec: DashboardSpec;
  meta: DashboardMeta;
  filters: FiltersState;
  /** Querystring canónico de los filtros (clave de caché). */
  qs: string;
  data?: DashboardResponse;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}

const DashboardContext = createContext<Ctx | null>(null);

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard fuera de DashboardProvider");
  return ctx;
}

/** Filtros sincronizados con la URL usando la History API (sin ida y vuelta al servidor). */
export function useUrlFilters() {
  const sp = useSearchParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(sp.toString())), [sp]);
  const qs = useMemo(() => serializeFilters(filters).toString(), [filters]);

  const commit = useCallback(
    (fn: (f: FiltersState) => void) => {
      const next: FiltersState = structuredClone(filters);
      fn(next);
      for (const k of Object.keys(next.eq)) if (!next.eq[k].length) delete next.eq[k];
      window.history.replaceState(null, "", `?${serializeFilters(next).toString()}`);
    },
    [filters],
  );

  const actions: DashboardActions = useMemo(
    () => ({
      toggleValue: (field, value) =>
        commit((f) => {
          const arr = f.eq[field] ?? [];
          f.eq[field] = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
        }),
      setValues: (field, values) =>
        commit((f) => {
          f.eq[field] = values;
        }),
      setText: (field, text) =>
        commit((f) => {
          if (text.trim()) f.text[field] = text.trim();
          else delete f.text[field];
        }),
      setDates: (field, range) =>
        commit((f) => {
          if (range && (range.from || range.to)) f.dates[field] = range;
          else delete f.dates[field];
        }),
      setRange: (from, to) =>
        commit((f) => {
          f.from = from;
          f.to = to;
        }),
      clearAll: () =>
        commit((f) => {
          f.eq = {};
          f.text = {};
          f.dates = {};
        }),
    }),
    [commit],
  );

  return { filters, qs, actions };
}

export function DashboardProvider({ value, children }: { value: Ctx; children: ReactNode }) {
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
