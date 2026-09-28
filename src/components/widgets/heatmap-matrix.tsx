"use client";

import { useMemo, type CSSProperties } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import type { CategoryResult, PivotResult, WidgetResult } from "@/dashboards/dto";
import { DIAS_ORDER } from "@/dashboards/specs/helpers";
import type { BarWidget, PivotWidget, SemanticFamily, StatusTone, WidgetDef } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { cn } from "@/lib/cn";
import { isNeutral, resolveStatus } from "@/lib/charts/semantic";
import { inkOn, seqColor, useChartTheme, type ChartTheme } from "@/lib/charts/theme";
import { formatCompact, formatInt, formatPct } from "@/lib/format";
import { dayShort, displayLabel, stripOrdinal, titleCase } from "@/lib/labels";
import { ScaleLegend, Swatch } from "./kit/chart-legend";
import { ChartTooltip, useChartTooltip, type TooltipContent } from "./kit/chart-tooltip";
import { StatusIcon } from "./kit/status-icon";
import { VizEmpty } from "./kit/viz-states";
import { anchorOf, mixHex, selectionOf, useToggleMany } from "./matrix-kit";
import type { CompositeProps, VizProps } from "./types";

/**
 * HeatmapMatrix (docs/ui-design-system.md › HeatmapMatrix):
 * - HeatmapMatrix: matriz compacta de una dimensión × sus stacks (SMART 3: estado de la queja × momento),
 *   celdas en el tono de la familia con intensidad según el valor, conteo y % por fila.
 * - HeatmapComposite: día × hora con marginales (facturas emitidas): escala raíz, jornada 7–17 h
 *   marcada con un corchete neutro bajo el eje (no con el color de selección), columnas desde la
 *   primera hasta la última hora con dato (sin columnas vacías fuera de la jornada), ScaleLegend
 *   continua bajo la grilla, clic en celda filtra ambas dimensiones. Los dos marginales usan la misma
 *   jerarquía (cifras text-2/600, el máximo en tinta/700).
 *   En angosto (< 560 px) se transpone: días en columnas (con su total en el encabezado) y horas en
 *   filas (con su total a la derecha), así cabe en 326 px sin scroll horizontal.
 */

// ─── Escala raíz común ───────────────────────────────────────────────────────
/** Piso de la rampa: el valor más bajo con dato se distingue del vacío. */
const SEQ_FLOOR = 0.07;
const rootT = (v: number, max: number) => (max > 0 ? SEQ_FLOOR + (1 - SEQ_FLOOR) * Math.sqrt(Math.max(0, v) / max) : 0);

function rootGradient(theme: ChartTheme): string[] {
  return [0, 0.25, 0.5, 0.75, 1].map((t) => seqColor(theme, SEQ_FLOOR + (1 - SEQ_FLOOR) * t));
}

// ═════════════════════════════════════════════════════════════════════════════
// Matriz compacta (estado × momento)
// ═════════════════════════════════════════════════════════════════════════════

interface CompactCol {
  key: string;
  display: string;
  tone: StatusTone | null;
  color: string;
}

function compactCols(result: CategoryResult, family: SemanticFamily | undefined, theme: ChartTheme): CompactCol[] {
  const stacks = result.stacks?.length ? result.stacks : [{ key: "Total", values: result.values }];
  const order = new Map<string, number>();
  const cols = stacks.map((s, i): CompactCol => {
    const st = family ? resolveStatus(s.key, family) : null;
    const neutral = isNeutral(s.key);
    order.set(s.key, st?.order ?? (neutral ? 99 : 50 + i));
    const tone: StatusTone | null = st?.tone ?? (neutral ? "neutral" : null);
    const color = st ? theme.resolve(st.color) : neutral ? theme.other : (theme.series[i] ?? theme.other);
    return { key: s.key, display: st?.display ?? displayLabel(s.key).short, tone, color };
  });
  return cols.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
}

/** Alto máximo de una fila de la matriz compacta al estirarse para llenar el cuerpo. */
const ROW_MAX = 110;

