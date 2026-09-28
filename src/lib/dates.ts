/**
 * Fechas "de pared" en America/Bogotá (UTC-5 fijo, sin horario de verano).
 * Internamente se representan como milisegundos UTC cuyos componentes
 * (año, mes, día, hora) SON la hora local de Bogotá.
 */
export const DAY_MS = 86_400_000;
const BOGOTA_OFFSET_MS = 5 * 3_600_000;

export function todayISO(now = Date.now()): string {
  return new Date(now - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

export function isoToMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function msToISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return msToISO(isoToMs(iso) + days * DAY_MS);
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((isoToMs(toISO) - isoToMs(fromISO)) / DAY_MS);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return msToISO(Date.UTC(y, m, 0));
}

export function startOfYear(iso: string): string {
  return `${iso.slice(0, 4)}-01-01`;
}

/** Rango por defecto: mes actual hasta hoy (igual que los tableros originales). */
export function defaultRange(now = Date.now()) {
  const to = todayISO(now);
  return { from: startOfMonth(to), to };
}

/** Periodo anterior de igual duración, inmediatamente antes. */
export function previousRange(from: string, to: string) {
  const len = daysBetween(from, to) + 1;
  const prevTo = addDays(from, -1);
  return { prevFrom: addDays(prevTo, -(len - 1)), prevTo };
}

/** Lunes (ISO) de la semana de una fecha. */
export function weekStart(ms: number): number {
  const day = new Date(ms).getUTCDay(); // 0 domingo
  const diff = (day + 6) % 7;
  return Math.floor(ms / DAY_MS) * DAY_MS - diff * DAY_MS;
}

export const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
export const MONTHS_ES_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
export const WEEKDAYS_ES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** "27 sept 2026" */
export function formatDayShort(iso: string, withYear = true): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_ES[m - 1]}${withYear ? ` ${y}` : ""}`;
}

/** "sept 2026" */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_ES[m - 1]} ${y}`;
}

export function formatRange(from: string, to: string): string {
  if (from === to) return formatDayShort(from);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${formatDayShort(from, !sameYear)} – ${formatDayShort(to)}`;
}

/** Fecha-hora local (ms "de pared") → "27/09/2026 14:05" */
export function formatDateTime(ms: number, withTime = true): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  return withTime ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : date;
}
