import { describe, expect, it } from "vitest";
import type { BarWidget, BarTableWidget, DonutWidget, DrilldownWidget, PivotWidget } from "@/dashboards/types";
import { isoToMs } from "@/lib/dates";
import { TableBuilder, type RowValue, type Table } from "../table";
import { barTableResult, categoryResult, drilldownResult, fillNumeric, neutralsLast, orderLabels, OTROS, pivotResult } from "./aggregate";

const DIAS = ["1. Lunes", "2. Martes", "3. Miércoles", "4. Jueves", "5. Viernes", "6. Sábado", "7. Domingo"];

function table(rows: Record<string, RowValue>[]): Table {
  const b = new TableBuilder({ canal: "cat", oficina: "cat", estado: "cat", dia: "cat", hora: "num", valor: "num", fecha: "date" });
  for (const r of rows) b.push({ fecha: isoToMs("2026-09-01"), ...r });
  return b.build();
}

/** n filas iguales. */
const times = (n: number, row: Record<string, RowValue>) => Array.from({ length: n }, () => ({ ...row }));
const all = (t: Table) => Uint32Array.from({ length: t.n }, (_, i) => i);

describe("orderLabels: neutrales al final", () => {
  it("deja 'No reporta' al final aunque sea el mayor y 'Otros' de último", () => {
    const out = orderLabels([
      ["No reporta", 50],
      [OTROS, 40],
      ["Web", 30],
      ["Sin categoría", 25],
      ["Mail", 20],
    ]);
    expect(out.map((e) => e[0])).toEqual(["Web", "Mail", "No reporta", "Sin categoría", OTROS]);
  });

  it("respeta la posición de un neutral declarado en el orden natural", () => {
    const order = ["1. Cerrado a Tiempo", "6. Sin Clasificar", "2. Abierto en Término"];
    const out = orderLabels(
      [
        ["2. Abierto en Término", 5],
        ["6. Sin Clasificar", 9],
        ["No reporta", 7],
        ["1. Cerrado a Tiempo", 3],
        ["Extra", 1],
      ],
      "natural",
      order,
    );
    // Declarados en su orden → no declarados → neutrales no declarados al final.
    expect(out.map((e) => e[0])).toEqual(["1. Cerrado a Tiempo", "6. Sin Clasificar", "2. Abierto en Término", "Extra", "No reporta"]);
  });

  it("aplica también a los órdenes por etiqueta y ascendente", () => {
    expect(orderLabels([["No reporta", 1], ["Yb", 3], ["Xa", 2]], "label").map((e) => e[0])).toEqual(["Xa", "Yb", "No reporta"]);
    expect(orderLabels([["No reporta", 1], ["B", 3], ["A", 2]], "asc").map((e) => e[0])).toEqual(["A", "B", "No reporta"]);
  });

  it("neutralsLast conserva el orden relativo", () => {
    expect(neutralsLast(["Otros", "a", "No reporta", "b", "Sin responsable asignado"], (x) => x)).toEqual([
      "a",
      "b",
      "No reporta",
      "Sin responsable asignado",
      "Otros",
    ]);
  });
});

