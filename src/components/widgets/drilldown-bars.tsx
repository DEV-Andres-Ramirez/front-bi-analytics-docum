"use client";

import { ChevronRight, CornerLeftUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import type { DrilldownResult, DrillNode } from "@/dashboards/dto";
import type { DrilldownWidget } from "@/dashboards/types";
import { innerWidth } from "@/dashboards/layout";
import { cn } from "@/lib/cn";
import { isNeutral } from "@/lib/charts/semantic";
import { inkOn, useChartTheme } from "@/lib/charts/theme";
import { formatInt, formatPct } from "@/lib/format";
import { displayLabel, type LabelKind } from "@/lib/labels";
import { useWidgetFrame } from "./frame-context";
import { ChartLegend } from "./kit/chart-legend";
import { ChartTooltip, useChartTooltip } from "./kit/chart-tooltip";
import { LegendSlot } from "./kit/legend-slot";
import { FOOTER_H, isOthers, lineCount, ListFooter, MoreButton, numWidth, stackKeyMeta, StackBar, textWidth, useFitBox, type StackSegment } from "./list-kit";
import type { VizProps } from "./types";

/**
 * DrilldownBars v2 (docs/ui-design-system.md § DrilldownBars v2 + Sankey v2).
 * Stepper "Nivel 2 de 5 · Tipo de solicitud" con la ruta en chips y "Subir"; cuerpo tipo SplitRows
 * compacto (filas de 30 px) con las claves apiladas en los tonos de la familia; chevron en las filas
 * con hijos; transición de 200 ms. Sin filtro cruzado (explorar no filtra el tablero).
 * "Resto (fuera del top N)" y los neutrales van fijos al pie (hairline superior), nunca dentro del
 * scroll; si las filas no caben en el alto de la fila del tablero se muestran las que caben enteras
 * y "Ver N más" (scroll interno), en lugar de cortar la última a la mitad.
 */

const ROW_H = 30;
/** Margen de seguridad de la estimación de altos. */
const FIT_SAFETY = 2;
/** Alto extra máximo por fila al repartir el sobrante (30 → 38). */
const STRETCH = 8;
const GAP_X = 10;
/** Por debajo de este ancho la etiqueta va en su propia línea (390 px: nunca se recorta). */
const STACKED_BELOW = 420;

interface Row {
  raw: string;
  label: string;
  value: number;
  segments: StackSegment[];
  neutral: boolean;
  drillable: boolean;
}

/** Tipo de etiqueta por nivel: el primero es la entidad del widget (oficina por defecto). */
function kindAt(level: number, labelKind: DrilldownWidget["labelKind"]): LabelKind {
  return level === 0 ? (labelKind ?? "oficina") : "generic";
}

function levelNodes(root: DrillNode[], path: string[]): { nodes: DrillNode[]; valid: string[] } {
  let current = root;
  const valid: string[] = [];
  for (const step of path) {
    const next = current.find((n) => n.label === step);
    if (!next?.children?.length) break;
    valid.push(step);
    current = next.children;
  }
  return { nodes: current, valid };
}

export function DrilldownBars({ widget, result, span, expanded }: VizProps<DrilldownWidget, DrilldownResult>) {
  const { spec } = useDashboard();
  const frame = useWidgetFrame();
  const theme = useChartTheme();
  const { state, show, hide } = useChartTooltip();
  const { ref, width: mw } = useFitBox<HTMLDivElement>();
  const { ref: listRef, height: listH } = useFitBox<HTMLDivElement>();
  const [path, setPath] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const vo = widget.vizOptions ?? {};
  const levels = widget.levels;

  // La ruta se valida contra el resultado actual (un filtro puede hacer desaparecer un nodo)
  const { nodes, valid } = useMemo(() => levelNodes(result.nodes, path), [result.nodes, path]);
  const level = Math.min(valid.length, levels.length - 1);
  const levelDef = levels[level];

  const meta = useMemo(() => stackKeyMeta(result.stackKeys, widget.semantic, vo.overrides, theme.resolve), [result.stackKeys, widget.semantic, vo.overrides, theme]);
  // Tinta del segmento único sobre --chart-1 (inkOn): el naranja medio lleva tinta oscura, no blanco
  const totalInk = inkOn(theme.resolve("var(--chart-1)"));
  const rows: Row[] = useMemo(
    () =>
      nodes.map((n) => {
        const others = isOthers(n.label);
        return {
          raw: n.label,
          label: others ? `Resto (fuera del top ${widget.topN ?? 10})` : displayLabel(n.label, kindAt(level, widget.labelKind)).full,
          value: n.value,
          segments: meta.length ? meta.map((m) => ({ ...m, value: n.stacks?.[m.key] ?? 0 })) : [{ key: "total", label: "Total", value: n.value, color: "var(--chart-1)", ink: totalInk, neutral: false }],
          neutral: others || isNeutral(n.label),
          drillable: Boolean(n.children?.length) && level < levels.length - 1,
        };
      }),
    [nodes, meta, level, levels.length, widget.topN, widget.labelKind, totalInk],
  );
  const real = useMemo(() => rows.filter((r) => !r.neutral), [rows]);
  const neutrals = useMemo(() => rows.filter((r) => r.neutral), [rows]);
  const max = real.reduce((m, r) => Math.max(m, r.value), 0) || neutrals.reduce((m, r) => Math.max(m, r.value), 0);
  const levelTotal = rows.reduce((a, r) => a + r.value, 0);

  // Columna de etiquetas y pista
  const W = mw || innerWidth(span);
  const stacked = W < STACKED_BELOW;
  const layout = useMemo(() => {
    const totalW = Math.max(numWidth("0", 600, 12.5), ...rows.map((r) => numWidth(formatInt(r.value), 600, 12.5)));
    const maxLabel = Math.max(0, ...rows.map((r) => textWidth(r.label, 500, 12.5)));
    const labelCol = stacked ? W - 16 - 16 - GAP_X : Math.round(Math.max(72, Math.min(maxLabel + 6, W * 0.42)));
    const trackPx = Math.max(40, stacked ? W - 16 - totalW - 16 - 2 * GAP_X : W - labelCol - totalW - 16 - 3 * GAP_X);
    const heights = rows.map((r) => {
      const l = lineCount(r.label, labelCol, 500, 12.5);
      return stacked ? 31 + 17 * l : ROW_H + 17 * (l - 1);
    });
    return { totalW, labelCol, trackPx, heights };
  }, [rows, W, stacked]);
  const realH = useMemo(() => real.map((r) => layout.heights[rows.indexOf(r)]), [real, rows, layout.heights]);
  const contentH = realH.reduce((a, b) => a + b, 0);
  const all = Boolean(expanded) || showAll;
  // Filas enteras que caben en el alto medido (fila de alto fijo); el resto va a "Ver N más".
  // El sobrante se reparte entre las filas visibles (hasta 8 px) para no dejar una banda vacía.
  const { shown, extra } = useMemo(() => {
    if (all || listH === null) return { shown: real.length, extra: 0 };
    const spread = (n: number, used: number) => (n ? Math.max(0, Math.min(STRETCH, Math.floor((listH - used - FIT_SAFETY) / n))) : 0);
    if (contentH <= listH + 1) return { shown: real.length, extra: spread(real.length, contentH) };
    let acc = 0;
    let n = 0;
    while (n < realH.length && acc + realH[n] + FOOTER_H + FIT_SAFETY <= listH) acc += realH[n++];
    return { shown: Math.max(1, n), extra: spread(n, acc + FOOTER_H) };
  }, [all, listH, contentH, real.length, realH]);
  const hidden = real.length - shown;
  const overflow = all && listH !== null && contentH + (showAll ? FOOTER_H : 0) > listH + 1;

  const sectionLegend = spec.sections.find((s) => s.widgets.some((w) => w.id === widget.id))?.legend;
  const ownLegend = !sectionLegend?.length && meta.length > 1;
  const legend = ownLegend ? (
    <ChartLegend label={`Leyenda de ${widget.title}`} items={meta.map((m) => ({ key: m.key, label: m.label, tone: m.tone, color: m.color }))} />
  ) : null;

  const go = (next: string[]) => {
    hide();
    setShowAll(false);
    setPath(next);
  };
  const pathKey = valid.join("\u0001");

  const renderRow = (r: Row, h: number) => {
    const frac = max ? Math.min(1, r.value / max) : 0;
    const share = levelTotal ? r.value / levelTotal : 0;
    const content = (
      <>
        <span
          className={cn(
            "min-w-0 text-left text-[12.5px] font-medium leading-[17px] [overflow-wrap:anywhere]",
            r.neutral ? "text-text-2" : "text-text",
            stacked && "col-span-2",
          )}
        >
          {r.label}
        </span>
        <span className={cn("grid size-4 place-items-center", stacked ? "col-start-3 row-span-2 row-start-1" : "order-last")} aria-hidden>
          {r.drillable && <ChevronRight className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-text" />}
        </span>
        <StackBar segments={r.segments} total={r.value} frac={frac} trackPx={layout.trackPx} percent={false} rowLabel={r.label} onHover={show} onLeave={hide} height={12} />
        <span className="tabular text-right text-[12.5px] font-semibold text-text">{formatInt(r.value)}</span>
      </>
    );
    const cls = cn("grid w-full items-center rounded-lg px-2 text-left", stacked && "content-center gap-y-1 py-1");
    const style = {
      gridTemplateColumns: stacked ? `minmax(0,1fr) ${layout.totalW}px 16px` : `${layout.labelCol}px minmax(0,1fr) ${layout.totalW}px 16px`,
      columnGap: GAP_X,
      minHeight: h,
    };
    return (
      <li key={r.raw}>
        {r.drillable ? (
          <button
            type="button"
            onClick={() => go([...valid, r.raw])}
            aria-label={`${r.label}: ${formatInt(r.value)} (${formatPct(share)}). Ver ${levels[level + 1]?.label.toLowerCase() ?? "detalle"}`}
            className={cn(cls, "group transition hover:bg-surface-3 focus-visible:outline-offset-[-2px]")}
            style={style}
          >
            {content}
          </button>
        ) : (
          <div role="group" aria-label={`${r.label}: ${formatInt(r.value)} (${formatPct(share)})`} className={cls} style={style}>
            {content}
          </div>
        )}
      </li>
    );
  };

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col">
      {legend && frame?.legendEl && <LegendSlot>{legend}</LegendSlot>}
      {/* Stepper: nivel actual, ruta y "Subir" */}
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary-text" aria-live="polite">
          <span className="flex items-center gap-[3px]" aria-hidden>
            {levels.map((l, i) => (
              <span key={l.field} className={cn("h-1.5 rounded-full transition-all duration-200", i === level ? "w-3 bg-primary" : i < level ? "w-1.5 bg-primary" : "w-1.5 bg-[var(--hairline)]")} />
            ))}
          </span>
          <span className="tabular">
            Nivel {level + 1} de {levels.length} · {levelDef.label}
          </span>
        </span>
        {valid.length > 0 && (
          <nav aria-label="Ruta de exploración" className="flex min-w-0 flex-wrap items-center gap-1 text-xs">
            <button type="button" onClick={() => go([])} className="rounded-full px-2 py-0.5 font-semibold text-muted transition hover:bg-surface-3 hover:text-text">
              Todas
            </button>
            {valid.map((step, i) => {
              const last = i === valid.length - 1;
              const text = displayLabel(step, kindAt(i, widget.labelKind)).full;
              return (
                <span key={`${i}-${step}`} className="flex min-w-0 items-center gap-1">
                  <ChevronRight className="size-3.5 shrink-0 text-faint" aria-hidden />
                  {last ? (
                    <span aria-current="location" title={`${levels[i].label}: ${text}`} className="rounded-full bg-surface-3 px-2 py-0.5 font-semibold text-text [overflow-wrap:anywhere]">
                      {text}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => go(valid.slice(0, i + 1))}
                      title={`${levels[i].label}: ${text}`}
                      className="rounded-full px-2 py-0.5 font-semibold text-text-2 transition hover:bg-surface-3 hover:text-text [overflow-wrap:anywhere]"
                    >
                      {text}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
        )}
        <span className="ml-auto flex items-center gap-3">
          {legend && !frame?.legendEl && legend}
          <button
            type="button"
            onClick={() => go(valid.slice(0, -1))}
            disabled={!valid.length}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-text-2 transition enabled:hover:border-primary/40 enabled:hover:text-text disabled:opacity-40"
          >
            <CornerLeftUp className="size-3.5" aria-hidden /> Subir
          </button>
        </span>
      </div>

      <div
        ref={listRef}
        className={cn(
          "-mx-2 min-h-0 flex-1",
          all ? "overflow-y-auto overscroll-contain" : "overflow-hidden",
          expanded && "pr-1",
          overflow && "pb-4 [mask-image:linear-gradient(to_bottom,#000_calc(100%-20px),transparent)]",
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathKey}
            className="flex min-h-full flex-col"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <ul className="flex flex-col" aria-label={`${levelDef.label}: ${formatInt(real.length)} categorías`}>
              {real.slice(0, shown).map((r, i) => renderRow(r, realH[i] + extra))}
            </ul>
            {!expanded && (hidden > 0 || showAll) && (
              <ListFooter
                className="px-2"
                right={
                  <MoreButton onClick={() => setShowAll((v) => !v)} expanded={showAll}>
                    {showAll ? "Ver menos" : `Ver ${formatInt(hidden)} más`}
                  </MoreButton>
                }
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      {neutrals.length > 0 && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathKey}
            className="-mx-2 shrink-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="mx-2 my-1 h-px bg-[var(--hairline)]" aria-hidden />
            <ul className="flex flex-col" aria-label="Resto y sin clasificar">
              {neutrals.map((r) => renderRow(r, layout.heights[rows.indexOf(r)]))}
            </ul>
          </motion.div>
        </AnimatePresence>
      )}
      <ChartTooltip state={state} />
    </div>
  );
}
