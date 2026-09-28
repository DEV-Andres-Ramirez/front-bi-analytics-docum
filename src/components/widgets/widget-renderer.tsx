"use client";

import dynamic from "next/dynamic";
import type { CategoryResult, WidgetResult } from "@/dashboards/dto";
import type { Viz, WidgetDef } from "@/dashboards/types";
import { resolveViz } from "@/dashboards/viz";
import { AreaTimeseries } from "./area-timeseries";
import { CategoryTiles } from "./category-tiles";
import { ColumnBars } from "./column-bars";
import { CompositionBar } from "./composition-bar";
import { DrilldownBars } from "./drilldown-bars";
import { EfficiencyMatrix } from "./efficiency-matrix";
import { EntityTiles } from "./entity-tiles";
import { FamilySplit } from "./family-split";
import { HeatmapComposite, HeatmapMatrix } from "./heatmap-matrix";
import { Histogram } from "./histogram";
import { neutralShare, QUALITY_NOTICE_MIN } from "./kit/quality";
import { VizSkeleton } from "./kit/viz-states";
import { MonthlyBarsDelta } from "./monthly-bars";
import { PeopleLeaderboard } from "./people-leaderboard";
import { PhaseMatrix } from "./phase-matrix";
import { PipelineSteps } from "./pipeline-steps";
import { PivotHeatmapV2, RolePivot } from "./pivot-v2";
import { DataQualityNotice } from "./quality-notice";
import { RankingList } from "./ranking-list";
import { ResolutionTable } from "./resolution-table";
import { SplitRows } from "./split-rows";
import { StatusBoard } from "./status-board";
import { StatusStrip } from "./status-strip";
import type { CompositeProps, VizProps } from "./types";

// Pesados: se cargan solo cuando la tarjeta entra al viewport
const HeroMap = dynamic(() => import("./map/hero-map").then((m) => m.HeroMap), { ssr: false, loading: () => <VizSkeleton viz="hero-map" /> });
const Treemap = dynamic(() => import("./treemap").then((m) => m.Treemap), { ssr: false, loading: () => <VizSkeleton viz="treemap" /> });
const SankeyV2 = dynamic(() => import("./sankey-v2").then((m) => m.SankeyV2), { ssr: false, loading: () => <VizSkeleton viz="sankey" /> });

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
      return result.values.every((v) => !v) && !result.empty;
    case "efficiency":
      return result.rows.length === 0;
  }
}

/** Visualizaciones de categoría que se convierten en aviso de calidad con ≥ 85 % neutral. */
const QUALITY_SWITCH = new Set<Viz>(["ranking", "people", "composition", "status-strip", "column-bars", "treemap", "category-tiles", "entity-tiles", "pipeline"]);

/** Visualización efectiva para un resultado concreto (aviso de calidad ↔ visual normal). */
export function effectiveViz(widget: WidgetDef, result: WidgetResult): Viz {
  const viz = resolveViz(widget);
  const cat =
    result.kind === "category"
      ? { labels: result.labels, values: result.values, total: result.total }
      : result.kind === "bartable" && widget.type === "bartable" && widget.columns.length === 1
        ? { labels: result.rows.map((r) => r.cells[0] ?? ""), values: result.rows.map((r) => r.value), total: result.total }
        : null;
  if (!cat) return viz;
  const { share } = neutralShare(cat.labels, cat.values, cat.total);
  if (viz === "quality-notice") return share >= QUALITY_NOTICE_MIN ? viz : (widget.vizOptions?.fallbackViz ?? "ranking");
  // La lista compacta del StatusStrip ya muestra lo neutral como cabecera fuera de escala
  const keepsNeutral = viz === "status-strip" && widget.vizOptions?.variant === "list";
  if (QUALITY_SWITCH.has(viz) && !keepsNeutral && share >= QUALITY_NOTICE_MIN) return "quality-notice";
  return viz;
}

type AnyProps = VizProps<never, never>;

export function WidgetRenderer({ widget, result, height, span, expanded }: VizProps) {
  const viz = effectiveViz(widget, result);
  const p = { widget, result, height, span, expanded } as unknown as AnyProps;
  switch (viz) {
    case "ranking":
      return <RankingList {...p} />;
    case "people":
      return <PeopleLeaderboard {...p} />;
    case "composition":
      return <CompositionBar {...p} />;
    case "status-strip":
      return <StatusStrip {...p} />;
    case "status-board":
      return <StatusBoard {...p} />;
    case "pipeline":
      return <PipelineSteps {...p} />;
    case "category-tiles":
      return <CategoryTiles {...p} />;
    case "entity-tiles":
      return <EntityTiles {...p} />;
    case "family-split":
      return <FamilySplit {...p} />;
    case "quality-notice":
      return <DataQualityNotice {...p} />;
    case "split-rows":
      return <SplitRows {...p} />;
    case "drilldown":
      return <DrilldownBars {...p} />;
    case "pivot":
      return <PivotHeatmapV2 {...p} />;
    case "role-pivot":
      return <RolePivot {...p} />;
    case "efficiency-matrix":
      return <EfficiencyMatrix {...p} />;
    case "resolution-table":
      return <ResolutionTable {...p} />;
    case "heatmap":
      return <HeatmapMatrix {...p} />;
    case "area":
      return <AreaTimeseries {...p} />;
    case "column-bars":
      return <ColumnBars {...p} />;
    case "monthly-delta":
      return <MonthlyBarsDelta {...p} />;
    case "histogram":
      return <Histogram {...p} />;
    case "treemap":
      return <Treemap {...p} />;
    case "sankey":
      return <SankeyV2 {...p} />;
    case "hero-map":
      return <HeroMap {...p} />;
  }
}

export function CompositeRenderer(props: CompositeProps) {
  if (props.cell.composite === "phase-matrix") return <PhaseMatrix {...props} />;
  return <HeatmapComposite {...props} />;
}

/** Resultado de categoría con datos (para componentes que lo necesiten como guardia). */
export function hasCategoryData(r: WidgetResult | undefined): r is CategoryResult {
  return Boolean(r && r.kind === "category" && r.values.some((v) => v));
}
