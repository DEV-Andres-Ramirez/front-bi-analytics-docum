import "server-only";

/**
 * Limpieza de valores de las vistas. Se aplica igual a datos mock y reales
 * (en la fase de BD se traducirá a expresiones SQL equivalentes).
 */

const NULLISH = /^(|null|none|n\/a|na|no reporta|no reporta sin fecha vencimiento|sin definir)$/i;
export const NO_REPORTA = "No reporta";

/** Espacios duros, dobles espacios y acentos invertidos ("reclasificaciòn"). */
export function cleanText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/ /g, " ")
    .replace(/ò/g, "ó")
    .replace(/\s+/g, " ")
    .trim();
}

/** Vacíos y centinelas → "No reporta". */
export function orNoReporta(value: unknown): string {
  const v = cleanText(value);
  return NULLISH.test(v) ? NO_REPORTA : v;
}

/** "SEGURO DE RIESGOS LABORALES" / "favorable para…" → "Seguro de riesgos laborales" / "Favorable para…" */
export function sentence(value: unknown): string {
  const v = orNoReporta(value);
  if (v === NO_REPORTA) return v;
  const lower = v.toLocaleLowerCase("es-CO");
  return lower.charAt(0).toLocaleUpperCase("es-CO") + lower.slice(1);
}

/** Canales duplicados por escritura: WEB/Web · Mail - AI/Mail-IA · Email/email. */
export function canal(value: unknown, mergeEmail = false): string {
  const v = orNoReporta(value);
  const k = v.toLowerCase().replace(/\s+/g, "");
  if (k === "web") return "Web";
  if (k === "mail-ai" || k === "mail-ia" || k === "mailia" || k === "mailai") return "Mail IA";
  if (k === "email" || k === "e-mail") return mergeEmail ? "Mail" : "Email";
  if (k === "mail") return "Mail";
  if (k === "contactcenter") return "Contact Center";
  return v;
}

/**
 * Alias de datos: variantes de escritura de un mismo valor en la fuente (igual que WEB/Web).
 * Clave en minúsculas (es-CO) sobre el texto limpio → valor canónico. Se documentan en
 * AGENTS.md §6 y, con su SQL equivalente, en src/server/data/postgres/README.md.
 */
export const ALIASES = {
  /** Tutelas · Estado_del_fallo: "Informativos" → "Informativo". */
  estadoFallo: { informativos: "Informativo" },
  /** Medicina Laboral entradas · estado_salida: "Por recibir correspondencia" → "Por recibir en correspondencia". */
  estadoSalidaML: { "por recibir correspondencia": "Por recibir en correspondencia" },
} as const satisfies Record<string, Record<string, string>>;

/** orNoReporta + alias (comparación sin distinguir mayúsculas). */
export function withAlias(value: unknown, aliases: Readonly<Record<string, string>>): string {
  const v = orNoReporta(value);
  return aliases[v.toLocaleLowerCase("es-CO")] ?? v;
}

/** Tutelas: estado del fallo con "Informativos" unificado en "Informativo". */
export function estadoFallo(value: unknown): string {
  return withAlias(value, ALIASES.estadoFallo);
}

/** ML entradas: estado de la salida con "Por recibir correspondencia" unificado en "Por recibir en correspondencia". */
export function estadoSalidaML(value: unknown): string {
  return withAlias(value, ALIASES.estadoSalidaML);
}

/**
 * Plazo en días con plural correcto: "2 dia(s)" / "0 dias" / "1 dia(s)" → "2 días" / "0 días" / "1 día".
 * Sin número → "No reporta". (Tutelas · Tiempo_para_responder.)
 */
export function diasPlazo(value: unknown): string {
  const n = cleanText(value).match(/\d+/)?.[0];
  if (n === undefined) return NO_REPORTA;
  const dias = Number(n);
  return `${dias} ${dias === 1 ? "día" : "días"}`;
}

/** Categoría SLA de Entes: corrige el bug de la vista ("En término" y "5 Horas" nunca se mapean). */
export function entesAuxCategoria(value: unknown): string {
  const v = orNoReporta(value);
  if (/^en t[eé]rmino$/i.test(v)) return "A tiempo";
  if (/^5 horas$/i.test(v)) return "Por vencer";
  return v;
}

/** Hora → franja horaria (misma lógica de las vistas PQRD/Entes). */
export function franjaHoraria(hour: number): string {
  if (hour <= 5) return "1. Madrugada (00-05)";
  if (hour <= 8) return "2. Mañana temprano (06-08)";
  if (hour <= 11) return "3. Mañana (09-11)";
  if (hour <= 13) return "4. Mediodía (12-13)";
  if (hour <= 17) return "5. Tarde (14-17)";
  return "6. Noche (18-23)";
}

/** Sábado/domingo → fin de semana; 7-17 h → laboral; si no, fuera de horario. */
export function tipoHorario(ms: number): string {
  const d = new Date(ms);
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return "Fin de semana";
  const h = d.getUTCHours();
  return h >= 7 && h <= 17 ? "Horario laboral" : "Fuera de horario";
}

const DIAS = ["7. Domingo", "1. Lunes", "2. Martes", "3. Miércoles", "4. Jueves", "5. Viernes", "6. Sábado"];
export function diaSemana(ms: number): string {
  return DIAS[new Date(ms).getUTCDay()];
}
