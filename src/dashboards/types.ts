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
  /** Etiqueta corta (≤ 16 caracteres, 1 línea) para celdas de KpiGroup. */
  short?: string;
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

// ─── Banda de KPIs (layout) ──────────────────────────────────────────────────
export type StatusTone = "good" | "info" | "warning" | "serious" | "critical" | "neutral";

export type KpiCellDef =
  /** Cifra principal: exactamente una por tablero. */
  | { kind: "hero"; kpi: string }
  /**
   * Varias métricas en una sola tarjeta, separadas por hairlines.
   * list: celdas iguales · proportion: barra 100 % con las partes (clic filtra)
   * stepper: fases en orden de proceso (la más lenta con anillo)
   * alerts: la peor variación desfavorable se resalta · pair: dos cifras relacionadas
   */
  | {
      kind: "group";
      title: string;
      variant: "list" | "proportion" | "stepper" | "alerts" | "pair";
      kpis: string[];
      /** Stepper: KPIs después del divisor (p. ej. "Ciclo total"). */
      after?: string[];
      /** Proportion: tono de cada parte (mismo orden que kpis). */
      tones?: StatusTone[];
      /** Proportion: filtro al hacer clic en cada parte (mismo orden que kpis). */
      filters?: ({ field: string; value: string } | null)[];
      /** Proportion: KPI secundario mostrado como contexto (p. ej. "398 tutelas en trámite"). */
      secondary?: string;
      /** Widget de categoría dibujado como barra dentro del grupo (conserva "Ver datos"/CSV). */
      embed?: string;
      /** Acento de tono por KPI (p. ej. pendientes en warning). */
      accents?: Record<string, StatusTone>;
      /** Enlace de ancla por KPI (#seccion). */
      anchors?: Record<string, string>;
      /** KPIs de % que muestran un medidor 0–100 % fino bajo la cifra. */
      gauges?: string[];
    }
  /** gauge: medidor 0–100 % con marcador del periodo anterior · status: borde de tono + acción · compact: fila secundaria */
  | {
      kind: "tile";
      kpi: string;
      variant: "gauge" | "status" | "compact";
      tone?: StatusTone;
      action?: { label: string; filter?: { field: string; value: string }; anchor?: string };
    };

export type KpiRowTemplate = RowTemplate | "3-3-6" | "3-6-3" | "3-4-5";

export interface KpiRowDef {
  template: KpiRowTemplate;
  /** Fila secundaria compacta (112 px). */
  compact?: boolean;
  cells: KpiCellDef[];
}

// ─── Filtros ─────────────────────────────────────────────────────────────────
export interface FilterDef {
  field: string;
  label: string;
  /** multi: selección múltiple con conteos · text: contiene · date: rango sobre otra fecha */
  kind: "multi" | "text" | "date";
  /** Visible directamente en la barra (el resto va en "Más filtros"). */
  primary?: boolean;
  /** Rótulo corto para la FilterBar ("Ente", "Tipo", "Canal"). */
  short?: string;
  placeholder?: string;
}

// ─── Widgets ─────────────────────────────────────────────────────────────────
export type WidgetSize = "sm" | "md" | "lg" | "xl" | "full";

/**
 * Familias semánticas (src/lib/charts/semantic.ts). SIEMPRE explícitas en el spec:
 * no se infieren del nombre del campo ("evento" es RADIAN o notificación según el tablero).
 */
export type SemanticFamily =
  | "semaforo"
  | "sla"
  | "cumplimiento"
  | "flujo"
  | "momento"
  | "estado-queja"
  | "notificacion"
  | "guia"
  | "factura"
  | "radian"
  | "transmision"
  | "alerta"
  | "binario"
  | "canal-envio"
  | "fallo";
/** @deprecated alias histórico; usar SemanticFamily. */
export type SemanticPalette = SemanticFamily;

/**
 * Visualización con la que se dibuja un widget (el tipo de dato elige la forma).
 * Árbol de decisión en docs/ui-design-system.md.
 */
