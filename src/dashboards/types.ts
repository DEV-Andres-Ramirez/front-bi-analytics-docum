/**
 * Contrato declarativo de los tableros.
 *
 * Un tablero es un `DashboardSpec`: datos puros (sin funciones) que el servidor
 * ejecuta contra un DataProvider (hoy MockProvider en memoria; mañana SQL sobre
 * las vistas) y que el cliente usa para pintar filtros, KPIs y widgets.
 * Todo nombre de campo (`field`) es una columna canónica del dataset
 * (ver src/server/data/datasets/*).
 */

// ─── Formatos ────────────────────────────────────────────────────────────────
export type ValueFormat = "int" | "decimal" | "pct" | "days" | "cop" | "compact";

// ─── Predicados (filtran filas dentro de una medida o widget) ────────────────
export type Predicate =
  | { field: string; in: string[] }
  | { field: string; notIn: string[] }
  | { field: string; notEmpty: true }
  | { field: string; isEmpty: true }
  | { field: string; gt?: number; gte?: number; lt?: number; lte?: number }
  | { lteField: [string, string] }
  | { and: Predicate[] }
  | { or: Predicate[] }
  | { not: Predicate };

// ─── Medidas ─────────────────────────────────────────────────────────────────
export type Measure =
  | { kind: "count"; where?: Predicate }
  | { kind: "countDistinct"; field: string; where?: Predicate }
  | { kind: "sum"; field: string; where?: Predicate }
  | { kind: "avg"; field: string; where?: Predicate }
  /** Proporción de filas (0..1): filas que cumplen `num` sobre filas que cumplen `den` (o todas). */
  | { kind: "ratio"; num: Predicate; den?: Predicate }
  /** Cociente entre dos medidas (p. ej. desacatos / fallos de 1ª instancia). */
  | { kind: "ratioOf"; num: Measure; den: Measure };

export type Polarity = "up-good" | "up-bad" | "neutral";

// ─── KPIs ────────────────────────────────────────────────────────────────────
export interface KpiDef {
  id: string;
  label: string;
  measure: Measure;
  format: ValueFormat;
  polarity: Polarity;
  /** "¿Cómo se calcula?" en lenguaje de negocio. */
  hint: string;
  /** Fórmula no confirmada por negocio: se marca en la UI. */
  provisional?: boolean;
  /** Campo de fecha alterno para el rango (p. ej. aprobados en el periodo). */
  dateField?: string;
  /** Destacar como cifra principal del tablero (una por tablero). */
  hero?: boolean;
}

// ─── Filtros ─────────────────────────────────────────────────────────────────
export interface FilterDef {
  field: string;
  label: string;
  /** multi: selección múltiple con conteos · text: contiene · date: rango sobre otra fecha */
  kind: "multi" | "text" | "date";
  /** Visible directamente en la barra (el resto va en "Más filtros"). */
  primary?: boolean;
  placeholder?: string;
}

// ─── Widgets ─────────────────────────────────────────────────────────────────
export type WidgetSize = "sm" | "md" | "lg" | "xl" | "full";
export type SemanticPalette = "semaforo" | "sla" | "momento" | "cumplimiento" | "estado-queja" | "si-no";

interface WidgetBase {
  id: string;
  title: string;
  subtitle?: string;
  size: WidgetSize;
  /** Nota visible (calidad de dato, fórmula provisional, etc.). */
  note?: string;
  provisional?: boolean;
  /** Alto del área de trazado en px (desktop). */
  height?: number;
}

export interface BarWidget extends WidgetBase {
  type: "bar";
  dimension: string;
  measure?: Measure;
  orientation: "vertical" | "horizontal";
  topN?: number;
  /** Agrupa el resto en "Otros". */
  others?: boolean;
  sort?: "desc" | "asc" | "label" | "natural";
  /** Orden fijo de categorías (si sort = natural). */
  order?: string[];
  stackBy?: string;
  stackOrder?: string[];
  semantic?: SemanticPalette;
  valueFormat?: ValueFormat;
  /** Métrica secundaria impresa como etiqueta (p. ej. % entregadas por oficina). Nunca un segundo eje. */
  secondary?: { measure: Measure; label: string; format: ValueFormat };
}

