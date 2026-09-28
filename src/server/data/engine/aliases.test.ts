import { describe, expect, it } from "vitest";
import { estadoFallo, estadoSalidaML, withAlias } from "../normalizers";

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
});
