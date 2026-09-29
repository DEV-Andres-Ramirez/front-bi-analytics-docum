"use client";

import { ArrowDown, ChevronRight, Snail } from "lucide-react";
import { Fragment, useCallback, useState, type ReactNode } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { Tooltip } from "@/components/ui/tooltip";
import { useMergedRef, usePageWide } from "@/components/widgets/category-tiles";
import { DeltaChip } from "@/components/widgets/kit/delta-chip";
import { StatusIcon } from "@/components/widgets/kit/status-icon";
import type { CategoryResult, DashboardResponse, KpiResult, Range } from "@/dashboards/dto";
import { innerWidth } from "@/dashboards/layout";
import type { KpiCellDef, KpiDef, StatusTone, WidgetDef } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { cn } from "@/lib/cn";
import { TONE_VARS } from "@/lib/charts/semantic";
import { describeDelta, formatInt, formatPct, formatValue } from "@/lib/format";
import { EmbedBar, EmbedMenu } from "./kpi-embed";
import {
  additiveMeasure,
  AnimatedFigure,
  chipWidth,
  figureWidth,
  FigureSkeleton,
  goToAnchor,
  KpiCardShell,
  KpiMicro,
  lowerFirst,
  microKind,
  PROVISIONAL_W,
  ProvisionalBadge,
  ProvisionalIcon,
  resampleSpark,
  sparkWeights,
  textWidth,
  weekCount,
} from "./shared";

type GroupDef = Extract<KpiCellDef, { kind: "group" }>;

/** Ancho mínimo por métrica (kpiRedesign §3): 112 para %, días o enteros cortos; 150 para COP o cifras largas. */
function minWidth(def: KpiDef, value: number | null | undefined): number {
  if (def.format === "cop") return 150;
  if ((def.format === "int" || def.format === "compact") && formatValue(value ?? 0, def.format).length > 6) return 150;
  return 112;
}

/** Separación entre filas/columnas del respaldo en rejilla. */
const GAP = 12;
/**
 * Fila en línea por contenido: aunque la suma de mínimos (112/150) no quepa, la fila se mantiene si cada
 * celda mide al menos ROW_CELL_FLOOR y etiqueta, cifra y chip caben (p. ej. el stepper de PQRD a 1366–1440 px,
 * 4 × 99–108 px, o "Riesgo" de SMART 3 a 1024–1280). Solo con filas de alto fijo (página ≥ 600 px); en móvil
 * manda el respaldo por contenido.
 */
const ROW_CELL_FLOOR = 96;
/** Divisor hairline entre celdas en línea (mx-[5.5px] + 1 px) y chevron del stepper (16 + mx-1). */
const DIVIDER_W = 12;
const CHEVRON_W = 24;
/** Ícono de tono o número de paso junto a la etiqueta (14 + gap 4) e ícono de "Provisional" (último recurso). */
const ICON_W = 18;
const FLASK_W = 18;
/** Etiqueta "Más lenta" del stepper (caracol 12 + gap 4 + texto de 10,5 px + padding 12). */
const SLOW_W = 82;
/** Micro-tendencias semanales con tan pocas semanas que 4–6 columnas se leen como bloques: línea para todas. */
const FEW_WEEKS = 6;

/** Ancho de la etiqueta corta (12,5 px medium) + ícono. */
function labelWidth(def: KpiDef, icon: boolean): number {
  return textWidth(def.short ?? def.label, 12.5) + (icon ? ICON_W : 0);
}

/** Palabra más larga de la etiqueta corta (no se parte: si no cabe, la celda la recorta). */
function longestWord(def: KpiDef, icon: boolean): number {
  const words = (def.short ?? def.label).split(/\s+/).filter(Boolean);
  return Math.max(0, ...words.map((w) => textWidth(w, 12.5))) + (icon ? ICON_W : 0);
}

/**
 * Dónde va el badge "Provisional" (kpiRedesign §5: visible, con la fórmula en el tooltip):
 * label (junto a la etiqueta) · chip (bajo la cifra, junto al DeltaChip) · below (línea propia bajo el chip, solo con
 * alto por contenido) · icon (ícono ƒ con tooltip: último recurso en filas de alto fijo sin espacio).
 */
type ProvPlace = "label" | "chip" | "below" | "icon";

interface Metric {
  def: KpiDef;
  result?: KpiResult;
  /** Después del divisor (stepper). */
  after?: boolean;
  tone?: StatusTone;
  filter?: { field: string; value: string } | null;
  anchor?: string;
}

/**
 * ¿Alguna etiqueta de celda ocupa 2 líneas? Se mide en el DOM (alto real del texto con line-clamp-2) en vez de
 * estimarlo: la estimación con holgura partía etiquetas que sí caben ("Valor promedio" a 390 px) y reservaba una
 * segunda línea vacía entre la etiqueta y la cifra. null hasta la primera medición (se usa la estimación).
 */
