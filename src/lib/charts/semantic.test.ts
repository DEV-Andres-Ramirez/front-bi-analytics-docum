import { describe, expect, it } from "vitest";
import { copUnit, describeDelta, formatPct, formatValue } from "@/lib/format";
import { displayLabel, initials } from "@/lib/labels";
import { isNeutral, resolveStatus, statusDisplay } from "./semantic";
import { inkOn } from "./theme";

/** Espacio duro entre cifra y unidad. */
const S = "\u00a0";

describe("SemanticRegistry (etiquetas reales de los perfiles)", () => {
  it.each([
    ["030. Acuse de recibo", "radian", "info"],
    ["032. Recibo del bien o prestación del servicio", "radian", "good"],
    ["Sin Evento Radian", "radian", "warning"],
    ["Acuse de recibo", "notificacion", "good"],
    ["No fue posible la entrega al destinatario", "notificacion", "critical"],
    ["5. Abierto Vencido", "semaforo", "critical"],
    ["1. Cerrado a Tiempo", "semaforo", "good"],
    ["3. Abierto Próximo a Vencer", "semaforo", "warning"],
    ["6. Sin Clasificar", "semaforo", "neutral"],
    ["Fuera de Término", "cumplimiento", "serious"],
    ["Vencido", "cumplimiento", "critical"],
    ["No Reporta sin Fecha Vencimiento", "cumplimiento", "neutral"],
    ["Solicitud de reclasificaciòn", "flujo", "info"],
    ["Aprobación rechazada", "flujo", "serious"],
    ["Reclasificación Aprobada", "flujo", "good"],
    ["Eliminada", "flujo", "neutral"],
    ["GESTIÓN", "momento", "info"],
    ["CIERRE", "momento", "good"],
    ["ENTREGA EXITOSA", "guia", "good"],
    ["DEVUELTO", "guia", "critical"],
    ["INCONSISTENTE", "factura", "critical"],
    ["Preventiva", "sla", "warning"],
    ["Revoca Sanción", "fallo", "good"],
    ["Confirma en Contra", "fallo", "critical"],
    ["Informativos", "fallo", "neutral"],
  ] as const)("%s (%s) → %s", (label, family, tone) => {
    expect(resolveStatus(label, family)?.tone).toBe(tone);
  });

  it("agrupa y muestra sin prefijo ordinal", () => {
    expect(resolveStatus("2. Abierto En Término", "semaforo")?.group).toBe("Abiertos");
    expect(statusDisplay("2. Abierto En Término")).toBe("Abierto en término");
    expect(resolveStatus("Sin Evento Radian", "radian")?.display).toBe("Pendiente de acuse");
    expect(resolveStatus("No Reporta", "guia")?.display).toBe("Sin guía física");
  });

  it("separa el código RADIAN y usa la misma etiqueta en tira y tabla", () => {
    const s = resolveStatus("030. Acuse de recibo", "radian");
    expect(s?.display).toBe("Acuse de recibo");
    expect(s?.code).toBe("030");
    expect(resolveStatus("032. Recibo del bien o prestación del servicio", "radian")?.display).toBe("Recibo del bien o prestación del servicio");
  });

  it("notificación con los nombres de la banda de KPIs", () => {
    expect(resolveStatus("Acuse de recibo", "notificacion")?.display).toBe("Entregada (acuse de recibo)");
    expect(resolveStatus("El destinatario abrio la notificacion", "notificacion")?.display).toBe("Abierta por el destinatario");
    expect(resolveStatus("No fue posible la entrega al destinatario", "notificacion")?.display).toBe("Entrega fallida");
  });

  it("detecta neutrales sin confundir categorías reales", () => {
    expect(isNeutral("No Reporta")).toBe(true);
    expect(isNeutral("Otros")).toBe(true);
    expect(isNeutral("")).toBe(true);
    expect(isNeutral("Otros Productos de Seguros")).toBe(false);
    expect(isNeutral("Sin Evento Radian")).toBe(false);
    expect(isNeutral("Resto / otras")).toBe(true);
  });
});

describe("inkOn (texto sobre rellenos, AA)", () => {
  it.each([
    ["#DF7702", "#14171c"], // naranja chart-1 claro: tinta 5,8:1 (blanco 3,1:1)
    ["#0CA30C", "#14171c"], // good claro
    ["#1BAF7A", "#14171c"], // aqua chart-3
    ["#E07C0A", "#14171c"],
    ["#C96A00", "#14171c"], // chart-1 oscuro
    ["#2C70D5", "#ffffff"], // info claro: blanco 4,8:1
    ["#D03B3B", "#ffffff"], // critical
    ["#7A3B00", "#ffffff"], // extremo oscuro de la rampa
    ["#4A3AA7", "#ffffff"],
  ])("%s → %s", (bg, ink) => {
    expect(inkOn(bg)).toBe(ink);
  });
});

