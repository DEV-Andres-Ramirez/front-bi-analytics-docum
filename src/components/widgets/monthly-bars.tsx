"use client";

import type { Chart as ChartJS, ChartData, ChartOptions, TooltipModel } from "chart.js";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Bar } from "react-chartjs-2";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { Tooltip } from "@/components/ui/tooltip";
import type { MonthlyResult } from "@/dashboards/dto";
import type { MonthlyWidget, Polarity, ValueFormat } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { cn } from "@/lib/cn";
import { registerCharts } from "@/lib/charts/register";
import { alpha, useChartTheme } from "@/lib/charts/theme";
import { endOfMonth, MONTHS_ES, MONTHS_ES_LONG, todayISO } from "@/lib/dates";
import { copUnit, describeDelta, formatCompact, formatCOP, formatInt, formatValue, type DeltaInfo } from "@/lib/format";
import { chartToPng, labelsPlugin, partialBarsPlugin, useChartAnimation, useChartKeyboard, useChartResizeGuard, type CanvasLabel, type PartialBar } from "./canvas-helpers";
import { useExporter } from "./frame-context";
import { ChartTooltip, chartJsExternal, useChartTooltip, type TooltipContent } from "./kit/chart-tooltip";
import { LegendSlot } from "./kit/legend-slot";
import type { VizProps } from "./types";

registerCharts();

/**
 * MonthlyBarsDelta · barras mensuales con la variación frente al mes anterior en una fila
 * HTML de chips alineada por x (sin doble eje). docs/ui-design-system.md §MonthlyBarsDelta.
 * - Color por token de métrica (conteo chart-1 · COP chart-2), maxBarThickness 32.
 * - Omite los meses iniciales en 0; mes en curso con relleno tenue y contorno punteado ("punteado =
 *   parcial", igual que el tramo parcial de las series) y "parcial" subrayado en la fila de Δ.
 * - Valor arriba con UNA sola unidad (COP: unidad común en la franja). La franja lleva el acumulado
 *   del periodo en las dos tarjetas hermanas (cantidad y valor): nunca queda vacía en la fila.
 * - La densidad de la fila de Δ depende solo del ancho de columna (dos tarjetas del mismo ancho se
 *   leen igual); una celda que no cabe baja sola a la densidad siguiente.
 * - Tono de la Δ = dirección × polaridad declarada (`widget.polarity`); sin declarar es neutral,
 *   igual que el KPI de la misma métrica en la banda (un dato no se juzga de dos maneras).
 */

const UNIT_TEXT: Record<string, string> = { "mil M": "miles de millones", M: "millones", mil: "miles", "": "" };

interface MonthCol {
  ym: string;
  tick: string;
  full: string;
  value: number;
  prev: number | null;
  prevName: string | null;
  partial: boolean;
  delta: DeltaInfo | null;
}

