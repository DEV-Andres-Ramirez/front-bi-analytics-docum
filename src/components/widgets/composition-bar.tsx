"use client";

import { Check } from "lucide-react";
import { useCallback, useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import type { BarTableResult, CategoryResult } from "@/dashboards/dto";
import type { BarTableWidget, BarWidget, DonutWidget, SemanticFamily, ValueFormat } from "@/dashboards/types";
import { innerWidth } from "@/dashboards/layout";
import { cn } from "@/lib/cn";
import { isNeutral, normalizeLabel, TONE_VARS } from "@/lib/charts/semantic";
import { useChartTheme } from "@/lib/charts/theme";
import { formatPct, formatValue } from "@/lib/format";
import { useWidgetFrame } from "./frame-context";
import { Swatch } from "./kit/chart-legend";
import { ChartTooltip, useChartTooltip } from "./kit/chart-tooltip";
import { QualityChip } from "./kit/quality";
import { StatusIcon, TONE_LABEL } from "./kit/status-icon";
import { VizEmpty } from "./kit/viz-states";
import {
  buildParts,
  dimensionOf,
  emphasis,
  foldParts,
  formatOf,
  isCountMeasure,
  longestWord,
  mergeNeutrals,
  missingShare,
  orderOf,
  partTooltip,
  textWidth,
  toneNote,
  ProportionBar,
  useBox,
  useHover,
  useRowMin,
  useSelection,
  type Part,
} from "./status-shared";
import type { VizProps } from "./types";

/**
 * CompositionBar: partes de un todo con hasta 7 entradas visibles.
 * - Total (y chip de calidad): en la franja de leyenda si la fila la reserva; si no, en una fila de 18 px
 *   del cuerpo, sobre la barra. Así todas las CompositionBar de una fila empiezan la barra a la misma altura
 *   (el header de las tarjetas angostas no se parte en dos líneas por el total).
 * - legend (4–7 partes): barra 100 % de 14 px y legend-table de 1–3 columnas (ancho mínimo según la etiqueta
 *   más larga; la menor cantidad de columnas que cabe en el alto medido; si no cabe, se pliega en "Otras N").
 *   Filas de 24–28 px (mismo paso en toda la fila de tarjetas). "Otras N" y "No reporta" van después de una
 *   hairline, en gris y fuera de la comparación.
 * - split (2–3 partes reales): comparación entre las partes con dato (los % se calculan sobre ellas, salvo
 *   vizOptions.shareBase = "total"); neutrales en nota al pie. Tres anatomías: columnas (cifra de 32 px, barra
 *   de 14 px arriba, a la altura de las hermanas), apilada (celda alta y angosta: una fila por parte con su
 *   propia barra) y filas (legend-table).
 * - estado × subtipo (BarTable [estado, tipo]): EMITIDA / INCONSISTENTE con mini barra FC/NC/ND y glosario.
 */
type Props = VizProps<BarWidget | DonutWidget | BarTableWidget, CategoryResult | BarTableResult>;

export function CompositionBar(props: Props) {
  const { widget, result } = props;
  if (result.kind === "bartable") {
    if (widget.type === "bartable" && widget.columns.length >= 2) return <StateSubtypeSplit {...props} widget={widget} result={result} />;
    const labels = result.rows.map((r) => r.cells[0] ?? "No reporta");
    return <CategoryComposition {...props} result={{ kind: "category", labels, values: result.rows.map((r) => r.value), total: result.total }} />;
  }
  return <CategoryComposition {...props} result={result} />;
}

// ─── Medidas ─────────────────────────────────────────────────────────────────

/** Separación entre bloques (gap-2.5). */
const GAP = 10;
/** Fila del total cuando la tarjeta no tiene franja de leyenda. */
const TOTAL_ROW = 18;
/** Fila mínima de la legend-table (objetivo táctil de 24 px). */
const LEGEND_ROW = 24;
/** Fila de emergencia: solo si ni las columnas ni el plegado permitido caben en el alto. */
const LEGEND_ROW_TIGHT = 20;
/**
 * Paso máximo de fila: fijo en 28 px (no se estira hasta llenar el cuerpo) para que las legend-tables de
 * tarjetas hermanas tengan el mismo ritmo; el sobrante queda al pie.
 */
const LEGEND_ROW_MAX = 28;
/** Ancho de columna de la legend-table: el justo para la etiqueta más larga en una línea, entre 150 y 232 px. */
const COL_MIN = 232;
const COL_FLOOR = 150;
/** Ancho máximo cómodo: más ancho, el valor se aleja de su etiqueta y conviene otra columna. */
const COL_MAX = 600;
/** Separación real entre columnas de la legend-table (gap-x-3). */
const COL_GAP = 12;
/**
 * Plegado por capacidad (además del base "más de 5 partes → Otras N"): nunca una categoría de ≥ 10 % ni más de
 * 2 categorías reales. Así la tarjeta no cuenta una composición distinta según el dispositivo (Web 11 % en tablet).
 */
const FOLD_SHARE_MAX = 0.1;
const FOLD_EXTRA_MAX = 2;
/** Bloque de neutrales de la legend-table: hairline + separación (mt-1 + pt-1 + borde). */
const NEUTRAL_SEP = 9;
/** Nota de neutrales al pie (hairline + una línea). */
const NOTE_H = 34;
/** Separación entre columnas del split (gap-3; gap-2 en celdas de menos de 360 px). */
const SPLIT_GAP = 12;
const SPLIT_GAP_NARROW = 8;
const NARROW = 360;
/** Fila mínima del split apilado (etiqueta, cifra de 28 px y barra propia); desde 96 px la cifra es de 32. */
const STACK_ROW = 72;
const STACK_ROW_LG = 96;

/** Ancho estimado de la nota de neutrales en una línea (items con muestra, etiqueta, valor y %; "del total" al final). */
function noteWidth(parts: Part[], fmt: ValueFormat, base: boolean): number {
  const items = parts.map((p) => 8 + 10 + 6 + textWidth(p.display, 11.5) + 6 + textWidth(formatValue(p.value, fmt), 11.5, { bold: true }) + 4 + textWidth(`· ${formatPct(p.share)}`, 11.5));
  return items.reduce((a, b) => a + b, 0) + (parts.length - 1) * 12 + (base ? textWidth(" del total", 11.5) : 0);
}

/** Ancho de la muestra de una parte: ícono de estado + punto, o cuadro. */
const markWidth = (p: Part) => (p.tone && !p.neutral ? 28 : 10);

/** Ancho de una fila de la legend-table: padding, muestra, etiqueta en una línea, valor y % (min-w-10). */
function legendRowWidth(p: Part, fmt: ValueFormat): number {
  return 12 + markWidth(p) + 18 + textWidth(p.display, 12) + textWidth(formatValue(p.value, fmt), 12, { bold: true }) + 40;
}

/** Rango de columnas de la legend-table según el ancho interno y el ancho mínimo de columna del plan. */
function colRange(inner: number, colMin: number): [number, number] {
  const max = Math.max(1, Math.min(3, Math.floor((inner + COL_GAP) / (colMin + COL_GAP))));
  const min = Math.max(1, Math.min(max, Math.ceil((inner + COL_GAP) / (COL_MAX + COL_GAP))));
  return [min, max];
}

/** Alto de fila: 24–28 px (paso fijo; no se estira hasta llenar el cuerpo); 20 solo como emergencia. */
function rowHeight(avail: number, chrome: number, rows: number, rowMin = LEGEND_ROW): number {
  if (avail <= 0 || rows <= 0) return rowMin;
  return Math.max(rowMin, Math.min(LEGEND_ROW_MAX, Math.floor((avail - chrome) / rows)));
}

interface LegendPlan {
  parts: Part[];
  real: Part[];
  neutral: Part[];
  cols: number;
  /** Columnas del bloque neutral (1 si "Otras N categorías" no cabe en una columna). */
  neutralCols: number;
  rows: number;
  neutralRows: number;
  rowH: number;
  /** Fila mínima del plan (24; 20 en el plan de emergencia): el paso común de la fila no la sube. */
  rowMin: number;
}

function legendLayout(parts: Part[], c: number, inner: number, fmt: ValueFormat): LegendPlan {
  const real = parts.filter((p) => !p.neutral);
  const neutral = parts.filter((p) => p.neutral);
  const colW = (inner - (c - 1) * COL_GAP) / c;
  const neutralCols = neutral.every((p) => legendRowWidth(p, fmt) <= colW) ? Math.min(c, neutral.length) || 1 : 1;
  return {
    parts,
    real,
    neutral,
    cols: c,
    neutralCols,
    rows: Math.ceil(real.length / c),
    neutralRows: Math.ceil(neutral.length / neutralCols),
    rowH: LEGEND_ROW,
    rowMin: LEGEND_ROW,
  };
}

/**
 * Plegado y columnas de la legend-table: la menor cantidad de columnas (dentro del rango por ancho) cuyas
 * filas caben en el alto disponible; si ninguna cabe, pliega una categoría más en "Otras N" (5 → 2 reales).
 * La columna mínima sale de la etiqueta real más larga (Mail, Web, Ventanilla caben en ≈ 180 px), no de un
 * mínimo fijo: así no se pliega un canal relevante por falta de ancho. avail = 0: alto por contenido (móvil).
 * El plegado por capacidad nunca oculta una categoría de ≥ 10 % ni más de 2 reales (además del plegado base);
 * si así no cabe, filas de 20 px y, como último recurso, el plegado sin restricción (nunca contenido cortado).
 */
function planLegend(base: Part[], inner: number, avail: number, chrome: number, expanded: boolean, fmt: ValueFormat): LegendPlan {
  const levels = expanded ? [5] : [5, 4, 3, 2];
  const keptAt = (max: number) => new Set(foldParts(base, max).filter((p) => !p.neutral).map((p) => p.key));
  const baseKept = keptAt(5);
  const share = new Map(base.map((p) => [p.key, p.share] as const));
  // Niveles permitidos: lo que pliegan además del base son ≤ 2 categorías, todas de < 10 % (los niveles
  // menores pliegan un superconjunto: en cuanto uno no se permite, los siguientes tampoco)
  const allowed: number[] = [];
  for (const max of levels) {
    const kept = keptAt(max);
    const extra = [...baseKept].filter((k) => !kept.has(k));
    if (extra.length > FOLD_EXTRA_MAX || extra.some((k) => (share.get(k) ?? 0) >= FOLD_SHARE_MAX)) break;
    allowed.push(max);
  }
  let last = legendLayout(base, 1, inner, fmt);
  const attempt = (lvls: number[], rowMin: number): LegendPlan | null => {
    for (const max of lvls) {
      const parts = foldParts(base, max);
      const real = parts.filter((p) => !p.neutral);
      const colMin = Math.min(COL_MIN, Math.max(COL_FLOOR, ...real.map((p) => legendRowWidth(p, fmt))));
      const [minCols, maxCols] = colRange(inner, colMin);
      const top = Math.max(1, Math.min(maxCols, real.length));
      for (let c = Math.min(minCols, top); c <= top; c++) {
        const plan = legendLayout(parts, c, inner, fmt);
        last = plan;
        const sep = plan.neutral.length ? NEUTRAL_SEP : 0;
        const rows = plan.rows + plan.neutralRows;
        if (avail <= 0 || chrome + sep + rows * rowMin <= avail) return { ...plan, rowMin, rowH: rowHeight(avail, chrome + sep, rows, rowMin) };
      }
    }
    return null;
  };
  return attempt(allowed, LEGEND_ROW) ?? attempt(allowed, LEGEND_ROW_TIGHT) ?? attempt(levels, LEGEND_ROW) ?? last;
}

/**
 * Columna mínima del split en columnas, por widget: la palabra más larga de la etiqueta con su muestra, o la
 * cifra de 32 px, más el padding. Mail · Web · Ventanilla caben en ≈ 96 px (3 partes en ≈ 312 px).
 */
function splitColMin(parts: Part[], fmt: ValueFormat, narrow: boolean): number {
  const pad = narrow ? 12 : 16;
  const word = Math.max(0, ...parts.map((p) => longestWord(p.display, 12.5) + markWidth(p) + 6));
  const num = Math.max(0, ...parts.map((p) => textWidth(formatValue(p.value, fmt, { compact: p.value >= 1e5 }), 32, { bold: true })));
  return Math.ceil(Math.max(word, num) + pad);
}

type SplitMode = "columns" | "stacked" | "rows";

// ─── Composición de categorías ───────────────────────────────────────────────

/** Acuerdos de fila: columnas del split (1 = caben; todas deben caber) y paso de la legend-table (el menor). */
const SPLIT_FITS = "data-split-fits";
const LEGEND_ROW_ATTR = "data-legend-row";

function CategoryComposition({ widget, result, height, span, expanded }: Omit<Props, "result"> & { result: CategoryResult }) {
  const { spec } = useDashboard();
  const theme = useChartTheme();
  const { ref: boxRef, width, height: boxHeight, measured, fixed } = useBox<HTMLDivElement>();
  const { ref: fitsRef, min: fitsMin } = useRowMin(SPLIT_FITS);
  const { ref: pitchRef, min: rowPitch } = useRowMin(LEGEND_ROW_ATTR);
  const rowFits = fitsMin >= 1;
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      const cleanups = [boxRef(el), fitsRef(el), pitchRef(el)];
      return () => cleanups.forEach((c) => c?.());
    },
    [boxRef, fitsRef, pitchRef],
  );
  const { state, show, hide } = useChartTooltip();
  const hover = useHover(show, hide);
  const sel = useSelection(dimensionOf(widget));
  const frame = useWidgetFrame();
  const fmt = formatOf(widget);
  const family = widget.semantic;
  const overrides = widget.vizOptions?.overrides;
  const order = orderOf(widget);
  const labelKind = widget.labelKind;

  const base = useMemo(
    () => buildParts(result.labels, result.values, { family, overrides, order, labelKind, folded: result.folded, rest: result.rest }),
    [result, family, overrides, order, labelKind],
  );
  const realCount = base.filter((p) => !p.neutral).length;
  const layout = realCount === 0 ? "legend" : (widget.vizOptions?.layout ?? (realCount <= 3 ? "split" : "legend"));
  const inner = measured ? width : expanded ? 1036 : innerWidth(span);
  // Alto disponible: el medido si la fila fija el alto; el presupuesto antes de medir; 0 = por contenido (móvil)
  const avail = measured ? (fixed ? boxHeight : 0) : height;
  const clamp = avail > 0;
  // Con franja de leyenda en la fila (legendEl), el total y el chip van a su derecha y no ocupan el cuerpo.
  // Sin franja van en una fila del cuerpo (nunca en el header: en tarjetas ≤ 460 px bajaría a otra línea y la
  // barra quedaría más abajo que en sus hermanas).
  const totalInStrip = Boolean(frame?.legendEl && frame.chipsEl);
  const totalChrome = totalInStrip ? 0 : TOTAL_ROW + GAP;

  const legend = useMemo(
    () => (layout === "legend" ? planLegend(base, inner, avail, totalChrome + 14 + GAP, Boolean(expanded), fmt) : null),
    [layout, base, inner, avail, totalChrome, expanded, fmt],
  );
  const splitParts = useMemo(() => (layout === "split" ? foldParts(base, 3) : []), [layout, base]);

  const all = legend ? legend.parts : splitParts;
  const total = all.reduce((s, p) => s + p.value, 0);
  if (!total) return <VizEmpty note={widget.note} />;

  const unit = isCountMeasure(widget) ? spec.unit : undefined;
  const unitLabel = unit ? (total === 1 ? unit.singular : unit.plural) : undefined;
  const miss = missingShare(base);
  const chip = <QualityChip neutral={miss.neutral} total={miss.total} />;

  // Split: la comparación es entre las partes con dato; los neutrales van en la nota (sobre el total).
  // shareBase "total": todos los % sobre el total (el mismo cálculo que la banda de KPIs).
  const shareBase = widget.vizOptions?.shareBase ?? "withData";
  const real = splitParts.filter((p) => !p.neutral);
  const neutrals = splitParts.filter((p) => p.neutral);
  const realTotal = real.reduce((s, p) => s + p.value, 0);
  const withData = layout === "split" && shareBase === "withData" && neutrals.length > 0 && realTotal > 0 ? realTotal : undefined;
  const realParts = withData ? real.map((p) => ({ ...p, share: p.value / realTotal })) : real;

  const tip = (p: Part) => {
    const note = withData && !p.neutral ? `sobre ${formatValue(withData, fmt)} con dato` : undefined;
    return partTooltip(p, fmt, { on: sel.isOn(p), canFilter: sel.canFilter, extra: [toneNote(p.tone), note].filter(Boolean).join(" · ") || undefined });
  };
  const bar = (parts: Part[], thickness: number, inside = true) => (
    <ProportionBar
      parts={parts}
      thickness={thickness}
      width={inner}
      theme={inside ? theme : undefined}
      hovered={hover.hovered}
      isOn={sel.isOn}
      anySelected={sel.any}
      onEnter={(p) => hover.enter(p.key, tip(p))}
      onLeave={hover.leave}
      onClick={(p) => hover.tap(() => sel.toggle(p))()}
    />
  );
  const totalLabel = <TotalLabel value={total} fmt={fmt} unit={unitLabel} withData={withData} />;
  // Sin franja, el total va en la primera fila del bloque (18 px exactos, a la derecha): se mueve con la barra
  // que totaliza. El chip de calidad (22 px) se centra y desborda 2 px en los huecos: la barra no baja frente a
  // las hermanas sin chip
  const head = totalInStrip ? null : (
    <div className="flex h-[18px] shrink-0 items-center gap-2">
      {chip}
      {totalLabel}
    </div>
  );

  // Todo va arriba: la barra queda a la misma altura que en las tarjetas hermanas de la fila y el sobrante
  // queda al pie (la nota de neutrales, con mt-auto, se apoya abajo).
  let body: ReactNode;
  let fitsColumns: boolean | undefined;
  // Paso de la legend-table: el propio (24–28 según el alto) y, en la fila, el menor de las hermanas
  let pitch: number | undefined;
  const synced = (own: number, rowMin = LEGEND_ROW) => (clamp ? Math.max(rowMin, Math.min(own, rowPitch)) : own);
  if (legend) {
    pitch = legend.rowH;
    body = (
      <div className="flex min-h-0 flex-1 flex-col gap-2.5">
        {head}
        {bar(legend.parts, 14)}
        <LegendTable plan={{ ...legend, rowH: synced(legend.rowH, legend.rowMin) }} fmt={fmt} sel={sel} hover={hover} tip={tip} clamp={clamp} title={widget.title} />
      </div>
    );
  } else {
    // Mismo presupuesto en todas las celdas de la fila: la nota se reserva la tenga o no la celda (Tipo con
    // "No reporta" y Canal sin neutrales eligen la misma anatomía y el mismo tamaño de cifra)
    const roomRow = avail > 0 ? avail - totalChrome - NOTE_H : 0;
    const narrow = inner < NARROW;
    const gap = narrow ? SPLIT_GAP_NARROW : SPLIT_GAP;
    const colMin = splitColMin(realParts, fmt, narrow);
    const n = realParts.length;
    fitsColumns = inner >= n * colMin + (n - 1) * gap;
    // Columnas solo si caben en TODAS las split de la fila (Canal de etiquetas cortas no va en columnas junto a
    // Dependencia en filas): la fila se lee con una sola anatomía y el mismo paso de 28 px
    const mode: SplitMode = avail > 0 && inner < 480 && n >= 2 && roomRow >= n * STACK_ROW ? "stacked" : fitsColumns && rowFits ? "columns" : "rows";
    if (mode === "rows") pitch = rowHeight(roomRow, 14 + GAP, n);
    // La nota reserva UNA línea (NOTE_H): si con alto fijo no cabe, los neutrales se funden en "Sin dato"
    // (el desglose va en el tooltip y en Ver datos) en vez de partirse y tapar las cifras
    const noteParts = clamp && neutrals.length > 1 && noteWidth(neutrals, fmt, withData !== undefined) > inner ? mergeNeutrals(neutrals, "Sin dato") : neutrals;
    const shared = { fmt, sel, hover, tip, title: widget.title };
    body = (
      <>
        {mode === "stacked" ? (
          <>
            {head}
            <SplitStacked parts={realParts} {...shared} big={roomRow >= n * STACK_ROW_LG} />
          </>
        ) : mode === "columns" ? (
          <div className="flex min-h-0 flex-col gap-2.5">
            {head}
            {bar(realParts, 14, false)}
            <SplitColumns parts={realParts} {...shared} clamp={clamp} big={roomRow >= 150} narrow={narrow} />
          </div>
        ) : (
          <div className="flex min-h-0 flex-col gap-2.5">
            {head}
            {bar(realParts, 14)}
            <LegendTable plan={{ ...legendLayout(realParts, 1, inner, fmt), rowH: synced(pitch ?? LEGEND_ROW) }} {...shared} clamp={clamp} />
          </div>
        )}
        {neutrals.length > 0 && <NeutralNote parts={noteParts} fmt={fmt} sel={sel} hover={hover} tip={tip} base={withData !== undefined} />}
      </>
    );
  }

  return (
    <div
      ref={ref}
      {...(fitsColumns === undefined ? {} : { [SPLIT_FITS]: fitsColumns ? "1" : "0" })}
      {...(pitch === undefined || !clamp ? {} : { [LEGEND_ROW_ATTR]: String(pitch) })}
      className="flex h-full min-h-0 flex-col gap-2.5"
      onMouseLeave={hover.leave}
    >
      {totalInStrip &&
        frame?.chipsEl &&
        createPortal(
          <>
            {chip}
            {totalLabel}
          </>,
          frame.chipsEl,
        )}
      {body}
      <ChartTooltip state={state} />
    </div>
  );
}

