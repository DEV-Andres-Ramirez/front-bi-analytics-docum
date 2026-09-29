import type { DashboardSpec } from "../types";
import { SEMAFORO_ORDER, SEMAFORO_TILE_LABELS } from "./helpers";
import { ENTES_FILTERS, ENTES_KPIS, ENTES_NOTES, ENTES_TABLE_COLUMNS, SEMAFORO_GROUPS } from "./entes-common";

/** Flujo principal, rama de reclasificación y estados fuera de flujo (PipelineSteps). */
const FLUJO = ["Por asignar", "Para gestión", "En edición", "Aprobado"];
const RECLASIFICACION = ["Solicitud de reclasificación", "Reclasificación Aprobada"];
const FUERA_DE_FLUJO = ["Aprobación rechazada", "Cerrado"];

/** Siglas de los entes (monograma de EntityTiles). */
const ENTES_SIGLAS: Record<string, string> = {
  Supersalud: "SNS",
  Mintrabajo: "MT",
  "Rama Judicial": "RJ",
  Fiscalía: "FGN",
  Superfinanciera: "SFC",
  "Defensoría del Pueblo": "DP",
  Contraloría: "CGR",
  Procuraduría: "PGN",
};

export const entesControl: DashboardSpec = {
  slug: "entes-control",
  dataset: "entes_control",
  dateField: "Fecha_de_Radicacion",
  dateLabel: "Fecha de radicación",
  unit: { singular: "radicado", plural: "radicados" },
  filters: ENTES_FILTERS,
  kpis: ENTES_KPIS,
  // kpiRedesign §6: 3-3-6 · [héroe radicados] [gauge aprobados] [alerts "Señales de alerta"]
  kpiLayout: [
    {
      template: "3-3-6",
      cells: [
        { kind: "hero", kpi: "radicados" },
        { kind: "tile", kpi: "aprobados", variant: "gauge" },
        { kind: "group", title: "Señales de alerta", variant: "alerts", kpis: ["quejas", "asignacion", "fuera-horario", "reabiertos"] },
      ],
    },
  ],
  sections: [
    {
      id: "cumplimiento",
      nav: "Cumplimiento",
      question: "¿Respondemos a tiempo y en qué etapa está cada requerimiento?",
      widgets: [
        {
          id: "semaforo",
          type: "bar",
          orientation: "horizontal",
          title: "Semáforo de riesgo",
          subtitle: "Abiertos y cerrados por nivel de riesgo",
          dimension: "semaforo_riesgo",
          sort: "natural",
          order: SEMAFORO_ORDER,
          size: "sm",
          viz: "status-strip",
          vizOptions: { variant: "horizontal", groups: SEMAFORO_GROUPS, overrides: SEMAFORO_TILE_LABELS },
          semantic: "semaforo",
          maxItems: 6,
        },
        {
          id: "estado",
          type: "bar",
          orientation: "horizontal",
          title: "Estado del flujo",
          subtitle: "Flujo de respuesta y reclasificación",
          dimension: "Estado",
          sort: "natural",
          order: [...FLUJO, ...RECLASIFICACION, ...FUERA_DE_FLUJO],
          size: "sm",
          viz: "pipeline",
          vizOptions: { finalStage: "Aprobado", branch: RECLASIFICACION, exits: FUERA_DE_FLUJO },
          semantic: "flujo",
          // Las 8 categorías: 4 etapas del flujo (pasos) + rama (2) y salidas (2) como chips; requiredHeight solo
          // cuenta las etapas como pasos (vertical en 397 px: 24 + 4 × 48 + 32 de chips = 248 ≤ 284).
          maxItems: FLUJO.length + RECLASIFICACION.length + FUERA_DE_FLUJO.length,
        },
      ],
      // 7-5 M, igual que PQRD: semáforo agrupado en 2 líneas (240 ≤ 284) | pipeline vertical con chips (248 ≤ 284).
      rows: [{ template: "7-5", tier: "M", cells: ["semaforo", "estado"] }],
    },
    {
      id: "territorio",
      nav: "Territorio",
      question: "¿De dónde vienen los requerimientos?",
      widgets: [
        {
          id: "mapa",
          type: "map",
          title: "Radicados por territorio",
          subtitle: "Remitente · desglose por ente de control",
          geoLabel: "remitente",
          breakdown: { field: "ente_control", label: "Ente de control" },
          size: "full",
          viz: "hero-map",
          hero: true,
        },
      ],
      rows: [{ template: "12", tier: "XL", cells: ["mapa"] }],
    },
    {
      id: "tendencia",
      nav: "Tendencia",
      question: "¿Cómo evoluciona y qué tipo de requerimiento llega?",
      widgets: [
        {
          id: "serie",
          type: "timeseries",
          title: "Radicados en el tiempo",
          subtitle: "Por fecha de radicación",
          size: "full",
          compare: true,
          viz: "area",
          vizOptions: { mode: "auto" },
        },
        {
          id: "tipo",
          type: "bar",
          orientation: "horizontal",
          title: "Tipo de requerimiento",
          subtitle: "Requerimientos frente a quejas o reclamos",
          dimension: "Tipo_de_Requerimiento",
          size: "sm",
          viz: "composition",
          vizOptions: { layout: "split" },
          maxItems: 3,
        },
        {
          id: "canal",
          type: "bar",
          orientation: "vertical",
          title: "Canal de radicación",
          subtitle: "Participación de cada canal de entrada",
          dimension: "Canal_de_Radicacion",
          // Mismo color por canal que en PQRD (Mail/Email, Web, Ventanilla…)
          semantic: "canal-radicacion",
          size: "sm",
          viz: "composition",
          vizOptions: { layout: "split" },
          maxItems: 3,
        },
      ],
      rows: [
        { template: "12", tier: "M", cells: ["serie"] },
        { template: "6-6", tier: "S", cells: ["tipo", "canal"] },
      ],
    },
    {
      id: "entes",
      nav: "Entes y oficinas",
      question: "¿Quién nos requiere y quién responde?",
      widgets: [
        {
          id: "entes",
          type: "bar",
          orientation: "vertical",
          title: "Entes de control",
          subtitle: "Radicados por ente que requiere",
          dimension: "ente_control",
          size: "lg",
          viz: "entity-tiles",
          vizOptions: { acronyms: ENTES_SIGLAS },
          labelKind: "ente",
          maxItems: 10,
        },
        {
          id: "oficinas",
          type: "bar",
          orientation: "horizontal",
          title: "Oficinas responsables",
          subtitle: "Top 11 por radicados · resto agrupado",
          dimension: "Oficina_responsable_de_respuesta",
          topN: 12,
          others: true,
          size: "md",
          viz: "ranking",
          vizOptions: { columns: 2, concentration: true },
          labelKind: "oficina",
          // topN 12 con "Otros": 11 oficinas + "Otras N oficinas" → 6 | 6 caben en M (40 + 6 × 40 = 280 ≤ 284)
          maxItems: 12,
        },
      ],
      rows: [
        { template: "12", tier: "M", cells: ["entes"] },
        { template: "12", tier: "M", cells: ["oficinas"] },
      ],
    },
  ],
  table: {
    title: "Detalle de requerimientos de entes de control",
    columns: ENTES_TABLE_COLUMNS,
    searchFields: ["Numero_de_Radicado", "Oficina_responsable_de_respuesta", "Gestionador_Responsable", "ente_control"],
    defaultSort: { field: "Fecha_de_Radicacion", dir: "desc" },
  },
  notes: ENTES_NOTES,
};
