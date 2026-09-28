"use client";

import type { Chart as ChartJS, ChartData, ChartOptions } from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { useCallback, useMemo, useRef } from "react";
import { Bar } from "react-chartjs-2";
import type { MonthlyResult } from "@/dashboards/dto";
import type { MonthlyWidget } from "@/dashboards/types";
import { registerCharts } from "@/lib/charts/register";
import { useChartTheme } from "@/lib/charts/theme";
import { formatMonth } from "@/lib/dates";
import { formatAxis, formatDelta, formatValue } from "@/lib/format";
import { categoryAxis, tooltipOptions, valueAxis } from "./chart-kit";
import { useExporter } from "./frame-context";

registerCharts();

/**
 * Barras mensuales con la variación frente al mes anterior como etiqueta.
 * Reemplaza el combo barra + línea de doble eje del tablero original.
 */
export function MonthlyChart({ widget, result, height }: { widget: MonthlyWidget; result: MonthlyResult; height: number }) {
  const theme = useChartTheme();
  const chartRef = useRef<ChartJS<"bar">>(null);
  const format = widget.valueFormat ?? "int";
  const color = theme.series[(widget.colorSlot ?? 1) - 1] ?? theme.series[0];
  const variation = useMemo(
    () => result.values.map((v, i) => (i === 0 || !result.values[i - 1] ? null : (v - result.values[i - 1]) / result.values[i - 1])),
    [result.values],
  );
  const labels = result.months.map(formatMonth);

  useExporter(useCallback(() => chartRef.current?.toBase64Image("image/png", 1) ?? null, []));

  const data: ChartData<"bar"> = useMemo(
    () => ({
      labels,
      datasets: [{ label: widget.title, data: result.values, backgroundColor: color, borderRadius: 4, borderSkipped: "start", maxBarThickness: 36, categoryPercentage: 0.7 }],
    }),
    [labels, result.values, color, widget.title],
  );

  const options: ChartOptions<"bar"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 34 } },
      scales: { y: valueAxis(theme, format), x: categoryAxis(theme, { maxChars: 12 }) },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...(tooltipOptions(theme) as object),
          callbacks: {
            label: (item) => ` ${formatValue(Number(item.raw), format)}`,
            afterLabel: (item) => {
              const d = variation[item.dataIndex];
              return d === null ? " Sin mes anterior para comparar" : ` ${formatDelta(d)} vs. mes anterior`;
            },
          },
        },
        datalabels: {
          labels: {
            value: {
              anchor: "end",
              align: "top",
              offset: 2,
              color: theme.text,
              font: { size: 11, weight: 700 },
              formatter: (v: number) => formatAxis(v, format),
            },
            delta: {
              anchor: "end",
              align: "top",
              offset: 17,
              font: { size: 10, weight: 600 },
              color: (ctx) => {
                const d = variation[ctx.dataIndex];
                return d === null ? theme.muted : theme.muted;
              },
              formatter: (_v: number, ctx) => {
                const d = variation[ctx.dataIndex];
                return d === null ? "" : `${d > 0 ? "▲" : d < 0 ? "▼" : "•"} ${formatDelta(d)}`;
              },
            },
          },
        },
      },
    }),
    [theme, format, variation],
  );

  return (
    <div style={{ height }} className="relative">
      <Bar ref={chartRef} data={data} options={options} plugins={[ChartDataLabels]} aria-label={widget.title} role="img" />
    </div>
  );
}
