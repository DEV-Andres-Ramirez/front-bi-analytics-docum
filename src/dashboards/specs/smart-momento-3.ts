import type { DashboardSpec, PivotWidget } from "../types";
import { count, is, SEMAFORO_ORDER, SLA_ORDER } from "./helpers";

const MOMENTO = ["GESTIÓN", "CIERRE"];

const slaPivot = (id: string, title: string, field: string, label: string, excludeApproved = false): PivotWidget => ({
  id,
  type: "pivot",
  title,
  subtitle: "Cantidad de radicados por categoría SLA",
  rows: [{ field, label }],
  columns: { field: "Aux_Categoria", label: "Categoría SLA" },
  columnOrder: SLA_ORDER,
  where: excludeApproved ? { field: "pqrd_estado", notIn: ["Aprobado"] } : undefined,
  size: "full",
  height: 420,
});

export const smartMomento3: DashboardSpec = {
  slug: "smart-momento-3",
  dataset: "smart_m3",
  dateField: "fecha_registro_m3",
  dateLabel: "Fecha de registro (M3)",
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
    { id: "total", label: "Total", measure: count(), format: "int", polarity: "neutral", hero: true, hint: "Quejas en el momento 3 (gestión y cierre) registradas en el periodo." },
    { id: "cierre", label: "Cierre", measure: count(is("momento", "CIERRE")), format: "int", polarity: "up-good", hint: "Quejas con fecha de aprobación (momento CIERRE)." },
    { id: "gestion", label: "Gestión", measure: count(is("momento", "GESTIÓN")), format: "int", polarity: "neutral", hint: "Quejas aún en gestión (sin fecha de aprobación)." },
    { id: "por-vencer", label: "Por vencer", measure: count(is("Aux_Categoria", "Por vencer")), format: "int", polarity: "up-bad", hint: "Quejas a 0–3 días hábiles del vencimiento." },
    { id: "vencidos", label: "Vencidos", measure: count(is("Aux_Categoria", "Vencido")), format: "int", polarity: "up-bad", hint: "Quejas con el término vencido." },
    { id: "alertas", label: "Casos alerta", measure: count(is("Alerta3", "Sí")), format: "int", polarity: "up-bad", hint: "Casos aprobados en PQRD que en SMART siguen en GESTIÓN (inconsistencia a corregir)." },
  ],
  sections: [
    {
      id: "estado",
      title: "Momento, riesgo y SLA",
      widgets: [
        { id: "momento", type: "donut", title: "Momento", dimension: "momento", semantic: "momento", size: "sm" },
        { id: "semaforo", type: "donut", title: "Semáforo de riesgo", dimension: "pqrd_semaforo_riesgo", semantic: "semaforo", order: SEMAFORO_ORDER, size: "sm" },
        { id: "sla", type: "donut", title: "Casos según categoría SLA", dimension: "Aux_Categoria", semantic: "sla", order: SLA_ORDER, size: "sm" },
        { id: "canal-momento", type: "bar", orientation: "vertical", title: "Canales de radicación por momento", dimension: "pqrd_canal_radicacion", stackBy: "momento", stackOrder: MOMENTO, semantic: "momento", size: "md" },
        { id: "estado-momento", type: "bar", orientation: "horizontal", title: "Estados operativos por momento", dimension: "pqrd_estado", stackBy: "momento", stackOrder: MOMENTO, semantic: "momento", size: "md" },
        { id: "queja-momento", type: "bar", orientation: "vertical", title: "Estado de la queja por momento", dimension: "nombre_estado_queja_reclamo", stackBy: "momento", stackOrder: MOMENTO, semantic: "momento", size: "sm" },
        { id: "serie", type: "timeseries", title: "Radicados en el tiempo", subtitle: "La línea tenue es el periodo anterior", size: "lg", compare: true },
      ],
    },
    {
      id: "drill",
      title: "Exploración por oficina",
      widgets: [
        {
          id: "drill",
          type: "drilldown",
          title: "Oficina › Tipo de solicitud › Motivo › Producto › Favorabilidad",
          subtitle: "Haz clic en una barra para bajar de nivel",
          levels: [
            { field: "pqrd_oficina_responsable", label: "Oficina" },
            { field: "pqrd_nombre_tipo_solicitud", label: "Tipo de solicitud" },
            { field: "nombre_motivo", label: "Motivo" },
            { field: "nombre_producto", label: "Producto" },
            { field: "pqrd_resultado_favorabilidad", label: "Favorabilidad" },
          ],
          stackBy: "momento",
          stackOrder: MOMENTO,
          semantic: "momento",
          topN: 10,
          size: "lg",
          height: 440,
        },
        { id: "sankey", type: "sankey", title: "Tipología de PQRD y momento", subtitle: "Flujo de casos de cada tipología hacia gestión o cierre", from: { field: "pqrd_tipologia", label: "Tipología" }, to: { field: "momento", label: "Momento" }, size: "sm", height: 440 },
      ],
    },
    {
      id: "territorio",
      title: "Territorio",
      widgets: [
        { id: "mapa", type: "map", title: "Quejas por ubicación del consumidor", subtitle: "Doble clic en un departamento para ver sus municipios", geoLabel: "consumidor financiero", breakdown: { field: "nombre_canal", label: "Canal" }, size: "full", height: 460, note: "Muchas quejas llegan sin ubicación del consumidor; se cuentan aparte como \"sin ubicación\"." },
      ],
    },
    {
      id: "pivots",
      title: "Categoría SLA por estado, oficina y tipo de solicitud",
      tabs: true,
      widgets: [
        slaPivot("pivot-estado", "Por estado (sin aprobados)", "pqrd_estado", "Estado", true),
        slaPivot("pivot-oficina", "Por oficina responsable", "pqrd_oficina_responsable", "Oficina"),
        slaPivot("pivot-tipo", "Por tipo de solicitud", "pqrd_nombre_tipo_solicitud", "Tipo de solicitud"),
      ],
    },
  ],
  table: {
    title: "Detalle SMART · Momento 3",
    columns: [
      { field: "fecha_registro_m3", label: "Registro M3", format: "datetime" },
      { field: "radicado", label: "Radicado", format: "mono" },
      { field: "codigo_queja_reclamo", label: "Código", format: "mono", visible: false },
      { field: "observaciones", label: "Observaciones", format: "long", visible: false },
      { field: "pqrd_nombre_tipo_solicitud", label: "Tipo de solicitud" },
      { field: "pqrd_canal_radicacion", label: "Canal" },
      { field: "pqrd_oficina_responsable", label: "Oficina" },
      { field: "pqrd_estado", label: "Estado", format: "badge" },
      { field: "fecha_aprobacion", label: "Aprobación", format: "date" },
      { field: "pqrd_tiempo_por_vencer", label: "Tiempo por vencer" },
      { field: "pqrd_semaforo_riesgo", label: "Semáforo", format: "badge", semantic: "semaforo" },
      { field: "pqrd_rango_ciclo", label: "Rango ciclo", visible: false },
      { field: "Alerta3", label: "Alerta", format: "badge", semantic: "si-no" },
    ],
    searchFields: ["radicado", "codigo_queja_reclamo", "pqrd_oficina_responsable"],
    defaultSort: { field: "fecha_registro_m3", dir: "desc" },
  },
};