export function MonthlyBarsDelta({ widget, result, span }: VizProps<MonthlyWidget, MonthlyResult>) {
  const theme = useChartTheme();
  const { data, filters, spec } = useDashboard();
  const motion = useChartAnimation();
  const { state: tip, show, hide } = useChartTooltip();
  const { ref: sizeRef, width: measured } = useElementSize<HTMLDivElement>();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const rootRef = useCallback(
    (el: HTMLDivElement | null) => {
      setRoot(el);
      return sizeRef(el);
    },
    [sizeRef],
  );
  const chartRef = useRef<ChartJS<"bar", number[], string> | null>(null);
  const guardRef = useChartResizeGuard(chartRef);
  const width = measured || Math.max(260, span * 88);
  const format: ValueFormat = widget.valueFormat ?? "int";
  const isCop = format === "cop";
  const slot = widget.vizOptions?.colorSlot ?? (isCop || widget.colorSlot === 2 ? 2 : 1);
  const color = theme.series[slot - 1] ?? theme.series[0];
  // Polaridad declarada en el spec (si existe); por defecto neutral: subir no es bueno ni malo per se
  const polarity: Polarity = widget.polarity ?? "neutral";

  // Mes de referencia: hoy (año en curso) o el fin del rango
  const today = data?.generatedAt ? todayISO(Date.parse(data.generatedAt)) : filters.to;
  const ref = widget.scope === "ytd" || filters.to > today ? today : filters.to;

  const cols: MonthCol[] = useMemo(() => {
    const first = result.values.findIndex((v) => v !== 0);
    const start = first < 0 ? 0 : first;
    const years = new Set(result.months.map((m) => m.slice(0, 4)));
    const multiYear = years.size > 1;
    return result.months.slice(start).map((ym, k) => {
      const i = start + k;
      const [y, m] = ym.split("-").map(Number);
      const value = result.values[i] ?? 0;
      const prev = k > 0 ? (result.values[i - 1] ?? 0) : null;
      const partial = ym === ref.slice(0, 7) && ref < endOfMonth(ref);
      const pm = m === 1 ? 12 : m - 1;
      const py = m === 1 ? y - 1 : y;
      return {
        ym,
        tick: multiYear && (k === 0 || m === 1) ? `${MONTHS_ES[m - 1]} ${y}` : MONTHS_ES[m - 1],
        full: `${MONTHS_ES_LONG[m - 1]} ${y}`,
        value,
        prev,
        prevName: prev === null ? null : `${MONTHS_ES_LONG[pm - 1]} ${py}`,
        partial,
        delta: prev === null ? null : describeDelta(value, prev, format, polarity),
      };
    });
  }, [result.months, result.values, ref, format, polarity]);

  const n = cols.length;
  const unit = useMemo(() => copUnit(cols.map((c) => c.value)), [cols]);
  const maxVal = Math.max(0, ...cols.map((c) => c.value));
  // Acumulado del periodo (año en curso con scope ytd): llena la franja de las dos tarjetas hermanas
  const cumulative = useMemo(() => {
    const total = cols.reduce((a, c) => a + c.value, 0);
    const years = new Set(cols.map((c) => c.ym.slice(0, 4)));
    const label = years.size === 1 ? `Acumulado ${[...years][0]}` : "Acumulado";
    const isCount = !widget.measure || widget.measure.kind === "count";
    const value = isCop ? copUnit([total]).format(total) : formatValue(total, format);
    return { label, value, noun: isCount && !isCop ? (spec.unit?.plural ?? "registros") : "" };
  }, [cols, widget.measure, isCop, format, spec.unit?.plural]);
  const valueText = useCallback(
    (v: number) => (isCop ? unit.value(v) : format === "int" ? (Math.abs(v) >= 100_000 ? formatCompact(v) : formatInt(v)) : formatValue(v, format)),
    [isCop, unit, format],
  );

  const labels: CanvasLabel[] = useMemo(() => cols.map((c, i) => ({ datasetIndex: 0, index: i, text: valueText(c.value), priority: 1 })).filter((l) => cols[l.index].value > 0), [cols, valueText]);

  const contentAt = useCallback(
    (i: number): TooltipContent | null => {
      const c = cols[i];
      if (!c) return null;
      const d = c.delta;
      return {
        title: c.partial ? `${c.full} · en curso` : c.full,
        value: formatValue(c.value, format),
        valueNote: c.partial ? "parcial" : undefined,
        rows: c.prev !== null && c.prevName ? [{ label: c.prevName, value: formatValue(c.prev, format), color: alpha(color, 0.45), shape: "square" }] : undefined,
        delta: d && !c.partial && d.reason !== "no-base" ? { text: d.text, tone: d.tone } : undefined,
        extra: isCop ? <p className="tabular mt-1 text-white/70">{formatCOP(c.value, false)}</p> : undefined,
        hint: c.partial ? "Mes en curso: la variación se calcula al cierre del mes." : c.prev === null ? "Primer mes con datos: sin mes anterior para comparar." : undefined,
      };
    },
    [cols, format, color, isCop],
  );
  const describe = useCallback(
    (i: number) => {
      const c = contentAt(i);
      return c ? `${c.title}: ${c.value}${c.delta ? `, ${c.delta.text} frente al mes anterior` : ""}` : "";
    },
    [contentAt],
  );
  const keys = useChartKeyboard(chartRef, n, describe);
  const external = useMemo(() => chartJsExternal<"bar">(show, hide, (t: TooltipModel<"bar">) => contentAt(t.dataPoints[0]?.dataIndex ?? -1)), [show, hide, contentAt]);

  const exporter = useCallback(async () => {
    if (root) {
      try {
        const { toPng } = await import("html-to-image");
        return await toPng(root, { pixelRatio: 2, backgroundColor: theme.surface, cacheBust: true });
      } catch {
        /* se usa el canvas */
      }
    }
    return chartToPng(chartRef.current, theme.surface);
  }, [root, theme.surface]);
  useExporter(exporter);

  const partialFill = theme.mode === "dark" ? 0.18 : 0.28;
  const chartData: ChartData<"bar", number[], string> = useMemo(
    () => ({
      labels: cols.map((c) => c.tick),
      datasets: [
        {
          label: widget.title,
          data: cols.map((c) => c.value),
          // Mes en curso: relleno tenue + contorno punteado del color pleno (partialBarsPlugin)
          // (en oscuro más tenue: al 0,28 el naranja se leía marrón y el azul, sucio)
          backgroundColor: cols.map((c) => (c.partial ? alpha(color, partialFill) : color)),
          hoverBackgroundColor: cols.map((c) => (c.partial ? alpha(color, partialFill + 0.12) : color)),
          borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
          borderSkipped: "start",
          maxBarThickness: 32,
          categoryPercentage: 0.72,
          barPercentage: 0.9,
        },
      ],
    }),
    [cols, widget.title, color, partialFill],
  );

  const partialItems: PartialBar[] = useMemo(() => cols.flatMap((c, i) => (c.partial ? [{ datasetIndex: 0, index: i, color }] : [])), [cols, color]);

  const options = useMemo(
    () =>
      ({
        responsive: true,
        maintainAspectRatio: false,
        ...motion,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: 18, right: 0, left: 0, bottom: 0 } },
        scales: {
          x: {
            grid: { display: false },
            border: { color: theme.axis },
            ticks: { color: theme.tick, font: { size: 11 }, maxRotation: 0, minRotation: 0, autoSkip: true, autoSkipPadding: 4, padding: 6 },
          },
          // Sin eje Y: las categorías reparten todo el ancho y la fila de Δ se alinea por x. Máximo
          // explícito (sin grace ni el redondeo de Chart.js): la barra más alta llega al techo y su
          // cifra usa el padding superior de 18 px
          y: { display: false, beginAtZero: true, min: 0, max: maxVal > 0 ? maxVal * 1.03 : 1 },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false, external },
          docPartial: { items: partialItems },
          docLabels: { items: labels, text: theme.text, muted: theme.muted, surface: theme.surface, kind: "bar" },
        },
      }) as unknown as ChartOptions<"bar">,
    [motion, theme, external, labels, maxVal, partialItems],
  );

  const colW = n ? width / n : width;
  const density = rowDensity(colW);
  // Franja: acumulado + unidad común (COP). En angosto, la unidad se abrevia ("mil M de pesos").
  // (el sufijo de copUnit lleva espacio no separable: "mil M")
  const unitText = isCop && unit.suffix ? `${UNIT_TEXT[unit.suffix.replace(/\u00A0/g, " ")] ?? unit.suffix} de pesos` : "";
  // Tres escalones, sin recortar con "…": unidad larga → "mil M de pesos" → "Acum. 2026 … · cifras en mil M"
  const stripFits = (label: string, unitLabel: string) =>
    (label.length + cumulative.value.length + cumulative.noun.length + (unitLabel ? unitLabel.length + 14 : 0) + 2) * 6.2 <= width;
  const shortUnit = unit.suffix ? `${unit.suffix} de pesos` : "";
  const [stripLabel, unitShown] = !unitText
    ? [stripFits(cumulative.label, "") ? cumulative.label : cumulative.label.replace("Acumulado", "Acum."), ""]
    : stripFits(cumulative.label, unitText)
      ? [cumulative.label, unitText]
      : stripFits(cumulative.label, shortUnit)
        ? [cumulative.label, shortUnit]
        : [cumulative.label.replace("Acumulado", "Acum."), unit.suffix];

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      {n > 0 && (
        <LegendSlot>
          <span className="tabular min-w-0 truncate text-[11px] text-muted">
            {stripLabel} <span className="font-semibold text-text-2">{cumulative.value}</span>
            {cumulative.noun && ` ${cumulative.noun}`}
            {unitShown && (
              <>
                {" · cifras en "}
                <span className="font-semibold text-text-2">{unitShown}</span>
              </>
            )}
          </span>
        </LegendSlot>
      )}
      <div
        ref={guardRef}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        tabIndex={0}
        role="group"
        aria-label={`${widget.title}. Use las flechas para recorrer los meses.`}
        onKeyDown={keys.onKeyDown}
        onBlur={keys.onBlur}
        onMouseLeave={hide}
      >
        <Bar
          ref={chartRef}
          data={chartData}
          options={options}
          plugins={[partialBarsPlugin, labelsPlugin]}
          role="img"
          aria-label={`${widget.title}: ${cols.map((c) => `${c.full} ${formatValue(c.value, format)}`).join(", ")}`}
        />
      </div>
      <ul role="list" aria-label="Variación frente al mes anterior" className="mt-1 grid shrink-0" style={{ gridTemplateColumns: `repeat(${Math.max(1, n)}, minmax(0, 1fr))` }}>
        {cols.map((c, i) => (
          <li key={c.ym} className="flex min-w-0 justify-center">
            <DeltaCell col={c} density={cellDensity(c, density, colW, format)} format={format} rowHead={i === 0 && density === "bare"} />
          </li>
        ))}
      </ul>
      <span className="sr-only" aria-live="polite">
        {keys.announce}
      </span>
      <ChartTooltip state={tip} />
    </div>
  );
}

