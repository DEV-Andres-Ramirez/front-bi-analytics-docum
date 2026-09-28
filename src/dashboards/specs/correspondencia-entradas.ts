import type { DashboardSpec } from "../types";
import { count, is, share } from "./helpers";

const PENDIENTES = ["Para gestión", "Por asignar", "Por aprobar", "En edición", "Por revisar", "Por recibir correspondencia", "En asignación"];

export const correspondenciaEntradas: DashboardSpec = {
  slug: "correspondencia-entradas",
  dataset: "entradas_generales",
  dateField: "Fecha_radicacion",
  dateLabel: "Fecha de radicación",
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
    { id: "radicados", label: "Radicados", measure: count(), format: "int", polarity: "neutral", hero: true, hint: "Correspondencia de entrada radicada en el periodo." },
    { id: "aprobados", label: "Aprobados", measure: count(is("Estado", "Aprobado")), format: "int", polarity: "up-good", hint: "Radicados en estado Aprobado." },
    { id: "pct-aprobados", label: "% Aprobados", measure: share(is("Estado", "Aprobado")), format: "pct", polarity: "up-good", hint: "Aprobados sobre el total de radicados del periodo." },
    { id: "pendientes", label: "Pendientes de gestión", measure: count(is("Estado", ...PENDIENTES)), format: "int", polarity: "up-bad", hint: `Radicados en estados abiertos: ${PENDIENTES.join(", ")}.` },
  ],
  sections: [
    {
      id: "composicion",
      title: "Trámites, canales y medios",
      widgets: [
        { id: "tipo-tramite", type: "bar", orientation: "vertical", title: "Tipo de trámite", dimension: "Tipo_de_tramite", size: "md" },
        { id: "canal", type: "donut", title: "Canal de radicación", dimension: "Canal_radicacion", size: "sm" },
        { id: "medio", type: "bar", orientation: "horizontal", title: "Medio de envío", dimension: "Medio_de_envio", size: "sm" },
      ],
    },
    {
      id: "oficinas",
      title: "Oficinas y estados",
      widgets: [
        { id: "oficinas", type: "bar", orientation: "horizontal", title: "Oficinas", subtitle: "Top 20 + otros", dimension: "Oficina_asignada", topN: 20, others: true, size: "md", height: 560 },
        { id: "estados", type: "bar", orientation: "horizontal", title: "Estado", subtitle: "Top 15 + otros", dimension: "Estado", topN: 15, others: true, size: "md", height: 560 },
        { id: "serie", type: "timeseries", title: "Radicados en el tiempo", subtitle: "La línea tenue es el periodo anterior", size: "full", compare: true },
        {
          id: "pivot",
          type: "pivot",
          title: "Oficina asignada por estado",
          subtitle: "Cantidad de radicados",
          rows: [{ field: "Oficina_asignada", label: "Oficina asignada" }],
          columns: { field: "Estado", label: "Estado" },
          size: "full",
          height: 460,
        },
        { id: "mapa", type: "map", title: "Radicados por territorio del remitente", subtitle: "Doble clic en un departamento para ver sus municipios", geoLabel: "remitente", breakdown: { field: "Tipo_de_tramite", label: "Tipo de trámite" }, size: "full", height: 480 },
      ],
    },
  ],
  table: {
    title: "Detalle de correspondencia de entrada",
    columns: [
      { field: "Numero_radicado", label: "Radicado", format: "mono" },
      { field: "Fecha_radicacion", label: "Radicado el", format: "datetime" },
      { field: "Tipo_de_tramite", label: "Tipo de trámite" },
      { field: "Estado", label: "Estado", format: "badge" },
      { field: "Oficina_asignada", label: "Oficina asignada" },
      { field: "Canal_radicacion", label: "Canal" },
      { field: "Departamento_remitente", label: "Departamento" },
      { field: "Municipio_remitente", label: "Municipio" },
      { field: "Usuario_gestion", label: "Usuario de gestión", visible: false },
      { field: "Radicado_de_salida", label: "Radicado de salida", format: "mono", visible: false },
      { field: "Estado_de_guia", label: "Estado de guía", visible: false },
    ],
    searchFields: ["Numero_radicado", "Oficina_asignada", "Usuario_gestion", "Radicado_de_salida"],
    defaultSort: { field: "Fecha_radicacion", dir: "desc" },
  },
};
