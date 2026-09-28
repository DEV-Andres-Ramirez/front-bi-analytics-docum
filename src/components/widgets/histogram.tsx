"use client";

import type { Chart as ChartJS, ChartData, ChartOptions, TooltipModel } from "chart.js";
import { useCallback, useMemo, useRef } from "react";
import { Bar } from "react-chartjs-2";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import type { HistogramResult } from "@/dashboards/dto";
import type { HistogramWidget } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { registerCharts } from "@/lib/charts/register";
import { useChartTheme } from "@/lib/charts/theme";
import { formatAxis, formatInt, formatPct } from "@/lib/format";
import { chartToPng, labelsPlugin, niceScale, refLinePlugin, shortNumber, useChartAnimation, useChartKeyboard, useChartResizeGuard, type CanvasLabel } from "./canvas-helpers";
import { useExporter } from "./frame-context";
import { ChartTooltip, chartJsExternal, useChartTooltip, type TooltipContent } from "./kit/chart-tooltip";
import { LegendSlot } from "./kit/legend-slot";
import { CountChip, QUALITY_CHIP_MIN, QualityChip } from "./kit/quality";
import type { VizProps } from "./types";

registerCharts();

/**
 * Histogram v2 · distribución de una duración en intervalos (tiempo en gestión, tiempo definido).
 * docs/ui-design-system.md §Histogram: columnas contiguas en chart-1 pleno (el token de conteo, igual
 * que la serie del tablero), eje con la unidad y la nota "intervalos de distinto ancho", referencia
 * punteada en tinta ("Promedio 5,4 d" desde un KPI o "Mediana ≈" calculada) que nunca tacha las
 * cifras, y sin filtro cruzado. Sin dato: chip de calidad (warning) desde el 15 % —la misma
 * convención de colorSystem H que el resto de widgets—; por debajo, chip neutro "Sin dato: N".
 */

const UNIT_ABBR: Record<string, string> = { días: "d", dias: "d", día: "d", horas: "h", hora: "h", minutos: "min" };

/** Ancho aproximado (em) de un rótulo de intervalo en Montserrat: cifras ≈ 0,62, "1" ≈ 0,4, espacio ≈ 0,28. */
const labelEm = (t: string) => [...t].reduce((w, ch) => w + (ch === " " ? 0.28 : ch === "1" ? 0.4 : 0.62), 0);

/**
 * Rótulos del eje X: todos visibles siempre que quepan (con intervalos de distinto ancho el rótulo es
 * imprescindible). 11 px en una línea → 10 px en una línea → 10 px partiendo en el guion SOLO los que no
 * caben ("11–" / "15"; "4–5" sigue en una línea) → y solo entonces autoSkip.
 */
function tickPlan(labels: string[], colW: number): { size: number; lines: string[][] | null; autoSkip: boolean } {
  const fits = (t: string, size: number, pad: number) => labelEm(t) * size + pad <= colW;
  if (labels.every((l) => fits(l, 11, 6))) return { size: 11, lines: null, autoSkip: false };
  if (labels.every((l) => fits(l, 10, 3))) return { size: 10, lines: null, autoSkip: false };
  const lines = labels.map((l) => (fits(l, 10, 3) ? [l] : splitRange(l)));
  if (lines.every((ls) => ls.every((part) => fits(part, 10, 3)))) return { size: 10, lines, autoSkip: false };
  return { size: 10, lines: null, autoSkip: true };
}

/** "11–15" → ["11–", "15"]; sin guion, una línea. */
function splitRange(label: string): string[] {
  const i = label.indexOf("–");
  return i > 0 && i < label.length - 1 ? [label.slice(0, i + 1), label.slice(i + 1)] : [label];
}

interface Interval {
  /** Límites en unidades del dato (cada entero ocupa [k − 0,5, k + 0,5]). */
  from: number;
  to: number;
}

/** Intervalo en unidades del dato de cada columna (límites superiores inclusivos). */
function intervals(bins: number[], count: number): Interval[] {
  const out: Interval[] = [];
  for (let i = 0; i < count; i++) {
    if (i < bins.length) {
      const lo = i === 0 ? Math.min(0, bins[0]) : bins[i - 1] + 1;
      out.push({ from: lo - 0.5, to: bins[i] + 0.5 });
    } else {
      // Intervalo abierto final ("> 30"): mismo ancho que el anterior
      const p = out[out.length - 1] ?? { from: -0.5, to: 0.5 };
      out.push({ from: p.to, to: p.to + (p.to - p.from) });
    }
  }
  return out;
}

