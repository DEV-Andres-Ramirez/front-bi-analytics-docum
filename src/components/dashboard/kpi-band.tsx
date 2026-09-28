"use client";

import { CircleHelp, Loader2 } from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import type { KpiResult, Range } from "@/dashboards/dto";
import { templateSpans, templateSpansMd } from "@/dashboards/layout";
import type { KpiCellDef, KpiDef, KpiRowDef } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { previousRange } from "@/lib/dates";
import { useDashboard } from "./dashboard-context";
import { fallbackKpiLayout } from "./kpi/fallback";
import { KpiGroup } from "./kpi/kpi-group";
import { KpiHero } from "./kpi/kpi-hero";
import { KpiTile } from "./kpi/kpi-tile";
import { formatSpan } from "./kpi/shared";

/**
 * Banda de KPIs (docs/ui-design-system.md §KpiBand y §kpiRedesign):
 * cabecera única con el rango y el periodo de comparación + filas con plantilla cerrada
 * (mismo grid .dash-row que las secciones, tier "kpi": 184 px o 112 px compacta en escritorio).
 * Un solo KpiHero; grupos por tema (≤ 4 métricas); tiles solo con medidor o acción.
 */
export function KpiBand() {
  const { spec, data, filters, isFetching } = useDashboard();
  const rows = useMemo(() => spec.kpiLayout ?? fallbackKpiLayout(spec.kpis), [spec.kpiLayout, spec.kpis]);
  const defs = useMemo(() => new Map(spec.kpis.map((k) => [k.id, k] as const)), [spec.kpis]);
  const results = useMemo(() => new Map((data?.kpis ?? []).map((k) => [k.id, k] as const)), [data?.kpis]);
  const range: Range = data?.range ?? { from: filters.from, to: filters.to, ...previousRange(filters.from, filters.to) };
  const loading = !data;
  const refetching = isFetching && Boolean(data);
  const offsets = rows.map((_, r) => rows.slice(0, r).reduce((a, x) => a + x.cells.length, 0));

  if (!rows.length) return null;

  return (
    <section aria-labelledby="kpi-band-title" className="mt-6">
      <div className="mb-3 text-[13px] leading-6 text-muted">
        <h2 id="kpi-band-title" className="inline">
          Indicadores del <span className="whitespace-nowrap font-semibold text-text-2">{formatSpan(range.from, range.to)}</span>
          <span aria-hidden> · </span>
          comparado con <span className="whitespace-nowrap font-semibold text-text-2">{formatSpan(range.prevFrom, range.prevTo)}</span>
        </h2>
        <Tooltip
          focusable
          className="ml-1.5 rounded-full align-[-3px]"
          content={
            <span className="block space-y-1.5">
              <span className="block">
                Cada indicador se compara con el <strong>periodo anterior de igual duración</strong> ({formatSpan(range.prevFrom, range.prevTo)}).
              </span>
              <span className="block">Los porcentajes varían en puntos porcentuales (p.p.); el resto, en variación relativa.</span>
              <span className="block">
                Verde: la variación mejora el indicador · rojo: lo empeora (según su polaridad) · gris: sin cambio, sin base o base pequeña (menos de 20).
              </span>
            </span>
          }
        >
          <CircleHelp className="size-4 text-muted transition hover:text-text" aria-label="Cómo leer las variaciones" />
        </Tooltip>
        {refetching && <Loader2 className="ml-2 inline size-3.5 animate-spin align-[-2px] text-muted" aria-label="Actualizando indicadores" />}
      </div>

      <div className={cn("flex flex-col gap-[var(--row-gap)] transition-opacity duration-300", refetching && "opacity-60")}>
        {rows.map((row, r) => (
          <KpiRow key={r} row={row} defs={defs} results={results} range={range} loading={loading} base={offsets[r]} />
        ))}
      </div>
    </section>
  );
}

function KpiRow({
  row,
  defs,
  results,
  range,
  loading,
  base,
}: {
  row: KpiRowDef;
  defs: Map<string, KpiDef>;
  results: Map<string, KpiResult>;
  range: Range;
  loading: boolean;
  base: number;
}) {
  const spans = templateSpans(row.template);
  const spansMd = templateSpansMd(row.template, true);
  // group/kpirow: los grupos marcan data-chip-stack / data-two-line y TODA la fila adopta la misma
  // colocación del chip y el mismo alto de etiqueta (cifras en una sola línea base, kpiRedesign §5)
  return (
    <div className="dash-row group/kpirow" data-t={row.template} data-tier="kpi" data-compact={row.compact ? "1" : undefined}>
      {row.cells.map((cell, i) => (
        <div key={cellKey(cell, i)} className="dash-cell" style={{ "--span": spans[i] ?? 12, "--span-md": spansMd[i] ?? 6 } as CSSProperties}>
          <KpiCell cell={cell} defs={defs} results={results} range={range} loading={loading} index={base + i} span={spans[i] ?? 12} compact={row.compact} />
        </div>
      ))}
    </div>
  );
}

function cellKey(cell: KpiCellDef, i: number): string {
  if (cell.kind === "group") return `g:${cell.title}:${i}`;
  return `${cell.kind}:${cell.kpi}`;
}

function KpiCell({
  cell,
  defs,
  results,
  range,
  loading,
  index,
  span,
  compact,
}: {
  cell: KpiCellDef;
  defs: Map<string, KpiDef>;
  results: Map<string, KpiResult>;
  range: Range;
  loading: boolean;
  index: number;
  span: number;
  compact?: boolean;
}) {
  if (cell.kind === "group") return <KpiGroup cell={cell} defs={defs} results={results} range={range} loading={loading} index={index} span={span} compact={compact} />;
  const def = defs.get(cell.kpi);
  if (!def) return <div className="dash-layout-error card grid place-items-center p-4 text-xs text-critical-ink">KPI inexistente: {cell.kpi}</div>;
  if (cell.kind === "hero") return <KpiHero def={def} result={results.get(def.id)} range={range} loading={loading} index={index} />;
  return <KpiTile cell={cell} def={def} result={results.get(def.id)} range={range} loading={loading} index={index} />;
}
