"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import type { CategoryResult } from "@/dashboards/dto";
import type { BarWidget, DonutWidget, StatusTone, ValueFormat } from "@/dashboards/types";
import { innerWidth } from "@/dashboards/layout";
import { cn } from "@/lib/cn";
import { TONE_VARS } from "@/lib/charts/semantic";
import { formatInt, formatPct, formatValue } from "@/lib/format";
import { Swatch } from "./kit/chart-legend";
import { ChartTooltip, useChartTooltip, type TooltipContent } from "./kit/chart-tooltip";
import { LegendSlot } from "./kit/legend-slot";
import { QUALITY_CHIP_MIN, QUALITY_NOTICE_MIN, QualityChip } from "./kit/quality";
import { StatusIcon, TONE_LABEL } from "./kit/status-icon";
import { VizEmpty } from "./kit/viz-states";
import { ListFooter, MoreButton } from "./list-kit";
import {
  buildParts,
  dimensionOf,
  emphasis,
  FADE_MASK,
  formatOf,
  groupParts,
  missingShare,
  orderOf,
  paint,
  partTooltip,
  textWidth,
  useBox,
  useHover,
  useScrollFade,
  useSelection,
  type Part,
  type PartGroup,
} from "./status-shared";
import type { VizProps } from "./types";

/**
 * StatusBoard: estados de flujo con más de 7 valores.
 * Barra de ciclo de vida (por grupo) + columnas Finalizado / En curso / Devuelto / Anulado
 * (grupos de la familia "flujo" o vizOptions.groups), con subtotal y filas de 28–36 px
 * (punto, etiqueta, valor y mini barra relativa al mayor estado). Clic en fila o grupo filtra.
 * Las columnas se llenan en el orden de la barra (columnas CONSECUTIVAS). Con alto fijo, de los repartos que
 * caben se usa el de MENOS subcolumnas (columnas anchas y llenas: En curso 7 en una sola columna antes que
 * 4 + 3) y el sobrante se reparte estirando el paso de fila de 28 a 36 px (sin aire muerto bajo la lista).
 * El ancho de columna sale de la etiqueta más larga (no se parten en 2 líneas).
 * Si ningún reparto cabe (tablet 3 | 3), se muestran los grupos COMPLETOS que caben (nunca una cabecera sin
 * sus filas) y un pie "Devuelto 11 · Anulado 31 · Ver 4 estados más" (patrón de RankingList): los subtotales
 * visibles más los del pie suman el total. "Ver N más" despliega el resto con scroll interno y "Ver menos".
 */

type Props = VizProps<BarWidget | DonutWidget, CategoryResult>;

/** Columna mínima (sin contar la etiqueta más larga) y separación entre columnas (gap-5 + borde + pl-5). */
const COL_MIN = 176;
const COL_SEP = 41;
/** Fila: padding 8 + punto 8 + 2 separaciones de 8 + valor ≈ 30 (sin la etiqueta). */
const ROW_CHROME = 62;
/** Mini barra (36 px + separación); solo con columnas de al menos 260 px y si la etiqueta sigue cabiendo. */
const MINI_BAR = 44;
const COL_BAR_MIN = 260;
/** Cabecera de grupo (h-7), separación entre grupos de una columna (gap-3) y paso de fila (28, estirable a 36). */
const HEAD = 28;
const GROUP_GAP = 12;
const ROW = 28;
const ROW_MAX = 36;
/** Subcolumna más ancha preferida (más ancha, la cifra se aleja de su etiqueta). */
const SUB_MAX = 600;
/** Pie "Ver N estados más" (ListFooter: min-h-7 con pt-1.5). */
const MORE_FOOT = 28;
/** Barra de ciclo de vida (12) + separación (12); pie de neutrales (hairline + pt-2 + línea de 21) + separación. */
const BAR_BLOCK = 24;
const NEUTRAL_BLOCK = 42;

