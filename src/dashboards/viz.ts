import type { Viz, WidgetDef } from "./types";

/** Visualización efectiva de un widget: la declarada o la derivada de su tipo. */
export function resolveViz(w: WidgetDef): Viz {
  if (w.viz) return w.viz;
  switch (w.type) {
    case "bar":
      if (w.stackBy) return "split-rows";
      return w.orientation === "horizontal" ? "ranking" : "column-bars";
    case "donut":
      return "composition";
    case "timeseries":
      return "area";
    case "monthly":
      return "monthly-delta";
    case "pivot":
      return "pivot";
    case "bartable":
      return "ranking";
    case "map":
      return "hero-map";
    case "sankey":
      return "sankey";
    case "drilldown":
      return "drilldown";
    case "histogram":
      return "histogram";
    case "efficiency":
      return "efficiency-matrix";
  }
}

/** Formas de barra horizontal (regla anti-monotonía: ≤ 40 % de las celdas, ≤ 2 por sección). */
export const HORIZONTAL_VIZ = new Set<Viz>(["ranking", "people", "split-rows", "drilldown"]);

/** Visualizaciones dibujadas en canvas (Chart.js): exportan PNG del canvas. */
export const CANVAS_VIZ = new Set<Viz>(["area", "column-bars", "monthly-delta", "histogram", "treemap", "sankey"]);

/** Visualizaciones que usan la franja de leyenda de 24 px bajo el header (se reserva en toda la fila). */
export const LEGEND_STRIP_VIZ = new Set<Viz>(["area", "column-bars", "monthly-delta", "histogram", "treemap"]);

/** Visualizaciones con alto por contenido (tier "auto"). */
export const CONTENT_VIZ = new Set<Viz>(["pivot", "role-pivot", "efficiency-matrix", "resolution-table"]);
