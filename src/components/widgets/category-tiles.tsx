"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState, type FocusEvent, type MouseEvent } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import type { CategoryResult } from "@/dashboards/dto";
import type { BarWidget, DonutWidget, WidgetDef } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { isNeutral, normalizeLabel } from "@/lib/charts/semantic";
import { formatInt, formatPct } from "@/lib/format";
import { displayLabel } from "@/lib/labels";
import { useElementSize } from "@/hooks/use-element-size";
import { ChartTooltip, useChartTooltip, type TooltipContent } from "./kit/chart-tooltip";
import type { VizProps } from "./types";

// ─── Ayudas compartidas por los widgets HTML de categoría (tiles, family split, aviso de calidad) ──

/** Campo que filtra el widget (dimensión, o la primera columna de una bartable). */
export function widgetDimension(w: WidgetDef): string | undefined {
  if ("dimension" in w) return w.dimension;
  if (w.type === "bartable") return w.columns[0]?.field;
  return undefined;
}

/** "Otros" / "Otras N categorías" no son valores reales del dato: no filtran. */
export function canFilterLabel(label: string): boolean {
  return !/^otr[oa]s( \d+.*)?$/.test(normalizeLabel(label));
}

/** Estado del filtro cruzado de un widget: seleccionar resalta y atenúa el resto (el widget conserva todo). */
export function useCrossFilter(widget: WidgetDef) {
  const { filters, toggleValue } = useDashboard();
  const dimension = widgetDimension(widget);
  // Una bartable de varias columnas no tiene un valor único por fila: no filtra
  const enabled = Boolean(dimension) && !(widget.type === "bar" && widget.noCrossFilter) && !(widget.type === "bartable" && widget.columns.length > 1);
  const selected = useMemo(() => (dimension ? (filters.eq[dimension] ?? []) : []), [dimension, filters.eq]);
  const active = selected.length > 0;
  const toggle = useCallback((label: string) => dimension && toggleValue(dimension, label), [dimension, toggleValue]);
  return {
    dimension,
    /** ¿Se puede filtrar por esta etiqueta? */
    can: (label: string) => enabled && canFilterLabel(label),
    isSelected: (label: string) => selected.includes(label),
    isDimmed: (label: string) => active && !selected.includes(label),
    active,
    toggle,
  };
}

/**
 * ¿La página tiene filas de alto fijo (contenedor "page" ≥ 600 px)? En móvil las filas miden por
 * contenido y el presupuesto de alto (VizProps.height) no aplica. Devuelve un ref callback.
 */
export function usePageWide() {
  const [wide, setWide] = useState(true);
  const ref = useCallback((el: HTMLElement | null) => {
    const page = el?.closest<HTMLElement>(".dash-page");
    if (!page) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? page.clientWidth;
      setWide(w >= 600);
    });
    ro.observe(page);
    return () => ro.disconnect();
  }, []);
  return { ref, wide };
}

/** Une dos ref callbacks con limpieza (React 19). */
export function useMergedRef<T>(a: (el: T | null) => void | (() => void), b: (el: T | null) => void | (() => void)) {
  return useCallback(
    (el: T | null) => {
      const ca = a(el);
      const cb = b(el);
      return () => {
        if (typeof ca === "function") ca();
        if (typeof cb === "function") cb();
      };
    },
    [a, b],
  );
}

/** Tooltip único (ChartTooltip) anclado a elementos HTML: hover y foco muestran lo mismo. */
export function useHoverTip() {
  const { state, show, hide } = useChartTooltip();
  const bind = useCallback(
    (content: TooltipContent) => ({
      onMouseEnter: (e: MouseEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        show(r.left + r.width / 2, r.top + r.height / 2, content);
      },
      onMouseLeave: hide,
      onFocus: (e: FocusEvent<HTMLElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        show(r.left + r.width / 2, r.top + r.height / 2, content);
      },
      onBlur: hide,
    }),
    [show, hide],
  );
  return { state, bind, hide };
}

// ─── CategoryTiles ───────────────────────────────────────────────────────────

interface Item {
  label: string;
  value: number;
}

const TILE_GAP = 12;
/** Alto mínimo de un tile (grid-auto-rows) y anatomía de "Otros": padding 28 + cabecera 18 + 4. */
const TILE_MIN_H = 104;
const OTHER_HEAD = 28 + 18 + 4;
/** Fila de la cola de "Otros" (1 línea de 11 px con py-px). */
const OTHER_ROW = 18;