interface Shared {
  fmt: ValueFormat;
  sel: ReturnType<typeof useSelection>;
  hover: ReturnType<typeof useHover>;
  tip: (p: Part) => TooltipContent;
  max: number;
  /** Mini barra relativa al mayor estado (se oculta en columnas angostas). */
  miniBar: boolean;
  /** Paso de fila (28–36 px). */
  pitch: number;
}

interface BoardColumn {
  groups: PartGroup[];
  /** Subcolumnas: 2 cuando un grupo largo va solo y reparte sus filas en dos. */
  span: number;
}

interface BoardLayout {
  cols: BoardColumn[];
  sub: number;
  /** Ancho (px) de cada subcolumna. */
  width: number;
  /** Alto (px) de la columna más alta con filas de 28. */
  height: number;
}

/** Línea de etiqueta (12 px, leading-tight) y padding vertical de la fila (py-0.5). */
const LABEL_LINE = 15;
const ROW_PAD = 4;

/** Ancho de subcolumna de un reparto: 41 px entre columnas y 20 entre las subcolumnas de un grupo repartido. */
function subWidthOf(cols: BoardColumn[], inner: number): number {
  const sub = cols.reduce((a, c) => a + c.span, 0);
  return (inner - (cols.length - 1) * COL_SEP - cols.reduce((a, c) => a + (c.span - 1) * 20, 0)) / Math.max(1, sub);
}

/** Alto natural de una fila: la etiqueta ocupa 1–3 líneas en una subcolumna de `w` px (176 px parte las largas). */
function naturalRow(p: Part, w: number): number {
  const room = w - ROW_CHROME;
  const lines = room > 0 ? Math.min(3, Math.max(1, Math.ceil(textWidth(p.display, 12) / room))) : 3;
  return lines * LABEL_LINE + ROW_PAD;
}

/**
 * Alto (px) de una columna: cabeceras de 28 + 12 entre grupos + filas de `row` px (o más, si la etiqueta se
 * parte en la subcolumna de `w` px). En un grupo repartido, cada fila de la rejilla mide lo que su celda más alta.
 */
function colHeight(c: BoardColumn, row: number, w: number): number {
  return c.groups.reduce((a, g, i) => {
    const r = Math.ceil(g.parts.length / c.span);
    let rows = 0;
    for (let j = 0; j < r; j++) {
      let h = row;
      for (let k = j; k < g.parts.length; k += r) h = Math.max(h, naturalRow(g.parts[k], w));
      rows += h;
    }
    return a + HEAD + rows + (i ? GROUP_GAP : 0);
  }, 0);
}

function boardHeight(cols: BoardColumn[], row: number, w: number): number {
  return Math.max(0, ...cols.map((c) => colHeight(c, row, w)));
}

/**
 * Todas las reparticiones de los grupos en columnas CONSECUTIVAS (la lectura columna a columna sigue el orden
 * de la barra) con como mucho `maxSub` subcolumnas. Un grupo de 4 filas o más puede ir solo en su columna y
 * repartirse en dos subcolumnas (En curso 7 → 4 + 3).
 */
function layouts(groups: PartGroup[], maxSub: number, inner: number): BoardLayout[] {
  const n = groups.length;
  if (!n) return [];
  const out: BoardLayout[] = [];
  // Cortes entre grupos consecutivos (bit i = columna nueva tras el grupo i) × grupos repartidos en 2
  for (let cuts = 0; cuts < 1 << (n - 1); cuts++) {
    const cols: PartGroup[][] = [[groups[0]]];
    for (let i = 1; i < n; i++) {
      if (cuts & (1 << (i - 1))) cols.push([groups[i]]);
      else cols[cols.length - 1].push(groups[i]);
    }
    const splittable = cols.map((c) => c.length === 1 && c[0].parts.length >= 4);
    for (let mask = 0; mask < 1 << cols.length; mask++) {
      if (cols.some((_, i) => mask & (1 << i) && !splittable[i])) continue;
      const board = cols.map((g, i) => ({ groups: g, span: mask & (1 << i) ? 2 : 1 }));
      const sub = board.reduce((a, c) => a + c.span, 0);
      if (sub > maxSub) continue;
      const width = subWidthOf(board, inner);
      out.push({ cols: board, sub, width, height: boardHeight(board, ROW, width) });
    }
  }
  return out;
}

