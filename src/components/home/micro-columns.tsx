"use client";

import type { ValueFormat } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { cn } from "@/lib/cn";
import { formatValue } from "@/lib/format";
import { dayLabel, daysInMonthOf, isWeekend } from "./home-data";

/**
 * Micro-columnas diarias del mes en curso (tarjetas del Home).
 * Excepción documentada al "solo chrome": usan el color del módulo.
 * - días hábiles en --mod mezclado con la superficie (70 % claro / 75 % oscuro: 2,3–3,7:1 frente a la tarjeta);
 * - fines de semana en gris (--neutral-mark);
 * - el último día con dato en --mod al 100 %; si es HOY (parcial) va solo con contorno para no leerse como caída;
 * - un último día en 0 se marca con un punto del módulo en la base (una barra de 1 px no se ve);
 * - null es un hueco (nunca 0); los días que faltan del mes se marcan con un anillo en la base.
 * Variante ancha (112 px): ticks por semana, línea de referencia punteada y máximo anotado (texto en HTML).
 * La etiqueta de la referencia va en un canal propio a la derecha del área de trazado: nunca tapa barras.
 */
interface Props {
  values: (number | null)[];
  /** Primer día de la serie (range.from). */
  from: string;
  format: ValueFormat;
  /** Qué mide la serie, para el resumen accesible ("Radicados por día"). */
  label: string;
  /** El último día de la serie es hoy (dato parcial). */
  partialLast?: boolean;
  /**
   * Variante ancha: valor del mes para la línea de referencia (KPIs de promedio o porcentaje, donde la media
   * simple de los días no coincide con la cifra del mes). Sin él, la línea es el promedio diario.
   */
  reference?: number | null;
  variant?: "compact" | "wide";
  className?: string;
}

/** Relleno de los días hábiles: mezcla oklab con la superficie (clases estáticas para Tailwind). */
const DAY_FILL = "fill-[color-mix(in_oklab,var(--mod)_70%,var(--surface))] dark:fill-[color-mix(in_oklab,var(--mod)_75%,var(--surface))]";
const DAY_SWATCH = "bg-[color-mix(in_oklab,var(--mod)_70%,var(--surface))] dark:bg-[color-mix(in_oklab,var(--mod)_75%,var(--surface))]";
const TODAY_FILL = "fill-[color-mix(in_oklab,var(--mod)_22%,var(--surface))]";
const TODAY_SWATCH = "border border-mod bg-[color-mix(in_oklab,var(--mod)_22%,var(--surface))]";

interface Series {
  slots: number;
  daily: boolean;
  max: number;
  maxIdx: number;
  lastIdx: number;
  /** El último dato es hoy (parcial). */
  partial: boolean;
  /** Promedio de los días completos (sin el parcial de hoy). */
  avg: number | null;
}

function describeSeries(values: (number | null)[], from: string, partialLast: boolean): Series {
  const month = daysInMonthOf(from);
  const daily = values.length <= month;
  const slots = daily ? month : values.length;
  let lastIdx = -1;
  values.forEach((v, i) => {
    if (v !== null && Number.isFinite(v)) lastIdx = i;
  });
  const partial = partialLast && lastIdx >= 0 && lastIdx === values.length - 1;
  let max = 0;
  let maxIdx = -1;
  let sum = 0;
  let n = 0;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) return;
    if (maxIdx < 0 || v > max) {
      max = v;
      maxIdx = i;
    }
    if (partial && i === lastIdx) return;
    sum += v;
    n += 1;
  });
  return { slots, daily, max, maxIdx, lastIdx, partial, avg: n ? sum / n : null };
}

type BarKind = "day" | "weekend" | "last" | "today";

function barKind(i: number, s: Series, from: string): BarKind {
  if (i === s.lastIdx) return s.partial ? "today" : "last";
  if (s.daily && isWeekend(from, i)) return "weekend";
  return "day";
}

/** Atributos de cada barra según su tipo (el color de día hábil va por clase: depende del tema). */
function barProps(kind: BarKind): { className?: string; fill?: string; stroke?: string } {
  if (kind === "last") return { fill: "var(--mod)" };
  if (kind === "today") return { className: TODAY_FILL, stroke: "var(--mod)" };
  if (kind === "weekend") return { fill: "var(--neutral-mark)" };
  return { className: DAY_FILL };
}

/** Lectura de las marcas especiales de la variante compacta (no tiene leyenda visible). */
function marksHint(values: (number | null)[], s: Series): string {
  const parts = [s.partial ? "Barra hueca: hoy (dato parcial)" : null, s.slots > values.length ? "○: días por venir" : null, s.daily ? "gris: fin de semana" : null];
  return parts.filter(Boolean).join(" · ");
}

