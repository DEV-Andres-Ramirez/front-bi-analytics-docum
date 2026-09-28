import type { SemanticFamily, StatusTone, VizOptions } from "@/dashboards/types";

/**
 * Registro semántico: traduce etiquetas de datos a estados con tono, orden, grupo e
 * ícono. La familia SIEMPRE es explícita en el spec (widget.semantic o column.semantic):
 * "evento" es RADIAN en facturas y notificación en medicina laboral, por eso no se infiere
 * del nombre del campo.
 *
 * Reglas de color (docs/ui-design-system.md):
 * - Los tonos de estado solo se usan en componentes de estado o series que SON estados.
 * - Siempre con ícono + etiqueta (warning ↔ serious están a ΔE 13,6).
 * - Lo neutral ("No reporta", "Otros", "Sin …") va en gris, al final y fuera de escala.
 */

export type { StatusTone };

export interface StatusInfo {
  /** Tono de estado; null cuando la familia es categórica (binario, canal-envio). */
  tone: StatusTone | null;
  /** Color de relleno (variable CSS). */
  color: string;
  /** Orden de proceso o severidad dentro de la familia. */
  order: number;
  /** Grupo (Abiertos/Cerrados, Finalizado/En curso…). */
  group?: string;
  /** Etiqueta para mostrar (sin prefijos ordinales ni código de proceso, en tipo oración). */
  display: string;
  /** Código de proceso de 3 dígitos separado de la etiqueta (RADIAN "030"), para mostrarlo en mono. */
  code?: string;
}

export const TONE_VARS: Record<StatusTone, { solid: string; ink: string; soft: string }> = {
  good: { solid: "var(--good)", ink: "var(--good-ink)", soft: "var(--good-soft)" },
  info: { solid: "var(--info)", ink: "var(--info-ink)", soft: "var(--info-soft)" },
  warning: { solid: "var(--warning)", ink: "var(--warning-ink)", soft: "var(--warning-soft)" },
  serious: { solid: "var(--serious)", ink: "var(--serious-ink)", soft: "var(--serious-soft)" },
  critical: { solid: "var(--critical)", ink: "var(--critical-ink)", soft: "var(--critical-soft)" },
  neutral: { solid: "var(--neutral-mark)", ink: "var(--neutral-ink)", soft: "var(--neutral-soft)" },
};

/** Severidad para ordenar tonos (bueno → crítico → neutral al final). */
export const TONE_ORDER: Record<StatusTone, number> = { good: 0, info: 1, warning: 2, serious: 3, critical: 4, neutral: 9 };

// ─── Normalización ───────────────────────────────────────────────────────────

/** minúsculas, sin tildes, espacios colapsados y SOLO prefijos ordinales de 1–2 dígitos ("1. ", "03. "). */
export function normalizeLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^\s*\d{1,2}\.\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ACRONYMS = new Set(["pqrd", "arl", "jrc", "ml", "ia", "ai", "nit", "dian", "radian", "sla", "pcl", "at", "el", "eps", "ips", "sfc", "cufe", "web", "sms"]);

/** Quita el prefijo ordinal y pasa a tipo oración conservando siglas ("2. Abierto En Término" → "Abierto en término"). */
export function statusDisplay(label: string): string {
  const raw = label.replace(/^\s*\d{1,2}\.\s*/, "").trim();
  if (!raw) return "No reporta";
  const words = raw.split(/\s+/);
  return words
    .map((w, i) => {
      const bare = w.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
      if (ACRONYMS.has(bare) && bare !== "el" && bare !== "at") return w.toUpperCase();
      const lower = w.toLocaleLowerCase("es-CO");
      return i === 0 ? lower.charAt(0).toLocaleUpperCase("es-CO") + lower.slice(1) : lower;
    })
    .join(" ");
}

/**
 * Separa el código de proceso de 3 dígitos de la etiqueta y la pasa a tipo oración:
 * "030. Acuse de recibo" → { code: "030", text: "Acuse de recibo" }. Sin código → solo statusDisplay.
 */
