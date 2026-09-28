import { describe, expect, it } from "vitest";
import { copUnit, describeDelta, formatPct, formatValue } from "@/lib/format";
import { displayLabel, durationLabel, initials, sentenceCase } from "@/lib/labels";
import { isNeutral, resolveStatus, statusDisplay, toneStep, toneStepHex } from "./semantic";
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
    ["Informativos", "fallo", "info"],
  ] as const)("%s (%s) → %s", (label, family, tone) => {
    expect(resolveStatus(label, family)?.tone).toBe(tone);
  });

  it("agrupa y muestra sin prefijo ordinal", () => {
    expect(resolveStatus("2. Abierto En Término", "semaforo")?.group).toBe("Abiertos");
    expect(statusDisplay("2. Abierto En Término")).toBe("Abierto en término");
    // Marcas con mayúscula interna se conservan (tooltips, badges y la serie SealMail)
    expect(statusDisplay("Certificado SealMail")).toBe("Certificado SealMail");
    expect(resolveStatus("Sin Evento Radian", "radian")?.display).toBe("Pendiente de acuse");
    expect(resolveStatus("No Reporta", "guia")?.display).toBe("Sin guía física");
  });

  it("separa el código RADIAN y usa la misma etiqueta en tira y tabla", () => {
    const s = resolveStatus("030. Acuse de recibo", "radian");
    expect(s?.display).toBe("Acuse de recibo");
    expect(s?.code).toBe("030");
    expect(resolveStatus("032. Recibo del bien o prestación del servicio", "radian")?.display).toBe("Recibo del bien o prestación del servicio");
  });

  it("notificación con los nombres de la banda de KPIs (en singular)", () => {
    expect(resolveStatus("Acuse de recibo", "notificacion")?.display).toBe("Entregada");
    expect(resolveStatus("El destinatario abrio la notificacion", "notificacion")?.display).toBe("Abierta");
    expect(resolveStatus("No fue posible la entrega al destinatario", "notificacion")?.display).toBe("Fallida");
  });

  it("RADIAN: forma corta para el badge de la tabla, completa en display", () => {
    const s = resolveStatus("032. Recibo del bien o prestación del servicio", "radian");
    expect(s?.short).toBe("Recibo del bien");
    expect(s?.code).toBe("032");
    expect(resolveStatus("030. Acuse de recibo", "radian")?.short).toBeUndefined();
    // Un alias del spec manda sobre la forma corta
    expect(resolveStatus("032. Recibo del bien o prestación del servicio", "radian", { "032. Recibo del bien o prestación del servicio": { label: "Recibido" } })?.short).toBeUndefined();
  });

  it("plazos con concordancia de número", () => {
    expect(statusDisplay("6 día(s) hábiles")).toBe("6 días hábiles");
    expect(statusDisplay("1 día(s) hábiles")).toBe("1 día hábil");
    expect(resolveStatus("6 día(s) hábiles", "cumplimiento")?.display).toBe("6 días hábiles");
    expect(statusDisplay("5 Horas")).toBe("5 horas");
  });

  it("siglas finales EL y AT en mayúsculas", () => {
    expect(statusDisplay("ORIGEN EL")).toBe("Origen EL");
    expect(statusDisplay("ORIGEN AT")).toBe("Origen AT");
  });

  it("escalones de tono: en oscuro se aclaran (≥ 3:1 sobre la superficie)", () => {
    expect(toneStep("var(--good)", 0)).toBe("var(--good)");
    expect(toneStep("var(--good)", 2)).toContain("var(--tone-step-2)");
    expect(toneStep("var(--good)", 3)).toBe("var(--good)");
    // #22b35a sobre #161a21: el 3.er escalón ya no se apaga hacia el fondo
    const surface = "#161a21";
    const lum = (hex: string) => {
      const c = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    for (const step of [1, 2]) expect(ratio(toneStepHex("#22b35a", step, "dark", surface), surface)).toBeGreaterThanOrEqual(3);
    // Claro: igual que antes (72 % sobre la superficie)
    expect(toneStepHex("#0ca30c", 1, "light", "#ffffff")).toBe("#50bd50");
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
  it("plazos en una sola forma", () => {
    expect(displayLabel("1 Días").full).toBe("1 día");
    expect(displayLabel("4 Días").full).toBe("4 días");
    expect(displayLabel("6 día(s) hábiles").full).toBe("6 días hábiles");
    expect(displayLabel("5 Horas").full).toBe("5 horas");
    expect(durationLabel("En término")).toBeNull();
  });
  it("EL final en mayúsculas es sigla (enfermedad laboral)", () => {
    expect(displayLabel("ORIGEN EL").full).toBe("Origen EL");
    expect(displayLabel("ORIGEN AT").full).toBe("Origen AT");
    expect(displayLabel("CALIFICACION EN EL ORIGEN").full).toBe("Calificación en el Origen");
  });
  it("tipo oración para listas de estados", () => {
    expect(sentenceCase("Confirma a Favor")).toBe("Confirma a favor");
    expect(sentenceCase("Oficios de Trámite")).toBe("Oficios de trámite");
    expect(sentenceCase("Revoca Sanción")).toBe("Revoca sanción");
  });
});