export function HeatmapMatrix({ widget, result }: VizProps<BarWidget, CategoryResult>) {
  const theme = useChartTheme();
  const { filters, toggleValue, spec } = useDashboard();
  const toggleMany = useToggleMany();
  const { state, show, hide } = useChartTooltip();
  const unit = spec.unit?.plural ?? "registros";
  const rowField = widget.dimension;
  const colField = widget.stackBy;
  const labelKind = widget.labelKind ?? "generic";
  const rowLabel = spec.filters.find((f) => f.field === rowField)?.label ?? widget.title.split(/\s+por\s+/i)[0];

  const model = useMemo(() => {
    const cols = compactCols(result, widget.semantic, theme);
    const stackOf = new Map((result.stacks ?? []).map((s) => [s.key, s.values]));
    const rows = result.labels
      .map((label, i) => {
        const values = cols.map((c) => (result.stacks?.length ? (stackOf.get(c.key)?.[i] ?? 0) : (result.values[i] ?? 0)));
        const total = result.stacks?.length ? values.reduce((a, b) => a + b, 0) : (result.values[i] ?? 0);
        const d = displayLabel(label, labelKind);
        return { raw: label, short: d.short, full: d.full, values, total, neutral: isNeutral(label) };
      })
      .filter((r) => r.total > 0 || !r.neutral);
    // Neutrales al final, sin cambiar el orden del resto
    rows.sort((a, b) => Number(a.neutral) - Number(b.neutral));
    const max = Math.max(0, ...rows.filter((r) => !r.neutral).flatMap((r) => r.values));
    const colTotals = cols.map((_, j) => rows.reduce((s, r) => s + r.values[j], 0));
    // Partición pura: cada fila cae entera en una sola columna (p. ej. Cerrada → Cierre). El "% de la
    // fila" sería 100 % en todas las celdas, así que la celda muestra el % del total.
    const pure = cols.length > 1 && rows.every((r) => r.values.filter((v) => v > 0).length <= 1);
    return { cols, rows, max, colTotals, total: rows.reduce((s, r) => s + r.total, 0), pure };
  }, [result, widget.semantic, theme, labelKind]);

  const rowSel = selectionOf(filters.eq, rowField);
  const colSel = selectionOf(filters.eq, colField);

  if (!model.rows.length) return <VizEmpty note={widget.note} />;

  const cellTip = (el: Element, r: (typeof model.rows)[number], c: CompactCol, v: number) => {
    const { x, y } = anchorOf(el);
    const content: TooltipContent = {
      title: `${r.full} · ${c.display}`,
      value: `${formatInt(v)} ${unit}`,
      // Partición pura: la fila entera está en esta columna; lo que informa es su peso en el total
      valueNote: model.pure ? (model.total ? `${formatPct(v / model.total)} del total` : undefined) : r.total ? `${formatPct(v / r.total)} de la fila` : undefined,
      rows: !model.pure && model.total ? [{ label: "Del total", value: formatPct(v / model.total), color: c.color }] : undefined,
      hint: colField ? "Clic para filtrar esta combinación" : "Clic para filtrar",
    };
    show(x, y, content);
  };

  const n = model.cols.length;
  const cellPct = (r: (typeof model.rows)[number], v: number) => (model.pure ? (model.total ? v / model.total : 0) : r.total ? v / r.total : 0);
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-auto">
        {/* La grilla llena el cuerpo: filas de 52 a 110 px y el sobrante centrado (sin banda vacía abajo) */}
        <div
          role="group"
          aria-label={widget.title}
          className="grid h-full min-w-0 content-center gap-[2px]"
          style={{ gridTemplateColumns: `minmax(84px, 1.1fr) repeat(${n}, minmax(72px, 1fr))`, gridTemplateRows: `auto repeat(${model.rows.length}, minmax(52px, ${ROW_MAX}px))` }}
        >
          {/* Cabecera */}
          <div className="flex items-end px-1.5 pb-1 text-[11px] font-semibold text-muted">{rowLabel}</div>
          {model.cols.map((c, j) => {
            const sel = colSel.has(c.key);
            return (
              <button
                key={c.key}
                type="button"
                disabled={!colField}
                aria-pressed={colField ? sel : undefined}
                onClick={() => colField && toggleValue(colField, c.key)}
                title={colField ? "Clic para filtrar" : undefined}
                className={cn(
                  "flex min-w-0 flex-col items-start gap-0.5 rounded-md px-1.5 pb-1 pt-0.5 text-left transition hover:bg-surface-3 disabled:hover:bg-transparent",
                  sel && "bg-primary-soft",
                  colSel.active && !sel && "opacity-45",
                )}
              >
                <span className="inline-flex min-w-0 items-center gap-1 text-xs font-semibold text-text-2">
                  {c.tone ? <StatusIcon tone={c.tone} /> : <Swatch color={c.color} />}
                  <span className="truncate">{c.display}</span>
                </span>
                <span className="tabular text-[11px] text-muted">{formatInt(model.colTotals[j])}</span>
              </button>
            );
          })}

          {/* Filas */}
          {model.rows.map((r) => {
            const rSel = rowSel.has(r.raw);
            return (
              <div key={r.raw} className="contents">
                <button
                  type="button"
                  aria-pressed={rSel}
                  title={r.full !== r.short ? r.full : "Clic para filtrar"}
                  onClick={() => toggleValue(rowField, r.raw)}
                  className={cn(
                    "flex min-w-0 flex-col justify-center rounded-md px-1.5 text-left transition hover:bg-surface-3",
                    rSel && "bg-primary-soft",
                    rowSel.active && !rSel && "opacity-45",
                  )}
                >
                  <span className={cn("text-[13px] font-semibold leading-tight", r.neutral ? "text-muted" : "text-text")}>{r.short}</span>
                  <span className="tabular text-[11px] text-muted">{formatInt(r.total)}</span>
                </button>
                {model.cols.map((c, j) => {
                  const v = r.values[j];
                  const inSel = (!rowSel.active || rSel) && (!colSel.active || colSel.has(c.key));
                  const both = rSel && colField && colSel.has(c.key);
                  if (!v)
                    return (
                      <div key={c.key} className={cn("grid place-items-center rounded-[3px] bg-surface-3 text-sm text-muted", !inSel && "opacity-45")}>
                        <span aria-hidden>·</span>
                        <span className="sr-only">{`${r.full}, ${c.display}: sin registros`}</span>
                      </div>
                    );
                  const t = r.neutral ? 0.25 : 0.14 + 0.66 * Math.sqrt(v / (model.max || 1));
                  const bg = mixHex(c.color, theme.surface, t);
                  const ink = inkOn(bg);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      aria-pressed={Boolean(both)}
                      aria-label={`${r.full}, ${c.display}: ${formatInt(v)} ${unit}, ${formatPct(cellPct(r, v))} ${model.pure ? "del total" : "de la fila"}`}
                      onMouseEnter={(e) => cellTip(e.currentTarget, r, c, v)}
                      onFocus={(e) => cellTip(e.currentTarget, r, c, v)}
                      onMouseLeave={hide}
                      onBlur={hide}
                      onClick={() => (colField ? toggleMany([{ field: rowField, value: r.raw }, { field: colField, value: c.key }]) : toggleValue(rowField, r.raw))}
                      className={cn("flex min-w-0 flex-col items-center justify-center rounded-[3px] transition-opacity focus-visible:z-10", !inSel && "opacity-45")}
                      style={{ background: bg, color: ink, boxShadow: both ? "inset 0 0 0 2px var(--primary)" : undefined }}
                    >
                      <span className="tabular text-[15px] font-bold leading-tight">{formatInt(v)}</span>
                      <span className="tabular text-[11px] leading-tight opacity-80">{formatPct(cellPct(r, v))}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] leading-snug text-muted">
        {model.pure ? "Intensidad según la cantidad · % del total · cada estado cae en un solo momento" : "Intensidad según la cantidad · % de la fila"}
      </p>
      <ChartTooltip state={state} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Matriz día × hora con marginales (compuesta)
// ═════════════════════════════════════════════════════════════════════════════

const DAY_SHORT_ORDER = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const dayIndex = (label: string) => {
  const s = dayShort(label);
  return s ? DAY_SHORT_ORDER.indexOf(s) : -1;
};
/** Jornada laboral resaltada (horas inclusive). */
const BAND: [number, number] = [7, 17];

interface DHRow {
  raw: string;
  short: string;
  full: string;
  values: number[];
  total: number;
  /** Marginal derecho (widget "dias" o total de la fila). */
  marg: number;
}

interface DHCol {
  raw: string;
  label: string;
  hour: number | null;
  band: boolean;
  /** Marginal superior (widget "horas" o total de la columna). */
  marg: number;
}

interface DHModel {
  rowField: string;
  colField: string;
  rows: DHRow[];
  cols: DHCol[];
  max: number;
  minPos: number;
  total: number;
  margRowMax: number;
  margColMax: number;
  margRowTotal: number;
  hours: boolean;
}

interface Parts {
  pivot?: { w: PivotWidget; r: PivotResult };
  rowsM?: { w: BarWidget; r: CategoryResult };
  colsM?: { w: BarWidget; r: CategoryResult };
}

function pickParts(widgets: WidgetDef[], results: (WidgetResult | undefined)[]): Parts {
  let pivot: Parts["pivot"];
  const cats: { w: BarWidget; r: CategoryResult }[] = [];
  widgets.forEach((w, i) => {
    const r = results[i];
    if (!r) return;
    if (w.type === "pivot" && r.kind === "pivot") pivot = { w, r };
    else if (w.type === "bar" && r.kind === "category") cats.push({ w, r });
  });
  const rowField = pivot?.w.rows[0]?.field;
  const colField = pivot?.w.columns.field;
  const rowsM = cats.find((c) => c.w.dimension === rowField) ?? cats.find((c) => c.w.id === "dias");
  const colsM = cats.find((c) => c.w.dimension === colField && c !== rowsM) ?? cats.find((c) => c.w.id === "horas");
  return { pivot, rowsM, colsM };
}

const isHourKey = (s: string) => /^\s*\d{1,2}\s*$/.test(s);

function buildDayHour({ pivot, rowsM, colsM }: Parts): DHModel | null {
  if (!pivot) return null;
  const { w, r } = pivot;
  const rowField = w.rows[0]?.field ?? "";
  const colField = w.columns.field;

  // ── Columnas: horas en rango continuo (min − 1 … max + 1) aunque el motor no las rellene
  const hours = r.columns.length > 0 && r.columns.every(isHourKey);
  const colIndex = new Map<string, number>();
  let colKeys: { raw: string; hour: number | null }[];
  if (hours) {
    const pad = r.columns.some((c) => c.trim().length === 2 && c.trim().startsWith("0"));
    r.columns.forEach((c, i) => colIndex.set(String(Number(c)), i));
    const withData = r.columns.filter((_, i) => (r.totals[i] ?? 0) > 0).map(Number);
    const nums = withData.length ? withData : r.columns.map(Number);
    // De la primera a la última hora con dato, extendido a la jornada completa: sin columnas vacías
    // en los extremos fuera de la jornada (los huecos interiores se conservan)
    const lo = Math.max(0, Math.min(...nums, BAND[0]));
    const hi = Math.max(...nums, BAND[1]);
    colKeys = [];
    for (let h = lo; h <= hi; h++) {
      const existing = r.columns.find((c) => Number(c) === h);
      colKeys.push({ raw: existing ?? (pad ? String(h).padStart(2, "0") : String(h)), hour: h });
    }
  } else {
    r.columns.forEach((c, i) => colIndex.set(c, i));
    const order = w.columnOrder ? [...w.columnOrder.filter((c) => colIndex.has(c)), ...r.columns.filter((c) => !w.columnOrder!.includes(c))] : r.columns;
    colKeys = order.map((c) => ({ raw: c, hour: null }));
  }
  const colPos = (key: { raw: string; hour: number | null }) => colIndex.get(key.hour !== null ? String(key.hour) : key.raw);

  // ── Filas: orden fijo (rowOrder o días de la semana) y estables
  const pivotRows = new Map<string, { values: number[]; total: number }>();
  for (const row of r.rows) {
    const prev = pivotRows.get(row.label);
    if (prev) {
      row.values.forEach((v, i) => (prev.values[i] += v));
      prev.total += row.total;
    } else pivotRows.set(row.label, { values: [...row.values], total: row.total });
  }
  const labels = [...pivotRows.keys()];
  const days = labels.length > 0 && labels.every((l) => dayIndex(l) >= 0);
  let order: string[];
  if (w.rowOrder?.length) {
    const base = w.stableRows || days ? w.rowOrder : w.rowOrder.filter((l) => pivotRows.has(l));
    order = [...base, ...labels.filter((l) => !w.rowOrder!.includes(l))];
  } else if (days) {
    order = DIAS_ORDER.map((d, i) => labels.find((l) => dayIndex(l) === i) ?? d);
  } else order = labels;

  const rowMargOf = new Map<string, number>();
  if (rowsM) rowsM.r.labels.forEach((l, i) => rowMargOf.set(days ? `d${dayIndex(l)}` : l, rowsM.r.values[i] ?? 0));
  const colMargOf = new Map<string, number>();
  if (colsM) colsM.r.labels.forEach((l, i) => colMargOf.set(hours && isHourKey(l) ? String(Number(l)) : l, colsM.r.values[i] ?? 0));

  const rows: DHRow[] = order.map((label) => {
    const pr = pivotRows.get(label);
    const values = colKeys.map((k) => {
      const p = colPos(k);
      return p === undefined || !pr ? 0 : (pr.values[p] ?? 0);
    });
    const total = pr?.total ?? 0;
    const short = dayShort(label) ?? displayLabel(label).short;
    const full = days ? titleCase(stripOrdinal(label)) : displayLabel(label).full;
    const mKey = days ? `d${dayIndex(label)}` : label;
    return { raw: label, short, full, values, total, marg: rowsM ? (rowMargOf.get(mKey) ?? 0) : total };
  });

  const cols: DHCol[] = colKeys.map((k) => {
    const p = colPos(k);
    const fallback = p === undefined ? 0 : (r.totals[p] ?? 0);
    const key = k.hour !== null ? String(k.hour) : k.raw;
    return {
      raw: k.raw,
      label: k.hour !== null ? String(k.hour) : displayLabel(k.raw).short,
      hour: k.hour,
      band: k.hour !== null && k.hour >= BAND[0] && k.hour <= BAND[1],
      marg: colsM ? (colMargOf.get(key) ?? 0) : fallback,
    };
  });

  const all = rows.flatMap((x) => x.values);
  const pos = all.filter((v) => v > 0);
  const margRowTotal = rowsM?.r.total ?? rows.reduce((s, x) => s + x.marg, 0);
  return {
    rowField,
    colField,
    rows,
    cols,
    max: Math.max(0, ...all),
    minPos: pos.length ? Math.min(...pos) : 0,
    total: rows.reduce((s, x) => s + x.total, 0),
    margRowMax: Math.max(0, ...rows.map((x) => x.marg)),
    margColMax: Math.max(0, ...cols.map((x) => x.marg)),
    margRowTotal,
    hours,
  };
}

const hourRange = (h: number | null, label: string) => (h === null ? label : `${h}:00 – ${h}:59`);

/** Anchos fijos de la grilla (px). */
const LABEL_W = 44;
const TOP_H = 46;
/** Eje de horas: número arriba y corchete de la jornada (5 px) abajo. */
const AXIS_H = 22;
const GAP = 2;
const MIN_CELL = 28;
/** Por debajo de este ancho la matriz se transpone (días en columnas, horas en filas). */
const NARROW_BELOW = 560;
/** Transpuesta (móvil): etiqueta de hora, marginal por hora, encabezado de día y paso de fila. */
const T_LABEL_W = 30;
const T_MARG_W = 46;
const T_HEAD_H = 50;
const T_ROW_H = 28;
const T_MIN_CELL = 30;

const at = (row: number, col: number, span = 1) => ({ gridRow: row, gridColumn: `${col} / span ${span}` });

type Sel = ReturnType<typeof selectionOf>;

/** Lo que comparten la grilla de escritorio y la transpuesta (celdas, marginales, tooltips y filtros). */
interface GridCtx {
  model: DHModel;
  theme: ChartTheme;
  unit: string;
  rowSel: Sel;
  colSel: Sel;
  showValues: boolean;
  tip: (el: Element, content: TooltipContent) => void;
  hide: () => void;
  toggleValue: (field: string, value: string) => void;
  toggleMany: (pairs: { field: string; value: string }[]) => void;
}

/** Celda día × hora (misma en ambas orientaciones). */
function dayHourCell(g: GridCtx, r: DHRow, c: DHCol, v: number, style: CSSProperties) {
  const { model, theme, unit, rowSel, colSel, showValues, tip, hide, toggleMany } = g;
  const rSel = rowSel.has(r.raw);
  const inSel = (!rowSel.active || rSel) && (!colSel.active || colSel.has(c.raw));
  if (!v)
    return (
      <div
        key={`${r.raw}\u0001${c.raw}`}
        aria-hidden
        className={cn("grid place-items-center rounded-[3px] text-xs text-muted", c.band ? "bg-surface-3" : "bg-surface-2", !inSel && "opacity-45")}
        style={style}
      >
        {showValues ? "·" : ""}
      </div>
    );
  const bg = seqColor(theme, rootT(v, model.max));
  const both = rSel && colSel.has(c.raw);
  const content: TooltipContent = {
    title: `${r.full} · ${hourRange(c.hour, c.label)}`,
    value: `${formatInt(v)} ${unit}`,
    valueNote: r.total ? `${formatPct(v / r.total)} del día` : undefined,
    rows: model.total ? [{ label: "Del total", value: formatPct(v / model.total), color: bg }] : undefined,
    hint: "Clic para filtrar día y hora",
  };
  return (
    <button
      key={`${r.raw}\u0001${c.raw}`}
      type="button"
      aria-pressed={both}
      aria-label={`${r.full}, ${hourRange(c.hour, c.label)}: ${formatInt(v)} ${unit}`}
      onClick={() => toggleMany([{ field: model.rowField, value: r.raw }, { field: model.colField, value: c.raw }])}
      onMouseEnter={(e) => tip(e.currentTarget, content)}
      onFocus={(e) => tip(e.currentTarget, content)}
      onMouseLeave={hide}
      onBlur={hide}
      className={cn("tabular grid min-w-0 place-items-center rounded-[3px] text-[11px] font-semibold transition-[opacity,filter] hover:brightness-95 focus-visible:z-10", !inSel && "opacity-45")}
      style={{ ...style, background: bg, color: inkOn(bg), boxShadow: both ? "inset 0 0 0 2px var(--primary)" : undefined }}
    >
      {showValues ? (v >= 1000 ? formatCompact(v) : formatInt(v)) : ""}
    </button>
  );
}

/** Tooltip de un marginal (hora o día). */
function hourContent(g: GridCtx, c: DHCol): TooltipContent {
  const share = g.model.margRowTotal ? c.marg / g.model.margRowTotal : 0;
  return { title: hourRange(c.hour, c.label), value: `${formatInt(c.marg)} ${g.unit}`, valueNote: `${formatPct(share)} del total`, hint: "Clic para filtrar la hora" };
}
function dayContent(g: GridCtx, r: DHRow): TooltipContent {
  const share = g.model.margRowTotal ? r.marg / g.model.margRowTotal : 0;
  return { title: r.full, value: `${formatInt(r.marg)} ${g.unit}`, valueNote: `${formatPct(share)} del total`, hint: "Clic para filtrar el día" };
}

/** Cifra de un marginal por hora: misma jerarquía que el marginal por día (text-2/600; el máximo en tinta/700). */
function hourMargText(g: GridCtx, c: DHCol, className?: string) {
  const isMax = c.marg > 0 && c.marg === g.model.margColMax;
  return (
    <span className={cn("tabular text-[10.5px] leading-none", isMax ? "font-bold text-text" : "font-semibold text-text-2", className)}>
      {c.marg >= 1000 ? formatCompact(c.marg) : formatInt(c.marg)}
    </span>
  );
}

/**
 * Móvil: la matriz transpuesta (días en columnas, horas en filas) cabe en 326 px sin scroll
 * horizontal. El total por día va en el encabezado de su columna y el total por hora, a la derecha.
 */
function TransposedGrid({ g, label }: { g: GridCtx; label: string }) {
  const { model, rowSel, colSel, tip, hide, toggleValue, unit } = g;
  const nD = model.rows.length;
  const bandRows = model.cols.map((c, i) => (c.band ? i : -1)).filter((i) => i >= 0);
  const style: CSSProperties = {
    gridTemplateColumns: `${T_LABEL_W}px repeat(${nD}, minmax(${T_MIN_CELL}px, 1fr)) ${T_MARG_W}px`,
    gridTemplateRows: `${T_HEAD_H}px repeat(${model.cols.length}, ${T_ROW_H}px)`,
    gap: GAP,
    minWidth: T_LABEL_W + T_MARG_W + nD * T_MIN_CELL + (nD + 1) * GAP,
  };
  return (
    <div role="group" aria-label={label} className="grid" style={style}>
      {/* Encabezado: día + total del día (el marginal derecho del escritorio) */}
      {model.rows.map((r, i) => {
        const rSel = rowSel.has(r.raw);
        const share = model.margRowTotal ? r.marg / model.margRowTotal : 0;
        const content = dayContent(g, r);
        return (
          <button
            key={`d-${r.raw}`}
            type="button"
            aria-pressed={rSel}
            aria-label={`${r.full}: ${formatInt(r.marg)} ${unit}, ${formatPct(share)}`}
            onClick={() => toggleValue(model.rowField, r.raw)}
            onMouseEnter={(e) => tip(e.currentTarget, content)}
            onFocus={(e) => tip(e.currentTarget, content)}
            onMouseLeave={hide}
            onBlur={hide}
            className={cn(
              "flex min-w-0 flex-col items-center justify-end gap-0.5 rounded-md pb-1 transition hover:bg-surface-3",
              rSel && "bg-primary-soft",
              rowSel.active && !rSel && "opacity-45",
            )}
            style={at(1, i + 2)}
          >
            <span className={cn("text-xs font-semibold leading-none", rSel ? "text-primary-text" : "text-text-2")}>{r.short}</span>
            <span className="tabular text-[11px] font-semibold leading-none text-text">{formatInt(r.marg)}</span>
            <span className="tabular text-[10px] leading-none text-muted">{formatPct(share, 0)}</span>
          </button>
        );
      })}
      <div className="flex items-end justify-end pb-1 pr-0.5 text-[10.5px] font-semibold text-muted" style={at(1, nD + 2)}>
        Total
      </div>

      {/* Jornada: corchete vertical a la derecha de las horas */}
      {bandRows.length > 0 && (
        <div
          aria-hidden
          className="pointer-events-none w-[5px] justify-self-end rounded-r-[3px] border-y-2 border-r-2 border-border-strong"
          style={{ gridRow: `${bandRows[0] + 2} / span ${bandRows.length}`, gridColumn: 1 }}
        />
      )}

      {model.cols.map((c, j) => {
        const gr = j + 2;
        const sel = colSel.has(c.raw);
        const content = hourContent(g, c);
        return (
          <div key={`h-${c.raw}`} className="contents">
            <div
              aria-label={hourRange(c.hour, c.label)}
              className={cn("flex items-center justify-end pr-2.5 text-[10.5px] tabular", c.band ? "font-semibold text-text-2" : "text-muted")}
              style={at(gr, 1)}
            >
              {c.label}
            </div>
            {model.rows.map((r, i) => dayHourCell(g, r, c, r.values[j], at(gr, i + 2)))}
            <button
              type="button"
              aria-pressed={sel}
              aria-label={`${hourRange(c.hour, c.label)}: ${formatInt(c.marg)} ${unit}`}
              onClick={() => toggleValue(model.colField, c.raw)}
              onMouseEnter={(e) => tip(e.currentTarget, content)}
              onFocus={(e) => tip(e.currentTarget, content)}
              onMouseLeave={hide}
              onBlur={hide}
              disabled={!c.marg}
              className={cn("flex min-w-0 items-center gap-1 rounded-md pl-1.5 pr-0.5 transition hover:bg-surface-3 disabled:hover:bg-transparent", sel && "bg-primary-soft", colSel.active && !sel && "opacity-45")}
              style={at(gr, nD + 2)}
            >
              <span aria-hidden className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
                <span className={cn("block h-full rounded-full", sel ? "bg-primary" : "bg-[var(--seq-3)]")} style={{ width: `${model.margColMax ? (c.marg / model.margColMax) * 100 : 0}%` }} />
              </span>
              {c.marg > 0 ? hourMargText(g, c, "shrink-0") : <span className="shrink-0 text-[10.5px] leading-none text-muted">·</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function HeatmapComposite({ cell, widgets, results, expanded }: CompositeProps) {
  const theme = useChartTheme();
  const { filters, toggleValue, spec } = useDashboard();
  const toggleMany = useToggleMany();
  const { state, show, hide } = useChartTooltip();
  const { ref, width, height, measured } = useElementSize<HTMLDivElement>();
  const unit = spec.unit?.plural ?? "registros";

  const model = useMemo(() => buildDayHour(pickParts(widgets, results)), [widgets, results]);
  const gradient = useMemo(() => rootGradient(theme), [theme]);

  if (!model || !model.rows.length || !model.cols.length) return <VizEmpty />;

  const nC = model.cols.length;
  const nR = model.rows.length;
  // Angosto (móvil): matriz transpuesta, días en columnas y horas en filas (sin scroll horizontal)
  const narrow = measured && width < NARROW_BELOW;
  // Marginal derecho según el espacio: barra + conteo + % · conteo + % · solo conteo (el % queda en el tooltip)
  const room = measured ? width - LABEL_W - (nC + 1) * GAP - nC * MIN_CELL : 999;
  const marg: "full" | "pct" | "count" = room >= 128 ? "full" : room >= 92 ? "pct" : room >= 52 ? "count" : "pct";
  const margW = marg === "full" ? 128 : marg === "pct" ? 92 : 52;
  // Tamaño real de celda (decide si el valor cabe dentro)
  const cellW = narrow ? (width - T_LABEL_W - T_MARG_W - (nR + 1) * GAP) / nR : measured ? (width - LABEL_W - margW - (nC + 1) * GAP) / nC : 40;
  const cellH = narrow ? T_ROW_H : measured ? (height - TOP_H - AXIS_H - (nR + 1) * GAP) / nR : 40;
  const showValues = Math.max(MIN_CELL, cellW) >= 28 && Math.max(MIN_CELL, cellH) >= 28;
  const minWidth = LABEL_W + margW + nC * MIN_CELL + (nC + 1) * GAP;
  const tMinWidth = T_LABEL_W + T_MARG_W + nR * T_MIN_CELL + (nR + 1) * GAP;

  const rowSel = selectionOf(filters.eq, model.rowField);
  const colSel = selectionOf(filters.eq, model.colField);
  const bandCols = model.cols.map((c, i) => (c.band ? i : -1)).filter((i) => i >= 0);

  const tip = (el: Element, content: TooltipContent) => {
    const { x, y } = anchorOf(el);
    show(x, y, content);
  };
  const g: GridCtx = { model, theme, unit, rowSel, colSel, showValues, tip, hide, toggleValue, toggleMany };

  const gridStyle = {
    gridTemplateColumns: `${LABEL_W}px repeat(${nC}, minmax(${MIN_CELL}px, 1fr)) ${margW}px`,
    gridTemplateRows: `${TOP_H}px ${AXIS_H}px repeat(${nR}, minmax(${MIN_CELL}px, 1fr))`,
    gap: GAP,
    minWidth,
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5">
      <div ref={ref} className={cn("min-h-0 flex-1 overflow-x-auto", expanded && "overflow-y-auto")}>
        {narrow ? (
          <TransposedGrid g={g} label={cell.title} />
        ) : (
          <div role="group" aria-label={cell.title} className="grid h-full" style={gridStyle}>
            {/* Esquina (rótulo del marginal superior) y encabezado del marginal derecho */}
            <div
              className="sticky left-0 z-[2] flex items-end justify-end bg-surface pb-px pr-1 text-[10.5px] font-semibold text-muted"
              style={{ ...at(1, 1), boxShadow: `${GAP}px 0 0 var(--surface)` }}
            >
              Total
            </div>
            <div aria-hidden className="sticky left-0 z-[2] bg-surface" style={{ ...at(2, 1), boxShadow: `${GAP}px 0 0 var(--surface)` }} />
            <div className="flex items-end justify-between gap-1 pl-2 text-[10.5px] font-semibold text-muted" style={at(2, nC + 2)}>
              <span>Total</span>
              {marg !== "count" && <span>%</span>}
            </div>

            {/* Jornada: corchete hairline bajo las horas (neutro: el naranja queda para la selección) */}
            {bandCols.length > 0 && (
              <div aria-hidden className="pointer-events-none h-[5px] self-end rounded-b-[3px] border-x-2 border-b-2 border-border-strong" style={at(2, bandCols[0] + 2, bandCols.length)} />
            )}

            {/* Marginal superior (por hora) + eje de horas */}
            {model.cols.map((c, j) => {
              const sel = colSel.has(c.raw);
              const h = model.margColMax ? (c.marg / model.margColMax) * 100 : 0;
              const content = hourContent(g, c);
              return (
                <button
                  key={`m-${c.raw}`}
                  type="button"
                  aria-pressed={sel}
                  aria-label={`${hourRange(c.hour, c.label)}: ${formatInt(c.marg)} ${unit}`}
                  onClick={() => toggleValue(model.colField, c.raw)}
                  onMouseEnter={(e) => tip(e.currentTarget, content)}
                  onFocus={(e) => tip(e.currentTarget, content)}
                  onMouseLeave={hide}
                  onBlur={hide}
                  disabled={!c.marg}
                  className={cn("group flex min-w-0 flex-col items-stretch justify-end gap-0.5 rounded-sm transition-opacity focus-visible:z-10", colSel.active && !sel && "opacity-45")}
                  style={at(1, j + 2)}
                >
                  {c.marg > 0 && hourMargText(g, c, "text-center")}
                  <span
                    className={cn("block w-full shrink-0 rounded-t-[3px] transition-colors", sel ? "bg-primary" : "bg-[var(--seq-3)] group-hover:bg-[var(--seq-4)]")}
                    style={{ height: `calc((100% - 12px) * ${(Math.max(c.marg ? 6 : 0, h) / 100).toFixed(3)})` }}
                  />
                </button>
              );
            })}
            {model.cols.map((c, j) => (
              <div
                key={`a-${c.raw}`}
                aria-label={hourRange(c.hour, c.label)}
                className={cn("relative z-[1] flex justify-center pt-px text-[10.5px] leading-[14px] tabular", c.band ? "font-semibold text-text-2" : "text-muted")}
                style={at(2, j + 2)}
              >
                {c.label}
              </div>
            ))}

            {/* Filas: etiqueta fija, celdas y marginal derecho */}
            {model.rows.map((r, i) => {
              const rSel = rowSel.has(r.raw);
              const gr = i + 3;
              const share = model.margRowTotal ? r.marg / model.margRowTotal : 0;
              const rowContent = dayContent(g, r);
              return (
                <div key={r.raw} className="contents">
                  <button
                    type="button"
                    aria-pressed={rSel}
                    aria-label={`${r.full}: ${formatInt(r.marg)} ${unit}`}
                    onClick={() => toggleValue(model.rowField, r.raw)}
                    className={cn(
                      "sticky left-0 z-[2] flex items-center rounded-md bg-surface pl-0.5 pr-1 text-left text-xs font-semibold text-text-2 transition hover:text-text",
                      rSel && "bg-primary-soft text-primary-text",
                      rowSel.active && !rSel && "opacity-45",
                    )}
                    style={{ ...at(gr, 1), boxShadow: `${GAP}px 0 0 var(--surface)` }}
                  >
                    {r.short}
                  </button>
                  {r.values.map((v, j) => dayHourCell(g, r, model.cols[j], v, at(gr, j + 2)))}
                  <button
                    type="button"
                    aria-pressed={rSel}
                    aria-label={`Total ${r.full}: ${formatInt(r.marg)} ${unit}, ${formatPct(share)}`}
                    onClick={() => toggleValue(model.rowField, r.raw)}
                    onMouseEnter={(e) => tip(e.currentTarget, rowContent)}
                    onFocus={(e) => tip(e.currentTarget, rowContent)}
                    onMouseLeave={hide}
                    onBlur={hide}
                    className={cn("flex min-w-0 items-center gap-1.5 rounded-md pl-2 pr-0.5 text-left transition hover:bg-surface-3", rSel && "bg-primary-soft", rowSel.active && !rSel && "opacity-45")}
                    style={at(gr, nC + 2)}
                  >
                    {marg === "full" && (
                      <span aria-hidden className="h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-surface-3">
                        <span className="block h-full rounded-full bg-[var(--seq-4)]" style={{ width: `${model.margRowMax ? (r.marg / model.margRowMax) * 100 : 0}%` }} />
                      </span>
                    )}
                    <span className="tabular text-xs font-semibold text-text">{formatInt(r.marg)}</span>
                    {marg !== "count" && <span className="tabular ml-auto text-[11px] text-muted">{formatPct(share)}</span>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Leyenda bajo la grilla, a la izquierda (legendSystem L2) */}
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        {/* En oscuro la rampa va de oscuro a claro: se dice explícito (legendSystem L8) */}
        <ScaleLegend gradient={gradient} min={formatInt(model.minPos)} max={formatInt(model.max)} noData note={theme.mode === "dark" ? "Escala raíz · más claro = más" : "Escala raíz"} />
        {bandCols.length > 0 && (
          <span className="flex items-center gap-1.5 pb-[15px] text-[11px] text-text-2">
            <span
              aria-hidden
              className={cn("inline-block border-border-strong", narrow ? "h-3.5 w-[5px] rounded-r-[2px] border-y-2 border-r-2" : "h-[5px] w-4 rounded-b-[2px] border-x-2 border-b-2")}
            />
            Jornada laboral {BAND[0]}–{BAND[1]} h
          </span>
        )}
        {/* Solo si ni la transpuesta cabe (pantallas de menos de 320 px) */}
        {narrow && width < tMinWidth && <span className="pb-[15px] text-[11px] text-muted">Desliza para ver todos los días</span>}
      </div>
      <ChartTooltip state={state} />
    </div>
  );
}
