import "server-only";

/**
 * Tabla columnar en memoria (MockProvider). Las categóricas se codifican con
 * diccionario (Uint32Array), números y fechas en Float64Array (NaN = nulo).
 * Las fechas son milisegundos "de pared" de Bogotá (ver src/lib/dates.ts).
 */
export type ColumnKind = "cat" | "num" | "date" | "text";

export interface CatColumn {
  kind: "cat";
  dict: string[];
  codes: Uint32Array;
  index: Map<string, number>;
}
export interface NumColumn {
  kind: "num" | "date";
  values: Float64Array;
}
export interface TextColumn {
  kind: "text";
  values: string[];
}
export type Column = CatColumn | NumColumn | TextColumn;

export interface Table {
  n: number;
  cols: Map<string, Column>;
}

export type RowValue = string | number | null | undefined;

export class TableBuilder {
  private n = 0;
  private cat = new Map<string, { dict: string[]; index: Map<string, number>; codes: number[] }>();
  private num = new Map<string, { kind: "num" | "date"; values: number[] }>();
  private text = new Map<string, string[]>();

  constructor(private schema: Record<string, ColumnKind>) {
    for (const [name, kind] of Object.entries(schema)) {
      if (kind === "cat") this.cat.set(name, { dict: [""], index: new Map([["", 0]]), codes: [] });
      else if (kind === "text") this.text.set(name, []);
      else this.num.set(name, { kind, values: [] });
    }
  }

  push(row: Record<string, RowValue>) {
    for (const [name, c] of this.cat) {
      const raw = row[name];
      const v = raw === null || raw === undefined ? "" : String(raw);
      let code = c.index.get(v);
      if (code === undefined) {
        code = c.dict.length;
        c.dict.push(v);
        c.index.set(v, code);
      }
      c.codes.push(code);
    }
    for (const [name, c] of this.num) {
      const raw = row[name];
      c.values.push(typeof raw === "number" && Number.isFinite(raw) ? raw : NaN);
    }
    for (const [name, values] of this.text) {
      const raw = row[name];
      values.push(raw === null || raw === undefined ? "" : String(raw));
    }
    this.n++;
  }

  build(): Table {
    const cols = new Map<string, Column>();
    for (const [name, c] of this.cat) cols.set(name, { kind: "cat", dict: c.dict, codes: Uint32Array.from(c.codes), index: c.index });
    for (const [name, c] of this.num) cols.set(name, { kind: c.kind, values: Float64Array.from(c.values) });
    for (const [name, values] of this.text) cols.set(name, { kind: "text", values });
    return { n: this.n, cols };
  }
}

export function column(table: Table, field: string): Column {
  const col = table.cols.get(field);
  if (!col) throw new Error(`Columna inexistente: ${field}`);
  return col;
}

export function hasColumn(table: Table, field: string) {
  return table.cols.has(field);
}

/** Valor como texto (categorías y textos) o número formateado. */
export function stringAt(col: Column, i: number): string {
  if (col.kind === "cat") return col.dict[col.codes[i]];
  if (col.kind === "text") return col.values[i];
  const v = col.values[i];
  return Number.isNaN(v) ? "" : String(v);
}

export function numberAt(col: Column, i: number): number {
  if (col.kind === "num" || col.kind === "date") return col.values[i];
  const s = stringAt(col, i);
  const n = s === "" ? NaN : Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function rawAt(col: Column, i: number): string | number | null {
  if (col.kind === "num" || col.kind === "date") {
    const v = col.values[i];
    return Number.isNaN(v) ? null : v;
  }
  const s = stringAt(col, i);
  return s === "" ? null : s;
}
