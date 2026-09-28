import "server-only";

import type {
  BarTableResult,
  CategoryResult,
  DrillNode,
  DrilldownResult,
  HistogramResult,
  MapResult,
  PivotResult,
  SankeyResult,
} from "@/dashboards/dto";
import type {
  BarTableWidget,
  BarWidget,
  DonutWidget,
  DrilldownWidget,
  HistogramWidget,
  MapWidget,
  Measure,
  PivotWidget,
  SankeyWidget,
} from "@/dashboards/types";
import { DAY_MS, isoToMs } from "@/lib/dates";
import { dptoName, mpioName } from "@/lib/geo/diccionario";
import { column, hasColumn, numberAt, type Table } from "../table";
import { accFactory, compilePredicate, keyReader, type Acc } from "./core";

export const OTROS = "Otros";

/** Agrupa filas por una dimensión y calcula la medida por grupo. */
export function groupMeasure(table: Table, rows: Uint32Array, field: string, measure?: Measure): Map<string, number> {
  const out = new Map<string, number>();
  if (!hasColumn(table, field)) return out;
  const col = column(table, field);
  const make = accFactory(table, measure);
  const accs = new Map<string, Acc>();
  const key = keyReader(col);
  for (let k = 0; k < rows.length; k++) {
    const i = rows[k];
    const kv = key(i) || "No reporta";
    let acc = accs.get(kv);
    if (!acc) accs.set(kv, (acc = make()));
    acc.add(i);
  }
  for (const [kv, acc] of accs) out.set(kv, acc.value() ?? 0);
  return out;
}

function orderLabels(entries: [string, number][], sort: BarWidget["sort"] = "desc", order?: string[]): [string, number][] {
  if (sort === "natural" && order) {
    const pos = new Map(order.map((v, i) => [v, i]));
    return entries.sort((a, b) => (pos.get(a[0]) ?? 999) - (pos.get(b[0]) ?? 999) || b[1] - a[1]);
  }
  if (sort === "label") return entries.sort((a, b) => a[0].localeCompare(b[0], "es", { numeric: true }));
  if (sort === "asc") return entries.sort((a, b) => a[1] - b[1]);
  return entries.sort((a, b) => b[1] - a[1]);
}

/** Barras (simples o apiladas) y donas. */
export function categoryResult(table: Table, rows: Uint32Array, w: BarWidget | DonutWidget): CategoryResult {
  const grouped = groupMeasure(table, rows, w.dimension, w.measure);
  const sort = "sort" in w && w.sort ? w.sort : w.order ? "natural" : "desc";
  let entries = orderLabels([...grouped.entries()], sort, w.order);
  const additive = !w.measure || w.measure.kind === "count" || w.measure.kind === "sum";
  const limit = w.type === "donut" ? (w.maxSlices ?? 6) : w.topN;
  let folded = 0;
  if (limit && entries.length > limit) {
    const others = w.type === "donut" || (w as BarWidget).others;
    const keep = entries.slice(0, others ? limit - 1 : limit);
    const rest = entries.slice(others ? limit - 1 : limit);
    folded = rest.length;
    if (others && additive) keep.push([OTROS, rest.reduce((a, e) => a + e[1], 0)]);
    entries = keep;
  }
  const labels = entries.map((e) => e[0]);
  const values = entries.map((e) => e[1]);
  const result: CategoryResult = {
    kind: "category",
    labels,
    values,
    total: additive ? [...grouped.values()].reduce((a, b) => a + b, 0) : values.reduce((a, b) => a + b, 0),
    folded,
  };

  if (w.type === "bar" && w.stackBy && hasColumn(table, w.stackBy)) {
    result.stacks = stackedValues(table, rows, w.dimension, w.stackBy, labels, w.measure, w.stackOrder);
  }
  if (w.type === "bar" && w.secondary) {
    const col = column(table, w.dimension);
    const key = keyReader(col);
    const make = accFactory(table, w.secondary.measure);
    const accs = new Map<string, Acc>();
    for (let k = 0; k < rows.length; k++) {
      const i = rows[k];
      const kv = key(i) || "No reporta";
      let acc = accs.get(kv);
      if (!acc) accs.set(kv, (acc = make()));
      acc.add(i);
    }
    result.secondary = labels.map((l) => accs.get(l)?.value() ?? null);
  }
  return result;
}