/** Total de la composición; con base "con dato", la dice explícita ("% sobre 643 con dato"), como FamilySplit. */
function TotalLabel({ value, fmt, unit, withData }: { value: number; fmt: ValueFormat; unit?: string; withData?: number }) {
  return (
    <p className="tabular ml-auto whitespace-nowrap text-xs text-muted" title={withData !== undefined ? "Los porcentajes de las categorías se calculan sobre los registros con dato; el de los neutrales, sobre el total" : undefined}>
      <span className="font-semibold text-text">{formatValue(value, fmt)}</span> {unit ?? "en total"}
      {withData !== undefined && <> · % sobre {formatValue(withData, fmt)} con dato</>}
    </p>
  );
}

interface SharedProps {
  fmt: ValueFormat;
  sel: ReturnType<typeof useSelection>;
  hover: ReturnType<typeof useHover>;
  tip: (p: Part) => ReturnType<typeof partTooltip>;
}

/** Muestra de la parte: ícono de estado para tonos reales; cuadro para categorías y neutrales. */
function PartMark({ p }: { p: Part }) {
  if (p.tone && !p.neutral) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1">
        <StatusIcon tone={p.tone} />
        <Swatch color={p.color} className="size-2 rounded-full" />
      </span>
    );
  }
  return <Swatch color={p.color} />;
}

