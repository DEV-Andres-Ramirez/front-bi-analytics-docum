"use client";

import { useMemo } from "react";
import { useTheme } from "@/hooks/use-theme";
import type { SemanticFamily, VizOptions } from "@/dashboards/types";
import { isNeutral, resolveStatus } from "./semantic";

export interface ChartTheme {
  mode: "light" | "dark";
  series: string[];
  other: string;
  grid: string;
  axis: string;
  tick: string;
  text: string;
  muted: string;
  surface: string;
  seq: string[];
  primary: string;
  tooltipBg: string;
  tooltipText: string;
  resolve: (cssVar: string) => string;
}

function readVar(name: string): string {
  if (typeof window === "undefined") return "#999";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#999";
}

/** Colores de gráficas leídos de las variables CSS del tema activo. */
export function useChartTheme(): ChartTheme {
  const { theme } = useTheme();
  return useMemo(() => {
    const resolve = (v: string) => (v.startsWith("var(") ? readVar(v.slice(4, -1)) : v);
    return {
      mode: theme,
      series: Array.from({ length: 8 }, (_, i) => readVar(`--chart-${i + 1}`)),
      other: readVar("--chart-other"),
      grid: readVar("--chart-grid"),
      axis: readVar("--chart-axis"),
      tick: readVar("--chart-tick"),
      text: readVar("--text"),
      muted: readVar("--muted"),
      surface: readVar("--surface"),
      seq: Array.from({ length: 7 }, (_, i) => readVar(`--seq-${i}`)),
      primary: readVar("--primary"),
      tooltipBg: readVar("--tooltip-bg"),
      tooltipText: "#ffffff",
      resolve,
    };
  }, [theme]);
}

/**
 * Color por categoría: semántico si aplica, gris para "Otros/No reporta",
 * y slots categóricos en orden fijo para el resto (nunca se reciclan: >8 → gris).
 */
export function categoryColors(theme: ChartTheme, labels: string[], semantic?: SemanticFamily, overrides?: VizOptions["overrides"]): string[] {
  let slot = 0;
  return labels.map((label) => {
    if (semantic) {
      const s = resolveStatus(label, semantic, overrides);
      if (s) return theme.resolve(s.color);
    }
    if (isNeutral(label)) return theme.other;
    const c = theme.series[slot] ?? theme.other;
    slot++;
    return c;
  });
}

/** Mezcla un color hex con transparencia. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Interpola en la rampa secuencial (t en 0..1). */
export function seqColor(theme: ChartTheme, t: number): string {
  const steps = theme.seq;
  const x = Math.max(0, Math.min(1, t)) * (steps.length - 1);
  const i = Math.floor(x);
  if (i >= steps.length - 1) return steps[steps.length - 1];
  const f = x - i;
  const a = parseInt(steps[i].slice(1), 16);
  const b = parseInt(steps[i + 1].slice(1), 16);
  const mix = (sh: number) => Math.round(((a >> sh) & 255) * (1 - f) + ((b >> sh) & 255) * f);
  return `#${[16, 8, 0].map((sh) => mix(sh).toString(16).padStart(2, "0")).join("")}`;
}

/** Tinta oscura para texto sobre rellenos (la misma --text del tema claro). */
export const INK_DARK = "#14171c";
export const INK_LIGHT = "#ffffff";

/** Luminancia relativa WCAG de un color #rrggbb (o #rgb); null si no es hex. */
export function luminance(hex: string): number | null {
  let h = hex.trim().replace("#", "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.replace(/./g, (c) => c + c);
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre dos luminancias. */
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const INK_DARK_LUM = luminance(INK_DARK) ?? 0.0088;

/**
 * Texto legible sobre un relleno: devuelve la tinta (#14171c) o el blanco, el que tenga MAYOR
 * contraste con el fondo. El cruce queda en luminancia ≈ 0,18, así que los naranjas, verdes y
 * aquas medios (#DF7702, #0CA30C, #1BAF7A) llevan tinta (5,3–6,4:1) y los fondos oscuros, blanco.
 */
export function inkOn(hex: string): string {
  const lum = luminance(hex);
  if (lum === null) return INK_LIGHT;
  return ratio(lum, INK_DARK_LUM) >= ratio(lum, 1) ? INK_DARK : INK_LIGHT;
}
