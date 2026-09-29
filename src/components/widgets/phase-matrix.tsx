"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { ProvisionalIcon } from "@/components/dashboard/kpi/shared";
import { Tooltip } from "@/components/ui/tooltip";
import type { CategoryResult, WidgetResult } from "@/dashboards/dto";
import type { ValueFormat, WidgetDef } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import { isNeutral } from "@/lib/charts/semantic";
import { inkOn, seqColor, useChartTheme } from "@/lib/charts/theme";
import { formatInt, formatValue, nf1 } from "@/lib/format";
import { displayLabel, type LabelKind } from "@/lib/labels";
import { ChartTooltip, useChartTooltip, type TooltipContent } from "./kit/chart-tooltip";
import { MoreButton } from "./list-kit";
import { VizEmpty } from "./kit/viz-states";
import { anchorOf, median, selectionOf } from "./matrix-kit";
import type { CompositeProps } from "./types";

/**
 * PhaseMatrix + BottleneckCallouts (docs/ui-design-system.md › PhaseMatrix):
 * matriz oficina × fase con la unión de las 6 oficinas más lentas de cada fase (2/3) y
 * 4 callouts con la oficina más lenta por fase (1/3). Color secuencial normalizado por columna,
 * rango 1–6 por fase (empates por competición: "=5") y contorno --primary en la fase más lenta
 * de cada fila.
 * - Las fases sin datos NO ocupan columna (el callout punteado ya lo dice): el ancho va a la oficina.
 * - Escritorio (side): filas de 32 px que se compactan hasta 28 px para que quepan todas las oficinas
 *   del alto del tier; oficina en hasta 2 líneas con fila de ≥ 30 px y en una sola (truncada) por
 *   debajo: dos líneas de 13 px no caben en 27 px sin tocar la hairline. Nombre completo en el
 *   tooltip. Si aun así no caben, scroll con cabecera fija, desvanecido inferior y
 *   "+N oficinas · desplaza" en la fila de la leyenda (nunca encima de los datos).
 * - Tableta (row): la matriz mide por contenido (hasta 12 filas) y los callouts van debajo.
 * - Móvil (stack, < 520 px): una tarjeta por oficina con las fases en paralelo (2×2 con 4 fases), el
 *   mismo patrón de EfficiencyMatrix; la oficina ocupa todo el ancho (sin columna de 116 px partida en
 *   3–4 líneas) y cada fase lleva su nombre. Las 6 primeras + "Ver N oficinas más"; callouts debajo.
 */

const TOP = 6;
/** Paso de fila por defecto (incluye la hairline inferior) y mínimo al compactar. */
const ROW_H = 32;
const ROW_MIN = 28;
/** Cabecera: encabezados de fase en ≤ 2 líneas (+1 px de borde). */
const HEAD_H = 40;
/** Tableta (row): filas visibles antes de hacer scroll. */
const ROW_MAX_VISIBLE = 12;
/** Escritorio: ancho de referencia de una fase con dato (encabezado en ≤ 2 líneas) y límites de la columna de oficina. */
const PHASE_W = 92;
const OFFICE_MIN = 150;
const OFFICE_MAX = 360;
/** Escritorio: por debajo de este paso de fila la oficina va en una línea (truncada, completa en el tooltip). */
const TWO_LINES_MIN = 30;
/** Móvil: tarjetas visibles antes de "Ver N oficinas más". */
const CARD_LIMIT = 6;
const SIDE_GAP = 20;
const FADE = 28;

interface Phase {
  id: string;
  title: string;
  /** Primera palabra del título (encabezado en móvil: "Gestión a aprobación" → "Gestión"). */
  short: string;
  full: string;
  provisional: boolean;
  note?: string;
  format: ValueFormat;
  values: Map<string, number>;
  rank: Map<string, number>;
  /** Rangos compartidos por más de una oficina (empate a la precisión mostrada). */
  tied: Set<number>;
  ranked: { label: string; value: number }[];
  max: number;
  median: number;
  empty: boolean;
}

/** "Asignación (promedio días)" → "Asignación". */
const phaseTitle = (t: string) => t.replace(/\s*\([^)]*\)\s*$/, "").trim() || t;
/** Valor a la precisión mostrada (1 decimal): define los empates. */
const shown = (v: number) => Math.round(v * 10) / 10;

