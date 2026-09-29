"use client";

import { ArrowDown, ListFilter } from "lucide-react";
import { motion } from "motion/react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { DeltaChip } from "@/components/widgets/kit/delta-chip";
import { StatusIcon, TONE_ICON } from "@/components/widgets/kit/status-icon";
import type { KpiResult, Range } from "@/dashboards/dto";
import type { KpiCellDef, KpiDef, StatusTone } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { cn } from "@/lib/cn";
import { TONE_VARS } from "@/lib/charts/semantic";
import { describeDelta, formatPct, formatValue } from "@/lib/format";
import { AnimatedFigure, EASE, FigureSkeleton, FitLabel, goToAnchor, HintIcon, KpiCardShell, KpiMicro, ProvisionalBadge, textWidth } from "./shared";

type TileDef = Extract<KpiCellDef, { kind: "tile" }>;

/**
 * KpiTile: un KPI que merece medidor o acción.
 * gauge: cifra de 30 px (igual que las celdas de grupo: el héroe es la única cifra grande) + medidor 0–100 %
 *   con marcador del periodo anterior y su rótulo "antes X %" justo debajo del marcador (sin metas inventadas).
 *   Si la fila crece (fallback 2×2 de un grupo vecino: banda de 232 px), la micro-tendencia del KPI llena el
 *   espacio entre el chip y el medidor (en vez de ≈ 80 px en blanco); a 184 px no cabe y no se dibuja.
 * status: borde izquierdo de 3 px + acción (filtro o ancla) alineada a la izquierda; medidor 0–100 % si es una
 *   tasa, con escala ("0 %", "antes X %", "100 %") cuando la tarjeta tiene alto libre (ver Gauge › fit). El tono del spec (`cell.tone`) solo se enciende cuando la variación EMPEORA el indicador
 *   (mismo tono que el DeltaChip: describeDelta); si mejora, no cambia o no tiene base, franja en --neutral-mark,
 *   medidor en --chart-1 e ícono en muted (un rojo fijo junto a un chip verde no significa nada). Sin metas
 *   inventadas: no hay umbral. Si la fórmula es provisional, el acento queda solo en la franja (medidor en gris,
 *   sin ícono).
 * compact: fila secundaria de 112 px (etiqueta + cifra con el chip en línea).
 */
export function KpiTile({ cell, def, result, range, loading, index }: { cell: TileDef; def: KpiDef; result?: KpiResult; range?: Range; loading: boolean; index: number }) {
  const tone = cell.tone;
  const status = cell.variant === "status";
  const gauge = def.format === "pct" && (cell.variant === "gauge" || status);
  // El tono del spec significa "alerta": solo con variación desfavorable (el mismo cálculo y tono del DeltaChip)
  const alarm = Boolean(tone) && !loading && describeDelta(result?.value, result?.previous, def.format, def.polarity).tone === "bad";
  const stripe = tone ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: alarm ? TONE_VARS[tone].solid : "var(--neutral-mark)" }} /> : null;

  if (cell.variant === "compact") {
    return (
      <KpiCardShell index={index} label={def.label} className="overflow-hidden">
        {stripe}
        <TileLabel def={def} tone={tone} alarm={alarm} small />
        <div className="mt-1 flex min-h-7 flex-wrap items-end gap-x-2 gap-y-1">
          {loading ? (
            <FigureSkeleton className="h-6 w-20" />
          ) : (
            <>
              <AnimatedFigure value={result?.value} format={def.format} className="text-2xl font-bold leading-none tracking-tight text-text" />
              <DeltaChip value={result?.value} previous={result?.previous} format={def.format} polarity={def.polarity} prevRange={range} />
            </>
          )}
        </div>
        {cell.action && <TileAction action={cell.action} className="mt-auto pt-1" />}
      </KpiCardShell>
    );
  }

  // Provisional: el acento baja a la franja; el medidor no se pinta en el tono sólido
  const muted = Boolean(def.provisional);
  const gaugeColor = muted ? "var(--neutral-mark)" : alarm && tone ? TONE_VARS[tone].solid : "var(--chart-1)";
  return (
    <KpiCardShell index={index} label={def.label} className={cn(status && "overflow-hidden")}>
      {status && stripe}
      <TileLabel def={def} tone={status && !muted ? tone : undefined} alarm={alarm} badge={false} />
      <div className="flex h-[54px] items-end">
        {loading ? <FigureSkeleton className="h-7 w-28" /> : <AnimatedFigure value={result?.value} format={def.format} className="text-[30px] font-bold leading-none tracking-tight text-text" />}
      </div>
      <div className="mt-1.5 flex min-h-[22px] flex-wrap items-center justify-start gap-x-2 gap-y-1.5">
        {loading ? (
          <FigureSkeleton className="h-[22px] w-24 rounded-full" />
        ) : (
          <DeltaChip value={result?.value} previous={result?.previous} format={def.format} polarity={def.polarity} size="md" prevRange={range} showPrevious={!gauge && !def.provisional} />
        )}
        {def.provisional && (
          <span className="flex">
            <ProvisionalBadge def={def} />
          </span>
        )}
        {cell.action && <TileAction action={cell.action} />}
      </div>
      {cell.variant === "gauge" && <StretchMicro def={def} result={loading ? undefined : result} range={range} />}
      {gauge && <Gauge def={def} result={loading ? undefined : result} color={gaugeColor} fit={status} />}
    </KpiCardShell>
  );
}

