import type { DashboardSpec } from "../types";
import { count, distinct, is, share, sum, DIAS_ORDER } from "./helpers";

export const facturasEmitidas: DashboardSpec = {
  slug: "facturas-emitidas",
  dataset: "facturas_emitidas",
  dateField: "fecha_expedicion",
  dateLabel: "Fecha de expedición",
  filters: [
    { field: "estado", label: "Estado", kind: "multi", primary: true },
    { field: "tipo_documento", label: "Tipo de documento", kind: "multi", primary: true },
    { field: "adquiriente_nombre", label: "Adquiriente", kind: "multi", primary: true },
    { field: "nit_adquiriente", label: "NIT adquiriente", kind: "text" },
    { field: "AUX_Numero_Factura", label: "Número de factura", kind: "text" },
    { field: "nro_resolucion", label: "Número de resolución", kind: "multi" },
    { field: "forma_pago", label: "Forma de pago", kind: "multi" },
  ],
  kpis: [
    { id: "facturas", label: "Facturas emitidas", measure: count(), format: "int", polarity: "neutral", hero: true, hint: "Facturas expedidas en el periodo (incluye inconsistentes)." },
    { id: "valor", label: "Valor facturas emitidas", measure: sum("valor_neto"), format: "cop", polarity: "neutral", hint: "Suma del valor neto de las facturas expedidas en el periodo." },
    { id: "adquirientes", label: "Adquirientes", measure: distinct("nit_adquiriente"), format: "int", polarity: "neutral", hint: "Adquirientes distintos (NIT/cédula) facturados en el periodo." },
    { id: "inconsistentes", label: "% Inconsistentes", measure: share(is("estado", "INCONSISTENTE")), format: "pct", polarity: "up-bad", hint: "Facturas en estado INCONSISTENTE sobre el total (normalmente adquiriente no encontrado para el OFE)." },
  ],
  sections: [
    {
      id: "tendencia",
      title: "Tendencia mensual",
      widgets: [
        { id: "mensual-cantidad", type: "monthly", title: "Facturas por mes", subtitle: "Cantidad y variación frente al mes anterior", size: "md", scope: "ytd", colorSlot: 1 },
        { id: "mensual-valor", type: "monthly", title: "Valor de facturas por mes", subtitle: "Valor neto (COP) y variación mensual", size: "md", scope: "ytd", measure: sum("valor_neto"), valueFormat: "cop", colorSlot: 3 },
      ],
    },
    {
      id: "composicion",
      title: "Adquirientes y comportamiento",
      widgets: [
        { id: "top-adquirientes", type: "bartable", title: "Adquirientes con más facturas", columns: [{ field: "adquiriente_nombre", label: "Adquiriente" }], measureLabel: "Facturas", topN: 60, size: "md", height: 360 },
        { id: "estado-tipo", type: "bartable", title: "Facturas por estado y tipo", columns: [{ field: "estado", label: "Estado" }, { field: "tipo_documento", label: "Tipo" }], measureLabel: "Cantidad", size: "md", height: 360 },
        { id: "dias", type: "bar", orientation: "horizontal", title: "Facturas por día de la semana", dimension: "dia_semana", sort: "natural", order: DIAS_ORDER, size: "sm" },
        { id: "horas", type: "bar", orientation: "vertical", title: "Facturas emitidas por hora", subtitle: "Hora de expedición (0–23)", dimension: "Solo_Hora", sort: "label", size: "lg" },
      ],
    },
    {
      id: "resoluciones",
      title: "Resoluciones de facturación",
      widgets: [
        {
          id: "resoluciones",
          type: "bartable",
          title: "Valor neto por resolución",
          subtitle: "Resoluciones DIAN, rangos de consecutivos y tipo de documento",
          columns: [
            { field: "estado", label: "Estado" },
            { field: "nro_resolucion", label: "Resolución" },
            { field: "fecha_inicio", label: "Fecha inicial" },
            { field: "fecha_fin", label: "Fecha final" },
            { field: "consecutivo_inicial", label: "Consecutivo inicial" },
            { field: "consecutivo_final", label: "Consecutivo final" },
            { field: "tipo_documento", label: "Documento" },
          ],
          measure: sum("valor_neto"),
          measureLabel: "Valor neto",
          valueFormat: "cop",
          size: "full",
          note: "La resolución 99999999999999 es un valor de relleno que llega desde la fuente en facturas inconsistentes.",
        },
      ],
    },
  ],
  table: {
    title: "Detalle de facturas emitidas",
    columns: [
      { field: "id", label: "ID", format: "mono" },
      { field: "nit_oferente", label: "Oferente", format: "mono", visible: false },
      { field: "nit_adquiriente", label: "NIT adquiriente", format: "mono" },
      { field: "adquiriente_nombre", label: "Adquiriente" },
      { field: "AUX_Numero_Factura", label: "Número", format: "mono" },
      { field: "forma_pago", label: "Forma de pago", visible: false },
      { field: "medio_pago", label: "Medio de pago", visible: false },
      { field: "dia_semana", label: "Día", visible: false },
      { field: "fecha_expedicion", label: "Expedición", format: "datetime" },
      { field: "valor_neto", label: "Valor neto", format: "cop" },
      { field: "estado", label: "Estado", format: "badge" },
      { field: "mensaje", label: "Mensaje", format: "long" },
    ],
    searchFields: ["AUX_Numero_Factura", "nit_adquiriente", "adquiriente_nombre", "id"],
    defaultSort: { field: "fecha_expedicion", dir: "desc" },
  },
};
