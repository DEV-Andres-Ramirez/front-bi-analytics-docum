import type { BarWidget, DashboardSpec, Measure, PivotWidget } from "../types";
import { avg } from "./helpers";
import { ENTES_FILTERS, ENTES_KPIS, ENTES_NOTES, ENTES_TABLE_COLUMNS } from "./entes-common";

/** Columnas SLA estables: "Vencido" se ve aunque esté en 0 (orden de severidad; "No reporta" al final). */
const SLA_COLUMNS = ["Vencido", "Por vencer", "Preventiva"];

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
  columnOrder: [...SLA_COLUMNS, "No reporta"],
  columnExclude: ["A tiempo"],
  stableColumns: SLA_COLUMNS,
  size: "full",
  viz: "role-pivot",
  vizOptions: { columnFamily: "sla" },
  semantic: "sla",
  labelKind: "persona",
});

/**
 * Oficinas por días promedio en una fase: columna de la matriz de fases (se dibuja dentro del
 * composite phase-matrix). Sin topN: superconjunto declarado ("Ver datos" y CSV traen todas las oficinas;
 * la matriz marca el top 6 de cada fase con su rango).
 */
const fase = (id: string, title: string, measure: Measure, extra?: Pick<BarWidget, "provisional" | "note">): BarWidget => ({
  id,
  type: "bar",
  orientation: "horizontal",
  title,
  dimension: "Oficina_responsable_de_respuesta",
  measure,
  valueFormat: "days",
  size: "md",
  viz: "heatmap",
  labelKind: "oficina",
  maxItems: 25,
  ...extra,
});

export const entesControlEficiencia: DashboardSpec = {
  slug: "entes-control-eficiencia",
  dataset: "entes_control",
  dateField: "Fecha_de_Radicacion",
  dateLabel: "Fecha de radicación",
  unit: { singular: "radicado", plural: "radicados" },
  filters: ENTES_FILTERS,
  // Mismas definiciones que Entes; aquí el héroe es la asignación (headline del Home).
  kpis: ENTES_KPIS.map((k) => ({ ...k, hero: k.id === "asignacion" })),
  // kpiRedesign §6: 3-3-6 · [héroe asignación] [gauge aprobados] [grupo "Contexto"]
  kpiLayout: [
    {
      template: "3-3-6",
      cells: [
        { kind: "hero", kpi: "asignacion" },
        { kind: "tile", kpi: "aprobados", variant: "gauge" },
        { kind: "group", title: "Contexto", variant: "list", kpis: ["radicados", "quejas", "fuera-horario", "reabiertos"] },
      ],
    },
  ],
  sections: [
    {
      id: "cuellos",
      nav: "Cuellos de botella",
      question: "¿Qué fase y qué oficina frenan el flujo?",
      widgets: [
        fase("fase-asignacion", "Asignación (promedio días)", avg("num_dias_asignacion_gestionador")),
        fase("fase-gestion", "Gestión a aprobación (promedio días)", avg("dias_gestion_a_aprobacion"), {
          provisional: true,
          note: "La vista no expone días de gestión; se usa el tiempo entre el inicio de la gestión y la aprobación.",
        }),
        fase("fase-oficina", "Oficina a gestionador (promedio días)", avg("dias_oficina_a_gestionador"), {
          provisional: true,
          note: "Reemplaza la gráfica “Revisión -RR” del tablero original, que siempre mostraba 0 porque la vista no tiene días de revisión.",
        }),
        fase("fase-aprobacion", "Aprobación (promedio días)", avg("num_dias_aprobacion")),
      ],
      rows: [
        {
          template: "12",
          tier: "L",
          cells: [
            {
              composite: "phase-matrix",
              id: "fases",
              widgets: ["fase-asignacion", "fase-gestion", "fase-oficina", "fase-aprobacion"],
              title: "Fases más lentas",
              subtitle: "Días promedio · top 6 oficinas por fase",
              hero: true,
            },
          ],
        },
      ],
    },
    {
      id: "carga",
      nav: "Responsables",
      question: "¿Quién tiene casos que requieren atención?",
      description: "Se excluyen los casos “A tiempo” para resaltar los que requieren atención.",
      widgets: [
        pivot("pivot-asignador", "Asignador", "Asignador_de_responsable", "Asignador"),
        pivot("pivot-gestionador", "Gestionador", "Gestionador_Responsable", "Gestionador"),
        pivot("pivot-revisor", "Revisor", "Responsable_de_Revision", "Revisor"),
        pivot("pivot-aprobador", "Aprobador", "Responsable_de_Aprobacion", "Aprobador"),
      ],
      rows: [
        {
          template: "12",
          tier: "auto",
          cells: [
            {
              tabs: ["pivot-asignador", "pivot-gestionador", "pivot-revisor", "pivot-aprobador"],
              id: "carga-responsables",
              title: "Carga por responsable",
              subtitle: "Oficina › responsable por vencimiento",
            },
          ],
        },
      ],
    },
  ],
  table: {
    title: "Detalle de radicados",
    columns: ENTES_TABLE_COLUMNS,
    searchFields: ["Numero_de_Radicado", "Oficina_responsable_de_respuesta", "Gestionador_Responsable", "Asignador_de_responsable"],
    defaultSort: { field: "Fecha_de_Radicacion", dir: "desc" },
  },
  notes: ENTES_NOTES,
};
