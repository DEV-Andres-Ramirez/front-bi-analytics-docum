"use client";

import type { Chart as ChartJS } from "chart.js";
import { useCallback, useMemo, useRef } from "react";
import { Chart } from "react-chartjs-2";
import type { SankeyResult } from "@/dashboards/dto";
import type { SankeyWidget } from "@/dashboards/types";
import { registerCharts } from "@/lib/charts/register";
import { semanticVar } from "@/lib/charts/semantic";
import { categoryColors, useChartTheme } from "@/lib/charts/theme";
import { formatInt } from "@/lib/format";
import { tooltipOptions } from "./chart-kit";
import { useExporter } from "./frame-context";

registerCharts();

export function SankeyChart({ widget, result, height }: { widget: SankeyWidget; result: SankeyResult; height: number }) {
  const theme = useChartTheme();
  const chartRef = useRef<ChartJS>(null);
  useExporter(useCallback(() => chartRef.current?.toBase64Image("image/png", 1) ?? null, []));

  const fromLabels = useMemo(() => [...new Set(result.flows.map((f) => f.from))], [result.flows]);
  const toLabels = useMemo(() => [...new Set(result.flows.map((f) => f.to))], [result.flows]);
  const fromColors = useMemo(() => Object.fromEntries(categoryColors(theme, fromLabels).map((c, i) => [fromLabels[i], c])), [theme, fromLabels]);
  const toColor = useCallback((l: string) => theme.resolve(semanticVar("momento", l) ?? "var(--chart-other)"), [theme]);

  // Los nombres de nodo destino se sufijan para que no colisionen con los de origen
  const data = useMemo(
    () => ({
      datasets: [
        {
          label: widget.title,
          data: result.flows.map((f) => ({ from: f.from, to: `→ ${f.to}`, flow: f.value })),
          colorFrom: (c: { dataset: { data: { from: string }[] }; dataIndex: number }) => fromColors[c.dataset.data[c.dataIndex].from] ?? theme.other,
          colorTo: (c: { dataset: { data: { to: string }[] }; dataIndex: number }) => toColor(c.dataset.data[c.dataIndex].to.slice(2)),
          colorMode: "gradient",
          alpha: 0.55,
          borderWidth: 0,
          nodeWidth: 12,
          nodePadding: 14,
          color: theme.text,
          font: { size: 11, weight: 600 },
          size: "max",
        },
      ],
    }),
    [result.flows, widget.title, fromColors, toColor, theme],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: 4, right: 4, top: 6, bottom: 6 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...(tooltipOptions(theme) as object),
          callbacks: {
            title: () => "",
            label: (item: { raw: { from: string; to: string; flow: number } }) => ` ${item.raw.from} ${item.raw.to}: ${formatInt(item.raw.flow)}`,
          },
        },
      },
    }),
    [theme],
  );

  return (
    <div style={{ height }} className="relative">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Chart ref={chartRef as any} type={"sankey" as any} data={data as any} options={options as any} aria-label={widget.title} role="img" />
      <p className="sr-only">{toLabels.join(", ")}</p>
    </div>
  );
}
