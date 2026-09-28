"use client";

import dynamic from "next/dynamic";
import type { CategoryResult, WidgetResult } from "@/dashboards/dto";
import type { HistogramWidget, WidgetDef } from "@/dashboards/types";
import { Skeleton } from "@/components/ui/primitives";
import { BarChart } from "./bar-chart";
import { BarTable } from "./bar-table";
import { DonutChart } from "./donut-chart";
import { DrilldownChart } from "./drilldown-chart";
import { EfficiencyTable } from "./efficiency-table";
import { MonthlyChart } from "./monthly-chart";
import { PivotHeatmap } from "./pivot-heatmap";
import { SankeyChart } from "./sankey-chart";
import { TimeseriesChart } from "./timeseries-chart";

const ChoroplethMap = dynamic(() => import("./choropleth-map").then((m) => m.ChoroplethMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-80 w-full" />,
});

export function isEmptyResult(result: WidgetResult): boolean {
  switch (result.kind) {
    case "category":
      return result.values.every((v) => !v);
    case "timeseries":
      return result.series.every((s) => s.values.every((v) => !v));
    case "monthly":
      return result.values.every((v) => !v);
    case "pivot":
      return result.rows.length === 0;
    case "bartable":
      return result.rows.length === 0;
    case "map":
      return result.total === 0;
    case "sankey":
      return result.flows.length === 0;
    case "drilldown":
      return result.nodes.length === 0;
    case "histogram":
      return result.values.every((v) => !v);
    case "efficiency":
      return result.rows.length === 0;
  }
}

export function WidgetRenderer({ widget, result, height }: { widget: WidgetDef; result: WidgetResult; height: number }) {
  switch (widget.type) {
    case "bar":
      return <BarChart widget={widget} result={result as CategoryResult} height={height} />;
    case "donut":
      return <DonutChart widget={widget} result={result as CategoryResult} height={height} />;
    case "timeseries":
      return result.kind === "timeseries" ? <TimeseriesChart widget={widget} result={result} height={height} /> : null;
    case "monthly":
      return result.kind === "monthly" ? <MonthlyChart widget={widget} result={result} height={height} /> : null;
    case "pivot":
      return result.kind === "pivot" ? <PivotHeatmap widget={widget} result={result} height={height} /> : null;
    case "bartable":
      return result.kind === "bartable" ? <BarTable widget={widget} result={result} height={height} /> : null;
    case "map":
      return result.kind === "map" ? <ChoroplethMap widget={widget} result={result} height={height} /> : null;
    case "sankey":
      return result.kind === "sankey" ? <SankeyChart widget={widget} result={result} height={height} /> : null;
    case "drilldown":
      return result.kind === "drilldown" ? <DrilldownChart widget={widget} result={result} height={height} /> : null;
    case "histogram": {
      if (result.kind !== "histogram") return null;
      const asCategory: CategoryResult = { kind: "category", labels: result.labels, values: result.values, total: result.values.reduce((a, b) => a + b, 0) };
      const hw: HistogramWidget & { orientation: "vertical" } = { ...widget, orientation: "vertical" };
      return (
        <div className="flex h-full flex-col gap-1">
          <BarChart widget={hw} result={asCategory} height={height - 20} noCrossFilter />
          <p className="text-center text-[11px] text-muted">
            {widget.unit}
            {result.empty > 0 && ` · ${result.empty.toLocaleString("es-CO")} registros sin dato`}
          </p>
        </div>
      );
    }
    case "efficiency":
      return result.kind === "efficiency" ? <EfficiencyTable result={result} height={height} /> : null;
  }
}
