import "server-only";

import { DAY_MS, isoToMs, todayISO } from "@/lib/dates";

/**
 * Generador de filas sintéticas a partir de un perfil anonimizado
 * (scripts/mock/build-profiles.mjs). Determinístico (semilla fija): mismas
 * filas en cada arranque, siempre relativas a "hoy".
 */

export interface Profile {
  id: string;
  columns: string[];
  dicts: Record<string, (string | number | null)[]>;
  tuples: number[][];
  weights: number[];
  independent: Record<string, [string, number][]>;
  geo: { columns: string[]; values: (string | number)[][] } | null;
  weekday: number[];
  hour: number[];
}

export type MockRow = Record<string, string | number | null>;

export interface GenContext {
  rng: () => number;
  /** Índice secuencial de la fila (orden cronológico). */
  index: number;
  /** Fecha base (ms "de pared"). */
  date: number;
  /** Edad del registro en días respecto a hoy. */
  ageDays: number;
  /** Fila generada justo antes (ya derivada), o null en la primera. Sirve para duplicados coherentes. */
  prev: MockRow | null;
  now: number;
  pick: <T>(items: readonly T[]) => T;
  weighted: (entries: Record<string, number>) => string;
  int: (min: number, max: number) => number;
}

export interface MockConfig {
  profile: Profile;
  seed: number;
  /** Volumen medio por día hábil (se escala por el histograma de día de semana). */
  perDay: number;
  /** Fecha inicial (YYYY-MM-DD). */
  start?: string;
  /**
   * Reemplaza el histograma de día de semana del perfil (lunes → domingo). Para perfiles
   * extraídos de un solo día, que concentrarían todo el volumen en ese día.
   */
  weekday?: number[];
  /** Reemplaza el histograma de hora (0 → 23) del perfil, por la misma razón. */
  hour?: number[];
  /** Reajusta los pesos de las tuplas para que el marginal de un campo siga estas proporciones. */
  reweight?: Record<string, Record<string, number>>;
  /** Reemplaza un campo por un muestreo independiente con estas proporciones. */
  overrides?: Record<string, Record<string, number>>;
  /** Reemplaza un campo por un pool de nombres ficticios con distribución Zipf. */
  namePools?: Record<string, { size: number; skew?: number; emptyShare?: number }>;
  /** Los registros recientes tienden a seguir abiertos (estado no cerrado). */
  openBias?: { field: string; closed: string[]; days: number; strength?: number };
  /** Probabilidad de geografía vacía. */
  geoEmpty?: number;
  /** Columnas derivadas específicas del dataset (ids, fechas secundarias, etc.). */
  derive?: (row: MockRow, ctx: GenContext) => void;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Sampler<T> {
  private cum: Float64Array;
  private total: number;
  constructor(private items: T[], weights: number[]) {
    this.cum = new Float64Array(weights.length);
    let acc = 0;
    weights.forEach((w, i) => {
      acc += Math.max(0, w);
      this.cum[i] = acc;
    });
    this.total = acc;
  }
  get size() {
    return this.items.length;
  }
  sample(r: number): T {
    const x = r * this.total;
    let lo = 0;
    let hi = this.cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] > x) hi = mid;
      else lo = mid + 1;
    }
    return this.items[lo];
  }
}

const FIRST = [
  "Andrea", "Carlos", "Diana", "Felipe", "Laura", "Julián", "Natalia", "Santiago", "Camila", "Mateo",
  "Valentina", "Sebastián", "Paula", "Andrés", "Mariana", "Daniel", "Juliana", "Nicolás", "Carolina", "David",
  "Alejandra", "Tomás", "Lorena", "Esteban", "Viviana", "Mauricio", "Catalina", "Óscar", "Ximena", "Ricardo",
];
const LAST = [
  "Rojas", "Gómez", "Martínez", "Herrera", "Castro", "Vargas", "Moreno", "Jiménez", "Ortiz", "Rincón",
  "Salazar", "Cárdenas", "Mejía", "Pardo", "Quintero", "Acosta", "Beltrán", "Cifuentes", "Duarte", "Escobar",
  "Forero", "Galvis", "Hurtado", "Lozano", "Montoya", "Navarro", "Ospina", "Peña", "Restrepo", "Sierra",
];

