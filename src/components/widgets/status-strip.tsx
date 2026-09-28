"use client";

import { Check } from "lucide-react";
import { useMemo } from "react";
import type { CategoryResult } from "@/dashboards/dto";
import type { BarWidget, DonutWidget, SemanticFamily, ValueFormat } from "@/dashboards/types";
import { innerWidth } from "@/dashboards/layout";
import { cn } from "@/lib/cn";
import { isNeutral, normalizeLabel, TONE_VARS } from "@/lib/charts/semantic";
import { formatPct, formatValue } from "@/lib/format";
import { Swatch } from "./kit/chart-legend";
import { ChartTooltip, useChartTooltip } from "./kit/chart-tooltip";
import { LegendSlot } from "./kit/legend-slot";
import { QUALITY_CHIP_MIN, QUALITY_NOTICE_MIN, QualityChip } from "./kit/quality";
import { StatusIcon, TONE_LABEL } from "./kit/status-icon";
import { VizEmpty } from "./kit/viz-states";
import {
  buildParts,
  dimensionOf,
  emphasis,
  FADE_MASK,
  formatOf,
  groupParts,
  mergeNeutrals,
  missingShare,
  orderOf,
  partTooltip,
  toneNote,
  ProportionBar,
  useBox,
  useHover,
  useScrollFade,
  useSelection,
  type Part,
  type PartGroup,
} from "./status-shared";
import type { VizProps } from "./types";

/**
 * StatusStrip: estados con familia semántica (≤ 7 valores).
 * - horizontal: barra 100 % de 12 px + tiles (≥ 112×76) que se reparten sin huecos (la última línea se
 *   estira), agrupados (Abiertos | Cerrados). Cada tile: etiqueta, cifra y % juntos arriba y una barra de
 *   participación al pie. Los neutrales forman su propio grupo "Sin clasificar" (cabecera muted, separado).
 * - vertical (span ≤ 4): tiles apilados de 64 px (puede ser la leyenda de la gráfica vecina).
 * - list: lista compacta con los neutrales en una cabecera fuera de escala (guías).
 * Con orden declarado, los estados sin casos se muestran en 0 (atenuados): los hermanos se leen igual.
 */

/** Contexto de la cabecera neutral en la variante lista. */
const NEUTRAL_CONTEXT: Partial<Record<SemanticFamily, string>> = { guia: "envío electrónico" };

/** Tile horizontal: ancho mínimo y separación. */
const TILE_MIN = 112;
const TILE_GAP = 8;
/** Separación entre grupos (gap-x-4) y cabecera de grupo (h-7). */
const GROUP_GAP = 16;
const GROUP_HEAD = 28;
/** Ancho mínimo de un grupo real: su cabecera ("CERRADOS 734 · 72,0 %") cabe en una línea. */
const GROUP_MIN = 168;
/** Grupo neutral en la misma línea: tile + separador (pl-3 + borde); su cabecera "SIN CLASIFICAR" cabe. */
const NEUTRAL_BASIS = 136 + 13;
/** A partir de este alto de tile la cifra sube a 32 px. */
const TILE_LG = 104;

type Props = VizProps<BarWidget | DonutWidget, CategoryResult>;

interface Shared {
  fmt: ValueFormat;
  sel: ReturnType<typeof useSelection>;
  hover: ReturnType<typeof useHover>;
  tip: (p: Part) => ReturnType<typeof partTooltip>;
}

function ariaFor(p: Part, fmt: ValueFormat) {
  return `${p.code ? `${p.code} ` : ""}${p.display}: ${formatValue(p.value, fmt)} (${formatPct(p.share)})${p.tone ? `, ${TONE_LABEL[p.tone]}` : ""}`;
}

function handlers(p: Part, { sel, hover, tip }: Shared) {
  const interactive = sel.canFilter && p.filterable && p.labels.length > 0 && p.value > 0;
  return {
    interactive,
    props: {
      type: "button" as const,
      "aria-pressed": interactive ? sel.isOn(p) : undefined,
      "aria-disabled": interactive ? undefined : true,
      onClick: hover.tap(() => interactive && sel.toggle(p)),
      onMouseEnter: hover.enter(p.key, tip(p)),
      onMouseMove: hover.enter(p.key, tip(p)),
      onMouseLeave: hover.leave,
      onFocus: hover.focus(p.key, tip(p)),
      onBlur: hover.leave,
    },
  };
}

