import type { DashboardSpec } from "../types";
import { count, is, share } from "./helpers";

const PENDIENTES = ["Para gestión", "Por asignar", "Por aprobar", "En edición", "Por revisar", "Por recibir correspondencia", "En asignación"];

/**
 * Grupos del tablero de estados (familia flujo) con "En curso" = PENDIENTES, para que el
 * subtotal coincida con el KPI "Pendientes de gestión". La solicitud de reclasificación no
 * cuenta como pendiente en el KPI y va en su propio grupo.
 */
const ESTADO_GROUPS: Record<string, string[]> = {
  Finalizado: ["Aprobado", "Cerrado", "Enviado", "Entrega Exitosa", "Reclasificación aprobada", "Gestión terminada"],
  "En curso": PENDIENTES,
  Reclasificar: ["Solicitud de reclasificación"],
  Devuelto: ["Aprobación rechazada", "Revisión rechazada", "Gestión rechazada", "Devuelto"],
  Anulado: ["Cerrado sin gestión", "Anulado", "Eliminada", "Excluido", "Duplicado"],
};

/**
 * La solicitud de reclasificación espera una decisión: tono warning (ícono de alerta) para que
 * "Reclasificar" no se confunda con "En curso" (info, reloj) en la barra 100 % ni en el pivote.
 */
const ESTADO_OVERRIDES: Record<string, { tone: "warning"; group: string }> = {
  "Solicitud de reclasificación": { tone: "warning", group: "Reclasificar" },
};

/** Tableros relacionados por tipo de trámite (enlace "Ver tablero ↗" en CategoryTiles). */
const TRAMITE_LINKS: Record<string, string> = {
  PQRD: "pqrd",
  "Medicina laboral": "medicina-laboral-entradas",
  Tutela: "tutelas",
  "Entes control": "entes-control",
};

