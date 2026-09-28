import type { GeoValue } from "@/dashboards/dto";
import type { ValueFormat } from "@/dashboards/types";
import { formatValue } from "@/lib/format";

/**
 * Clasificación del mapa (colorSystem G · mapRedesign 6):
 * - 5 clases por cuantiles sobre los valores > 0 (con ≤ 5 valores distintos, una clase por valor);
 * - si los cuantiles colapsan por empates (muchos territorios con 1, 2, 3…) y hay más de 5 valores
 *   distintos, los cortes se calculan sobre los valores distintos: siempre salen 5 clases y el máximo
 *   no comparte clase con valores muy menores;
 * - colores seq-2…6 del tema (si hay menos clases, se reparten a lo largo de la rampa);
 * - concentración extrema (el máximo suma más del 50 % de lo ubicado): el máximo va solo en la clase
 *   más intensa (`dominant`) y los demás se reparten en k − 1 clases (seq-2…5). Con cuantiles, el
 *   segundo territorio caía junto al dominante y parecía el foco (SMART 1: Valle 8 frente a Bogotá 119);
 * - 0 / sin dato = "Sin registros" (surface-3), fuera de las clases.
 */

export const MAX_CLASSES = 5;

export interface MapClass {
  /** Índice en la rampa (0 = seq-2 … 4 = seq-6). */
  ramp: number;
  /** Mínimo y máximo REALES de los valores de la clase ("1–5", "6–20"). */
  min: number;
  max: number;
  count: number;
  /** Clase aislada del máximo cuando concentra más del 50 % (la leyenda la rotula con el territorio). */
  dominant?: boolean;
}

/** "quantile": clases por cuantiles · "unique": una clase por valor (≤ 5 valores distintos). */
export type ClassMethod = "quantile" | "unique";

export interface Classification {
  classes: MapClass[];
  /** Método real (la leyenda lo nombra; no se deduce del número de clases). */
  method: ClassMethod | null;
  /** Índice de clase (en `classes`) de un valor; -1 = sin registros. */
  classOf: (value: number) => number;
}

/** Posiciones de rampa para n clases (siempre incluye el extremo más intenso, `top`). */
function rampSlots(n: number, top = MAX_CLASSES - 1): number[] {
  if (n <= 0) return [];
  if (n === 1) return [top];
  if (n > top) return Array.from({ length: top + 1 }, (_, i) => i);
  return Array.from({ length: n }, (_, i) => Math.round((i * top) / (n - 1)));
}

/** Umbral de concentración para aislar el máximo en su propia clase. */
export const DOMINANT_SHARE = 0.5;

/** Límites superiores de k cuantiles sobre una lista ordenada (sin repetidos; el último es el máximo). */
function quantileUppers(sorted: number[], k: number): number[] {
  const n = sorted.length;
  const uppers: number[] = [];
  for (let i = 0; i < k; i++) {
    const ub = sorted[Math.min(n - 1, Math.ceil(((i + 1) * n) / k) - 1)];
    if (!uppers.length || ub > uppers[uppers.length - 1]) uppers.push(ub);
  }
  if (uppers[uppers.length - 1] !== sorted[n - 1]) uppers.push(sorted[n - 1]);
  return uppers;
}

/** Cortes superiores de las clases (último = máximo) y el método real. */
function breaks(positive: number[], k: number): { uppers: number[]; method: ClassMethod } {
  const distinct = [...new Set(positive)];
  if (distinct.length <= k) return { uppers: distinct, method: "unique" };
  let uppers = quantileUppers(positive, k);
  // Empates: los cuantiles de las filas colapsan (p. ej. 1–2 · 3 · 4–5 · 9–475); sobre los valores
  // distintos siempre hay k cortes (1–2 · 3–4 · 5–9 · 12–161 · 475)
  if (uppers.length < k) uppers = quantileUppers(distinct, k);
  return { uppers, method: "quantile" };
}

