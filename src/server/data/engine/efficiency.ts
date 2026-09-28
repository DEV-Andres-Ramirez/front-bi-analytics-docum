import "server-only";

import type { EfficiencyPhase, EfficiencyResult, EfficiencyTone } from "@/dashboards/dto";
import { DAY_MS, MONTHS_ES, isoToMs, todayISO, weekStart } from "@/lib/dates";
import { column, numberAt, type Table } from "../table";
import { keyReader } from "./core";

/**
 * Réplica en memoria de `vw_reporte_datastudio_pqrd_eficiencia`:
 * promedio semanal por gerencia de cada fase, cuartiles sobre 52 semanas y
 * mensaje de tendencia comparando la semana actual con hace 2 semanas.
 * Con BD real se lee la vista directamente.
 */
const PHASES = {
  asignacion: "num_dias_asignacion_gestionador",
  gestion: "num_dias_gestion_total",
  revision: "num_dias_revision",
  aprobacion: "num_dias_aprobacion",
} as const;
type Phase = keyof typeof PHASES;

/** Número de semana ISO-8601 (lunes a domingo). */
function isoWeek(ms: number): number {
  const d = new Date(ms);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7);
}

function quantiles(values: number[]): [number, number, number] | null {
  if (values.length < 4) return null;
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return [q(0.25), q(0.5), q(0.75)];
}

function quartile(v: number | null, cuts: [number, number, number] | null): number | null {
  if (v === null || !cuts) return null;
  if (v <= cuts[0]) return 1;
  if (v <= cuts[1]) return 2;
  if (v <= cuts[2]) return 3;
  return 4;
}

function message(avg: number | null, q: (number | null)[]): { message: string; tone: EfficiencyTone } {
  const [t2, t1, now] = q;
  if (avg === null || now === null) return { message: "Necesario validación manual", tone: "unknown" };
  if (t2 === 4 && t1 === 4 && now === 4) return { message: "Alerta · 3 semanas en Q4, intervenir", tone: "alert" };
  if (now === 4) return { message: "Crítico esta semana (Q4)", tone: "critical" };
  if (now === 1 && t2 === 1) return { message: "Referente estable (Q1)", tone: "good" };
  if (t2 !== null && now < t2) return { message: "Mejorando vs hace 2 semanas", tone: "improving" };
  if (t2 !== null && now > t2) return { message: "Empeorando vs hace 2 semanas", tone: "worsening" };
  return { message: `Estable (Q${now})`, tone: "stable" };
}

export function efficiencyResult(table: Table, rows: Uint32Array, dateField: string): EfficiencyResult {
  const today = isoToMs(todayISO());
  let anchor = weekStart(today);
  if (anchor === today) anchor -= 7 * DAY_MS; // si hoy es lunes, la semana en curso aún no tiene datos
  const first = anchor - 51 * 7 * DAY_MS;
  const dateCol = column(table, dateField);
  const office = keyReader(column(table, "oficina_responsable_de_respuesta"));
  const phaseCols = Object.fromEntries(Object.entries(PHASES).map(([k, f]) => [k, column(table, f)])) as Record<Phase, ReturnType<typeof column>>;

  // suma y conteo por gerencia × semana × fase
  const agg = new Map<string, Map<number, Record<Phase, [number, number]>>>();
  for (let k = 0; k < rows.length; k++) {
    const i = rows[k];
    const d = numberAt(dateCol, i);
    if (!Number.isFinite(d) || d < first || d >= anchor + 7 * DAY_MS) continue;
    const w = Math.floor((weekStart(d) - first) / (7 * DAY_MS));
    const g = office(i) || "No reporta";
    let weeks = agg.get(g);
    if (!weeks) agg.set(g, (weeks = new Map()));
    let cell = weeks.get(w);
    if (!cell) weeks.set(w, (cell = { asignacion: [0, 0], gestion: [0, 0], revision: [0, 0], aprobacion: [0, 0] }));
    for (const p of Object.keys(PHASES) as Phase[]) {
      const v = numberAt(phaseCols[p], i);
      if (Number.isFinite(v)) {
        cell[p][0] += v;
        cell[p][1]++;
      }
    }
  }

  const cuts = {} as Record<Phase, [number, number, number] | null>;
  for (const p of Object.keys(PHASES) as Phase[]) {
    const all: number[] = [];
    for (const weeks of agg.values()) for (const cell of weeks.values()) if (cell[p][1]) all.push(cell[p][0] / cell[p][1]);
    cuts[p] = quantiles(all);
  }

  const lastWeeks = [49, 50, 51];
  const weekLabel = (w: number) => {
    const s = new Date(first + w * 7 * DAY_MS);
    const e = new Date(first + w * 7 * DAY_MS + 6 * DAY_MS);
    const iso = isoWeek(s.getTime());
    return `Sem ${iso} · ${s.getUTCDate()} ${MONTHS_ES[s.getUTCMonth()]} – ${e.getUTCDate()} ${MONTHS_ES[e.getUTCMonth()]}`;
  };

  const out = [...agg.entries()].map(([gerencia, weeks]) => {
    const phases = {} as Record<Phase, EfficiencyPhase>;
    const current: number[] = [];
    for (const p of Object.keys(PHASES) as Phase[]) {
      const values = lastWeeks.map((w) => {
        const c = weeks.get(w)?.[p];
        return c && c[1] ? Math.round((c[0] / c[1]) * 100) / 100 : null;
      });
      const qs = values.map((v) => quartile(v, cuts[p]));
      const { message: msg, tone } = message(values[2], qs);
      phases[p] = { message: msg, tone, values, quartiles: qs };
      if (qs[2] !== null) current.push(qs[2]);
    }
    const score = current.length ? current.reduce((a, b) => a + b, 0) / current.length : null;
    return { gerencia, score, ranking: null as number | null, phases };
  });

  const ranked = out.filter((r) => r.score !== null).sort((a, b) => a.score! - b.score!);
  let prevScore: number | null = null;
  let prevRank = 0;
  ranked.forEach((r, idx) => {
    r.ranking = r.score === prevScore ? prevRank : idx + 1;
    prevScore = r.score;
    prevRank = r.ranking;
  });
  const rowsOut = [...ranked, ...out.filter((r) => r.score === null)];
  return { kind: "efficiency", weeks: lastWeeks.map(weekLabel), rows: rowsOut.slice(0, 60) };
}