export interface DonutWidget extends WidgetBase {
  type: "donut";
  dimension: string;
  measure?: Measure;
  /** Máximo de porciones antes de agrupar en "Otros" (por defecto 6). */
  maxSlices?: number;
  order?: string[];
  semantic?: SemanticPalette;
}

export interface TimeseriesWidget extends WidgetBase {
  type: "timeseries";
  /** Series explícitas (cada una con su medida y, opcional, otra fecha). */
  series?: { id: string; label: string; measure?: Measure; dateField?: string }[];
  /** Divide en varias líneas por una dimensión. */
  splitBy?: string;
  splitTopN?: number;
  /** Dibuja el periodo anterior como línea tenue. */
  compare?: boolean;
  valueFormat?: ValueFormat;
}

export interface MonthlyWidget extends WidgetBase {
  type: "monthly";
  measure?: Measure;
  valueFormat?: ValueFormat;
  /** ytd: enero → hoy (ignora el rango, respeta los demás filtros) · range: meses del rango filtrado */
  scope: "ytd" | "range";
  /** Color de las barras (slot categórico 1-8). */
  colorSlot?: number;
}

export interface PivotWidget extends WidgetBase {
  type: "pivot";
  /** 1 o 2 niveles de fila (p. ej. Oficina › Persona). */
  rows: { field: string; label: string }[];
  columns: { field: string; label: string };
  columnOrder?: string[];
  columnExclude?: string[];
  where?: Predicate;
  measure?: Measure;
  maxRows?: number;
}

export interface BarTableWidget extends WidgetBase {
  type: "bartable";
  columns: { field: string; label: string }[];
  measure?: Measure;
  measureLabel: string;
  valueFormat?: ValueFormat;
  topN?: number;
  where?: Predicate;
}

export interface MapWidget extends WidgetBase {
  type: "map";
  measure?: Measure;
  /** Dimensión para el desglose en el tooltip (p. ej. Canal, Etapa procesal). */
  breakdown?: { field: string; label: string };
  /** Qué geografía representa (texto de la leyenda). */
  geoLabel: string;
}

export interface SankeyWidget extends WidgetBase {
  type: "sankey";
  from: { field: string; label: string };
  to: { field: string; label: string };
}

export interface DrilldownWidget extends WidgetBase {
  type: "drilldown";
  levels: { field: string; label: string }[];
  stackBy?: string;
  stackOrder?: string[];
  semantic?: SemanticPalette;
  topN?: number;
}

export interface HistogramWidget extends WidgetBase {
  type: "histogram";
  field: string;
  unit: string;
  /** Límites superiores inclusivos de cada intervalo. */
  bins: number[];
}

export interface EfficiencyWidget extends WidgetBase {
  type: "efficiency";
}

export type WidgetDef =
  | BarWidget
  | DonutWidget
  | TimeseriesWidget
  | MonthlyWidget
  | PivotWidget
  | BarTableWidget
  | MapWidget
  | SankeyWidget
  | DrilldownWidget
  | HistogramWidget
  | EfficiencyWidget;

export interface SectionDef {
  id: string;
  title?: string;
  description?: string;
  widgets: WidgetDef[];
  /** Muestra los widgets como pestañas dentro de una sola tarjeta. */
  tabs?: boolean;
}

// ─── Tabla de detalle ────────────────────────────────────────────────────────
export type ColumnFormat = "text" | "date" | "datetime" | "int" | "decimal" | "cop" | "days" | "badge" | "mono" | "long";

export interface ColumnDef {
  field: string;
  label: string;
  format?: ColumnFormat;
  /** Visible por defecto (si se omite, sí). */
  visible?: boolean;
  semantic?: SemanticPalette;
}

export interface DetailTableDef {
  title: string;
  columns: ColumnDef[];
  searchFields: string[];
  defaultSort: { field: string; dir: "asc" | "desc" };
}

// ─── Tablero ─────────────────────────────────────────────────────────────────
export interface DashboardSpec {
  slug: string;
  /** Dataset canónico (src/server/data/datasets). */
  dataset: string;
  dateField: string;
  dateLabel: string;
  filters: FilterDef[];
  kpis: KpiDef[];
  sections: SectionDef[];
  table: DetailTableDef;
  /** Notas de calidad de datos / diferencias con el tablero original. */
  notes?: string[];
}
