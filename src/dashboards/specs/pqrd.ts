import type { DashboardSpec } from "../types";
import { avg, count, is, share, SEMAFORO_ORDER } from "./helpers";

export const pqrd: DashboardSpec = {
  slug: "pqrd",
  dataset: "pqrd",
  dateField: "fecha_de_radicado",
  dateLabel: "Fecha de radicado",
  filters: [
    { field: "estado", label: "Estado", kind: "multi", primary: true },
    { field: "canal_de_radicacion", label: "Canal", kind: "multi", primary: true },
    { field: "oficina_responsable_de_respuesta", label: "Oficina responsable", kind: "multi", primary: true },
    { field: "tipologia_de_pqrd", label: "Tipología", kind: "multi", primary: true },
    { field: "tiempo_por_vencer", label: "Tiempos por vencer", kind: "multi" },
    { field: "nombre_tipo_solicitud", label: "Tipo de solicitud", kind: "multi" },
    { field: "semaforo_riesgo", label: "Semáforo de riesgo", kind: "multi" },
    { field: "rango_ciclo", label: "Rango ciclo en días", kind: "multi" },
    { field: "producto", label: "Producto", kind: "multi" },
    { field: "gestionador_responsable", label: "Gestionador", kind: "multi" },
    { field: "resultado_favorabilidad", label: "Favorabilidad", kind: "multi" },
    { field: "numero_de_radicado", label: "Número de radicado", kind: "text" },
  ],
  kpis: [
    { id: "radicados", label: "Cantidad de radicados", measure: count(), format: "int", polarity: "neutral", hero: true, hint: "PQRD radicadas en el periodo." },
    { id: "asignacion", label: "Asignación (promedio días)", measure: avg("num_dias_asignacion_gestionador"), format: "days", polarity: "up-bad", hint: "Promedio de días entre la asignación a la oficina y la asignación al gestionador." },
    { id: "aprobacion", label: "Aprobación (promedio días)", measure: avg("num_dias_aprobacion"), format: "days", polarity: "up-bad", hint: "Promedio de días que toma la aprobación de la respuesta." },
    { id: "sla", label: "% Cumplimiento SLA", measure: share(is("cumplimiento_sla", "En Término")), format: "pct", polarity: "up-good", hint: "Radicados con cumplimiento de SLA \"En Término\" sobre el total del periodo." },
    { id: "gestion", label: "Gestión (promedio días)", measure: avg("num_dias_gestion_total"), format: "days", polarity: "up-bad", hint: "Promedio de días totales de gestión del gestionador." },
    { id: "ciclo", label: "Ciclo total (promedio días)", measure: avg("dias_ciclo_total"), format: "days", polarity: "up-bad", hint: "Promedio de días calendario entre radicación y cierre (solo casos cerrados)." },
  ],
  sections: [
    {
      id: "riesgo",
      title: "Estado y riesgo",
      widgets: [
        { id: "semaforo", type: "donut", title: "Semáforo de riesgo", dimension: "semaforo_riesgo", semantic: "semaforo", order: SEMAFORO_ORDER, size: "sm" },
        { id: "estados", type: "bar", orientation: "horizontal", title: "Estados operativos", dimension: "estado", size: "sm" },
        { id: "tipologia", type: "bar", orientation: "horizontal", title: "Tipología de PQRD", dimension: "tipologia_de_pqrd", size: "sm" },
      ],
    },
    {
      id: "volumen",
      title: "Volumen y canales",
      widgets: [
        { id: "serie", type: "timeseries", title: "Radicados en el tiempo", subtitle: "Cambia la granularidad (día, semana, mes) · la línea tenue es el periodo anterior", size: "lg", compare: true },
        { id: "canales", type: "bar", orientation: "vertical", title: "Canales de radicación", dimension: "canal_de_radicacion", size: "sm" },
      ],
    },
    {
      id: "oficinas",
      title: "Oficinas y territorio",
      widgets: [
        { id: "oficinas", type: "bar", orientation: "horizontal", title: "Casos por oficina responsable", subtitle: "Top 15", dimension: "oficina_responsable_de_respuesta", topN: 15, size: "md", height: 440 },
        { id: "mapa", type: "map", title: "Radicados por territorio del remitente", subtitle: "Doble clic en un departamento para ver sus municipios", geoLabel: "remitente", breakdown: { field: "canal_de_radicacion", label: "Canal" }, size: "md", height: 440 },
      ],
    },
    {
      id: "eficiencia",
      title: "Eficiencia semanal por gerencia",
      description: "Promedio semanal de días por fase frente a los cuartiles de las últimas 52 semanas. Q1 es lo más ágil y Q4 lo más lento. El ranking ordena de mejor a peor.",
      widgets: [{ id: "eficiencia", type: "efficiency", title: "Ranking de eficiencia por gerencia", subtitle: "Últimas 3 semanas por fase (asignación, gestión, revisión y aprobación)", size: "full" }],
    },
  ],
  table: {
    title: "Detalle de PQRD",
    columns: [
      { field: "numero_de_radicado", label: "Radicado", format: "mono" },
      { field: "observaciones", label: "Observaciones", format: "long", visible: false },
      { field: "nombre_tipo_solicitud", label: "Tipo de solicitud" },
      { field: "tipologia_de_pqrd", label: "Tipología" },
      { field: "fecha_de_radicado", label: "Radicado el", format: "datetime" },
      { field: "fecha_maxima_de_respuesta", label: "Fecha máxima", format: "date" },
      { field: "tiempo_por_vencer", label: "Tiempo por vencer" },
      { field: "canal_de_radicacion", label: "Canal" },
      { field: "oficina_responsable_de_respuesta", label: "Oficina responsable" },
      { field: "estado", label: "Estado", format: "badge" },
      { field: "semaforo_riesgo", label: "Semáforo", format: "badge", semantic: "semaforo" },
      { field: "rango_ciclo", label: "Rango ciclo", visible: false },
      { field: "gestionador_responsable", label: "Gestionador", visible: false },
    ],
    searchFields: ["numero_de_radicado", "nombre_tipo_solicitud", "oficina_responsable_de_respuesta", "gestionador_responsable"],
    defaultSort: { field: "fecha_de_radicado", dir: "desc" },
  },
};
