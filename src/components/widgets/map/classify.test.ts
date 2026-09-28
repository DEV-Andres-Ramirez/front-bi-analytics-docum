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
    // El máximo suma el 40 % (sin concentración extrema): va en una clase con otros valores
    const values = [316, 53, 50, 46, 37, 34, 32, 25, 20, 13, 13, 13, 12, 12, 12, 10, 10, 10, 10, 10, 9, 6, 5, 4, 4, 3, 3, 3, 3, 2, 2, 1, 1];
    const c = classify(values);
    expect(c.classes).toHaveLength(5);
    expect(c.classes.map((k) => k.ramp)).toEqual([0, 1, 2, 3, 4]);
    expect(c.classes[4].max).toBe(316);
    expect(c.classes[0].min).toBe(1);
    // Las clases no se solapan y cubren todos los valores positivos
    for (let i = 1; i < c.classes.length; i++) expect(c.classes[i].min).toBeGreaterThan(c.classes[i - 1].max);
    expect(c.classes.reduce((s, k) => s + k.count, 0)).toBe(values.length);
    expect(classLabel(c.classes[4])).toMatch(/^\d+–316$/);
    expect(c.classes.some((k) => k.dominant)).toBe(false);
    expect(c.method).toBe("quantile");
  });

  it("con concentración extrema (> 50 %), aísla el máximo en la clase más intensa y reparte el resto en seq-2…5", () => {
    // Caso SMART 1: Bogotá 119 de 152 (78 %); con cuantiles, Valle (8) caía en la 4.ª clase junto al foco
    const values = [119, 8, 4, 3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const c = classify(values);
    expect(c.method).toBe("quantile");
    expect(c.classes).toHaveLength(5);
    expect(c.classes[4]).toMatchObject({ min: 119, max: 119, count: 1, ramp: 4, dominant: true });
    expect(c.classes.slice(0, 4).map((k) => k.ramp)).toEqual([0, 1, 2, 3]);
    expect(c.classes.slice(0, 4).every((k) => !k.dominant)).toBe(true);
    expect(c.classes[3].max).toBe(8);
    expect(c.classes.reduce((s, k) => s + k.count, 0)).toBe(values.length);
    // Con una clase por valor el máximo ya va solo: se marca, sin mover la rampa
    const u = classify([11, 2, 1, 1]);
    expect(u.method).toBe("unique");
    expect(u.classes.map((k) => k.ramp)).toEqual([0, 2, 4]);
    expect(u.classes[2].dominant).toBe(true);
  });

  it("con empates que colapsan los cuantiles, corta sobre los valores distintos (siempre 5 clases)", () => {
    // Caso Tutelas: los cuantiles por fila daban 1 · 2 · 3–5 · 9–475 (cuatro clases, el máximo junto a 9)
    const values = [475, 161, 12, 9, 5, 4, 3, 3, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const c = classify(values);
    expect(c.method).toBe("quantile");
    expect(c.classes.map((k) => classLabel(k))).toEqual(["1–2", "3–4", "5–9", "12–161", "475"]);
    expect(c.classes.map((k) => k.ramp)).toEqual([0, 1, 2, 3, 4]);
    expect(c.classes.reduce((s, k) => s + k.count, 0)).toBe(values.length);
    expect(c.classOf(9)).toBe(2);
    expect(c.classOf(475)).toBe(4);
  });

  it("expone el método real: una clase por valor solo con ≤ 5 valores distintos", () => {
    expect(classify([1, 1, 2, 11, 0]).method).toBe("unique");
    expect(classify([0]).method).toBeNull();
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
    expect(t.geo).toBeNull();
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
