"use client";

import { DeltaChip } from "@/components/widgets/kit/delta-chip";
import type { KpiResult, Range } from "@/dashboards/dto";
import type { KpiDef } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { cn } from "@/lib/cn";
import { AnimatedFigure, FigureSkeleton, FitLabel, fitLabelMode, HintIcon, KpiCardShell, KpiMicro, microKind, ProvisionalBadge } from "./shared";

/** Ícono (?) y badge "Provisional" junto a la etiqueta (con su separación de 6 px). */
const HINT_W = 20;
const BADGE_W = 98;

/** Etiqueta larga en 2 líneas (13/16 px): 32 de etiqueta + 42 de caja de cifra = 20 + 54 (misma línea base). */
const TWO_LINE_PX = 13;

/**
 * KpiHero: la cifra principal del tablero (exactamente una).
 * 20 etiqueta · 54 caja de cifra (44 px, clamp por ancho) · 6 · 22 delta · 10 · micro-tendencia flex (mín. 32).
 * Con 40 de padding suma 184 (alto de la fila de KPIs en escritorio); si la fila crece, la micro-tendencia se estira.
 * Si la etiqueta larga no cabe en 1 línea pasa a 2 líneas de 13 px antes que a la corta (el héroe conserva el
 * alcance: "Quejas en gestión y cierre", no "Quejas"); la caja de cifra baja a 42 px y la línea base no se mueve.
 */
export function KpiHero({ def, result, range, loading, index }: { def: KpiDef; result?: KpiResult; range?: Range; loading: boolean; index: number }) {
  // La etiqueta larga en 1 línea; si no cabe, sin el paréntesis o la corta (FitLabel), nunca "Asignación (prome…"
  const { ref, width, measured } = useElementSize<HTMLDivElement>();
  const labelRoom = measured ? width - HINT_W - (def.provisional ? BADGE_W : 0) : null;
  const mode = fitLabelMode(def, labelRoom, 14, TWO_LINE_PX);
  const two = mode === "two";
  return (
    <KpiCardShell index={index} label={def.label} className="overflow-hidden [container-type:inline-size]">
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-primary" />
      <div ref={ref} className="flex min-h-5 min-w-0 items-center gap-1.5">
        <FitLabel def={def} available={labelRoom} px={14} mode={mode} className={two ? "text-[13px] leading-4" : "text-sm leading-5"} />
        <ProvisionalBadge def={def} />
        <HintIcon def={def} />
      </div>
      <div className={cn("flex items-end", two ? "h-[42px]" : "h-[54px]")}>
        {loading ? (
          <FigureSkeleton className="h-9 w-36" />
        ) : (
          <AnimatedFigure value={result?.value} format={def.format} className="text-[clamp(32px,20cqi,44px)] font-bold leading-none tracking-tight text-text" />
        )}
      </div>
      <div className="mt-1.5 flex h-[22px] min-w-0 items-center">
        {loading ? (
          <FigureSkeleton className="h-[22px] w-40 rounded-full" />
        ) : (
          <DeltaChip value={result?.value} previous={result?.previous} format={def.format} polarity={def.polarity} size="md" prevRange={range} showPrevious />
        )}
      </div>
      {/* Columnas: se estiran con la fila (fallback 232). Línea (promedios y tasas): máx. 56 px al pie; estirada a
          90 px una variación pequeña se lee como un desplome */}
      <div className="mt-2.5 flex min-h-8 flex-1 items-end">
        <KpiMicro def={def} result={loading ? undefined : result} range={range} className={microKind(def) === "line" ? "max-h-14" : undefined} />
      </div>
    </KpiCardShell>
  );
}