/** Columna y fracción donde cae un valor. */
function locate(v: number, iv: Interval[]): { index: number; fraction: number } {
  if (!iv.length) return { index: -1, fraction: 0 };
  if (v <= iv[0].from) return { index: 0, fraction: 0 };
  for (let i = 0; i < iv.length; i++) {
    if (v <= iv[i].to) return { index: i, fraction: (v - iv[i].from) / (iv[i].to - iv[i].from) };
  }
  return { index: iv.length - 1, fraction: 1 };
}

/** Referencia: valor del KPI declarado o mediana aproximada (interpolada en su intervalo). */
function computeReference(kpiValue: number | null, name: string, abbr: string, values: number[], iv: Interval[]): { value: number; label: string } | null {
  if (kpiValue !== null && Number.isFinite(kpiValue)) return { value: kpiValue, label: `${name} ${shortNumber(kpiValue)} ${abbr}` };
  const total = values.reduce((s, v) => s + v, 0);
  if (!total) return null;
  const target = total / 2;
  let cum = 0;
  for (let i = 0; i < values.length && i < iv.length; i++) {
    const v = values[i] ?? 0;
    if (v > 0 && cum + v >= target) {
      const value = iv[i].from + ((target - cum) / v) * (iv[i].to - iv[i].from);
      return { value, label: `Mediana ≈ ${shortNumber(Math.max(0, value))} ${abbr}` };
    }
    cum += v;
  }
  return null;
}

