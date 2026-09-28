/** DTOs que viajan del servidor (route handlers) al cliente. Solo datos agregados. */

export interface FiltersState {
  /** Rango principal YYYY-MM-DD (inclusive) sobre spec.dateField */
  from: string;
  to: string;
  /** Selección múltiple por campo */
  eq: Record<string, string[]>;
  /** Búsqueda "contiene" por campo */
  text: Record<string, string>;
  /** Rangos sobre fechas secundarias */
  dates: Record<string, { from?: string; to?: string }>;
}

export interface Range {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
}

export interface KpiResult {
  id: string;
  value: number | null;
  previous: number | null;
  /** Variación relativa vs periodo anterior (0.057 = +5,7 %); null si no hay base. */
  delta: number | null;
  spark: (number | null)[];
}

export interface CategoryResult {
  kind: "category";
  labels: string[];
  values: number[];
  total: number;
  stacks?: { key: string; values: number[] }[];
  secondary?: (number | null)[];
  /** Categorías agrupadas en "Otros". */
  folded?: number;
}

export interface TimeseriesResult {
  kind: "timeseries";
  /** Primer día de la serie (YYYY-MM-DD); un valor por día. */
  start: string;
  series: { id: string; label: string; values: number[] }[];
  previous?: number[];
  prevStart?: string;
}

export interface MonthlyResult {
  kind: "monthly";
  months: string[];
  values: number[];
}

export interface PivotRow {
  group?: string;
  label: string;
  values: number[];
  total: number;
}

export interface PivotResult {
  kind: "pivot";
  columns: string[];
  rows: PivotRow[];
  totals: number[];
  max: number;
  truncated: number;
}

export interface BarTableResult {
  kind: "bartable";
  rows: { cells: string[]; value: number }[];
  max: number;
  total: number;
}

export interface GeoValue {
  code: string;
  name: string;
  value: number;
  share: number;
  top?: { label: string; value: number }[];
}

export interface MapResult {
  kind: "map";
  dptos: GeoValue[];
  mpios: GeoValue[];
  total: number;
  /** Registros sin ubicación válida (no cruzan con DIVIPOLA). */
  unlocated: number;
}

export interface SankeyResult {
  kind: "sankey";
  flows: { from: string; to: string; value: number }[];
}

export interface DrillNode {
  label: string;
  value: number;
  stacks?: Record<string, number>;
  children?: DrillNode[];
}

export interface DrilldownResult {
  kind: "drilldown";
  nodes: DrillNode[];
  stackKeys: string[];
}

export interface HistogramResult {
  kind: "histogram";
  labels: string[];
  values: number[];
  empty: number;
}

export type EfficiencyTone = "good" | "improving" | "stable" | "worsening" | "critical" | "alert" | "unknown";

export interface EfficiencyPhase {
  message: string;
  tone: EfficiencyTone;
  /** Promedio semanal (últimas 3 semanas, de la más antigua a la actual). */
  values: (number | null)[];
  quartiles: (number | null)[];
}

export interface EfficiencyResult {
  kind: "efficiency";
  weeks: string[];
  rows: {
    gerencia: string;
    ranking: number | null;
    score: number | null;
    phases: Record<"asignacion" | "gestion" | "revision" | "aprobacion", EfficiencyPhase>;
  }[];
}

export type WidgetResult =
  | CategoryResult
  | TimeseriesResult
  | MonthlyResult
  | PivotResult
  | BarTableResult
  | MapResult
  | SankeyResult
  | DrilldownResult
  | HistogramResult
  | EfficiencyResult;

export interface FilterOption {
  value: string;
  count: number;
}

export interface DashboardResponse {
  slug: string;
  range: Range;
  source: "mock" | "db";
  rowsInRange: number;
  generatedAt: string;
  kpis: KpiResult[];
  widgets: Record<string, WidgetResult>;
  options: Record<string, FilterOption[]>;
  /** Nombres legibles de los códigos DANE usados en filtros geográficos activos. */
  geoNames: Record<string, string>;
}

export interface DetailResponse {
  total: number;
  page: number;
  size: number;
  rows: Record<string, string | number | null>[];
}