function groupBasis(g: PartGroup): number {
  if (g.neutral) return NEUTRAL_BASIS;
  const n = g.parts.length;
  return Math.max(GROUP_MIN, n * TILE_MIN + (n - 1) * TILE_GAP);
}

/** Simula el flex-wrap de los grupos: líneas de grupos, líneas de tiles y si el neutral cae en su propia línea. */
function flowGroups(groups: PartGroup[], inner: number) {
  const lines: PartGroup[][] = [];
  let x = 0;
  for (const g of groups) {
    const w = groupBasis(g);
    if (!lines.length || x + GROUP_GAP + w > inner) {
      lines.push([g]);
      x = w;
    } else {
      lines[lines.length - 1].push(g);
      x += GROUP_GAP + w;
    }
  }
  const perLine = Math.max(1, Math.floor((inner + TILE_GAP) / (TILE_MIN + TILE_GAP)));
  // Un grupo solo en su línea y más ancho que ella reparte sus tiles en varias líneas
  const tileLines = lines.reduce((s, line) => s + Math.max(...line.map((g) => (line.length === 1 && groupBasis(g) > inner ? Math.ceil(g.parts.length / perLine) : 1))), 0);
  const neutralOwnLine = lines.some((line) => line.length === 1 && line[0].neutral && lines.length > 1);
  return { groupLines: lines.length, tileLines, neutralOwnLine };
}

export function StatusStrip({ widget, result, span, height, expanded }: Props) {
  const { ref, width, height: boxHeight, measured, fixed } = useBox<HTMLDivElement>();
  const { state, show, hide } = useChartTooltip();
  const hover = useHover(show, hide);
  const sel = useSelection(dimensionOf(widget));
  const fmt = formatOf(widget);
  const vo = widget.vizOptions;
  const family = widget.semantic;
  const order = orderOf(widget);
  const labelKind = widget.labelKind;
  const variant = vo?.variant ?? (!expanded && innerWidth(span) <= 305 ? "vertical" : "horizontal");

  const parts = useMemo(() => {
    // Estados declarados sin casos (p. ej. "Abierto vencido: 0" en Entes): se muestran en 0, atenuados
    const present = new Set(result.labels.map((l) => normalizeLabel(l)));
    const missing = family && order?.length ? order.filter((l) => !isNeutral(l) && !present.has(normalizeLabel(l))) : [];
    const labels = [...result.labels, ...missing];
    const values = [...result.values, ...missing.map(() => 0)];
    const base = buildParts(labels, values, { family, overrides: vo?.overrides, order, labelKind, folded: result.folded, rest: result.rest, keepZero: missing.length > 0 });
    return mergeNeutrals(base);
  }, [result, family, vo?.overrides, order, labelKind]);
  const groups = useMemo(() => groupParts(parts, vo?.groups), [parts, vo?.groups]);
  const grouped = variant === "horizontal" && groups.filter((g) => !g.neutral && g.key !== "__none").length >= 2;
  const ordered = useMemo(() => groups.flatMap((g) => g.parts), [groups]);

  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <VizEmpty note={widget.note} />;

  const tip = (p: Part) => partTooltip(p, fmt, { on: sel.isOn(p), canFilter: sel.canFilter && p.value > 0, extra: toneNote(p.tone) });
  const shared: Shared = { fmt, sel, hover, tip };
  const miss = missingShare(parts);
  const missShare = miss.total ? miss.neutral / miss.total : 0;
  const chip = variant !== "list" && missShare >= QUALITY_CHIP_MIN && missShare < QUALITY_NOTICE_MIN && (
    <LegendSlot side="end">
      <QualityChip neutral={miss.neutral} total={miss.total} />
    </LegendSlot>
  );
  // Alto disponible: medido si la fila lo fija; presupuesto antes de medir; 0 = por contenido (móvil)
  const avail = measured ? (fixed ? boxHeight : 0) : height;

  if (variant === "list") {
    return (
      <div ref={ref} className="flex h-full min-h-0 flex-col" onMouseLeave={hover.leave}>
        <StatusList parts={ordered} family={family} avail={avail} {...shared} title={widget.title} />
        <ChartTooltip state={state} />
      </div>
    );
  }

  const bar = (
    <ProportionBar
      parts={ordered}
      thickness={12}
      hovered={hover.hovered}
      isOn={sel.isOn}
      anySelected={sel.any}
      onEnter={(p) => hover.enter(p.key, tip(p))}
      onLeave={hover.leave}
      onClick={(p) => hover.tap(() => sel.toggle(p))()}
    />
  );

  // Líneas equilibradas (3 + 2 en vez de 4 + 1): tiles por línea = ⌊(interno + 8) / 120⌋
  const inner = measured ? width : expanded ? 1036 : innerWidth(span);
  const perLine = Math.max(1, Math.floor((inner + TILE_GAP) / (TILE_MIN + TILE_GAP)));
  const cols = Math.ceil(ordered.length / Math.ceil(ordered.length / perLine));
  const flow = grouped ? flowGroups(groups, inner) : null;
  // Alto de cada tile (para la cifra de 32 px): cuerpo − barra − cabeceras de grupo, repartido por líneas
  const tileLines = flow ? flow.tileLines : Math.ceil(ordered.length / cols);
  const heads = flow ? flow.groupLines * GROUP_HEAD : 0;
  const tileH = avail > 0 ? (avail - 24 - heads - (tileLines - 1) * TILE_GAP) / tileLines : 0;
  const lg = tileH >= TILE_LG;

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col" onMouseLeave={hover.leave}>
      {chip}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {bar}
        {variant === "vertical" ? (
          <ul role="list" aria-label={widget.title} className="grid min-h-0 flex-1 gap-2" style={{ gridAutoRows: "minmax(56px, 1fr)" }}>
            {ordered.map((p) => (
              <li key={p.key} className="min-w-0">
                <Tile p={p} orientation="vertical" {...shared} />
              </li>
            ))}
          </ul>
        ) : grouped ? (
          <div className="flex min-h-0 flex-1 flex-wrap content-stretch gap-x-4 gap-y-2">
            {groups.map((g) => (
              <TileGroup key={g.key} group={g} ownLine={Boolean(flow?.neutralOwnLine)} inner={inner} lg={lg} {...shared} />
            ))}
          </div>
        ) : (
          <TileGrid parts={ordered} label={widget.title} cols={cols} lg={lg} {...shared} />
        )}
      </div>
      <ChartTooltip state={state} />
    </div>
  );
}