function stackedValues(
  table: Table,
  rows: Uint32Array,
  field: string,
  stackField: string,
  labels: string[],
  measure?: Measure,
  stackOrder?: string[],
) {
  const key = keyReader(column(table, field));
  const skey = keyReader(column(table, stackField));
  const make = accFactory(table, measure);
  const labelIdx = new Map(labels.map((l, i) => [l, i]));
  const hasOthers = labelIdx.has(OTROS);
  const stacks = new Map<string, Acc[]>();
  for (let k = 0; k < rows.length; k++) {
    const i = rows[k];
    let li = labelIdx.get(key(i) || "No reporta");
    if (li === undefined) {
      if (!hasOthers) continue;
      li = labelIdx.get(OTROS)!;
    }
    const s = skey(i) || "No reporta";
    let arr = stacks.get(s);
    if (!arr) stacks.set(s, (arr = labels.map(() => make())));
    arr[li].add(i);
  }
  const pos = new Map((stackOrder ?? []).map((v, i) => [v, i]));
  return [...stacks.entries()]
    .map(([k, accs]) => ({ key: k, values: accs.map((a) => a.value() ?? 0) }))
    .sort((a, b) => (pos.get(a.key) ?? 99) - (pos.get(b.key) ?? 99) || b.values.reduce((x, y) => x + y, 0) - a.values.reduce((x, y) => x + y, 0));
}

/** Serie diaria (un valor por día entre from y to, ambos inclusive). */
export function dailySeries(table: Table, rows: Uint32Array, dateField: string, from: string, to: string, measure?: Measure): number[] {
  const start = isoToMs(from);
  const days = Math.round((isoToMs(to) - start) / DAY_MS) + 1;
  if (!hasColumn(table, dateField)) return new Array(days).fill(0);
  const col = column(table, dateField);
  const make = accFactory(table, measure);
  const accs: Acc[] = Array.from({ length: days }, () => make());
  for (let k = 0; k < rows.length; k++) {
    const i = rows[k];
    const v = numberAt(col, i);
    if (!Number.isFinite(v)) continue;
    const d = Math.floor((v - start) / DAY_MS);
    if (d >= 0 && d < days) accs[d].add(i);
  }
  return accs.map((a) => a.value() ?? 0);
}

/** Valores por bucket (día/semana/mes) para sparklines, con medidas no aditivas. */
export function bucketSeries(
  table: Table,
  rows: Uint32Array,
  dateField: string,
  from: string,
  to: string,
  measure?: Measure,
): (number | null)[] {
  const start = isoToMs(from);
  const days = Math.round((isoToMs(to) - start) / DAY_MS) + 1;
  const size = days > 400 ? 30 : days > 92 ? 7 : 1;
  const buckets = Math.ceil(days / size);
  if (!hasColumn(table, dateField)) return new Array(buckets).fill(null);
  const col = column(table, dateField);
  const make = accFactory(table, measure);
  const accs: Acc[] = Array.from({ length: buckets }, () => make());
  const touched = new Uint8Array(buckets);
  for (let k = 0; k < rows.length; k++) {
    const i = rows[k];
    const v = numberAt(col, i);
    if (!Number.isFinite(v)) continue;
    const b = Math.floor((v - start) / DAY_MS / size);
    if (b >= 0 && b < buckets) {
      accs[b].add(i);
      touched[b] = 1;
    }
  }
  const additive = !measure || measure.kind === "count" || measure.kind === "sum" || measure.kind === "countDistinct";
  return accs.map((a, b) => (touched[b] || additive ? a.value() : null));
}

/** Valores por mes YYYY-MM. */
export function monthlySeries(table: Table, rows: Uint32Array, dateField: string, months: string[], measure?: Measure): number[] {
  if (!hasColumn(table, dateField)) return months.map(() => 0);
  const col = column(table, dateField);
  const make = accFactory(table, measure);
  const idx = new Map(months.map((m, i) => [m, i]));
  const accs = months.map(() => make());
  for (let k = 0; k < rows.length; k++) {
    const i = rows[k];
    const v = numberAt(col, i);
    if (!Number.isFinite(v)) continue;
    const m = idx.get(new Date(v).toISOString().slice(0, 7));
    if (m !== undefined) accs[m].add(i);
  }
  return accs.map((a) => a.value() ?? 0);
}