describe("formatos", () => {
  it("espacio duro entre cifra y unidad", () => {
    expect(formatPct(0.817)).toBe(`81,7${S}%`);
    expect(formatValue(1_080_000_000, "cop")).toBe(`$${S}1,08${S}mil${S}M`);
  });
  it("días siempre con 1 decimal", () => {
    expect(formatValue(1, "days")).toBe(`1,0${S}días`);
    expect(formatValue(4.3, "days")).toBe(`4,3${S}días`);
    expect(formatValue(14, "days")).toBe(`14,0${S}días`);
  });
  it("COP con unidad única y precisión fija", () => {
    const u = copUnit([2_000_000_000, 1_080_000_000, 1_400_000_000]);
    expect([2_000_000_000, 1_080_000_000].map(u.value)).toEqual(["2,00", "1,08"]);
    const m = copUnit([2_000_000, 1_850_000]);
    expect([2_000_000, 1_850_000].map(m.value)).toEqual(["2,0", "1,9"]);
  });
});

describe("describeDelta", () => {
  it("% en p.p. y tono por polaridad", () => {
    const d = describeDelta(0.672, 0.659, "pct", "up-good");
    expect(d.text).toBe(`+1,3${S}p.p.`);
    expect(d.tone).toBe("good");
  });
  it("sin base y base pequeña", () => {
    expect(describeDelta(10, null, "int", "up-good").text).toBe("Sin base");
    const small = describeDelta(30, 12, "int", "up-bad");
    expect(small.reason).toBe("small-base");
    expect(small.text).toBe("+18");
    expect(small.relText).toBe(`+150,0${S}%`);
    expect(small.tone).toBe("neutral");
  });
  it("variación despreciable es neutral", () => {
    const d = describeDelta(100, 100, "int", "up-good");
    expect(d.text).toBe(`0,0${S}%`);
    expect(d.tone).toBe("neutral");
  });
});

describe("displayLabel", () => {
  it("proveedor con NIT", () => {
    const l = displayLabel("[ 938376353 ] UNIÓN TEMPORAL DE SALUD S.A.S.", "proveedor");
    expect(l.secondary).toBe("NIT 938376353");
    expect(l.full.startsWith("Unión Temporal de Salud")).toBe(true);
  });
  it("mayúsculas a tipo título con siglas", () => {
    expect(displayLabel("GERENCIA DE INDEMNIZACIONES").full).toBe("Gerencia de Indemnizaciones");
    expect(displayLabel("OFICINA PQRD BOGOTA D.C.").full).toContain("PQRD");
  });
  it("iniciales: nombre + primer apellido", () => {
    expect(initials("María José de la Pérez")).toBe("MP");
    expect(initials("Lorena Castro Acosta")).toBe("LC");
    expect(initials("Daniel Jiménez Pardo")).toBe("DJ");
    expect(initials("Santiago Escobar Cárdenas")).toBe("SE");
    expect(initials("Juan Carlos Rojas Gómez")).toBe("JR");
  });
  it("oficinas: número del grupo al final y tildes restituidas", () => {
    expect(displayLabel("6 GRUPO CENTRO DE EXCELENCIA", "oficina").full).toBe("Grupo Centro de Excelencia 6");
    expect(displayLabel("5 GRUPO JUNTAS DE CALIFICACIÓN", "oficina").full).toBe("Grupo Juntas de Calificación 5");
    expect(displayLabel("GERENCIA MEDICA EXCELENCIA", "oficina").full).toBe("Gerencia Médica Excelencia");
    expect(displayLabel("GERENCIA DE GESTION FINANCIERA", "oficina").full).toBe("Gerencia de Gestión Financiera");
  });
  it("neutrales y variantes en una sola forma", () => {
    expect(displayLabel("NO REPORTA", "persona").full).toBe("No reporta");
    expect(displayLabel("Sin Clasificar").full).toBe("Sin clasificar");
    expect(displayLabel("6. Sin Clasificar").full).toBe("Sin clasificar");
    expect(displayLabel("Derecho de Petición").full).toBe("Derecho de petición");
    expect(displayLabel("Cuenta De Cobro").full).toBe("Cuenta de cobro");
    expect(displayLabel("Pago De Incapacidad").full).toBe("Pago de incapacidad");
    expect(displayLabel("Contact Center").full).toBe("Contact Center");
  });
});
