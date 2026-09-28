"use client";

import { UserX } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import type { CategoryResult } from "@/dashboards/dto";
import type { BarWidget, ValueFormat } from "@/dashboards/types";
import { innerWidth } from "@/dashboards/layout";
import { cn } from "@/lib/cn";
import { isNeutral } from "@/lib/charts/semantic";
import { formatInt, formatPct, formatValue } from "@/lib/format";
import { displayLabel, initials } from "@/lib/labels";
import { HeaderSlot } from "./kit/legend-slot";
import { CountChip, QUALITY_CHIP_MIN } from "./kit/quality";
import {
  COL_GAP,
  columnRowWidth,
  FOOTER_H,
  gridColumns,
  gridLayout,
  isOthers,
  lineCount,
  type ListGrid,
  ListFooter,
  listColumns,
  MoreButton,
  numWidth,
  othersLabel,
  pickGrid,
  rowStateClass,
  SearchListDialog,
  stretchRows,
  textWidth,
  useFitBox,
} from "./list-kit";
import type { VizProps } from "./types";

/**
 * PeopleLeaderboard (docs/ui-design-system.md § PeopleLeaderboard): rankings de personas.
 * - Fila de 44 px (avatar 28, nombre 13/600, "x % del total", valor 15/700, barra 4 px) o compacta de 34 px.
 * - Anillo --primary y medalla solo en el top 3.
 * - "No reporta" sale del ranking: callout warning-soft si supera el 15 %; si no, línea neutra con UserX en el pie.
 * - Cabecera "Top 10 de 37 · concentran 68 %" en el header de la tarjeta (sin alto extra) o en el pie si no cabe;
 *   la forma corta ("Top 10 de 37 · 68 %") depende solo del ancho, así las tarjetas hermanas coinciden.
 * - La menor cantidad de columnas en la que caben las filas; filas alineadas entre columnas y alto
 *   sobrante repartido (44 → hasta 56 px; compacta 34 → 44).
 */

const EASE = [0.22, 1, 0.36, 1] as const;
const CALLOUT_H = 34;
/** Con menos ancho de cuerpo, el resumen usa la forma corta en todas las tarjetas. */
const SUMMARY_SHORT_BELOW = 420;
/** Ancho mínimo del nombre para sumar una columna. */
const MIN_NAME = 140;
/** Alto extra máximo por fila al repartir el sobrante. */
const STRETCH = { regular: 12, compact: 10 };
const DIALOG_MIN = 30;
const ROLE_RE = /(gestionador|revisor|aprobador|asignador|abogad[oa]|funcionari[oa]|analista|profesional|responsable)/i;

interface Person {
  raw: string;
  name: string;
  value: number;
}

/** "Gestionador responsable" → "Sin gestionador asignado"; "Radicados según aprobador" → "Sin aprobador asignado". */
function unassignedLabel(title: string): string {
  const m = title.match(ROLE_RE);
  const role = m ? m[1].toLowerCase() : "responsable";
  return `Sin ${role} asignado`;
}

function Avatar({ name, rank, size }: { name: string; rank: number; size: 22 | 28 }) {
  const top = rank <= 3;
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full bg-surface-3 font-bold text-text-2",
        size === 28 ? "size-7 text-[10.5px]" : "size-[22px] text-[9px]",
        top && "ring-2 ring-primary",
      )}
      aria-hidden
    >
      {initials(name)}
      {top && (
        <span
          className={cn(
            "tabular absolute grid place-items-center rounded-full bg-surface font-bold text-primary-text ring-1 ring-primary",
            size === 28 ? "-bottom-1 -right-1.5 size-4 text-[9px]" : "-bottom-1 -right-1.5 size-3.5 text-[8px]",
          )}
        >
          {rank}
        </span>
      )}
    </span>
  );
}

interface RowProps {
  person: Person;
  rank: number;
  compact: boolean;
  height?: number;
  max: number;
  total: number;
  format: ValueFormat;
  valueW: number;
  pctW: number;
  showPct: boolean;
  selected: boolean;
  dimmed: boolean;
  onToggle?: () => void;
  delay: number;
}