export function Histogram({ widget, result, span }: VizProps<HistogramWidget, HistogramResult>) {
  const theme = useChartTheme();
  const { spec, data } = useDashboard();
  const motion = useChartAnimation();
  const { state: tip, show, hide } = useChartTooltip();
  const { ref: sizeRef, width: measured } = useElementSize<HTMLDivElement>();
  const width = measured || Math.max(260, span * 88);
  const chartRef = useRef<ChartJS<"bar", number[], string> | null>(null);
  const guardRef = useChartResizeGuard(chartRef);

  const n = result.labels.length;
  const withData = result.values.reduce((s, v) => s + v, 0);
  const unit = widget.unit || "días";
  const abbr = UNIT_ABBR[unit.toLocaleLowerCase("es-CO")] ?? unit;
  const iv = useMemo(() => intervals(widget.bins, n), [widget.bins, n]);
  const uneven = useMemo(() => new Set(iv.map((x) => Math.round((x.to - x.from) * 100))).size > 1, [iv]);

  // Referencia: KPI declarado (promedio) o mediana aproximada del histograma
  const refKpiId = widget.vizOptions?.referenceKpi;
  const kpis = data?.kpis;
  const kpiDefs = spec.kpis;
  const reference = useMemo(() => {
    const k = refKpiId ? kpis?.find((x) => x.id === refKpiId) : undefined;
    const def = refKpiId ? kpiDefs.find((x) => x.id === refKpiId) : undefined;
    const name = !def || def.measure.kind === "avg" ? "Promedio" : (def.short ?? def.label);
    return computeReference(k?.value ?? null, name, abbr, result.values, iv);
  }, [refKpiId, kpis, kpiDefs, abbr, result.values, iv]);
  const refPos = useMemo(() => (reference ? locate(reference.value, iv) : null), [reference, iv]);

  const colW = n ? width / n : width;
  const showValues = n <= 12 && colW >= 22;
  // Con eje Y visible, el área de trazado pierde ~34 px a la izquierda
  const plan = useMemo(() => tickPlan(result.labels, n ? (showValues ? width : width - 34) / n : width), [result.labels, n, showValues, width]);
  // Eje Y justo. Oculto (cifras sobre las columnas): la más alta casi toca el techo; con referencia se
  // deja aire para que su cifra no choque con el rótulo "Promedio …" de la franja superior.
  const maxVal = Math.max(0, ...result.values);
  const yNice = niceScale(maxVal, 4, 1);
  // Conteo = chart-1 pleno (colorSystem E). Sin filtro cruzado: no hay estado atenuado.
  const fill = theme.series[0];
  const empty = result.empty;
  const emptyShare = empty > 0 ? empty / (empty + withData) : 0;

  const valueLabels: CanvasLabel[] = useMemo(
    () => (showValues ? result.values.map((v, i) => ({ datasetIndex: 0, index: i, text: formatAxis(v, "int"), priority: 1 })).filter((l) => result.values[l.index] > 0) : []),
    [showValues, result.values],
  );

  const contentAt = useCallback(
    (i: number): TooltipContent | null => {
      const label = result.labels[i];
      if (label === undefined) return null;
      const v = result.values[i] ?? 0;
      return {
        title: `${label} ${unit}`,
        value: formatInt(v),
        valueNote: withData ? `${formatPct(v / withData)} de los registros con dato` : undefined,
      };
    },
    [result.labels, result.values, unit, withData],
  );
  const describe = useCallback((i: number) => {
    const c = contentAt(i);
    return c ? `${c.title}: ${c.value}${c.valueNote ? `, ${c.valueNote}` : ""}` : "";
  }, [contentAt]);
  const keys = useChartKeyboard(chartRef, n, describe);
  const external = useMemo(() => chartJsExternal<"bar">(show, hide, (t: TooltipModel<"bar">) => contentAt(t.dataPoints[0]?.dataIndex ?? -1)), [show, hide, contentAt]);

  const exporter = useCallback(() => chartToPng(chartRef.current, theme.surface), [theme.surface]);
  useExporter(exporter);

  const chartData: ChartData<"bar", number[], string> = useMemo(
    () => ({
      labels: result.labels,
      datasets: [
        {
          label: widget.title,
          data: result.values,
          backgroundColor: fill,
          hoverBackgroundColor: theme.series[0],
          borderColor: theme.surface,
          borderWidth: { top: 0, left: 1, right: 1, bottom: 0 },
          borderRadius: { topLeft: 2, topRight: 2, bottomLeft: 0, bottomRight: 0 },
          borderSkipped: "start",
          categoryPercentage: 1,
          barPercentage: 1,
        },
      ],
    }),
    [result.labels, result.values, widget.title, fill, theme],
  );

  const options = useMemo(
    () =>
      ({
        responsive: true,
        maintainAspectRatio: false,
        ...motion,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: reference ? 24 : 16, right: 2, left: 0, bottom: 0 } },
        scales: {
          x: {
            grid: { display: false },
            border: { color: theme.axis },
            ticks: {
              color: theme.tick,
              font: { size: plan.size },
              maxRotation: 0,
              minRotation: 0,
              autoSkip: plan.autoSkip,
              autoSkipPadding: 2,
              padding: 6,
              callback: (_v: string | number, i: number) => (plan.lines ? plan.lines[i] : result.labels[i]),
            },
          },
          y: {
            display: !showValues,
            beginAtZero: true,
            min: 0,
            max: showValues ? (maxVal > 0 ? maxVal * (reference ? 1.14 : 1.04) : 1) : yNice.max,
            grid: { color: theme.grid, drawTicks: false },
            border: { display: false },
            ticks: { color: theme.tick, font: { size: 11 }, padding: 8, stepSize: yNice.stepSize, maxTicksLimit: 6, callback: (v: string | number) => formatAxis(Number(v), "int") },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false, external },
          docLabels: { items: valueLabels, text: theme.text, muted: theme.muted, surface: theme.surface, kind: "bar" },
          docRefLine: refPos && reference ? { index: refPos.index, fraction: refPos.fraction, label: reference.label, color: theme.text, bg: theme.surface } : {},
        },
      }) as unknown as ChartOptions<"bar">,
    [motion, reference, theme, showValues, external, valueLabels, refPos, plan, result.labels, maxVal, yNice.max, yNice.stepSize],
  );

  return (
    <div ref={sizeRef} className="flex h-full min-h-0 flex-col">
      {empty > 0 && (
        <LegendSlot side="end">
          {emptyShare >= QUALITY_CHIP_MIN ? (
            <QualityChip neutral={empty} total={empty + withData} force />
          ) : (
            <CountChip>
              Sin dato: <span className="text-text">{formatInt(empty)}</span>
            </CountChip>
          )}
        </LegendSlot>
      )}
      <div
        ref={guardRef}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        tabIndex={0}
        role="group"
        aria-label={`${widget.title}. ${reference ? `${reference.label}. ` : ""}Use las flechas para recorrer los intervalos.`}
        onKeyDown={keys.onKeyDown}
        onBlur={keys.onBlur}
        onMouseLeave={hide}
      >
        <Bar
          ref={chartRef}
          data={chartData}
          options={options}
          plugins={[refLinePlugin, labelsPlugin]}
          role="img"
          aria-label={`${widget.title}: ${result.labels.map((l, i) => `${l} ${unit}: ${formatInt(result.values[i] ?? 0)}`).join(", ")}`}
        />
      </div>
      <p className="mt-1 shrink-0 text-center text-[11px] leading-4 text-muted">
        <span className="font-semibold text-text-2">{unit.charAt(0).toLocaleUpperCase("es-CO") + unit.slice(1)}</span>
        {uneven && <span> · intervalos de distinto ancho</span>}
      </p>
      <span className="sr-only" aria-live="polite">
        {keys.announce}
      </span>
      <ChartTooltip state={tip} />
    </div>
  );
}
