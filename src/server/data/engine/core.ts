import "server-only";

import type { Measure, Predicate } from "@/dashboards/types";
import { column, hasColumn, numberAt, stringAt, type Column, type Table } from "../table";

export type RowTest = (i: number) => boolean;

const EMPTY = new Set(["", "No reporta", "No Reporta", "NO REPORTA", "Sin categoría"]);

/** Compila un predicado declarativo a una función sobre el índice de fila. */
export function compilePredicate(table: Table, p: Predicate): RowTest {
  if ("and" in p) {
    const tests = p.and.map((x) => compilePredicate(table, x));
    return (i) => tests.every((t) => t(i));
  }
  if ("or" in p) {
    const tests = p.or.map((x) => compilePredicate(table, x));
    return (i) => tests.some((t) => t(i));
  }
  if ("not" in p) {
    const t = compilePredicate(table, p.not);
    return (i) => !t(i);
  }
  if ("lteField" in p) {
    const [a, b] = p.lteField.map((f) => column(table, f));
    return (i) => {
      const x = numberAt(a, i);
      const y = numberAt(b, i);
      return Number.isFinite(x) && Number.isFinite(y) && x <= y;
    };
  }
  if (!hasColumn(table, p.field)) return () => false;
  const col = column(table, p.field);
  if ("in" in p || "notIn" in p) {
    const values = "in" in p ? p.in : p.notIn;
    const negate = "notIn" in p;
    if (col.kind === "cat") {
      const codes = new Set(values.map((v) => col.index.get(v)).filter((c): c is number => c !== undefined));
      return negate ? (i) => !codes.has(col.codes[i]) : (i) => codes.has(col.codes[i]);
    }
    const set = new Set(values);
    return negate ? (i) => !set.has(stringAt(col, i)) : (i) => set.has(stringAt(col, i));
  }
  if ("notEmpty" in p) return (i) => !isEmpty(col, i);
  if ("isEmpty" in p) return (i) => isEmpty(col, i);
  const { gt, gte, lt, lte } = p as { gt?: number; gte?: number; lt?: number; lte?: number };
  return (i) => {
    const v = numberAt(col, i);
    if (!Number.isFinite(v)) return false;
    if (gt !== undefined && !(v > gt)) return false;
    if (gte !== undefined && !(v >= gte)) return false;
    if (lt !== undefined && !(v < lt)) return false;
    if (lte !== undefined && !(v <= lte)) return false;
    return true;
  };
}

function isEmpty(col: Column, i: number) {
  if (col.kind === "num" || col.kind === "date") return Number.isNaN(col.values[i]);
  return EMPTY.has(stringAt(col, i));
}

// ─── Acumuladores de medidas ────────────────────────────────────────────────
export interface Acc {
  add(i: number): void;
  value(): number | null;
}

export type AccFactory = () => Acc;

export function accFactory(table: Table, m: Measure = { kind: "count" }): AccFactory {
  const where = "where" in m && m.where ? compilePredicate(table, m.where) : null;
  switch (m.kind) {
    case "count":
      return () => {
        let n = 0;
        return { add: (i) => { if (!where || where(i)) n++; }, value: () => n };
      };
    case "countDistinct": {
      const col = column(table, m.field);
      return () => {
        const seen = new Set<string | number>();
        return {
          add: (i) => {
            if (where && !where(i)) return;
            const v = col.kind === "cat" ? col.codes[i] : stringAt(col, i);
            if (v !== 0 && v !== "") seen.add(v);
          },
          value: () => seen.size,
        };
      };
    }
    case "sum": {
      const col = column(table, m.field);
      return () => {
        let s = 0;
        return {
          add: (i) => {
            if (where && !where(i)) return;
            const v = numberAt(col, i);
            if (Number.isFinite(v)) s += v;
          },
          value: () => s,
        };
      };
    }
    case "avg": {
      const col = column(table, m.field);
      return () => {
        let s = 0;
        let n = 0;
        return {
          add: (i) => {
            if (where && !where(i)) return;
            const v = numberAt(col, i);
            if (Number.isFinite(v)) {
              s += v;
              n++;
            }
          },
          value: () => (n ? s / n : null),
        };
      };
    }
    case "ratio": {
      const num = compilePredicate(table, m.num);
      const den = m.den ? compilePredicate(table, m.den) : null;
      return () => {
        let a = 0;
        let b = 0;
        return {
          add: (i) => {
            if (den && !den(i)) return;
            b++;
            if (num(i)) a++;
          },
          value: () => (b ? a / b : null),
        };
      };
    }
    case "ratioOf": {
      const fa = accFactory(table, m.num);
      const fb = accFactory(table, m.den);
      return () => {
        const a = fa();
        const b = fb();
        return {
          add: (i) => {
            a.add(i);
            b.add(i);
          },
          value: () => {
            const x = a.value();
            const y = b.value();
            return x !== null && y ? x / y : null;
          },
        };
      };
    }
  }
}

export function measureOver(table: Table, rows: Uint32Array, m?: Measure): number | null {
  const acc = accFactory(table, m)();
  for (let k = 0; k < rows.length; k++) acc.add(rows[k]);
  return acc.value();
}

/** Clave de agrupación estable para una columna. */
export function keyReader(col: Column): (i: number) => string {
  if (col.kind === "cat") return (i) => col.dict[col.codes[i]];
  if (col.kind === "text") return (i) => col.values[i];
  return (i) => {
    const v = col.values[i];
    return Number.isNaN(v) ? "" : String(v);
  };
}
