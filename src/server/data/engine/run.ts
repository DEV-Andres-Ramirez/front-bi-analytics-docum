import "server-only";

import type {
  DashboardResponse,
  DetailResponse,
  FiltersState,
  KpiResult,
  MonthlyResult,
  TimeseriesResult,
  WidgetResult,
} from "@/dashboards/dto";
import type { DashboardSpec, TimeseriesWidget, WidgetDef } from "@/dashboards/types";
import { formatDateTime, previousRange, startOfYear } from "@/lib/dates";
import { dptoName, mpioName } from "@/lib/geo/diccionario";
import { column, hasColumn, rawAt, stringAt, type Table } from "../table";
import {
  barTableResult,
  bucketSeries,
  categoryResult,
  dailySeries,
  drilldownResult,
  groupMeasure,
  histogramResult,
  mapResult,
  monthlySeries,
  pivotResult,
  sankeyResult,
  topCategories,
} from "./aggregate";
import { compilePredicate, measureOver } from "./core";
import { efficiencyResult } from "./efficiency";
import { selectRows } from "./filter";

function allWidgets(spec: DashboardSpec): WidgetDef[] {
  return spec.sections.flatMap((s) => s.widgets);
}

function kpis(table: Table, spec: DashboardSpec, filters: FiltersState, range: ReturnType<typeof previousRange>): KpiResult[] {
  return spec.kpis.map((k) => {
    const dateField = k.dateField ?? spec.dateField;
    const cur = selectRows(table, filters, { dateField });
    const prev = selectRows(table, filters, { dateField, from: range.prevFrom, to: range.prevTo });
    const value = measureOver(table, cur, k.measure);
    const previous = prev.length ? measureOver(table, prev, k.measure) : null;
    const delta = value !== null && previous !== null && previous !== 0 ? (value - previous) / Math.abs(previous) : null;
    return { id: k.id, value, previous, delta, spark: bucketSeries(table, cur, dateField, filters.from, filters.to, k.measure) };
  });
}

function timeseries(table: Table, spec: DashboardSpec, filters: FiltersState, w: TimeseriesWidget, range: ReturnType<typeof previousRange>): TimeseriesResult {
  const out: TimeseriesResult = { kind: "timeseries", start: filters.from, series: [] };
  if (w.splitBy && hasColumn(table, w.splitBy)) {
    const rows = selectRows(table, filters, { dateField: spec.dateField });
    const top = topCategories(table, rows, w.splitBy, w.splitTopN ?? 5);
    for (const cat of top) {
      const test = compilePredicate(table, { field: w.splitBy, in: [cat] });
      const sub = selectRows(table, filters, { dateField: spec.dateField, extra: test });
      out.series.push({ id: cat, label: cat, values: dailySeries(table, sub, spec.dateField, filters.from, filters.to) });
    }
    return out;
  }
  const series = w.series ?? [{ id: "total", label: "Registros" }];
  for (const s of series) {
    const dateField = s.dateField ?? spec.dateField;
    const rows = selectRows(table, filters, { dateField });
    out.series.push({ id: s.id, label: s.label, values: dailySeries(table, rows, dateField, filters.from, filters.to, s.measure) });
  }
  if (w.compare) {
    const s = series[0];
    const dateField = s.dateField ?? spec.dateField;
    const prev = selectRows(table, filters, { dateField, from: range.prevFrom, to: range.prevTo });
    out.previous = dailySeries(table, prev, dateField, range.prevFrom, range.prevTo, s.measure);
    out.prevStart = range.prevFrom;
  }
  return out;
}

function monthly(table: Table, spec: DashboardSpec, filters: FiltersState, w: Extract<WidgetDef, { type: "monthly" }>): MonthlyResult {
  const from = w.scope === "ytd" ? startOfYear(filters.to) : filters.from;
  const months: string[] = [];
  const [y0, m0] = from.split("-").map(Number);
  const [y1, m1] = filters.to.split("-").map(Number);
  for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? ((m = 1), y++) : m++) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  const rows = selectRows(table, filters, { dateField: spec.dateField, from, to: filters.to });
  return { kind: "monthly", months, values: monthlySeries(table, rows, spec.dateField, months, w.measure) };
}

