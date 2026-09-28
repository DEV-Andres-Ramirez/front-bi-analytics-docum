"use client";

import { Info, SquareFunction } from "lucide-react";
import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { Badge } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import { MicroTrend } from "@/components/widgets/kit/micro-trend";
import type { KpiResult, Range } from "@/dashboards/dto";
import type { KpiDef, ValueFormat } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { DAY_MS, MONTHS_ES, daysBetween, formatRange, isoToMs, weekStart } from "@/lib/dates";
import { describeDelta, formatValue } from "@/lib/format";

/**
 * Piezas comunes de la banda de KPIs (docs/ui-design-system.md §kpiRedesign).
 *
 * Línea base compartida: toda cifra vive en una "caja de cifra" de alto fijo alineada abajo
 * (line-height 1). Con los altos de cabecera de cada tarjeta la línea base cae a ≈ 68 px del
 * borde interior en héroe (20 + 54), grupo (24 + 16 + 2 + 30) y tile (20 + 54).
 */

export const EASE = [0.22, 1, 0.36, 1] as const;

// ─── Cifra animada con unidad en menor tamaño ────────────────────────────────

/** "$ 7,6 mil M" → { prefix: "$", num: "7,6", suffix: "mil M" } · "30,8 %" → { num: "30,8", suffix: "%" } */
export function splitFigure(text: string): { prefix?: string; num: string; suffix?: string } {
  const m = text.match(/^(\$\s?)?([−-]?[\d.,]+)\s?(.*)$/);
  if (!m) return { num: text };
  return { prefix: m[1]?.trim() || undefined, num: m[2], suffix: m[3] || undefined };
}

/**
 * Cifra con count-up (≤ 500 ms, una vez por valor) y la unidad a 0,5 em en text-2.
 * Monta en 0 y anima hasta el valor; en refetch anima desde el valor anterior.
 */
export function AnimatedFigure({ value, format, className, style }: { value: number | null | undefined; format: ValueFormat; className?: string; style?: CSSProperties }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (value === null || value === undefined || reduce) return;
    const controls = animate(from.current, value, { duration: 0.5, ease: EASE, onUpdate: (v) => setDisplay(v) });
    from.current = value;
    return () => controls.stop();
  }, [value, reduce]);

  if (value === null || value === undefined || Number.isNaN(value)) {
    return (
      <span className={cn("text-muted", className)} style={style}>
        —
      </span>
    );
  }
  const shown = reduce ? value : display;
  // Días siempre con 1 decimal y en plural ("1,0 días"): la unidad sale de formatValue
  const { prefix, num, suffix } = splitFigure(formatValue(shown, format));
  return (
    <span className={cn("whitespace-nowrap", className)} style={style}>
      <span className="sr-only">{formatValue(value, format)}</span>
      <span aria-hidden>
        {prefix && <span className="mr-[0.12em] text-[0.52em] font-semibold text-text-2">{prefix}</span>}
        {num}
        {suffix && <span className="ml-[0.14em] text-[0.5em] font-semibold text-text-2">{suffix}</span>}
      </span>
    </span>
  );
}

// ─── Ayudas de etiqueta ──────────────────────────────────────────────────────

export function HintIcon({ def }: { def: KpiDef }) {
  return (
    <Tooltip
      focusable
      className="shrink-0 rounded-full"
      content={
        <span>
          <strong>¿Cómo se calcula?</strong>
          <br />
          {def.hint}
        </span>
      }
    >
      <Info className="size-3.5 text-muted transition hover:text-text" aria-label={`¿Cómo se calcula ${def.label}?`} />
    </Tooltip>
  );
}

/**
 * Ícono de la fórmula provisional (ƒ en un cuadro). FlaskConical queda reservado para el badge global
 * "Datos de prueba" del topbar: el mismo símbolo no puede significar dos cosas.
 */
export const ProvisionalIcon = SquareFunction;

/**
 * Marca "Provisional" (kpiRedesign §5: badge visible, fórmula en el tooltip).
 * Por defecto: badge de texto · small: badge de texto de 18 px (celdas de grupo) · compact: solo el ícono
 * (último recurso cuando no cabe el texto; el tooltip y el aria-label lo nombran).
 */
