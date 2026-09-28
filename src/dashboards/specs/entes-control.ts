import type { DashboardSpec } from "../types";
import { SEMAFORO_ORDER } from "./helpers";
import { ENTES_FILTERS, ENTES_KPIS, ENTES_TABLE_COLUMNS } from "./entes-common";

export const entesControl: DashboardSpec = {
  slug: "entes-control",
  dataset: "entes_control",
  dateField: "Fecha_de_Radicacion",
  dateLabel: "Fecha de radicación",
  filters: ENTES_FILTERS,
  kpis: ENTES_KPIS,
  sections: [
    {
      id: "resumen",
      title: "Entes y tipos de requerimiento",
      widgets: [
        { id: "semaforo", type: "donut", title: "Semáforo de riesgo", dimension: "semaforo_riesgo", semantic: "semaforo", order: SEMAFORO_ORDER, size: "sm" },
        { id: "entes", type: "bar", orientation: "vertical", title: "Entes de control", dimension: "ente_control", size: "lg" },
        { id: "tipo", type: "donut", title: "Tipo de requerimiento", dimension: "Tipo_de_Requerimiento", size: "sm" },
        { id: "estado", type: "bar", orientation: "horizontal", title: "Estado", dimension: "Estado", size: "sm" },
        { id: "canal", type: "bar", orientation: "vertical", title: "Canal de radicación", dimension: "Canal_de_Radicacion", size: "sm" },
      ],
    },
    {
      id: "operacion",
      title: "Oficinas, tendencia y territorio",
      widgets: [
        { id: "serie", type: "timeseries", title: "Radicados en el tiempo", subtitle: "La línea tenue es el periodo anterior", size: "full", compare: true },
        { id: "oficinas", type: "bar", orientation: "horizontal", title: "Oficina responsable", subtitle: "Top 12", dimension: "Oficina_responsable_de_respuesta", topN: 12, others: true, size: "md", height: 420 },
        { id: "mapa", type: "map", title: "Radicados por territorio del remitente", subtitle: "Doble clic en un departamento para ver sus municipios", geoLabel: "remitente", breakdown: { field: "ente_control", label: "Ente de control" }, size: "md", height: 420 },
      ],
    },
  ],
  table: {
    title: "Detalle de requerimientos de entes de control",
    columns: ENTES_TABLE_COLUMNS,
    searchFields: ["Numero_de_Radicado", "Oficina_responsable_de_respuesta", "Gestionador_Responsable", "ente_control"],
    defaultSort: { field: "Fecha_de_Radicacion", dir: "desc" },
  },
  notes: ["La vista original no mapea \"En término\" a \"A tiempo\" en la categoría de vencimiento; aquí se corrige al mostrar."],
};