function buildPhase(w: WidgetDef, r: WidgetResult | undefined): Phase {
  const cat: CategoryResult | null = r && r.kind === "category" ? r : null;
  const values = new Map<string, number>();
  cat?.labels.forEach((l, i) => {
    const v = cat.values[i];
    if (Number.isFinite(v)) values.set(l, v);
  });
  const ranked = [...values.entries()]
    .filter(([l, v]) => v > 0 && !isNeutral(l))
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => shown(b.value) - shown(a.value) || a.label.localeCompare(b.label, "es"));
  // Rango por competición sobre el valor mostrado: 3,0 · 3,0 · 3,0 → =5 · =5 · =5 (el siguiente es 8)
  const rank = new Map<string, number>();
  const count = new Map<number, number>();
  ranked.forEach((x, i) => {
    const prev = ranked[i - 1];
    const k = prev && shown(prev.value) === shown(x.value) ? rank.get(prev.label)! : i + 1;
    rank.set(x.label, k);
    count.set(k, (count.get(k) ?? 0) + 1);
  });
  const tied = new Set([...count.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  const title = phaseTitle(w.title);
  return {
    id: w.id,
    title,
    short: title.split(/\s+/)[0] || title,
    full: w.title,
    provisional: Boolean(w.provisional),
    note: w.note,
    format: (w.type === "bar" ? w.valueFormat : undefined) ?? "days",
    values,
    rank,
    tied,
    ranked,
    max: ranked[0]?.value ?? 0,
    median: median(ranked.map((x) => x.value)),
    empty: ranked.length === 0,
  };
}

/** "5" o "=5" si el rango es compartido. */
const rankText = (p: Phase, rank: number) => (p.tied.has(rank) ? `=${rank}` : String(rank));

interface Row {
  raw: string;
  short: string;
  full: string;
  values: (number | null)[];
  ranks: (number | null)[];
  worst: number;
  slowest: number;
}

function buildRows(phases: Phase[], kind: LabelKind): Row[] {
  // Unión del top 6 de cada fase; los empatados en el límite entran todos
  const set = new Set<string>();
  for (const p of phases) for (const x of p.ranked) if ((p.rank.get(x.label) ?? Infinity) <= TOP) set.add(x.label);
  const rows = [...set].map((label): Row => {
    const values = phases.map((p) => (p.empty ? null : (p.values.get(label) ?? null)));
    const ranks = phases.map((p) => p.rank.get(label) ?? null);
    const worst = Math.min(...ranks.map((r) => r ?? Infinity));
    let slowest = -1;
    values.forEach((v, j) => {
      if (v !== null && v > 0 && (slowest < 0 || v > (values[slowest] ?? 0))) slowest = j;
    });
    const d = displayLabel(label, kind);
    return { raw: label, short: d.short, full: d.full, values, ranks, worst, slowest };
  });
  const norm = (r: Row) => r.values.reduce<number>((s, v, j) => s + (v && phases[j].max ? v / phases[j].max : 0), 0);
  return rows.sort((a, b) => a.worst - b.worst || norm(b) - norm(a) || a.full.localeCompare(b.full, "es"));
}

/** Días compactos para la celda ("25,5 d"). */
const cellDays = (v: number, f: ValueFormat) => (f === "days" ? `${nf1.format(v)} d` : formatValue(v, f));
/**
 * "3,4× la mediana": el multiplicador va antes del sustantivo (se lee "3,4 veces la mediana") y cabe
 * en la columna de la cifra del callout a 1024 px sin robarle una línea al nombre de la oficina.
 */
const timesMedian = (v: number, m: number) => (m > 0 ? `${nf1.format(v / m)}× la mediana` : null);

interface Overflow {
  /** Filas ocultas (total o parcialmente) bajo el borde inferior del scroller. */
  below: number;
  /** Hay más contenido que alto visible (scroll vertical). */
  vertical: boolean;
  /** Hay columnas ocultas a la derecha. */
  right: boolean;
}

const NO_OVERFLOW: Overflow = { below: 0, vertical: false, right: false };

function readOverflow(el: HTMLElement): Overflow {
  const box = el.getBoundingClientRect();
  let below = 0;
  el.querySelectorAll<HTMLElement>("tbody > tr").forEach((tr) => {
    const r = tr.getBoundingClientRect();
    // Cuenta toda fila no visible por completo: la última asomada queda bajo el desvanecido y el pie
    if (r.bottom > box.bottom + 1) below++;
  });
  return {
    below,
    vertical: el.scrollHeight > el.clientHeight + 1,
    right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
  };
}

/**
 * Contenido oculto del scroller de la matriz (compatible con el React Compiler: se mide en un ref
 * callback con ResizeObserver y en onScroll, nunca en render).
 */
function useMatrixOverflow() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = useState<Overflow>(NO_OVERFLOW);
  const update = useCallback((node: HTMLElement) => {
    const next = readOverflow(node);
    setOverflow((s) => (s.below === next.below && s.vertical === next.vertical && s.right === next.right ? s : next));
  }, []);
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      setEl(node);
      if (!node) return;
      const ro = new ResizeObserver(() => update(node));
      ro.observe(node);
      for (const child of Array.from(node.children)) ro.observe(child);
      return () => ro.disconnect();
    },
    [update],
  );
  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => update(e.currentTarget), [update]);
  return { el, ref, onScroll, overflow };
}