export function ProvisionalBadge({ def, compact, small }: { def: KpiDef; compact?: boolean; small?: boolean }) {
  if (!def.provisional) return null;
  const tip = (
    <span>
      <strong>Fórmula provisional</strong> · pendiente de validación con negocio.
      <br />
      {def.hint}
    </span>
  );
  return (
    <Tooltip focusable className="shrink-0 rounded-full" content={tip}>
      {compact ? (
        <ProvisionalIcon className="size-3.5 text-warning-ink" aria-label="Fórmula provisional" />
      ) : small ? (
        <span className="inline-flex h-[18px] items-center gap-0.5 whitespace-nowrap rounded-full bg-warning-soft px-1.5 text-[10.5px] font-semibold leading-none text-warning-ink">
          <ProvisionalIcon className="size-3" aria-hidden />
          Provisional
        </span>
      ) : (
        <Badge tone="warning" icon={<ProvisionalIcon className="size-3" aria-hidden />}>
          Provisional
        </Badge>
      )}
    </Tooltip>
  );
}

// ─── Skeletons con el alto exacto ────────────────────────────────────────────

export function FigureSkeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("skeleton inline-block rounded-md", className)} />;
}

// ─── Micro-tendencia ─────────────────────────────────────────────────────────

/** Columnas para medidas aditivas (int/cop/compact); línea para tasas y promedios. */
export function microKind(def: KpiDef): "columns" | "line" {
  return def.format === "pct" || def.format === "days" || def.format === "decimal" ? "line" : "columns";
}

/** Tamaño del bucket del spark (igual que bucketSeries del motor): 1, 7 o 30 días. */
function bucketDays(range: Pick<Range, "from" | "to">): number {
  const days = daysBetween(range.from, range.to) + 1;
  return days > 400 ? 30 : days > 92 ? 7 : 1;
}

const BUCKET_NAME: Record<number, string> = { 1: "día", 7: "semana", 30: "mes" };

export function sparkWeekends(range: Pick<Range, "from" | "to"> | undefined, n: number): boolean[] | undefined {
  if (!range || bucketDays(range) !== 1) return undefined;
  const start = isoToMs(range.from);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(start + i * DAY_MS).getUTCDay();
    return d === 0 || d === 6;
  });
}

export function sparkLabel(def: KpiDef, spark: (number | null)[], range: Pick<Range, "from" | "to"> | undefined, unitName?: string, format: ValueFormat = def.format): string {
  const nums = spark.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!nums.length) return `${def.label}: sin datos en el periodo`;
  const unit = unitName ?? (range ? BUCKET_NAME[bucketDays(range)] : "periodo");
  return `${def.label} por ${unit}: máximo ${formatValue(Math.max(...nums), format)}, último ${formatValue(nums[nums.length - 1], format)}`;
}

/** Umbrales del remuestreo semanal: huecos (null) en líneas, base diaria chica en tasas y ceros en columnas. */
const LINE_GAP_MAX = 0.25;
const LINE_EMPTY_MAX = 0.5;
const COLUMN_ZERO_MAX = 0.6;
/**
 * Base mínima (filas del denominador) para dibujar una tasa o un promedio: un día (o una semana) con menos
 * filas es un hueco. Con 2 salidas un día salta entre 0 % y 100 % y dibuja una tendencia que no existe.
 */
const MIN_RATE_BASE = 5;

/** ¿La medida se puede sumar por semana? (conteos y sumas; un conteo distinto diario no suma el semanal). */
export function additiveMeasure(def: KpiDef): boolean {
  return def.measure.kind === "count" || def.measure.kind === "sum";
}

/** KpiResult con la base diaria del motor (denominador por bucket), cuando la API la exponga. */
type KpiResultWithBase = KpiResult & { sparkBase?: (number | null)[] };