/** El reparto más bajo; a igual alto, el de menos subcolumnas (alto por contenido o scroll). */
function lowest(groups: PartGroup[], maxSub: number, inner: number): BoardLayout | null {
  let best: BoardLayout | null = null;
  for (const l of layouts(groups, maxSub, inner)) if (!best || l.height < best.height || (l.height === best.height && l.sub < best.sub)) best = l;
  return best;
}

/**
 * Con alto fijo: de los repartos que caben en `room`, el de MENOS subcolumnas (columnas anchas y llenas, con
 * mini barras); a igualdad, el más bajo (deja más sobrante para estirar las filas). Se prefieren subcolumnas
 * de hasta 600 px (en "Ampliar", una sola columna de 1036 px alejaría cada cifra de su etiqueta).
 * null si ninguno cabe.
 */
function fewest(groups: PartGroup[], maxSub: number, inner: number, room: number): BoardLayout | null {
  let best: BoardLayout | null = null;
  let wide: BoardLayout | null = null;
  for (const l of layouts(groups, maxSub, inner)) {
    if (l.height > room) continue;
    const better = (b: BoardLayout | null) => !b || l.sub < b.sub || (l.sub === b.sub && l.height < b.height);
    if (l.width > SUB_MAX) {
      if (better(wide)) wide = l;
    } else if (better(best)) best = l;
  }
  return best ?? wide;
}

/** Paso de fila que llena el alto: el mismo en todas las columnas, de 28 a 36 px (el sobrante, repartido). */
function rowPitch(layout: BoardLayout, room: number): number {
  if (room <= 0) return ROW;
  for (let pitch = ROW_MAX; pitch > ROW; pitch--) if (boardHeight(layout.cols, pitch, layout.width) <= room) return pitch;
  return ROW;
}

/** Al desplegar "Ver N más", lleva el scroll interno al primer grupo que estaba oculto (sin mover la página). */
function revealInScroll(el: HTMLElement | null) {
  const scroller = el?.closest<HTMLElement>("[data-board-scroll]");
  if (!el || !scroller) return;
  scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
}

