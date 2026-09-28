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
import { chartToPng, labelsPlugin, shortNumber, useChartAnimation, useChartKeyboard, useChartResizeGuard, type CanvasLabel } from "./canvas-helpers";
import { useExporter } from "./frame-context";
import { ChartTooltip, chartJsExternal, useChartTooltip, type TooltipContent } from "./kit/chart-tooltip";
import { LegendSlot } from "./kit/legend-slot";
import type { VizProps } from "./types";

registerCharts();

/**
 * MonthlyBarsDelta · barras mensuales con la variación frente al mes anterior en una fila
 * HTML de chips alineada por x (sin doble eje). docs/ui-design-system.md §MonthlyBarsDelta.
 * - Color por token de métrica (conteo chart-1 · COP chart-2), maxBarThickness 32.
 * - Omite los meses iniciales en 0; mes en curso al 55 % con "parcial".
 * - Valor arriba con UNA sola unidad (COP: unidad común en la franja).
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
  const { data, filters } = useDashboard();
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
  const polarity: Polarity = (widget as MonthlyWidget & { polarity?: Polarity }).polarity ?? "neutral";

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
  const valueText = useCallback(
    (v: number) => (isCop ? shortNumber(v / unit.divisor) : format === "int" ? (Math.abs(v) >= 100_000 ? formatCompact(v) : formatInt(v)) : formatValue(v, format)),
    [isCop, unit.divisor, format],
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

  const chartData: ChartData<"bar", number[], string> = useMemo(
    () => ({
      labels: cols.map((c) => c.tick),
      datasets: [
        {
          label: widget.title,
          data: cols.map((c) => c.value),
          backgroundColor: cols.map((c) => (c.partial ? alpha(color, 0.55) : color)),
          hoverBackgroundColor: color,
          borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
          borderSkipped: "start",
          maxBarThickness: 32,
          categoryPercentage: 0.72,
          barPercentage: 0.9,
        },
      ],
    }),
    [cols, widget.title, color],
  );

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
          // Sin eje Y: las categorías reparten todo el ancho y la fila de Δ se alinea por x
          y: { display: false, beginAtZero: true, grace: "12%" },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false, external },
          docLabels: { items: labels, text: theme.text, muted: theme.muted, surface: theme.surface, kind: "bar" },
        },
      }) as unknown as ChartOptions<"bar">,
    [motion, theme, external, labels],
  );

  const colW = n ? width / n : width;
  const density = chipDensity(cols, colW, format);

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      {isCop && unit.suffix && (
        <LegendSlot>
          <span className="text-[11px] text-muted">
            Cifras en <span className="font-semibold text-text-2">{UNIT_TEXT[unit.suffix] ?? unit.suffix} de pesos</span>
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
          plugins={[labelsPlugin]}
          role="img"
          aria-label={`${widget.title}: ${cols.map((c) => `${c.full} ${formatValue(c.value, format)}`).join(", ")}`}
        />
      </div>
      <ul role="list" aria-label="Variación frente al mes anterior" className="mt-1 grid shrink-0" style={{ gridTemplateColumns: `repeat(${Math.max(1, n)}, minmax(0, 1fr))` }}>
        {cols.map((c) => (
          <li key={c.ym} className="flex min-w-0 justify-center">
            <DeltaCell col={c} density={density} format={format} />
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
 * Densidad de la fila de Δ según el chip más ancho (la misma para toda la fila). Siempre a 10,5 px
 * y con espacio antes del % (mismo formato que el DeltaChip de los KPIs):
 * - "full": ícono + 1 decimal ("−6,3 %") · requiere columnas de ≥ 58 px;
 * - "text": 1 decimal sin ícono · requiere columnas de ≥ 58 px;
 * - "int": entero sin ícono ("−23 %");
 * - "arrow": solo la flecha con el tono; la cifra va en el tooltip y en el texto accesible.
 */
type Density = "full" | "text" | "int" | "arrow";
/** Ancho aproximado de un carácter de cifra a 10,5 px / 600 (Montserrat, tabular). */
const CH = 6.5;
/** Espacio no separable entre la cifra y la unidad (el mismo de formatDelta en los KPIs). */
const NBSP = "\u00A0";

function intText(d: DeltaInfo, format: ValueFormat): string {
  const sign = d.direction === "down" ? "−" : d.direction === "up" ? "+" : "";
  return `${sign}${Math.round(Math.abs(d.magnitude) * 100)}${NBSP}${format === "pct" ? "p.p." : "%"}`;
}
/** Ancho estimado de un texto de Δ (el espacio cuenta ~½ carácter). */
const textWidth = (t: string) => t.replace(/\s/g, "").length * CH + (/\s/.test(t) ? 3 : 0);

function chipDensity(cols: MonthCol[], colW: number, format: ValueFormat): Density {
  const avail = colW - 6;
  const deltas = cols.map((c) => c.delta).filter((d): d is DeltaInfo => Boolean(d && d.reason !== "no-base"));
  const widest = (f: (d: DeltaInfo) => string) => Math.max(0, ...deltas.map((d) => textWidth(f(d))));
  if (colW >= 58 && widest((d) => d.text) + 12 + 2 + 12 <= avail) return "full";
  if (colW >= 58 && widest((d) => d.text) + 12 <= avail) return "text";
  if (widest((d) => intText(d, format)) + 8 <= avail) return "int";
  return "arrow";
}

function DeltaCell({ col, density, format }: { col: MonthCol; density: Density; format: ValueFormat }) {
  const base = "tabular inline-flex h-5 items-center justify-center gap-0.5 whitespace-nowrap rounded-full text-[10.5px] font-semibold";
  const pad = density === "int" ? "px-1" : density === "arrow" ? "w-5 px-0" : "px-1.5";
  if (col.partial)
    return (
      <Tooltip content="Mes en curso: la variación se calcula al cierre del mes.">
        <span
          className={cn(
            base,
            "font-medium text-muted",
            // Con columnas angostas: texto con subrayado punteado, sin caja (es el último mes y puede desbordar 2–3 px)
            density === "int" || density === "arrow" ? "rounded-none border-b border-dashed border-muted px-0" : "border border-dashed border-border px-1.5",
          )}
        >
          parcial
        </span>
      </Tooltip>
    );
  const d = col.delta;
  if (!d || d.reason === "no-base")
    return (
      <span className={cn(base, pad, "text-muted")} aria-label={col.prev === null ? "Sin mes anterior" : "Sin base de comparación"}>
        —
      </span>
    );
  const Icon = d.direction === "up" ? TrendingUp : d.direction === "down" ? TrendingDown : Minus;
  const text = density === "int" ? intText(d, format) : d.text;
  const full = `${col.full}: ${d.text} frente a ${col.prevName} (${formatValue(col.prev, format)}).${d.reason === "small-base" ? " Base pequeña: no se colorea." : ""}`;
  return (
    <Tooltip content={full} focusable={density === "arrow"}>
      <span
        className={cn(
          base,
          pad,
          d.tone === "good" && "bg-good-soft text-good-ink",
          d.tone === "bad" && "bg-critical-soft text-critical-ink",
          d.tone === "neutral" && "bg-surface-3 text-text-2",
        )}
        role={density === "arrow" ? "img" : undefined}
        aria-label={density === "arrow" ? full : undefined}
      >
        {(density === "full" || density === "arrow") && <Icon className="size-3" aria-hidden />}
        {density !== "arrow" && text}
      </span>
    </Tooltip>
  );
}