// ─── Tiles ───────────────────────────────────────────────────────────────────

/**
 * Tiles en flex-wrap: con `cols`, base de 1/cols; sin él, base mínima de 112 px. La última línea se estira
 * (5 → 3 + 2 anchos, 3 → 2 + 1 a todo el ancho): nunca quedan celdas vacías en la rejilla.
 */
function TileGrid({ parts, label, cols, lg, ...shared }: Shared & { parts: Part[]; label: string; cols?: number; lg: boolean }) {
  const basis = cols ? `calc((100% - ${(cols - 1) * TILE_GAP}px) / ${cols} - 0.5px)` : `${TILE_MIN}px`;
  return (
    <ul role="list" aria-label={label} className="flex min-h-0 flex-1 flex-wrap content-stretch gap-2">
      {parts.map((p) => (
        <li key={p.key} className="flex min-h-[76px] min-w-[112px] grow" style={{ flexBasis: basis }}>
          <Tile p={p} orientation="horizontal" lg={lg} {...shared} />
        </li>
      ))}
    </ul>
  );
}

function TileGroup({ group, ownLine, inner, lg, ...shared }: Shared & { group: PartGroup; ownLine: boolean; inner: number; lg: boolean }) {
  const n = group.parts.length;
  const labels = group.parts.flatMap((p) => (p.filterable ? p.labels : []));
  const on = labels.length > 0 && labels.every((l) => shared.sel.selected.includes(l));
  const head = "flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap text-[11.5px]";
  return (
    <div
      role="group"
      aria-label={group.label}
      // El grupo neutral va aparte: con separador punteado si comparte línea, en su propia línea si no cabe
      className={cn("flex min-w-0 flex-col", group.neutral && !ownLine && "border-l border-dashed border-border pl-3")}
      // En su propia línea no se estira a todo el ancho: conserva el ancho de un tile (≤ 240 px)
      style={{ flex: group.neutral && ownLine ? `0 1 ${Math.max(NEUTRAL_BASIS, Math.min(240, inner / 3))}px` : `${group.neutral ? 1 : n} 1 ${groupBasis(group)}px` }}
    >
      {group.neutral ? (
        <p className={head}>
          <span className="font-semibold uppercase tracking-[0.08em] text-muted">{group.label}</span>
          {ownLine && (
            <>
              <span className="tabular font-semibold text-text-2">{formatValue(group.value, shared.fmt)}</span>
              <span className="tabular text-muted">· {formatPct(group.share)}</span>
            </>
          )}
        </p>
      ) : (
        <button
          type="button"
          disabled={!shared.sel.canFilter || !labels.length}
          aria-pressed={shared.sel.canFilter ? on : undefined}
          title={shared.sel.canFilter ? "Clic para filtrar el grupo" : undefined}
          onClick={() => shared.sel.toggleMany(labels)}
          className={cn("-mx-1 self-start rounded-md px-1 transition enabled:hover:bg-surface-3", head, on && "bg-primary-soft")}
        >
          <span className="font-semibold uppercase tracking-[0.08em] text-muted">{group.label}</span>
          <span className="tabular font-semibold text-text-2">{formatValue(group.value, shared.fmt)}</span>
          <span className="tabular text-muted">· {formatPct(group.share)}</span>
        </button>
      )}
      <TileGrid parts={group.parts} label={group.label} lg={lg} {...shared} />
    </div>
  );
}

