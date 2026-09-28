"use client";

import { FlaskConical, Info } from "lucide-react";
import { animate, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Badge } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import { MicroTrend } from "@/components/widgets/kit/micro-trend";
import type { KpiResult, Range } from "@/dashboards/dto";
import type { KpiDef, ValueFormat } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { DAY_MS, MONTHS_ES, daysBetween, formatRange, isoToMs } from "@/lib/dates";
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
  const parts = splitFigure(formatValue(shown, format));
  const { prefix, num } = parts;
  // "1 día" según la cifra mostrada (formatValue decide el plural con el valor sin redondear)
  const suffix = format === "days" ? (num === "1" ? "día" : "días") : parts.suffix;
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
 * Marca "Provisional" (kpiRedesign §5: badge visible, fórmula en el tooltip).
 * Por defecto: badge de texto · small: badge de texto de 18 px (celdas de grupo) · compact: solo el matraz
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
        <FlaskConical className="size-3.5 text-warning-ink" aria-label="Fórmula provisional" />
      ) : small ? (
        <span className="inline-flex h-[18px] items-center gap-0.5 whitespace-nowrap rounded-full bg-warning-soft px-1.5 text-[10.5px] font-semibold leading-none text-warning-ink">
          <FlaskConical className="size-3" aria-hidden />
          Provisional
        </span>
      ) : (
        <Badge tone="warning" icon={<FlaskConical className="size-3" aria-hidden />}>
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

export function sparkLabel(def: KpiDef, spark: (number | null)[], range: Pick<Range, "from" | "to"> | undefined, unitName?: string): string {
  const nums = spark.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!nums.length) return `${def.label}: sin datos en el periodo`;
  const unit = unitName ?? (range ? BUCKET_NAME[bucketDays(range)] : "periodo");
  return `${def.label} por ${unit}: máximo ${formatValue(Math.max(...nums), def.format)}, último ${formatValue(nums[nums.length - 1], def.format)}`;
}

/** Umbrales del remuestreo semanal: huecos (null) en líneas y ceros en columnas. */
const LINE_GAP_MAX = 0.25;
const COLUMN_ZERO_MAX = 0.6;

/**
 * Spark listo para dibujar. Con buckets diarios:
 * - línea (tasas y promedios) con más del 25 % de días sin dato → promedio semanal de los días con dato
 *   (una línea en trozos sueltos se lee como un gráfico roto);
 * - columnas con más del 60 % de días en 0 (procesos por lotes) → suma semanal;
 * - línea plana (todos los valores iguales, p. ej. 0 %) → sin micro-tendencia (no informa nada).
 * Las semanas se cuentan desde el inicio del rango; la última puede ser parcial.
 */
export function resampleSpark(spark: (number | null)[], kind: "columns" | "line", range: Pick<Range, "from" | "to"> | undefined): { values: (number | null)[]; weekly: boolean; flat: boolean } {
  const n = spark.length;
  const nums = spark.filter((v): v is number => v !== null && Number.isFinite(v));
  const flat = kind === "line" && nums.length > 0 && nums.every((v) => v === nums[0]);
  if (!range || bucketDays(range) !== 1 || n < 14 || !nums.length) return { values: spark, weekly: false, flat };
  const nulls = n - nums.length;
  const zeros = nums.filter((v) => v === 0).length;
  const weekly = kind === "line" ? nulls / n > LINE_GAP_MAX : zeros / n > COLUMN_ZERO_MAX;
  if (!weekly) return { values: spark, weekly: false, flat };
  const values: (number | null)[] = [];
  for (let i = 0; i < n; i += 7) {
    const week = spark.slice(i, i + 7).filter((v): v is number => v !== null && Number.isFinite(v));
    if (!week.length) values.push(null);
    else values.push(kind === "line" ? week.reduce((a, b) => a + b, 0) / week.length : week.reduce((a, b) => a + b, 0));
  }
  const wnums = values.filter((v): v is number => v !== null);
  return { values, weekly: true, flat: kind === "line" && wnums.length > 0 && wnums.every((v) => v === wnums[0]) };
}

/** MicroTrend que llena el alto de su contenedor (el svg del kit mide h-8 por defecto). */
export function KpiMicro({ def, result, range, className }: { def: KpiDef; result: KpiResult | undefined; range: Range | undefined; className?: string }) {
  if (!result) return <span aria-hidden className={cn("skeleton block h-full w-full rounded-md opacity-60", className)} />;
  const kind = microKind(def);
  const { values, weekly, flat } = resampleSpark(result.spark, kind, range);
  if (flat) return <div aria-hidden className={cn("h-full min-h-6 w-full", className)} />;
  const label = weekly ? sparkLabel(def, values, range, kind === "line" ? "semana (promedio de los días con dato)" : "semana") : sparkLabel(def, values, range);
  return (
    <div className={cn("relative h-full min-h-6 w-full [&>div]:absolute [&>div]:inset-0 [&>div]:h-full [&>svg]:absolute [&>svg]:inset-0 [&>svg]:h-full", className)}>
      <MicroTrend values={values} kind={kind} weekends={weekly ? undefined : sparkWeekends(range, values.length)} label={label} />
    </div>
  );
}

// ─── Estimaciones de ancho (decisiones de layout sin medir texto) ────────────

/** Ancho aproximado de una etiqueta en Montserrat (≈ 0,58 em por carácter con tildes). */
export function textWidth(text: string, px: number, weight: "medium" | "semibold" = "medium"): number {
  return Math.ceil(text.length * px * (weight === "semibold" ? 0.6 : 0.58));
}

/** Ancho aproximado de una cifra (AnimatedFigure): dígitos 0,66 em, puntuación 0,3 em, unidad a 0,5 em. */
export function figureWidth(value: number | null | undefined, format: ValueFormat, px: number): number {
  if (value === null || value === undefined || Number.isNaN(value)) return Math.ceil(px * 0.7);
  const { prefix, num, suffix } = splitFigure(formatValue(value, format));
  const unit = format === "days" ? (num === "1" ? "día" : "días") : suffix;
  const digits = num.replace(/[^\d]/g, "").length;
  const punct = num.length - digits;
  const small = (t?: string) => (t ? t.length * px * 0.5 * 0.62 + px * 0.14 : 0);
  return Math.ceil(digits * px * 0.66 + punct * px * 0.3 + small(prefix) + small(unit));
}

/** Ancho aproximado de un DeltaChip sm (ícono + texto de 11 px + padding; "base pequeña" suma su nota). */
export function chipWidth(def: KpiDef, result: KpiResult | undefined): number {
  const d = describeDelta(result?.value, result?.previous, def.format, def.polarity);
  const small = d.reason === "small-base";
  return Math.ceil(d.text.length * 5.6 + (small ? 12 : 28) + (small ? 72 : 0));
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

export function FitLabel({ def, available, px, className }: { def: KpiDef; available: number | null; px: number; className?: string }) {
  const { main, note, short } = labelVariants(def);
  const fits = (t: string) => available === null || textWidth(t, px, "semibold") <= available;
  const full = note ? `${main} · ${note}` : main;
  const mode = fits(full) ? "full" : fits(main) ? "main" : fits(short) ? "short" : "clamp";
  return (
    <h3 title={def.label} className={cn("min-w-0 font-semibold text-text-2", mode === "clamp" ? "line-clamp-2" : "truncate", className)}>
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
      ) : mode === "main" && note ? (
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
