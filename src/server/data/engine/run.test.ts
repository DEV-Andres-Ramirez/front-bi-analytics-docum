import { describe, expect, it } from "vitest";
import type { CategoryResult, FiltersState, MapResult, BarTableResult, TimeseriesResult } from "@/dashboards/dto";
import type { DashboardSpec } from "@/dashboards/types";
import { isoToMs } from "@/lib/dates";
import { TableBuilder, type RowValue, type Table } from "../table";
import { selectRows } from "./filter";
import { ownFilterFields, runDashboard, unitLabel } from "./run";

function table(rows: Record<string, RowValue>[]): Table {
  const b = new TableBuilder({ fecha: "date", canal: "cat", estado: "cat", oficina: "cat", __dpto: "cat", __mpio: "cat" });
  for (const r of rows) b.push(r);
  return b.build();
}
const times = (n: number, row: Record<string, RowValue>) => Array.from({ length: n }, () => ({ ...row }));
const day = (d: number) => isoToMs(`2026-09-${String(d).padStart(2, "0")}`);

const T = table([
  ...times(5, { fecha: day(2), canal: "Web", estado: "Abierto", oficina: "Norte", __dpto: "05", __mpio: "05001" }),
  ...times(3, { fecha: day(3), canal: "Web", estado: "Cerrado", oficina: "Sur", __dpto: "11", __mpio: "11001" }),
  ...times(4, { fecha: day(3), canal: "Mail", estado: "Cerrado", oficina: "Norte", __dpto: "05", __mpio: "05088" }),
  ...times(2, { fecha: day(4), canal: "No reporta", estado: "Abierto", oficina: "Sur", __dpto: "11", __mpio: "11001" }),
  // Fuera de rango
  ...times(7, { fecha: isoToMs("2026-08-20"), canal: "Web", estado: "Abierto", oficina: "Norte", __dpto: "05", __mpio: "05001" }),
]);

const SPEC: DashboardSpec = {
  slug: "prueba",
  dataset: "prueba",
  dateField: "fecha",
  dateLabel: "Fecha",
  unit: { singular: "radicado", plural: "radicados" },
  filters: [
    { field: "canal", label: "Canal", kind: "multi" },
    { field: "estado", label: "Estado", kind: "multi" },
  ],
  kpis: [{ id: "total", label: "Total", measure: { kind: "count" }, format: "int", polarity: "neutral", hint: "Conteo" }],
  sections: [
    {
      id: "s",
      widgets: [
        { id: "canales", type: "bar", title: "Canales", size: "md", orientation: "horizontal", dimension: "canal" },
        { id: "canales-dona", type: "donut", title: "Canales", size: "md", dimension: "canal" },
        { id: "canales-fijo", type: "bar", title: "Canales", size: "md", orientation: "horizontal", dimension: "canal", noCrossFilter: true },
        { id: "estados", type: "bar", title: "Estados", size: "md", orientation: "horizontal", dimension: "estado" },
        { id: "tabla", type: "bartable", title: "Canal × oficina", size: "md", columns: [{ field: "canal", label: "Canal" }, { field: "oficina", label: "Oficina" }], measureLabel: "N" },
        { id: "mapa", type: "map", title: "Mapa", size: "lg", geoLabel: "Departamento" },
        { id: "serie", type: "timeseries", title: "Serie", size: "lg" },
        { id: "canales-top", type: "bar", title: "Top canal", size: "md", orientation: "horizontal", dimension: "canal", topN: 1 },
      ],
    },
  ],
  table: { title: "Detalle", columns: [{ field: "canal", label: "Canal" }], searchFields: [], defaultSort: { field: "fecha", dir: "desc" } },
};

const filters = (eq: Record<string, string[]> = {}): FiltersState => ({ from: "2026-09-01", to: "2026-09-30", eq, text: {}, dates: {} });

