import type { Polarity, ValueFormat } from "@/dashboards/types";

/** Formato numérico es-CO: miles con ".", decimales con ",". */
const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfUpTo1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const nfUpTo2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

export const formatInt = (n: number) => nf0.format(n);

/**
 * Espacio duro entre cifra y unidad ("81,7 %", "5,4 días", "$ 1,2 mil M"): al envolver
 * (cabeceras, chips, tooltips) la unidad nunca queda sola en la línea siguiente.
 */
export const NBSP = "\u00a0";

/** 12.925 → "12,9 mil" · 7.625.950.000 → "7,6 mil M" · 1.250.000 → "1,3 M" */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${nfUpTo2.format(n / 1e9)}${NBSP}mil${NBSP}M`;
  if (abs >= 1e6) return `${nfUpTo1.format(n / 1e6)}${NBSP}M`;
  if (abs >= 1e4) return `${nfUpTo1.format(n / 1e3)}${NBSP}mil`;
  return nfUpTo1.format(n);
}

export function formatCOP(n: number, compact = true): string {
  return compact ? `$${NBSP}${formatCompact(n)}` : `$${NBSP}${nf0.format(n)}`;
}

export function formatPct(ratio: number, digits = 1): string {
  return `${(digits === 2 ? nf2 : digits === 0 ? nf0 : nf1).format(ratio * 100)}${NBSP}%`;
}

export function formatValue(value: number | null | undefined, format: ValueFormat = "int", opts?: { compact?: boolean }): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  switch (format) {
    case "pct":
      return formatPct(value, 1);
    case "days": {
      // Siempre 1 decimal ("1,0 días" junto a "4,3 días"): las cifras vecinas se alinean.
      // Con decimales el sustantivo va en plural (RAE: "1,5 kilómetros"), también en "1,0 días".
      return `${nf1.format(value)}${NBSP}días`;
    }
    case "decimal":
      return nfUpTo2.format(value);
    case "cop":
      return formatCOP(value, opts?.compact ?? true);
    case "compact":
      return formatCompact(value);
    case "int":
    default:
      return opts?.compact ? formatCompact(value) : nf0.format(Math.round(value));
  }
}

/** Valor corto para ejes y etiquetas de barras. */
export function formatAxis(value: number, format: ValueFormat = "int"): string {
  if (format === "pct") return `${nf0.format(value * 100)}${NBSP}%`;
  if (format === "cop") return `$${NBSP}${formatCompact(value)}`;
  if (format === "days") return `${nf0.format(value)}${NBSP}d`;
  return formatCompact(value);
}

/**
 * Unidad única para una gráfica COP: elige "mil M", "M" o "mil" según el máximo
 * y formatea todos los valores con esa misma unidad (nunca mezcla "M" y "mil M").
 * Precisión FIJA por unidad para que la columna de cifras se lea pareja ("2,00 · 1,80 · 1,08"):
 * "mil M" con 2 decimales (igual que la cifra del KPI), "M" con 1 y "mil" sin decimales.
 */
export function copUnit(values: number[]): { divisor: number; suffix: string; format: (n: number) => string; value: (n: number) => string } {
  const max = Math.max(0, ...values.map((v) => Math.abs(v)));
  const [divisor, suffix] = max >= 1e9 ? [1e9, `mil${NBSP}M`] : max >= 1e6 ? [1e6, "M"] : max >= 1e4 ? [1e3, "mil"] : [1, ""];
  const nf = divisor === 1e9 ? nf2 : divisor === 1e6 ? nf1 : nf0;
  const value = (n: number) => nf.format(n / divisor);
  return { divisor, suffix, value, format: (n: number) => `$${NBSP}${value(n)}${suffix ? `${NBSP}${suffix}` : ""}` };
}

/** +5,7 % / −30,6 % (variación relativa). */
export function formatDelta(delta: number): string {
  if (Math.abs(delta) < 0.0005) return `0,0${NBSP}%`;
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${nf1.format(Math.abs(delta) * 100)}${NBSP}%`;
}

/** Diferencia en puntos porcentuales entre dos proporciones (0..1): "+1,3 p.p.". */
export function formatDeltaPP(current: number, previous: number): string {
  const diff = (current - previous) * 100;
  if (Math.abs(diff) < 0.05) return `0,0${NBSP}p.p.`;
  return `${diff > 0 ? "+" : "−"}${nf1.format(Math.abs(diff))}${NBSP}p.p.`;
}

export type DeltaTone = "good" | "bad" | "neutral";

export interface DeltaInfo {
  /** Texto listo para mostrar ("+5,7 %", "−1,3 p.p.", "0,0 %", "Sin base"; con base pequeña, la diferencia absoluta "+3"). */
  text: string;
  /** Con base pequeña: la variación relativa que se omite en el chip ("+100,0 %"), para el tooltip. */
  relText?: string;
  tone: DeltaTone;
  direction: "up" | "down" | "flat";
  /** Por qué el tono es neutral aunque haya variación. */
  reason?: "no-base" | "small-base";
  /** Magnitud comparable para ordenar señales (relativa o p.p./100). */
  magnitude: number;
}

/** Diferencia absoluta con signo tipográfico: "+3", "−12", "0". */
export function formatSignedInt(diff: number): string {
  const r = Math.round(diff);
  return r === 0 ? "0" : `${r > 0 ? "+" : "−"}${nf0.format(Math.abs(r))}`;
}

/** Base mínima para colorear la variación de un conteo. */
const SMALL_BASE = 20;

/**
 * ÚNICO punto de cálculo de la variación y su tono (KPIs, Home, paleta, panel del mapa).
 * - % → diferencia en p.p.; el resto → variación relativa.
 * - Sin anterior → "Sin base"; conteos con anterior < 20 → tono neutral, diferencia absoluta y "Base pequeña".
 * - Tono = dirección × polaridad.
 */
export function describeDelta(value: number | null | undefined, previous: number | null | undefined, format: ValueFormat, polarity: Polarity): DeltaInfo {
  if (value === null || value === undefined || previous === null || previous === undefined || Number.isNaN(value) || Number.isNaN(previous)) {
    return { text: "Sin base", tone: "neutral", direction: "flat", reason: "no-base", magnitude: 0 };
  }
  let text: string;
  let magnitude: number;
  if (format === "pct") {
    text = formatDeltaPP(value, previous);
    magnitude = value - previous;
    if (Math.abs(magnitude * 100) < 0.05) magnitude = 0;
  } else {
    if (previous === 0) return { text: value === 0 ? `0,0${NBSP}%` : "Sin base", tone: "neutral", direction: "flat", reason: value === 0 ? undefined : "no-base", magnitude: 0 };
    magnitude = (value - previous) / Math.abs(previous);
    if (Math.abs(magnitude) < 0.0005) magnitude = 0;
    text = formatDelta(magnitude);
  }
  const direction = magnitude > 0 ? "up" : magnitude < 0 ? "down" : "flat";
  if (direction === "flat" || polarity === "neutral") return { text, tone: "neutral", direction, magnitude };
  // Base pequeña: un "+100,0 %" sobre 3 casos alarma sin razón → diferencia absoluta ("+3") y tono neutral
  if ((format === "int" || format === "compact") && Math.abs(previous) < SMALL_BASE)
    return { text: formatSignedInt(value - previous), relText: text, tone: "neutral", direction, reason: "small-base", magnitude };
  const good = (direction === "up") === (polarity === "up-good");
  return { text, tone: good ? "good" : "bad", direction, magnitude };
}

export { nf1, nf2 };
