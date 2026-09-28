"use client";

import { Check } from "lucide-react";
import { useMemo } from "react";
import type { CategoryResult } from "@/dashboards/dto";
import type { BarWidget, DonutWidget, StatusTone, ValueFormat } from "@/dashboards/types";
import { innerWidth } from "@/dashboards/layout";
import { cn } from "@/lib/cn";
import { TONE_VARS } from "@/lib/charts/semantic";
import { formatPct, formatValue } from "@/lib/format";
import { Swatch } from "./kit/chart-legend";
import { ChartTooltip, useChartTooltip, type TooltipContent } from "./kit/chart-tooltip";
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
  missingShare,
  orderOf,
  paint,
  partTooltip,
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
 * (grupos de la familia "flujo" o vizOptions.groups), con subtotal y filas de 28 px
 * (punto, etiqueta, valor y mini barra relativa al mayor estado). Clic en fila o grupo filtra.
 * Las columnas se llenan en el orden de la barra; si aun así no cabe, scroll interno con desvanecido.
 */

type Props = VizProps<BarWidget | DonutWidget, CategoryResult>;

/** Columna mínima: 2 columnas desde ≈ 372 px internos (las etiquetas envuelven en 2 líneas). */
const COL_MIN = 176;
const COL_GAP = 20;
/** Por debajo de este ancho de columna se oculta la mini barra (la etiqueta gana 44 px). */
const COL_BAR_MIN = 220;

interface Shared {
  fmt: ValueFormat;
  sel: ReturnType<typeof useSelection>;
  hover: ReturnType<typeof useHover>;
  tip: (p: Part) => TooltipContent;
  max: number;
  /** Mini barra relativa al mayor estado (se oculta en columnas angostas). */
  miniBar: boolean;
}

/**
 * Reparte los grupos en columnas CONSECUTIVAS (la lectura columna a columna sigue el orden de la barra):
 * partición lineal que minimiza la columna más alta (alto ≈ filas + 1,3 por cabecera).
 */
function distribute(groups: PartGroup[], cols: number): PartGroup[][] {
  if (cols >= groups.length) return groups.map((g) => [g]);
  const h = groups.map((g) => g.parts.length + 1.3);
  const n = groups.length;
  const sum = (a: number, b: number) => h.slice(a, b).reduce((s, x) => s + x, 0);
  // best[k][i] = menor máximo al repartir groups[i..] en k columnas
  const best: number[][] = Array.from({ length: cols + 1 }, () => new Array(n + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: cols + 1 }, () => new Array(n + 1).fill(n));
  best[0][n] = 0;
  for (let k = 1; k <= cols; k++) {
    for (let i = n - 1; i >= 0; i--) {
      for (let j = i + 1; j <= n; j++) {
        const v = Math.max(sum(i, j), best[k - 1][j]);
        if (v < best[k][i]) {
          best[k][i] = v;
          cut[k][i] = j;
        }
      }
    }
  }
  const out: PartGroup[][] = [];
  let i = 0;
  for (let k = cols; k >= 1 && i < n; k--) {
    const j = cut[k][i];
    out.push(groups.slice(i, j));
    i = j;
  }
  return out;
}

export function StatusBoard({ widget, result, span, expanded }: Props) {
  const { ref, width, measured } = useBox<HTMLDivElement>();
  const { ref: scrollRef, fade } = useScrollFade<HTMLDivElement>();
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
  const cols = Math.max(1, Math.min(real.length, Math.floor((inner + COL_GAP) / (COL_MIN + COL_GAP))));
  const columns = distribute(real, cols);
  const colWidth = (inner - (cols - 1) * (COL_GAP * 2 + 1)) / cols;
  const max = Math.max(1, ...real.flatMap((g) => g.parts.map((p) => p.value)));
  const tip = (p: Part) => partTooltip(p, fmt, { on: sel.isOn(p), canFilter: sel.canFilter, extra: p.group ? `${p.group}` : undefined });
  const shared: Shared = { fmt, sel, hover, tip, max, miniBar: colWidth >= COL_BAR_MIN };
  const miss = missingShare(model.parts);
  const missShare = miss.total ? miss.neutral / miss.total : 0;

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col gap-3" onMouseLeave={hover.leave}>
      {missShare >= QUALITY_CHIP_MIN && missShare < QUALITY_NOTICE_MIN && (
        <LegendSlot side="end">
          <QualityChip neutral={miss.neutral} total={miss.total} />
        </LegendSlot>
      )}
      <LifecycleBar groups={model.groups} {...shared} />
      <div ref={scrollRef} className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", fade && FADE_MASK)}>
        <div className="flex items-start gap-5">
          {columns.map((col, i) => (
            // self-start (items-start): el divisor mide lo que su columna, no el alto del cuerpo
            <div key={i} className={cn("flex min-w-0 flex-1 flex-col gap-3", i > 0 && "border-l border-border pl-5")}>
              {col.map((g) => (
                <GroupColumn key={g.key} group={g} {...shared} />
              ))}
            </div>
          ))}
        </div>
      </div>
      {neutral && <NeutralFoot group={neutral} {...shared} />}
      <ChartTooltip state={state} />
    </div>
  );
}

/**
 * Dentro de un grupo: mismo tono con opacidad escalonada 100 / 72 / 48 % solo con 3 estados o menos.
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

function GroupColumn({ group, ...shared }: Shared & { group: PartGroup }) {
  const { fmt, sel, hover } = shared;
  const labels = group.parts.flatMap((p) => (p.filterable ? p.labels : []));
  const on = labels.length > 0 && labels.every((l) => sel.selected.includes(l));
  const tt = groupTip(group, fmt, sel.canFilter, on);
  const dimmed = hover.hovered ? hover.hovered !== `g:${group.key}` && !group.parts.some((p) => p.key === hover.hovered) : false;
  return (
    <section aria-label={`${group.label}: ${formatValue(group.value, fmt)} (${formatPct(group.share)})`} className="flex min-w-0 flex-col">
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
      <ul role="list" aria-label={group.label} className="flex flex-col">
        {group.parts.map((p) => (
          <li key={p.key}>
            <StateRow p={p} {...shared} groupHovered={hover.hovered === `g:${group.key}`} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StateRow({ p, fmt, sel, hover, tip, max, miniBar, groupHovered }: Shared & { p: Part; groupHovered: boolean }) {
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
      className={cn(
        "grid min-h-7 w-full items-center gap-x-2 rounded-md px-1 text-left transition",
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
            <Swatch color="var(--neutral-mark)" />
            <span>{p.display}</span>
            <span className="tabular font-semibold text-text-2">{formatValue(p.value, fmt)}</span>
            <span className="tabular">· {formatPct(p.share)}</span>
          </button>
        );
      })}
    </p>
  );
}