/**
 * Etiqueta de la parte: parte en sílabas (hyphens, lang es-CO) antes que dentro de la palabra.
 * clamp: con alto fijo, máximo 2 líneas (el nombre completo va en el tooltip y en aria-label).
 */
function PartName({ p, className, clamp }: { p: Part; className?: string; clamp?: boolean }) {
  return (
    <span className={cn("min-w-0 hyphens-auto break-words text-text-2", clamp && "line-clamp-2", className)}>
      {p.code && <span className="mr-1 font-mono text-[10.5px] text-muted">{p.code}</span>}
      {p.display}
    </span>
  );
}

function rowButtonProps(p: Part, { sel, hover, tip }: Pick<SharedProps, "sel" | "hover" | "tip">) {
  const interactive = sel.canFilter && p.filterable && p.labels.length > 0;
  return {
    type: "button" as const,
    "aria-pressed": interactive ? sel.isOn(p) : undefined,
    "aria-disabled": interactive ? undefined : true,
    onClick: hover.tap(() => interactive && sel.toggle(p)),
    onMouseEnter: hover.enter(p.key, tip(p)),
    onMouseMove: hover.enter(p.key, tip(p)),
    onMouseLeave: hover.leave,
    onFocus: hover.focus(p.key, tip(p)),
    onBlur: hover.leave,
    interactive,
  };
}