function useLabelWrap() {
  const [wrapped, setWrapped] = useState<boolean | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(() => {
      let any = false;
      el.querySelectorAll<HTMLElement>("[data-kpi-label]").forEach((s) => {
        ro.observe(s);
        if (s.getBoundingClientRect().height > 20) any = true;
      });
      setWrapped(any);
    });
    ro.observe(el);
    el.querySelectorAll<HTMLElement>("[data-kpi-label]").forEach((s) => ro.observe(s));
    return () => ro.disconnect();
  }, []);
  return { ref, wrapped };
}

/** ¿`sec` cuenta las mismas filas que el numerador de la tasa `def` (sobre el total)? "419 en trámite" ↔ "% En trámite". */
function countOfRatio(sec: KpiDef, def: KpiDef): boolean {
  const s = sec.measure;
  const d = def.measure;
  return s.kind === "count" && d.kind === "ratio" && !d.den && (sec.dateField ?? "") === (def.dateField ?? "") && JSON.stringify(s.where ?? null) === JSON.stringify(d.num);
}

/**
 * Base de una proporción cuyas partes suman el 100 % de un denominador ("% de notificables"): la suma de las partes
 * en el widget de categoría del mismo campo. Se verifica que cada parte / base reproduzca su tasa; si no (widget con
 * otro filtro, categorías plegadas en "Otros", filtro activo sobre el campo), no hay base.
 */
function proportionBase(metrics: Metric[], widgets: WidgetDef[], data: DashboardResponse | undefined, eq: Record<string, string[]>): number | null {
  const field = metrics[0]?.filter?.field;
  if (!field || !data || eq[field]?.length) return null;
  if (metrics.some((m) => m.filter?.field !== field || m.def.format !== "pct" || m.result?.value === null || m.result?.value === undefined)) return null;
  const shares = metrics.map((m) => m.result?.value ?? 0);
  if (Math.abs(shares.reduce((a, b) => a + b, 0) - 1) > 0.005) return null;
  for (const w of widgets) {
    if (!("dimension" in w) || w.dimension !== field) continue;
    const r = data.widgets[w.id];
    if (r?.kind !== "category") continue;
    const counts = metrics.map((m) => {
      const i = r.labels.indexOf(m.filter!.value);
      return i < 0 ? null : (r.values[i] ?? 0);
    });
    if (counts.some((c) => c === null)) continue;
    const base = counts.reduce<number>((a, c) => a + (c ?? 0), 0);
    if (base > 0 && counts.every((c, i) => Math.abs((c ?? 0) / base - shares[i]) < 0.002)) return base;
  }
  return null;
}

/**
 * KpiGroup: varias métricas relacionadas en una sola tarjeta, separadas por hairlines.
 * list · proportion (barra 100 % con clic por parte) · stepper (fases con chevrons, la más lenta con anillo)
 * alerts (la peor variación desfavorable en critical-soft) · pair · embed (widget de categoría como barra).
 * Si las métricas no caben en una línea (ancho medido), pasa a 2 columnas sin micro-tendencias.
 */
