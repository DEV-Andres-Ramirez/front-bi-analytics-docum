"use client";

import type { Chart as ChartJS, ChartData, ChartOptions } from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { useCallback, useMemo, useRef } from "react";
import { Bar } from "react-chartjs-2";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import type { CategoryResult } from "@/dashboards/dto";
import type { BarWidget, HistogramWidget } from "@/dashboards/types";
import { registerCharts } from "@/lib/charts/register";
import { alpha, categoryColors, useChartTheme } from "@/lib/charts/theme";
import { formatAxis, formatPct, formatValue } from "@/lib/format";
import { categoryAxis, tooltipOptions, valueAxis } from "./chart-kit";
import { useExporter } from "./frame-context";

registerCharts();

interface Props {
  widget: BarWidget | (HistogramWidget & { orientation?: "vertical" });
  result: CategoryResult;
  height: number;
  /** Desactiva el filtro cruzado (histogramas, drill-down). */
  noCrossFilter?: boolean;
  onBarClick?: (label: string, index: number) => void;
}

export function BarChart({ widget, result, height, noCrossFilter, onBarClick }: Props) {
  const theme = useChartTheme();
  const { filters, toggleValue } = useDashboard();
  const chartRef = useRef<ChartJS<"bar">>(null);
  const horizontal = widget.type === "bar" && widget.orientation === "horizontal";
  const dimension = widget.type === "bar" ? widget.dimension : "";
  const format = (widget.type === "bar" ? widget.valueFormat : undefined) ?? "int";
  const selected = useMemo(() => filters.eq[dimension] ?? [], [filters.eq, dimension]);
  const semantic = widget.type === "bar" ? widget.semantic : undefined;
  const stacked = Boolean(result.stacks?.length);
  const secondary = widget.type === "bar" ? widget.secondary : undefined;

  useExporter(useCallback(() => chartRef.current?.toBase64Image("image/png", 1) ?? null, []));

  const data: ChartData<"bar"> = useMemo(() => {
    const dim = (i: number) => (selected.length && !selected.includes(result.labels[i]) ? 0.28 : 1);
    if (stacked) {
      const keys = result.stacks!.map((s) => s.key);
      const colors = categoryColors(theme, keys, semantic);
      return {
        labels: result.labels,
        datasets: result.stacks!.map((s, k) => ({
          label: s.key,
          data: s.values,
          backgroundColor: s.values.map((_, i) => alpha(colors[k], dim(i))),
          hoverBackgroundColor: colors[k],
          borderColor: theme.surface,
          borderWidth: horizontal ? { top: 0, right: 2, bottom: 0, left: 0 } : { top: 2, right: 0, bottom: 0, left: 0 },
          borderRadius: 0,
          maxBarThickness: 26,
          categoryPercentage: 0.72,
        })),
      };
    }
    const base = semantic ? categoryColors(theme, result.labels, semantic) : result.labels.map((l) => (l === "Otros" ? theme.other : theme.series[0]));
    return {
      labels: result.labels,
      datasets: [
        {
          label: widget.title,
          data: result.values,
          backgroundColor: base.map((c, i) => alpha(c, dim(i))),
          hoverBackgroundColor: base,
          borderRadius: 4,
          borderSkipped: "start",
          maxBarThickness: 24,
          categoryPercentage: 0.78,
        },
      ],
    };
  }, [result, theme, selected, stacked, semantic, horizontal, widget.title]);

  const many = result.labels.length > 14;
  const options: ChartOptions<"bar"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? "y" : "x",
      layout: { padding: { top: horizontal ? 0 : 18, right: horizontal ? (secondary ? 96 : 56) : 8 } },
      interaction: { mode: stacked ? "index" : "nearest", axis: horizontal ? "y" : "x", intersect: false },
      scales: {
        [horizontal ? "x" : "y"]: { ...valueAxis(theme, format, { stacked }), display: !horizontal || stacked },
        [horizontal ? "y" : "x"]: categoryAxis(theme, { stacked, horizontal, maxChars: horizontal ? 24 : many ? 8 : 12 }),
      },
      plugins: {
        legend: {
          display: stacked,
          position: "top",
          align: "end",
          labels: { color: theme.text, usePointStyle: true, pointStyle: "rectRounded", boxWidth: 10, boxHeight: 10, font: { size: 11, weight: 600 } },
        },
        tooltip: {
          ...(tooltipOptions(theme) as object),
          callbacks: {
            title: (items) => items[0]?.label ?? "",
            label: (item) => {
              const v = Number(item.raw);
              const share = !stacked && result.total && format === "int" ? ` · ${formatPct(v / result.total)}` : "";
              return ` ${stacked ? `${item.dataset.label}: ` : ""}${formatValue(v, format)}${share}`;
            },
            afterLabel: (item) => (secondary ? ` ${secondary.label}: ${formatValue(result.secondary?.[item.dataIndex] ?? null, secondary.format)}` : ""),
          },
        },
        datalabels: {
          display: (ctx) => !stacked && result.labels.length <= 24 && Number(ctx.dataset.data[ctx.dataIndex]) > 0,
          anchor: "end",
          align: horizontal ? "end" : "top",
          offset: 4,
          clamp: true,
          color: theme.text,
          font: { size: 11, weight: 600 },
          formatter: (v: number, ctx) => {
            const main = formatAxis(v, format);
            const sec = secondary ? result.secondary?.[ctx.dataIndex] : null;
            return sec !== null && sec !== undefined ? `${main} · ${formatValue(sec, secondary!.format)}` : main;
          },
        },
      },
      onHover: (e, els) => {
        const t = e.native?.target as HTMLElement | undefined;
        if (t) t.style.cursor = els.length && !noCrossFilter ? "pointer" : "default";
      },
      onClick: (_e, els) => {
        if (!els.length) return;
        const label = result.labels[els[0].index];
        if (onBarClick) return onBarClick(label, els[0].index);
        if (noCrossFilter || label === "Otros" || !dimension) return;
        toggleValue(dimension, label);
      },
    }),
    [theme, horizontal, stacked, format, many, result, secondary, noCrossFilter, onBarClick, dimension, toggleValue],
  );

  const h = horizontal ? Math.max(height, result.labels.length * (stacked ? 38 : 34) + 48) : height;
  return (
    <div style={{ height: h }} className="relative">
      <Bar ref={chartRef} data={data} options={options} plugins={[ChartDataLabels]} aria-label={widget.title} role="img" />
    </div>
  );
}
