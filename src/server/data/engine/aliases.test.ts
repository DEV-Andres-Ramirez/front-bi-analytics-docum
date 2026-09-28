import { describe, expect, it } from "vitest";
import { estadoFallo, estadoSalidaML, folios, tiempoPorVencer, withAlias } from "../normalizers";

describe("alias de datos (normalizers)", () => {
  it("Estado_del_fallo: 'Informativos' → 'Informativo'", () => {
    expect(estadoFallo("Informativos")).toBe("Informativo");
    expect(estadoFallo(" INFORMATIVOS ")).toBe("Informativo");
    expect(estadoFallo("Informativo")).toBe("Informativo");
    expect(estadoFallo("A favor")).toBe("A favor");
    expect(estadoFallo("N/A")).toBe("No reporta");
    expect(estadoFallo(null)).toBe("No reporta");
  });

  it("estado_salida (ML entradas): 'Por recibir correspondencia' → 'Por recibir en correspondencia'", () => {
    expect(estadoSalidaML("Por recibir correspondencia")).toBe("Por recibir en correspondencia");
    expect(estadoSalidaML("Por recibir en correspondencia")).toBe("Por recibir en correspondencia");
    expect(estadoSalidaML("NO REPORTA")).toBe("No reporta");
    expect(estadoSalidaML("Enviado")).toBe("Enviado");
  });

  it("withAlias genérico", () => {
    expect(withAlias("Hola  Mundo", { "hola mundo": "Hola, mundo" })).toBe("Hola, mundo");
  });

  it("Tiempo por vencer (Entes, SMART M3): unidad en minúscula y concordancia de número", () => {
    expect(tiempoPorVencer("1 Días")).toBe("1 día");
    expect(tiempoPorVencer("4 Días")).toBe("4 días");
    expect(tiempoPorVencer("15 Días")).toBe("15 días");
    expect(tiempoPorVencer("5 Horas")).toBe("5 horas");
    expect(tiempoPorVencer("1 hora")).toBe("1 hora");
    expect(tiempoPorVencer("En término")).toBe("En término");
    expect(tiempoPorVencer("6 día(s) hábiles")).toBe("6 día(s) hábiles");
    expect(tiempoPorVencer("NO REPORTA")).toBe("No reporta");
    expect(tiempoPorVencer(null)).toBe("No reporta");
  });

  it("Cantidad de folios: los valores de relleno (999 y ≥ 9.999) quedan sin dato", () => {
    for (const v of [999, 9999, 10000, 55555, 99999, "999", -1, "", null, undefined, "abc"]) expect(folios(v), String(v)).toBeNull();
    expect(folios(0)).toBe(0);
    expect(folios(12)).toBe(12);
    expect(folios("100")).toBe(100);
    expect(folios(998)).toBe(998);
    expect(folios(9998)).toBe(9998);
  });
});