export function KpiGroup({
  cell,
  defs,
  results,
  range,
  loading,
  index,
  span,
  compact,
}: {
  cell: GroupDef;
  defs: Map<string, KpiDef>;
  results: Map<string, KpiResult>;
  range?: Range;
  loading: boolean;
  index: number;
  span: number;
  compact?: boolean;
}) {
  const { data, filters, toggleValue, spec } = useDashboard();
  const { ref: sizeRef, width, measured } = useElementSize<HTMLDivElement>();
  const { ref: pageRef, wide: pageWide } = usePageWide();
  const { ref: wrapRef, wrapped } = useLabelWrap();
  const measureRef = useMergedRef(sizeRef, pageRef);
  const ref = useMergedRef(measureRef, wrapRef);

  const metrics: Metric[] = [];
  cell.kpis.forEach((id, i) => {
    const def = defs.get(id);
    if (!def) return;
    metrics.push({ def, result: results.get(id), tone: cell.tones?.[i] ?? cell.accents?.[id], filter: cell.filters?.[i] ?? null, anchor: cell.anchors?.[id] });
  });
  (cell.after ?? []).forEach((id) => {
    const def = defs.get(id);
    if (def) metrics.push({ def, result: results.get(id), after: true, tone: cell.accents?.[id], anchor: cell.anchors?.[id] });
  });
  const secondary = cell.secondary ? defs.get(cell.secondary) : undefined;
  const secondaryResult = cell.secondary ? results.get(cell.secondary) : undefined;
  // La secundaria que cuenta lo mismo que una de las partes va bajo esa parte ("419 tutelas" bajo "En trámite"),
  // no suelta bajo la barra (se leía como dato del primer segmento)
  const secondaryIdx = secondary ? metrics.findIndex((m) => countOfRatio(secondary, m.def)) : -1;

  // Resaltados
  const stepper = cell.variant === "stepper";
  let slowest = -1;
  if (stepper) {
    let max = -Infinity;
    metrics.forEach((m, i) => {
      const v = m.result?.value;
      if (!m.after && v !== null && v !== undefined && v > max) {
        max = v;
        slowest = i;
      }
    });
  }
  let worst = -1;
  if (cell.variant === "alerts" && !loading) {
    let mag = 0;
    metrics.forEach((m, i) => {
      const d = describeDelta(m.result?.value, m.result?.previous, m.def.format, m.def.polarity);
      if (d.tone === "bad" && Math.abs(d.magnitude) > mag) {
        mag = Math.abs(d.magnitude);
        worst = i;
      }
    });
  }

  // ── Disposición (ancho medido; antes de medir, el ancho de diseño del span) ──
  // row: celdas en línea separadas por hairlines (o chevrons) · grid: 2 columnas sin micro-tendencias.
  // Con 3 métricas que no caben con micro-tendencia se prefiere la fila de 3 (sin micro, etiquetas en
  // 2 líneas si hace falta) antes que un 2×2 con un cuadrante vacío, siempre que la palabra más larga de cada
  // etiqueta quepa en la celda ("Departamentos" en 96 px se recortaba); si no, 2 columnas y la tercera ocupa la
  // fila completa en horizontal.
  const available = measured ? width : innerWidth(span);
  const n = metrics.length;
  const hasIcon = (m: Metric) => Boolean(m.tone) || (stepper && !m.after);
  const sepW = (m: Metric, i: number) => (i === 0 ? 0 : stepper && !m.after ? CHEVRON_W : DIVIDER_W);
  const gaps = metrics.reduce((a, m, i) => a + sepW(m, i), 0);
  const rowCell = n ? (available - gaps) / n : available;
  // "Provisional": con texto junto a la etiqueta si cabe; si no, junto al chip (bajo la cifra)
  const provText = (m: Metric, w: number) => Boolean(m.def.provisional) && labelWidth(m.def, hasIcon(m)) + 6 + PROVISIONAL_W <= w;
  const provChip = (m: Metric, w: number) => !compact && chipWidth(m.def, m.result, false) + 6 + PROVISIONAL_W <= w;
  // Para decidir la fila en línea (alto fijo): si el badge no va junto a la etiqueta ni junto al chip, queda el ícono
  const labelNeed = (m: Metric, w: number) => labelWidth(m.def, hasIcon(m)) + (m.def.provisional ? (provText(m, w) ? 6 + PROVISIONAL_W : provChip(m, w) ? 0 : FLASK_W) : 0);
  const labelsFit = (w: number) => metrics.every((m) => labelNeed(m, w) <= w);
  const wordsFit = (w: number) => metrics.every((m) => longestWord(m.def, hasIcon(m)) <= w);
  const figurePx = compact ? 24 : 26;
  // El chip cuenta sin la nota "base pequeña" (si no cabe se oculta: el borde punteado y el tooltip la conservan)
  const fitsFigures = (w: number, px: number) => metrics.every((m) => figureWidth(m.result?.value, m.def.format, px) <= w && (compact || chipWidth(m.def, m.result, false) <= w));
  const need = metrics.reduce((a, m) => a + minWidth(m.def, m.result?.value), 0) + gaps;
  const contentFits = pageWide && rowCell >= ROW_CELL_FLOOR && fitsFigures(rowCell, figurePx);

  const inline = n <= 1 || ((need <= available || contentFits) && labelsFit(rowCell));
  const tightRow = !inline && n === 3 && wordsFit(rowCell) && (fitsFigures(rowCell, figurePx) || fitsFigures(rowCell, 22));
  const row = inline || tightRow;
  const gridCell = (available - GAP) / 2 - 12;
  const cellW = row ? rowCell : gridCell;
  const oddLast = !row && n % 2 === 1;
  const widthAt = (i: number) => (oddLast && i === n - 1 ? available / 2 : cellW);
  const provPlace = (m: Metric, i: number): ProvPlace | null => {
    if (!m.def.provisional) return null;
    const w = widthAt(i);
    if (provText(m, w)) return "label";
    if (oddLast && i === n - 1) return "icon";
    if (provChip(m, w)) return "chip";
    // Línea propia bajo el chip: con alto por contenido (sin fila en línea de alto fijo o en móvil)
    return !inline || !pageWide ? "below" : "icon";
  };
  const places = metrics.map((m, i) => provPlace(m, i));
  // Etiquetas en 2 líneas (todas, para que las cifras compartan línea base) si alguna ocupa 2: medido en el DOM;
  // antes de medir, la estimación
  const estimateTwo = metrics.some((m, i) => labelWidth(m.def, hasIcon(m)) + (places[i] === "label" ? 6 + PROVISIONAL_W : places[i] === "icon" ? FLASK_W : 0) > cellW && !(oddLast && i === n - 1));
  const twoLine = !inline && (wrapped ?? estimateTwo);
  // Cifra de 22 px solo si a 26 no cabe (fila de 3 en móvil)
  const dense = tightRow && !fitsFigures(rowCell, figurePx);
  const bar = cell.variant === "proportion" || Boolean(cell.embed);
  const showMicro = inline && !compact && !bar;
  // Fila compacta: el chip va junto a la cifra si cabe en TODAS las celdas; si no, debajo en todas.
  // data-chip-stack / data-two-line los lee la fila (group/kpirow) para que los grupos vecinos coincidan.
  const stackChip = Boolean(compact) && metrics.some((m, i) => figureWidth(m.result?.value, m.def.format, 24) + 8 + chipWidth(m.def, m.result) > (oddLast && i === n - 1 ? available : cellW));
  const gauges = new Set(cell.gauges ?? []);
  const isGauge = (m: Metric) => gauges.has(m.def.id) && m.def.format === "pct";
  // Micro-tendencias del grupo en el mismo bucket: si una pasa a semanal (huecos, ceros, lotes, días de base
  // chica), todas también; nunca columnas diarias junto a columnas semanales. Solo si TODAS se pueden llevar a
  // semanas: aditivas (conteo, suma) o tasas con base conocida. Un conteo distinto ("Departamentos") o un promedio
  // en columnas no se remuestrean (el diario no suma el semanal): forzado a semanal quedaba en blanco y el grupo
  // perdía su micro. Entonces el grupo no fuerza la semana y cada micro decide su bucket (la tasa con huecos pasa
  // sola a semanal; las columnas del conteo distinto siguen diarias).
  const weightsOf = (m: Metric) => (additiveMeasure(m.def) ? undefined : sparkWeights(m.def, m.result, spec.kpis, data?.kpis));
  const trends = metrics.filter((m) => !isGauge(m) && !m.anchor && m.result);
  const canWeekly = (m: Metric) => additiveMeasure(m.def) || (microKind(m.def) === "line" && Boolean(weightsOf(m)?.length));
  const weekly =
    showMicro &&
    !loading &&
    trends.every(canWeekly) &&
    trends.some((m) => resampleSpark(m.result!.spark, microKind(m.def), range, { additive: additiveMeasure(m.def), weights: weightsOf(m) }).weekly);
  // Con pocas semanas, 4–6 columnas de 20 px se leen como bloques de skeleton junto a las líneas: una sola gramática
  const microLine = weekly && weekCount(range) <= FEW_WEEKS;
  // "Más lenta" junto al chip si cabe; si no, sobre el borde inferior del anillo
  const slowAt = (i: number): "chip" | "notch" =>
    !compact && places[i] !== "chip" && chipWidth(metrics[i].def, metrics[i].result, false) + 6 + SLOW_W <= widthAt(i) ? "chip" : "notch";
  // Nota "base pequeña" junto al chip solo si cabe en TODAS las celdas que la llevan (compacta: junto a la cifra o
  // debajo); si no, ninguna la muestra (misma gramática en el grupo; el chip punteado y su tooltip la conservan)
  const chipRoom = (m: Metric, i: number) => {
    const w = oddLast && i === n - 1 ? available / 2 : cellW;
    const room = compact && !stackChip ? w - figureWidth(m.result?.value, m.def.format, 24) - 8 : w;
    return room - (places[i] === "chip" ? 6 + PROVISIONAL_W : 0) - (i === slowest && slowAt(i) === "chip" ? 6 + SLOW_W : 0);
  };
  const hideNotes = metrics.some((m, i) => chipWidth(m.def, m.result) !== chipWidth(m.def, m.result, false) && chipWidth(m.def, m.result) > chipRoom(m, i));

  const selectedOf = (f: Metric["filter"]) => Boolean(f && filters.eq[f.field]?.includes(f.value));
  const anySelected = cell.variant === "proportion" && metrics.some((m) => selectedOf(m.filter));
  const allWidgets = spec.sections.flatMap((s) => s.widgets);
  const embedResult = cell.embed ? data?.widgets[cell.embed] : undefined;
  const embedWidget = cell.embed ? allWidgets.find((w) => w.id === cell.embed) : undefined;

  // Proporción sin secundaria: la base del % ("Base: 636 notificables de 871 salidas") llena la franja bajo la barra
  const base = cell.variant === "proportion" && !secondary && !loading ? proportionBase(metrics, allWidgets, data, filters.eq) : null;
  const totalDef = base !== null ? spec.kpis.find((k) => k.measure.kind === "count" && !k.measure.where && (k.dateField ?? "") === (metrics[0].def.dateField ?? "")) : undefined;
  const totalValue = totalDef ? results.get(totalDef.id)?.value : undefined;
  const baseNoun = cell.title.match(/%\s*de\s+(.+)$/i)?.[1] ?? metrics[0]?.def.label.match(/\sde\s+(\S+)$/i)?.[1];
  const unit = spec.unit?.plural;

  // Bajo su parte: "419 tutelas" (la columna ya dice "En trámite"); suelta bajo la barra: "419 en trámite"
  const secondaryLine = (inCell: boolean) =>
    secondary && secondaryResult ? (
      <span title={`${secondary.label}: ${formatValue(secondaryResult.value ?? null, secondary.format)}`}>
        <span className="tabular font-semibold text-text">{formatValue(secondaryResult.value ?? null, secondary.format)}</span>{" "}
        {inCell && unit && secondary.measure.kind === "count" ? unit : lowerFirst(secondary.label)}
      </span>
    ) : null;

  return (
    <KpiCardShell index={index} label={cell.title}>
      <div className="mb-2 flex min-h-4 min-w-0 items-start justify-between gap-2">
        <h3 title={cell.title} className="line-clamp-2 min-w-0 text-[11px] font-bold uppercase leading-4 tracking-[0.12em] text-muted">
          {cell.title}
        </h3>
        {embedWidget && <EmbedMenu widget={embedWidget} result={embedResult} />}
      </div>

      <div
        ref={ref}
        data-chip-stack={stackChip ? "" : undefined}
        data-two-line={twoLine ? "" : undefined}
        className={cn("min-w-0", row ? "flex items-stretch" : "grid grid-cols-2 gap-y-3", showMicro && "flex-1")}
      >
        {metrics.map((m, i) => {
          const sep =
            row && i > 0 ? (
              stepper && !m.after ? (
                <ChevronRight aria-hidden className="relative z-10 mx-1 mt-[30px] size-4 shrink-0 self-start text-muted" strokeWidth={2.25} />
              ) : (
                <span aria-hidden className={cn("mx-[5.5px] w-px shrink-0 self-stretch", m.after ? "bg-border-strong" : "bg-[var(--hairline)]")} />
              )
            ) : null;
          const wideLast = oddLast && i === n - 1;
          const gridCls = !row && cn(wideLast ? "col-span-2" : i % 2 === 0 ? "pr-3" : "border-l border-[var(--hairline)] pl-3", i >= 2 && "border-t border-[var(--hairline)] pt-3");
          const slot: GridSlot | undefined = row ? undefined : { col: wideLast ? "full" : i % 2 === 0 ? "left" : "right", below: i >= 2 };
          return (
            <Fragment key={m.def.id}>
              {sep}
              <MetricCell
                m={m}
                step={stepper && !m.after ? metrics.filter((x) => !x.after).indexOf(m) + 1 : undefined}
                slow={i === slowest ? slowAt(i) : undefined}
                alert={i === worst}
                compact={compact}
                loading={loading}
                range={range}
                micro={showMicro}
                weekly={weekly}
                microLine={microLine}
                gauge={showMicro && isGauge(m)}
                hideNote={hideNotes}
                wrap={!inline && !wideLast}
                twoLine={twoLine && !wideLast}
                dense={dense}
                stackChip={stackChip}
                horizontal={wideLast}
                prov={places[i]}
                sub={i === secondaryIdx ? secondaryLine(true) : undefined}
                selected={selectedOf(m.filter)}
                dimmed={anySelected && !selectedOf(m.filter)}
                onFilter={m.filter ? () => toggleValue(m.filter!.field, m.filter!.value) : undefined}
                slot={slot}
                fill={showMicro}
                className={cn(row && "flex-1 basis-0", gridCls)}
              />
            </Fragment>
          );
        })}
      </div>

      {cell.variant === "proportion" && (
        <ProportionBar metrics={metrics} loading={loading} selectedOf={selectedOf} anySelected={anySelected} onFilter={(f) => toggleValue(f.field, f.value)} />
      )}
      {cell.variant === "proportion" && secondary && secondaryIdx < 0 && (
        <p className="mt-1.5 h-4 truncate text-xs leading-4 text-muted">{loading ? <FigureSkeleton className="h-3 w-24" /> : secondaryLine(false)}</p>
      )}
      {base !== null && (
        <p className="mt-2 truncate text-xs leading-4 text-muted">
          Base: <span className="tabular font-semibold text-text-2">{formatInt(base)}</span>
          {baseNoun ? ` ${lowerFirst(baseNoun)}` : ""}
          {totalValue !== null && totalValue !== undefined && totalValue >= base && (
            <>
              {" "}
              de <span className="tabular">{formatInt(totalValue)}</span>
              {unit ? ` ${unit}` : ""}
            </>
          )}
        </p>
      )}
      {embedWidget && <EmbedBar widget={embedWidget} result={embedResult as CategoryResult | undefined} order={metrics.map((m) => m.def.short ?? m.def.label)} />}
    </KpiCardShell>
  );
}

