import type { DashboardSpec } from "../types";
import { count, distinct, is, isNot, share, SEMAFORO_ORDER } from "./helpers";

export const smartMomento1: DashboardSpec = {
  slug: "smart-momento-1",
  dataset: "smart_m1",
  dateField: "fecha_registro_m1",
  dateLabel: "Fecha de registro (M1)",
  filters: [
    { field: "nombre_macro_motivo", label: "Macro motivo", kind: "multi", primary: true },
    { field: "nombre_producto", label: "Producto", kind: "multi", primary: true },
    { field: "nombre_canal", label: "Canal", kind: "multi", primary: true },
    { field: "nombre_tutela", label: "¿Tutela?", kind: "multi", primary: true },
    { field: "pqrd_estado", label: "Estado (PQRD)", kind: "multi" },
    { field: "nombre_condicion_especial", label: "Condición especial", kind: "multi" },
    { field: "pqrd_nombre_tipo_solicitud", label: "Tipo de solicitud (PQRD)", kind: "multi" },
    { field: "nombre_ente_control", label: "Ente de control", kind: "multi" },
    { field: "nombre_tipo_persona", label: "Tipo de persona", kind: "multi" },
    { field: "radicado", label: "Radicado", kind: "text" },
  ],
  kpis: [
    { id: "radicados", label: "Radicados", measure: count(), format: "int", polarity: "neutral", hero: true, hint: "Quejas registradas en SMART (momento 1) en el periodo." },
    { id: "tutela", label: "% Con tutela", measure: share(is("nombre_tutela", "SÍ")), format: "pct", polarity: "up-bad", hint: "Quejas que reportan una acción de tutela asociada." },
    { id: "cruce", label: "% Cruzadas con PQRD", measure: share(isNot("pqrd_estado", "Sin cruce con PQRD")), format: "pct", polarity: "up-good", hint: "Quejas cuyo radicado se encontró en el seguimiento de PQRD (fuente de estado y semáforo)." },
    { id: "departamentos", label: "Departamentos", measure: distinct("__dpto"), format: "int", polarity: "neutral", hint: "Departamentos distintos del consumidor financiero con al menos una queja." },
  ],
  sections: [
    {
      id: "perfil",
      title: "Perfil de las quejas",
      widgets: [
        { id: "semaforo", type: "donut", title: "Semáforo de riesgo", dimension: "pqrd_semaforo_riesgo", semantic: "semaforo", order: SEMAFORO_ORDER, size: "sm", note: "Solo las quejas cruzadas con PQRD tienen semáforo." },
        { id: "genero", type: "bar", orientation: "vertical", title: "Género", dimension: "nombre_sexo", size: "sm" },
        { id: "canales", type: "bar", orientation: "vertical", title: "Canales", dimension: "nombre_canal", size: "sm" },
        { id: "productos", type: "bar", orientation: "horizontal", title: "Productos", dimension: "nombre_producto", topN: 8, others: true, size: "md" },
        { id: "macro-motivos", type: "bartable", title: "Macro motivos", columns: [{ field: "nombre_macro_motivo", label: "Macro motivo" }], measureLabel: "Radicados", size: "md", height: 320 },
      ],
    },
    {
      id: "tiempo-territorio",
      title: "Tendencia y territorio",
      widgets: [
        { id: "serie", type: "timeseries", title: "Radicados en el tiempo", subtitle: "La línea tenue es el periodo anterior", size: "md", compare: true, height: 420 },
        { id: "mapa", type: "map", title: "Quejas por ubicación del consumidor", subtitle: "Doble clic en un departamento para ver sus municipios", geoLabel: "consumidor financiero", breakdown: { field: "nombre_canal", label: "Canal" }, size: "md", height: 420 },
      ],
    },
  ],
  table: {
    title: "Detalle SMART · Momento 1",
    columns: [
      { field: "fecha_registro_m1", label: "Registro M1", format: "datetime" },
      { field: "radicado", label: "Radicado", format: "mono" },
      { field: "codigo_queja_reclamo", label: "Código queja/reclamo", format: "mono" },
      { field: "nombre_sexo", label: "Género" },
      { field: "nombre_tutela", label: "¿Tutela?" },
      { field: "nombre_producto", label: "Producto" },
      { field: "nombre_canal", label: "Canal" },
      { field: "nombre_macro_motivo", label: "Macro motivo" },
      { field: "nombre_departamento", label: "Departamento" },
      { field: "nombre_municipio", label: "Municipio" },
      { field: "nombre_condicion_especial", label: "Condición especial", visible: false },
      { field: "nombre_ente_control", label: "Ente de control", visible: false },
      { field: "nombre_tipo_persona", label: "Tipo de persona", visible: false },
      { field: "nombre_anexos_queja_reclamo", label: "Anexos", visible: false },
    ],
    searchFields: ["radicado", "codigo_queja_reclamo", "nombre_municipio"],
    defaultSort: { field: "fecha_registro_m1", dir: "desc" },
  },
};
