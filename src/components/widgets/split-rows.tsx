"use client";

import { useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { Segmented } from "@/components/ui/primitives";
import type { CategoryResult } from "@/dashboards/dto";
import type { BarWidget } from "@/dashboards/types";
import { innerWidth } from "@/dashboards/layout";
import { cn } from "@/lib/cn";
import { isNeutral } from "@/lib/charts/semantic";
import { useChartTheme } from "@/lib/charts/theme";
import { formatInt, formatPct } from "@/lib/format";
import { displayLabel } from "@/lib/labels";
import { useWidgetFrame } from "./frame-context";
import { ChartLegend } from "./kit/chart-legend";
import { ChartTooltip, useChartTooltip } from "./kit/chart-tooltip";
import { HeaderSlot, LegendSlot } from "./kit/legend-slot";
import { fitRows, FOOTER_H, isOthers, lineCount, ListFooter, numWidth, MoreButton, othersLabel, rowStateClass, stackKeyMeta, StackBar, textWidth, useFitBox, type StackSegment } from "./list-kit";
import type { VizProps } from "./types";

/**
 * SplitRows (docs/ui-design-system.md § SplitRows): una dimensión cruzada con 2–3 estados.
 * Filas de 36 px (32 compacta) con el estilo de RankingList y una barra apilada con 2 px entre
 * segmentos en los tonos de la familia; total a la derecha; "Cantidad | %" en el header.
 * Clic en la etiqueta filtra la dimensión; clic en un segmento filtra stackBy.
 */

const HAIRLINE_BLOCK = 9;
const LEGEND_INLINE_H = 32;
const GAP_X = 12;
/** Ancho aproximado del Segmented "Cantidad | %". */
const SEGMENTED_W = 112;
/** Por debajo de este ancho la etiqueta va en su propia línea (390 px: nunca se recorta). */
const STACKED_BELOW = 420;

interface Row {
  raw: string;
  label: string;
  total: number;
  segments: StackSegment[];
  neutral: boolean;
  filterable: boolean;
}

export function SplitRows({ widget, result, height, span, expanded }: VizProps<BarWidget, CategoryResult>) {
  const { filters, toggleValue, spec } = useDashboard();
  const frame = useWidgetFrame();
  const theme = useChartTheme();
  const { state, show, hide } = useChartTooltip();
  const { ref, width: mw, height: mh, measured } = useFitBox<HTMLDivElement>();
  const [mode, setMode] = useState<"count" | "pct">("count");
  const [showAll, setShowAll] = useState(false);
  const vo = widget.vizOptions ?? {};
  const compact = Boolean(vo.compact);
  const dimension = widget.dimension;
  const stackBy = widget.stackBy;
  const crossFilter = !widget.noCrossFilter;
  const rowSel = useMemo(() => filters.eq[dimension] ?? [], [filters.eq, dimension]);
  const stackSel = useMemo(() => (stackBy ? (filters.eq[stackBy] ?? []) : []), [filters.eq, stackBy]);

  // Claves apiladas (color por familia semántica, en el orden de stackOrder)
  const keys = useMemo(() => {
    const stacks = result.stacks?.length ? result.stacks : [{ key: widget.title, values: result.values }];
    return { stacks, meta: stackKeyMeta(stacks.map((s) => s.key), widget.semantic, vo.overrides, theme.resolve) };
  }, [result, widget.title, widget.semantic, vo.overrides, theme]);

  const rows: Row[] = useMemo(
    () =>
      result.labels.map((raw, i) => {
        const others = isOthers(raw);
        const label = others ? othersLabel(widget.labelKind ?? "generic", result.folded) : (vo.overrides?.[raw]?.label ?? displayLabel(raw, widget.labelKind ?? "generic").full);
        return {
          raw,
          label,
          total: result.values[i] ?? 0,
          segments: keys.meta.map((m, k) => ({ ...m, value: keys.stacks[k].values[i] ?? 0 })),
          neutral: others || isNeutral(raw),
          filterable: crossFilter && !others,
        };
      }),
    [result, keys, vo.overrides, widget.labelKind, crossFilter],
  );
  const real = useMemo(() => rows.filter((r) => !r.neutral), [rows]);
  const neutrals = useMemo(() => rows.filter((r) => r.neutral), [rows]);
  const max = real.reduce((m, r) => Math.max(m, r.total), 0) || neutrals.reduce((m, r) => Math.max(m, r.total), 0);

  // Leyenda: la SectionLegend si la sección la declara; si no, una propia en la franja
  const sectionLegend = spec.sections.find((s) => s.widgets.some((w) => w.id === widget.id))?.legend;
  const ownLegend = !sectionLegend?.length && keys.meta.length > 1;
  const keyTotals = useMemo(() => keys.stacks.map((s) => s.values.reduce((a, v) => a + v, 0)), [keys]);
  const legendTotal = keyTotals.reduce((a, v) => a + v, 0);

  // Layout: columna de etiquetas, pista y altos
  const W = mw || innerWidth(span);
  // "Cantidad | %" va en el header si cabe junto al título; si no, a la derecha de la línea de leyenda
  const titleW = textWidth(widget.title, 700, 15) + (widget.provisional ? 96 : 0) + (widget.note ? 24 : 0);
  const segInHeader = Boolean(expanded) || titleW + SEGMENTED_W + 32 + 24 <= W;
  const strip = Boolean(frame?.legendEl);
  // Control: header → franja (derecha) → línea propia en el cuerpo
  const segPlace: "header" | "strip" | "line" = segInHeader ? "header" : strip ? "strip" : "line";
  const segRoom = segPlace === "header" ? 0 : SEGMENTED_W + 12;
  // Leyenda: en la franja solo si cabe en una línea; si no, en una línea del cuerpo (puede envolver).
  // Detalle según el espacio: valor y % → solo valor → solo etiqueta.
  const legendPlan = useMemo(() => {
    if (!ownLegend) return { place: "none" as const, detail: "label" as const, lines: 0 };
    const width = (value: boolean, share: boolean) =>
      keys.meta.reduce(
        (a, m, k) => a + 14 + 6 + textWidth(m.label, 400, 12) + (value ? 6 + numWidth(formatInt(keyTotals[k]), 600, 12) : 0) + (share ? 6 + numWidth("00,0 %", 400, 12) : 0) + 14,
        0,
      );
    const room = W - (segPlace === "header" ? 0 : segRoom);
    const detail = width(true, true) <= room ? ("full" as const) : width(true, false) <= room ? ("value" as const) : ("label" as const);
    const fits = width(false, false) <= room;
    if (strip && fits) return { place: "strip" as const, detail, lines: 0 };
    // Línea del cuerpo: el control solo la comparte si no está en la franja
    const lineRoom = W - (segPlace === "line" ? segRoom : 0);
    return { place: "line" as const, detail, lines: Math.max(1, Math.ceil(width(detail !== "label", detail === "full") / Math.max(1, lineRoom))) };
  }, [ownLegend, keys.meta, keyTotals, W, segPlace, segRoom, strip]);
  const legendDetail = legendPlan.detail;
  const hasLine = segPlace === "line" || legendPlan.place === "line";
  const legendLineH = hasLine ? LEGEND_INLINE_H + 20 * Math.max(0, legendPlan.lines - 1) : 0;
  const stacked = W < STACKED_BELOW;
  const rowH = compact ? 32 : 36;
  const layout = useMemo(() => {
    const totalW = Math.max(numWidth("0", 600, 13), ...rows.map((r) => numWidth(formatInt(r.total), 600, 13)));
    const maxLabel = Math.max(0, ...rows.map((r) => textWidth(r.label, 500, 13)));
    const labelCol = stacked ? W - 16 : Math.round(Math.max(64, Math.min(maxLabel + 6, W * 0.4)));
    const trackPx = Math.max(40, stacked ? W - totalW - GAP_X : W - labelCol - totalW - 2 * GAP_X);
    const lines = (r: Row) => lineCount(r.label, labelCol, 500, 13);
    const h = (r: Row) => (stacked ? 12 + 18 * lines(r) + 4 + 18 : rowH + 18 * (lines(r) - 1));
    const heights = real.map(h);
    const tail = neutrals.length ? HAIRLINE_BLOCK + neutrals.map(h).reduce((a, b) => a + b, 0) : 0;
    return { totalW, labelCol, trackPx, heights, neutralHeights: neutrals.map(h), tail };
  }, [rows, real, neutrals, W, rowH, stacked]);

  const fixedH = measured ? mh : height > 0 ? height : null;
  const all = expanded || showAll;
  const fit = useMemo(() => {
    const { heights, tail } = layout;
    if (all || fixedH === null) return { ...fitRows(heights, tail, 1, Infinity), footer: !expanded && showAll };
    const avail = fixedH - legendLineH;
    const first = fitRows(heights, tail, 1, avail);
    if (first.shown >= heights.length) return { ...first, footer: false };
    return { ...fitRows(heights, tail, 1, avail - FOOTER_H), footer: true };
  }, [layout, all, fixedH, legendLineH, expanded, showAll]);
  const hidden = real.length - fit.shown;
  const showTail = fit.columns.some((c) => c.includes(fit.shown)) && neutrals.length > 0;

  const anyRow = rowSel.length > 0;
  const percent = mode === "pct";
  const hint = (seg: StackSegment) => `Clic para filtrar por ${seg.label}`;
  const onSegment = crossFilter && stackBy ? (key: string) => toggleValue(stackBy, key) : undefined;

  const renderRow = (r: Row, h: number) => {
    const sel = rowSel.includes(r.raw);
    const frac = percent ? 1 : max ? Math.min(1, r.total / max) : 0;
    return (
      <li
        key={r.raw}
        className={cn("grid items-center rounded-lg px-2 transition", stacked && "content-center gap-y-1 py-1.5", rowStateClass(sel, anyRow && !sel))}
        style={{
          gridTemplateColumns: stacked ? `minmax(0,1fr) ${layout.totalW}px` : `${layout.labelCol}px minmax(0,1fr) ${layout.totalW}px`,
          columnGap: GAP_X,
          minHeight: h,
        }}
      >
        {r.filterable ? (
          <button
            type="button"
            onClick={() => toggleValue(dimension, r.raw)}
            aria-pressed={sel}
            title="Clic para filtrar"
            className={cn(
              "-mx-1 min-w-0 justify-self-start rounded px-1 text-left text-[13px] font-medium leading-[18px] [overflow-wrap:anywhere] hover:underline focus-visible:outline-offset-0",
              r.neutral ? "text-text-2" : "text-text",
              stacked && "col-span-2",
            )}
          >
            {r.label}
          </button>
        ) : (
          <span className={cn("min-w-0 text-[13px] font-medium leading-[18px] [overflow-wrap:anywhere]", r.neutral ? "text-text-2" : "text-text", stacked && "col-span-2")}>{r.label}</span>
        )}
        <StackBar
          segments={r.segments}
          total={r.total}
          frac={frac}
          trackPx={layout.trackPx}
          percent={percent}
          rowLabel={r.label}
          onSegment={onSegment}
          selectedKeys={stackSel}
          onHover={show}
          onLeave={hide}
          hint={hint}
          height={compact ? 12 : 14}
        />
        <span className="tabular text-right text-[13px] font-semibold text-text">{formatInt(r.total)}</span>
      </li>
    );
  };

  // Leyenda estática (los segmentos filtran): totales por clave y % si caben en una línea
  const legend = ownLegend ? (
    <ChartLegend
      label={`Leyenda de ${widget.title}`}
      items={keys.meta.map((m, k) => ({
        key: m.key,
        label: m.label,
        tone: m.tone,
        color: m.color,
        value: legendDetail !== "label" ? formatInt(keyTotals[k]) : undefined,
        share: legendDetail === "full" && legendTotal ? formatPct(keyTotals[k] / legendTotal) : undefined,
        selected: stackSel.includes(m.key),
      }))}
    />
  ) : null;
  const segmented = (
    <Segmented
      label="Unidad de las barras"
      value={mode}
      onChange={setMode}
      options={[
        { value: "count", label: "Cantidad" },
        { value: "pct", label: "%" },
      ]}
    />
  );

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col">
      {segPlace === "header" && <HeaderSlot>{segmented}</HeaderSlot>}
      {segPlace === "strip" && <LegendSlot side="end">{segmented}</LegendSlot>}
      {legendPlan.place === "strip" && <LegendSlot>{legend}</LegendSlot>}
      {hasLine && (
        <div className="mb-2 flex min-h-6 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {legendPlan.place === "line" ? legend : <span />}
          {segPlace === "line" && segmented}
        </div>
      )}
      <div className={cn("-mx-2 min-h-0 flex-1", all ? "overflow-y-auto overscroll-contain" : "overflow-hidden")}>
        <ul className="flex flex-col" aria-label={widget.title}>
          {real.slice(0, fit.shown).map((r, i) => renderRow(r, layout.heights[i]))}
        </ul>
        {showTail && (
          <>
            <div className="mx-2 my-1 h-px bg-[var(--hairline)]" aria-hidden />
            <ul className="flex flex-col" aria-label="Sin clasificar">
              {neutrals.map((r, i) => renderRow(r, layout.neutralHeights[i]))}
            </ul>
          </>
        )}
      </div>
      {fit.footer && (
        <ListFooter
          right={
            <MoreButton onClick={() => setShowAll((v) => !v)} expanded={showAll}>
              {showAll ? "Ver menos" : `Ver ${formatInt(hidden)} más`}
            </MoreButton>
          }
        />
      )}
      <ChartTooltip state={state} />
    </div>
  );
}
