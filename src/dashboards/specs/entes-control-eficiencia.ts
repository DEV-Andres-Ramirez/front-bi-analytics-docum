import type { DashboardSpec, PivotWidget } from "../types";
import { avg } from "./helpers";
import { ENTES_FILTERS, ENTES_KPIS, ENTES_TABLE_COLUMNS } from "./entes-common";

const pivot = (id: string, title: string, field: string, label: string): PivotWidget => ({
  id,
  type: "pivot",
  title,
  subtitle: "Radicados por oficina y responsable según categoría de vencimiento",
  rows: [
    { field: "Oficina_responsable_de_respuesta", label: "Oficina responsable" },
    { field, label },
  ],
  columns: { field: "Aux_Categoria", label: "Categoría de vencimiento" },
  columnOrder: ["Vencido", "Por vencer", "Preventiva", "No reporta"],
  columnExclude: ["A tiempo"],
  size: "full",
  height: 460,
});

export const entesControlEficiencia: DashboardSpec = {
  slug: "entes-control-eficiencia",
  dataset: "entes_control",
  dateField: "Fecha_de_Radicacion",
  dateLabel: "Fecha de radicación",
  filters: ENTES_FILTERS,
  kpis: ENTES_KPIS,
  sections: [
    {
      id: "carga",
      title: "Carga por responsable",
      description: "Se excluyen los casos \"A tiempo\" para resaltar los que requieren atención. Haz clic en una oficina para expandir o contraer sus responsables.",
      tabs: true,
      widgets: [
        pivot("pivot-asignador", "Asignador responsable", "Asignador_de_responsable", "Asignador"),
        pivot("pivot-gestionador", "Gestionador responsable", "Gestionador_Responsable", "Gestionador"),
        pivot("pivot-revisor", "Revisor responsable", "Responsable_de_Revision", "Revisor"),
        pivot("pivot-aprobador", "Aprobador responsable", "Responsable_de_Aprobacion", "Aprobador"),
      ],
    },
    {
      id: "fases",
      title: "Oficinas con más días por fase",
      description: "Las 6 oficinas con el promedio de días más alto en cada fase (mayor = más lento).",
      widgets: [
        { id: "fase-asignacion", type: "bar", orientation: "horizontal", title: "Asignación (promedio días)", dimension: "Oficina_responsable_de_respuesta", measure: avg("num_dias_asignacion_gestionador"), topN: 6, valueFormat: "days", size: "md" },
        { id: "fase-gestion", type: "bar", orientation: "horizontal", title: "Gestión a aprobación (promedio días)", dimension: "Oficina_responsable_de_respuesta", measure: avg("dias_gestion_a_aprobacion"), topN: 6, valueFormat: "days", size: "md", provisional: true, note: "La vista no expone días de gestión; se usa el tiempo entre el inicio de la gestión y la aprobación." },
        { id: "fase-oficina", type: "bar", orientation: "horizontal", title: "Oficina a gestionador (promedio días)", dimension: "Oficina_responsable_de_respuesta", measure: avg("dias_oficina_a_gestionador"), topN: 6, valueFormat: "days", size: "md", provisional: true, note: "Reemplaza la gráfica \"Revisión -RR\" del tablero original, que siempre mostraba 0 porque la vista no tiene días de revisión." },
        { id: "fase-aprobacion", type: "bar", orientation: "horizontal", title: "Aprobación (promedio días)", dimension: "Oficina_responsable_de_respuesta", measure: avg("num_dias_aprobacion"), topN: 6, valueFormat: "days", size: "md" },
      ],
    },
  ],
  table: {
    title: "Detalle de radicados",
    columns: ENTES_TABLE_COLUMNS,
    searchFields: ["Numero_de_Radicado", "Oficina_responsable_de_respuesta", "Gestionador_Responsable", "Asignador_de_responsable"],
    defaultSort: { field: "Fecha_de_Radicacion", dir: "desc" },
  },
};