/**
 * CategoryTiles 2×2 (taxonomía de trámites de Correspondencia E/S):
 * top 3 + "Otros trámites" que lista la cola con sus valores. Cada tile: nombre (con el enlace neutro
 * "Ver tablero ↗" en la esquina), cifra + % y barra de participación en chart-1. Nada se encoge:
 * el alto mínimo de la fila es el del contenido (sin recortes ni textos encimados).
 * El clic principal del tile filtra la dimensión.
 */
export function CategoryTiles({ widget, result, height }: VizProps<BarWidget | DonutWidget, CategoryResult>) {
  const { filters } = useDashboard();
  const cf = useCrossFilter(widget);
  const { state, bind } = useHoverTip();
  const { ref: sizeRef, height: boxH, measured } = useElementSize<HTMLDivElement>();
  const { ref: pageRef, wide } = usePageWide();
  const ref = useMergedRef(sizeRef, pageRef);
  const links = widget.vizOptions?.links;

  const { tiles, tail, total } = useMemo(() => {
    const items: Item[] = result.labels.map((label, i) => ({
      label,
      value: result.values[i] ?? 0,
    }));
    const real = items.filter((it) => !isNeutral(it.label)).sort((a, b) => b.value - a.value);
    const neutral = items.filter((it) => isNeutral(it.label)).sort((a, b) => b.value - a.value);
    const t = result.total || items.reduce((a, b) => a + b.value, 0);
    if (real.length + neutral.length <= 4) return { tiles: [...real, ...neutral], tail: [] as Item[], total: t };
    return {
      tiles: real.slice(0, 3),
      tail: [...real.slice(3), ...neutral],
      total: t,
    };
  }, [result]);

  const otherLabel = /tr[aá]mite/i.test(widget.title) ? "Otros trámites" : "Otras categorías";
  const qs = `?from=${filters.from}&to=${filters.to}`;

  // Filas de la cola que caben en el tile "Otros" (escritorio: alto medido de la fila; móvil: por contenido)
  const count = tiles.length + (tail.length ? 1 : 0);
  const lines = Math.max(1, Math.ceil(count / 2));
  const bodyH = measured ? boxH : height;
  const tileH = wide && bodyH > 0 ? Math.max(TILE_MIN_H, (bodyH - (lines - 1) * TILE_GAP) / lines) : Infinity;
  const tailRows = Number.isFinite(tileH) ? Math.max(1, Math.floor((tileH - OTHER_HEAD) / OTHER_ROW)) : 4;

  return (
    <div ref={ref} className="grid h-full min-h-0 grid-cols-2 gap-3 [grid-auto-rows:minmax(min-content,1fr)]" role="list" aria-label={widget.title}>
      {tiles.map((t) => {
        const name = displayLabel(t.label, widget.labelKind).full;
        const share = total ? t.value / total : 0;
        const neutral = isNeutral(t.label);
        const can = cf.can(t.label);
        const sel = cf.isSelected(t.label);
        const slug = links?.[t.label];
        const tip: TooltipContent = {
          title: name,
          value: formatInt(t.value),
          valueNote: formatPct(share),
          hint: can ? (sel ? "Clic para quitar el filtro" : "Clic para filtrar") : undefined,
        };
        return (
          <div
            key={t.label}
            role="listitem"
            className={cn(
              "@container relative flex min-h-[104px] min-w-0 flex-col rounded-2xl border bg-surface-2 p-3.5 transition-[opacity,background-color,border-color]",
              sel ? "border-primary bg-primary-soft" : "border-border",
              cf.isDimmed(t.label) && "opacity-45",
            )}
          >
            {can && (
              <button
                type="button"
                aria-pressed={sel}
                aria-label={`${name}: ${formatInt(t.value)} (${formatPct(share)}). ${sel ? "Quitar filtro" : "Filtrar"}`}
                onClick={() => cf.toggle(t.label)}
                className="absolute inset-0 rounded-2xl transition hover:bg-surface-3/70"
                {...bind(tip)}
              />
            )}
            <div className="pointer-events-none relative flex min-w-0 shrink-0 items-start gap-2">
              <p className="line-clamp-2 min-w-0 flex-1 text-[13px] font-semibold leading-[18px] text-text">{name}</p>
              {slug && (
                <Link
                  href={`/tableros/${slug}${qs}`}
                  title={`Ver tablero de ${name}`}
                  aria-label={`Ver tablero de ${name}`}
                  className="pointer-events-auto relative z-10 -mr-1 -mt-0.5 inline-flex h-[22px] shrink-0 items-center gap-0.5 rounded-md px-1 text-[11.5px] font-medium text-muted underline-offset-2 transition hover:bg-surface-3 hover:text-text hover:underline"
                >
                  <span className="hidden @min-[240px]:inline">Ver tablero</span>
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              )}
            </div>
            <p className="pointer-events-none relative mt-auto flex shrink-0 items-baseline gap-1.5 pt-1.5">
              <span className="tabular text-[26px] font-bold leading-none tracking-tight text-text">{formatInt(t.value)}</span>
              <span className="tabular text-xs text-muted">{formatPct(share)}</span>
            </p>
            <span aria-hidden className="pointer-events-none relative mt-2 block h-1.5 shrink-0 overflow-hidden rounded-full bg-surface-3">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%`,
                  background: neutral ? "var(--chart-other)" : "var(--chart-1)",
                }}
              />
            </span>
          </div>
        );
      })}
      {tail.length > 0 && <OtherTile label={otherLabel} items={tail} total={total} widget={widget} cf={cf} rows={tailRows} oneLine={wide} />}
      <ChartTooltip state={state} />
    </div>
  );
}

function OtherTile({
  label,
  items,
  total,
  widget,
  cf,
  rows,
  oneLine,
}: {
  label: string;
  items: Item[];
  total: number;
  widget: WidgetDef;
  cf: ReturnType<typeof useCrossFilter>;
  /** Filas de la cola que caben (incluida la de "y N más"). */
  rows: number;
  /** Escritorio (alto fijo): nombres en una línea con title; en móvil se envuelven. */
  oneLine: boolean;
}) {
  const sum = items.reduce((a, b) => a + b.value, 0);
  const shown = items.length > rows ? items.slice(0, Math.max(1, rows - 1)) : items;
  const hidden = items.length - shown.length;
  const hiddenSum = items.slice(shown.length).reduce((a, b) => a + b.value, 0);
  return (
    <div role="listitem" className="@container flex min-h-[104px] min-w-0 flex-col rounded-2xl border border-border bg-surface-2 p-3.5">
      <p className="flex shrink-0 items-baseline justify-between gap-2" title={`${label}: ${formatInt(sum)} · ${formatPct(total ? sum / total : 0)}`}>
        <span className="min-w-0 truncate text-[13px] font-semibold leading-[18px] text-text">{label}</span>
        <span className="tabular whitespace-nowrap text-xs text-muted">
          <span className="text-[13px] font-bold text-text">{formatInt(sum)}</span>
          <span className="hidden @min-[210px]:inline"> · {formatPct(total ? sum / total : 0)}</span>
        </span>
      </p>
      <ul className="mt-1 flex shrink-0 flex-col" aria-label={`${label}: detalle`}>
        {shown.map((it) => {
          const name = displayLabel(it.label, widget.labelKind).full;
          const can = cf.can(it.label);
          const body = (
            <>
              <span className={cn("min-w-0 flex-1 text-left leading-[14px] text-text-2", oneLine ? "truncate" : "[overflow-wrap:anywhere]")}>{name}</span>
              <span className="tabular shrink-0 font-semibold text-text">{formatInt(it.value)}</span>
            </>
          );
          return (
            <li key={it.label} className={cn("min-w-0", cf.isDimmed(it.label) && "opacity-45")}>
              {can ? (
                <button
                  type="button"
                  aria-pressed={cf.isSelected(it.label)}
                  title={`${name}: ${formatInt(it.value)} · clic para filtrar`}
                  onClick={() => cf.toggle(it.label)}
                  className={cn("-mx-1 flex min-h-[18px] w-[calc(100%+8px)] items-center gap-2 rounded px-1 py-px text-[11px] hover:bg-surface-3", cf.isSelected(it.label) && "bg-primary-soft")}
                >
                  {body}
                </button>
              ) : (
                <span title={name} className="flex min-h-[18px] items-center gap-2 py-px text-[11px]">
                  {body}
                </span>
              )}
            </li>
          );
        })}
        {hidden > 0 && (
          <li className="flex h-[18px] items-center gap-2 text-[11px] text-muted" title="El detalle completo está en «Ver datos» (menú ⋯ de la tarjeta)">
            <span className="min-w-0 flex-1 truncate">y {formatInt(hidden)} más</span>
            <span className="tabular shrink-0 font-semibold text-text-2">{formatInt(hiddenSum)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
