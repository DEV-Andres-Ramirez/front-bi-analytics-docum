import type { GeoValue } from "@/dashboards/dto";
import type { ValueFormat } from "@/dashboards/types";
import { formatValue } from "@/lib/format";

/**
 * Clasificación del mapa (colorSystem G · mapRedesign 6):
 * - 5 clases por cuantiles sobre los valores > 0 (con ≤ 5 valores distintos, una clase por valor);
 * - colores seq-2…6 del tema (si hay menos clases, se reparten a lo largo de la rampa);
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
}

export interface Classification {
  classes: MapClass[];
  /** Índice de clase (en `classes`) de un valor; -1 = sin registros. */
  classOf: (value: number) => number;
}

/** Posiciones de rampa para n clases (siempre incluye el extremo más intenso). */
function rampSlots(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [MAX_CLASSES - 1];
  if (n >= MAX_CLASSES) return [0, 1, 2, 3, 4];
  return Array.from({ length: n }, (_, i) => Math.round((i * (MAX_CLASSES - 1)) / (n - 1)));
}

export function classify(values: number[], k = MAX_CLASSES): Classification {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!positive.length) return { classes: [], classOf: () => -1 };
  const distinct = [...new Set(positive)];
  let uppers: number[];
  if (distinct.length <= k) {
    uppers = distinct;
  } else {
    const n = positive.length;
    uppers = [];
    for (let i = 0; i < k; i++) {
      const idx = Math.min(n - 1, Math.ceil(((i + 1) * n) / k) - 1);
      const ub = positive[idx];
      if (!uppers.length || ub > uppers[uppers.length - 1]) uppers.push(ub);
    }
    if (uppers[uppers.length - 1] !== positive[n - 1]) uppers.push(positive[n - 1]);
  }
  const slots = rampSlots(uppers.length);
  const classes: MapClass[] = uppers.map((_, i) => ({ ramp: slots[i], min: Infinity, max: -Infinity, count: 0 }));
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
  return { classes, classOf };
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
 * "Radicados por departamento del remitente" · "Tutelas por departamento" (+ "Territorio de la tutela").
 */
export function panelTitle(unit: MapUnit, geoLabel: string, level: "dpto" | "mpio"): { title: string; geo: string | null } {
  const nivel = level === "dpto" ? "departamento" : "municipio";
  const same = geoLabel.trim().toLowerCase() === unit.singular.toLowerCase();
  if (same) return { title: `${capitalize(unit.plural)} por ${nivel}`, geo: `Territorio ${geoPhrase(geoLabel)}` };
  return { title: `${capitalize(unit.plural)} por ${nivel} ${geoPhrase(geoLabel)}`.trim(), geo: null };
}

/** Nombre corto para rótulos en el lienzo. */
export function shortGeoName(name: string): string {
  if (/^san andr[eé]s/i.test(name)) return "San Andrés";
  return name;
}

export { capitalize };
