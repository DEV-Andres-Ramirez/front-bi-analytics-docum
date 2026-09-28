/**
 * Red de seguridad del rediseño:
 * 1) Ninguna métrica se pierde: ids de KPIs, widgets y columnas ⊇ línea base congelada,
 *    y la definición de cada KPI/widget (medida, dimensión, filtros) es idéntica.
 * 2) El layout de cada tablero es válido (validateLayout sin errores).
 */
import { describe, expect, it } from "vitest";
import { kpiSignature, widgetSignature } from "@/test/signatures";
import baseline from "./baseline.json";
import { validateLayout } from "./layout";
import { SPECS } from "./specs";

type Baseline = Record<string, { kpis: string[]; widgets: string[]; columns: string[]; kpiSig: Record<string, string>; widgetSig: Record<string, string> }>;
const BASE = baseline as Baseline;

describe.each(Object.keys(BASE))("%s", (slug) => {
  const spec = SPECS[slug];
  const base = BASE[slug];

  it("conserva todos los KPIs con la misma definición", () => {
    const ids = new Map(spec.kpis.map((k) => [k.id, k] as const));
    for (const id of base.kpis) {
      expect(ids.has(id), `KPI "${id}"`).toBe(true);
      expect(kpiSignature(ids.get(id)!), `definición del KPI "${id}"`).toBe(base.kpiSig[id]);
    }
  });

  it("conserva todos los widgets con la misma métrica", () => {
    const ws = new Map(spec.sections.flatMap((s) => s.widgets).map((w) => [w.id, w] as const));
    for (const id of base.widgets) {
      expect(ws.has(id), `widget "${id}"`).toBe(true);
      expect(widgetSignature(ws.get(id)!), `métrica del widget "${id}"`).toBe(base.widgetSig[id]);
    }
  });

  it("conserva todas las columnas de la tabla", () => {
    const cols = new Set(spec.table.columns.map((c) => c.field));
    for (const f of base.columns) expect(cols.has(f), `columna "${f}"`).toBe(true);
  });

  it("está migrado al sistema de filas (kpiLayout, rows, question, sin donas)", () => {
    expect(spec.kpiLayout, "kpiLayout").toBeDefined();
    expect(spec.unit, "unit").toBeDefined();
    for (const s of spec.sections) {
      expect(s.rows, `rows de la sección ${s.id}`).toBeDefined();
      expect(s.question, `question de la sección ${s.id}`).toBeTruthy();
      expect(s.nav, `nav de la sección ${s.id}`).toBeTruthy();
    }
    const donuts = spec.sections.flatMap((s) => s.widgets).filter((w) => w.type === "donut" && !w.viz);
    expect(donuts.map((w) => w.id), "widgets que siguen siendo donas").toEqual([]);
  });

  it("tiene un layout válido", () => {
    const errors = validateLayout(spec).filter((i) => i.level === "error");
    expect(errors.map((e) => `${e.where}: ${e.message}`)).toEqual([]);
  });
});
