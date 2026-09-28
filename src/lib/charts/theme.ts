"use client";

import { useMemo } from "react";
import { useTheme } from "@/hooks/use-theme";
import type { SemanticPalette } from "@/dashboards/types";
import { NEUTRAL_LABELS, semanticVar } from "./semantic";

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
      tooltipBg: theme === "dark" ? "#242a34" : "#14171c",
      tooltipText: "#ffffff",
      resolve,
    };
  }, [theme]);
}

/**
 * Color por categoría: semántico si aplica, gris para "Otros/No reporta",
 * y slots categóricos en orden fijo para el resto (nunca se reciclan: >8 → gris).
 */
export function categoryColors(theme: ChartTheme, labels: string[], semantic?: SemanticPalette): string[] {
  let slot = 0;
  return labels.map((label) => {
    if (semantic) {
      const v = semanticVar(semantic, label);
      if (v) return theme.resolve(v);
    }
    if (NEUTRAL_LABELS.has(label)) return theme.other;
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

/** Texto legible (blanco o tinta) sobre un fondo dado. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#14171c" : "#ffffff";
}