describe("categoryResult", () => {
  const t = table([
    ...times(10, { canal: "No reporta", valor: 1 }),
    ...times(6, { canal: "Web", valor: 2 }),
    ...times(4, { canal: "Mail", valor: 3 }),
    ...times(3, { canal: "Ventanilla", valor: 4 }),
    ...times(2, { canal: "Chat", valor: 5 }),
  ]);
  const base: BarWidget = { id: "c", type: "bar", title: "Canales", size: "md", orientation: "horizontal", dimension: "canal" };

  it("topN sin others y medida aditiva → rest {count, value}; el neutral grande se conserva al final", () => {
    const r = categoryResult(t, all(t), { ...base, topN: 3 });
    expect(r.labels).toEqual(["Web", "Mail", "No reporta"]);
    expect(r.values).toEqual([6, 4, 10]);
    expect(r.rest).toEqual({ count: 2, value: 5 });
    expect(r.folded).toBe(2);
    expect(r.total).toBe(25);
  });

  it("rest con suma", () => {
    const r = categoryResult(t, all(t), { ...base, topN: 2, measure: { kind: "sum", field: "valor" } });
    // sumas: No reporta 10 · Web 12 · Mail 12 · Ventanilla 12 · Chat 10
    expect(r.labels).toHaveLength(2);
    expect(r.rest?.count).toBe(3);
    expect(r.values.reduce((a, b) => a + b, 0) + r.rest!.value).toBe(r.total);
  });

  it("sin rest cuando agrupa en 'Otros', cuando no hay recorte o cuando la medida no es aditiva", () => {
    const withOthers = categoryResult(t, all(t), { ...base, topN: 3, others: true });
    expect(withOthers.rest).toBeUndefined();
    expect(withOthers.labels.at(-1)).toBe(OTROS);
    expect(withOthers.values.at(-1)).toBe(9);

    expect(categoryResult(t, all(t), { ...base, topN: 10 }).rest).toBeUndefined();
    expect(categoryResult(t, all(t), { ...base, topN: 2, measure: { kind: "avg", field: "valor" } }).rest).toBeUndefined();
  });

  it("lo seleccionado en la propia dimensión sigue visible aunque quede fuera del topN", () => {
    const r = categoryResult(t, all(t), { ...base, topN: 3 }, ["Chat"]);
    expect(r.labels).toEqual(["Web", "Mail", "Chat", "No reporta"]);
    expect(r.rest).toEqual({ count: 1, value: 3 });
    // Con others, topN 3 = 2 visibles + "Otros". Por etiqueta: Chat, Mail | No reporta, Ventanilla, Web.
    const withOthers = categoryResult(t, all(t), { ...base, topN: 3, others: true, sort: "label" }, ["Web"]);
    expect(withOthers.labels).toEqual(["Chat", "Mail", "Web", OTROS]);
    expect(withOthers.values).toEqual([2, 4, 6, 13]);
    expect(withOthers.folded).toBe(2);
  });

  it("dona: 'Otros' al final, después de los neutrales", () => {
    const donut: DonutWidget = { id: "d", type: "donut", title: "Canales", size: "md", dimension: "canal", maxSlices: 4 };
    const r = categoryResult(t, all(t), donut);
    expect(r.labels).toEqual(["Web", "Mail", "No reporta", OTROS]);
    expect(r.values).toEqual([6, 4, 10, 5]);
    expect(r.rest).toBeUndefined();
  });
});

describe("pivotResult", () => {
  const t = table([
    ...times(3, { dia: "2. Martes", hora: 8, estado: "Abierto" }),
    ...times(2, { dia: "2. Martes", hora: 11, estado: "Cerrado" }),
    ...times(4, { dia: "5. Viernes", hora: 9, estado: "No reporta" }),
    ...times(1, { dia: "1. Lunes", hora: 14, estado: "Abierto" }),
  ]);

  it("dia-hora: rowOrder + stableRows muestra los 7 días en orden y fillNumericColumns rellena las horas", () => {
    const w: PivotWidget = {
      id: "dia-hora",
      type: "pivot",
      title: "Día × hora",
      size: "lg",
      rows: [{ field: "dia", label: "Día" }],
      columns: { field: "hora", label: "Hora" },
      rowOrder: DIAS,
      stableRows: true,
      fillNumericColumns: true,
    };
    const r = pivotResult(t, all(t), w);
    expect(r.rows.map((x) => x.label)).toEqual(DIAS);
    expect(r.columns).toEqual(["8", "9", "10", "11", "12", "13", "14"]);
    const martes = r.rows.find((x) => x.label === "2. Martes")!;
    expect(martes.values).toEqual([3, 0, 0, 2, 0, 0, 0]);
    expect(martes.total).toBe(5);
    const domingo = r.rows.find((x) => x.label === "7. Domingo")!;
    expect(domingo.values.every((v) => v === 0)).toBe(true);
    expect(r.totals).toEqual([3, 4, 0, 2, 0, 0, 1]);
    expect(r.max).toBe(4);
    expect(r.truncated).toBe(0);
  });

  it("rowOrder sin stableRows ordena pero no agrega filas vacías", () => {
    const r = pivotResult(t, all(t), {
      id: "p",
      type: "pivot",
      title: "p",
      size: "lg",
      rows: [{ field: "dia", label: "Día" }],
      columns: { field: "estado", label: "Estado" },
      rowOrder: DIAS,
    });
    expect(r.rows.map((x) => x.label)).toEqual(["1. Lunes", "2. Martes", "5. Viernes"]);
  });

  it("stableColumns mantiene columnas en 0 y los neutrales van al final", () => {
    const r = pivotResult(t, all(t), {
      id: "p",
      type: "pivot",
      title: "p",
      size: "lg",
      rows: [{ field: "dia", label: "Día" }],
      columns: { field: "estado", label: "Estado" },
      stableColumns: ["Vencido"],
    });
    expect(r.columns).toEqual(["Abierto", "Cerrado", "Vencido", "No reporta"]);
    expect(r.totals).toEqual([4, 2, 0, 4]);
    for (const row of r.rows) expect(row.values).toHaveLength(4);
  });

  it("columnas excluidas no vuelven con stableColumns", () => {
    const r = pivotResult(t, all(t), {
      id: "p",
      type: "pivot",
      title: "p",
      size: "lg",
      rows: [{ field: "dia", label: "Día" }],
      columns: { field: "estado", label: "Estado" },
      columnExclude: ["Vencido", "No reporta"],
      stableColumns: ["Vencido"],
    });
    expect(r.columns).toEqual(["Abierto", "Cerrado"]);
  });

  it("dos niveles: grupos por rowOrder y filas neutrales al final de su grupo", () => {
    const t2 = table([
      ...times(5, { oficina: "Norte", estado: "Sin responsable asignado" }),
      ...times(2, { oficina: "Norte", estado: "Ana" }),
      ...times(1, { oficina: "Sur", estado: "Luis" }),
      ...times(9, { oficina: "No reporta", estado: "Eva" }),
    ]);
    const r = pivotResult(t2, all(t2), {
      id: "p",
      type: "pivot",
      title: "p",
      size: "lg",
      rows: [
        { field: "oficina", label: "Oficina" },
        { field: "estado", label: "Persona" },
      ],
      columns: { field: "canal", label: "Canal" },
      rowOrder: ["Sur", "Norte"],
    });
    expect(r.rows.map((x) => `${x.group}/${x.label}`)).toEqual(["Sur/Luis", "Norte/Ana", "Norte/Sin responsable asignado", "No reporta/Eva"]);
  });
});