// ─── Legend-table (layout legend y split en filas) ──────────────────────────

/**
 * Legend-table: las categorías reales en `cols` columnas y, después de una hairline, los neutrales
 * ("Otras N categorías", "No reporta") en gris, con su valor y %: la misma convención que la nota del split.
 */
function LegendTable({ plan, fmt, sel, hover, tip, clamp, title }: SharedProps & { plan: LegendPlan; clamp: boolean; title: string }) {
  // Defensa ante un plan a medio construir (p. ej. durante una recarga en caliente): sin listas, tabla vacía
  const { real = [], neutral = [], cols, neutralCols, rows, neutralRows, rowH } = plan;
  const row = (p: Part, muted: boolean) => {
    const { interactive, ...btn } = rowButtonProps(p, { sel, hover, tip });
    const on = sel.isOn(p);
    return (
      <li key={p.key} className="flex min-w-0">
        <button
          {...btn}
          aria-label={`${p.display}: ${formatValue(p.value, fmt)} (${formatPct(p.share)})${muted ? ", fuera de la comparación" : ""}`}
          className={cn(
            "grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-left text-xs leading-[15px] transition",
            interactive ? "cursor-pointer hover:bg-surface-3" : "cursor-default",
            on && "bg-primary-soft ring-1 ring-inset ring-primary/40",
            emphasis(p.key, hover.hovered, on, sel.any),
          )}
        >
          <PartMark p={p} />
          <PartName p={p} clamp={clamp} className={muted ? "text-muted" : undefined} />
          <span className={cn("tabular font-semibold", muted ? "text-text-2" : "text-text")}>{formatValue(p.value, fmt)}</span>
          <span className="tabular inline-flex min-w-10 items-center justify-end gap-0.5 whitespace-nowrap text-muted">
            {on && <Check className="size-3 text-primary-text" aria-hidden />}
            {formatPct(p.share)}
          </span>
        </button>
      </li>
    );
  };
  const grid = (n: number, r: number) => ({ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${r}, minmax(${rowH}px, auto))`, gridAutoFlow: "column" as const });
  return (
    <div className="flex min-h-0 shrink-0 flex-col">
      <ul role="list" aria-label={`Composición: ${title}`} className="grid min-h-0 gap-x-3" style={grid(cols, rows)}>
        {real.map((p) => row(p, false))}
      </ul>
      {neutral.length > 0 && (
        <ul role="list" aria-label="Sin dato y categorías agrupadas" className="mt-1 grid gap-x-3 border-t border-border pt-1" style={grid(neutralCols, neutralRows)}>
          {neutral.map((p) => row(p, true))}
        </ul>
      )}
    </div>
  );
}

// ─── Split ───────────────────────────────────────────────────────────────────

/** Columnas con cifra de 32 px (40 px si el cuerpo tiene alto de sobra); las cifras comparten línea base. */
function SplitColumns({ parts, fmt, sel, hover, tip, title, clamp, big, narrow }: SharedProps & { parts: Part[]; title: string; clamp: boolean; big: boolean; narrow: boolean }) {
  return (
    <ul role="list" aria-label={`Composición: ${title}`} className={cn("grid shrink-0", narrow ? "gap-2" : "gap-3")} style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0, 1fr))` }}>
      {parts.map((p) => {
        const { interactive, ...btn } = rowButtonProps(p, { sel, hover, tip });
        const on = sel.isOn(p);
        return (
          <li key={p.key} className="flex min-w-0">
            <button
              {...btn}
              aria-label={`${p.display}: ${formatValue(p.value, fmt)} (${formatPct(p.share)})`}
              className={cn(
                "flex h-full w-full min-w-0 flex-col items-start gap-0.5 rounded-xl py-1.5 text-left transition",
                narrow ? "px-1.5" : "px-2",
                interactive ? "cursor-pointer hover:bg-surface-3" : "cursor-default",
                on && "bg-primary-soft ring-1 ring-inset ring-primary/40",
                emphasis(p.key, hover.hovered, on, sel.any),
              )}
            >
              <span className="flex w-full min-w-0 items-start gap-1.5 text-[12.5px] leading-tight">
                <span className="mt-[3px] inline-flex">
                  <PartMark p={p} />
                </span>
                <PartName p={p} clamp={clamp} />
              </span>
              <span className={cn("tabular mt-auto font-bold leading-[1.1] tracking-tight text-text", big ? "text-[40px]" : "text-[32px]")}>
                {formatValue(p.value, fmt, { compact: p.value >= 1e5 })}
              </span>
              <span className="tabular inline-flex items-center gap-1 text-xs text-muted">
                {formatPct(p.share)}
                {on && <Check className="size-3 text-primary-text" aria-hidden />}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Celda alta y angosta: una fila por parte (1fr) con etiqueta, cifra de 28–32 px, % y su propia barra de 8 px. */
function SplitStacked({ parts, fmt, sel, hover, tip, title, big }: SharedProps & { parts: Part[]; title: string; big: boolean }) {
  return (
    <ul role="list" aria-label={`Composición: ${title}`} className="flex min-h-0 flex-1 flex-col">
      {parts.map((p, i) => {
        const { interactive, ...btn } = rowButtonProps(p, { sel, hover, tip });
        const on = sel.isOn(p);
        return (
          <li key={p.key} className={cn("flex min-h-0 flex-1", big && "py-1", i > 0 && "border-t border-border")}>
            <button
              {...btn}
              aria-label={`${p.display}: ${formatValue(p.value, fmt)} (${formatPct(p.share)})`}
              className={cn(
                "flex w-full min-w-0 flex-col justify-center rounded-lg px-2 text-left transition",
                big ? "gap-1.5 py-1.5" : "gap-1 py-1",
                interactive ? "cursor-pointer hover:bg-surface-3" : "cursor-default",
                on && "bg-primary-soft ring-1 ring-inset ring-primary/40",
                emphasis(p.key, hover.hovered, on, sel.any),
              )}
            >
              <span className="flex w-full min-w-0 items-center gap-1.5 text-[12.5px] leading-tight">
                <PartMark p={p} />
                <PartName p={p} clamp />
              </span>
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className={cn("tabular font-bold leading-none tracking-tight text-text", big ? "text-[32px]" : "text-[28px]")}>{formatValue(p.value, fmt, { compact: p.value >= 1e5 })}</span>
                <span className="tabular inline-flex items-center gap-1 text-xs text-muted">
                  {formatPct(p.share)}
                  {on && <Check className="size-3 text-primary-text" aria-hidden />}
                </span>
              </span>
              <span aria-hidden className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${p.share * 100}%`, background: p.color }} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Neutrales como nota al pie (fuera de la comparación; % sobre el total). Con `base` (los % de las partes van
 * sobre las que tienen dato), la nota termina en "del total" (una vez): la tarjeta no parece sumar 109 %.
 */
function NeutralNote({ parts, fmt, sel, hover, tip, base }: SharedProps & { parts: Part[]; base?: boolean }) {
  return (
    <p className="mt-auto flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-1.5 text-[11.5px] text-muted">
      {parts.map((p, i) => {
        const { interactive, ...btn } = rowButtonProps(p, { sel, hover, tip });
        const on = sel.isOn(p);
        return (
          <button
            key={p.key}
            {...btn}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 transition",
              interactive ? "cursor-pointer hover:bg-surface-3" : "cursor-default",
              on && "bg-primary-soft",
              emphasis(p.key, hover.hovered, on, sel.any),
            )}
          >
            <Swatch color={p.color} />
            <span>{p.display}</span>
            <span className="tabular font-semibold text-text-2">{formatValue(p.value, fmt)}</span>
            <span className="tabular whitespace-nowrap">
              · {formatPct(p.share)}
              {base && i === parts.length - 1 && " del total"}
            </span>
          </button>
        );
      })}
    </p>
  );
}

// ─── Variante estado × subtipo (facturas emitidas) ───────────────────────────

const SUBTYPE_GLOSSARY: Record<string, string> = { FC: "factura", NC: "nota crédito", ND: "nota débito" };
const SUBTYPE_ORDER = ["FC", "NC", "ND"];
/**
 * Slots categóricos de los tipos de documento: naranja, azul, amarillo, magenta y violeta.
 * Nunca aqua (3), verde (6) ni rojo (8), que se confunden con los tonos de estado del panel.
 */
const TYPE_SLOTS = [1, 2, 4, 5, 7];
/** Alto del encabezado del panel (estado + cifra de 32 px). */
const PANEL_HEAD = 55;

interface TypePart {
  key: string;
  display: string;
  color: string;
}

interface StateGroup {
  part: Part;
  subtypes: { code: string; value: number }[];
}

/** Anatomía del panel: lado a lado (cifra | desglose), en columna, o compacta (mini barra + chips). */
type PanelAnatomy = "side" | "column" | "compact";

function StateSubtypeSplit({ widget, result, span, height, expanded }: Omit<Props, "widget" | "result"> & { widget: BarTableWidget; result: BarTableResult }) {
  const { spec } = useDashboard();
  const { ref, width, measured } = useBox<HTMLDivElement>();
  const { ref: listRef, height: listHeight, measured: listMeasured, fixed: listFixed } = useBox<HTMLUListElement>();
  const { state, show, hide } = useChartTooltip();
  const hover = useHover(show, hide);
  const [stateCol, typeCol] = widget.columns;
  const sel = useSelection(stateCol.field);
  const typeSel = useSelection(typeCol.field);
  const frame = useWidgetFrame();
  const fmt = formatOf(widget);

  const model = useMemo(() => {
    const byState = new Map<string, Map<string, number>>();
    for (const r of result.rows) {
      const st = r.cells[0] ?? "No reporta";
      const tp = r.cells[1] ?? "No reporta";
      const m = byState.get(st) ?? new Map<string, number>();
      m.set(tp, (m.get(tp) ?? 0) + r.value);
      byState.set(st, m);
    }
    const labels = [...byState.keys()];
    const family: SemanticFamily | undefined = widget.semantic ?? (labels.some((l) => ["emitida", "inconsistente"].includes(normalizeLabel(l))) ? "factura" : undefined);
    const values = labels.map((l) => [...byState.get(l)!.values()].reduce((a, b) => a + b, 0));
    const parts = buildParts(labels, values, { family, overrides: widget.vizOptions?.overrides });
    const typeTotals = new Map<string, number>();
    byState.forEach((m) => m.forEach((v, k) => typeTotals.set(k, (typeTotals.get(k) ?? 0) + v)));
    const codes = [...typeTotals.keys()].sort((a, b) => {
      const ia = SUBTYPE_ORDER.indexOf(a.toUpperCase());
      const ib = SUBTYPE_ORDER.indexOf(b.toUpperCase());
      if (isNeutral(a) !== isNeutral(b)) return isNeutral(a) ? 1 : -1;
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (typeTotals.get(b) ?? 0) - (typeTotals.get(a) ?? 0);
    });
    let slot = 0;
    const typeParts: TypePart[] = codes.map((code) => ({
      key: code,
      display: SUBTYPE_GLOSSARY[code.toUpperCase()] ? code.toUpperCase() : code,
      color: isNeutral(code) ? "var(--neutral-mark)" : slot < TYPE_SLOTS.length ? `var(--chart-${TYPE_SLOTS[slot++]})` : "var(--chart-other)",
    }));
    const groups: StateGroup[] = parts.map((part) => ({
      part,
      subtypes: codes.map((code) => ({ code, value: byState.get(part.key)?.get(code) ?? 0 })).filter((s) => s.value > 0),
    }));
    return { parts, groups, typeParts };
  }, [result.rows, widget.semantic, widget.vizOptions?.overrides]);

  const total = model.parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <VizEmpty note={widget.note} />;
  const inner = measured ? width : expanded ? 1036 : innerWidth(span);
  const real = model.groups.filter((g) => !g.part.neutral);
  const neutrals = model.parts.filter((p) => p.neutral);
  const n = Math.max(1, real.length);
  // Celda alta y angosta (4 columnas en L): estados apilados
  const stacked = inner < n * 140 || (height >= 300 && inner < 520);
  // Anatomía por el tamaño real de cada panel (el alto solo cuenta si la fila lo fija)
  const panelW = stacked ? inner : (inner - 12 * (n - 1)) / n;
  const panelH = listMeasured && listFixed ? (stacked ? (listHeight - 12 * (n - 1)) / n : listHeight) : 0;
  const maxSub = Math.max(1, ...real.map((g) => g.subtypes.length));
  const detailH = 8 + 8 + maxSub * 24;
  const needSide = Math.max(PANEL_HEAD, detailH) + 24;
  const needColumn = PANEL_HEAD + 12 + detailH + 24;
  const anatomy: PanelAnatomy = panelW >= 300 ? (!panelH || panelH >= needSide ? "side" : "compact") : !panelH || panelH >= needColumn ? "column" : "compact";

  const unit = isCountMeasure(widget) ? spec.unit : undefined;
  const typeColor = new Map(model.typeParts.map((t) => [t.key, t.color] as const));
  const tip = (p: Part) => partTooltip(p, fmt, { on: sel.isOn(p), canFilter: sel.canFilter, extra: toneNote(p.tone) });
  const typeTip = (g: StateGroup, code: string, v: number) => ({
    title: `${g.part.display} · ${SUBTYPE_GLOSSARY[code.toUpperCase()] ? `${code.toUpperCase()} (${SUBTYPE_GLOSSARY[code.toUpperCase()]})` : code}`,
    value: formatValue(v, fmt),
    valueNote: `${formatPct(g.part.value ? v / g.part.value : 0)} del estado`,
    hint: typeSel.selected.includes(code) ? "Clic para quitar el filtro de tipo" : "Clic para filtrar por tipo",
  });
  const miss = missingShare(model.parts);
  const chip = <QualityChip neutral={miss.neutral} total={miss.total} />;
  const totalLabel = <TotalLabel value={total} fmt={fmt} unit={unit ? (total === 1 ? unit.singular : unit.plural) : undefined} />;
  const compact = anatomy === "compact";

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col gap-3" onMouseLeave={hover.leave}>
      {/* Mismo criterio que CategoryComposition: a la franja si la fila la reserva; si no, fila propia del cuerpo */}
      {frame?.legendEl && frame.chipsEl ? (
        createPortal(
          <>
            {chip}
            {totalLabel}
          </>,
          frame.chipsEl,
        )
      ) : (
        <div className="flex h-[18px] shrink-0 items-center gap-2">
          {chip}
          {totalLabel}
        </div>
      )}
      <ProportionBar
        parts={model.parts}
        thickness={8}
        hovered={hover.hovered}
        isOn={sel.isOn}
        anySelected={sel.any}
        onEnter={(p) => hover.enter(p.key, tip(p))}
        onLeave={hover.leave}
        onClick={(p) => hover.tap(() => sel.toggle(p))()}
      />
      <ul
        ref={listRef}
        role="list"
        aria-label={`${stateCol.label} por ${typeCol.label}`}
        className="grid min-h-0 flex-1 gap-3"
        style={stacked ? { gridAutoRows: "minmax(0, 1fr)" } : { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {real.map((g) => {
          const p = g.part;
          const on = sel.isOn(p);
          const tone = p.tone ?? "neutral";
          const head = (
            <button
              type="button"
              aria-pressed={on}
              aria-label={`${p.display}: ${formatValue(p.value, fmt)} (${formatPct(p.share)}), ${TONE_LABEL[tone]}`}
              onClick={hover.tap(() => sel.toggle(p))}
              onMouseEnter={hover.enter(p.key, tip(p))}
              onMouseMove={hover.enter(p.key, tip(p))}
              onMouseLeave={hover.leave}
              onFocus={hover.focus(p.key, tip(p))}
              onBlur={hover.leave}
              className="-m-1 flex min-w-0 flex-col items-start gap-0.5 rounded-lg p-1 text-left"
            >
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text-2">
                <StatusIcon tone={tone} className="size-4" />
                {p.display}
              </span>
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className={cn("tabular font-bold leading-[1.1] tracking-tight text-text", compact ? "text-2xl" : "text-[32px]")}>{formatValue(p.value, fmt)}</span>
                <span className="tabular text-xs text-muted">{formatPct(p.share)}</span>
              </span>
            </button>
          );
          const typeButton = (st: { code: string; value: number }, className: string, children: ReactNode) => {
            const typeOn = typeSel.selected.includes(st.code);
            const tt = typeTip(g, st.code, st.value);
            return (
              <button
                type="button"
                aria-pressed={typeOn}
                aria-label={`${p.display}, ${st.code}: ${formatValue(st.value, fmt)} (${formatPct(p.value ? st.value / p.value : 0)} del estado)`}
                onClick={hover.tap(() => typeSel.toggleMany([st.code]))}
                onMouseEnter={hover.enter(p.key, tt)}
                onMouseMove={hover.enter(p.key, tt)}
                onMouseLeave={hover.leave}
                onFocus={hover.focus(p.key, tt)}
                onBlur={hover.leave}
                className={cn(className, "transition hover:bg-surface-3", typeOn && "bg-primary-soft")}
              >
                {children}
              </button>
            );
          };
          const mini = (
            <div aria-hidden className="flex h-2 w-full shrink-0 gap-[2px] overflow-hidden rounded-full bg-surface-3">
              {g.subtypes.map((st) => (
                <span key={st.code} className="min-w-[3px]" style={{ flexGrow: st.value, flexBasis: 0, background: typeColor.get(st.code) }} />
              ))}
            </div>
          );
          const detail = compact ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              {mini}
              <ul role="list" aria-label={`${p.display} por ${typeCol.label}`} className="flex flex-wrap gap-x-1 gap-y-0.5">
                {g.subtypes.map((st) => (
                  <li key={st.code}>
                    {typeButton(
                      st,
                      "inline-flex min-h-6 items-center gap-1 rounded-md px-1 text-xs",
                      <>
                        <Swatch color={typeColor.get(st.code) ?? "var(--neutral-mark)"} />
                        <span className="font-mono text-[11px] font-semibold text-text-2">{st.code}</span>
                        <span className="tabular font-semibold text-text">{formatValue(st.value, fmt)}</span>
                      </>,
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-2">
              {mini}
              <ul role="list" aria-label={`${p.display} por ${typeCol.label}`} className="flex flex-col">
                {g.subtypes.map((st) => (
                  <li key={st.code}>
                    {typeButton(
                      st,
                      "grid min-h-6 w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 rounded-md px-1 text-left text-xs",
                      <>
                        <Swatch color={typeColor.get(st.code) ?? "var(--neutral-mark)"} />
                        <span className="font-mono text-[11px] font-semibold text-text-2">{st.code}</span>
                        <span className="tabular font-semibold text-text">{formatValue(st.value, fmt)}</span>
                        <span className="tabular w-11 text-right text-muted">{formatPct(p.value ? st.value / p.value : 0)}</span>
                      </>,
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
          return (
            <li
              key={p.key}
              className={cn(
                // Los dos paneles en surface-2: el tono va solo en el borde superior y en el ícono
                "min-w-0 overflow-hidden rounded-xl border-t-[3px] bg-surface-2 transition",
                anatomy === "side" ? "grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] content-center items-center gap-4 p-3" : "flex flex-col justify-center",
                anatomy === "column" && "gap-3 p-3",
                compact && "gap-2 px-3 py-2.5",
                on && "ring-2 ring-inset ring-primary",
                emphasis(p.key, hover.hovered, on, sel.any),
              )}
              style={{ borderTopColor: TONE_VARS[tone].solid }}
            >
              {head}
              {detail}
            </li>
          );
        })}
      </ul>
      {neutrals.length > 0 && <NeutralNote parts={neutrals} fmt={fmt} sel={sel} hover={hover} tip={tip} />}
      <dl className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted" aria-label="Glosario de tipos de documento">
        {model.typeParts.map((t) => (
          <div key={t.key} className="inline-flex items-center gap-1.5">
            <Swatch color={t.color} />
            <dt className="font-mono font-semibold text-text-2">{t.display}</dt>
            {SUBTYPE_GLOSSARY[t.key.toUpperCase()] && <dd>= {SUBTYPE_GLOSSARY[t.key.toUpperCase()]}</dd>}
          </div>
        ))}
      </dl>
      <ChartTooltip state={state} />
    </div>
  );
}