/** Alto mínimo para dibujar la micro-tendencia (como la del héroe: mínimo 32 px). */
const MICRO_MIN = 32;

/**
 * Micro-tendencia que solo aparece cuando la tarjeta tiene alto de sobra (ocupa el espacio libre, flex-1).
 * Mismo dato y gramática que la del héroe (línea en de-énfasis con el último tramo en --primary, máx. 56 px).
 */
function StretchMicro({ def, result, range }: { def: KpiDef; result?: KpiResult; range?: Range }) {
  const { ref, height, measured } = useElementSize<HTMLDivElement>();
  return (
    <div ref={ref} className="flex min-h-0 flex-1 items-end pt-2">
      {measured && height >= MICRO_MIN && <KpiMicro def={def} result={result} range={range} className="max-h-14" />}
    </div>
  );
}

/** Ícono de tono, badge "Provisional" compacto y (?) junto a la etiqueta del tile. */
const TONE_W = 20;
const HINT_W = 20;
const FLASK_W = 20;

/**
 * `tone` + `alarm`: el ícono del tono en su color solo con variación desfavorable; si no, el mismo ícono en muted
 * (identifica el tipo de indicador sin afirmar que está mal).
 */
function TileLabel({ def, tone, alarm, small, badge = true }: { def: KpiDef; tone?: StatusTone; alarm?: boolean; small?: boolean; badge?: boolean }) {
  const { ref, width, measured } = useElementSize<HTMLDivElement>();
  const room = measured ? width - HINT_W - (tone ? TONE_W : 0) - (badge && def.provisional ? FLASK_W : 0) : null;
  const Icon = tone ? TONE_ICON[tone] : null;
  return (
    <div ref={ref} className={cn("flex min-w-0 items-center gap-1.5", small ? "min-h-4" : "min-h-5")}>
      {tone && (alarm ? <StatusIcon tone={tone} /> : Icon && <Icon aria-hidden strokeWidth={2.25} className="size-3.5 shrink-0 text-muted" />)}
      <FitLabel def={def} available={room} px={small ? 12.5 : 14} className={small ? "text-[12.5px] leading-4" : "text-sm leading-5"} />
      {badge && <ProvisionalBadge def={def} compact={small} />}
      <HintIcon def={def} />
    </div>
  );
}

function TileAction({ action, className }: { action: NonNullable<TileDef["action"]>; className?: string }) {
  const { filters, toggleValue } = useDashboard();
  const f = action.filter;
  const selected = Boolean(f && filters.eq[f.field]?.includes(f.value));
  const cls = cn(
    "-mx-1 inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-semibold text-primary-text transition hover:bg-primary-soft",
    selected && "bg-primary-soft ring-1 ring-primary",
    className,
  );
  if (f) {
    return (
      <button type="button" aria-pressed={selected} onClick={() => toggleValue(f.field, f.value)} className={cls}>
        <ListFilter className="size-3.5" aria-hidden />
        {action.label}
      </button>
    );
  }
  if (action.anchor) {
    const anchor = action.anchor;
    return (
      <a
        href={`#${anchor.replace(/^#/, "")}`}
        onClick={(e) => {
          e.preventDefault();
          goToAnchor(anchor);
        }}
        className={cls}
      >
        {action.label}
        <ArrowDown className="size-3.5" aria-hidden />
      </a>
    );
  }
  return null;
}