/**
 * Base diaria (denominador) de una tasa o un promedio, para ponderar su micro-tendencia:
 * - `result.sparkBase` si el motor la expone (exacta para ratio, ratioOf y avg);
 * - si no, el spark de un KPI de conteo del mismo tablero con la misma fecha y el mismo filtro que el
 *   denominador: exacta para `ratio` (filas del día que cumplen `den`, o todas); para `avg` es la cantidad de
 *   filas del día (aproximación: el promedio solo cuenta las filas con valor);
 * - `undefined` si no hay cómo saberla (ratioOf, o un `den` sin conteo equivalente).
 */
export function sparkWeights(def: KpiDef, result: KpiResult | undefined, kpis: readonly KpiDef[], results: readonly KpiResult[] | undefined): (number | null)[] | undefined {
  const own = (result as KpiResultWithBase | undefined)?.sparkBase;
  if (own?.length) return own;
  const m = def.measure;
  if (m.kind !== "ratio" && m.kind !== "avg") return undefined;
  const key = JSON.stringify((m.kind === "ratio" ? m.den : m.where) ?? null);
  const base = kpis.find((k) => k.id !== def.id && k.measure.kind === "count" && (k.dateField ?? "") === (def.dateField ?? "") && JSON.stringify(k.measure.where ?? null) === key);
  return base ? results?.find((r) => r.id === base.id)?.spark : undefined;
}

/** Semanas de calendario (lunes a domingo, como AreaTimeseries) que toca el rango: índices de sus días. */
function calendarWeeks(range: Pick<Range, "from">, n: number): number[][] {
  const start = isoToMs(range.from);
  const weeks: number[][] = [];
  let key = Number.NaN;
  for (let i = 0; i < n; i++) {
    const k = weekStart(start + i * DAY_MS);
    if (k !== key) {
      weeks.push([]);
      key = k;
    }
    weeks[weeks.length - 1].push(i);
  }
  return weeks;
}

/** Cantidad de semanas de calendario del rango (buckets de una micro-tendencia semanal). */
export function weekCount(range: Pick<Range, "from" | "to"> | undefined): number {
  if (!range) return 0;
  return calendarWeeks(range, daysBetween(range.from, range.to) + 1).length;
}

const isNum = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

export interface SparkModel {
  values: (number | null)[];
  weekly: boolean;
  /** Línea plana (no informa nada): sin micro-tendencia. */
  flat: boolean;
  /** Semanal de una medida aditiva: promedio diario de cada semana (las semanas parciales se comparan bien). */
  perDay: boolean;
}

/**
 * Spark listo para dibujar. Con buckets diarios:
 * - línea (tasas y promedios) con base conocida (`weights`): los días con menos de MIN_RATE_BASE filas son hueco;
 * - línea con más del 25 % de días sin dato, o con más de la mitad de los días sin dato o en 0 → semanal;
 * - columnas aditivas con más del 60 % de días en 0 (procesos por lotes) → semanal;
 * - `force` (el grupo ya va por semana) remuestrea igual, salvo columnas no aditivas;
 * - línea plana (todos los valores iguales, p. ej. 0 %) → sin micro-tendencia (no informa nada).
 * Semanas de calendario (lunes a domingo, igual que AreaTimeseries). Valor semanal:
 * - tasa o promedio: Σ(valor·base) / Σbase (la tasa real de la semana; un sábado con 2 filas pesa 2, no lo
 *   mismo que un martes con 56). Semana con base menor que MIN_RATE_BASE → hueco. Sin base conocida no se
 *   puede ponderar: no se dibuja (un promedio simple de % diarios invierte la tendencia);
 * - aditiva: promedio diario de la semana (la primera y la última pueden ser parciales: su suma se leería
 *   como un desplome).
 */
