import { DASHBOARD_BY_SLUG, DASHBOARDS, MODULES, type DashboardFeature, type DashboardMeta, type ModuleId, type ModuleMeta } from "@/config/dashboards";
import type { CatalogFigure, CatalogItem } from "@/dashboards/dto";
import { endOfMonth, isoToMs, MONTHS_ES, MONTHS_ES_LONG, todayISO } from "@/lib/dates";
import { describeDelta, type DeltaInfo } from "@/lib/format";

/* ──────────────────────────────────────────────────────────────────────────
   Utilidades del Home (sin React): saludo, fechas cortas, búsqueda y pulso.
   ────────────────────────────────────────────────────────────────────────── */

export const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m])) as Record<ModuleId, ModuleMeta>;

const BOGOTA_OFFSET_MS = 5 * 3_600_000;
const WEEKDAYS_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Hora de pared en Bogotá (UTC−5 fijo). */
export function nowBogotaHour(now = Date.now()): number {
  return new Date(now - BOGOTA_OFFSET_MS).getUTCHours();
}

/** "Buenos días" (5–11 h) · "Buenas tardes" (12–18 h) · "Buenas noches". */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** "Lunes 28 de septiembre de 2026" (hoy en Bogotá). */
export function longToday(now = Date.now()): string {
  const iso = todayISO(now);
  const [y, m, d] = iso.split("-").map(Number);
  const wd = WEEKDAYS_LONG[new Date(isoToMs(iso)).getUTCDay()];
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${d} de ${MONTHS_ES_LONG[m - 1]} de ${y}`;
}

/** Rango compacto: "4 – 31 ago" · "4 ago – 3 sept" · "20 dic 2025 – 3 ene 2026". */
export function compactRange(from: string, to: string): string {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  if (from === to) return `${d1} ${MONTHS_ES[m1 - 1]}`;
  if (y1 !== y2) return `${d1} ${MONTHS_ES[m1 - 1]} ${y1} – ${d2} ${MONTHS_ES[m2 - 1]} ${y2}`;
  if (m1 !== m2) return `${d1} ${MONTHS_ES[m1 - 1]} – ${d2} ${MONTHS_ES[m2 - 1]}`;
  return `${d1} – ${d2} ${MONTHS_ES[m2 - 1]}`;
}

/** Días del mes del inicio del rango (casillas de las micro-columnas). */
export function daysInMonthOf(from: string): number {
  return Number(endOfMonth(from).slice(8, 10));
}

/** "14 sept" para el día i (0 = from). */
export function dayLabel(from: string, i: number): string {
  const d = new Date(isoToMs(from) + i * 86_400_000);
  return `${d.getUTCDate()} ${MONTHS_ES[d.getUTCMonth()]}`;
}

/** true si el día i (0 = from) cae en sábado o domingo. */
export function isWeekend(from: string, i: number): boolean {
  const wd = new Date(isoToMs(from) + i * 86_400_000).getUTCDay();
  return wd === 0 || wd === 6;
}

/* ── Búsqueda en sitio ─────────────────────────────────────────────────── */

/** Nombre de cada capacidad del tablero (tooltip de la tarjeta y búsqueda). */
export const FEATURE_LABEL: Record<DashboardFeature, string> = {
  mapa: "Mapa por departamento y municipio",
  sla: "Cumplimiento de términos (SLA)",
  matriz: "Matriz de calor",
  flujo: "Flujo entre estados",
  responsables: "Carga por responsable",
  valor: "Valores en pesos",
  notificaciones: "Notificaciones y entregas",
};

/** Minúsculas sin tildes ni signos (para comparar). */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HAYSTACK = new Map<string, string>(
  DASHBOARDS.map((d) => {
    const mod = MODULE_BY_ID[d.module];
    const features = d.features.map((f) => FEATURE_LABEL[f]).join(" ");
    return [d.slug, fold([d.title, d.short, d.heading, d.summary, d.description, d.tags.join(" "), features, mod.label, mod.short].join(" "))];
  }),
);

/** Todas las palabras de la consulta deben aparecer (título, resumen, módulo o etiquetas). */
export function matchesQuery(meta: DashboardMeta, query: string): boolean {
  const tokens = fold(query).split(" ").filter(Boolean);
  if (!tokens.length) return true;
  const hay = HAYSTACK.get(meta.slug) ?? "";
  return tokens.every((t) => hay.includes(t));
}

/* ── Etiquetas de presentación, salud y pulso ──────────────────────────── */

/**
 * Etiqueta de la cifra titular en la tarjeta del Home (solo presentación: la métrica es el `headlineKpi`).
 * Evita repetir el título ("Tutelas" bajo "Tutelas") y hace que los hermanos se lean igual.
 */
const HERO_SHORT: Record<string, string> = {
  "facturas-recibidas": "Facturas en el mes",
  "facturas-emitidas": "Facturas en el mes",
  pqrd: "Radicados en el mes",
  "entes-control": "Radicados en el mes",
  "entes-control-eficiencia": "Asignación promedio",
  "smart-momento-1": "Quejas en el mes",
  "smart-momento-2": "Transmitidos en el mes",
  "smart-momento-3": "Quejas en el mes",
  tutelas: "Tutelas en el mes",
  "medicina-laboral-entradas": "Radicados en el mes",
  "medicina-laboral-salidas": "Salidas en el mes",
  "correspondencia-entradas": "Radicados en el mes",
  "correspondencia-salidas": "Salidas en el mes",
};

export function heroShort(slug: string, fig: CatalogFigure | null): string {
  return HERO_SHORT[slug] ?? fig?.label ?? "Cifra del mes";
}

/**
 * Nombre corto del KPI de salud para la fila de salud ("SLA 67,0 %"): `short` del spec (o su etiqueta),
 * siempre sin el "%" inicial (la cifra ya lo lleva). No cambia la métrica.
 */
export function figureShort(fig: CatalogFigure): string {
  return (fig.short ?? fig.label).replace(/^%\s*/, "");
}

/** Aviso de calidad de la vista que reemplaza (o acompaña) al KPI de salud (AGENTS §6). */
export interface HealthNote {
  /**
   * "quality": la cifra no informa (su chip de variación se reemplaza por un chip de calidad en warning).
   * "info": la cifra es constante por construcción (el chip de variación lleva el ícono ⓘ y la explicación).
   */
  kind: "quality" | "info";
  label: string;
  hint: string;
}

const HEALTH_NOTES: Record<string, HealthNote & { when: (fig: CatalogFigure) => boolean }> = {
  "smart-momento-1:cruce": {
    kind: "quality",
    label: "Sin cruce",
    hint: "El cruce de SMART Momento 1 con el seguimiento de PQRD falla en la vista de origen: casi ninguna queja trae su radicado PQRD, por eso el % de cruce queda en 0 %. Es un hallazgo de calidad de la vista, no un indicador de gestión.",
    when: (f) => !f.value && !f.previous,
  },
  "smart-momento-2:transmitido": {
    kind: "info",
    label: "100 % por construcción",
    hint: "La vista de Momento 2 solo contiene casos transmitidos a la Superfinanciera, así que este porcentaje es 100 % por construcción.",
    when: (f) => f.value === 1 && f.previous === 1,
  },
};

/**
 * Nota de calidad para el KPI de salud, solo para hallazgos documentados de la vista (AGENTS §6) y mientras
 * la cifra siga mostrando el síntoma (p. ej. 0 % de cruce en ambos periodos). Un 0 % legítimo no lleva nota.
 */
export function healthNote(slug: string, fig: CatalogFigure): HealthNote | null {
  const known = HEALTH_NOTES[`${slug}:${fig.kpi}`];
  return known && known.when(fig) ? { kind: known.kind, label: known.label, hint: known.hint } : null;
}

export interface PulseSignal {
  meta: DashboardMeta;
  module: ModuleMeta;
  fig: CatalogFigure;
  delta: DeltaInfo;
}

export interface Pulse {
  /** Señales con polaridad (las neutrales y las que tienen nota de calidad no entran). */
  total: number;
  improved: number;
  worsened: number;
  stable: number;
  /** Las 3 que más empeoraron (mayor |magnitud|). */
  top: PulseSignal[];
}

/**
 * Resume la salud del mes con la MISMA regla que pinta los chips de las tarjetas (homeRedesign §5):
 * tono = dirección × polaridad (describeDelta), sin umbral propio. Mejoró = tono good, empeoró = tono bad y
 * estable = tono neutral (sin cambio al redondear a 1 decimal, o base pequeña). Así el balance del Pulso
 * cuenta exactamente los chips verdes y rojos que se ven en las tarjetas.
 */
export function computePulse(items: CatalogItem[]): Pulse {
  const signals: PulseSignal[] = [];
  for (const item of items) {
    const meta = DASHBOARD_BY_SLUG[item.slug];
    const fig = item.health;
    if (!meta || !fig || fig.polarity === "neutral" || healthNote(item.slug, fig)) continue;
    signals.push({ meta, module: MODULE_BY_ID[meta.module], fig, delta: describeDelta(fig.value, fig.previous, fig.format, fig.polarity) });
  }
  const worse = signals.filter((s) => s.delta.tone === "bad").sort((a, b) => Math.abs(b.delta.magnitude) - Math.abs(a.delta.magnitude));
  const improved = signals.filter((s) => s.delta.tone === "good").length;
  return {
    total: signals.length,
    improved,
    worsened: worse.length,
    stable: signals.length - improved - worse.length,
    top: worse.slice(0, 3),
  };
}

/* ── Accesos rápidos ───────────────────────────────────────────────────── */

/** Líneas que ocupan chips de los anchos dados en un carril de ancho `avail` con separación `gap`. */
function linesFor(widths: number[], avail: number, gap: number): number {
  let lines = 1;
  let x = 0;
  for (const w of widths) {
    const need = x === 0 ? w : x + gap + w;
    if (need <= avail || x === 0) x = need;
    else {
      lines += 1;
      x = w;
    }
  }
  return lines;
}

/**
 * Cuántos chips (en orden) caben en `maxLines` líneas. Si no caben todos, reserva en la última línea el chip
 * "+N" (ancho `moreWidth`) que muestra el resto: ningún chip se corta a media palabra.
 */
export function fitChips(widths: number[], avail: number, gap: number, maxLines: number, moreWidth: number): number {
  if (!widths.length || avail <= 0 || linesFor(widths, avail, gap) <= maxLines) return widths.length;
  for (let k = widths.length - 1; k > 0; k--) {
    if (linesFor([...widths.slice(0, k), moreWidth], avail, gap) <= maxLines) return k;
  }
  return 0;
}
