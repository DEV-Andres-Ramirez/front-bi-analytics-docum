import type { DashboardSpec, PivotWidget } from "../types";
import { count, is, SEMAFORO_ORDER, SEMAFORO_TILE_LABELS, SLA_ORDER } from "./helpers";

const MOMENTO = ["GESTIÓN", "CIERRE"];

const slaPivot = (id: string, title: string, subtitle: string, field: string, label: string, excludeApproved = false): PivotWidget => ({
  id,
  type: "pivot",
  title,
  subtitle,
  rows: [{ field, label }],
  columns: { field: "Aux_Categoria", label: "Categoría SLA" },
  columnOrder: SLA_ORDER,
  stableColumns: ["Vencido"],
  where: excludeApproved ? { field: "pqrd_estado", notIn: ["Aprobado"] } : undefined,
  size: "full",
  viz: "pivot",
  vizOptions: { columnFamily: "sla" },
  semantic: "sla",
});

export const smartMomento3: DashboardSpec = {
  slug: "smart-momento-3",
  dataset: "smart_m3",
  dateField: "fecha_registro_m3",
  dateLabel: "Fecha de registro (M3)",
  unit: { singular: "queja", plural: "quejas" },
  filters: [
    { field: "momento", label: "Momento", kind: "multi", primary: true },
    { field: "pqrd_estado", label: "Estado", kind: "multi", primary: true },
    { field: "Aux_Categoria", label: "Categoría SLA", kind: "multi", primary: true },
    { field: "pqrd_semaforo_riesgo", label: "Semáforo de riesgo", kind: "multi", primary: true },
    { field: "pqrd_tiempo_por_vencer", label: "Tiempo por vencer", kind: "multi" },
    { field: "pqrd_oficina_responsable", label: "Oficina responsable", kind: "multi" },
    { field: "pqrd_canal_radicacion", label: "Canal de radicación", kind: "multi" },
    { field: "pqrd_nombre_tipo_solicitud", label: "Tipo de solicitud", kind: "multi" },
    { field: "nombre_motivo", label: "Motivo", kind: "multi" },
    { field: "Alerta3", label: "Casos alerta", kind: "multi" },
    { field: "codigo_queja_reclamo", label: "Código queja/reclamo", kind: "text" },
    { field: "radicado", label: "Radicado", kind: "text" },
  ],
  kpis: [
    { id: "total", label: "Quejas en gestión y cierre", short: "Quejas", measure: count(), format: "int", polarity: "neutral", hero: true, hint: "Quejas en el momento 3 (gestión y cierre) registradas en el periodo." },
    { id: "cierre", label: "Cierre", short: "Cierre", measure: count(is("momento", "CIERRE")), format: "int", polarity: "up-good", hint: "Quejas con fecha de aprobación (momento CIERRE)." },
    { id: "gestion", label: "Gestión", short: "Gestión", measure: count(is("momento", "GESTIÓN")), format: "int", polarity: "neutral", hint: "Quejas aún en gestión (sin fecha de aprobación)." },
    { id: "por-vencer", label: "Por vencer", short: "Por vencer", measure: count(is("Aux_Categoria", "Por vencer")), format: "int", polarity: "up-bad", hint: "Quejas a 0–3 días hábiles del vencimiento." },
    { id: "vencidos", label: "Vencidos", short: "Vencidos", measure: count(is("Aux_Categoria", "Vencido")), format: "int", polarity: "up-bad", hint: "Quejas con el término vencido." },
    { id: "alertas", label: "Casos alerta", short: "Casos alerta", measure: count(is("Alerta3", "Sí")), format: "int", polarity: "up-bad", hint: "Casos aprobados en PQRD que en SMART siguen en GESTIÓN (inconsistencia a corregir)." },
  ],
  // kpiRedesign §6 (3-4-5): héroe · "Avance" Gestión · Cierre + barra del widget momento (2 × 112 + 12 ≤ 305)
  // · alerts "Riesgo" Por vencer · Vencidos · Casos alerta (3 × 112 + divisores = 360 ≤ 397)
  kpiLayout: [
    {
      template: "3-4-5",
      cells: [
        { kind: "hero", kpi: "total" },
        // Orden de proceso (Gestión → Cierre), igual que la barra embebida y la SectionLegend de Trabajo pendiente
        { kind: "group", title: "Avance", variant: "pair", kpis: ["gestion", "cierre"], embed: "momento" },
        {
          kind: "group",
          title: "Riesgo",
          variant: "alerts",
          kpis: ["por-vencer", "vencidos", "alertas"],
          accents: { "por-vencer": "serious", vencidos: "critical", alertas: "critical" },
        },
      ],
    },
  ],
  sections: [
    {
      id: "vencimiento",
      nav: "Vencimiento",
      question: "¿Cómo está el término de las quejas?",
      widgets: [
        {
          id: "sla",
          type: "bar",
          orientation: "vertical",
          title: "Categoría SLA",
          subtitle: "Según el término de respuesta",
          dimension: "Aux_Categoria",
          order: SLA_ORDER,
          size: "md",
          viz: "status-strip",
          semantic: "sla",
          maxItems: 5,
        },
        {
          id: "semaforo",
          type: "bar",
          orientation: "vertical",
          title: "Semáforo de riesgo",
          subtitle: "Abiertas y cerradas según su término",
          dimension: "pqrd_semaforo_riesgo",
          order: SEMAFORO_ORDER,
          size: "md",
          viz: "status-strip",
          vizOptions: {
            groups: {
              Abiertos: ["2. Abierto En Término", "3. Abierto Próximo a Vencer", "5. Abierto Vencido"],
              Cerrados: ["1. Cerrado a Tiempo", "4. Cerrado Vencido"],
            },
            // Dentro de cada grupo el prefijo "Abierto"/"Cerrado" sobra (mismas etiquetas que PQRD y Entes)
            overrides: SEMAFORO_TILE_LABELS,
          },
          semantic: "semaforo",
          maxItems: 7,
        },
        // Embebido en el grupo "Avance" de la banda de KPIs (sin celda propia; conserva Ver datos y CSV)
        {
          id: "momento",
          type: "bar",
          orientation: "vertical",
          title: "Momento",
          subtitle: "Quejas en gestión y en cierre",
          dimension: "momento",
          size: "sm",
          viz: "composition",
          vizOptions: { layout: "split" },
          semantic: "momento",
          maxItems: 2,
        },
      ],
      rows: [{ template: "6-6", tier: "M", cells: ["sla", "semaforo"] }],
    },
    {
      id: "territorio",
      nav: "Territorio",
      question: "¿Desde dónde se quejan los consumidores?",
      widgets: [
        {
          id: "mapa",
          type: "map",
          title: "Ubicación del consumidor",
          subtitle: "Desglose por canal",
          geoLabel: "consumidor financiero",
          breakdown: { field: "nombre_canal", label: "Canal" },
          size: "full",
          viz: "hero-map",
          hero: true,
          note: "Muchas quejas llegan sin ubicación del consumidor; se cuentan aparte como “sin ubicación”.",
        },
      ],
      rows: [{ template: "12", tier: "XL", cells: ["mapa"] }],
    },
    {
      id: "tendencia",
      nav: "Tendencia",
      question: "¿Cómo evoluciona el ingreso de quejas al momento 3?",
      widgets: [
        {
          id: "serie",
          type: "timeseries",
          title: "Quejas en el tiempo",
          subtitle: "Frente al periodo anterior",
          size: "full",
          compare: true,
          viz: "area",
          vizOptions: { mode: "auto", colorSlot: 1 },
        },
      ],
      rows: [{ template: "12", tier: "M", cells: ["serie"] }],
    },
    {
      id: "pendiente",
      nav: "Pendiente",
      question: "¿Dónde se acumula la gestión?",
      legend: [
        { label: "Gestión", tone: "info" },
        { label: "Cierre", tone: "good" },
      ],
      widgets: [
        {
          id: "estado-momento",
          type: "bar",
          orientation: "horizontal",
          title: "Estado operativo",
          subtitle: "Por estado en PQRD",
          dimension: "pqrd_estado",
          stackBy: "momento",
          stackOrder: MOMENTO,
          size: "md",
          viz: "split-rows",
          semantic: "momento",
          maxItems: 6,
        },
        {
          id: "canal-momento",
          type: "bar",
          orientation: "vertical",
          title: "Canal",
          subtitle: "De radicación",
          dimension: "pqrd_canal_radicacion",
          stackBy: "momento",
          stackOrder: MOMENTO,
          size: "md",
          viz: "split-rows",
          vizOptions: { compact: true },
          semantic: "momento",
          maxItems: 7,
        },
        // Cada estado cae en un solo momento (Cerrada → cierre; Abierta y Recibida → gestión): la matriz 3 × 2
        // dejaba la mitad de sus celdas vacías. StatusStrip vertical de la familia estado-queja (Cerrada good,
        // Abierta info, Recibida neutral); el cruce con el momento sigue en "Ver datos" y el CSV (stackBy).
        {
          id: "queja-momento",
          type: "bar",
          orientation: "vertical",
          title: "Estado de la queja",
          subtitle: "Estado en SMART",
          note: "El cruce de cada estado con el momento (gestión o cierre) está en Ver datos y en el CSV.",
          dimension: "nombre_estado_queja_reclamo",
          stackBy: "momento",
          stackOrder: MOMENTO,
          size: "sm",
          viz: "status-strip",
          // Vertical forzada (doc: span 4): por ancho medido (≤ 305 px) la celda de 309 px sin barra de scroll
          // clásica caía en rejilla 2 + 1 de tiles huecos, con Cerrada a doble ancho.
          vizOptions: { variant: "vertical" },
          semantic: "estado-queja",
          maxItems: 3,
        },
      ],
      // Doc: 4-4-4 M (presupuesto de 36 px por fila). SplitRows apila etiqueta y barra por debajo de 420 px de ancho
      // (≈ 52 px por fila), así que en M escondía "En edición" y "Por asignar" tras "Ver 2 más": se usa L.
      rows: [{ template: "4-4-4", tier: "L", cells: ["estado-momento", "canal-momento", "queja-momento"] }],
    },
    {
      id: "exploracion",
      nav: "Exploración",
      question: "¿Qué oficinas y tipologías lo explican?",
      widgets: [
        {
          id: "drill",
          type: "drilldown",
          title: "Exploración por oficina",
          subtitle: "De oficina a favorabilidad · 5 niveles",
          levels: [
            { field: "pqrd_oficina_responsable", label: "Oficina" },
            { field: "pqrd_nombre_tipo_solicitud", label: "Tipo de solicitud" },
            { field: "nombre_motivo", label: "Motivo" },
            { field: "nombre_producto", label: "Producto" },
            { field: "pqrd_resultado_favorabilidad", label: "Favorabilidad" },
          ],
          stackBy: "momento",
          stackOrder: MOMENTO,
          topN: 10,
          size: "lg",
          viz: "drilldown",
          semantic: "momento",
          labelKind: "oficina",
        },
        {
          id: "sankey",
          type: "sankey",
          title: "Tipología y momento",
          subtitle: "Flujo hacia gestión o cierre",
          from: { field: "pqrd_tipologia", label: "Tipología" },
          to: { field: "momento", label: "Momento" },
          size: "md",
          viz: "sankey",
          semantic: "momento",
        },
      ],
      rows: [{ template: "7-5", tier: "L", cells: ["drill", "sankey"] }],
    },
    {
      id: "categoria-sla",
      nav: "SLA",
      question: "¿En qué estados, oficinas y tipos de solicitud se concentra el riesgo?",
      widgets: [
        // Títulos cortos: son las pestañas del Segmented (3 a 358 px en móvil, sin partir en 2 líneas). La celda no
        // declara subtítulo: la tarjeta muestra el de la pestaña activa, así la exclusión de aprobadas solo se lee
        // en Estado. Subtítulos de ≤ 40 caracteres: a 390 px el subtítulo va en una línea con elipsis.
        slaPivot("pivot-estado", "Estado", "Quejas sin aprobar, por estado", "pqrd_estado", "Estado", true),
        { ...slaPivot("pivot-oficina", "Oficina", "Todas las quejas, por oficina responsable", "pqrd_oficina_responsable", "Oficina"), labelKind: "oficina" },
        slaPivot("pivot-tipo", "Tipo de solicitud", "Todas las quejas, por tipo de solicitud", "pqrd_nombre_tipo_solicitud", "Tipo de solicitud"),
      ],
      rows: [
        {
          template: "12",
          tier: "auto",
          // No repite "Categoría SLA", el título de la tira de S1 (dos tarjetas homónimas en la barra de secciones y en ⌘K)
          cells: [{ tabs: ["pivot-estado", "pivot-oficina", "pivot-tipo"], id: "pivots-sla", title: "Cruce de la categoría SLA" }],
        },
      ],
    },
  ],
  table: {
    title: "Detalle SMART · Momento 3",
    columns: [
      { field: "fecha_registro_m3", label: "Registro M3", format: "datetime" },
      { field: "radicado", label: "Radicado", format: "mono" },
      { field: "pqrd_estado", label: "Estado", format: "badge", semantic: "flujo" },
      { field: "pqrd_semaforo_riesgo", label: "Semáforo", format: "badge", semantic: "semaforo" },
      { field: "codigo_queja_reclamo", label: "Código", format: "mono", visible: false },
      { field: "observaciones", label: "Observaciones", format: "long", visible: false },
      { field: "pqrd_nombre_tipo_solicitud", label: "Tipo de solicitud" },
      { field: "pqrd_canal_radicacion", label: "Canal" },
      { field: "pqrd_oficina_responsable", label: "Oficina", labelKind: "oficina" },
      { field: "fecha_aprobacion", label: "Aprobación", format: "date" },
      { field: "pqrd_tiempo_por_vencer", label: "Tiempo por vencer" },
      { field: "pqrd_rango_ciclo", label: "Rango ciclo", visible: false },
      { field: "Alerta3", label: "Alerta", format: "badge", semantic: "alerta" },
    ],
    searchFields: ["radicado", "codigo_queja_reclamo", "pqrd_oficina_responsable"],
    defaultSort: { field: "fecha_registro_m3", dir: "desc" },
  },
};