export function resampleSpark(
  spark: (number | null)[],
  kind: "columns" | "line",
  range: Pick<Range, "from" | "to"> | undefined,
  { additive = true, force = false, weights }: { additive?: boolean; force?: boolean; weights?: (number | null)[] } = {},
): SparkModel {
  const n = spark.length;
  const isFlat = (vals: (number | null)[]) => {
    const nums = vals.filter(isNum);
    return kind === "line" && nums.length > 0 && nums.every((v) => v === nums[0]);
  };
  const rate = kind === "line" && !additive;
  // Tasas y promedios con base conocida: los días de base chica no se dibujan
  const daily = rate && weights ? spark.map((v, i) => (isNum(v) && (weights[i] ?? 0) < MIN_RATE_BASE ? null : v)) : spark;
  const nums = daily.filter(isNum);
  const keep: SparkModel = { values: daily, weekly: false, flat: isFlat(daily), perDay: false };
  if (!range || bucketDays(range) !== 1 || n < 14 || !spark.some(isNum)) return keep;
  if (kind === "columns" && !additive) return keep;
  const nulls = n - nums.length;
  const zeros = nums.filter((v) => v === 0).length;
  const weekly = force || (kind === "line" ? nulls / n > LINE_GAP_MAX || (nulls + zeros) / n > LINE_EMPTY_MAX : zeros / n > COLUMN_ZERO_MAX);
  if (!weekly) return keep;
  if (rate && !weights) return { values: [], weekly: true, flat: true, perDay: false };

  const values = calendarWeeks(range, n).map((idx) => {
    if (rate) {
      let num = 0;
      let den = 0;
      for (const i of idx) {
        const v = spark[i];
        const w = weights?.[i] ?? 0;
        if (isNum(v) && w > 0) {
          num += v * w;
          den += w;
        }
      }
      return den >= MIN_RATE_BASE ? num / den : null;
    }
    const days = idx.filter((i) => isNum(spark[i]));
    return days.length ? days.reduce((a, i) => a + (spark[i] as number), 0) / days.length : null;
  });
  return { values, weekly: true, flat: isFlat(values), perDay: !rate };
}

/**
 * MicroTrend que llena el alto de su contenedor (el svg del kit mide h-8 por defecto).
 * `weekly`: el grupo decidió buckets semanales para todas sus micro-tendencias.
 * `kind`: forma forzada por el grupo (p. ej. línea también para las aditivas cuando el grupo va por semana
 * con pocas semanas: 5 columnas de 20 px se leen como bloques de skeleton junto a líneas).
 * Las tasas y promedios se ponderan con su base diaria (sparkWeights) al pasar a semanal.
 */
export function KpiMicro({
  def,
  result,
  range,
  weekly: forceWeekly,
  kind: forceKind,
  className,
}: {
  def: KpiDef;
  result: KpiResult | undefined;
  range: Range | undefined;
  weekly?: boolean;
  kind?: "columns" | "line";
  className?: string;
}) {
  const { spec, data } = useDashboard();
  if (!result) return <span aria-hidden className={cn("skeleton block h-full w-full rounded-md opacity-60", className)} />;
  const kind = forceKind ?? microKind(def);
  const additive = additiveMeasure(def);
  const weights = additive ? undefined : sparkWeights(def, result, spec.kpis, data?.kpis);
  const { values, weekly, flat, perDay } = resampleSpark(result.spark, kind, range, { additive, force: forceWeekly, weights });
  if (flat) return <div aria-hidden className={cn("h-full min-h-6 w-full", className)} />;
  const label = weekly ? sparkLabel(def, values, range, perDay ? "semana (promedio diario)" : "semana", perDay && (def.format === "int" || def.format === "compact") ? "decimal" : undefined) : sparkLabel(def, values, range);
  return (
    <div className={cn("relative h-full min-h-6 w-full [&>div]:absolute [&>div]:inset-0 [&>div]:h-full [&>svg]:absolute [&>svg]:inset-0 [&>svg]:h-full", className)}>
      <MicroTrend values={values} kind={kind} weekends={weekly ? undefined : sparkWeekends(range, values.length)} label={label} />
    </div>
  );
}

// ─── Estimaciones de ancho (decisiones de layout sin medir texto) ────────────

/**
 * Avance por carácter de Montserrat 500 en em, medido en el navegador (canvas de 100 px; el resto ≈ 0,62).
 * Un promedio fijo por carácter sobrestimaba hasta un 25 % las etiquetas con "i", "l", "t", "%" o espacios
 * ("% Fuera horario", "Ciclo total") y subestimaba las de "m"/"D" ("Departamentos"); la tabla anterior,
 * por tramos, aún sobrestimaba ≈ 3 % ("Fuera de término" 9,09 em frente a 8,82 reales).
 */