describe("selectRows · skipFields", () => {
  it("ignora los filtros de los campos indicados (y conserva skipField por compatibilidad)", () => {
    const f = filters({ canal: ["Web"], estado: ["Cerrado"] });
    expect(selectRows(T, f, { dateField: "fecha" }).length).toBe(3);
    expect(selectRows(T, f, { dateField: "fecha", skipFields: ["canal"] }).length).toBe(7);
    expect(selectRows(T, f, { dateField: "fecha", skipField: "canal" }).length).toBe(7);
    expect(selectRows(T, f, { dateField: "fecha", skipFields: ["canal", "estado"] }).length).toBe(14);
  });
});

describe("runDashboard · filtrar es resaltar", () => {
  it("sin filtros: todo igual que antes", () => {
    const r = runDashboard(T, SPEC, filters(), "mock");
    const canales = r.widgets.canales as CategoryResult;
    expect(canales.labels).toEqual(["Web", "Mail", "No reporta"]);
    expect(canales.total).toBe(14);
  });

  it("el widget de origen conserva todas sus categorías; el resto se filtra", () => {
    const r = runDashboard(T, SPEC, filters({ canal: ["Web"] }), "mock");
    const canales = r.widgets.canales as CategoryResult;
    expect(canales.labels).toEqual(["Web", "Mail", "No reporta"]);
    expect(canales.values).toEqual([8, 4, 2]);
    expect((r.widgets["canales-dona"] as CategoryResult).labels).toHaveLength(3);
    // Sin filtro cruzado: se comporta como cualquier otro widget filtrado.
    expect((r.widgets["canales-fijo"] as CategoryResult).labels).toEqual(["Web"]);
    const estados = r.widgets.estados as CategoryResult;
    expect(estados.total).toBe(8);
    // bartable: su primera columna es la dimensión.
    const tabla = r.widgets.tabla as BarTableResult;
    expect(new Set(tabla.rows.map((x) => x.cells[0]))).toEqual(new Set(["Web", "Mail", "No reporta"]));
    // El mapa sí respeta el filtro de canal.
    expect((r.widgets.mapa as MapResult).total).toBe(8);
    expect(r.rowsInRange).toBe(8);
    expect(r.kpis[0].value).toBe(8);
  });

  it("con topN, lo seleccionado sigue visible en su widget", () => {
    const r = runDashboard(T, SPEC, filters({ canal: ["Mail"] }), "mock");
    const top = r.widgets["canales-top"] as CategoryResult;
    expect(top.labels).toEqual(["Web", "Mail"]);
    expect(top.rest).toEqual({ count: 1, value: 2 });
    expect((runDashboard(T, SPEC, filters(), "mock").widgets["canales-top"] as CategoryResult).labels).toEqual(["Web"]);
  });

  it("combinado con otro filtro, el widget de origen respeta los demás", () => {
    const r = runDashboard(T, SPEC, filters({ canal: ["Web"], estado: ["Cerrado"] }), "mock");
    expect((r.widgets.canales as CategoryResult).values).toEqual([4, 3]);
    expect((r.widgets.canales as CategoryResult).labels).toEqual(["Mail", "Web"]);
    expect((r.widgets.estados as CategoryResult).labels).toEqual(["Abierto", "Cerrado"]);
    expect((r.widgets.estados as CategoryResult).values).toEqual([5, 3]);
  });

  it("mapa: se calcula sin __dpto/__mpio cuando están filtrados", () => {
    const r = runDashboard(T, SPEC, filters({ __dpto: ["05"] }), "mock");
    const mapa = r.widgets.mapa as MapResult;
    expect(mapa.dptos.map((d) => d.code).sort()).toEqual(["05", "11"]);
    expect(mapa.total).toBe(14);
    expect((r.widgets.canales as CategoryResult).total).toBe(9);

    const m2 = runDashboard(T, SPEC, filters({ __dpto: ["05"], __mpio: ["05001"] }), "mock");
    expect((m2.widgets.mapa as MapResult).mpios.map((m) => m.code).sort()).toEqual(["05001", "05088", "11001"]);
    expect(m2.rowsInRange).toBe(5);
  });

  it("opciones facetadas: cada filtro sin su propio campo", () => {
    const r = runDashboard(T, SPEC, filters({ canal: ["Web"], estado: ["Cerrado"] }), "mock");
    expect(r.options.canal.map((o) => o.value)).toEqual(["Mail", "Web"]);
    expect(r.options.estado.map((o) => [o.value, o.count])).toEqual([
      ["Abierto", 5],
      ["Cerrado", 3],
    ]);
  });

  it("la serie por defecto se nombra con la unidad del tablero", () => {
    const r = runDashboard(T, SPEC, filters(), "mock");
    expect((r.widgets.serie as TimeseriesResult).series[0].label).toBe("Radicados");
    expect(unitLabel({})).toBe("Registros");
    expect(unitLabel({ unit: { singular: "tutela", plural: "tutelas" } })).toBe("Tutelas");
  });

  it("ownFilterFields", () => {
    const [canales, , fijo, , tabla, mapa, serie] = SPEC.sections[0].widgets;
    expect(ownFilterFields(canales)).toEqual(["canal"]);
    expect(ownFilterFields(fijo)).toEqual([]);
    expect(ownFilterFields(tabla)).toEqual(["canal"]);
    expect(ownFilterFields(mapa)).toEqual(["__dpto", "__mpio"]);
    expect(ownFilterFields(serie)).toEqual([]);
  });
});