export function classify(values: number[], k = MAX_CLASSES): Classification {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!positive.length) return { classes: [], method: null, classOf: () => -1 };
  const top = positive[positive.length - 1];
  const dominant = top / positive.reduce((s, v) => s + v, 0) > DOMINANT_SHARE;
  const full = breaks(positive, k);
  // Con cuantiles (más de k valores distintos) el máximo se aísla: los demás van en k − 1 clases (seq-2…5).
  // Con una clase por valor, el máximo ya va solo: solo se marca como dominante.
  const isolate = dominant && full.method === "quantile" && k > 2;
  const { uppers, method } = isolate ? breaks(positive.slice(0, -1), k - 1) : full;
  const slots = isolate ? rampSlots(uppers.length, MAX_CLASSES - 2) : rampSlots(uppers.length);
  if (isolate) {
    uppers.push(top);
    slots.push(MAX_CLASSES - 1);
  }
  const classes: MapClass[] = uppers.map((ub, i) => ({ ramp: slots[i], min: Infinity, max: -Infinity, count: 0, ...(dominant && i === uppers.length - 1 && ub === top ? { dominant: true } : {}) }));
  const classOf = (v: number) => {
    if (!(v > 0)) return -1;
    for (let i = 0; i < uppers.length; i++) if (v <= uppers[i]) return i;
    return uppers.length - 1;
  };
  for (const v of positive) {
    const c = classes[classOf(v)];
    c.min = Math.min(c.min, v);
    c.max = Math.max(c.max, v);
    c.count++;
  }
  return { classes, method, classOf };
}

/** Rótulo de una clase con su rango real ("1–5", "46–516", "12"). */
export function classLabel(c: MapClass, format: ValueFormat = "int"): string {
  const f = (v: number) => formatValue(v, format, { compact: v >= 10000 });
  return c.min === c.max ? f(c.min) : `${f(c.min)}–${f(c.max)}`;
}

/** Colores seq-2…6 del tema (lista de 5). */
export function rampColors(seq: string[]): string[] {
  return seq.slice(2, 7);
}

/** Color por código (solo los que tienen valor > 0). */
export function colorByCode(items: GeoValue[], cls: Classification, ramp: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of items) {
    const i = cls.classOf(it.value);
    if (i >= 0) out[it.code] = ramp[cls.classes[i].ramp] ?? ramp[ramp.length - 1];
  }
  return out;
}

// ─── Lenguaje ────────────────────────────────────────────────────────────────

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "remitente" → "del remitente" · "tutela" → "de la tutela". */
export function geoPhrase(geoLabel: string): string {
  const g = geoLabel.trim().toLowerCase();
  if (!g) return "";
  const head = g.split(/\s+/)[0];
  return /a$/.test(head) || /(ción|sión|dad)$/.test(head) ? `de la ${g}` : `del ${g}`;
}

/** Artículo definido plural: "las quejas", "los radicados". */
export function pluralArticle(plural: string): string {
  return /as$/i.test(plural.trim()) ? "las" : "los";
}

export interface MapUnit {
  singular: string;
  plural: string;
}

export function unitOf(unit?: { singular: string; plural: string }): MapUnit {
  return unit ?? { singular: "registro", plural: "registros" };
}

/**
 * Título del panel con la geografía explícita:
 * "Radicados por departamento del remitente" · "Tutelas por departamento" (sin línea de geografía: la
 * tarjeta ya se titula "Territorio de la tutela" y repetirlo sobraba).
 */
export function panelTitle(unit: MapUnit, geoLabel: string, level: "dpto" | "mpio"): { title: string; geo: string | null } {
  const nivel = level === "dpto" ? "departamento" : "municipio";
  const same = geoLabel.trim().toLowerCase() === unit.singular.toLowerCase();
  if (same) return { title: `${capitalize(unit.plural)} por ${nivel}`, geo: null };
  return { title: `${capitalize(unit.plural)} por ${nivel} ${geoPhrase(geoLabel)}`.trim(), geo: null };
}

/** Nombre corto para rótulos en el lienzo. */
export function shortGeoName(name: string): string {
  if (/^san andr[eé]s/i.test(name)) return "San Andrés";
  return name;
}

export { capitalize };