export function PhaseMatrix({ cell, widgets, results, expanded }: CompositeProps) {
  const theme = useChartTheme();
  const { filters, toggleValue } = useDashboard();
  const { state, show, hide } = useChartTooltip();
  const { ref, width, measured } = useElementSize<HTMLDivElement>();
  // Alto disponible para la tabla (en escritorio lo fija el tier de la fila): decide el paso de fila
  const { ref: boxRef, height: boxH, measured: boxMeasured } = useElementSize<HTMLDivElement>();
  const { el: scrollEl, ref: scrollRef, onScroll, overflow } = useMatrixOverflow();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [showAll, setShowAll] = useState(false);
  const first = widgets[0];
  const dimension = first?.type === "bar" ? first.dimension : "Oficina_responsable_de_respuesta";
  const kind: LabelKind = first?.labelKind ?? "oficina";

  const phases = useMemo(() => widgets.map((w, i) => buildPhase(w, results[i])), [widgets, results]);
  const rows = useMemo(() => buildRows(phases, kind), [phases, kind]);

  const sel = selectionOf(filters.eq, dimension);
  // side: matriz 2/3 + callouts 1/3 (≥ 720 px) · row: tableta, matriz por contenido y callouts en una
  // fila de 4 debajo · stack: móvil, alto por contenido
  const layout: "side" | "row" | "stack" = !measured || width >= 720 ? "side" : width >= 520 ? "row" : "stack";
  const compact = layout === "stack";
  const side = layout === "side";

  if (!rows.length && phases.every((p) => p.empty)) return <VizEmpty note="Sin tiempos por fase en el periodo" />;

  // Columnas visibles (índice original j): las fases sin datos salen de la tabla en todos los anchos
  // (el callout punteado ya dice "Sin datos en el periodo"); su ancho va a la columna de oficina
  const cols = phases.map((p, j) => ({ p, j })).filter(({ p }) => !p.empty);
  const dataCount = cols.length;
  const matrixW = measured ? (side ? ((width - SIDE_GAP) * 2) / 3 : width) : 0;
  // Oficina: todo lo que dejan las fases (92 px c/u), acotado a 150–360 px
  const officeW = Math.round(Math.max(OFFICE_MIN, Math.min(OFFICE_MAX, matrixW - dataCount * PHASE_W)));
  const minWidth = OFFICE_MIN + dataCount * 80;
  const anyTie = phases.some((p) => [...p.tied].some((k) => k <= TOP));
  // Paso de fila: 32 px; en escritorio se compacta hasta 28 px para que quepan todas las oficinas
  // (11 × 28 + 40 = 348 px caben en el tier L sin scroll)
  const rowH = side && boxMeasured && HEAD_H + rows.length * ROW_H + 1 > boxH ? Math.max(ROW_MIN, Math.floor((boxH - HEAD_H - 1) / Math.max(1, rows.length))) : ROW_H;
  // Tableta: la matriz mide por contenido hasta 12 filas (la celda crece con la tarjeta)
  const rowMaxH = layout === "row" ? HEAD_H + Math.min(rows.length, ROW_MAX_VISIBLE) * ROW_H + 1 : undefined;

  // ¿Hace falta scroll? En escritorio se decide con el alto del contenedor, que no depende del pie
  // (vive dentro de él): así el pie no se sostiene a sí mismo. En tableta, con la medición del DOM.
  const needScroll = side ? boxMeasured && HEAD_H + 1 + rows.length * rowH > boxH : overflow.vertical;
  const showFoot = !compact && needScroll;
  // Oficina en 2 líneas solo si caben en el paso de fila (2 × 14 px); si no, una línea truncada
  const twoLines = rowH >= TWO_LINES_MIN;

  // Móvil: primeras 6 tarjetas (las filas ya van por su peor rango) + "Ver N oficinas más"
  const canLimit = compact && !expanded && rows.length > CARD_LIMIT + 1;
  const limited = canLimit && !showAll;
  const cardRows = limited ? rows.slice(0, CARD_LIMIT) : rows;
  const hiddenCards = rows.length - CARD_LIMIT;

  const fadeBottom = !compact && overflow.below > 0;
  const fadeRight = overflow.right;
  const masks = [fadeBottom && `linear-gradient(to bottom, #000 calc(100% - ${FADE}px), transparent)`, fadeRight && `linear-gradient(to right, #000 calc(100% - 24px), transparent)`].filter(Boolean) as string[];
  const maskStyle: CSSProperties = {
    maxHeight: rowMaxH,
    ...(masks.length ? { maskImage: masks.join(", "), WebkitMaskImage: masks.join(", "), maskComposite: "intersect", WebkitMaskComposite: "source-in" } : {}),
  };

  const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
  const scrollDown = () => scrollEl?.scrollBy({ top: Math.max(rowH, scrollEl.clientHeight - HEAD_H - rowH), behavior });
  const scrollTop = () => scrollEl?.scrollTo({ top: 0, behavior });

  const rowTip = (el: Element, r: Row, j: number) => {
    const { x, y } = anchorOf(el);
    const p = phases[j];
    const v = r.values[j];
    const rank = r.ranks[j];
    const content: TooltipContent = {
      title: r.full,
      value: v === null ? "Sin dato" : formatValue(v, p.format),
      valueNote: `en ${p.title.toLocaleLowerCase("es-CO")}`,
      rows: phases.map((q, k) => ({
        label: q.title,
        value: q.empty ? "Sin datos" : r.values[k] === null ? "—" : formatValue(r.values[k], q.format),
        share: r.ranks[k] ? `#${rankText(q, r.ranks[k]!)}` : undefined,
        color: q.empty || r.values[k] === null ? "var(--neutral-mark)" : seqColor(theme, q.max ? 0.12 + 0.88 * ((r.values[k] ?? 0) / q.max) : 0),
        active: k === j,
      })),
      extra: rank ? (
        <p className="mt-1.5 text-white/70">
          Rango {rankText(p, rank)} de {p.ranked.length} en {p.title.toLocaleLowerCase("es-CO")}
          {p.tied.has(rank) ? " (empate)" : ""}
        </p>
      ) : undefined,
      hint: "Clic para filtrar la oficina",
    };
    show(x, y, content);
  };

  /** Oficina: nombre completo (la celda puede ir truncada o abreviada) y sus días por fase. */
  const officeTip = (el: Element, r: Row) => {
    const { x, y } = anchorOf(el);
    show(x, y, {
      title: r.full,
      rows: cols.map(({ p, j }) => ({
        label: p.title,
        value: r.values[j] === null ? "—" : formatValue(r.values[j], p.format),
        share: r.ranks[j] ? `#${rankText(p, r.ranks[j]!)}` : undefined,
        color: r.values[j] === null ? "var(--neutral-mark)" : seqColor(theme, p.max ? 0.12 + 0.88 * ((r.values[j] ?? 0) / p.max) : 0),
      })),
      hint: "Clic para filtrar la oficina",
    });
  };

  const pillH = rowH - 7;
  const table = (
    <div ref={boxRef} className={cn("relative flex min-h-0 flex-col", side && "flex-1")}>
      <div ref={scrollRef} onScroll={onScroll} className={cn("min-h-0 overflow-auto rounded-lg", side && "flex-1")} style={maskStyle}>
        <table className="w-full border-separate border-spacing-0 text-left" style={{ tableLayout: "fixed", minWidth }}>
          <colgroup>
            <col style={{ width: officeW }} />
            {cols.map(({ p }) => (
              <col key={p.id} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-[2] bg-surface">
            <tr style={{ height: HEAD_H - 1 }}>
              <th scope="col" className="sticky left-0 z-[3] border-b border-border bg-surface px-2 pb-1.5 align-bottom text-[11px] font-semibold text-muted">
                Oficina
              </th>
              {cols.map(({ p }) => (
                <th key={p.id} scope="col" className="border-b border-border px-1 pb-1.5 pl-1.5 align-bottom text-xs font-semibold leading-tight text-text-2">
                  {p.provisional && (
                    <Tooltip className="mr-1 align-[-2px]" content={p.note ? `Provisional: ${p.note}` : "Fórmula provisional: pendiente de validación con negocio."} focusable>
                      <ProvisionalIcon className="size-3.5 shrink-0 text-warning-ink" aria-label="Provisional" />
                    </Tooltip>
                  )}
                  <span title={p.full}>{p.title}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rSel = sel.has(r.raw);
              return (
                <tr
                  key={r.raw}
                  onClick={() => toggleValue(dimension, r.raw)}
                  className={cn("group cursor-pointer transition-opacity", sel.active && !rSel && "opacity-45")}
                  style={{ height: rowH }}
                >
                  <th scope="row" className={cn("sticky left-0 z-[1] border-b border-[var(--hairline)] bg-surface p-0 font-normal", rSel && "bg-primary-soft")}>
                    <button
                      type="button"
                      aria-pressed={rSel}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleValue(dimension, r.raw);
                      }}
                      onMouseEnter={(e) => officeTip(e.currentTarget, r)}
                      onFocus={(e) => officeTip(e.currentTarget, r)}
                      onMouseLeave={hide}
                      onBlur={hide}
                      className={cn(
                        "flex w-full items-center gap-2 px-2 text-left text-xs text-text transition group-hover:bg-surface-3",
                        rSel && "font-semibold text-primary-text shadow-[inset_2px_0_0_var(--primary)] group-hover:bg-primary-soft",
                      )}
                      style={{ height: rowH - 1 }}
                    >
                      {/* Hasta 2 líneas con fila de ≥ 30 px; compactada (28–29 px), una línea truncada */}
                      <span className={cn("min-w-0", twoLines ? "line-clamp-2" : "truncate")} style={{ lineHeight: "14px" }}>
                        {r.short}
                      </span>
                    </button>
                  </th>
                  {cols.map(({ p, j }) => {
                    const v = r.values[j];
                    const rank = r.ranks[j];
                    if (v === null)
                      return (
                        <td key={p.id} className="border-b border-[var(--hairline)] px-1 text-center text-xs text-muted" aria-label={`${p.title}: sin dato`}>
                          —
                        </td>
                      );
                    // 0 días: sin píldora (la vista promedia en 0 cuando no hay demora), el ojo va a las demoras reales
                    if (v <= 0)
                      return (
                        <td key={p.id} className="tabular border-b border-[var(--hairline)] px-1 pr-2 text-right text-xs text-muted" onMouseEnter={(e) => rowTip(e.currentTarget, r, j)} onMouseLeave={hide}>
                          {cellDays(0, p.format)}
                        </td>
                      );
                    const bg = seqColor(theme, p.max ? 0.12 + 0.88 * (v / p.max) : 0.12);
                    const ink = inkOn(bg);
                    const slow = r.slowest === j;
                    const badge = rank && rank <= TOP ? rankText(p, rank) : null;
                    return (
                      <td key={p.id} className="border-b border-[var(--hairline)] px-0.5 py-[3px]" onMouseEnter={(e) => rowTip(e.currentTarget, r, j)} onMouseLeave={hide}>
                        <span
                          className="tabular flex items-center justify-between gap-1 rounded-[5px] pl-1 pr-1.5"
                          style={{ height: pillH, background: bg, color: ink, boxShadow: slow ? "0 0 0 2px var(--primary)" : undefined }}
                          aria-label={`${p.title}: ${formatValue(v, p.format)}${rank ? `, rango ${rank}${p.tied.has(rank) ? " (empate)" : ""}` : ""}${slow ? ", fase más lenta de la oficina" : ""}`}
                        >
                          {badge ? (
                            <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-surface px-[3px] text-[10px] font-bold leading-none text-text-2" aria-hidden>
                              {badge}
                            </span>
                          ) : (
                            <span className="size-4 shrink-0" aria-hidden />
                          )}
                          <span className="whitespace-nowrap text-[13px] font-semibold">{cellDays(v, p.format)}</span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Filas ocultas: pie propio bajo la tabla (nunca encima de los datos ni dentro del desvanecido) */}
      {showFoot && (
        <div className="flex shrink-0 pt-1.5">
          <button
            type="button"
            onClick={overflow.below > 0 ? scrollDown : scrollTop}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-semibold text-text-2 transition hover:bg-surface-3"
          >
            {overflow.below > 0 ? (
              <>
                +{overflow.below} {overflow.below === 1 ? "oficina" : "oficinas"} · desplaza
                <ChevronDown className="size-3.5" aria-hidden />
              </>
            ) : (
              <>
                Volver al inicio
                <ChevronDown className="size-3.5 rotate-180" aria-hidden />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );

  // Móvil: una tarjeta por oficina, fases en paralelo (3 columnas; 2×2 con 4 fases)
  const cardGrid = dataCount === 3 ? "grid-cols-3" : dataCount === 1 ? "grid-cols-1" : "grid-cols-2";
  const cards = (
    <div className="flex flex-col">
      <ul role="list" aria-label={cell.title} className="grid gap-2">
        {cardRows.map((r) => {
          const rSel = sel.has(r.raw);
          return (
            <li
              key={r.raw}
              className={cn("rounded-xl border border-border px-2.5 pb-2.5 pt-2 transition-opacity", rSel && "border-primary bg-primary-soft", sel.active && !rSel && "opacity-45")}
            >
              <button
                type="button"
                aria-pressed={rSel}
                onClick={() => toggleValue(dimension, r.raw)}
                onFocus={(e) => officeTip(e.currentTarget, r)}
                onBlur={hide}
                className={cn("mb-1.5 block w-full rounded-md text-left text-[13px] font-semibold leading-snug transition hover:text-primary-text", rSel ? "text-primary-text" : "text-text")}
              >
                {r.short}
              </button>
              <div className={cn("grid items-end gap-x-1.5 gap-y-2", cardGrid)}>
                {cols.map(({ p, j }) => {
                  const v = r.values[j];
                  const rank = r.ranks[j];
                  const has = v !== null && v > 0;
                  const bg = has ? seqColor(theme, p.max ? 0.12 + 0.88 * (v / p.max) : 0.12) : undefined;
                  const slow = has && r.slowest === j;
                  const badge = has && rank && rank <= TOP ? rankText(p, rank) : null;
                  const label =
                    v === null
                      ? `${p.title}: sin dato`
                      : `${p.title}: ${formatValue(v, p.format)}${badge && rank ? `, rango ${rank}${p.tied.has(rank) ? " (empate)" : ""}` : ""}${slow ? ", fase más lenta de la oficina" : ""}`;
                  return (
                    <div key={p.id} className="flex min-w-0 flex-col gap-1" onMouseEnter={(e) => rowTip(e.currentTarget, r, j)} onMouseLeave={hide}>
                      <span aria-hidden className="flex min-w-0 items-start gap-1 text-[10.5px] font-semibold leading-[13px] text-muted">
                        <span className="min-w-0">{p.title}</span>
                        {p.provisional && <ProvisionalIcon className="size-3 shrink-0 text-warning-ink" aria-hidden />}
                      </span>
                      <span
                        role="img"
                        aria-label={label}
                        className={cn("tabular flex h-7 items-center justify-between gap-1 rounded-[5px] pl-1 pr-1.5", !has && "bg-surface-2 text-muted")}
                        style={has && bg ? { background: bg, color: inkOn(bg), boxShadow: slow ? "0 0 0 2px var(--primary)" : undefined } : undefined}
                      >
                        {badge ? (
                          <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-surface px-[3px] text-[10px] font-bold leading-none text-text-2" aria-hidden>
                            {badge}
                          </span>
                        ) : (
                          <span className="size-4 shrink-0" aria-hidden />
                        )}
                        <span className={cn("whitespace-nowrap text-[13px]", has ? "font-semibold" : "font-normal")}>{v === null ? "—" : cellDays(has ? v : 0, p.format)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
      {canLimit && (
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-2 text-xs text-muted">
          <span className="tabular">
            {formatInt(cardRows.length)} de {formatInt(rows.length)} oficinas
          </span>
          <MoreButton onClick={() => setShowAll((v) => !v)} expanded={!limited}>
            {limited ? `Ver ${formatInt(hiddenCards)} ${hiddenCards === 1 ? "oficina" : "oficinas"} más` : "Ver menos"}
          </MoreButton>
        </div>
      )}
    </div>
  );

  const matrix = (
    <div className="flex min-h-0 min-w-0 flex-col gap-2">
      {compact ? cards : table}
      {/* Leyenda bajo la grilla (legendSystem L2) */}
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-text-2">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-10 rounded-full" style={{ background: `linear-gradient(90deg, ${seqColor(theme, 0.12)}, ${seqColor(theme, 0.56)}, ${seqColor(theme, 1)})` }} />
          {/* En oscuro la rampa va de oscuro a claro: se dice explícito (legendSystem L8) */}
          Escala por fase{theme.mode === "dark" && " · más claro = más"}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="grid size-4 place-items-center rounded-full bg-surface-3 text-[10px] font-bold text-text-2">1</span>
          Rango en la fase
          {anyTie && (
            <>
              <span aria-hidden className="ml-1 grid h-4 min-w-4 place-items-center rounded-full bg-surface-3 px-[3px] text-[10px] font-bold text-text-2">=5</span>
              empate
            </>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-4 rounded-[3px]" style={{ boxShadow: "inset 0 0 0 2px var(--primary)" }} />
          Fase más lenta
        </span>
      </div>
    </div>
  );

  const callouts = (
    <ul role="list" aria-label="Oficina más lenta por fase" className={cn("grid min-h-0 gap-2", side ? "grid-rows-4" : layout === "row" ? "shrink-0 grid-cols-4" : "grid-cols-1")}>
      {phases.map((p) => {
        const top = p.ranked[0];
        const d = top ? displayLabel(top.label, kind) : null;
        const rSel = top ? sel.has(top.label) : false;
        const times = top ? timesMedian(top.value, p.median) : null;
        const flask = p.provisional && <ProvisionalIcon className="size-3 shrink-0 text-warning-ink" aria-label="Provisional" />;
        return (
          <li key={p.id} className={layout === "row" ? "min-h-[84px]" : "min-h-[90px]"}>
            {top && d ? (
              <button
                type="button"
                aria-pressed={rSel}
                title={d.full}
                onClick={() => toggleValue(dimension, top.label)}
                className={cn(
                  "flex h-full w-full flex-col justify-between gap-1 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left transition hover:bg-surface-3",
                  rSel && "border-primary bg-primary-soft",
                  sel.active && !rSel && "opacity-45",
                )}
              >
                <span className="flex items-start gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">
                  <span className="min-w-0 leading-tight">{p.title}</span>
                  {flask}
                </span>
                <span className={cn("flex justify-between gap-x-3 gap-y-1", layout === "row" ? "flex-col" : "items-end")}>
                  <span className={cn("line-clamp-3 min-w-0 font-semibold leading-snug text-text", layout === "row" ? "text-xs" : "text-[13px]")}>{d.short}</span>
                  <span className={cn("flex shrink-0 flex-col", layout === "row" ? "items-start" : "items-end")}>
                    <span className={cn("tabular whitespace-nowrap font-bold leading-none text-text", layout === "row" ? "text-xl" : "text-[28px]")}>
                      {p.format === "days" ? nf1.format(top.value) : formatValue(top.value, p.format)}
                      {p.format === "days" && <span className="ml-1 text-xs font-semibold text-muted">días</span>}
                    </span>
                    {times && (
                      <span className="tabular mt-1 whitespace-nowrap text-[11px] text-muted">
                        <span aria-hidden>{times}</span>
                        <span className="sr-only">{times.replace("×", " veces")}</span>
                      </span>
                    )}
                  </span>
                </span>
              </button>
            ) : (
              <div className="flex h-full flex-col justify-between rounded-xl border border-dashed border-border px-3 py-2.5">
                <span className="flex items-start gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">
                  <span className="min-w-0 leading-tight">{p.title}</span>
                  {flask}
                </span>
                <span className="text-xs text-muted">Sin datos en el periodo</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div
      ref={ref}
      className={cn("h-full min-h-0", side ? "grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-5" : layout === "row" ? "flex flex-col gap-3" : "flex flex-col gap-4")}
      role="group"
      aria-label={cell.title}
    >
      {matrix}
      {callouts}
      <ChartTooltip state={state} />
    </div>
  );
}
