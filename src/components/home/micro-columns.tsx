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
 * Variante ancha (112 px): ticks por semana, promedio punteado y máximo anotado (texto en HTML).
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

export function MicroColumns({ values, from, format, label, partialLast = false, variant = "compact", className }: Props) {
  const s = describeSeries(values, from, partialLast);
  if (variant === "wide") return <WideColumns values={values} from={from} format={format} label={label} series={s} className={className} />;

  const W = 132;
  const H = 40;
  const slot = W / s.slots;
  const bw = Math.max(1.4, slot * 0.64);
  const max = s.max || 1;
  const lastValue = s.lastIdx >= 0 ? values[s.lastIdx] : null;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={summary(label, values, s, from, format)}
      className={cn("block h-10 w-full overflow-visible", className)}
    >
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

function WideColumns({
  values,
  from,
  format,
  label,
  series: s,
  className,
}: {
  values: (number | null)[];
  from: string;
  format: ValueFormat;
  label: string;
  series: Series;
  className?: string;
}) {
  const { ref, width } = useElementSize<HTMLDivElement>();
  const slot = width / s.slots;
  const bw = Math.max(2, Math.min(18, slot * 0.62));
  const max = s.max || 1;
  const y = (v: number) => WIDE_H - Math.max(1, (v / max) * (WIDE_H - TOP_PAD));
  const cx = (i: number) => i * slot + slot / 2;
  const fmt = (v: number) => formatValue(v, format, { compact: true });
  // Solo se rotulan días con dato (nunca una fecha futura).
  const ticks = (s.daily ? [0, 7, 14, 21, 28] : [0, s.slots - 1]).filter((i) => i < s.slots && i <= Math.max(0, s.lastIdx));
  const maxLeft = s.maxIdx >= 0 ? Math.min(Math.max(cx(s.maxIdx), 56), Math.max(56, width - 56)) : 0;
  const avgOnLeft = s.maxIdx > s.slots * 0.7;
  const pending = Math.max(0, s.slots - values.length);
  const lastValue = s.lastIdx >= 0 ? values[s.lastIdx] : null;

  return (
    <div className={cn("min-w-0", className)}>
      <div aria-hidden className="mb-2 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-[3px]", DAY_SWATCH)} />
          Día hábil
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-neutral-mark" />
          Fin de semana
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-[3px]", s.partial ? TODAY_SWATCH : "bg-mod")} />
          {s.partial ? "Hoy (parcial)" : "Último día"}
        </span>
        {pending > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full border border-border-strong" />
            Días por venir
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 border-t border-dashed border-text-2" />
          Promedio diario
        </span>
      </div>
      <div ref={ref} className="relative" style={{ height: WIDE_H }} role="img" aria-label={summary(label, values, s, from, format)}>
        {width > 0 && (
          <svg width={width} height={WIDE_H} className="absolute inset-0 overflow-visible" aria-hidden>
            <line x1={0} x2={width} y1={WIDE_H - 0.5} y2={WIDE_H - 0.5} stroke="var(--border)" strokeWidth={1} />
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
            {s.avg !== null && (
              <line x1={0} x2={width} y1={y(s.avg)} y2={y(s.avg)} stroke="var(--text-2)" strokeOpacity={0.7} strokeWidth={1} strokeDasharray="3 3" />
            )}
          </svg>
        )}
        {width > 0 && s.avg !== null && (
          <span
            aria-hidden
            className={cn("tabular absolute -translate-y-full rounded bg-surface/90 px-1 text-[10px] font-semibold leading-4 text-text-2", avgOnLeft ? "left-0" : "right-0")}
            style={{ top: y(s.avg) - 2 }}
          >
            Promedio {fmt(s.avg)}
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