/** "Más lenta" (stepper): etiqueta visible con el caracol, en el tono warning del anillo (como "Mayor acumulación"). */
function SlowTag({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      title="Fase con más días promedio"
      className={cn("inline-flex h-4 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-warning-soft px-1.5 text-[10.5px] font-semibold leading-none text-warning-ink", className)}
    >
      <Snail className="size-3" aria-hidden />
      Más lenta
    </span>
  );
}

/** Celda en el respaldo de 2 columnas: columna (o fila completa) y si va bajo la hairline horizontal. */
interface GridSlot {
  col: "left" | "right" | "full";
  below: boolean;
}

/**
 * Posición de las capas de énfasis (alerta, selección, anillo de la fase más lenta): 6 px alrededor del contenido.
 * En fila, 6 px hacia afuera por cada lado (el divisor está a 6 px). En la rejilla 2×2 se queda en su cuadrante:
 * hacia adentro del lado de la hairline (pr-3/pl-3/pt-3 = 12 px → 6 px de relleno y 6 px libres hasta la línea) y
 * hacia afuera del lado del borde de la tarjeta o del hueco entre filas; nunca tapa ni cruza un divisor.
 */
function emphasisInset(slot: GridSlot | undefined, x: "1" | "1.5" = "1.5"): string {
  const out = x === "1" ? { l: "-left-1", r: "-right-1", both: "-inset-x-1" } : { l: "-left-1.5", r: "-right-1.5", both: "-inset-x-1.5" };
  if (!slot) return cn(out.both, "-inset-y-1.5");
  const h = slot.col === "left" ? cn(out.l, "right-1.5") : slot.col === "right" ? cn("left-1.5", out.r) : out.both;
  return cn(h, slot.below ? "top-1.5" : "-top-1.5", "-bottom-1.5");
}

