"use client";

import { useCallback } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { serializeFilters } from "@/lib/filters";

/**
 * Utilidades compartidas por las matrices (HeatmapMatrix, HeatmapComposite, PhaseMatrix),
 * el Treemap y el Sankey v2. Solo presentación: nunca cambian la métrica.
 */

function parseHex(hex: string): [number, number, number] | null {
  let s = hex.trim().replace("#", "");
  if (s.length === 3) s = s.replace(/./g, (c) => c + c);
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mezcla opaca de dos colores hex (t = peso de `a`, 0..1). Devuelve `a` si alguno no es hex. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const k = Math.max(0, Math.min(1, t));
  return `#${[0, 1, 2].map((i) => Math.round(pa[i] * k + pb[i] * (1 - k)).toString(16).padStart(2, "0")).join("")}`;
}

/** Posición de anclaje del tooltip HTML (centro del elemento, coordenadas de viewport). */
export function anchorOf(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Mediana de una lista (0 si está vacía). */
export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Filtro cruzado sobre varias dimensiones en un solo paso (clic en una celda día × hora).
 * Si todos los pares ya están seleccionados, los quita; si no, agrega los que falten.
 * Usa el mismo mecanismo que useUrlFilters (History API), pero en una sola escritura:
 * dos toggleValue seguidos se pisan porque ambos parten del mismo estado.
 */
export function useToggleMany() {
  const { filters } = useDashboard();
  return useCallback(
    (pairs: { field: string; value: string }[]) => {
      const next = structuredClone(filters);
      const allOn = pairs.every((p) => next.eq[p.field]?.includes(p.value));
      for (const { field, value } of pairs) {
        const arr = next.eq[field] ?? [];
        const out = allOn ? arr.filter((v) => v !== value) : arr.includes(value) ? arr : [...arr, value];
        if (out.length) next.eq[field] = out;
        else delete next.eq[field];
      }
      window.history.replaceState(null, "", `?${serializeFilters(next).toString()}`);
    },
    [filters],
  );
}

/** Estado de selección de una dimensión: activo (hay filtro) y si una etiqueta está seleccionada. */
export function selectionOf(eq: Record<string, string[]>, field: string | undefined) {
  const sel = field ? (eq[field] ?? []) : [];
  return { active: sel.length > 0, has: (v: string) => sel.includes(v) };
}

export { RESIZE_RECOVERY } from "@/lib/charts/resize-recovery";