function summary(label: string, values: (number | null)[], s: Series, from: string, format: ValueFormat): string {
  if (s.maxIdx < 0) return `${label}: sin datos en el periodo`;
  const fmt = (v: number) => formatValue(v, format, { compact: true });
  const last = values[s.lastIdx] ?? 0;
  return `${label}: máximo ${fmt(s.max)} el ${dayLabel(from, s.maxIdx)}; ${s.partial ? "hoy (parcial)" : "último día"} ${fmt(last)}`;
}

/**
 * Punto redondo que no se deforma aunque el SVG se estire (preserveAspectRatio="none"):
 * trazo de longitud 0 con remate redondo y grosor en píxeles de pantalla.
 */
function Dot({ x, y, size, color }: { x: number; y: number; size: number; color: string }) {
  return <path d={`M${x} ${y}h0`} stroke={color} strokeWidth={size} strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
}

export function MicroColumns({ values, from, format, label, partialLast = false, reference = null, variant = "compact", className }: Props) {
  const s = describeSeries(values, from, partialLast);
  if (variant === "wide")
    return <WideColumns values={values} from={from} format={format} label={label} series={s} reference={reference} className={className} />;

  const W = 132;
  const H = 40;
  const slot = W / s.slots;
  const bw = Math.max(1.4, slot * 0.64);
  const max = s.max || 1;
  const lastValue = s.lastIdx >= 0 ? values[s.lastIdx] : null;
  const text = summary(label, values, s, from, format);
  const hint = marksHint(values, s);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={hint ? `${text}. ${hint}` : text}
      className={cn("block h-8 w-full overflow-visible", className)}
    >
      {/* Tooltip nativo: explica la barra hueca (hoy) y los anillos (días por venir), que no tienen leyenda aquí. */}
      <title>{hint ? `${text}\n${hint}` : text}</title>
      <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--hairline)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <g className="micro-grow">
        {values.map((v, i) => {
          if (v === null || !Number.isFinite(v)) return null;
          const kind = barKind(i, s, from);
          if (v === 0 && (kind === "last" || kind === "today")) return null;
          const h = Math.max(1, (v / max) * (H - 2));
          return (
            <rect
              key={i}
              x={i * slot + (slot - bw) / 2}
              y={H - h}
              width={bw}
              height={h}
              rx={Math.min(1, bw / 2)}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              {...barProps(kind)}
            />
          );
        })}
      </g>
      {lastValue === 0 && <Dot x={s.lastIdx * slot + slot / 2} y={H - 2} size={3.5} color="var(--mod)" />}
      {Array.from({ length: Math.max(0, s.slots - values.length) }, (_, k) => {
        const x = (values.length + k) * slot + slot / 2;
        return (
          <g key={`f${k}`}>
            <Dot x={x} y={H - 2} size={4} color="var(--border-strong)" />
            <Dot x={x} y={H - 2} size={2} color="var(--surface)" />
          </g>
        );
      })}
    </svg>
  );
}

const WIDE_H = 112;
const TOP_PAD = 22;
/** Canal derecho para la etiqueta de la línea de referencia (fuera del área de trazado). */
const GUTTER = 58;
/** Media anchura estimada de la anotación del máximo ("Máx. 3,6 días · 25 sept"). */
const MAX_HALF = 58;

