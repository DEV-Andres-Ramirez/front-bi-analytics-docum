"use client";

import type { Chart as ChartJS, ChartData, ChartOptions } from "chart.js";
import { useCallback, useMemo, useRef } from "react";
import { Doughnut } from "react-chartjs-2";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import type { CategoryResult } from "@/dashboards/dto";
import type { DonutWidget } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { registerCharts } from "@/lib/charts/register";
import { alpha, categoryColors, useChartTheme } from "@/lib/charts/theme";
import { formatCompact, formatInt, formatPct } from "@/lib/format";
import { tooltipOptions } from "./chart-kit";
import { useExporter } from "./frame-context";

registerCharts();

export function DonutChart({ widget, result, height }: { widget: DonutWidget; result: CategoryResult; height: number }) {
  const theme = useChartTheme();
  const { filters, toggleValue } = useDashboard();
  const chartRef = useRef<ChartJS<"doughnut">>(null);
  const selected = useMemo(() => filters.eq[widget.dimension] ?? [], [filters.eq, widget.dimension]);
  const colors = useMemo(() => categoryColors(theme, result.labels, widget.semantic), [theme, result.labels, widget.semantic]);
  const total = result.values.reduce((a, b) => a + b, 0);

  useExporter(useCallback(() => chartRef.current?.toBase64Image("image/png", 1) ?? null, []));

  const data: ChartData<"doughnut"> = useMemo(
    () => ({
      labels: result.labels,
      datasets: [
        {
          data: result.values,
          backgroundColor: colors.map((c, i) => alpha(c, selected.length && !selected.includes(result.labels[i]) ? 0.25 : 1)),
          hoverBackgroundColor: colors,
          borderColor: theme.surface,
          borderWidth: 2,
          hoverOffset: 6,
          borderRadius: 4,
        },
      ],
    }),
    [result, colors, selected, theme.surface],
  );

  const select = (label: string) => label !== "Otros" && toggleValue(widget.dimension, label);

  const options: ChartOptions<"doughnut"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      layout: { padding: 6 },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...(tooltipOptions(theme) as object),
          callbacks: { label: (item) => ` ${item.label}: ${formatInt(Number(item.raw))} · ${formatPct(Number(item.raw) / (total || 1))}` },
        },
      },
      onHover: (e, els) => {
        const t = e.native?.target as HTMLElement | undefined;
        if (t) t.style.cursor = els.length ? "pointer" : "default";
      },
      onClick: (_e, els) => els.length && select(result.labels[els[0].index]),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, total, result.labels],
  );

  const donutSize = Math.min(height - 16, 210);
  return (
    <div className="@container h-full" style={{ minHeight: height }}>
    <div className="flex h-full flex-col items-center gap-4 @[520px]:flex-row @[520px]:items-center">
      <div className="relative shrink-0" style={{ width: donutSize, height: donutSize }}>
        <Doughnut ref={chartRef} data={data} options={options} aria-label={widget.title} role="img" />
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-2xl font-bold tracking-tight">{formatCompact(total)}</p>
            <p className="text-[11px] font-medium text-muted">total</p>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-0.5 self-stretch @[520px]:max-h-full @[520px]:overflow-y-auto" aria-label="Leyenda">
        {result.labels.map((label, i) => {
          const v = result.values[i];
          const on = selected.includes(label);
          const dim = selected.length > 0 && !on;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => select(label)}
                disabled={label === "Otros"}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition hover:bg-surface-3 disabled:cursor-default disabled:hover:bg-transparent",
                  on && "bg-primary-soft",
                  dim && "opacity-45",
                )}
                title={label}
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: colors[i] }} />
                <span className="min-w-0 flex-1 truncate text-text-2">{label}</span>
                <span className="tabular font-semibold">{formatCompact(v)}</span>
                <span className="tabular w-12 text-right text-xs text-muted">{formatPct(v / (total || 1))}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
    </div>
  );
}