describe("runDashboard · sparkBase (denominador por bucket de tasas y promedios)", () => {
  const b = new TableBuilder({ fecha: "date", canal: "cat", estado: "cat", dias: "num" });
  const rows: Record<string, RowValue>[] = [
    ...times(4, { fecha: day(2), canal: "Web", estado: "Abierto", dias: 3 }),
    { fecha: day(2), canal: "Mail", estado: "Abierto", dias: null },
    ...times(2, { fecha: day(3), canal: "Web", estado: "Cerrado", dias: 5 }),
    ...times(3, { fecha: day(3), canal: "Mail", estado: "Cerrado", dias: null }),
  ];
  for (const r of rows) b.push(r);
  const t = b.build();
  const spec: DashboardSpec = {
    ...SPEC,
    kpis: [
      { id: "total", label: "Total", measure: { kind: "count" }, format: "int", polarity: "neutral", hint: "" },
      { id: "web", label: "% Web", measure: { kind: "ratio", num: { field: "canal", in: ["Web"] } }, format: "pct", polarity: "neutral", hint: "" },
      { id: "web-cerr", label: "% Web de cerrados", measure: { kind: "ratio", num: { field: "canal", in: ["Web"] }, den: { field: "estado", in: ["Cerrado"] } }, format: "pct", polarity: "neutral", hint: "" },
      { id: "cociente", label: "Web / abiertos", measure: { kind: "ratioOf", num: { kind: "count", where: { field: "canal", in: ["Web"] } }, den: { kind: "count", where: { field: "estado", in: ["Abierto"] } } }, format: "pct", polarity: "neutral", hint: "" },
      { id: "dias", label: "Días", measure: { kind: "avg", field: "dias" }, format: "days", polarity: "up-bad", hint: "" },
    ],
    sections: [],
  };
  const r = runDashboard(t, spec, { from: "2026-09-01", to: "2026-09-04", eq: {}, text: {}, dates: {} }, "mock");
  const k = (id: string) => r.kpis.find((x) => x.id === id)!;

  it("conteos y sumas no la llevan", () => {
    expect(k("total").sparkBase).toBeUndefined();
  });

  it("ratio: filas del día (o de den), alineadas con el spark", () => {
    expect(k("web").sparkBase).toEqual([0, 5, 5, 0]);
    expect(k("web").spark).toHaveLength(4);
    expect(k("web-cerr").sparkBase).toEqual([0, 0, 5, 0]);
  });

  it("ratioOf: la medida den", () => {
    expect(k("cociente").sparkBase).toEqual([0, 5, 0, 0]);
  });

  it("avg: solo las filas con valor (las que promedia)", () => {
    expect(k("dias").sparkBase).toEqual([0, 4, 2, 0]);
    expect(k("dias").spark[1]).toBe(3);
  });
});