export function StatusBoard({ widget, result, span, height, expanded }: Props) {
  const { ref, width, measured, fixed } = useBox<HTMLDivElement>();
  // Alto real para las columnas (cuerpo − barra − pie de neutrales): no depende del reparto elegido
  const { ref: areaRef, height: areaHeight, measured: areaMeasured, fixed: areaFixed } = useBox<HTMLDivElement>();
  const { ref: scrollRef, fade } = useScrollFade<HTMLDivElement>();
  const [showAll, setShowAll] = useState(false);
  const { state, show, hide } = useChartTooltip();
  const hover = useHover(show, hide);
  const sel = useSelection(dimensionOf(widget));
  const fmt = formatOf(widget);
  const vo = widget.vizOptions;
  const family = widget.semantic ?? "flujo";
  const order = orderOf(widget);
  const labelKind = widget.labelKind;

  const model = useMemo(() => {
    const parts = buildParts(result.labels, result.values, { family, overrides: vo?.overrides, order, labelKind, folded: result.folded, rest: result.rest });
    const groups = groupParts(parts, vo?.groups).map((g) => ({ ...g, parts: g.neutral ? g.parts : paintGroup(g.parts, g.tone) }));
    return { parts, groups };
  }, [result, family, vo?.overrides, vo?.groups, order, labelKind]);

  const total = model.parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <VizEmpty note={widget.note} />;

  const inner = measured ? width : expanded ? 1036 : innerWidth(span);
  const real = model.groups.filter((g) => !g.neutral);
  const neutral = model.groups.find((g) => g.neutral);
  // Ancho de subcolumna: la etiqueta más larga en una línea ("Solicitud de reclasificación" ≈ 150 px)
  const label = Math.max(0, ...real.flatMap((g) => g.parts.map((p) => textWidth(p.display, 12))));
  const colNeed = Math.max(COL_MIN, label + ROW_CHROME);
  const subsFor = (w: number) => Math.max(1, Math.floor((inner + COL_SEP) / (w + COL_SEP)));
  const subsPref = subsFor(colNeed);
  const subsMax = Math.max(subsPref, subsFor(COL_MIN));
  // Alto para las columnas (cuerpo − barra de ciclo de vida − pie neutral, medido); antes de medir, el
  // presupuesto de diseño; 0 = por contenido (móvil)
  const room = areaMeasured ? (areaFixed ? areaHeight : 0) : measured && !fixed ? 0 : height - BAR_BLOCK - (neutral ? NEUTRAL_BLOCK : 0);
  // Primero columnas donde la etiqueta más larga cabe en una línea; si no caben en el alto, columnas de
  // 176 px (etiquetas en 2 líneas); si tampoco, grupos completos + "Ver N más"; como red, scroll interno
  const fit = (groups: PartGroup[], r: number) => fewest(groups, subsPref, inner, r) ?? fewest(groups, subsMax, inner, r);
  const lowestAll = () => {
    const pref = lowest(real, subsPref, inner);
    const more = lowest(real, subsMax, inner);
    return more && pref && more.height < pref.height ? more : pref;
  };
  let board = room > 0 ? fit(real, room) : lowest(real, subsPref, inner);
  let hidden: PartGroup[] = [];
  const cut = room > 0 && !board && !expanded;
  if (cut && !showAll) {
    for (let k = real.length - 1; k >= 1 && !board; k--) {
      board = fit(real.slice(0, k), room - MORE_FOOT);
      if (board) hidden = real.slice(k);
    }
  }
  const footer = cut && (showAll || hidden.length > 0);
  const chosen = board ?? lowestAll();
  const columns = chosen?.cols ?? [];
  const pitch = board ? rowPitch(board, room - (footer ? MORE_FOOT : 0)) : ROW;
  const subWidth = chosen?.width ?? inner;
  const max = Math.max(1, ...real.flatMap((g) => g.parts.map((p) => p.value)));
  const tip = (p: Part) => partTooltip(p, fmt, { on: sel.isOn(p), canFilter: sel.canFilter, extra: p.group ? `${p.group}` : undefined });
  const shared: Shared = { fmt, sel, hover, tip, max, pitch, miniBar: subWidth >= COL_BAR_MIN && subWidth >= label + ROW_CHROME + MINI_BAR };
  const miss = missingShare(model.parts);
  const missShare = miss.total ? miss.neutral / miss.total : 0;
  // Al desplegar, el primer grupo que estaba oculto se trae a la vista dentro del scroll interno
  const firstHidden = footer && showAll ? real[shownCount(real, room - MORE_FOOT, fit)]?.key : undefined;

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col gap-3" onMouseLeave={hover.leave}>
      {missShare >= QUALITY_CHIP_MIN && missShare < QUALITY_NOTICE_MIN && (
        <LegendSlot side="end">
          <QualityChip neutral={miss.neutral} total={miss.total} />
        </LegendSlot>
      )}
      <LifecycleBar groups={model.groups} {...shared} />
      <div ref={areaRef} className="flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} data-board-scroll="" className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", fade && FADE_MASK)}>
          <div className="flex items-start gap-5">
            {columns.map((col, i) => (
              // self-start (items-start): el divisor mide lo que su columna, no el alto del cuerpo
              <div key={i} className={cn("flex min-w-0 flex-col gap-3", i > 0 && "border-l border-border pl-5")} style={{ flex: `${col.span} 1 0%` }}>
                {col.groups.map((g) => (
                  <GroupColumn key={g.key} group={g} split={col.span} sectionRef={g.key === firstHidden ? revealInScroll : undefined} {...shared} />
                ))}
              </div>
            ))}
          </div>
        </div>
        {footer && <MoreFoot hidden={hidden} inner={inner} open={showAll} onToggle={() => setShowAll(!showAll)} fmt={fmt} />}
      </div>
      {neutral && <NeutralFoot group={neutral} {...shared} />}
      <ChartTooltip state={state} />
    </div>
  );
}