function Tile({ p, orientation, lg, ...shared }: Shared & { p: Part; orientation: "horizontal" | "vertical"; lg?: boolean }) {
  const { interactive, props } = handlers(p, shared);
  const on = shared.sel.isOn(p);
  const tone = p.tone;
  const zero = p.value === 0;
  const critical = tone === "critical" && !zero;
  const edge = tone ? TONE_VARS[tone].solid : p.color;
  const mark = tone ? <StatusIcon tone={tone} className="size-4" /> : <Swatch color={p.color} />;
  const name = (
    <span className="block min-w-0 flex-1 hyphens-auto break-words text-[12.5px] leading-tight text-text-2">
      {p.code && <span className="mr-1 font-mono text-[10.5px] text-muted">{p.code}</span>}
      {p.display}
    </span>
  );
  const dim = emphasis(p.key, shared.hover.hovered, on, shared.sel.any);
  const base = cn(
    "relative h-full w-full rounded-xl text-left transition",
    critical ? "bg-critical-soft" : "bg-surface-2",
    interactive ? "cursor-pointer hover:ring-1 hover:ring-inset hover:ring-border" : "cursor-default",
    on && "ring-2 ring-inset ring-primary hover:ring-2 hover:ring-primary",
    // Estado declarado sin casos: atenuado (la atenuación por hover o selección manda si existe)
    dim || (zero && "opacity-60"),
  );
  const value = (
    <span
      className={cn("tabular font-bold tracking-tight", zero ? "text-muted" : "text-text", orientation === "vertical" ? "text-xl leading-tight" : cn("leading-none", lg ? "text-[32px]" : "text-2xl"))}
    >
      {formatValue(p.value, shared.fmt)}
    </span>
  );
  const pct = (
    <span className="tabular inline-flex items-center gap-1 text-xs text-muted">
      {formatPct(p.share)}
      {on && <Check className="size-3 text-primary-text" aria-hidden />}
    </span>
  );

  if (orientation === "vertical") {
    return (
      <button {...props} aria-label={ariaFor(p, shared.fmt)} className={cn(base, "flex items-center gap-2.5 border-l-[3px] py-2 pl-3 pr-3")} style={{ borderLeftColor: edge }}>
        <span className="shrink-0">{mark}</span>
        {name}
        <span className="flex shrink-0 flex-col items-end">
          {value}
          {pct}
        </span>
      </button>
    );
  }
  // Etiqueta, cifra y % juntos arriba; la barra de participación al pie le da función al alto del tile
  return (
    <button {...props} aria-label={ariaFor(p, shared.fmt)} className={cn(base, "flex flex-col gap-1.5 border-t-[3px] px-3 pb-2.5 pt-2", lg && "gap-2 pt-2.5")} style={{ borderTopColor: edge }}>
      <span className="flex w-full items-start gap-1.5">
        <span className="mt-px shrink-0">{mark}</span>
        {name}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        {value}
        {pct}
      </span>
      <span aria-hidden className="mt-auto block h-1 w-full shrink-0 overflow-hidden rounded-full bg-surface-3">
        <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${p.share * 100}%`, background: edge }} />
      </span>
    </button>
  );
}

// ─── Variante lista ──────────────────────────────────────────────────────────

/** Cabecera neutral (32) + separación (8) + fila de 28 por estado; la nota "Con dato" suma 24. */
const LIST_HEAD = 40;
const LIST_ROW = 30;
const LIST_NOTE = 24;

function StatusList({ parts, family, title, avail, ...shared }: Shared & { parts: Part[]; family?: SemanticFamily; title: string; avail: number }) {
  const neutral = parts.filter((p) => p.neutral);
  const real = parts.filter((p) => !p.neutral);
  const max = Math.max(1, ...real.map((p) => p.value));
  const realTotal = real.reduce((s, p) => s + p.value, 0);
  const context = family ? NEUTRAL_CONTEXT[family] : undefined;
  const { ref: scrollRef, fade } = useScrollFade<HTMLDivElement>();
  const noteText = `Con dato: ${formatValue(realTotal, shared.fmt)} · barras relativas a este grupo`;
  // La nota solo si cabe (en móvil, siempre); si no, va en la etiqueta accesible y en el title de la lista
  const showNote = neutral.length > 0 && real.length > 0 && (avail <= 0 || avail >= (neutral.length ? LIST_HEAD : 0) + LIST_NOTE + real.length * LIST_ROW);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {neutral.map((p) => {
        const { interactive, props } = handlers(p, shared);
        const on = shared.sel.isOn(p);
        return (
          <button
            key={p.key}
            {...props}
            aria-label={`${ariaFor(p, shared.fmt)}${context ? ` (${context})` : ""}, fuera de escala`}
            title={context ? `${p.display} (${context})` : undefined}
            className={cn(
              "flex min-h-8 w-full shrink-0 flex-nowrap items-center gap-2 rounded-xl border border-dashed border-border bg-surface-2 px-3 py-1 text-left transition",
              interactive ? "cursor-pointer hover:bg-surface-3" : "cursor-default",
              on && "border-solid border-primary bg-primary-soft",
              emphasis(p.key, shared.hover.hovered, on, shared.sel.any),
            )}
          >
            <StatusIcon tone="neutral" className="size-4" />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-2">{p.display}</span>
            <span className="tabular shrink-0 whitespace-nowrap text-[12.5px]">
              <span className="font-semibold text-text">{formatValue(p.value, shared.fmt)}</span>
              <span className="text-muted"> · {formatPct(p.share)}</span>
            </span>
          </button>
        );
      })}
      {showNote && <p className="tabular shrink-0 px-1 text-[11px] text-muted">{noteText}</p>}
      <div ref={scrollRef} className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", fade && FADE_MASK)}>
        <ul role="list" aria-label={neutral.length && !showNote ? `${title}. ${noteText}` : title} title={neutral.length && !showNote ? noteText : undefined} className="flex flex-col">
          {real.map((p) => {
            const { interactive, props } = handlers(p, shared);
            const on = shared.sel.isOn(p);
            return (
              <li key={p.key}>
                <button
                  {...props}
                  aria-label={ariaFor(p, shared.fmt)}
                  className={cn(
                    "grid min-h-7 w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 rounded-lg px-1.5 py-0.5 text-left transition",
                    interactive ? "cursor-pointer hover:bg-surface-3" : "cursor-default",
                    on && "bg-primary-soft ring-1 ring-inset ring-primary/40",
                    emphasis(p.key, shared.hover.hovered, on, shared.sel.any),
                  )}
                >
                  {p.tone ? <StatusIcon tone={p.tone} /> : <Swatch color={p.color} />}
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="hyphens-auto break-words text-[12px] leading-[15px] text-text-2">
                      {p.code && <span className="mr-1 font-mono text-[10.5px] text-muted">{p.code}</span>}
                      {p.display}
                    </span>
                    <span aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
                      <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${(p.value / max) * 100}%`, background: p.color }} />
                    </span>
                  </span>
                  <span className="tabular text-[13px] font-semibold text-text">{formatValue(p.value, shared.fmt)}</span>
                  <span className="tabular w-11 text-right text-xs text-muted">{formatPct(p.share)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