export type Viz =
  // HTML (texto largo, nunca en canvas)
  | "ranking" // RankingList: nominales largas
  | "people" // PeopleLeaderboard: personas
  | "composition" // CompositionBar: partes de un todo (split 2–3 · legend 4–7)
  | "status-strip" // StatusStrip: estados con familia semántica ≤ 7
  | "status-board" // StatusBoard: estados de flujo > 7
  | "pipeline" // PipelineSteps: etapas con orden de proceso
  | "category-tiles" // CategoryTiles 2×2
  | "entity-tiles" // EntityTiles (siglas de entes)
  | "family-split" // FamilySplit (estado del fallo)
  | "quality-notice" // DataQualityNotice (≥ 85 % neutral)
  | "split-rows" // SplitRows: dimensión × 2–3 estados
  | "drilldown" // DrilldownBars v2
  | "pivot" // PivotHeatmap v2
  | "role-pivot" // RolePivot (varios pivotes por rol)
  | "efficiency-matrix" // EfficiencyMatrix
  | "resolution-table" // ResolutionTable
  | "heatmap" // HeatmapMatrix compacta
  // Canvas (geometría continua u ordinal)
  | "area" // AreaTimeseries
  | "column-bars" // ColumnBars ordinales
  | "monthly-delta" // MonthlyBarsDelta
  | "histogram" // Histogram v2
  | "treemap" // Treemap
  | "sankey" // Sankey v2
  // Mapa
  | "hero-map"; // HeroMap

/** Opciones de presentación por visualización (solo afectan la vista, nunca la métrica). */
export interface VizOptions {
  /** composition: split (2–3 categorías reales) · legend (4–7 partes). */
  layout?: "split" | "legend";
  /** status-strip: horizontal (tiles) · vertical (span ≤ 4) · list (lista compacta). */
  variant?: "horizontal" | "vertical" | "list";
  /** status-strip / status-board / pipeline: agrupación explícita { grupo: [etiquetas] }. */
  groups?: Record<string, string[]>;
  /** Overrides de tono/grupo por etiqueta dentro de la familia. */
  overrides?: Record<string, { tone?: StatusTone; group?: string; label?: string }>;
  /** column-bars: semana (Lun…Dom con banda sáb–dom) · copia (Ppal, 1–8). */
  preset?: "semana" | "copia";
  /** ranking/people: número de columnas forzado (si no, según ancho). */
  columns?: 1 | 2 | 3;
  /** ranking/people/split-rows: filas compactas. */
  compact?: boolean;
  /** ranking: filas de 2 líneas (etiquetas muy largas). */
  twoLine?: boolean;
  /** ranking: cabecera de concentración (top1 · top2 · resto). */
  concentration?: boolean;
  /** ranking: fila fijada destacada (p. ej. "Adquiriente no encontrado"). */
  pinned?: { label: string; cta?: string; filter?: { field: string; value: string } };
  /** ranking: bullet de la métrica secundaria con marcador en el valor global de un KPI. */
  bulletKpi?: string;
  /** histogram: referencia punteada tomada de un KPI (p. ej. promedio de días). */
  referenceKpi?: string;
  /** area: modo de dibujo; auto = columnas si > 60 % de los días son 0. */
  mode?: "auto" | "area" | "lines" | "stacked" | "columns";
  /** area/monthly-delta: token de color de la métrica (conteo = 1, COP y secundaria = 2). */
  colorSlot?: 1 | 2;
  /** Widget vecino que actúa como leyenda (StatusStrip vertical → área apilada). */
  legendFrom?: string;
  /** pipeline: rama secundaria (p. ej. reclasificación) y estados fuera de flujo. */
  branch?: string[];
  exits?: string[];
  /** pipeline: etapa final (good-soft) y etapas críticas. */
  finalStage?: string;
  criticalStages?: string[];
  /** treemap: alternar Mapa de árbol | Lista. */
  listToggle?: boolean;
  /** family-split: familias y sus miembros. */
  families?: { label: string; tone: StatusTone; members: string[] }[];
  /** category-tiles: tablero relacionado por etiqueta (enlace "Ver tablero ↗"). */
  links?: Record<string, string>;
  /** entity-tiles: siglas por etiqueta. */
  acronyms?: Record<string, string>;
  /** quality-notice: variante con mini StatusStrip de los registros con dato. */
  qualityVariant?: "list" | "status";
  /** quality-notice: visualización normal cuando lo neutral baja del 85 %. */
  fallbackViz?: Viz;
  /** hero-map: contexto adicional del panel (p. ej. municipios cubiertos). */
  mapContext?: string;
  /** pivot/role-pivot: columnas agrupadas por ciclo de vida / severidad. */
  columnFamily?: SemanticFamily;
}

