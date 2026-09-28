import { describe, expect, it } from "vitest";
import { DASHBOARD_BY_SLUG } from "@/config/dashboards";
import type { CatalogFigure, CatalogItem } from "@/dashboards/dto";
import { compactRange, computePulse, daysInMonthOf, figureShort, greetingFor, healthNote, heroShort, isWeekend, matchesQuery, nowBogotaHour } from "./home-data";

function fig(partial: Partial<CatalogFigure>): CatalogFigure {
  return { kpi: "k", label: "K", format: "pct", polarity: "up-good", value: 0.5, previous: 0.5, spark: [], ...partial };
}

describe("home-data", () => {
  it("saluda según la hora de Bogotá (UTC−5)", () => {
    expect(nowBogotaHour(Date.UTC(2026, 8, 28, 14, 10))).toBe(9);
    expect(nowBogotaHour(Date.UTC(2026, 8, 29, 2, 0))).toBe(21);
    expect(greetingFor(9)).toBe("Buenos días");
    expect(greetingFor(12)).toBe("Buenas tardes");
    expect(greetingFor(19)).toBe("Buenas noches");
    expect(greetingFor(3)).toBe("Buenas noches");
  });

  it("formatea rangos compactos", () => {
    expect(compactRange("2026-08-04", "2026-08-31")).toBe("4 – 31 ago");
    expect(compactRange("2026-08-04", "2026-09-03")).toBe("4 ago – 3 sept");
    expect(compactRange("2025-12-20", "2026-01-03")).toBe("20 dic 2025 – 3 ene 2026");
  });

  it("calcula casillas y fines de semana del mes", () => {
    expect(daysInMonthOf("2026-09-01")).toBe(30);
    expect(daysInMonthOf("2026-02-01")).toBe(28);
    // 2026-09-05 es sábado y 2026-09-07 lunes
    expect(isWeekend("2026-09-01", 4)).toBe(true);
    expect(isWeekend("2026-09-01", 6)).toBe(false);
  });

  it("busca por palabras sin tildes en título, módulo, etiquetas y capacidades", () => {
    expect(matchesQuery(DASHBOARD_BY_SLUG["tutelas"], "tutela")).toBe(true);
    expect(matchesQuery(DASHBOARD_BY_SLUG["pqrd"], "SLÁ mapa")).toBe(true);
    expect(matchesQuery(DASHBOARD_BY_SLUG["correspondencia-salidas"], "sealmail")).toBe(true);
    expect(matchesQuery(DASHBOARD_BY_SLUG["facturas-recibidas"], "tutelas")).toBe(false);
    expect(matchesQuery(DASHBOARD_BY_SLUG["facturas-recibidas"], "  ")).toBe(true);
  });

  it("nombre corto de salud: alias de presentación, short del spec o etiqueta, siempre sin '%'", () => {
    expect(figureShort("pqrd", fig({ kpi: "sla", label: "% Cumplimiento SLA", short: "% SLA" }))).toBe("SLA");
    expect(figureShort("x", fig({ kpi: "otro", label: "% Algo largo", short: "% Algo" }))).toBe("Algo");
    expect(figureShort("x", fig({ kpi: "otro", label: "% Algo" }))).toBe("Algo");
    expect(figureShort("correspondencia-salidas", fig({ kpi: "digital", label: "% Canal digital", short: "% Digital" }))).toBe("Canal digital");
  });

  it("etiqueta de la cifra titular: no repite el título y los hermanos se leen igual", () => {
    expect(heroShort("tutelas", fig({ label: "Tutelas" }))).toBe("Tutelas en el mes");
    expect(heroShort("pqrd", fig({ label: "Cantidad de radicados" }))).toBe(heroShort("entes-control", fig({ label: "Radicados" })));
    expect(heroShort("medicina-laboral-salidas", null)).toBe(heroShort("correspondencia-salidas", null));
    expect(heroShort("desconocido", fig({ label: "Otra" }))).toBe("Otra");
    expect(heroShort("desconocido", null)).toBe("Cifra del mes");
  });

  it("nota de calidad solo para hallazgos documentados mientras persiste el síntoma", () => {
    expect(healthNote("smart-momento-1", fig({ kpi: "cruce", value: 0, previous: 0 }))?.kind).toBe("quality");
    expect(healthNote("smart-momento-1", fig({ kpi: "cruce", value: 0.42, previous: 0.4 }))).toBeNull();
    expect(healthNote("smart-momento-2", fig({ kpi: "transmitido", value: 1, previous: 1 }))?.kind).toBe("info");
    // Un 0 % legítimo (sin inconsistencias) no es un problema de calidad.
    expect(healthNote("facturas-emitidas", fig({ kpi: "inconsistentes", value: 0, previous: 0 }))).toBeNull();
  });

  it("pulso: top 3 que más empeoraron, sin polaridad neutral, con bases pequeñas y variaciones menores como estables", () => {
    const items: CatalogItem[] = [
      { slug: "facturas-recibidas", hero: null, health: fig({ polarity: "neutral", value: 10, previous: 1, format: "cop" }) },
      { slug: "pqrd", hero: null, health: fig({ value: 0.6, previous: 0.7 }) }, // −10 p.p. → empeora
      { slug: "entes-control", hero: null, health: fig({ value: 0.5, previous: 0.7 }) }, // −20 p.p. → empeora (mayor)
      { slug: "tutelas", hero: null, health: fig({ value: 0.8, previous: 0.7 }) }, // mejora
      { slug: "smart-momento-3", hero: null, health: fig({ format: "int", polarity: "up-bad", value: 9, previous: 8 }) }, // base pequeña
      { slug: "medicina-laboral-entradas", hero: null, health: fig({ format: "pct", polarity: "up-bad", value: 0.3, previous: 0.25 }) }, // empeora
      { slug: "correspondencia-salidas", hero: null, health: fig({ value: 0.986, previous: 0.991 }) }, // −0,5 p.p. → estable (ruido)
      { slug: "correspondencia-entradas", hero: null, health: fig({ format: "int", polarity: "up-bad", value: 102, previous: 100 }) }, // +2 % → estable
      { slug: "entes-control-eficiencia", hero: null, health: fig({ format: "int", polarity: "up-bad", value: 104, previous: 100 }) }, // +4 % → empeora (supera el 3 %)
      { slug: "smart-momento-1", hero: null, health: fig({ kpi: "cruce", value: 0, previous: 0 }) }, // hallazgo de calidad: no entra
      { slug: "smart-momento-2", hero: null, health: null },
    ];
    const p = computePulse(items);
    expect(p.total).toBe(8);
    expect(p.improved).toBe(1);
    expect(p.worsened).toBe(4);
    expect(p.stable).toBe(3);
    expect(p.top.map((s) => s.meta.slug)).toEqual(["entes-control", "pqrd", "medicina-laboral-entradas"]);
  });
});
