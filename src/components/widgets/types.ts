import type { WidgetResult } from "@/dashboards/dto";
import type { CellRef, WidgetDef } from "@/dashboards/types";

/**
 * Contrato común de toda visualización de tablero.
 * - El componente LLENA su contenedor (.dash-body es flex-1 con alto definido por el tier de la fila);
 *   los canvas usan un div `relative h-full` y Chart.js con maintainAspectRatio: false.
 * - `height` es el presupuesto del cuerpo en px a ancho de diseño (0 = por contenido): úsalo
 *   para decidir capacidad (filas visibles), nunca para fijar el alto del DOM.
 * - Filtro cruzado con useDashboard().toggleValue(dimension, label); lo seleccionado está en
 *   useDashboard().filters.eq[dimension] (el widget de origen conserva todas sus categorías).
 * - Leyendas y chips van en <LegendSlot> (franja de 24 px bajo el header).
 * - Tooltips con useChartTooltip + <ChartTooltip> (kit/chart-tooltip).
 */
export interface VizProps<W extends WidgetDef = WidgetDef, R extends WidgetResult = WidgetResult> {
  widget: W;
  result: R;
  /** Presupuesto de alto del cuerpo (px, escritorio). 0 = por contenido. */
  height: number;
  /** Columnas (de 12) que ocupa la celda: orienta el número de columnas de listas antes de medir. */
  span: number;
  /** Dentro del diálogo "Ampliar". */
  expanded?: boolean;
}

export type CompositeCell = Extract<CellRef, { composite: string }>;

/** Tarjeta que combina varios resultados (matriz día×hora con marginales, matriz de fases). */
export interface CompositeProps {
  cell: CompositeCell;
  widgets: WidgetDef[];
  /** Mismo orden que widgets; undefined mientras carga. */
  results: (WidgetResult | undefined)[];
  height: number;
  span: number;
  expanded?: boolean;
}
