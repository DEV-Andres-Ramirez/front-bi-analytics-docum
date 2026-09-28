import { describe, expect, it } from "vitest";
import { DPTO_BBOX, DPTO_LABEL, MAINLAND, SAN_ANDRES_RING } from "@/lib/geo/bounds";
import { classify, classLabel, geoPhrase, panelTitle, pluralArticle } from "./classify";

describe("classify (clases del mapa)", () => {
  it("sin valores positivos no hay clases y todo es 'sin registros'", () => {
    const c = classify([0, 0]);
    expect(c.classes).toHaveLength(0);
    expect(c.classOf(0)).toBe(-1);
  });

  it("con ≤ 5 valores distintos usa una clase por valor, repartidas en la rampa", () => {
    const c = classify([1, 1, 2, 11, 0]);
    expect(c.classes.map((k) => [k.min, k.max])).toEqual([
      [1, 1],
      [2, 2],
      [11, 11],
    ]);
    expect(c.classes.map((k) => k.ramp)).toEqual([0, 2, 4]);
    expect(c.classOf(0)).toBe(-1);
    expect(c.classOf(11)).toBe(2);
  });

  it("con más valores usa 5 cuantiles con rangos reales y el máximo en la clase más intensa", () => {
    const values = [516, 53, 50, 46, 37, 34, 32, 25, 20, 13, 13, 13, 12, 12, 12, 10, 10, 10, 10, 10, 9, 6, 5, 4, 4, 3, 3, 3, 3, 2, 2, 1, 1];
    const c = classify(values);
    expect(c.classes).toHaveLength(5);
    expect(c.classes.map((k) => k.ramp)).toEqual([0, 1, 2, 3, 4]);
    expect(c.classes[4].max).toBe(516);
    expect(c.classes[0].min).toBe(1);
    // Las clases no se solapan y cubren todos los valores positivos
    for (let i = 1; i < c.classes.length; i++) expect(c.classes[i].min).toBeGreaterThan(c.classes[i - 1].max);
    expect(c.classes.reduce((s, k) => s + k.count, 0)).toBe(values.length);
    expect(classLabel(c.classes[4])).toMatch(/^\d+–516$/);
  });
});

describe("lenguaje del panel", () => {
  it("nombra la geografía con el artículo correcto", () => {
    expect(geoPhrase("remitente")).toBe("del remitente");
    expect(geoPhrase("consumidor financiero")).toBe("del consumidor financiero");
    expect(geoPhrase("tutela")).toBe("de la tutela");
    expect(pluralArticle("quejas")).toBe("las");
    expect(pluralArticle("radicados")).toBe("los");
  });

  it("título con la geografía explícita", () => {
    expect(panelTitle({ singular: "radicado", plural: "radicados" }, "remitente", "dpto").title).toBe("Radicados por departamento del remitente");
    const t = panelTitle({ singular: "tutela", plural: "tutelas" }, "tutela", "dpto");
    expect(t.title).toBe("Tutelas por departamento");
    expect(t.geo).toBe("Territorio de la tutela");
  });
});

describe("bounds.ts (generado por build-geo)", () => {
  it("tiene caja y punto de etiqueta para los 33 departamentos, dentro de su caja", () => {
    expect(Object.keys(DPTO_BBOX)).toHaveLength(33);
    for (const [code, [x, y]] of Object.entries(DPTO_LABEL)) {
      const [w, s, e, n] = DPTO_BBOX[code];
      expect(x).toBeGreaterThanOrEqual(w - 0.01);
      expect(x).toBeLessThanOrEqual(e + 0.01);
      expect(y).toBeGreaterThanOrEqual(s - 0.01);
      expect(y).toBeLessThanOrEqual(n + 0.01);
    }
    expect(MAINLAND).toEqual([-79.1, -4.3, -66.8, 12.5]);
    expect(SAN_ANDRES_RING.length).toBeGreaterThan(20);
  });
});
