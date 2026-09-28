"use client";

import { ArrowDown, ChevronRight, FlaskConical, Snail } from "lucide-react";
import { Fragment } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { Tooltip } from "@/components/ui/tooltip";
import { DeltaChip } from "@/components/widgets/kit/delta-chip";
import { StatusIcon } from "@/components/widgets/kit/status-icon";
import type { CategoryResult, KpiResult, Range } from "@/dashboards/dto";
import { innerWidth } from "@/dashboards/layout";
import type { KpiCellDef, KpiDef, StatusTone } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { cn } from "@/lib/cn";
import { TONE_VARS } from "@/lib/charts/semantic";
import { describeDelta, formatPct, formatValue } from "@/lib/format";
import { EmbedBar, EmbedMenu } from "./kpi-embed";
import { AnimatedFigure, chipWidth, figureWidth, FigureSkeleton, goToAnchor, KpiCardShell, KpiMicro, lowerFirst, PROVISIONAL_W, ProvisionalBadge, textWidth } from "./shared";

type GroupDef = Extract<KpiCellDef, { kind: "group" }>;

/** Ancho mínimo por métrica (kpiRedesign §3): 112 para %, días o enteros cortos; 150 para COP o cifras largas. */
function minWidth(def: KpiDef, value: number | null | undefined): number {
  if (def.format === "cop") return 150;
  if ((def.format === "int" || def.format === "compact") && formatValue(value ?? 0, def.format).length > 6) return 150;
  return 112;
}

/** Separación entre filas/columnas del respaldo en rejilla. */
const GAP = 12;
/** Divisor hairline entre celdas en línea (mx-[5.5px] + 1 px) y chevron del stepper (16 + mx-1). */
const DIVIDER_W = 12;
const CHEVRON_W = 24;
/** Ícono de tono o número de paso junto a la etiqueta (14 + gap 4) y matraz de "Provisional". */
const ICON_W = 18;
const FLASK_W = 18;

