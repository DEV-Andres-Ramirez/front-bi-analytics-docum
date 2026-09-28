import type { DashboardSpec } from "../types";
import { count, is, share } from "./helpers";

export const tutelas: DashboardSpec = {
  slug: "tutelas",
  dataset: "tutelas",
  dateField: "fecharadicacion",
  dateLabel: "Fecha de radicación",
  filters: [
    { field: "Etapa_procesal", label: "Etapa procesal", kind: "multi", primary: true },
    { field: "Cerrado", label: "Estado de cumplimiento", kind: "multi", primary: true },
    { field: "Dependencia", label: "Dependencia", kind: "multi", primary: true },
    { field: "canal", label: "Canal", kind: "multi", primary: true },
    { field: "Gestionador", label: "Gestionador", kind: "multi" },
    { field: "Causal", label: "Causal", kind: "multi" },
    { field: "Estado_del_fallo", label: "Estado del fallo", kind: "multi" },
    { field: "estado", label: "Estado", kind: "multi" },
    { field: "Tiempo_para_responder", label: "Tiempo para responder", kind: "multi" },
    { field: "Radicado", label: "Radicado", kind: "text" },
    { field: "Numero_de_radicado_juzgado", label: "N° radicado juzgado", kind: "text" },
  ],
  kpis: [
    { id: "tutelas", label: "Tutelas", measure: count(), format: "int", polarity: "neutral", hero: true, hint: "Tutelas radicadas en el periodo." },
    { id: "en-termino", label: "% En término", measure: share(is("Cerrado", "En término")), format: "pct", polarity: "up-good", hint: "Respuesta enviada antes de la fecha de respuesta del juzgado." },
    { id: "fuera-termino", label: "% Fuera de término", measure: share(is("Cerrado", "Fuera de término")), format: "pct", polarity: "up-bad", hint: "Respuesta enviada después de la fecha de respuesta del juzgado." },
    { id: "en-tramite", label: "En trámite", measure: count(is("Cerrado", "En trámite")), format: "int", polarity: "neutral", hint: "Tutelas sin respuesta enviada todavía." },
    { id: "pct-tramite", label: "% En trámite", measure: share(is("Cerrado", "En trámite")), format: "pct", polarity: "neutral", hint: "Tutelas en trámite sobre el total." },
    {
      id: "desacato",
      label: "Tasa de desacato",
      measure: { kind: "ratioOf", num: count(is("Etapa_procesal", "Desacato")), den: count(is("Etapa_procesal", "Fallo de primera instancia")) },
      format: "pct",
      polarity: "up-bad",
      provisional: true,
      hint: "Tutelas en etapa Desacato sobre tutelas con fallo de primera instancia. Fórmula provisional: validar con el área jurídica.",
    },
  ],
  sections: [
    {
      id: "estado",
      title: "Canal, estado y etapas",
      widgets: [
        { id: "canal", type: "donut", title: "Tutelas según canal de radicado", dimension: "canal", size: "sm" },
        { id: "estado", type: "donut", title: "Tutelas según estado del radicado", dimension: "estado", size: "sm" },
        { id: "etapas", type: "donut", title: "Tutelas según etapa procesal", dimension: "Etapa_procesal", size: "sm" },
        { id: "fallos", type: "bar", orientation: "horizontal", title: "Estados de etapas procesales", subtitle: "Top 10", dimension: "Estado_del_fallo", topN: 10, size: "md" },
        { id: "causales", type: "bar", orientation: "horizontal", title: "Tutelas según causal", subtitle: "Top 10", dimension: "Causal", topN: 10, size: "md" },
      ],
    },
    {
      id: "responsables",
      title: "Dependencias y gestionadores",
      widgets: [
        { id: "dependencia", type: "bar", orientation: "horizontal", title: "Tutelas por dependencia", dimension: "Dependencia", size: "sm" },
        { id: "gestionadores", type: "bar", orientation: "horizontal", title: "Tutelas por gestionador", subtitle: "Top 20", dimension: "Gestionador", topN: 20, size: "lg", height: 520 },
      ],
    },
    {
      id: "territorio",
      title: "Tendencia y territorio",
      widgets: [
        { id: "serie", type: "timeseries", title: "Tutelas en el tiempo", subtitle: "La línea tenue es el periodo anterior", size: "full", compare: true },
        { id: "departamentos", type: "bar", orientation: "horizontal", title: "Departamento del juzgado remitente", subtitle: "Top 10", dimension: "Departamento_remitente", topN: 10, size: "sm", height: 440 },
        { id: "mapa", type: "map", title: "Tutelas por territorio", subtitle: "Doble clic en un departamento para ver sus municipios", geoLabel: "tutela", breakdown: { field: "Etapa_procesal", label: "Etapa procesal" }, size: "lg", height: 440 },
      ],
    },
  ],
  table: {
    title: "Detalle de tutelas",
    columns: [
      { field: "Radicado", label: "Radicado", format: "mono" },
      { field: "fecharadicacion", label: "Radicada el", format: "datetime" },
      { field: "dias_transcurridos", label: "Días transcurridos", format: "int" },
      { field: "Tiempo_para_responder", label: "Tiempo para responder" },
      { field: "Cerrado", label: "Estado de cumplimiento", format: "badge", semantic: "cumplimiento" },
      { field: "Etapa_procesal", label: "Etapa procesal" },
      { field: "Estado_del_fallo", label: "Estado del fallo" },
      { field: "Departamento_remitente", label: "Departamento", visible: false },
      { field: "Dependencia", label: "Dependencia" },
      { field: "Gestionador", label: "Gestionador" },
      { field: "Causal", label: "Causal", format: "long", visible: false },
      { field: "Numero_de_radicado_juzgado", label: "N° radicado juzgado", format: "mono", visible: false },
      { field: "canal", label: "Canal", visible: false },
    ],
    searchFields: ["Radicado", "Numero_de_radicado_juzgado", "Gestionador", "Causal"],
    defaultSort: { field: "fecharadicacion", dir: "desc" },
  },
};
