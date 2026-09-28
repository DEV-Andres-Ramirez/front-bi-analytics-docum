import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  FileInput,
  FileOutput,
  Gauge,
  Gavel,
  Inbox,
  Landmark,
  MessageSquareWarning,
  Radar,
  ReceiptText,
  Send,
  ShieldCheck,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

export type ModuleId = "facturacion" | "pqrd" | "smart" | "tutelas" | "medicina" | "correspondencia";

export interface ModuleMeta {
  id: ModuleId;
  label: string;
  short: string;
  icon: LucideIcon;
}

export const MODULES: ModuleMeta[] = [
  { id: "facturacion", label: "Facturación Electrónica", short: "Facturación", icon: ReceiptText },
  { id: "pqrd", label: "PQRD y Entes de Control", short: "PQRD y Entes", icon: ShieldCheck },
  { id: "smart", label: "SMART Supervisión", short: "SMART", icon: Radar },
  { id: "tutelas", label: "Tutelas", short: "Tutelas", icon: Gavel },
  { id: "medicina", label: "Medicina Laboral", short: "Medicina Laboral", icon: Stethoscope },
  { id: "correspondencia", label: "Correspondencia", short: "Correspondencia", icon: Inbox },
];

export interface DashboardMeta {
  slug: string;
  title: string;
  /** Título corto para el menú lateral. */
  short: string;
  module: ModuleId;
  icon: LucideIcon;
  description: string;
  /** Vistas de BD que alimentan el tablero. */
  views: string[];
  tags: string[];
  /** KPI que se muestra en la tarjeta del catálogo. */
  headlineKpi: string;
}