export function runDashboard(table: Table, spec: DashboardSpec, filters: FiltersState, source: "mock" | "db"): DashboardResponse {
  const range = { from: filters.from, to: filters.to, ...previousRange(filters.from, filters.to) };
  const rows = selectRows(table, filters, { dateField: spec.dateField });

  const widgets: Record<string, WidgetResult> = {};
  for (const w of allWidgets(spec)) {
    switch (w.type) {
      case "bar":
      case "donut":
        widgets[w.id] = categoryResult(table, rows, w);
        break;
      case "timeseries":
        widgets[w.id] = timeseries(table, spec, filters, w, range);
        break;
      case "monthly":
        widgets[w.id] = monthly(table, spec, filters, w);
        break;
      case "pivot":
        widgets[w.id] = pivotResult(table, rows, w);
        break;
      case "bartable":
        widgets[w.id] = barTableResult(table, rows, w);
        break;
      case "map":
        widgets[w.id] = mapResult(table, rows, w);
        break;
      case "sankey":
        widgets[w.id] = sankeyResult(table, rows, w);
        break;
      case "drilldown":
        widgets[w.id] = drilldownResult(table, rows, w);
        break;
      case "histogram":
        widgets[w.id] = histogramResult(table, rows, w);
        break;
      case "efficiency": {
        const all = selectRows(table, filters, { dateField: spec.dateField, ignoreRange: true });
        widgets[w.id] = efficiencyResult(table, all, spec.dateField);
        break;
      }
    }
  }

  // Opciones facetadas: cada filtro se calcula con todos los demás aplicados
  const options: DashboardResponse["options"] = {};
  for (const f of spec.filters) {
    if (f.kind !== "multi" || !hasColumn(table, f.field)) continue;
    const facet = selectRows(table, filters, { dateField: spec.dateField, skipField: f.field });
    options[f.field] = [...groupMeasure(table, facet, f.field).entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 400)
      .map(([value, count]) => ({ value, count }));
    // Mantener visibles los valores seleccionados aunque ya no tengan registros
    for (const v of filters.eq[f.field] ?? []) {
      if (!options[f.field].some((o) => o.value === v)) options[f.field].push({ value: v, count: 0 });
    }
  }

  const geoNames: Record<string, string> = {};
  for (const code of filters.eq.__dpto ?? []) geoNames[code] = dptoName(code);
  for (const code of filters.eq.__mpio ?? []) geoNames[code] = mpioName(code);

  return {
    slug: spec.slug,
    range,
    source,
    rowsInRange: rows.length,
    generatedAt: new Date().toISOString(),
    kpis: kpis(table, spec, filters, range),
    widgets,
    options,
    geoNames,
  };
}

export interface DetailQuery {
  page: number;
  size: number;
  sort?: { field: string; dir: "asc" | "desc" };
  q?: string;
}

function sortedRows(table: Table, spec: DashboardSpec, filters: FiltersState, query: Pick<DetailQuery, "sort" | "q">) {
  let rows = selectRows(table, filters, { dateField: spec.dateField });
  if (query.q?.trim()) {
    const q = query.q.trim().toLocaleLowerCase("es-CO");
    const cols = spec.table.searchFields.filter((f) => hasColumn(table, f)).map((f) => column(table, f));
    rows = rows.filter((i) => cols.some((c) => stringAt(c, i).toLocaleLowerCase("es-CO").includes(q)));
  }
  const sort = query.sort ?? spec.table.defaultSort;
  if (hasColumn(table, sort.field)) {
    const col = column(table, sort.field);
    const dir = sort.dir === "asc" ? 1 : -1;
    const arr = Array.from(rows);
    if (col.kind === "num" || col.kind === "date") {
      const v = col.values;
      arr.sort((a, b) => {
        const x = v[a];
        const y = v[b];
        if (Number.isNaN(x)) return 1;
        if (Number.isNaN(y)) return -1;
        return (x - y) * dir;
      });
    } else {
      arr.sort((a, b) => stringAt(col, a).localeCompare(stringAt(col, b), "es", { numeric: true }) * dir);
    }
    rows = Uint32Array.from(arr);
  }
  return rows;
}

export function runDetail(table: Table, spec: DashboardSpec, filters: FiltersState, query: DetailQuery): DetailResponse {
  const rows = sortedRows(table, spec, filters, query);
  const size = Math.min(Math.max(query.size, 10), 200);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(Math.max(1, query.page), pages);
  const slice = rows.subarray((page - 1) * size, page * size);
  const fields = spec.table.columns.map((c) => c.field).filter((f) => hasColumn(table, f));
  return {
    total: rows.length,
    page,
    size,
    rows: Array.from(slice, (i) => Object.fromEntries(fields.map((f) => [f, rawAt(column(table, f), i)]))),
  };
}

const CSV_LIMIT = 100_000;

/** CSV con separador ";" (Excel es-CO) y BOM UTF-8. */
export function runCsv(table: Table, spec: DashboardSpec, filters: FiltersState, query: Pick<DetailQuery, "sort" | "q">): string {
  const rows = sortedRows(table, spec, filters, query).subarray(0, CSV_LIMIT);
  const cols = spec.table.columns.filter((c) => hasColumn(table, c.field));
  const esc = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [cols.map((c) => esc(c.label)).join(";")];
  for (const i of rows) {
    lines.push(
      cols
        .map((c) => {
          const col = column(table, c.field);
          const raw = rawAt(col, i);
          if (raw === null) return "";
          if (col.kind === "date") return formatDateTime(raw as number, c.format !== "date");
          if (typeof raw === "number") return String(raw).replace(".", ",");
          return esc(raw);
        })
        .join(";"),
    );
  }
  return `﻿${lines.join("\r\n")}`;
}