export const correspondenciaEntradas: DashboardSpec = {
  slug: "correspondencia-entradas",
  dataset: "entradas_generales",
  dateField: "Fecha_radicacion",
  dateLabel: "Fecha de radicación",
  unit: { singular: "radicado", plural: "radicados" },
  filters: [
    { field: "Tipo_de_tramite", label: "Tipo de trámite", kind: "multi", primary: true },
    { field: "Estado", label: "Estado", kind: "multi", primary: true },
    { field: "Canal_radicacion", label: "Canal", kind: "multi", primary: true },
    { field: "Oficina_asignada", label: "Oficina asignada", kind: "multi", primary: true },
    { field: "Punto_de_radicacion", label: "Punto de radicación", kind: "multi" },
    { field: "Departamento_remitente", label: "Departamento", kind: "multi" },
    { field: "Municipio_remitente", label: "Municipio", kind: "multi" },
    { field: "Usuario_gestion", label: "Usuario de gestión", kind: "multi" },
    { field: "Tramite_inicial", label: "Trámite inicial", kind: "multi" },
    { field: "Radicador", label: "Radicador", kind: "multi" },
    { field: "Medio_de_envio", label: "Medio de envío", kind: "multi" },
    { field: "Sucursal", label: "Sucursal", kind: "multi" },
    { field: "Estado_de_guia", label: "Estado de guía", kind: "multi" },
    { field: "aprobador", label: "Aprobador", kind: "multi" },
    { field: "Numero_radicado", label: "Radicado", kind: "text" },
  ],
  kpis: [
    { id: "radicados", label: "Radicados", short: "Radicados", measure: count(), format: "int", polarity: "neutral", hero: true, hint: "Correspondencia de entrada radicada en el periodo." },
    { id: "aprobados", label: "Aprobados", short: "Aprobados", measure: count(is("Estado", "Aprobado")), format: "int", polarity: "up-good", hint: "Radicados en estado Aprobado." },
    { id: "pct-aprobados", label: "% Aprobados", short: "% Aprobados", measure: share(is("Estado", "Aprobado")), format: "pct", polarity: "up-good", hint: "Aprobados sobre el total de radicados del periodo." },
    { id: "pendientes", label: "Pendientes de gestión", short: "Pendientes", measure: count(is("Estado", ...PENDIENTES)), format: "int", polarity: "up-bad", hint: `Radicados en estados abiertos: ${PENDIENTES.join(", ")}.` },
  ],
  // kpiRedesign §6: 4-8 (misma primera fila que Salidas) · [héroe radicados] [Aprobación y pendientes]
  kpiLayout: [
    {
      template: "4-8",
      cells: [
        { kind: "hero", kpi: "radicados" },
        {
          kind: "group",
          title: "Aprobación y pendientes",
          variant: "list",
          kpis: ["aprobados", "pct-aprobados", "pendientes"],
          accents: { pendientes: "warning" },
          anchors: { pendientes: "#gestion" },
        },
      ],
    },
  ],
  sections: [
    {
      id: "territorio",
      nav: "Territorio",
      question: "¿Desde dónde nos escriben?",
      widgets: [
        {
          id: "mapa",
          type: "map",
          title: "Territorio del remitente",
          subtitle: "Departamento y municipio · por trámite",
          geoLabel: "remitente",
          breakdown: { field: "Tipo_de_tramite", label: "Tipo de trámite" },
          size: "full",
          viz: "hero-map",
          hero: true,
        },
      ],
      rows: [{ template: "12", tier: "XL", cells: ["mapa"] }],
    },
    {
      id: "entrada",
      nav: "Entrada y trámite",
      question: "¿Cuánto entró y de qué tipo?",
      widgets: [
        {
          id: "serie",
          type: "timeseries",
          title: "Radicados en el tiempo",
          subtitle: "Frente al periodo anterior",
          size: "lg",
          compare: true,
          viz: "area",
          vizOptions: { mode: "auto" },
        },
        {
          id: "tipo-tramite",
          type: "bar",
          orientation: "vertical",
          title: "Tipo de trámite",
          subtitle: "Participación de cada trámite",
          dimension: "Tipo_de_tramite",
          size: "sm",
          viz: "category-tiles",
          vizOptions: { links: TRAMITE_LINKS },
          maxItems: 7,
        },
      ],
      rows: [{ template: "7-5", tier: "M", cells: ["serie", "tipo-tramite"] }],
    },
    {
      id: "canal",
      nav: "Canal y medio",
      question: "¿Por dónde llega la correspondencia?",
      widgets: [
        {
          id: "canal",
          type: "bar",
          orientation: "vertical",
          title: "Canal de radicación",
          subtitle: "Participación de cada canal de entrada",
          dimension: "Canal_radicacion",
          size: "sm",
          viz: "composition",
          vizOptions: { layout: "legend" },
          maxItems: 8,
        },
        {
          id: "medio",
          type: "bar",
          orientation: "horizontal",
          title: "Medio de envío",
          subtitle: "Cómo envía el remitente",
          dimension: "Medio_de_envio",
          size: "sm",
          viz: "composition",
          vizOptions: { layout: "legend" },
          maxItems: 5,
        },
      ],
      rows: [{ template: "6-6", tier: "S", cells: ["canal", "medio"] }],
    },
    {
      id: "gestion",
      nav: "Gestión",
      question: "¿En qué estado está y qué oficina la tiene?",
      widgets: [
        {
          id: "estados",
          type: "bar",
          orientation: "horizontal",
          title: "Estados",
          subtitle: "En curso = pendientes de gestión",
          dimension: "Estado",
          topN: 15,
          others: true,
          size: "md",
          viz: "status-board",
          vizOptions: { groups: ESTADO_GROUPS, overrides: ESTADO_OVERRIDES },
          semantic: "flujo",
          maxItems: 15,
        },
        {
          id: "oficinas",
          type: "bar",
          orientation: "horizontal",
          title: "Oficinas asignadas",
          subtitle: "Top 20 por radicados + otras",
          dimension: "Oficina_asignada",
          topN: 20,
          others: true,
          size: "md",
          viz: "ranking",
          vizOptions: { columns: 3 },
          labelKind: "oficina",
          maxItems: 20,
        },
        {
          id: "pivot",
          type: "pivot",
          title: "Oficina asignada por estado",
          subtitle: "Radicados · estados por ciclo de vida",
          rows: [{ field: "Oficina_asignada", label: "Oficina asignada" }],
          columns: { field: "Estado", label: "Estado" },
          size: "full",
          viz: "pivot",
          // Mismos grupos que "Estados": En curso = PENDIENTES (coincide con el KPI) y Reclasificar aparte
          vizOptions: { columnFamily: "flujo", groups: ESTADO_GROUPS, overrides: ESTADO_OVERRIDES },
          labelKind: "oficina",
        },
      ],
      rows: [
        { template: "12", tier: "M", cells: ["estados"] },
        { template: "12", tier: "L", cells: ["oficinas"] },
        { template: "12", tier: "auto", cells: ["pivot"] },
      ],
    },
  ],
  table: {
    title: "Detalle de correspondencia de entrada",
    columns: [
      { field: "Numero_radicado", label: "Radicado", format: "mono" },
      { field: "Fecha_radicacion", label: "Radicado el", format: "datetime" },
      { field: "Tipo_de_tramite", label: "Tipo de trámite" },
      { field: "Estado", label: "Estado", format: "badge", semantic: "flujo" },
      { field: "Oficina_asignada", label: "Oficina asignada", labelKind: "oficina" },
      { field: "Canal_radicacion", label: "Canal" },
      { field: "Departamento_remitente", label: "Departamento" },
      { field: "Municipio_remitente", label: "Municipio" },
      { field: "Usuario_gestion", label: "Usuario de gestión", visible: false, labelKind: "persona" },
      { field: "Radicado_de_salida", label: "Radicado de salida", format: "mono", visible: false },
      { field: "Estado_de_guia", label: "Estado de guía", visible: false },
    ],
    searchFields: ["Numero_radicado", "Oficina_asignada", "Usuario_gestion", "Radicado_de_salida"],
    defaultSort: { field: "Fecha_radicacion", dir: "desc" },
  },
};