/** Ancho de la etiqueta corta (12,5 px medium) + ícono. */
function labelWidth(def: KpiDef, icon: boolean): number {
  return textWidth(def.short ?? def.label, 12.5) + (icon ? ICON_W : 0);
}

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
  const { ref, width, measured } = useElementSize<HTMLDivElement>();

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

  // ── Disposición (ancho medido; antes de medir, el ancho de diseño del span) ──
  // row: celdas en línea separadas por hairlines (o chevrons) · grid: 2 columnas sin micro-tendencias.
  // Con 3 métricas que no caben con micro-tendencia se prefiere la fila de 3 (sin micro, etiquetas en
  // 2 líneas si hace falta) antes que un 2×2 con un cuadrante vacío; si tampoco cabe, 2 columnas y la
  // tercera ocupa la fila completa en horizontal.
  const available = measured ? width : innerWidth(span);
  const stepper = cell.variant === "stepper";
  const n = metrics.length;
  const hasIcon = (m: Metric) => Boolean(m.tone) || (stepper && !m.after);
  const sepW = (m: Metric, i: number) => (i === 0 ? 0 : stepper && !m.after ? CHEVRON_W : DIVIDER_W);
  const gaps = metrics.reduce((a, m, i) => a + sepW(m, i), 0);
  const rowCell = n ? (available - gaps) / n : available;
  // "Provisional" con texto si cabe junto a la etiqueta; si no, el matraz (con tooltip)
  const provText = (m: Metric, w: number) => Boolean(m.def.provisional) && labelWidth(m.def, hasIcon(m)) + 6 + PROVISIONAL_W <= w;
  const labelNeed = (m: Metric, w: number) => labelWidth(m.def, hasIcon(m)) + (m.def.provisional ? (provText(m, w) ? 6 + PROVISIONAL_W : FLASK_W) : 0);
  const labelsFit = (w: number) => metrics.every((m) => labelNeed(m, w) <= w);
  const figurePx = compact ? 24 : 26;
  const fitsFigures = (w: number, px: number) => metrics.every((m) => figureWidth(m.result?.value, m.def.format, px) <= w && (compact || chipWidth(m.def, m.result) <= w));
  const need = metrics.reduce((a, m) => a + minWidth(m.def, m.result?.value), 0) + gaps;

  const inline = n <= 1 || (need <= available && labelsFit(rowCell));
  const tightRow = !inline && n === 3 && (fitsFigures(rowCell, figurePx) || fitsFigures(rowCell, 22));
  const row = inline || tightRow;
  const gridCell = (available - GAP) / 2 - 12;
  const cellW = row ? rowCell : gridCell;
  // Etiquetas en 2 líneas (todas, para que las cifras compartan línea base) si alguna no cabe en 1
  const twoLine = !inline && !labelsFit(cellW);
  // Cifra de 22 px solo si a 26 no cabe (fila de 3 en móvil)
  const dense = tightRow && !fitsFigures(rowCell, figurePx);
  const bar = cell.variant === "proportion" || Boolean(cell.embed);
  const showMicro = inline && !compact && !bar;
  // Fila compacta: el chip va junto a la cifra si cabe en TODAS las celdas; si no, debajo en todas.
  // data-chip-stack / data-two-line los lee la fila (group/kpirow) para que los grupos vecinos coincidan.
  const oddLast = !row && n % 2 === 1;
  const stackChip = Boolean(compact) && metrics.some((m, i) => figureWidth(m.result?.value, m.def.format, 24) + 8 + chipWidth(m.def, m.result) > (oddLast && i === n - 1 ? available : cellW));
  const gauges = new Set(cell.gauges ?? []);

  // Resaltados
  let slowest = -1;
  if (cell.variant === "stepper") {
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

  const selectedOf = (f: Metric["filter"]) => Boolean(f && filters.eq[f.field]?.includes(f.value));
  const anySelected = cell.variant === "proportion" && metrics.some((m) => selectedOf(m.filter));
  const embedResult = cell.embed ? data?.widgets[cell.embed] : undefined;
  const embedWidget = cell.embed ? spec.sections.flatMap((s) => s.widgets).find((w) => w.id === cell.embed) : undefined;

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
        className={cn("min-w-0", row ? "flex items-stretch" : "grid grid-cols-2 gap-y-3")}
      >
        {metrics.map((m, i) => {
          const sep =
            row && i > 0 ? (
              stepper && !m.after ? (
                <ChevronRight aria-hidden className="relative z-10 mx-1 mt-[26px] size-4 shrink-0 self-start text-muted" strokeWidth={2.25} />
              ) : (
                <span aria-hidden className={cn("mx-[5.5px] w-px shrink-0 self-stretch", m.after ? "bg-border-strong" : "bg-[var(--hairline)]")} />
              )
            ) : null;
          const wideLast = oddLast && i === n - 1;
          const gridCls = !row && cn(wideLast ? "col-span-2" : i % 2 === 0 ? "pr-3" : "border-l border-[var(--hairline)] pl-3", i >= 2 && "border-t border-[var(--hairline)] pt-3");
          return (
            <Fragment key={m.def.id}>
              {sep}
              <MetricCell
                m={m}
                step={stepper && !m.after ? metrics.filter((x) => !x.after).indexOf(m) + 1 : undefined}
                ring={i === slowest}
                alert={i === worst}
                compact={compact}
                loading={loading}
                range={range}
                micro={showMicro}
                gauge={showMicro && gauges.has(m.def.id) && m.def.format === "pct"}
                twoLine={twoLine && !wideLast}
                dense={dense}
                stackChip={stackChip}
                horizontal={wideLast}
                provText={provText(m, wideLast ? available / 2 : cellW)}
                selected={selectedOf(m.filter)}
                dimmed={anySelected && !selectedOf(m.filter)}
                onFilter={m.filter ? () => toggleValue(m.filter!.field, m.filter!.value) : undefined}
                className={cn(row && "flex-1 basis-0", gridCls)}
              />
            </Fragment>
          );
        })}
      </div>

      {cell.variant === "proportion" && (
        <ProportionBar metrics={metrics} loading={loading} selectedOf={selectedOf} anySelected={anySelected} onFilter={(f) => toggleValue(f.field, f.value)} />
      )}
      {cell.variant === "proportion" && secondary && (
        <p className="mt-1.5 h-4 truncate text-xs leading-4 text-muted">
          {loading ? (
            <FigureSkeleton className="h-3 w-24" />
          ) : (
            <>
              <span className="tabular font-semibold text-text">{formatValue(secondaryResult?.value ?? null, secondary.format)}</span> {lowerFirst(secondary.label)}
            </>
          )}
        </p>
      )}
      {embedWidget && <EmbedBar widget={embedWidget} result={embedResult as CategoryResult | undefined} order={metrics.map((m) => m.def.short ?? m.def.label)} />}
    </KpiCardShell>
  );
}