function PersonRow({ person, rank, compact, height, max, total, format, valueW, pctW, showPct, selected, dimmed, onToggle, delay }: RowProps) {
  const frac = max ? Math.max(0, Math.min(1, person.value / max)) : 0;
  const share = total ? person.value / total : 0;
  const value = formatValue(person.value, format);
  const aria = `${rank}. ${person.name}: ${value}${showPct ? `, ${formatPct(share)} del total` : ""}`;
  const Tag = onToggle ? "button" : "div";
  const props = onToggle
    ? { type: "button" as const, onClick: onToggle, "aria-pressed": selected, "aria-label": `${aria}. Clic para filtrar`, title: "Clic para filtrar" }
    : { role: "group", "aria-label": aria };
  const bar = (
    <span className={cn("relative block min-w-0 overflow-hidden rounded-full bg-surface-3", compact ? "h-[3px] w-full" : "h-1 flex-1")}>
      <motion.span
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.5, ease: EASE, delay }}
        className="absolute inset-y-0 left-0 origin-left rounded-full bg-[var(--chart-1)] transition-[width] duration-500"
        style={{ width: `${frac * 100}%` }}
      />
    </span>
  );
  const base = cn(
    // content-center: con alto repartido, la fila (avatar, nombre y cifra) queda centrada como bloque
    "grid w-full content-center items-center gap-x-2.5 rounded-lg px-2 text-left transition",
    onToggle && !selected && "hover:bg-surface-3",
    onToggle && "focus-visible:outline-offset-[-2px]",
    rowStateClass(selected, dimmed),
  );

  if (compact) {
    return (
      <li>
        <Tag {...props} className={cn(base, "grid-cols-[22px_minmax(0,1fr)_auto] py-[5px]")} style={height ? { minHeight: height } : undefined}>
          <Avatar name={person.name} rank={rank} size={22} />
          <span className="flex min-w-0 flex-col gap-[2px]">
            <span className="text-[13px] font-semibold leading-[18px] text-text [overflow-wrap:anywhere]">{person.name}</span>
            {bar}
          </span>
          <span className="flex items-baseline gap-2 self-start leading-[18px]">
            <span className="tabular text-right text-[13px] font-bold text-text" style={{ minWidth: valueW }}>
              {value}
            </span>
            {showPct && (
              <span className="tabular text-right text-[11.5px] text-muted" style={{ minWidth: pctW }}>
                {formatPct(share)}
              </span>
            )}
          </span>
        </Tag>
      </li>
    );
  }
  const lead = rank === 1 && share >= 0.25;
  return (
    <li>
      <Tag {...props} className={cn(base, "grid-cols-[28px_minmax(0,1fr)_auto] py-[5px]")} style={height ? { minHeight: height } : undefined}>
        <Avatar name={person.name} rank={rank} size={28} />
        <span className="flex min-w-0 flex-col gap-[3px]">
          <span className="text-[13px] font-semibold leading-[18px] text-text [overflow-wrap:anywhere]">{person.name}</span>
          <span className="flex items-center gap-2">
            {bar}
            {showPct && (
              <span className={cn("tabular shrink-0 whitespace-nowrap text-[11.5px] leading-[13px]", lead ? "font-semibold text-text-2" : "text-muted")}>
                {lead ? `concentra ${formatPct(share)}` : `${formatPct(share)} del total`}
              </span>
            )}
          </span>
        </span>
        <span className="tabular self-start text-right text-[15px] font-bold leading-[18px] text-text" style={{ minWidth: valueW }}>
          {value}
        </span>
      </Tag>
    </li>
  );
}