describe("fillNumeric", () => {
  it("rellena huecos enteros, ordena numéricamente y deja lo no numérico al final", () => {
    expect(fillNumeric(["10", "No reporta", "7", "9"])).toEqual(["7", "8", "9", "10", "No reporta"]);
  });
  it("conserva el relleno con ceros de la fuente", () => {
    expect(fillNumeric(["07", "10"])).toEqual(["07", "08", "09", "10"]);
  });
  it("no vuelve a agregar valores excluidos", () => {
    expect(fillNumeric(["1", "4"], new Set(["3"]))).toEqual(["1", "2", "4"]);
  });
  it("decimales: solo ordena", () => {
    expect(fillNumeric(["2.5", "1.5"])).toEqual(["1.5", "2.5"]);
  });
});

describe("bartable y drilldown: neutrales al final", () => {
  const t = table([
    ...times(9, { oficina: "No reporta", estado: "A" }),
    ...times(5, { oficina: "Norte", estado: "A" }),
    ...times(3, { oficina: "Sur", estado: "B" }),
  ]);

  it("bartable: topN por valor y la fila neutral al final", () => {
    const w: BarTableWidget = { id: "b", type: "bartable", title: "b", size: "md", columns: [{ field: "oficina", label: "Oficina" }], measureLabel: "N" };
    const r = barTableResult(t, all(t), w);
    expect(r.rows.map((x) => x.cells[0])).toEqual(["Norte", "Sur", "No reporta"]);
    expect(r.total).toBe(17);
  });

  it("bartable: restCount = combinaciones fuera del topN (solo si hay resto)", () => {
    const base: BarTableWidget = { id: "b", type: "bartable", title: "b", size: "md", columns: [{ field: "oficina", label: "Oficina" }], measureLabel: "N" };
    const top2 = barTableResult(t, all(t), { ...base, topN: 2 });
    expect(top2.rows).toHaveLength(2);
    expect(top2.restCount).toBe(1);
    // El total sigue siendo el de todas las combinaciones
    expect(top2.total).toBe(17);
    expect(barTableResult(t, all(t), base).restCount).toBeUndefined();
    // Dos columnas: cada combinación cuenta (No reporta·A, Norte·A, Sur·B)
    const pairs = barTableResult(t, all(t), { ...base, columns: [...base.columns, { field: "estado", label: "Estado" }], topN: 1 });
    expect(pairs.restCount).toBe(2);
  });

  it("drilldown: neutral al final y 'Otros' de último", () => {
    const w: DrilldownWidget = { id: "d", type: "drilldown", title: "d", size: "md", levels: [{ field: "oficina", label: "Oficina" }], topN: 2 };
    const r = drilldownResult(t, all(t), w);
    expect(r.nodes.map((n) => n.label)).toEqual(["Norte", "No reporta", OTROS]);
  });
});
