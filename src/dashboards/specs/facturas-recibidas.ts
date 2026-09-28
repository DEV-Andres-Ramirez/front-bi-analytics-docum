import type { DashboardSpec } from "../types";
import { avg, count, distinct, sum, DIAS_ORDER } from "./helpers";

export const facturasRecibidas: DashboardSpec = {
  slug: "facturas-recibidas",
  dataset: "facturas_recibidas",
  dateField: "fecha",
  dateLabel: "Fecha de la factura",
  filters: [
    { field: "Hom_ultimo_Evento", label: "Último evento RADIAN", kind: "multi", primary: true },
    { field: "proveedor_nombre", label: "Proveedor", kind: "multi", primary: true },
    { field: "proveedor", label: "NIT proveedor", kind: "text", placeholder: "Ej. 900448997" },
    { field: "Aux_Numero_Factura", label: "Número de factura", kind: "text", placeholder: "Prefijo + consecutivo" },
    { field: "cufe", label: "CUFE", kind: "text" },
    { field: "prefijo", label: "Prefijo", kind: "multi" },
    { field: "dia_semana", label: "Día de la semana", kind: "multi" },
  ],
  kpis: [
    { id: "facturas", label: "Facturas recibidas", measure: count(), format: "int", polarity: "neutral", hero: true, hint: "Número de facturas electrónicas recibidas con fecha dentro del periodo." },
    { id: "valor", label: "Valor total recibido", measure: sum("valor"), format: "cop", polarity: "neutral", hint: "Suma del valor de las facturas recibidas en el periodo, en pesos colombianos." },
    { id: "proveedores", label: "Proveedores activos", measure: distinct("proveedor"), format: "int", polarity: "neutral", hint: "Proveedores distintos (NIT) con al menos una factura en el periodo." },
    { id: "ticket", label: "Valor promedio por factura", measure: avg("valor"), format: "cop", polarity: "neutral", hint: "Valor total recibido dividido entre el número de facturas." },
  ],
  sections: [
    {
      id: "tendencia",
      title: "Tendencia",
      widgets: [
        { id: "serie", type: "timeseries", title: "Facturas recibidas por fecha", subtitle: "Cantidad diaria · la línea tenue es el periodo anterior", size: "full", compare: true },
        { id: "mensual-cantidad", type: "monthly", title: "Facturas por mes", subtitle: "Cantidad y variación frente al mes anterior", size: "md", scope: "ytd", colorSlot: 1 },
        { id: "mensual-valor", type: "monthly", title: "Valor de facturas por mes", subtitle: "Pesos colombianos y variación mensual", size: "md", scope: "ytd", measure: sum("valor"), valueFormat: "cop", colorSlot: 2 },
      ],
    },
    {
      id: "proveedores",
      title: "Proveedores y eventos RADIAN",
      widgets: [
        { id: "top-proveedores", type: "bar", orientation: "horizontal", title: "Proveedores con más facturas", subtitle: "Top 10 por cantidad de facturas", dimension: "proveedor_nombre", topN: 10, size: "lg", height: 380 },
        { id: "eventos", type: "donut", title: "Último evento RADIAN", dimension: "Hom_ultimo_Evento", size: "sm" },
        { id: "eventos-serie", type: "timeseries", title: "Facturas por último evento RADIAN", subtitle: "Cantidad diaria por evento", splitBy: "Hom_ultimo_Evento", splitTopN: 4, size: "lg" },
        { id: "dias", type: "bar", orientation: "horizontal", title: "Facturas por día de la semana", dimension: "dia_semana", sort: "natural", order: DIAS_ORDER, size: "sm" },
      ],
    },
  ],
  table: {
    title: "Detalle de facturas recibidas",
    columns: [
      { field: "id", label: "ID", format: "mono" },
      { field: "ofe", label: "OFE", format: "mono", visible: false },
      { field: "proveedor", label: "NIT proveedor", format: "mono" },
      { field: "proveedor_nombre", label: "Proveedor" },
      { field: "Aux_Numero_Factura", label: "Factura", format: "mono" },
      { field: "consecutivo", label: "Consecutivo", format: "mono", visible: false },
      { field: "cufe", label: "CUFE", format: "mono", visible: false },
      { field: "dia_semana", label: "Día" },
      { field: "fecha", label: "Fecha y hora", format: "datetime" },
      { field: "Solo_hora", label: "Hora (franja)", format: "int", visible: false },
      { field: "valor", label: "Valor", format: "cop" },
      { field: "Hom_ultimo_Evento", label: "Último evento RADIAN", format: "badge" },
    ],
    searchFields: ["Aux_Numero_Factura", "cufe", "proveedor", "proveedor_nombre", "id"],
    defaultSort: { field: "fecha", dir: "desc" },
  },
};