export const DASHBOARDS: DashboardMeta[] = [
  {
    slug: "facturas-recibidas",
    title: "Facturas Recibidas",
    short: "Facturas recibidas",
    module: "facturacion",
    icon: FileInput,
    description: "Facturas electrónicas de proveedores: volumen, valor, eventos RADIAN y principales proveedores.",
    views: ["vw_reporte_datastudio_facturacion_factura_recibida", "vw_reporte_datastudio_facturacion_provider"],
    tags: ["RADIAN", "Proveedores"],
    headlineKpi: "facturas",
  },
  {
    slug: "facturas-emitidas",
    title: "Facturas Emitidas",
    short: "Facturas emitidas",
    module: "facturacion",
    icon: FileOutput,
    description: "Facturación emitida por Positiva: valor neto, adquirientes, resoluciones y estados ante la DIAN.",
    views: ["vw_reporte_datastudio_facturacion_factura_manual", "vw_reporte_datastudio_facturacion_acquirer"],
    tags: ["DIAN", "Resoluciones"],
    headlineKpi: "facturas",
  },
  {
    slug: "pqrd",
    title: "PQRD",
    short: "PQRD",
    module: "pqrd",
    icon: MessageSquareWarning,
    description: "Peticiones, quejas, reclamos y denuncias: tiempos por fase, cumplimiento de SLA, semáforo de riesgo y eficiencia por gerencia.",
    views: ["vw_reporte_datastudio_pqrd", "vw_reporte_datastudio_pqrd_eficiencia"],
    tags: ["SLA", "Mapa", "Eficiencia"],
    headlineKpi: "radicados",
  },
  {
    slug: "entes-control",
    title: "Entes de Control",
    short: "Entes de control",
    module: "pqrd",
    icon: Landmark,
    description: "Requerimientos de Supersalud, Mintrabajo, Rama Judicial y demás entes: estados, oficinas, canales y riesgo.",
    views: ["vw_reporte_datastudio_entes_control"],
    tags: ["SLA", "Mapa"],
    headlineKpi: "radicados",
  },
  {
    slug: "entes-control-eficiencia",
    title: "Entes de Control · Eficiencia Operativa",
    short: "Eficiencia operativa",
    module: "pqrd",
    icon: Gauge,
    description: "Carga por asignador, gestionador, revisor y aprobador, con las oficinas que más días toman en cada fase.",
    views: ["vw_reporte_datastudio_entes_control"],
    tags: ["Productividad", "Heatmap"],
    headlineKpi: "radicados",
  },
  {
    slug: "smart-momento-1",
    title: "SMART Supervisión · Momento 1",
    short: "Momento 1 · Registro",
    module: "smart",
    icon: Radar,
    description: "Quejas registradas en SMART de la Superfinanciera: productos, canales, macro motivos y ubicación del consumidor.",
    views: ["vw_reporte_datastudio_smart_momento1"],
    tags: ["Superfinanciera", "Mapa"],
    headlineKpi: "radicados",
  },
  {
    slug: "smart-momento-2",
    title: "SMART Supervisión · Momento 2",
    short: "Momento 2 · Transmisión",
    module: "smart",
    icon: Send,
    description: "Casos transmitidos a la Superfinanciera: motivos, productos, puntos de recepción y anexos.",
    views: ["vw_reporte_datastudio_smart_momento2"],
    tags: ["Superfinanciera", "Mapa"],
    headlineKpi: "total",
  },
  {
    slug: "smart-momento-3",
    title: "SMART Supervisión · Momento 3",
    short: "Momento 3 · Gestión y cierre",
    module: "smart",
    icon: BadgeCheck,
    description: "Gestión y cierre de quejas SMART: momento, categoría SLA, alertas, semáforo y flujo por tipología.",
    views: ["vw_reporte_datastudio_smart_momento3"],
    tags: ["SLA", "Alertas", "Mapa"],
    headlineKpi: "total",
  },
  {
    slug: "tutelas",
    title: "Tutelas",
    short: "Tutelas",
    module: "tutelas",
    icon: Gavel,
    description: "Acciones de tutela: cumplimiento de términos, etapas procesales, fallos, causales, dependencias y desacatos.",
    views: ["vw_reporte_datastudio_tutelas"],
    tags: ["Términos", "Mapa"],
    headlineKpi: "tutelas",
  },
  {
    slug: "medicina-laboral-entradas",
    title: "Medicina Laboral · Entradas",
    short: "Entradas",
    module: "medicina",
    icon: ArrowDownToLine,
    description: "Radicados de entrada de medicina laboral: gestionadores, revisores, tiempos por vencer y oficinas asignadas.",
    views: ["vw_reporte_datastudio_medicina_laboral_entradas"],
    tags: ["Tiempos", "Mapa"],
    headlineKpi: "radicados",
  },
  {
    slug: "medicina-laboral-salidas",
    title: "Medicina Laboral · Salidas",
    short: "Salidas",
    module: "medicina",
    icon: ArrowUpFromLine,
    description: "Comunicaciones de salida: notificaciones entregadas, abiertas y fallidas, guías físicas y tiempos de aprobación.",
    views: ["vw_reporte_datastudio_medicina_laboral_salidas"],
    tags: ["Notificaciones", "Mapa"],
    headlineKpi: "total",
  },
  {
    slug: "correspondencia-entradas",
    title: "Correspondencia · Entradas Generales",
    short: "Entradas generales",
    module: "correspondencia",
    icon: FileInput,
    description: "Toda la correspondencia de entrada: tipos de trámite, canales, oficinas, estados y remitentes por territorio.",
    views: ["vw_reporte_datastudio_entradas_generales"],
    tags: ["Heatmap", "Mapa"],
    headlineKpi: "radicados",
  },
  {
    slug: "correspondencia-salidas",
    title: "Correspondencia · Salidas Generales",
    short: "Salidas generales",
    module: "correspondencia",
    icon: FileOutput,
    description: "Correspondencia de salida: envíos digitales y SealMail, aprobadores, anexos, devoluciones y cobertura municipal.",
    views: ["vw_reporte_datastudio_salidas_generales"],
    tags: ["SealMail", "Mapa"],
    headlineKpi: "total",
  },
];

export const DASHBOARD_BY_SLUG = Object.fromEntries(DASHBOARDS.map((d) => [d.slug, d])) as Record<string, DashboardMeta>;

export function dashboardsByModule(): { module: ModuleMeta; items: DashboardMeta[] }[] {
  return MODULES.map((m) => ({ module: m, items: DASHBOARDS.filter((d) => d.module === m.id) }));
}