interface WidgetBase {
  id: string;
  title: string;
  subtitle?: string;
  /** Solo para el empaquetador de respaldo (secciones sin rows). */
  size: WidgetSize;
  /** Nota visible (calidad de dato, fórmula provisional, etc.). */
  note?: string;
  provisional?: boolean;
  /** Alto del área de trazado en px (desktop). @deprecated el alto lo define el tier de la fila. */
  height?: number;
  /** Visualización (si se omite, se deriva del tipo). */
  viz?: Viz;
  /** Opciones de presentación de la visualización. */
  vizOptions?: VizOptions;
  /** Familia semántica explícita. */
  semantic?: SemanticFamily;
  /** Cómo se muestran las etiquetas (displayLabel). */
  labelKind?: "oficina" | "persona" | "proveedor" | "ente" | "generic";
  /** Dominio esperado de categorías (solo lo usa validateLayout). */
  maxItems?: number;
  /** Filas visibles antes de "Ver N más" (si se omite, la capacidad del tier). */
  visibleRows?: number;
  /** Protagonista (P1) del tablero: variante hero de la tarjeta. */
  hero?: boolean;
  /** Eyebrow de la tarjeta hero (p. ej. "TERRITORIO"). */
  eyebrow?: string;
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
  valueFormat?: ValueFormat;
  /** Métrica secundaria impresa como etiqueta (p. ej. % entregadas por oficina). Nunca un segundo eje. */
  secondary?: { measure: Measure; label: string; format: ValueFormat };
  /** Desactiva el filtro cruzado (histogramas, cruces derivados). */
  noCrossFilter?: boolean;
}

export interface DonutWidget extends WidgetBase {
  type: "donut";
  dimension: string;
  measure?: Measure;
  /** Máximo de porciones antes de agrupar en "Otros" (por defecto 6). */
  maxSlices?: number;
  order?: string[];
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
  /** Columnas que se muestran siempre, aunque estén en 0 (p. ej. "Vencido"). */
  stableColumns?: string[];
  /** Columnas numéricas: rellena los huecos del rango min–max (p. ej. horas del día). */
  fillNumericColumns?: boolean;
  /** Orden fijo de filas (primer nivel). */
  rowOrder?: string[];
  /** Filas que se muestran siempre, aunque estén en 0 (requiere rowOrder). */
  stableRows?: boolean;
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

// ─── Layout por filas ────────────────────────────────────────────────────────
/** Plantillas cerradas: los spans siempre suman 12. */
export type RowTemplate = "12" | "8-4" | "4-8" | "7-5" | "5-7" | "6-6" | "4-4-4" | "3-3-3-3" | "6-3-3";
/** Alto total de la tarjeta (compartido por toda la fila). auto: por contenido (tablas, pivotes). */
export type Tier = "S" | "M" | "L" | "XL" | "auto";

export type CellRef =
  /** Un widget. */
  | string
  /** Dos widgets apilados en la misma celda (solo en tier L o XL). */
  | { stack: [string, string]; ratio?: "1:1" | "3:2" }
  /** Una tarjeta que combina varios resultados (matriz día×hora con marginales, matriz de fases). */
  | { composite: "heatmap-matrix" | "phase-matrix"; id: string; widgets: string[]; title: string; subtitle?: string; hero?: boolean; eyebrow?: string }
  /** Varios widgets como pestañas dentro de una sola tarjeta. */
  | { tabs: string[]; id: string; title: string; subtitle?: string };

export interface RowDef {
  template: RowTemplate;
  tier: Tier;
  cells: CellRef[];
}

export interface SectionLegendItem {
  label: string;
  tone?: StatusTone;
  /** Token CSS (p. ej. "var(--chart-2)") cuando no es un estado. */
  color?: string;
}

export interface SectionDef {
  id: string;
  /** @deprecated usar question (H2) y nav (eyebrow). */
  title?: string;
  /** Descripción de una línea como máximo. */
  description?: string;
  /** Eyebrow corto y etiqueta de SectionNav (p. ej. "Territorio"). */
  nav?: string;
  /** H2: la pregunta que responde la sección. */
  question?: string;
  /** Codificación compartida por las tarjetas de la sección. */
  legend?: SectionLegendItem[];
  widgets: WidgetDef[];
  /** Filas con plantilla cerrada; sin rows se usa el empaquetador de respaldo. */
  rows?: RowDef[];
  /** @deprecated usar una celda { tabs }. */
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
  semantic?: SemanticFamily;
  labelKind?: "oficina" | "persona" | "proveedor" | "ente" | "generic";
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
  /** Banda de KPIs: filas con plantilla cerrada (máximo 2). */
  kpiLayout?: KpiRowDef[];
  /** Unidad de conteo del tablero ("radicado"/"radicados"): nombra la serie y los metadatos. */
  unit?: { singular: string; plural: string };
  sections: SectionDef[];
  table: DetailTableDef;
  /** Notas de calidad de datos / diferencias con el tablero original. */
  notes?: string[];
}
