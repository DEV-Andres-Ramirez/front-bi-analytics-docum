import { describe, expect, it } from "vitest";
import type { KpiResult } from "@/dashboards/dto";
import type { KpiDef } from "@/dashboards/types";
import { resampleSpark, sparkWeights } from "./shared";

const rate: KpiDef = { id: "pct", label: "% Web", measure: { kind: "ratio", num: { field: "canal", in: ["Web"] } }, format: "pct", polarity: "neutral", hint: "" };
const cociente: KpiDef = { id: "q", label: "Cociente", measure: { kind: "ratioOf", num: { kind: "count" }, den: { kind: "count" } }, format: "pct", polarity: "neutral", hint: "" };
const total: KpiDef = { id: "total", label: "Total", measure: { kind: "count" }, format: "int", polarity: "neutral", hint: "" };
const result = (id: string, spark: (number | null)[], sparkBase?: (number | null)[]): KpiResult => ({ id, value: null, previous: null, delta: null, spark, ...(sparkBase ? { sparkBase } : {}) });

describe("micro-tendencia de tasas · sparkBase", () => {
  it("usa la base del motor antes que el conteo hermano (y la de ratioOf, que no tiene hermano)", () => {
    const own = [1, 2, 3];
    expect(sparkWeights(rate, result("pct", [0.1, 0.2, 0.3], own), [rate, total], [result("total", [9, 9, 9])])).toBe(own);
    expect(sparkWeights(cociente, result("q", [0.5, 0.5, 0.5], own), [cociente], [])).toBe(own);
    // Sin sparkBase: ratio sin den → conteo hermano sin filtro; ratioOf → sin base
    expect(sparkWeights(rate, result("pct", [0.1]), [rate, total], [result("total", [9])])).toEqual([9]);
    expect(sparkWeights(cociente, result("q", [0.5]), [cociente], [])).toBeUndefined();
  });

  it("pondera la semana por su base: Σ(valor·base) / Σbase, no el promedio de los % diarios", () => {
    // 2026-09-07 es lunes: 14 días = 2 semanas de calendario completas
    const range = { from: "2026-09-07", to: "2026-09-20" };
    // Semana 1: un día con 100 % sobre 2 filas y seis días con 10 % sobre 50 → 12 / 302 ≈ 4 % (el promedio simple daría ≈ 22,9 %)
    // Semana 2: días sin dato (fuerza el remuestreo semanal: > 25 % de huecos)
    const spark = [1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, null, null, null, null, null, null, 0.2];
    const base = [2, 50, 50, 50, 50, 50, 50, 0, 0, 0, 0, 0, 0, 10];
    const m = resampleSpark(spark, "line", range, { additive: false, weights: base });
    expect(m.weekly).toBe(true);
    expect(m.values).toHaveLength(2);
    expect(m.values[0]).toBeCloseTo((1 * 2 + 0.1 * 300) / 302, 6);
    expect(m.values[1]).toBeCloseTo(0.2, 6);
  });

  it("los días con base chica son hueco y, sin base, una tasa semanal no se dibuja", () => {
    const range = { from: "2026-09-07", to: "2026-09-20" };
    const spark = Array.from({ length: 14 }, (_, i) => (i % 2 ? 0.5 : 0.1));
    const base = Array.from({ length: 14 }, (_, i) => (i % 2 ? 2 : 40));
    const daily = resampleSpark(spark, "line", range, { additive: false, weights: base });
    // Los días de base 2 (< 5) quedan como hueco → > 25 % de huecos → semanal, ponderado por la base de cada día
    expect(daily.weekly).toBe(true);
    expect(daily.values[0]).toBeCloseTo((0.1 * 40 * 4 + 0.5 * 2 * 3) / (40 * 4 + 2 * 3), 6);
    expect(daily.values[1]).toBeCloseTo((0.1 * 40 * 3 + 0.5 * 2 * 4) / (40 * 3 + 2 * 4), 6);
    const noBase = resampleSpark([...spark.slice(0, 10), null, null, null, null], "line", range, { additive: false });
    expect(noBase.values).toEqual([]);
  });
});
