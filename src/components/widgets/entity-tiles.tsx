"use client";

import { CircleDashed } from "lucide-react";
import { useMemo } from "react";
import type { CategoryResult } from "@/dashboards/dto";
import { innerWidth } from "@/dashboards/layout";
import type { BarWidget, DonutWidget } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { cn } from "@/lib/cn";
import { isMissing, isNeutral, normalizeLabel } from "@/lib/charts/semantic";
import { formatInt, formatPct } from "@/lib/format";
import { displayLabel, initials } from "@/lib/labels";
import { useCrossFilter, useHoverTip, useMergedRef, usePageWide } from "./category-tiles";
import { ChartTooltip, type TooltipContent } from "./kit/chart-tooltip";
import { LegendSlot } from "./kit/legend-slot";
import { QUALITY_CHIP_MIN, QUALITY_NOTICE_MIN, QualityChip } from "./kit/quality";
import type { VizProps } from "./types";

const TILE_W = 180;
const TILE_H = 112;
const GAP = 12;

interface Item {
  label: string;
  value: number;
}

/** "Otros" y "Sin clasificar" (y demás neutrales) forman el grupo final ("No identificados", "Otros y sin identificar"). */
const UNIDENTIFIED = (label: string) => isNeutral(label) || normalizeLabel(label) === "sin clasificar";

/**
 * EntityTiles (entes de control): hasta 5 por línea a 12 columnas (tile ≥ 180×112) en líneas
 * equilibradas (8 tiles → 4 + 4, nunca 5 + 3 con hueco),
 * monograma con la sigla en tono neutro, nombre, cifra de 24 px, % y barra de escala común.
 * Grupo final "No identificados" en neutral; si pesa 15–85 %, chip de calidad en la franja de leyenda.
 * Clic filtra la dimensión.
 */
export function EntityTiles({ widget, result, height, span }: VizProps<BarWidget | DonutWidget, CategoryResult>) {
  const cf = useCrossFilter(widget);
  const { state, bind } = useHoverTip();
  const { ref: sizeRef, width, measured } = useElementSize<HTMLDivElement>();
  const { ref: pageRef, wide } = usePageWide();
  const ref = useMergedRef(sizeRef, pageRef);
  const acronyms = widget.vizOptions?.acronyms;

  const w = measured ? width : innerWidth(span);
  const narrow = w < 420;
  const perLine = narrow ? 2 : Math.max(1, Math.floor((w + GAP) / (TILE_W + GAP)));
  // En escritorio la capacidad la fija el cuerpo del tier; en móvil (alto por contenido) no hay tope.
  const lines = height > 0 && wide ? Math.max(1, Math.floor((height + GAP) / (TILE_H + GAP))) : Infinity;
  const capacity = perLine * lines;

  const { real, rest, unidentified, total, max } = useMemo(() => {
    const items: Item[] = result.labels.map((label, i) => ({
      label,
      value: result.values[i] ?? 0,
    }));
    const realAll = items.filter((it) => !UNIDENTIFIED(it.label)).sort((a, b) => b.value - a.value);
    const unid = items.filter((it) => UNIDENTIFIED(it.label)).sort((a, b) => b.value - a.value);
    const slots = capacity - (unid.length ? 1 : 0);
    const overflow = realAll.length > slots;
    const shown = overflow ? realAll.slice(0, Math.max(0, slots - 1)) : realAll;
    return {
      real: shown,
      rest: overflow ? realAll.slice(shown.length) : [],
      unidentified: unid,
      total: result.total || items.reduce((a, b) => a + b.value, 0),
      max: Math.max(1, ...realAll.map((r) => r.value)),
    };
  }, [result, capacity]);

  // Líneas equilibradas (4 + 4 en vez de 5 + 3, como StatusStrip): columnas = ⌈n / ⌈n / por línea⌉⌉
  const tileCount = real.length + (rest.length ? 1 : 0) + (unidentified.length ? 1 : 0);
  const cols = narrow ? 2 : Math.max(1, Math.ceil(tileCount / Math.max(1, Math.ceil(tileCount / perLine))));
  // Con 2 o más líneas los tiles reparten el cuerpo (1fr); con una sola línea conservan su alto
  const fill = height > 0 && wide && Math.ceil(tileCount / cols) >= 2;

  // Chip de calidad (15–85 % sin ente identificado) en la franja de leyenda, como StatusStrip. Solo cuenta el
  // dato faltante ("Sin clasificar", "No reporta"): "Otros" es un ente real agrupado, gris y al final, pero identificado.
  const unidentifiedSum = unidentified.filter((it) => isMissing(it.label)).reduce((a, b) => a + b.value, 0);
  const groupTitle = unidentified.every((it) => isMissing(it.label)) ? "No identificados" : unidentified.some((it) => isMissing(it.label)) ? "Otros y sin identificar" : "Otros";
  const unidentifiedShare = total ? unidentifiedSum / total : 0;
  const chip = unidentifiedShare >= QUALITY_CHIP_MIN && unidentifiedShare < QUALITY_NOTICE_MIN && (
    <LegendSlot side="end">
      <QualityChip neutral={unidentifiedSum} total={total} label="sin ente identificado" />
    </LegendSlot>
  );

  return (
    <>
      {chip}
      <div
        ref={ref}
        role="list"
        aria-label={widget.title}
        className={cn("grid min-h-0 gap-3", fill ? "h-full" : "content-start")}
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridAutoRows: `minmax(${TILE_H}px, ${fill ? "1fr" : "auto"})`,
        }}
      >
        {real.map((it) => {
          const d = displayLabel(it.label, widget.labelKind ?? "ente");
          const acr = acronyms?.[it.label] ?? d.secondary ?? initials(d.full);
          const share = total ? it.value / total : 0;
          const can = cf.can(it.label);
          const sel = cf.isSelected(it.label);
          const tip: TooltipContent = {
            title: d.full,
            value: formatInt(it.value),
            valueNote: formatPct(share),
            hint: can ? (sel ? "Clic para quitar el filtro" : "Clic para filtrar") : undefined,
          };
          return (
            <div
              key={it.label}
              role="listitem"
              className={cn(
                "relative flex min-w-0 flex-col rounded-2xl border bg-surface-2 p-3 transition-[opacity,background-color,border-color]",
                sel ? "border-primary bg-primary-soft" : "border-border",
                cf.isDimmed(it.label) && "opacity-45",
              )}
            >
              {can && (
                <button
                  type="button"
                  aria-pressed={sel}
                  aria-label={`${d.full}${acr ? ` (${acr})` : ""}: ${formatInt(it.value)}, ${formatPct(share)}. ${sel ? "Quitar filtro" : "Filtrar"}`}
                  onClick={() => cf.toggle(it.label)}
                  className="absolute inset-0 rounded-2xl transition hover:bg-surface-3/70"
                  {...bind(tip)}
                />
              )}
              <div className={cn("pointer-events-none relative flex min-w-0 gap-2.5", narrow ? "flex-col items-start gap-1.5" : "items-center")}>
                <span aria-hidden className="grid h-8 min-w-8 shrink-0 place-items-center rounded-lg bg-surface-3 px-1 text-[11px] font-bold tracking-wide text-text-2">
                  {acr}
                </span>
                <span lang="es" className="line-clamp-2 min-w-0 hyphens-auto text-[13px] font-semibold leading-4 text-text">
                  {d.full}
                </span>
              </div>
              <p className="pointer-events-none relative mt-auto flex items-baseline gap-1.5 pt-2">
                <span className="tabular text-2xl font-bold leading-none tracking-tight text-text">{formatInt(it.value)}</span>
                <span className="tabular text-xs text-muted">{formatPct(share)}</span>
              </p>
              <span aria-hidden className="pointer-events-none relative mt-2 block h-1 overflow-hidden rounded-full bg-surface-3">
                <span
                  className="block h-full rounded-full bg-[var(--chart-1)]"
                  style={{
                    width: `${Math.max((it.value / max) * 100, it.value > 0 ? 2 : 0)}%`,
                  }}
                />
              </span>
            </div>
          );
        })}
        {rest.length > 0 && <GroupTile title={`Otros ${rest.length} entes`} items={rest} total={total} cf={cf} widget={widget} narrow={narrow} />}
        {unidentified.length > 0 && <GroupTile title={groupTitle} items={unidentified} total={total} cf={cf} widget={widget} narrow={narrow} />}
        <ChartTooltip state={state} />
      </div>
    </>
  );
}

