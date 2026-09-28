"use client";

import type { Chart as ChartJS, ChartData, ChartOptions, ScriptableContext } from "chart.js";
import { useCallback, useMemo, useRef, useState } from "react";
import { Line } from "react-chartjs-2";
import { Segmented } from "@/components/ui/primitives";
import type { TimeseriesResult } from "@/dashboards/dto";
import type { TimeseriesWidget, ValueFormat } from "@/dashboards/types";
import { registerCharts } from "@/lib/charts/register";
import { alpha, categoryColors, useChartTheme } from "@/lib/charts/theme";
import { DAY_MS, MONTHS_ES, isoToMs, weekStart } from "@/lib/dates";
import { formatValue } from "@/lib/format";
import { areaGradient, categoryAxis, crosshairPlugin, tooltipOptions, valueAxis } from "./chart-kit";
import { useExporter } from "./frame-context";

registerCharts();

type Gran = "day" | "week" | "month";

function bucketKey(ms: number, g: Gran): number {
  if (g === "day") return ms;
  if (g === "week") return weekStart(ms);
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function label(ms: number, g: Gran): string {
  const d = new Date(ms);
  if (g === "month") return `${MONTHS_ES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const s = `${d.getUTCDate()} ${MONTHS_ES[d.getUTCMonth()]}`;
  return g === "week" ? `sem. ${s}` : s;
}

/** Reagrupa valores diarios (aditivos) a semana o mes. */
function regroup(start: string, values: number[], g: Gran) {
  const s = isoToMs(start);
  const keys: number[] = [];
  const sums = new Map<number, number>();
  values.forEach((v, i) => {
    const k = bucketKey(s + i * DAY_MS, g);
    if (!sums.has(k)) keys.push(k);
    sums.set(k, (sums.get(k) ?? 0) + v);
  });
  return { keys, values: keys.map((k) => sums.get(k) ?? 0) };
}

export function TimeseriesChart({ widget, result, height }: { widget: TimeseriesWidget; result: TimeseriesResult; height: number }) {
  const theme = useChartTheme();
  const chartRef = useRef<ChartJS<"line">>(null);
  const days = result.series[0]?.values.length ?? 0;
  const auto: Gran = days <= 62 ? "day" : days <= 240 ? "week" : "month";
  const [gran, setGran] = useState<Gran | null>(null);
  const g = gran ?? auto;
  const format: ValueFormat = widget.valueFormat ?? "int";
  const multi = result.series.length > 1;

  useExporter(useCallback(() => chartRef.current?.toBase64Image("image/png", 1) ?? null, []));

  const grouped = useMemo(() => result.series.map((s) => ({ ...s, ...regroup(result.start, s.values, g) })), [result, g]);
  const prev = useMemo(() => (result.previous && result.prevStart ? regroup(result.prevStart, result.previous, g) : null), [result, g]);
  const colors = useMemo(() => categoryColors(theme, result.series.map((s) => s.label)), [theme, result.series]);

  const labels = useMemo(() => grouped[0]?.keys.map((k) => label(k, g)) ?? [], [grouped, g]);
  const data: ChartData<"line"> = useMemo(() => {
    const ds: ChartData<"line">["datasets"] = grouped.map((s, i) => ({
      label: s.label,
      data: s.values,
      borderColor: colors[i],
      backgroundColor: multi ? alpha(colors[i], 0) : (ctx: ScriptableContext<"line">) => areaGradient(ctx.chart, colors[i]),
      fill: !multi,
      borderWidth: 2,
      tension: 0.35,
      cubicInterpolationMode: "monotone" as const,
      pointRadius: s.values.length <= 1 ? 4 : 0,
      pointHoverRadius: 5,
      pointBackgroundColor: colors[i],
      pointBorderColor: theme.surface,
      pointBorderWidth: 2,
    }));
    if (prev) {
      ds.push({
        label: "Periodo anterior",
        data: prev.values.slice(0, labels.length),
        borderColor: alpha(theme.tick, 0.55),
        backgroundColor: "transparent",
        borderWidth: 1.5,
        tension: 0.35,
        cubicInterpolationMode: "monotone" as const,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: false,
      });
    }
    return { labels, datasets: ds };
  }, [grouped, colors, multi, prev, labels, theme]);

  const options: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 8, right: 8 } },
      scales: {
        y: valueAxis(theme, format),
        x: { ...categoryAxis(theme, { maxChars: 14 }), ticks: { ...categoryAxis(theme).ticks, autoSkip: true, maxTicksLimit: 10 } },
      },
      plugins: {
        legend: {
          display: multi || Boolean(prev),
          position: "top",
          align: "end",
          labels: { color: theme.text, usePointStyle: true, pointStyle: "line", boxWidth: 18, font: { size: 11, weight: 600 } },
        },
        tooltip: {
          ...(tooltipOptions(theme) as object),
          callbacks: {
            label: (item) => ` ${item.dataset.label}: ${formatValue(Number(item.raw), format)}`,
            title: (items) => {
              const i = items[0]?.dataIndex ?? 0;
              if (items[0]?.dataset.label === "Periodo anterior" && prev) return `${labels[i]} (anterior: ${label(prev.keys[i], g)})`;
              return labels[i];
            },
          },
        },
        crosshair: { color: alpha(theme.tick, 0.45) },
      },
    }),
    [theme, format, multi, prev, labels, g],
  );

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {days} {days === 1 ? "día" : "días"} · agrupado por {g === "day" ? "día" : g === "week" ? "semana" : "mes"}
        </p>
        <Segmented
          label="Granularidad"
          value={g}
          onChange={setGran}
          options={[
            { value: "day", label: "Día" },
            { value: "week", label: "Semana" },
            { value: "month", label: "Mes" },
          ]}
        />
      </div>
      <div style={{ height: height - 36 }} className="relative">
        <Line ref={chartRef} data={data} options={options} plugins={[crosshairPlugin]} aria-label={widget.title} role="img" />
      </div>
    </div>
  );
}