export function splitStatusCode(label: string): { code?: string; text: string } {
  const m = label.trim().match(/^(\d{3})\.\s*(.+)$/);
  return m ? { code: m[1], text: statusDisplay(m[2]) } : { text: statusDisplay(label) };
}

// ─── Neutrales ───────────────────────────────────────────────────────────────

const NEUTRAL_EXACT = new Set([
  "",
  "no reporta",
  "otros",
  "otras",
  "sin categoria",
  "sin clasificar",
  "sin cruce",
  "sin cruce con pqrd",
  "sin canal",
  "sin responsable",
  "sin responsable asignado",
  "no aplica",
  "n/a",
  "na",
  "sin definir",
  "sin dato",
  "sin informacion",
  // Cubetas residuales del catálogo SFC (SMART: canal y motivo). Pendiente de confirmar con negocio.
  "resto / otras",
  "resto/otras",
  "otros motivos",
]);

/** "No reporta", "Otros", "Sin clasificar", "Otras N categorías"… (nunca categorías reales como "Otros productos de seguros"). */
export function isNeutral(label: string): boolean {
  const n = normalizeLabel(label);
  return NEUTRAL_EXACT.has(n) || n.startsWith("no reporta") || /^otr[oa]s \d+/.test(n);
}

// ─── Familias ────────────────────────────────────────────────────────────────

interface Rule {
  /** Coincidencia sobre la etiqueta normalizada. */
  test: (n: string) => boolean;
  tone: StatusTone | null;
  color?: string;
  order: number;
  group?: string;
  display?: string;
}

const eq = (...values: string[]) => (n: string) => values.includes(n);
const starts = (...values: string[]) => (n: string) => values.some((v) => n.startsWith(v));
const has = (...values: string[]) => (n: string) => values.some((v) => n.includes(v));
const NEUTRAL_RULE: Rule = { test: (n) => isNeutral(n), tone: "neutral", order: 99, group: "Sin clasificar" };