function MetricCell({
  m,
  step,
  ring,
  alert,
  compact,
  loading,
  range,
  micro,
  gauge,
  twoLine,
  dense,
  stackChip,
  horizontal,
  provText,
  selected,
  dimmed,
  onFilter,
  className,
}: {
  m: Metric;
  step?: number;
  ring: boolean;
  alert: boolean;
  compact?: boolean;
  loading: boolean;
  range?: Range;
  micro: boolean;
  /** Medidor 0–100 % en lugar de la micro-tendencia (cell.gauges). */
  gauge: boolean;
  twoLine?: boolean;
  /** Cifra de 22 px (fila de 3 angosta). */
  dense?: boolean;
  /** Fila compacta: chip bajo la cifra (decidido para toda la fila). */
  stackChip?: boolean;
  /** Celda impar final del respaldo 2 columnas: etiqueta a la izquierda, cifra y chip a la derecha. */
  horizontal?: boolean;
  /** "Provisional" con texto (si no cabe, solo el matraz). */
  provText: boolean;
  selected: boolean;
  dimmed: boolean;
  onFilter?: () => void;
  className?: string;
}) {
  const { def, result, tone, anchor } = m;
  const short = def.short ?? def.label;
  // "Provisional" sin espacio para el texto: matraz dentro del flujo de la etiqueta (baja con ella a la 2.ª
  // línea en vez de recortar una palabra sola como "Devolucione…"); la fórmula va en el tooltip de la etiqueta
  const flask = Boolean(def.provisional) && !provText;
  const tip = (
    <span>
      <strong>{def.label}</strong>
      {flask && <> · fórmula provisional, pendiente de validación con negocio</>}
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
      <span className={cn("min-w-0", twoLine ? "line-clamp-2" : "truncate")}>
        {short}
        {flask && (
          <>
            {" "}
            <FlaskConical className="inline size-3.5 align-[-2px] text-warning-ink" aria-hidden />
            <span className="sr-only">(fórmula provisional)</span>
          </>
        )}
      </span>
      {ring && (
        <span title="Fase más lenta" className="inline-flex shrink-0">
          <Snail aria-hidden className="size-3.5 text-warning-ink" />
        </span>
      )}
    </>
  );
  const chip = <DeltaChip value={result?.value} previous={result?.previous} format={def.format} polarity={def.polarity} prevRange={range} />;
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
          title={`${def.label}${flask ? " (fórmula provisional)" : ""} · clic para filtrar`}
          className={cn("-mx-1 inline-flex min-w-0 gap-1 rounded px-1 text-left hover:bg-surface-3", twoLine ? "items-start" : "items-center")}
        >
          {labelInner}
        </button>
      ) : (
        <Tooltip content={tip} focusable className={cn("min-w-0 gap-1 rounded", twoLine ? "items-start" : "items-center")}>
          {labelInner}
        </Tooltip>
      )}
      {provText && <ProvisionalBadge def={def} small />}
      {ring && <span className="sr-only">(fase más lenta)</span>}
      {alert && <span className="sr-only">(mayor variación desfavorable)</span>}
    </div>
  );

  return (
    <div className={cn("relative min-w-0 transition-opacity", dimmed && "opacity-45", className)}>
      {/* Capas de énfasis (no mueven la línea base) */}
      {alert && <span aria-hidden className="absolute -inset-x-1.5 -inset-y-1.5 rounded-xl bg-critical-soft" />}
      {ring && <span aria-hidden className="absolute -inset-x-1 -inset-y-1.5 rounded-xl ring-2 ring-warning" />}
      {selected && <span aria-hidden className="absolute -inset-x-1.5 -inset-y-1.5 rounded-xl bg-primary-soft ring-1 ring-primary" />}
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
        <div className="relative">
          {label}
          {compact ? (
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
          ) : (
            <>
              <div className="mt-0.5 flex h-[30px] items-end">{loading ? <FigureSkeleton className="h-6 w-20" /> : figure(dense ? "text-[22px]" : "text-[26px]")}</div>
              <div className="mt-1.5 flex h-5 min-w-0 items-center">
                {loading ? (
                  <FigureSkeleton className="h-5 w-16 rounded-full" />
                ) : (
                  <>
                    {chip}
                    {alert && <StatusIcon tone="critical" className="ml-1 size-3.5" />}
                  </>
                )}
              </div>
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
                <div className="mt-2 flex h-6 items-center">
                  <MiniGauge def={def} result={loading ? undefined : result} tone={tone} />
                </div>
              ) : (
                micro && (
                  <div className="mt-2 h-6">
                    <KpiMicro def={def} result={loading ? undefined : result} range={range} />
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