/**
 * Densidad de la fila de Δ. La de la FILA depende solo del ancho de columna (nunca del contenido: dos
 * tarjetas del mismo ancho y el mismo número de meses se leen igual). Siempre con espacio antes del %
 * (mismo formato que el DeltaChip de los KPIs):
 * - "text": 1 decimal ("−6,3 %") · columnas de ≥ 72 px;
 * - "int": entero ("−23 %") · columnas de ≥ 44 px;
 * - "bare": entero sin unidad a 10 px ("−23"), con el rótulo "Δ %" en la primera celda (el primer mes
 *   no tiene mes anterior) · columnas angostas (móvil);
 * - "arrow": solo la flecha con el tono, SOLO para la celda que no cabe en "bare" ("+1.358"); la cifra
 *   va en el tooltip y en el texto accesible.
 */
type Density = "text" | "int" | "bare" | "arrow";
const DENSITIES: Density[] = ["text", "int", "bare", "arrow"];
/** Ancho aproximado de un carácter de cifra a 10,5 px / 600 (Montserrat, tabular). */
const CH = 6.5;
/** Espacio no separable entre la cifra y la unidad (el mismo de formatDelta en los KPIs). */
const NBSP = "\u00A0";

function intText(d: DeltaInfo, format: ValueFormat): string {
  // Base pequeña: el texto ya es la diferencia absoluta ("+3")
  if (d.reason === "small-base") return d.text;
  const sign = d.direction === "down" ? "−" : d.direction === "up" ? "+" : "";
  return `${sign}${Math.round(Math.abs(d.magnitude) * 100)}${NBSP}${format === "pct" ? "p.p." : "%"}`;
}
function bareText(d: DeltaInfo): string {
  const sign = d.direction === "down" ? "−" : d.direction === "up" ? "+" : "";
  return `${sign}${Math.round(Math.abs(d.magnitude) * 100)}`;
}
/** Ancho estimado de un texto de Δ (el espacio cuenta ~½ carácter). */
const textWidth = (t: string, ch = CH) => t.replace(/\s/g, "").length * ch + (/\s/.test(t) ? 3 : 0);