function Callout({ label, value, share, format, selected, onClick }: { label: string; value: number; share: number; format: ValueFormat; selected: boolean; onClick?: () => void }) {
  const body = (
    <>
      <UserX className="size-4 shrink-0 text-warning-ink" aria-hidden />
      <span className="min-w-0 text-left">
        <span className="font-semibold text-text">{label}:</span>{" "}
        <span className="tabular font-semibold text-text">{formatValue(value, format)}</span>
        <span className="tabular text-text-2"> · {formatPct(share)}</span>
      </span>
    </>
  );
  const cls = cn("mb-0.5 flex min-h-8 w-full shrink-0 items-center gap-2 rounded-lg bg-warning-soft px-2.5 py-1 text-xs leading-4", selected && "ring-2 ring-inset ring-primary");
  if (!onClick) return <div className={cls}>{body}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} title="Clic para filtrar" className={cn(cls, "transition hover:brightness-[.97] focus-visible:outline-offset-[-2px]")}>
      {body}
    </button>
  );
}

export function PeopleLeaderboard({ widget, result, height, span, expanded }: VizProps<BarWidget, CategoryResult>) {
  const { filters, toggleValue } = useDashboard();
  const { ref, width: mw, height: mh, measured } = useFitBox<HTMLDivElement>();
  const [showAll, setShowAll] = useState(false);
  const [dialog, setDialog] = useState(false);
  const vo = widget.vizOptions ?? {};
  const dimension = widget.dimension;
  const crossFilter = !widget.noCrossFilter;
  const format: ValueFormat = widget.valueFormat ?? "int";
  const additive = !widget.measure || widget.measure.kind === "count" || widget.measure.kind === "sum";
  const compact = Boolean(vo.compact);
  const selected = useMemo(() => filters.eq[dimension] ?? [], [filters.eq, dimension]);
  const total = result.total;

  // Personas reales, sin asignar ("No reporta", "Sin …") y "Otros"
  const { people, unassigned, others } = useMemo(() => {
    const ppl: Person[] = [];
    let un: { raw: string; value: number } | null = null;
    let oth = 0;
    result.labels.forEach((raw, i) => {
      const v = result.values[i] ?? 0;
      if (isOthers(raw)) oth += v;
      else if (isNeutral(raw)) un = { raw: un?.raw ?? raw, value: (un?.value ?? 0) + v };
      else ppl.push({ raw, name: displayLabel(raw, "persona").full, value: v });
    });
    return { people: ppl, unassigned: un as { raw: string; value: number } | null, others: oth };
  }, [result]);

  const max = people.reduce((m, p) => Math.max(m, p.value), 0);
  const showPct = additive && total > 0;
  const unLabel = unassignedLabel(widget.title);
  const unShare = unassigned && total ? unassigned.value / total : 0;
  const callout = Boolean(unassigned) && unShare > QUALITY_CHIP_MIN;
  const hasOthersRow = result.labels.some(isOthers);
  const foldedPeople = hasOthersRow ? (result.folded ?? 0) : (result.rest?.count ?? result.folded ?? 0);
  const allPeople = people.length + foldedPeople;
  const concentration = total ? people.reduce((a, p) => a + p.value, 0) / total : 0;
  const summaryLong = `Top ${formatInt(people.length)} de ${formatInt(allPeople)} · concentran ${formatPct(concentration, 0)}`;
  const summaryShort = `Top ${formatInt(people.length)} de ${formatInt(allPeople)} · ${formatPct(concentration, 0)}`;
  const summaryFull = `Top ${formatInt(people.length)} de ${formatInt(allPeople)} personas · concentran el ${formatPct(concentration)} del total`;
  const hasSummary = additive && people.length > 0;

  const W = mw || innerWidth(span);
  // Resumen en el header si cabe junto al título (sin alto extra); si no, en el pie.
  // La forma (larga o corta) la decide el ancho del cuerpo, no el largo del texto de cada tarjeta.
  const summaryPlace = useMemo<"long" | "short" | "footer" | null>(() => {
    if (!hasSummary) return null;
    if (expanded) return "long";
    const form = W < SUMMARY_SHORT_BELOW ? "short" : "long";
    const titleW = textWidth(widget.title, 700, 15) + (widget.provisional ? 96 : 0) + (widget.note ? 24 : 0);
    const room = W - 32 - 24;
    return titleW + textWidth(form === "long" ? summaryLong : summaryShort, 600, 11) + 20 <= room ? form : "footer";
  }, [hasSummary, expanded, widget.title, widget.provisional, widget.note, W, summaryLong, summaryShort]);

  const footerNeutral = Boolean(unassigned) && !callout;

  const layout = useMemo(() => {
    const valueW = Math.max(0, ...people.map((p) => numWidth(formatValue(p.value, format), 700, compact ? 13 : 15)));
    // Personas: tope 1 < 624 ≤ 2 < 960 ≤ 3 (la variante compacta no cambia el umbral: los nombres no se parten)
    const maxCols = listColumns(W, false, vo.columns);
    const plans: { cols: number; pctOn: boolean; pctW: number; heights: number[] }[] = [];
    for (let c = 1; c <= maxCols; c++) {
      const rowW = columnRowWidth(W, c);
      const pctOn = showPct && (!compact || rowW >= 260);
      const pctW = pctOn ? Math.max(...people.map((p) => numWidth(formatPct(p.value / total), 400, 11.5)), numWidth("0,0 %", 400, 11.5)) : 0;
      const nameW = compact ? rowW - 22 - 10 - valueW - (pctOn ? 8 + pctW : 0) : rowW - 28 - 10 - 10 - valueW;
      if (c > 1 && nameW < MIN_NAME) break;
      const heights = people.map((p) => {
        const l = lineCount(p.name, nameW, 600, 13);
        return compact ? 16 + 18 * l : 26 + 18 * l;
      });
      plans.push({ cols: c, pctOn, pctW, heights });
    }
    return { valueW, plans };
  }, [W, compact, vo.columns, people, format, showPct, total]);

  const fixedH = measured ? mh : height > 0 ? height : null;
  const all = expanded || showAll;
  const cap = widget.visibleRows ?? Infinity;
  const footerParts = (summaryPlace === "footer" ? 1 : 0) + (footerNeutral ? 1 : 0) + (others > 0 ? 1 : 0);
  const fit = useMemo((): { plan: (typeof layout.plans)[number]; grid: ListGrid; rowH: number[]; footer: boolean } => {
    const { plans } = layout;
    const footerH = (parts: number) => (parts === 0 ? 0 : W < 420 && parts > 1 ? FOOTER_H + 18 : FOOTER_H);
    if (all || fixedH === null) {
      // Alto por contenido: al menos 3 filas por columna (6 en "Ampliar")
      const plan = plans[Math.max(0, Math.min(plans.length, Math.ceil(people.length / (expanded ? 6 : 3))) - 1)];
      const shown = all ? people.length : Math.min(cap, people.length <= 12 ? people.length : 10);
      const grid = gridLayout(plan.heights, [], plan.cols, shown);
      const footer = footerParts > 0 || (all ? !expanded && showAll : grid.shown < people.length);
      return { plan, grid, rowH: grid.heights, footer };
    }
    const cands = plans.map((p) => ({ cols: p.cols, heights: p.heights, tail: [] as number[] }));
    const room = fixedH - (callout ? CALLOUT_H : 0);
    let avail = room - footerH(footerParts);
    let pick = pickGrid(cands, avail, cap);
    let footer = footerParts > 0;
    if (!footer && pick.grid.shown < people.length) {
      avail = room - footerH(1);
      pick = pickGrid(cands, avail, cap);
      footer = true;
    }
    const plan = plans[pick.index];
    return { plan, grid: pick.grid, rowH: stretchRows(pick.grid, avail, compact ? STRETCH.compact : STRETCH.regular), footer };
  }, [layout, all, fixedH, cap, callout, footerParts, W, expanded, showAll, people.length, compact]);

  const { grid } = fit;
  const hidden = people.length - grid.shown;
  const useDialog = people.length > DIALOG_MIN;
  const anySel = selected.length > 0;
  const toggle = (raw: string) => () => toggleValue(dimension, raw);
  const rowProps = { max, total, format, valueW: layout.valueW, pctW: fit.plan.pctW, showPct: fit.plan.pctOn, compact };
  const unSelected = unassigned ? selected.includes(unassigned.raw) : false;

  const more =
    !expanded && (hidden > 0 || showAll) ? (
      useDialog ? (
        <MoreButton onClick={() => setDialog(true)}>Ver las {formatInt(people.length)} personas</MoreButton>
      ) : (
        <MoreButton onClick={() => setShowAll((v) => !v)} expanded={showAll}>
          {showAll ? "Ver menos" : `Ver ${formatInt(hidden)} más`}
        </MoreButton>
      )
    ) : null;

  const neutralLine = footerNeutral && unassigned && (
    <button
      type="button"
      disabled={!crossFilter}
      onClick={() => toggleValue(dimension, unassigned.raw)}
      aria-pressed={unSelected}
      title={crossFilter ? "Clic para filtrar" : undefined}
      className={cn("-mx-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-text-2 transition enabled:hover:bg-surface-3 disabled:opacity-100", unSelected && "bg-primary-soft")}
    >
      <UserX className="size-3.5 shrink-0 text-muted" aria-hidden />
      <span>
        {unLabel}: <span className="tabular font-semibold text-text">{formatValue(unassigned.value, format)}</span>
        {showPct && <span className="tabular text-muted"> · {formatPct(unShare)}</span>}
      </span>
    </button>
  );

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col">
      {(summaryPlace === "long" || summaryPlace === "short") && (
        <HeaderSlot>
          <span title={summaryFull} aria-label={summaryFull}>
            <CountChip>{summaryPlace === "long" ? summaryLong : summaryShort}</CountChip>
          </span>
        </HeaderSlot>
      )}
      {callout && unassigned && (
        <Callout
          label={unLabel}
          value={unassigned.value}
          share={unShare}
          format={format}
          selected={unSelected}
          onClick={crossFilter ? () => toggleValue(dimension, unassigned.raw) : undefined}
        />
      )}
      <div
        className={cn("-mx-2 grid min-h-0 flex-1 content-start", all ? "overflow-y-auto overscroll-contain" : "overflow-hidden")}
        style={{ gridTemplateColumns: `repeat(${Math.max(1, grid.cols)}, minmax(0, 1fr))`, columnGap: COL_GAP }}
        role="group"
        aria-label={`${widget.title}: ${formatInt(people.length)} personas`}
      >
        {gridColumns(grid, grid.shown).map(({ from, to }, c) => {
          const rows = Array.from({ length: to - from }, (_, k) => from + k);
          return (
            <ol key={c} start={from + 1} className="flex min-w-0 flex-col">
              {rows.map((idx) => {
                const p = people[idx];
                const sel = selected.includes(p.raw);
                return (
                  <PersonRow
                    key={p.raw}
                    person={p}
                    rank={idx + 1}
                    height={fit.rowH[idx - from]}
                    selected={sel}
                    dimmed={anySel && !sel}
                    onToggle={crossFilter ? toggle(p.raw) : undefined}
                    delay={Math.min(idx * 0.02, 0.24)}
                    {...rowProps}
                  />
                );
              })}
            </ol>
          );
        })}
      </div>
      {fit.footer && (
        <ListFooter
          left={
            footerParts > 0 ? (
              <>
                {summaryPlace === "footer" && (
                  <span className="tabular" title={summaryFull}>
                    {summaryLong}
                  </span>
                )}
                {neutralLine}
                {others > 0 && (
                  <span className="tabular">
                    {othersLabel("persona", result.folded)}: <span className="font-semibold text-text-2">{formatValue(others, format)}</span>
                  </span>
                )}
              </>
            ) : null
          }
          right={more}
        />
      )}
      {useDialog && (
        <SearchListDialog
          open={dialog}
          onClose={() => setDialog(false)}
          title={widget.title}
          items={people}
          getText={(p) => p.name}
          placeholder="Buscar persona…"
          footer={summaryFull}
          renderItem={(p, i) => {
            const sel = selected.includes(p.raw);
            return (
              <PersonRow
                key={p.raw}
                person={p}
                rank={i + 1}
                selected={sel}
                dimmed={anySel && !sel}
                onToggle={crossFilter ? toggle(p.raw) : undefined}
                delay={0}
                {...rowProps}
                compact={false}
              />
            );
          }}
        />
      )}
    </div>
  );
}