const CHAR_EM: Record<string, number> = {};
for (const [em, chars] of [
  [0.23, ".,"],
  [0.27, " ·"],
  [0.28, "ijlí"],
  [0.31, "IÍ"],
  [0.34, "()"],
  [0.35, "f"],
  [0.37, "1"],
  [0.38, "-"],
  [0.4, "rt"],
  [0.5, "s"],
  [0.51, "J"],
  [0.52, "z"],
  [0.55, "vxy"],
  [0.56, "c"],
  [0.57, "235"],
  [0.59, "L"],
  [0.6, "7aáT"],
  [0.61, "eé"],
  [0.62, "69kS"],
  [0.63, "F"],
  [0.64, "8oó"],
  [0.66, "XZ"],
  [0.67, "04EÉ"],
  [0.68, "bdhnpquúñC"],
  [0.69, "gY"],
  [0.71, "PV"],
  [0.72, "K"],
  [0.73, "R%"],
  [0.74, "AÁ"],
  [0.76, "B"],
  [0.77, "G"],
  [0.79, "UÚ"],
  [0.81, "HNÑ"],
  [0.83, "D"],
  [0.84, "OQÓ"],
  [0.89, "w"],
  [0.96, "M"],
  [1.06, "m"],
  [1.13, "W"],
] as const) {
  for (const c of chars) CHAR_EM[c] = em;
}
/** Holgura del 4 % (hinting de Windows, métrica de la fuente de respaldo antes de cargar Montserrat). */
const TEXT_SAFETY = 1.04;

/** Ancho aproximado de una etiqueta en Montserrat (medium; semibold ≈ +2 %). */
export function textWidth(text: string, px: number, weight: "medium" | "semibold" = "medium"): number {
  let em = 0;
  for (const c of text) em += CHAR_EM[c] ?? 0.62;
  return Math.ceil(em * px * TEXT_SAFETY * (weight === "semibold" ? 1.02 : 1));
}

/** Ancho aproximado de una cifra (AnimatedFigure): dígitos 0,66 em, puntuación 0,3 em, unidad a 0,5 em. */
export function figureWidth(value: number | null | undefined, format: ValueFormat, px: number): number {
  if (value === null || value === undefined || Number.isNaN(value)) return Math.ceil(px * 0.7);
  const { prefix, num, suffix: unit } = splitFigure(formatValue(value, format));
  const digits = num.replace(/[^\d]/g, "").length;
  const punct = num.length - digits;
  const small = (t?: string) => (t ? t.length * px * 0.5 * 0.62 + px * 0.14 : 0);
  return Math.ceil(digits * px * 0.66 + punct * px * 0.3 + small(prefix) + small(unit));
}

/**
 * Ancho aproximado de un DeltaChip sm (medido en Montserrat: texto de 11 px ≈ 6,2 px/carácter + ícono 16 +
 * padding 12; con base pequeña, sin ícono y con la nota "base pequeña" de 78 px + 6 de separación + holgura).
 * `withNote = false`: el chip solo (la nota se puede ocultar si no cabe).
 */
export function chipWidth(def: KpiDef, result: KpiResult | undefined, withNote = true): number {
  const d = describeDelta(result?.value, result?.previous, def.format, def.polarity);
  const small = d.reason === "small-base";
  return Math.ceil(d.text.length * 6.2 + (small ? 14 : 30) + (small && withNote ? 86 : 0));
}

/** Badge "Provisional" de 18 px (ProvisionalBadge small). */
export const PROVISIONAL_W = 82;

/**
 * Etiqueta de KPI que cabe en 1 línea: prueba la etiqueta larga (con el paréntesis final en muted tras "·";
 * en días sin la palabra "días", que ya dice la cifra), luego sin el paréntesis y luego la corta.
 * Si nada cabe, la principal en 2 líneas. El title conserva la etiqueta completa.
 */