/** Rótulos de la escala del medidor ("0 %", "100 %") a 10,5 px. */
const SCALE_START_W = 22;
const SCALE_END_W = 34;

/** Alto del medidor sin escala (pt-2.5 + barra de 8) y de la escala (mt-1 + 14). */
const BAR_H = 18;
const SCALE_H = 18;

/**
 * Medidor 0–100 % con marcador del periodo anterior y escala (una barra sin extremos no se lee).
 * Valores fuera de rango se recortan al borde. El rótulo "antes X %" va justo debajo del marcador (centrado y
 * acotado a la barra); "0 %" y "100 %" se ocultan si el rótulo los pisaría.
 * `fit` (status): con filas de alto fijo (página ≥ 840 px) la escala va solo si hay alto libre en la tarjeta. La
 * zona del medidor ocupa el espacio sobrante (flex-1) con un alto propio fijo de 18 px (barra y escala en posición
 * absoluta), así mostrar u ocultar la escala nunca cambia el alto de la tarjeta ni el de la fila (un chip y una
 * acción que bajan a otra línea ya llenan los 184 px: la escala no la estira). Con alto por contenido, siempre.
 */
function Gauge({ def, result, color, fit }: { def: KpiDef; result?: KpiResult; color: string; fit?: boolean }) {
  const { ref, width, height, measured } = useElementSize<HTMLDivElement>();
  const room = !fit || (measured && height >= BAR_H + SCALE_H);
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const v = result?.value ?? null;
  const prev = result?.previous ?? null;
  const prevText = prev !== null ? `antes ${formatValue(prev, def.format)}` : "";
  const W = measured ? width : 220;
  const labelW = textWidth(prevText, 10.5) + 4;
  const left = prev !== null ? Math.max(0, Math.min(W - labelW, clamp(prev) * W - labelW / 2)) : 0;
  const showStart = prev === null || left > SCALE_START_W + 6;
  const showEnd = prev === null || left + labelW < W - SCALE_END_W - 6;
  const fixed = "@min-[840px]/page:absolute @min-[840px]/page:inset-x-0";
  return (
    <div ref={ref} className={cn("mt-auto pt-2.5", fit && "relative @min-[840px]/page:min-h-[18px] @min-[840px]/page:flex-1 @min-[840px]/page:pt-0")}>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v === null ? undefined : Math.round(v * 1000) / 10}
        aria-valuetext={v === null ? "Sin dato" : `${formatPct(v)}${prev !== null ? `; periodo anterior ${formatPct(prev)}` : ""}`}
        aria-label={def.label}
        className={cn("relative h-2 rounded-full bg-surface-3", fit && fixed, fit && (room ? "@min-[840px]/page:bottom-[18px]" : "@min-[840px]/page:bottom-0"))}
      >
        {v !== null && (
          <motion.span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ background: color }}
            initial={{ width: 0 }}
            animate={{ width: `${clamp(v) * 100}%` }}
            transition={{ duration: 0.5, ease: EASE }}
          />
        )}
        {prev !== null && (
          <span
            title={`Periodo anterior: ${formatValue(prev, def.format)}`}
            className="absolute -top-1 h-4 w-[3px] -translate-x-1/2 rounded-full border border-surface bg-text-2"
            style={{ left: `${clamp(prev) * 100}%` }}
          />
        )}
      </div>
      <div className={cn("tabular relative mt-1 h-3.5 text-[10.5px] leading-[14px] text-muted", fit && fixed, fit && "@min-[840px]/page:bottom-0", !room && "@min-[840px]/page:hidden")}>
        {showStart && <span className="absolute left-0 top-0">0 %</span>}
        {prev !== null && (
          <span aria-hidden className="absolute top-0 whitespace-nowrap text-center font-medium text-text-2" style={{ left, width: labelW }}>
            {prevText}
          </span>
        )}
        {showEnd && <span className="absolute right-0 top-0">100 %</span>}
      </div>
    </div>
  );
}