/** Cuántos grupos completos (en orden) caben en `room`; con todos visibles, el índice del primero que no cabía. */
function shownCount(groups: PartGroup[], room: number, fit: (g: PartGroup[], r: number) => BoardLayout | null): number {
  for (let k = groups.length - 1; k >= 1; k--) if (fit(groups.slice(0, k), room)) return k;
  return groups.length;
}

/** Ancho estimado del resumen de grupos ocultos ("⏰ Devuelto 11 · ◌ Anulado 31"). */
function hiddenWidth(groups: PartGroup[], fmt: ValueFormat): number {
  return groups.reduce((a, g, i) => a + (i ? 12 : 0) + 14 + 4 + textWidth(g.label, 12) + 4 + textWidth(formatValue(g.value, fmt), 12, { bold: true }), 0);
}

/**
 * Pie de 28 px (mismo patrón y estilo que RankingList): a la izquierda, los grupos que no caben con su subtotal
 * (los subtotales visibles + estos suman el total); a la derecha, "Ver N estados más" / "Ver menos".
 * En celdas angostas el botón se acorta a "Ver N más" y, si aun así no cabe, el resumen pasa al lector de pantalla.
 */
function MoreFoot({ hidden, inner, open, onToggle, fmt }: { hidden: PartGroup[]; inner: number; open: boolean; onToggle: () => void; fmt: ValueFormat }) {
  const n = hidden.reduce((a, g) => a + g.parts.length, 0);
  const summary = hidden.map((g) => `${g.label} ${formatValue(g.value, fmt)}`).join(", ");
  const long = `Ver ${formatInt(n)} ${n === 1 ? "estado" : "estados"} más`;
  const short = `Ver ${formatInt(n)} más`;
  const left = hiddenWidth(hidden, fmt);
  const btn = (s: string) => textWidth(s, 12, { bold: true }) + 16;
  const text = left + 12 + btn(long) <= inner ? long : short;
  const showLeft = left + 12 + btn(text) <= inner;
  if (open) {
    return (
      <ListFooter
        right={
          <MoreButton onClick={onToggle} expanded>
            Ver menos
          </MoreButton>
        }
      />
    );
  }
  return (
    <ListFooter
      left={
        showLeft
          ? hidden.map((g) => (
              <span key={g.key} className="inline-flex items-center gap-1 whitespace-nowrap">
                <StatusIcon tone={g.tone} className="size-3.5" />
                {g.label}
                <span className="tabular font-semibold text-text-2">{formatValue(g.value, fmt)}</span>
              </span>
            ))
          : null
      }
      right={
        <MoreButton onClick={onToggle}>
          {text}
          {!showLeft && <span className="sr-only">: {summary}</span>}
        </MoreButton>
      }
    />
  );
}

/**
 * Dentro de un grupo: mismo tono con escalones de tono (semantic.ts › toneStep) solo con 3 estados o menos.
 * Con más, el escalonado se repetiría en ciclo y sugeriría subgrupos que no existen: tono único al 100 %.
 */
function paintGroup(parts: Part[], tone: StatusTone): Part[] {
  const painted = paint(parts.map((p) => ({ ...p, tone: p.tone && p.tone !== "neutral" ? p.tone : tone })));
  return painted.length <= 3 ? painted : painted.map((p) => ({ ...p, mix: 1, color: p.solid }));
}