const FAMILIES: Record<SemanticFamily, Rule[]> = {
  semaforo: [
    { test: eq("cerrado a tiempo"), tone: "good", order: 1, group: "Cerrados" },
    { test: eq("abierto en termino"), tone: "info", order: 2, group: "Abiertos" },
    { test: eq("abierto proximo a vencer"), tone: "warning", order: 3, group: "Abiertos" },
    { test: eq("cerrado vencido"), tone: "serious", order: 4, group: "Cerrados" },
    { test: eq("abierto vencido"), tone: "critical", order: 5, group: "Abiertos" },
    NEUTRAL_RULE,
  ],
  sla: [
    { test: eq("a tiempo", "en termino"), tone: "good", order: 1 },
    { test: (n) => n === "preventiva" || /^\d+ horas?$/.test(n), tone: "warning", order: 2 },
    { test: eq("por vencer"), tone: "serious", order: 3 },
    { test: eq("vencido"), tone: "critical", order: 4 },
    NEUTRAL_RULE,
  ],
  cumplimiento: [
    { test: eq("en termino"), tone: "good", order: 1 },
    { test: eq("en tramite"), tone: "info", order: 2 },
    { test: eq("fuera de termino"), tone: "serious", order: 3 },
    { test: eq("vencido"), tone: "critical", order: 4 },
    { test: (n) => /^\d+ dia\(s\) habiles$/.test(n), tone: "info", order: 2 },
    NEUTRAL_RULE,
  ],
  flujo: [
    // En curso (orden de proceso)
    { test: eq("por asignar"), tone: "info", order: 1, group: "En curso" },
    { test: eq("en asignacion"), tone: "info", order: 2, group: "En curso" },
    { test: eq("para gestion"), tone: "info", order: 3, group: "En curso" },
    { test: eq("en edicion"), tone: "info", order: 4, group: "En curso" },
    { test: eq("por revisar"), tone: "info", order: 5, group: "En curso" },
    { test: eq("por aprobar"), tone: "info", order: 6, group: "En curso" },
    { test: eq("por recibir correspondencia", "por recibir en correspondencia"), tone: "info", order: 7, group: "En curso" },
    { test: starts("solicitud de reclasificacion", "solicitud cierre"), tone: "info", order: 8, group: "En curso" },
    // Finalizado
    { test: eq("aprobado"), tone: "good", order: 10, group: "Finalizado" },
    { test: eq("reclasificacion aprobada"), tone: "good", order: 11, group: "Finalizado" },
    { test: eq("gestion terminada"), tone: "good", order: 12, group: "Finalizado" },
    { test: eq("enviado", "entrega exitosa", "publicacion"), tone: "good", order: 13, group: "Finalizado" },
    { test: eq("cerrado"), tone: "good", order: 14, group: "Finalizado" },
    // Devuelto o rechazado
    { test: has("rechazad", "devuelt"), tone: "serious", order: 20, group: "Devuelto" },
    // Anulado
    { test: has("anulad", "eliminad", "excluid", "cerrado sin gestion", "duplicad"), tone: "neutral", order: 30, group: "Anulado" },
    // Heurísticas de respaldo para estados nuevos
    { test: has("aprobad", "terminad", "exitos"), tone: "good", order: 15, group: "Finalizado" },
    { test: starts("por ", "en ", "para ", "solicitud"), tone: "info", order: 9, group: "En curso" },
    NEUTRAL_RULE,
  ],
  momento: [
    { test: eq("gestion"), tone: "info", order: 1 },
    { test: eq("cierre"), tone: "good", order: 2 },
    NEUTRAL_RULE,
  ],
  "estado-queja": [
    { test: eq("recibida"), tone: "neutral", order: 1 },
    { test: eq("abierta"), tone: "info", order: 2 },
    { test: eq("cerrada"), tone: "good", order: 3 },
    NEUTRAL_RULE,
  ],
  // Los nombres visibles repiten los de la banda de KPIs (Entregadas · Abiertas · Fallidas)
  notificacion: [
    { test: starts("acuse de recibo"), tone: "good", order: 1, display: "Entregada (acuse de recibo)" },
    { test: starts("entregado"), tone: "good", order: 1 },
    { test: starts("el destinatario abrio"), tone: "info", order: 2, display: "Abierta por el destinatario" },
    { test: starts("abierto"), tone: "info", order: 2 },
    { test: starts("enviado"), tone: "info", order: 3 },
    { test: starts("no fue posible"), tone: "critical", order: 4, display: "Entrega fallida" },
    { test: (n) => isNeutral(n), tone: "neutral", order: 99, display: "Sin evento" },
  ],
  guia: [
    { test: eq("entrega exitosa"), tone: "good", order: 1 },
    { test: eq("enviado courier"), tone: "info", order: 2 },
    { test: starts("por enviar", "por recibir"), tone: "warning", order: 3 },
    { test: eq("devuelto"), tone: "critical", order: 4 },
    { test: eq("envio anulado"), tone: "neutral", order: 5 },
    { test: (n) => isNeutral(n), tone: "neutral", order: 99, display: "Sin guía física" },
  ],
  factura: [
    { test: eq("emitida"), tone: "good", order: 1 },
    { test: eq("inconsistente"), tone: "critical", order: 2 },
    NEUTRAL_RULE,
  ],
  radian: [
    { test: eq("sin evento radian"), tone: "warning", order: 1, display: "Pendiente de acuse" },
    { test: starts("030"), tone: "info", order: 2 },
    { test: starts("031"), tone: "critical", order: 5 },
    { test: starts("032"), tone: "good", order: 3 },
    { test: starts("033", "034"), tone: "good", order: 4 },
    NEUTRAL_RULE,
  ],
  transmision: [
    { test: (n) => n === "transmitido" || n === "si" || n.startsWith("transmitid"), tone: "good", order: 1 },
    NEUTRAL_RULE,
    { test: () => true, tone: "warning", order: 2 },
  ],
  alerta: [
    { test: eq("si", "1", "alerta"), tone: "critical", order: 1, display: "Con alerta" },
    { test: (n) => n === "no" || n === "0" || isNeutral(n), tone: "neutral", order: 2, display: "Sin alerta" },
  ],
  binario: [
    { test: eq("si"), tone: null, color: "var(--chart-1)", order: 1, display: "Sí" },
    { test: eq("no"), tone: "neutral", order: 2, display: "No" },
    NEUTRAL_RULE,
  ],
  "canal-envio": [
    { test: starts("digital", "correo", "email", "mail"), tone: null, color: "var(--chart-1)", order: 1 },
    { test: (n) => n.includes("sealmail") || n.includes("seal mail") || n.startsWith("fisic") || n.startsWith("certificado"), tone: null, color: "var(--chart-2)", order: 2 },
    { test: (n) => isNeutral(n), tone: "neutral", order: 99, display: "Sin canal" },
  ],
  fallo: [
    { test: eq("a favor", "confirma a favor", "revoca a favor", "revoca sancion"), tone: "good", order: 1, group: "Favorable" },
    { test: eq("en contra", "confirma en contra", "revoca en contra", "sancion"), tone: "critical", order: 2, group: "Desfavorable" },
    {
      test: (n) => ["informativo", "informativos", "cierre", "decreta nulidad", "oficios de tramite"].includes(n) || n.includes("requerimiento"),
      tone: "neutral",
      order: 3,
      group: "Trámite o informativo",
    },
    { test: (n) => isNeutral(n), tone: "neutral", order: 99, group: "Sin dato", display: "Sin dato" },
  ],
};

