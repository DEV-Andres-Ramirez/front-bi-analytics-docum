import type { DashboardSpec } from "../types";
import { count, is, share } from "./helpers";

export const smartMomento2: DashboardSpec = {
  slug: "smart-momento-2",
  dataset: "smart_m2",
  dateField: "fecha_registro_m2",
  dateLabel: "Fecha de registro (M2)",
  filters: [
    { field: "nombre_motivo", label: "Motivo", kind: "multi", primary: true },
    { field: "nombre_punto_recepcion", label: "Punto de recepción", kind: "multi", primary: true },
    { field: "nombre_tipo_persona", label: "Tipo de persona", kind: "multi", primary: true },
    { field: "nombre_anexos_queja_reclamo", label: "Anexos queja/reclamo", kind: "multi", primary: true },
    { field: "nombre_canal", label: "Canal", kind: "multi" },
    { field: "nombre_departamento", label: "Departamento", kind: "multi" },
    { field: "nombre_municipio", label: "Municipio", kind: "multi" },
    { field: "nombre_ente_control", label: "Ente de control", kind: "multi" },
    { field: "nombre_producto", label: "Producto", kind: "multi" },
    { field: "codigo_queja_reclamo", label: "Código queja/reclamo", kind: "text" },
  ],
  kpis: [
    { id: "total", label: "Total transmitido", measure: count(), format: "int", polarity: "neutral", hero: true, hint: "Quejas registradas en el momento 2 (transmisión a la Superfinanciera)." },
    { id: "transmitido", label: "% Efectivamente transmitido", measure: share(is("caso_trasmitido_superfinanciera", "TRANSMITIDO")), format: "pct", polarity: "up-good", hint: "Casos con estado TRANSMITIDO sobre el total." },
    { id: "anexos", label: "% Con anexos", measure: share(is("nombre_anexos_queja_reclamo", "Sí")), format: "pct", polarity: "neutral", hint: "Quejas que incluyen anexos." },
    { id: "juridica", label: "% Persona jurídica", measure: share(is("nombre_tipo_persona", "Jurídica")), format: "pct", polarity: "neutral", hint: "Quejas presentadas por personas jurídicas." },
  ],
  sections: [
    {
      id: "motivos",
      title: "Motivos y productos",
      widgets: [
        { id: "motivos", type: "bar", orientation: "horizontal", title: "Motivos", dimension: "nombre_motivo", topN: 16, size: "lg", height: 460 },
        { id: "persona", type: "donut", title: "Tipo de persona", dimension: "nombre_tipo_persona", size: "sm" },
        { id: "producto", type: "bar", orientation: "horizontal", title: "Producto", dimension: "nombre_producto", size: "sm" },
      ],
    },
    {
      id: "recepcion",
      title: "Recepción, tendencia y territorio",
      widgets: [
        { id: "punto", type: "donut", title: "Punto de recepción", dimension: "nombre_punto_recepcion", size: "sm" },
        { id: "canal", type: "bar", orientation: "vertical", title: "Canal", dimension: "nombre_canal", size: "sm" },
        { id: "serie", type: "timeseries", title: "Radicados en el tiempo", subtitle: "La línea tenue es el periodo anterior", size: "sm", compare: true },
        { id: "mapa", type: "map", title: "Quejas por ubicación del consumidor", subtitle: "Doble clic en un departamento para ver sus municipios", geoLabel: "consumidor financiero", breakdown: { field: "nombre_motivo", label: "Motivo" }, size: "full", height: 480 },
      ],
    },
  ],
  table: {
    title: "Detalle SMART · Momento 2",
    columns: [
      { field: "fecha_registro_m2", label: "Registro M2", format: "datetime" },
      { field: "codigo_queja_reclamo", label: "Código queja/reclamo", format: "mono" },
      { field: "nombre_motivo", label: "Motivo" },
      { field: "nombre_canal", label: "Canal" },
      { field: "nombre_departamento", label: "Departamento" },
      { field: "nombre_municipio", label: "Municipio" },
      { field: "nombre_producto", label: "Producto" },
      { field: "caso_trasmitido_superfinanciera", label: "Transmitido", format: "badge" },
      { field: "nombre_punto_recepcion", label: "Punto de recepción" },
    ],
    searchFields: ["codigo_queja_reclamo", "nombre_motivo", "nombre_municipio"],
    defaultSort: { field: "fecha_registro_m2", dir: "desc" },
  },
};