function rowDensity(colW: number): Density {
  if (colW >= 72) return "text";
  if (colW >= 44) return "int";
  return "bare";
}

/** Ancho de la celda en una densidad (texto + relleno horizontal); null si la densidad no aplica. */
function cellWidth(d: DeltaInfo, density: Density, format: ValueFormat): number | null {
  if (density === "text") return textWidth(d.text) + 12;
  if (density === "int") return textWidth(intText(d, format)) + 8;
  // Sin unidad no se distingue una diferencia absoluta de un %: la base pequeña pasa a flecha
  if (density === "bare") return d.reason === "small-base" ? null : textWidth(bareText(d), 6.2) + 4;
  return 20;
}

/** Densidad de una celda: la de la fila o, si no cabe, la siguiente que quepa (flecha al final). */
function cellDensity(col: MonthCol, row: Density, colW: number, format: ValueFormat): Density {
  const d = col.delta;
  if (!d || d.reason === "no-base" || col.partial) return row;
  const avail = colW - 6;
  for (let k = DENSITIES.indexOf(row); k < DENSITIES.length - 1; k++) {
    const w = cellWidth(d, DENSITIES[k], format);
    if (w !== null && w <= avail) return DENSITIES[k];
  }
  return "arrow";
}

function DeltaCell({ col, density, format, rowHead }: { col: MonthCol; density: Density; format: ValueFormat; rowHead?: boolean }) {
  const base = "tabular inline-flex h-5 items-center justify-center gap-0.5 whitespace-nowrap rounded-full font-semibold";
  const size = density === "bare" ? "text-[10px]" : "text-[10.5px]";
  const pad = density === "int" ? "px-1" : density === "bare" ? "px-0.5" : density === "arrow" ? "w-5 px-0" : "px-1.5";
  if (col.partial)
    return (
      <Tooltip content="Mes en curso: la variación se calcula al cierre del mes.">
        {/* Siempre texto con subrayado punteado (sin caja): la misma marca en todas las tarjetas */}
        <span className={cn(base, size, "rounded-none border-b border-dashed border-muted px-0 font-medium text-muted")}>parcial</span>
      </Tooltip>
    );
  const d = col.delta;
  if (!d || d.reason === "no-base") {
    // Fila sin unidad (móvil): la primera celda —sin mes anterior— rotula la fila
    if (rowHead)
      return (
        <span className={cn(base, size, "px-0 font-medium text-muted")} aria-label={`Variación ${format === "pct" ? "en puntos porcentuales" : "porcentual"} frente al mes anterior; ${col.full} sin mes anterior`}>
          {format === "pct" ? "Δ p.p." : "Δ %"}
        </span>
      );
    return (
      <span className={cn(base, size, pad, "text-muted")} aria-label={col.prev === null ? "Sin mes anterior" : "Sin base de comparación"}>
        —
      </span>
    );
  }
  const Icon = d.direction === "up" ? TrendingUp : d.direction === "down" ? TrendingDown : Minus;
  const text = density === "int" ? intText(d, format) : density === "bare" ? bareText(d) : d.text;
  const full = `${col.full}: ${d.text} frente a ${col.prevName} (${formatValue(col.prev, format)}).${d.reason === "small-base" ? " Base pequeña: no se colorea." : ""}`;
  return (
    <Tooltip content={full} focusable={density === "arrow" || density === "bare"}>
      <span
        className={cn(
          base,
          size,
          pad,
          d.tone === "good" && "bg-good-soft text-good-ink",
          d.tone === "bad" && "bg-critical-soft text-critical-ink",
          d.tone === "neutral" && "bg-surface-3 text-text-2",
        )}
        role={density === "arrow" || density === "bare" ? "img" : undefined}
        aria-label={density === "arrow" || density === "bare" ? full : undefined}
      >
        {density === "arrow" ? <Icon className="size-3" aria-hidden /> : text}
      </span>
    </Tooltip>
  );
}