const warned = new Set<string>();

/**
 * Resuelve el estado de una etiqueta dentro de su familia.
 * Devuelve null si la familia no la reconoce (en desarrollo avisa una vez por etiqueta).
 */
export function resolveStatus(label: string, family: SemanticFamily, overrides?: VizOptions["overrides"]): StatusInfo | null {
  const n = normalizeLabel(label);
  const rule = FAMILIES[family]?.find((r) => r.test(n));
  const ov = overrides?.[label];
  if (!rule) {
    if (process.env.NODE_ENV !== "production" && !warned.has(`${family}:${label}`)) {
      warned.add(`${family}:${label}`);
      console.warn(`[semantic] etiqueta sin mapear en la familia "${family}": "${label}"`);
    }
    if (!ov) return null;
  }
  const tone = ov?.tone ?? (rule ? rule.tone : "neutral");
  // Código de proceso (RADIAN "030. Acuse de recibo") aparte: la etiqueta se lee igual en la tira y en la tabla
  const split = splitStatusCode(label);
  return {
    tone,
    color: ov?.tone ? TONE_VARS[ov.tone].solid : rule?.color ?? TONE_VARS[tone ?? "neutral"].solid,
    order: rule?.order ?? 50,
    group: ov?.group ?? rule?.group,
    display: ov?.label ?? rule?.display ?? split.text,
    code: split.code,
  };
}

/** Ordena etiquetas por el orden de la familia (neutrales al final). */
export function sortByFamily<T>(items: T[], getLabel: (t: T) => string, family: SemanticFamily, overrides?: VizOptions["overrides"]): T[] {
  return [...items].sort((a, b) => {
    const sa = resolveStatus(getLabel(a), family, overrides);
    const sb = resolveStatus(getLabel(b), family, overrides);
    return (sa?.order ?? 50) - (sb?.order ?? 50);
  });
}

/** @deprecated compatibilidad: color de una etiqueta dentro de una familia. */
export function semanticVar(family: SemanticFamily, label: string): string | null {
  return resolveStatus(label, family)?.color ?? null;
}

/** @deprecated usar isNeutral(). */
export const NEUTRAL_LABELS = new Set(["Otros", "No reporta", "Sin categoría", "Sin cruce con PQRD", "6. Sin Clasificar", "Sin canal"]);