/** Top-N categorías de un campo (por conteo) dentro de las filas. */
export function topCategories(table: Table, rows: Uint32Array, field: string, n: number): string[] {
  return [...groupMeasure(table, rows, field).entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map((e) => e[0]);
}

export function pivotResult(table: Table, rows: Uint32Array, w: PivotWidget): PivotResult {
  const where = w.where ? compilePredicate(table, w.where) : null;
  const rowKeys = w.rows.map((r) => keyReader(column(table, r.field)));
  const colKey = keyReader(column(table, w.columns.field));
  const make = accFactory(table, w.measure);
  const exclude = new Set(w.columnExclude ?? []);
  const cells = new Map<string, Map<string, Acc>>();
  const rowTotals = new Map<string, Acc>();
  const colTotals = new Map<string, Acc>();
  for (let k = 0; k < rows.length; k++) {
    const i = rows[k];
    if (where && !where(i)) continue;
    const c = colKey(i) || "No reporta";
    if (exclude.has(c)) continue;
    const rk = rowKeys.map((f) => f(i) || "No reporta").join("\u0001");
    let row = cells.get(rk);
    if (!row) cells.set(rk, (row = new Map()));
    let acc = row.get(c);
    if (!acc) row.set(c, (acc = make()));
    acc.add(i);
    let rt = rowTotals.get(rk);
    if (!rt) rowTotals.set(rk, (rt = make()));
    rt.add(i);
    let ct = colTotals.get(c);
    if (!ct) colTotals.set(c, (ct = make()));
    ct.add(i);
  }
  const present = [...colTotals.entries()].sort((a, b) => (b[1].value() ?? 0) - (a[1].value() ?? 0)).map((e) => e[0]);
  const columns = w.columnOrder ? [...w.columnOrder.filter((c) => colTotals.has(c)), ...present.filter((c) => !w.columnOrder!.includes(c))] : present;

  const groupTotals = new Map<string, number>();
  const all = [...cells.entries()].map(([rk, row]) => {
    const parts = rk.split("\u0001");
    const values = columns.map((c) => row.get(c)?.value() ?? 0);
    const total = rowTotals.get(rk)?.value() ?? 0;
    const group = parts.length > 1 ? parts[0] : undefined;
    if (group) groupTotals.set(group, (groupTotals.get(group) ?? 0) + total);
    return { group, label: parts.at(-1)!, values, total };
  });
  all.sort((a, b) => (a.group && b.group ? (groupTotals.get(b.group)! - groupTotals.get(a.group)!) || a.group.localeCompare(b.group) : 0) || b.total - a.total);
  const maxRows = w.maxRows ?? 120;
  const rowsOut = all.slice(0, maxRows);
  let max = 0;
  for (const r of rowsOut) for (const v of r.values) if (v > max) max = v;
  return {
    kind: "pivot",
    columns,
    rows: rowsOut,
    totals: columns.map((c) => colTotals.get(c)?.value() ?? 0),
    max,
    truncated: Math.max(0, all.length - maxRows),
  };
}

export function barTableResult(table: Table, rows: Uint32Array, w: BarTableWidget): BarTableResult {
  const where = w.where ? compilePredicate(table, w.where) : null;
  const keys = w.columns.map((c) => keyReader(column(table, c.field)));
  const make = accFactory(table, w.measure);
  const groups = new Map<string, Acc>();
  for (let k = 0; k < rows.length; k++) {
    const i = rows[k];
    if (where && !where(i)) continue;
    const key = keys.map((f) => f(i) || "No reporta").join("\u0001");
    let acc = groups.get(key);
    if (!acc) groups.set(key, (acc = make()));
    acc.add(i);
  }
  const all = [...groups.entries()]
    .map(([key, acc]) => ({ cells: key.split("\u0001"), value: acc.value() ?? 0 }))
    .sort((a, b) => b.value - a.value);
  const out = all.slice(0, w.topN ?? 100);
  return {
    kind: "bartable",
    rows: out,
    max: out.reduce((m, r) => Math.max(m, r.value), 0),
    total: all.reduce((s, r) => s + r.value, 0),
  };
}

export function mapResult(table: Table, rows: Uint32Array, w: MapWidget): MapResult {
  const dcol = column(table, "__dpto");
  const mcol = column(table, "__mpio");
  if (dcol.kind !== "cat" || mcol.kind !== "cat") throw new Error("Columnas geo inválidas");
  const make = accFactory(table, w.measure);
  const bkey = w.breakdown && hasColumn(table, w.breakdown.field) ? keyReader(column(table, w.breakdown.field)) : null;
  const dAcc = new Map<string, Acc>();
  const mAcc = new Map<string, Acc>();
  const dBreak = new Map<string, Map<string, number>>();
  const mBreak = new Map<string, Map<string, number>>();
  let unlocated = 0;
  const total = make();
  for (let k = 0; k < rows.length; k++) {
    const i = rows[k];
    total.add(i);
    const d = dcol.dict[dcol.codes[i]];
    if (!d) {
      unlocated++;
      continue;
    }
    let a = dAcc.get(d);
    if (!a) dAcc.set(d, (a = make()));
    a.add(i);
    const m = mcol.dict[mcol.codes[i]];
    if (m) {
      let b = mAcc.get(m);
      if (!b) mAcc.set(m, (b = make()));
      b.add(i);
    }
    if (bkey) {
      const bv = bkey(i) || "No reporta";
      let dm = dBreak.get(d);
      if (!dm) dBreak.set(d, (dm = new Map()));
      dm.set(bv, (dm.get(bv) ?? 0) + 1);
      if (m) {
        let mm = mBreak.get(m);
        if (!mm) mBreak.set(m, (mm = new Map()));
        mm.set(bv, (mm.get(bv) ?? 0) + 1);
      }
    }
  }
  const t = total.value() ?? 0;
  const top = (m?: Map<string, number>) =>
    m ? [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([label, value]) => ({ label, value })) : undefined;
  const dptos = [...dAcc.entries()].map(([code, a]) => {
    const value = a.value() ?? 0;
    return { code, name: dptoName(code), value, share: t ? value / t : 0, top: top(dBreak.get(code)) };
  });
  const mpios = [...mAcc.entries()].map(([code, a]) => {
    const value = a.value() ?? 0;
    return { code, name: mpioName(code), value, share: t ? value / t : 0, top: top(mBreak.get(code)) };
  });
  dptos.sort((a, b) => b.value - a.value);
  mpios.sort((a, b) => b.value - a.value);
  return { kind: "map", dptos, mpios, total: t, unlocated };
}

export function sankeyResult(table: Table, rows: Uint32Array, w: SankeyWidget): SankeyResult {
  const a = keyReader(column(table, w.from.field));
  const b = keyReader(column(table, w.to.field));
  const flows = new Map<string, number>();
  for (let k = 0; k < rows.length; k++) {
    const i = rows[k];
    const key = `${a(i) || "No reporta"}\u0001${b(i) || "No reporta"}`;
    flows.set(key, (flows.get(key) ?? 0) + 1);
  }
  return {
    kind: "sankey",
    flows: [...flows.entries()]
      .map(([key, value]) => {
        const [from, to] = key.split("\u0001");
        return { from, to, value };
      })
      .sort((x, y) => y.value - x.value),
  };
}

export function drilldownResult(table: Table, rows: Uint32Array, w: DrilldownWidget): DrilldownResult {
  const keys = w.levels.map((l) => keyReader(column(table, l.field)));
  const skey = w.stackBy ? keyReader(column(table, w.stackBy)) : null;
  interface Node {
    value: number;
    stacks: Map<string, number>;
    children: Map<string, Node>;
  }
  const root: Node = { value: 0, stacks: new Map(), children: new Map() };
  const stackKeys = new Set<string>();
  for (let k = 0; k < rows.length; k++) {
    const i = rows[k];
    const s = skey ? skey(i) || "No reporta" : "";
    if (skey) stackKeys.add(s);
    let node = root;
    for (const key of keys) {
      const kv = key(i) || "No reporta";
      let child = node.children.get(kv);
      if (!child) node.children.set(kv, (child = { value: 0, stacks: new Map(), children: new Map() }));
      child.value++;
      if (skey) child.stacks.set(s, (child.stacks.get(s) ?? 0) + 1);
      node = child;
    }
  }
  const topN = w.topN ?? 10;
  const convert = (node: Node): DrillNode[] => {
    const entries = [...node.children.entries()].sort((a, b) => b[1].value - a[1].value);
    const keep = entries.slice(0, topN);
    const rest = entries.slice(topN);
    const out: DrillNode[] = keep.map(([label, n]) => ({
      label,
      value: n.value,
      stacks: skey ? Object.fromEntries(n.stacks) : undefined,
      children: n.children.size ? convert(n) : undefined,
    }));
    if (rest.length) {
      const stacks: Record<string, number> = {};
      let value = 0;
      for (const [, n] of rest) {
        value += n.value;
        for (const [s, v] of n.stacks) stacks[s] = (stacks[s] ?? 0) + v;
      }
      out.push({ label: OTROS, value, stacks: skey ? stacks : undefined });
    }
    return out;
  };
  const order = new Map((w.stackOrder ?? []).map((v, i) => [v, i]));
  return {
    kind: "drilldown",
    nodes: convert(root),
    stackKeys: [...stackKeys].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99)),
  };
}

export function histogramResult(table: Table, rows: Uint32Array, w: HistogramWidget): HistogramResult {
  const col = column(table, w.field);
  const counts = new Array(w.bins.length + 1).fill(0);
  let empty = 0;
  for (let k = 0; k < rows.length; k++) {
    const v = numberAt(col, rows[k]);
    if (!Number.isFinite(v)) {
      empty++;
      continue;
    }
    let b = w.bins.findIndex((edge) => v <= edge);
    if (b < 0) b = w.bins.length;
    counts[b]++;
  }
  const labels: string[] = [];
  let prev: number | null = null;
  for (const edge of w.bins) {
    labels.push(prev === null ? `≤ ${edge}` : prev + 1 === edge ? `${edge}` : `${prev + 1}–${edge}`);
    prev = edge;
  }
  labels.push(`> ${w.bins.at(-1)}`);
  // Quita el último intervalo si está vacío
  if (counts.at(-1) === 0) {
    counts.pop();
    labels.pop();
  }
  return { kind: "histogram", labels, values: counts, empty };
}