/** Pool determinístico de nombres ficticios. */
export function fakeNames(size: number, seed: number): string[] {
  const rng = mulberry32(seed);
  const out = new Set<string>();
  while (out.size < size) {
    const f = FIRST[Math.floor(rng() * FIRST.length)];
    const l1 = LAST[Math.floor(rng() * LAST.length)];
    const l2 = LAST[Math.floor(rng() * LAST.length)];
    out.add(`${f} ${l1} ${l2}`);
  }
  return [...out];
}

function zipfWeights(n: number, skew = 1) {
  return Array.from({ length: n }, (_, i) => 1 / Math.pow(i + 1, skew));
}

export function generate(config: MockConfig): MockRow[] {
  const { profile } = config;
  const rng = mulberry32(config.seed);
  const now = Date.now();
  /** "Ahora" en hora de pared de Bogotá (misma convención que las fechas). */
  const nowWall = now - 5 * 3_600_000;
  const today = isoToMs(todayISO(now));
  const start = isoToMs(config.start ?? "2025-01-01");

  // ─── Pesos de tuplas (con reajuste de marginales) ─────────────────────────
  const weights = profile.weights.slice();
  for (const [field, target] of Object.entries(config.reweight ?? {})) {
    const ci = profile.columns.indexOf(field);
    if (ci < 0) continue;
    const current = new Map<string, number>();
    profile.tuples.forEach((t, i) => {
      const v = String(profile.dicts[field][t[ci]] ?? "");
      current.set(v, (current.get(v) ?? 0) + weights[i]);
    });
    const totalTarget = Object.values(target).reduce((a, b) => a + b, 0);
    const totalCurrent = [...current.values()].reduce((a, b) => a + b, 0);
    profile.tuples.forEach((t, i) => {
      const v = String(profile.dicts[field][t[ci]] ?? "");
      const want = target[v];
      if (want !== undefined && current.get(v)) {
        weights[i] *= (want / totalTarget) / ((current.get(v) ?? 1) / totalCurrent);
      }
    });
  }
  const tupleIdx = profile.tuples.map((_, i) => i);
  const all = new Sampler(tupleIdx, weights);
  let open: Sampler<number> | null = null;
  if (config.openBias) {
    const ci = profile.columns.indexOf(config.openBias.field);
    const closed = new Set(config.openBias.closed);
    const idx = tupleIdx.filter((i) => !closed.has(String(profile.dicts[config.openBias!.field][profile.tuples[i][ci]] ?? "")));
    if (idx.length) open = new Sampler(idx, idx.map((i) => weights[i]));
  }

  // ─── Muestreadores independientes ─────────────────────────────────────────
  const indep = Object.entries(profile.independent).map(
    ([c, entries]) => [c, new Sampler(entries.map((e) => e[0]), entries.map((e) => e[1]))] as const,
  );
  const overrides = Object.entries(config.overrides ?? {}).map(
    ([c, entries]) => [c, new Sampler(Object.keys(entries), Object.values(entries))] as const,
  );
  const pools = Object.entries(config.namePools ?? {}).map(([c, p], k) => {
    const names = fakeNames(p.size, config.seed * 31 + k * 7 + 1);
    const w = zipfWeights(p.size, p.skew ?? 0.9);
    return [c, new Sampler(names, w), p.emptyShare ?? 0] as const;
  });
  const geoSampler = profile.geo
    ? new Sampler(profile.geo.values.map((v) => v.slice(0, -1)), profile.geo.values.map((v) => Number(v.at(-1))))
    : null;
  const geoNonEmpty = profile.geo
    ? (() => {
        const vals = profile.geo!.values.filter((v) => v.slice(0, -1).some((x) => String(x).trim() && !/no reporta/i.test(String(x))));
        return vals.length ? new Sampler(vals.map((v) => v.slice(0, -1)), vals.map((v) => Number(v.at(-1)))) : null;
      })()
    : null;
  const hourSampler = new Sampler(
    Array.from({ length: 24 }, (_, h) => h),
    (config.hour ?? profile.hour).map((w) => w + 0.3),
  );

  // ─── Volumen por día ──────────────────────────────────────────────────────
  const wk = (config.weekday ?? profile.weekday).map((w) => w + 1);
  const weekdayMean = wk.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const totalDays = Math.round((today - start) / DAY_MS);

  const ctxBase = {
    rng,
    now: nowWall,
    pick: <T,>(items: readonly T[]) => items[Math.floor(rng() * items.length)],
    weighted: (entries: Record<string, number>) => {
      const keys = Object.keys(entries);
      const total = keys.reduce((a, k) => a + entries[k], 0);
      let x = rng() * total;
      for (const k of keys) {
        x -= entries[k];
        if (x <= 0) return k;
      }
      return keys[keys.length - 1];
    },
    int: (min: number, max: number) => min + Math.floor(rng() * (max - min + 1)),
  };

  const rows: MockRow[] = [];
  for (let d = 0; d <= totalDays; d++) {
    const dayMs = start + d * DAY_MS;
    const weekday = (new Date(dayMs).getUTCDay() + 6) % 7; // 0 = lunes
    const t = d / Math.max(1, totalDays);
    const trend = 0.82 + 0.3 * t;
    const season = 1 + 0.12 * Math.sin((2 * Math.PI * d) / 91 + config.seed) + 0.06 * Math.sin((2 * Math.PI * d) / 29);
    const noise = 0.85 + rng() * 0.3;
    const expected = config.perDay * (wk[weekday] / weekdayMean) * trend * season * noise;
    const count = Math.max(0, Math.round(expected));
    const ageDays = totalDays - d;

    for (let k = 0; k < count; k++) {
      const hour = hourSampler.sample(rng());
      const date = dayMs + hour * 3_600_000 + Math.floor(rng() * 60) * 60_000;
      if (date > nowWall) continue; // nunca generar registros en el futuro

      let tuple: number;
      const ob = config.openBias;
      if (open && ob && ageDays < ob.days && rng() < (1 - ageDays / ob.days) * (ob.strength ?? 0.75)) {
        tuple = open.sample(rng());
      } else tuple = all.sample(rng());

      const row: MockRow = {};
      profile.columns.forEach((col, ci) => {
        const value = profile.dicts[col][profile.tuples[tuple][ci]];
        if (col.startsWith("__off_")) {
          const target = col.slice(6);
          const ms = typeof value === "number" ? date + value * 3_600_000 : null;
          row[target] = ms !== null && ms <= nowWall ? ms : null;
        } else row[col] = value;
      });
      for (const [c, s] of indep) row[c] = s.sample(rng());
      for (const [c, s] of overrides) row[c] = s.sample(rng());
      for (const [c, s, empty] of pools) row[c] = rng() < empty ? "" : s.sample(rng());
      if (profile.geo && geoSampler) {
        let g: (string | number)[] | null | undefined;
        if (config.geoEmpty === undefined) g = geoSampler.sample(rng());
        else g = rng() < config.geoEmpty ? null : geoNonEmpty?.sample(rng());
        profile.geo.columns.forEach((c, gi) => (row[c] = g ? String(g[gi]) : ""));
      }
      row.__date = date;
      config.derive?.(row, { ...ctxBase, index: rows.length, date, ageDays, prev: rows.at(-1) ?? null });
      rows.push(row);
    }
  }
  return rows;
}

/** Utilidades para ids sintéticos. */
export function radicado(prefix: string, date: number, seq: number) {
  return `${prefix}${new Date(date).getUTCFullYear()}${String(1_000_000 + seq).padStart(10, "0")}`;
}

export function addBusinessDays(ms: number, days: number) {
  let d = ms;
  let left = days;
  while (left > 0) {
    d += DAY_MS;
    const wd = new Date(d).getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}