function groupTip(g: PartGroup, fmt: ValueFormat, canFilter: boolean, on: boolean): TooltipContent {
  return {
    title: g.label,
    value: formatValue(g.value, fmt),
    valueNote: formatPct(g.share),
    rows: g.parts.slice(0, 8).map((p) => ({ label: p.display, value: formatValue(p.value, fmt), color: p.color })),
    hint: canFilter ? (on ? "Clic para quitar el filtro del grupo" : "Clic para filtrar el grupo") : undefined,
  };
}

function LifecycleBar({ groups, fmt, sel, hover }: Shared & { groups: PartGroup[] }) {
  const visible = groups.filter((g) => g.value > 0);
  return (
    <div aria-hidden className="flex h-3 w-full shrink-0 gap-[2px] overflow-hidden rounded-full">
      {visible.map((g) => {
        const labels = g.parts.flatMap((p) => (p.filterable ? p.labels : []));
        const on = labels.length > 0 && labels.every((l) => sel.selected.includes(l));
        const tt = groupTip(g, fmt, sel.canFilter, on);
        return (
          <div
            key={g.key}
            onMouseMove={hover.enter(`g:${g.key}`, tt)}
            onMouseLeave={hover.leave}
            onClick={hover.tap(() => sel.toggleMany(labels))}
            className={cn("min-w-[3px] transition-[flex-grow,opacity] duration-300", sel.canFilter && labels.length ? "cursor-pointer" : "cursor-default", groupEmphasis(g, hover.hovered, on, sel))}
            style={{ flexGrow: g.value, flexBasis: 0, background: TONE_VARS[g.tone].solid }}
          />
        );
      })}
    </div>
  );
}

function groupEmphasis(g: PartGroup, hovered: string | null, on: boolean, sel: Shared["sel"]) {
  if (hovered) return hovered === `g:${g.key}` || g.parts.some((p) => p.key === hovered) ? "" : "opacity-40";
  if (sel.any && !on && !g.parts.some((p) => sel.isOn(p))) return "opacity-45";
  return "";
}

