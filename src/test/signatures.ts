import type { KpiDef, WidgetDef } from "@/dashboards/types";

/** Lo que define la métrica de un KPI (lo visual —label, short, hero— puede cambiar). */
export function kpiSignature(k: KpiDef): string {
  return JSON.stringify({ measure: k.measure, format: k.format, polarity: k.polarity, dateField: k.dateField ?? null });
}

/**
 * Lo que define la métrica de un widget: dimensión(es), medida y filtros.
 * Quedan fuera la forma (type/viz), el tamaño, el orden y los límites de categorías (topN/maxSlices/others),
 * que solo pueden ampliarse como superconjuntos declarados.
 */
export function widgetSignature(w: WidgetDef): string {
  const pick: Record<string, unknown> = {};
  const src = w as unknown as Record<string, unknown>;
  for (const key of ["dimension", "measure", "field", "rows", "columns", "levels", "from", "to", "series", "splitBy", "bins", "breakdown", "scope", "where", "stackBy", "secondary", "columnExclude", "compare"]) {
    if (src[key] !== undefined) pick[key] = src[key];
  }
  return JSON.stringify(pick);
}
