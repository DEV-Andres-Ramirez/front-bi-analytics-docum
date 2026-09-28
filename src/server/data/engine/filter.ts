import "server-only";

import type { FiltersState } from "@/dashboards/dto";
import { DAY_MS, isoToMs } from "@/lib/dates";
import { column, hasColumn, stringAt, type Table } from "../table";
import type { RowTest } from "./core";

export interface SelectOptions {
  dateField: string;
  from?: string;
  to?: string;
  /** No aplicar el filtro de este campo (opciones facetadas). */
  skipField?: string;
  /** Ignorar el rango principal (p. ej. gráficas "año en curso"). */
  ignoreRange?: boolean;
  extra?: RowTest;
}

/** Devuelve los índices de fila que cumplen los filtros. */
export function selectRows(table: Table, filters: FiltersState, opts: SelectOptions): Uint32Array {
  const tests: RowTest[] = [];

  if (!opts.ignoreRange && hasColumn(table, opts.dateField)) {
    const col = column(table, opts.dateField);
    if (col.kind === "date" || col.kind === "num") {
      const lo = isoToMs(opts.from ?? filters.from);
      const hi = isoToMs(opts.to ?? filters.to) + DAY_MS - 1;
      const v = col.values;
      tests.push((i) => v[i] >= lo && v[i] <= hi);
    }
  }

  for (const [field, values] of Object.entries(filters.eq)) {
    if (field === opts.skipField || !values.length || !hasColumn(table, field)) continue;
    const col = column(table, field);
    if (col.kind === "cat") {
      const codes = new Set(values.map((v) => col.index.get(v)).filter((c): c is number => c !== undefined));
      const arr = col.codes;
      tests.push((i) => codes.has(arr[i]));
    } else {
      const set = new Set(values);
      tests.push((i) => set.has(stringAt(col, i)));
    }
  }

  for (const [field, query] of Object.entries(filters.text)) {
    if (field === opts.skipField || !hasColumn(table, field)) continue;
    const col = column(table, field);
    const q = query.toLocaleLowerCase("es-CO");
    tests.push((i) => stringAt(col, i).toLocaleLowerCase("es-CO").includes(q));
  }

  for (const [field, range] of Object.entries(filters.dates)) {
    if (field === opts.skipField || !hasColumn(table, field)) continue;
    const col = column(table, field);
    if (col.kind !== "date") continue;
    const lo = range.from ? isoToMs(range.from) : -Infinity;
    const hi = range.to ? isoToMs(range.to) + DAY_MS - 1 : Infinity;
    const v = col.values;
    tests.push((i) => v[i] >= lo && v[i] <= hi);
  }

  if (opts.extra) tests.push(opts.extra);

  const out = new Uint32Array(table.n);
  let k = 0;
  outer: for (let i = 0; i < table.n; i++) {
    for (let t = 0; t < tests.length; t++) if (!tests[t](i)) continue outer;
    out[k++] = i;
  }
  return out.subarray(0, k);
}