function GroupColumn({ group, split, sectionRef, ...shared }: Shared & { group: PartGroup; split: number; sectionRef?: (el: HTMLElement | null) => void }) {
  const { fmt, sel, hover } = shared;
  const labels = group.parts.flatMap((p) => (p.filterable ? p.labels : []));
  const on = labels.length > 0 && labels.every((l) => sel.selected.includes(l));
  const tt = groupTip(group, fmt, sel.canFilter, on);
  const dimmed = hover.hovered ? hover.hovered !== `g:${group.key}` && !group.parts.some((p) => p.key === hover.hovered) : false;
  return (
    <section ref={sectionRef} aria-label={`${group.label}: ${formatValue(group.value, fmt)} (${formatPct(group.share)})`} className="flex min-w-0 flex-col">
      <button
        type="button"
        disabled={!sel.canFilter || !labels.length}
        aria-pressed={sel.canFilter ? on : undefined}
        onClick={hover.tap(() => sel.toggleMany(labels))}
        onMouseEnter={hover.enter(`g:${group.key}`, tt)}
        onMouseMove={hover.enter(`g:${group.key}`, tt)}
        onMouseLeave={hover.leave}
        onFocus={hover.focus(`g:${group.key}`, tt)}
        onBlur={hover.leave}
        className={cn("flex h-7 w-full shrink-0 items-center gap-1.5 border-b border-border px-1 text-left transition enabled:hover:bg-surface-3", on && "bg-primary-soft", dimmed && "opacity-40")}
      >
        <StatusIcon tone={group.tone} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text">{group.label}</span>
        <span className="tabular text-[12.5px] font-semibold text-text">{formatValue(group.value, fmt)}</span>
        <span className="tabular w-11 text-right text-[11px] text-muted">{formatPct(group.share)}</span>
      </button>
      <ul
        role="list"
        aria-label={group.label}
        className={cn(split > 1 ? "grid gap-x-5" : "flex flex-col")}
        // Grupo repartido en subcolumnas: se lee hacia abajo y luego a la derecha (orden de proceso)
        style={split > 1 ? { gridTemplateColumns: `repeat(${split}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${Math.ceil(group.parts.length / split)}, auto)`, gridAutoFlow: "column" } : undefined}
      >
        {group.parts.map((p) => (
          <li key={p.key}>
            <StateRow p={p} {...shared} groupHovered={hover.hovered === `g:${group.key}`} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StateRow({ p, fmt, sel, hover, tip, max, miniBar, pitch, groupHovered }: Shared & { p: Part; groupHovered: boolean }) {
  const interactive = sel.canFilter && p.filterable && p.labels.length > 0;
  const on = sel.isOn(p);
  const tt = tip(p);
  const dim = groupHovered ? "" : emphasis(p.key, hover.hovered?.startsWith("g:") ? null : hover.hovered, on, sel.any);
  return (
    <button
      type="button"
      aria-pressed={interactive ? on : undefined}
      aria-disabled={interactive ? undefined : true}
      aria-label={`${p.display}: ${formatValue(p.value, fmt)} (${formatPct(p.share)})${p.tone ? `, ${TONE_LABEL[p.tone]}` : ""}`}
      onClick={hover.tap(() => interactive && sel.toggle(p))}
      onMouseEnter={hover.enter(p.key, tt)}
      onMouseMove={hover.enter(p.key, tt)}
      onMouseLeave={hover.leave}
      onFocus={hover.focus(p.key, tt)}
      onBlur={hover.leave}
      // Paso de fila de 28–36 px: el sobrante del cuerpo se reparte entre las filas (sin aire muerto al pie)
      style={{ minHeight: pitch }}
      className={cn(
        "grid w-full items-center gap-x-2 rounded-md px-1 text-left transition",
        miniBar ? "grid-cols-[auto_minmax(0,1fr)_auto_36px]" : "grid-cols-[auto_minmax(0,1fr)_auto]",
        interactive ? "cursor-pointer hover:bg-surface-3" : "cursor-default",
        on && "bg-primary-soft",
        dim,
      )}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: p.color }} />
      <span className="min-w-0 hyphens-auto break-words py-0.5 text-xs leading-tight text-text-2">{p.display}</span>
      <span className="tabular inline-flex items-center gap-1 text-xs font-semibold text-text">
        {on && <Check className="size-3 text-primary-text" aria-hidden />}
        {formatValue(p.value, fmt)}
      </span>
      {miniBar && (
        <span aria-hidden className="h-1 w-9 overflow-hidden rounded-full bg-surface-3">
          <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(4, (p.value / max) * 100)}%`, background: p.color }} />
        </span>
      )}
    </button>
  );
}

/** Neutrales ("Otros", "No reporta") fuera de las columnas y de la escala. */
function NeutralFoot({ group, fmt, sel, hover, tip }: Shared & { group: PartGroup }) {
  return (
    <p className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-[11.5px] text-muted">
      {group.parts.map((p) => {
        const interactive = sel.canFilter && p.filterable && p.labels.length > 0;
        const on = sel.isOn(p);
        const tt = tip(p);
        return (
          <button
            key={p.key}
            type="button"
            aria-pressed={interactive ? on : undefined}
            aria-disabled={interactive ? undefined : true}
            onClick={hover.tap(() => interactive && sel.toggle(p))}
            onMouseEnter={hover.enter(p.key, tt)}
            onMouseMove={hover.enter(p.key, tt)}
            onMouseLeave={hover.leave}
            onFocus={hover.focus(p.key, tt)}
            onBlur={hover.leave}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 transition", interactive ? "cursor-pointer hover:bg-surface-3" : "cursor-default", on && "bg-primary-soft")}
          >
            <Swatch color={p.color || "var(--neutral-mark)"} />
            <span>{p.display}</span>
            <span className="tabular font-semibold text-text-2">{formatValue(p.value, fmt)}</span>
            <span className="tabular">· {formatPct(p.share)}</span>
          </button>
        );
      })}
    </p>
  );
}