function WideColumns({
  values,
  from,
  format,
  label,
  series: s,
  reference,
  className,
}: {
  values: (number | null)[];
  from: string;
  format: ValueFormat;
  label: string;
  series: Series;
  reference: number | null;
  className?: string;
}) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  // Línea de referencia: el valor del mes (si llega) o el promedio de los días completos.
  const isMonth = reference !== null && Number.isFinite(reference);
  const lineValue = isMonth ? reference : s.avg;
  const gutter = lineValue !== null ? GUTTER : 0;
  const plotW = Math.max(0, width - gutter);
  const slot = plotW / s.slots;
  const bw = Math.max(2, Math.min(18, slot * 0.62));
  const max = Math.max(s.max, lineValue ?? 0) || 1;
  const y = (v: number) => WIDE_H - Math.max(1, (v / max) * (WIDE_H - TOP_PAD));
  const cx = (i: number) => i * slot + slot / 2;
  const fmt = (v: number) => formatValue(v, format, { compact: true });
  // Solo se rotulan días con dato (nunca una fecha futura).
  const ticks = (s.daily ? [0, 7, 14, 21, 28] : [0, s.slots - 1]).filter((i) => i < s.slots && i <= Math.max(0, s.lastIdx));
  const maxLeft = s.maxIdx >= 0 ? Math.min(Math.max(cx(s.maxIdx), MAX_HALF), Math.max(MAX_HALF, plotW - MAX_HALF)) : 0;
  const pending = Math.max(0, s.slots - values.length);
  const lastValue = s.lastIdx >= 0 ? values[s.lastIdx] : null;
  // "Fin de semana" solo se rotula si hay alguna barra gris (sin marca no hay leyenda).
  const hasWeekend = s.daily && values.some((v, i) => v !== null && Number.isFinite(v) && i !== s.lastIdx && isWeekend(from, i));
  const hasWeekday = values.some((v, i) => v !== null && Number.isFinite(v) && i !== s.lastIdx && !(s.daily && isWeekend(from, i)));
  const lineLabel = isMonth ? "Mes" : "Promedio";

  return (
    <div className={cn("min-w-0", className)}>
      <div aria-hidden className="mb-2 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        {hasWeekday && (
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-[3px]", DAY_SWATCH)} />
            Día hábil
          </span>
        )}
        {hasWeekend && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-neutral-mark" />
            Fin de semana
          </span>
        )}
        {s.lastIdx >= 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-[3px]", s.partial ? TODAY_SWATCH : "bg-mod")} />
            {s.partial ? "Hoy (parcial)" : "Último día"}
          </span>
        )}
        {pending > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full border border-border-strong" />
            Días por venir
          </span>
        )}
        {lineValue !== null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 border-t border-dashed border-text-2" />
            {isMonth ? "Valor del mes" : "Promedio diario"}
          </span>
        )}
      </div>
      <div ref={ref} className="relative" style={{ height: WIDE_H }} role="img" aria-label={summary(label, values, s, from, format)}>
        {width > 0 && (
          <svg width={width} height={WIDE_H} className="absolute inset-0 overflow-visible" aria-hidden>
            <line x1={0} x2={plotW} y1={WIDE_H - 0.5} y2={WIDE_H - 0.5} stroke="var(--border)" strokeWidth={1} />
            <g className="micro-grow">
              {values.map((v, i) => {
                if (v === null || !Number.isFinite(v)) return null;
                const kind = barKind(i, s, from);
                if (v === 0 && (kind === "last" || kind === "today")) return null;
                const top = y(v);
                const inset = kind === "today" ? 0.5 : 0;
                return (
                  <rect
                    key={i}
                    x={cx(i) - bw / 2 + inset}
                    y={top + inset}
                    width={bw - inset * 2}
                    height={WIDE_H - top - inset}
                    rx={Math.min(3, bw / 2)}
                    strokeWidth={1}
                    {...barProps(kind)}
                  />
                );
              })}
            </g>
            {lastValue === 0 && <circle cx={cx(s.lastIdx)} cy={WIDE_H - 2.5} r={2.5} fill="var(--mod)" />}
            {Array.from({ length: pending }, (_, k) => (
              <circle key={`f${k}`} cx={cx(values.length + k)} cy={WIDE_H - 3} r={2.25} fill="none" stroke="var(--border-strong)" strokeWidth={1.25} />
            ))}
            {lineValue !== null && (
              <line x1={0} x2={plotW + 2} y1={y(lineValue)} y2={y(lineValue)} stroke="var(--text-2)" strokeOpacity={0.7} strokeWidth={1} strokeDasharray="3 3" />
            )}
          </svg>
        )}
        {/* Etiqueta de la referencia en el canal derecho (sin fondo: no tapa ninguna barra). */}
        {width > 0 && lineValue !== null && (
          <span
            aria-hidden
            className="tabular absolute flex -translate-y-1/2 flex-col whitespace-nowrap text-[10px] leading-3"
            style={{ left: plotW + 6, top: Math.min(Math.max(y(lineValue), 12), WIDE_H - 12) }}
          >
            <span className="text-muted">{lineLabel}</span>
            <span className="font-semibold text-text-2">{fmt(lineValue)}</span>
          </span>
        )}
        {width > 0 && s.maxIdx >= 0 && (
          <span
            aria-hidden
            className="tabular absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold leading-4 text-text"
            style={{ left: maxLeft, top: Math.max(0, y(s.max) - 18) }}
          >
            Máx. {fmt(s.max)} · {dayLabel(from, s.maxIdx)}
          </span>
        )}
      </div>
      <div aria-hidden className="relative mt-1 h-4">
        {width > 0 &&
          ticks.map((i) => (
            <span
              key={i}
              className={cn("tabular absolute whitespace-nowrap text-[10px] leading-4 text-muted", i > 0 && "-translate-x-1/2")}
              style={{ left: i === 0 ? Math.max(0, cx(0) - bw / 2) : cx(i) }}
            >
              {s.daily ? (i === 0 ? dayLabel(from, i) : dayLabel(from, i).split(" ")[0]) : i + 1}
            </span>
          ))}
      </div>
    </div>
  );
}