export function labelVariants(def: KpiDef): { main: string; note?: string; short: string } {
  const m = def.label.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  const main = m ? m[1] : def.label;
  let note = m ? m[2] : undefined;
  if (note && def.format === "days") note = note.replace(/\s*d[ií]as?\b/i, "").trim() || undefined;
  return { main, note, short: def.short ?? main };
}

/** ¿Cabe `text` en `lines` líneas de `width` px? (ajuste por palabras, como el navegador). */
export function fitsLines(text: string, px: number, width: number, lines: number, weight: "medium" | "semibold" = "medium"): boolean {
  const space = textWidth(" ", px, weight);
  let line = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = textWidth(word, px, weight);
    if (w > width) return false;
    if (used === 0) used = w;
    else if (used + space + w <= width) used += space + w;
    else {
      line++;
      used = w;
    }
  }
  return line <= lines;
}

/**
 * Variante de etiqueta que cabe: "full" (larga con la nota) · "main" (sin el paréntesis) · "two" (la principal
 * en 2 líneas a `twoLinePx`, solo si se pide: el héroe conserva el alcance antes que caer a la corta) ·
 * "short" · "clamp" (la principal en 2 líneas, último recurso).
 */
export type LabelMode = "full" | "main" | "two" | "short" | "clamp";

export function fitLabelMode(def: KpiDef, available: number | null, px: number, twoLinePx?: number): LabelMode {
  const { main, note, short } = labelVariants(def);
  const fits = (t: string) => available === null || textWidth(t, px, "semibold") <= available;
  if (fits(note ? `${main} · ${note}` : main)) return "full";
  if (fits(main)) return "main";
  if (twoLinePx && available !== null && short !== main && fitsLines(main, twoLinePx, available, 2, "semibold")) return "two";
  return fits(short) ? "short" : "clamp";
}

export function FitLabel({ def, available, px, mode: forced, className }: { def: KpiDef; available: number | null; px: number; mode?: LabelMode; className?: string }) {
  const { main, note, short } = labelVariants(def);
  const mode = forced ?? fitLabelMode(def, available, px);
  return (
    <h3 title={def.label} className={cn("min-w-0 font-semibold text-text-2", mode === "clamp" || mode === "two" ? "line-clamp-2" : "truncate", className)}>
      {mode === "short" ? (
        <>
          <span aria-hidden>{short}</span>
          <span className="sr-only">{def.label}</span>
        </>
      ) : mode === "full" && note ? (
        <>
          {main}
          <span className="font-medium text-muted"> · {note}</span>
        </>
      ) : mode !== "full" && note ? (
        <>
          <span aria-hidden>{main}</span>
          <span className="sr-only">{def.label}</span>
        </>
      ) : (
        main
      )}
    </h3>
  );
}

// ─── Fechas de la cabecera ───────────────────────────────────────────────────

/** "1 – 28 sept 2026" (mismo mes) · "4 ago – 2 sept 2026" · "28 dic 2025 – 3 ene 2026". */
export function formatSpan(from: string, to: string): string {
  if (from === to) return formatRange(from, to);
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  if (y1 === y2 && m1 === m2) return `${d1} – ${d2} ${MONTHS_ES[m2 - 1]} ${y2}`;
  return formatRange(from, to);
}

// ─── Navegación a secciones ──────────────────────────────────────────────────

export function goToAnchor(anchor: string) {
  const id = anchor.replace(/^#/, "");
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  window.history.replaceState(window.history.state, "", `#${id}`);
}

// ─── Tarjeta con entrada escalonada ──────────────────────────────────────────

export function KpiCardShell({
  index,
  className,
  children,
  label,
  style,
}: {
  index: number;
  className?: string;
  children: ReactNode;
  label: string;
  style?: CSSProperties;
}) {
  return (
    <motion.article
      aria-label={label}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.15), ease: EASE }}
      className={cn("dash-card card relative", className)}
      style={style}
    >
      {children}
    </motion.article>
  );
}

export function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLocaleLowerCase("es-CO") + s.slice(1) : s;
}
