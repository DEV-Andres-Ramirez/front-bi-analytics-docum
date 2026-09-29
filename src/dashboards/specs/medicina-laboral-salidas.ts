import type { DashboardSpec } from "../types";
import { avg, count, is, MEDIO_ENVIO_ORDER, share } from "./helpers";

const NOTIFICABLE = is("NOTIFICABLE", "Sí");

/** Valores reales de EVENTO_CORREO_ELECTRONICO_CERTIFICADO (familia notificacion). */
const EVENTO = "EVENTO_CORREO_ELECTRONICO_CERTIFICADO";
const ACUSE = "Acuse de recibo";
const ABRIO = "El destinatario abrio la notificacion";
const FALLIDA = "No fue posible la entrega al destinatario";

/** Orden ordinal de las copias (Ppal, 1–8). */
const COPIA_ORDER = ["PRINCIPAL", "COPIA 1", "COPIA 2", "COPIA 3", "COPIA 4", "COPIA 5", "COPIA 6", "COPIA 7", "COPIA 8"];

export const medicinaLaboralSalidas: DashboardSpec = {
  slug: "medicina-laboral-salidas",
  dataset: "ml_salidas",
  dateField: "FECHA_APROBACION",
  dateLabel: "Fecha de aprobación",
  unit: { singular: "salida", plural: "salidas" },
  filters: [
    { field: "FORMA_DE_ENVIO", label: "Forma de envío", kind: "multi", primary: true },
    { field: "EVENTO_CORREO_ELECTRONICO_CERTIFICADO", label: "Evento correo electrónico", kind: "multi", primary: true },
    { field: "OFICINA", label: "Oficina", kind: "multi", primary: true },
    { field: "TRAMITE", label: "Trámite", kind: "multi", primary: true },
    { field: "ESTADO_GUIA", label: "Estado guía", kind: "multi" },
    { field: "COPIA", label: "Copia", kind: "multi" },
    { field: "TIPO_EVENTO", label: "Tipo de evento", kind: "multi" },
    { field: "PROCESO_ASISTENTE", label: "Proceso asistente", kind: "multi" },
    { field: "ESTADO_SALIDA", label: "Estado salida", kind: "multi" },
    { field: "DEPARTAMENTO_DESTINATARIO", label: "Departamento destinatario", kind: "multi" },
    { field: "CUENTA_ENVIO_CORREO", label: "Cuenta de envío", kind: "multi" },
    { field: "GESTIONADOR_RESPONSABLE", label: "Gestionador", kind: "multi" },
    { field: "REVISOR", label: "Revisor", kind: "multi" },
    { field: "APROBADOR", label: "Aprobador", kind: "multi" },
    { field: "PREFIJO", label: "Prefijo", kind: "multi" },
    { field: "FECHA_MAXIMA_RESPUESTA", label: "Fecha máxima de respuesta", kind: "date" },
    { field: "NUMERO_GUIA_ENVIO", label: "Número de guía", kind: "text" },
    { field: "ID_ENVIO_CORREO_ELECTRONICO_CERTIFICADO", label: "ID SealMail", kind: "text" },
    { field: "NUMERO_RADICADO", label: "Radicado", kind: "text" },
  ],
  kpis: [
    { id: "total", label: "Total de salidas", short: "Salidas", measure: count(), format: "int", polarity: "neutral", hero: true, hint: "Comunicaciones de salida (principal y copias) aprobadas en el periodo." },
    { id: "entregadas", label: "% Entregadas de notificables", short: "Entregadas", measure: share(is(EVENTO, ACUSE), NOTIFICABLE), format: "pct", polarity: "up-good", hint: "Acuse de recibo sobre las salidas notificables (acuse, abiertas y fallidas)." },
    { id: "abiertas", label: "% Abiertas de notificables", short: "Abiertas", measure: share(is(EVENTO, ABRIO), NOTIFICABLE), format: "pct", polarity: "up-good", hint: "Notificaciones que el destinatario abrió sobre las notificables." },
    { id: "fallidas", label: "% Fallidas de notificables", short: "Fallidas", measure: share(is(EVENTO, FALLIDA), NOTIFICABLE), format: "pct", polarity: "up-bad", hint: "Entregas fallidas sobre las salidas notificables." },
    { id: "guias", label: "Guías físicas pendientes", short: "Guías pendientes", measure: count(is("ESTADO_GUIA", "Por enviar Mensajería", "Por recibir en correspondencia", "Por enviar Courier")), format: "int", polarity: "up-bad", hint: "Guías por enviar (mensajería o courier) o por recibir en correspondencia." },
    { id: "digital", label: "% Envío digital", short: "% Digital", measure: share(is("FORMA_DE_ENVIO", "Correo electrónico certificado", "Correo electrónico")), format: "pct", polarity: "up-good", hint: "Salidas enviadas por correo electrónico (certificado o simple)." },
    { id: "aprobacion", label: "Aprobación (promedio días)", short: "Días aprobación", measure: avg("DIAS_EN_APROBACION"), format: "days", polarity: "up-bad", hint: "Promedio de días en aprobación." },
    { id: "sla", label: "% Dentro de SLA", short: "% En SLA", measure: share(is("DENTRO_SLA", "Sí"), is("DENTRO_SLA", "Sí", "No")), format: "pct", polarity: "up-good", provisional: true, hint: "Días en aprobación menores o iguales al tiempo definido del trámite (solo trámites con tiempo definido). Fórmula provisional." },
  ],
  // kpiRedesign §6: fila 1 4-8 (héroe + proporción de notificación) · fila 2 6-6 compacta (Envío | Aprobación)
  kpiLayout: [
    {
      template: "4-8",
      cells: [
        { kind: "hero", kpi: "total" },
        {
          kind: "group",
          title: "Resultado de notificación · % de notificables",
          variant: "proportion",
          kpis: ["entregadas", "abiertas", "fallidas"],
          tones: ["good", "info", "critical"],
          filters: [
            { field: EVENTO, value: ACUSE },
            { field: EVENTO, value: ABRIO },
            { field: EVENTO, value: FALLIDA },
          ],
        },
      ],
    },
    {
      template: "6-6",
      compact: true,
      cells: [
        { kind: "group", title: "Envío", variant: "list", kpis: ["digital", "guias"] },
        { kind: "group", title: "Aprobación", variant: "list", kpis: ["aprobacion", "sla"] },
      ],
    },
  ],
  sections: [
    {
      id: "destino",
      nav: "Destino",
      question: "¿A dónde van las salidas?",
      widgets: [
        {
          id: "mapa",
          type: "map",
          title: "Territorio del destinatario",
          subtitle: "Salidas · desglose por forma de envío",
          geoLabel: "destinatario",
          breakdown: { field: "FORMA_DE_ENVIO", label: "Forma de envío" },
          size: "full",
          viz: "hero-map",
          hero: true,
          note: "Ubicación del destinatario de la comunicación.",
        },
      ],
      rows: [{ template: "12", tier: "XL", cells: ["mapa"] }],
    },
    {
      id: "notificacion",
      nav: "Notificación",
      question: "¿Qué pasó con cada envío?",
      description: "Volumen de salidas, incluidas las que no tienen evento (la banda muestra tasas).",
      widgets: [
        {
          id: "resultado",
          type: "bar",
          orientation: "horizontal",
          title: "Resultado de la notificación",
          subtitle: "Último evento del correo certificado",
          dimension: "EVENTO_CORREO_ELECTRONICO_CERTIFICADO",
          size: "md",
          viz: "status-strip",
          // Tiles de ≈116 px (span 6): nombres cortos, los mismos de la banda de KPIs (Entregadas · Abiertas · Fallidas)
          vizOptions: { variant: "horizontal", overrides: { [ACUSE]: { label: "Entregada" }, [ABRIO]: { label: "Abierta" }, [FALLIDA]: { label: "Fallida" } } },
          semantic: "notificacion",
          maxItems: 4,
        },
        {
          id: "tramite",
          type: "bar",
          orientation: "vertical",
          title: "Tipo de trámite",
          subtitle: "Participación de cada trámite",
          dimension: "TRAMITE",
          size: "sm",
          viz: "composition",
          vizOptions: { layout: "split" },
          maxItems: 2,
        },
        {
          id: "guias",
          type: "bar",
          orientation: "vertical",
          title: "Estados de guía",
          subtitle: "Envíos físicos",
          dimension: "ESTADO_GUIA",
          size: "sm",
          viz: "status-strip",
          vizOptions: { variant: "list", qualityVariant: "list" },
          semantic: "guia",
          maxItems: 6,
        },
        {
          id: "copia",
          type: "bar",
          orientation: "vertical",
          title: "Categoría de copia",
          subtitle: "Salidas por número de copia",
          dimension: "COPIA",
          sort: "natural",
          order: COPIA_ORDER,
          size: "sm",
          viz: "column-bars",
          vizOptions: { preset: "copia" },
          maxItems: 9,
        },
        {
          id: "medio",
          type: "bar",
          orientation: "vertical",
          title: "Medio de envío",
          subtitle: "Salidas por forma de envío",
          dimension: "FORMA_DE_ENVIO",
          // Mismo color por medio que en Correspondencia entradas y en el desglose del mapa
          order: MEDIO_ENVIO_ORDER,
          size: "sm",
          viz: "composition",
          vizOptions: { layout: "legend" },
          maxItems: 5,
        },
      ],
      // Doc: 6-6 S (resultado | medio: 100 y 122 ≤ 184) y 4-4-4 M (guias 232 · copia · tramite 120 ≤ 284: sin franja
      // de leyenda, porque copia es column-bars sin familia y no dibuja leyenda)
      rows: [
        { template: "6-6", tier: "S", cells: ["resultado", "medio"] },
        { template: "4-4-4", tier: "M", cells: ["guias", "copia", "tramite"] },
      ],
    },
    {
      id: "oficinas",
      nav: "Oficinas",
      question: "¿Qué oficinas envían más y cuáles notifican mejor?",
      widgets: [
        {
          id: "oficinas",
          type: "bar",
          orientation: "horizontal",
          title: "Oficinas asignadas",
          subtitle: "Salidas y % de notificaciones entregadas",
          dimension: "OFICINA",
          secondary: { measure: share(is("EVENTO_CORREO_ELECTRONICO_CERTIFICADO", "Acuse de recibo"), NOTIFICABLE), label: "Entregadas", format: "pct" },
          size: "md",
          viz: "ranking",
          vizOptions: { columns: 2, bulletKpi: "entregadas" },
          labelKind: "oficina",
          maxItems: 8,
        },
      ],
      // M: las 8 oficinas en 2 columnas (4 | 4) también en tablet, sin "Ver 4 más"
      rows: [{ template: "12", tier: "M", cells: ["oficinas"] }],
    },
    {
      id: "ritmo",
      nav: "Ritmo",
      question: "¿Cómo se aprueban las salidas y con qué plazo?",
      widgets: [
        {
          id: "serie",
          type: "timeseries",
          title: "Salidas aprobadas",
          subtitle: "Por fecha de aprobación",
          size: "full",
          compare: true,
          viz: "area",
          vizOptions: { mode: "auto" },
        },
        {
          id: "tiempo-definido",
          type: "histogram",
          // Título de una línea a span 4 (con 2 líneas bajaba el chip y la base ≈ 20 px frente a la serie vecina);
          // el subtítulo (una línea con elipsis) se queda en 29 caracteres para caber a 1024 (interno ≈ 244 px).
          title: "Plazo definido",
          subtitle: "Días definidos para responder",
          field: "TIEMPO_DEFINIDO_DIAS",
          unit: "días",
          bins: [1, 2, 3, 5, 7, 8, 10, 15, 30],
          size: "md",
          viz: "histogram",
        },
      ],
      // P2 en 8 M (doc: "12 M u 8 M"); al lado, el plazo definido del trámite (referencia del KPI "% Dentro de SLA").
      rows: [{ template: "8-4", tier: "M", cells: ["serie", "tiempo-definido"] }],
    },
    {
      id: "responsables",
      nav: "Responsables",
      question: "¿Quién gestiona las salidas y en qué procesos?",
      widgets: [
        {
          id: "gestionadores",
          type: "bar",
          orientation: "horizontal",
          title: "Gestionadores",
          dimension: "GESTIONADOR_RESPONSABLE",
          topN: 10,
          size: "md",
          viz: "people",
          vizOptions: { compact: true },
          labelKind: "persona",
          maxItems: 10,
        },
        {
          id: "revisores",
          type: "bar",
          orientation: "horizontal",
          title: "Revisores",
          dimension: "REVISOR",
          topN: 10,
          size: "md",
          viz: "people",
          vizOptions: { compact: true },
          labelKind: "persona",
          maxItems: 10,
        },
        {
          id: "procesos",
          type: "bar",
          orientation: "horizontal",
          title: "Procesos",
          subtitle: "Proceso del asistente",
          dimension: "PROCESO_ASISTENTE",
          size: "md",
          viz: "treemap",
          vizOptions: { listToggle: true },
          maxItems: 11,
        },
      ],
      rows: [
        { template: "6-6", tier: "L", cells: ["gestionadores", "revisores"] },
        { template: "12", tier: "M", cells: ["procesos"] },
      ],
    },
  ],
  table: {
    title: "Detalle de salidas de medicina laboral",
    columns: [
      { field: "NUMERO_RADICADO", label: "Radicado", format: "mono" },
      { field: "DESTINATARIO", label: "Destinatario" },
      { field: "FECHA_APROBACION", label: "Aprobada el", format: "datetime" },
      { field: "FECHA_MAXIMA_RESPUESTA", label: "Fecha máxima", format: "date", visible: false },
      { field: "FORMA_DE_ENVIO", label: "Forma de envío" },
      { field: "EVENTO_CORREO_ELECTRONICO_CERTIFICADO", label: "Evento correo", format: "badge", semantic: "notificacion" },
      { field: "ESTADO_GUIA", label: "Estado guía", format: "badge", semantic: "guia" },
      { field: "ID_ENVIO_CORREO_ELECTRONICO_CERTIFICADO", label: "ID SealMail", format: "mono", visible: false },
      { field: "NUMERO_GUIA_ENVIO", label: "Número de guía", format: "mono", visible: false },
      { field: "GESTIONADOR_RESPONSABLE", label: "Gestionador", labelKind: "persona" },
      { field: "REVISOR", label: "Revisor", labelKind: "persona", visible: false },
      { field: "COPIA", label: "Copia" },
    ],
    searchFields: ["NUMERO_RADICADO", "DESTINATARIO", "NUMERO_GUIA_ENVIO", "ID_ENVIO_CORREO_ELECTRONICO_CERTIFICADO"],
    defaultSort: { field: "FECHA_APROBACION", dir: "desc" },
  },
};
