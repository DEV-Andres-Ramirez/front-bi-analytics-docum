import type { FiltersState } from "@/dashboards/dto";
import { defaultRange } from "@/lib/dates";

/**
 * Serialización URL ⇄ filtros. La URL es la fuente de verdad (se puede compartir):
 *   ?from=2026-09-01&to=2026-09-27&f.estado=Aprobado&f.estado=Por%20asignar&t.cufe=abc&d.fecha_aprobacion=2026-09-01..2026-09-10
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function parseFilters(params: URLSearchParams, now = Date.now()): FiltersState {
  const def = defaultRange(now);
  let from = params.get("from") ?? def.from;
  let to = params.get("to") ?? def.to;
  if (!ISO.test(from)) from = def.from;
  if (!ISO.test(to)) to = def.to;
  if (from > to) [from, to] = [to, from];

  const eq: FiltersState["eq"] = {};
  const text: FiltersState["text"] = {};
  const dates: FiltersState["dates"] = {};
  for (const [key, value] of params.entries()) {
    if (key.startsWith("f.") && value) {
      const field = key.slice(2);
      const list = (eq[field] ??= []);
      if (!list.includes(value)) list.push(value);
    } else if (key.startsWith("t.") && value.trim()) {
      text[key.slice(2)] = value.trim();
    } else if (key.startsWith("d.") && value.includes("..")) {
      const [a, b] = value.split("..");
      dates[key.slice(2)] = { from: ISO.test(a) ? a : undefined, to: ISO.test(b) ? b : undefined };
    }
  }
  return { from, to, eq, text, dates };
}

export function serializeFilters(state: FiltersState, extra?: Record<string, string>): URLSearchParams {
  const p = new URLSearchParams();
  p.set("from", state.from);
  p.set("to", state.to);
  for (const field of Object.keys(state.eq).sort()) {
    for (const v of state.eq[field]) p.append(`f.${field}`, v);
  }
  for (const field of Object.keys(state.text).sort()) p.set(`t.${field}`, state.text[field]);
  for (const field of Object.keys(state.dates).sort()) {
    const r = state.dates[field];
    if (r.from || r.to) p.set(`d.${field}`, `${r.from ?? ""}..${r.to ?? ""}`);
  }
  if (extra) for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p;
}

export function activeFilterCount(state: FiltersState): number {
  return (
    Object.values(state.eq).reduce((n, v) => n + (v.length ? 1 : 0), 0) +
    Object.keys(state.text).length +
    Object.values(state.dates).filter((r) => r.from || r.to).length
  );
}