/**
 * Grupo final en neutral ("No identificados" u "Otros N entes"): nombre y desglose en la cabecera (a la altura del
 * monograma), cifra al pie en la misma línea base que los tiles vecinos y, en el lugar de la barra, un hueco del
 * mismo alto: lo neutral va sin barra (fuera de la escala común).
 */
function GroupTile({ title, items, total, cf, widget, narrow }: { title: string; items: Item[]; total: number; cf: ReturnType<typeof useCrossFilter>; widget: BarWidget | DonutWidget; narrow: boolean }) {
  const sum = items.reduce((a, b) => a + b.value, 0);
  const dimmed = cf.active && !items.some((it) => cf.isSelected(it.label));
  return (
    <div role="listitem" className={cn("flex min-w-0 flex-col rounded-2xl border border-dashed border-border-strong bg-surface p-3 transition-opacity", dimmed && "opacity-45")}>
      <div className={cn("flex min-w-0 gap-2.5", narrow ? "flex-col items-start gap-1.5" : "items-start")}>
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-neutral-soft text-neutral-ink">
          <CircleDashed className="size-4" />
        </span>
        <div className="min-w-0">
          <span className="block text-[13px] font-semibold leading-4 text-text-2">{title}</span>
          <GroupDetail title={title} items={items} cf={cf} widget={widget} />
        </div>
      </div>
      <p className="mt-auto flex items-baseline gap-1.5 pt-2">
        <span className="tabular text-2xl font-bold leading-none tracking-tight text-text-2">{formatInt(sum)}</span>
        <span className="tabular text-xs text-muted">{formatPct(total ? sum / total : 0)}</span>
      </p>
      <span aria-hidden className="mt-2 block h-1" />
    </div>
  );
}

function GroupDetail({ title, items, cf, widget }: { title: string; items: Item[]; cf: ReturnType<typeof useCrossFilter>; widget: BarWidget | DonutWidget }) {
  return (
    <ul className="flex flex-wrap gap-x-2.5 text-[11.5px] leading-4" aria-label={`${title}: detalle`}>
      {items.map((it) => {
        const name = displayLabel(it.label, widget.labelKind ?? "ente").full;
        const body = (
          <>
            {name} <span className="tabular font-semibold text-text">{formatInt(it.value)}</span>
          </>
        );
        return (
          <li key={it.label}>
            {cf.can(it.label) ? (
              <button
                type="button"
                aria-pressed={cf.isSelected(it.label)}
                title="Clic para filtrar"
                onClick={() => cf.toggle(it.label)}
                className={cn("-mx-1 rounded px-1 text-muted hover:bg-surface-3 hover:text-text", cf.isSelected(it.label) && "bg-primary-soft text-text")}
              >
                {body}
              </button>
            ) : (
              <span className="text-muted">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
