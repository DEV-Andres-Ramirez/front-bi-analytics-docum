"use client";

import { DeltaChip } from "@/components/widgets/kit/delta-chip";
import type { KpiResult, Range } from "@/dashboards/dto";
import type { KpiDef } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { AnimatedFigure, FigureSkeleton, FitLabel, HintIcon, KpiCardShell, KpiMicro, ProvisionalBadge } from "./shared";

/** Ícono (?) y badge "Provisional" junto a la etiqueta (con su separación de 6 px). */
const HINT_W = 20;
const BADGE_W = 98;

/**
 * KpiHero: la cifra principal del tablero (exactamente una).
 * 20 etiqueta · 54 caja de cifra (44 px, clamp por ancho) · 6 · 22 delta · 10 · micro-tendencia flex (mín. 32).
 * Con 40 de padding suma 184 (alto de la fila de KPIs en escritorio); si la fila crece, la micro-tendencia se estira.
 */
export function KpiHero({ def, result, range, loading, index }: { def: KpiDef; result?: KpiResult; range?: Range; loading: boolean; index: number }) {
  // La etiqueta larga en 1 línea; si no cabe, sin el paréntesis o la corta (FitLabel), nunca "Asignación (prome…"
  const { ref, width, measured } = useElementSize<HTMLDivElement>();
  const labelRoom = measured ? width - HINT_W - (def.provisional ? BADGE_W : 0) : null;
  return (
    <KpiCardShell index={index} label={def.label} className="overflow-hidden [container-type:inline-size]">
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-primary" />
      <div ref={ref} className="flex min-h-5 min-w-0 items-center gap-1.5">
        <FitLabel def={def} available={labelRoom} px={14} className="text-sm leading-5" />
        <ProvisionalBadge def={def} />
        <HintIcon def={def} />
      </div>
      <div className="flex h-[54px] items-end">
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
      <div className="mt-2.5 flex min-h-8 flex-1">
        <KpiMicro def={def} result={loading ? undefined : result} range={range} />
      </div>
    </KpiCardShell>
  );
}