function MetricCell({
  m,
  step,
  slow,
  alert,
  compact,
  loading,
  range,
  micro,
  weekly,
  microLine,
  gauge,
  hideNote,
  wrap,
  twoLine,
  dense,
  stackChip,
  horizontal,
  prov,
  sub,
  selected,
  dimmed,
  onFilter,
  slot,
  fill,
  className,
}: {
  m: Metric;
  step?: number;
  /** Fase más lenta del stepper: anillo + "Más lenta" junto al chip o sobre el borde del anillo. */
  slow?: "chip" | "notch";
  alert: boolean;
  compact?: boolean;
  loading: boolean;
  range?: Range;
  micro: boolean;
  /** Micro-tendencia semanal (decidido para todo el grupo). */
  weekly: boolean;
  /** Micro-tendencia en línea también para las aditivas (grupo semanal con pocas semanas). */
  microLine: boolean;
  /** Medidor 0–100 % en lugar de la micro-tendencia (cell.gauges). */
  gauge: boolean;
  /** Oculta la nota "base pequeña" junto al chip (no cabe; el chip punteado y su tooltip la conservan). */
  hideNote: boolean;
  /** La etiqueta puede partir en 2 líneas (fila angosta o rejilla); se mide para decidir twoLine. */
  wrap: boolean;
  twoLine?: boolean;
  /** Cifra de 22 px (fila de 3 angosta). */
  dense?: boolean;
  /** Fila compacta: chip bajo la cifra (decidido para toda la fila). */
  stackChip?: boolean;
  /** Celda impar final del respaldo 2 columnas: etiqueta a la izquierda, cifra y chip a la derecha. */
  horizontal?: boolean;
  prov: ProvPlace | null;
  /** Sublínea bajo el chip (secundaria de la proporción que corresponde a esta parte). */
  sub?: ReactNode;
  selected: boolean;
  dimmed: boolean;
  onFilter?: () => void;
  /** Posición en el respaldo de 2 columnas (undefined en fila). */
  slot?: GridSlot;
  /** La micro-tendencia llena el alto libre de la tarjeta (mismo alto en todas las celdas del grupo). */
  fill?: boolean;
  className?: string;
}) {
  const { def, result, tone, anchor } = m;
  const short = def.short ?? def.label;
  // Sin espacio para el badge: ícono ƒ dentro del flujo de la etiqueta (baja con ella a la 2.ª línea en vez de
  // recortar una palabra sola como "Devolucione…"); la fórmula va en el tooltip de la etiqueta
  const icon = prov === "icon";
  const badge = prov === "chip" || prov === "below" ? <ProvisionalBadge def={def} small /> : null;
  const ring = slow !== undefined;
  const tip = (
    <span>
      <strong>{def.label}</strong>
      {icon && <> · fórmula provisional, pendiente de validación con negocio</>}
      <br />
      {def.hint}
    </span>
  );
  const labelInner = (
    <>
      {step !== undefined && (
        <span aria-hidden className="tabular grid size-3.5 shrink-0 place-items-center rounded-full bg-surface-3 text-[9px] font-bold text-text-2">
          {step}
        </span>
      )}
      {tone && <StatusIcon tone={tone} className="size-3.5" />}
      <span data-kpi-label={wrap ? "" : undefined} className={cn("min-w-0", wrap ? "line-clamp-2" : "truncate")}>
        {short}
        {icon && (
          <>
            {" "}
            <ProvisionalIcon className="inline size-3.5 align-[-2px] text-warning-ink" aria-hidden />
            <span className="sr-only">(fórmula provisional)</span>
          </>
        )}
      </span>
    </>
  );
  const chip = (
    <DeltaChip value={result?.value} previous={result?.previous} format={def.format} polarity={def.polarity} prevRange={range} className={cn(hideNote && "[&>.truncate]:hidden")} />
  );
  const figure = (px: string) => <AnimatedFigure value={result?.value} format={def.format} className={cn(px, "font-bold leading-none tracking-tight text-text")} />;

  const label = (
    <div
      className={cn(
        "flex min-w-0 gap-1 text-[12.5px] font-medium leading-4 text-text-2",
        horizontal ? "min-h-4 flex-1 items-center" : twoLine ? "h-8 items-start" : "h-4 items-center @min-[600px]/page:group-has-[[data-two-line]]/kpirow:h-8 @min-[600px]/page:group-has-[[data-two-line]]/kpirow:items-start",
      )}
    >
      {onFilter ? (
        <button
          type="button"
          onClick={onFilter}
          aria-pressed={selected}
          title={`${def.label}${icon ? " (fórmula provisional)" : ""} · clic para filtrar`}
          className={cn("-mx-1 inline-flex min-w-0 gap-1 rounded px-1 text-left hover:bg-surface-3", twoLine ? "items-start" : "items-center")}
        >
          {labelInner}
        </button>
      ) : (
        <Tooltip content={tip} focusable className={cn("min-w-0 gap-1 rounded", twoLine ? "items-start" : "items-center")}>
          {labelInner}
        </Tooltip>
      )}
      {prov === "label" && <ProvisionalBadge def={def} small />}
      {ring && <span className="sr-only">(fase más lenta)</span>}
      {alert && <span className="sr-only">(mayor variación desfavorable)</span>}
    </div>
  );

  return (
    <div className={cn("relative min-w-0 transition-opacity", fill && !horizontal && "flex flex-col", dimmed && "opacity-45", className)}>
      {/* Capas de énfasis (no mueven la línea base; en la rejilla, dentro de su cuadrante) */}
      {alert && <span aria-hidden className={cn("absolute rounded-xl bg-critical-soft", emphasisInset(slot))} />}
      {ring && <span aria-hidden className={cn("absolute rounded-xl ring-2 ring-warning", emphasisInset(slot, "1"))} />}
      {slow === "notch" && !loading && <SlowTag className="absolute -bottom-3.5 left-1/2 z-10 -translate-x-1/2" />}
      {selected && <span aria-hidden className={cn("absolute rounded-xl bg-primary-soft ring-1 ring-primary", emphasisInset(slot))} />}
      {horizontal ? (
        <div className="relative flex min-w-0 items-center gap-3">
          {label}
          {loading ? (
            <FigureSkeleton className="h-6 w-24" />
          ) : (
            <div className="flex shrink-0 items-baseline gap-2">
              {figure(compact ? "text-2xl" : "text-[26px]")}
              {chip}
            </div>
          )}
        </div>
      ) : (
        <div className={cn("relative", fill && "flex flex-1 flex-col")}>
          {label}
          {compact ? (
            <>
              <div
                className={cn(
                  "mt-1 flex min-h-7 gap-x-2 gap-y-1",
                  stackChip ? "flex-col items-start" : "items-baseline @min-[600px]/page:group-has-[[data-chip-stack]]/kpirow:flex-col @min-[600px]/page:group-has-[[data-chip-stack]]/kpirow:items-start",
                )}
              >
                {loading ? (
                  <FigureSkeleton className="h-6 w-16" />
                ) : (
                  <>
                    {figure("text-2xl")}
                    {chip}
                  </>
                )}
              </div>
              {badge && !loading && <div className="mt-1.5 flex">{badge}</div>}
            </>
          ) : (
            <>
              <div className="mt-0.5 flex h-[30px] items-end">{loading ? <FigureSkeleton className="h-6 w-20" /> : figure(dense ? "text-[22px]" : "text-[26px]")}</div>
              <div className={cn("mt-1.5 flex min-w-0 items-center", badge || slow === "chip" ? "min-h-5 flex-wrap gap-x-1.5 gap-y-1" : "h-5")}>
                {loading ? (
                  <FigureSkeleton className="h-5 w-16 rounded-full" />
                ) : (
                  <>
                    {chip}
                    {alert && <StatusIcon tone="critical" className="ml-1 size-3.5" />}
                    {badge && <span className="flex">{badge}</span>}
                    {slow === "chip" && <SlowTag />}
                  </>
                )}
              </div>
              {sub && <p className="mt-1 h-4 truncate text-xs leading-4 text-muted">{loading ? <FigureSkeleton className="h-3 w-16" /> : sub}</p>}
              {anchor ? (
                <a
                  href={`#${anchor.replace(/^#/, "")}`}
                  onClick={(e) => {
                    e.preventDefault();
                    goToAnchor(anchor);
                  }}
                  className="-mx-1 mt-2 inline-flex h-6 items-center gap-1 rounded px-1 text-xs font-semibold text-primary-text hover:bg-primary-soft"
                >
                  <AnchorText anchor={anchor} />
                  <ArrowDown className="size-3.5" aria-hidden />
                </a>
              ) : gauge ? (
                // Al pie, sobre la línea base de las micro-tendencias vecinas (pb: el marcador sobresale 3 px)
                <div className={cn("mt-2 flex", fill ? "min-h-6 flex-1 items-end pb-[3px]" : "h-6 items-center")}>
                  <MiniGauge def={def} result={loading ? undefined : result} tone={tone} />
                </div>
              ) : (
                micro && (
                  // Llena el alto libre (≈ 38 px a 184) con tope de 56 px, como la línea del héroe
                  <div className={cn("mt-2", fill ? "flex min-h-6 flex-1 items-end" : "h-6")}>
                    <KpiMicro def={def} result={loading ? undefined : result} range={range} weekly={weekly} kind={microLine ? "line" : undefined} className={fill ? "max-h-14" : undefined} />
                  </div>
                )
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Medidor fino 0–100 % (cell.gauges): relleno en chart-1 (o el tono de la celda) y marcador del periodo anterior. */
function MiniGauge({ def, result, tone }: { def: KpiDef; result?: KpiResult; tone?: StatusTone }) {
  if (!result) return <FigureSkeleton className="block h-1.5 w-full rounded-full" />;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const v = result.value;
  const prev = result.previous;
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v === null ? undefined : Math.round(v * 1000) / 10}
      aria-valuetext={v === null ? "Sin dato" : `${formatPct(v)}${prev !== null ? `; periodo anterior ${formatPct(prev)}` : ""}`}
      aria-label={`${def.label} (0 a 100 %)`}
      className="relative h-1.5 w-full rounded-full bg-surface-3"
    >
      {v !== null && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${clamp(v) * 100}%`, background: tone ? TONE_VARS[tone].solid : "var(--chart-1)" }} />}
      {prev !== null && (
        <span
          title={`Periodo anterior: ${formatValue(prev, def.format)}`}
          className="absolute -top-[3px] h-3 w-[3px] -translate-x-1/2 rounded-full border border-surface bg-text-2"
          style={{ left: `${clamp(prev) * 100}%` }}
        />
      )}
    </div>
  );
}

/** "Ver estados": el título del widget de estados de la sección anclada, o su etiqueta de navegación. */
function AnchorText({ anchor }: { anchor: string }) {
  const { spec } = useDashboard();
  const id = anchor.replace(/^#/, "");
  const section = spec.sections.find((s) => s.id === id);
  const statusWidget = section?.widgets.find((w) => w.semantic === "flujo" || w.viz === "status-board" || w.viz === "status-strip" || w.viz === "pipeline");
  const text = statusWidget ? statusWidget.title : (section?.nav ?? section?.question ?? "detalle");
  return <span className="truncate">Ver {lowerFirst(text)}</span>;
}

// ─── Barra de proporción ─────────────────────────────────────────────────────

function ProportionBar({
  metrics,
  loading,
  selectedOf,
  anySelected,
  onFilter,
}: {
  metrics: Metric[];
  loading: boolean;
  selectedOf: (f: Metric["filter"]) => boolean;
  anySelected: boolean;
  onFilter: (f: { field: string; value: string }) => void;
}) {
  if (loading) return <FigureSkeleton className="mt-2.5 block h-2 w-full rounded-full" />;
  const pct = metrics.every((m) => m.def.format === "pct");
  const raw = metrics.map((m) => Math.max(0, m.result?.value ?? 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  const shares = pct ? raw : raw.map((v) => (sum ? v / sum : 0));
  const total = shares.reduce((a, b) => a + b, 0);
  const rest = pct && total < 0.995 ? 1 - total : 0;
  return (
    <div className="mt-2.5 flex h-2 w-full items-center gap-[2px]" role="group" aria-label="Distribución">
      {metrics.map((m, i) => {
        const share = shares[i];
        if (share <= 0) return null;
        const tone = m.tone ?? "neutral";
        const label = `${m.def.short ?? m.def.label}: ${formatPct(share)}`;
        const style = { flexGrow: share, flexBasis: 0, minWidth: 3 };
        const dim = anySelected && !selectedOf(m.filter);
        const mark = <span aria-hidden className="block h-2 w-full first:rounded-l-full" style={{ background: TONE_VARS[tone].solid }} />;
        return m.filter ? (
          <button
            key={m.def.id}
            type="button"
            title={`${label} · clic para filtrar`}
            aria-label={`${label}. Filtrar`}
            aria-pressed={selectedOf(m.filter)}
            onClick={() => onFilter(m.filter!)}
            style={style}
            className={cn("-my-1.5 flex h-5 items-center transition-opacity hover:opacity-80", i === 0 && "[&>span]:rounded-l-full", i === metrics.length - 1 && !rest && "[&>span]:rounded-r-full", dim && "opacity-45")}
          >
            {mark}
          </button>
        ) : (
          <span key={m.def.id} title={label} style={style} className={cn("flex h-2 [&>span]:h-2", i === 0 && "[&>span]:rounded-l-full", i === metrics.length - 1 && !rest && "[&>span]:rounded-r-full", dim && "opacity-45")}>
            {mark}
          </span>
        );
      })}
      {rest > 0 && <span title={`Resto: ${formatPct(rest)}`} className="block h-2 rounded-r-full bg-surface-3" style={{ flexGrow: rest, flexBasis: 0, minWidth: 3 }} />}
    </div>
  );
}
