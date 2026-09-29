import { describe, expect, it } from "vitest";
import { mlEntradas } from "../datasets/ml-entradas";
import { mlSalidas } from "../datasets/ml-salidas";
import { salidasGenerales } from "../datasets/salidas-generales";
import { diasPlazo } from "../normalizers";
import { generate } from "./generator";

describe("datos mock verosímiles", () => {
  it("ML salidas reparte el volumen en la semana hábil (el perfil es de un solo jueves)", () => {
    const rows = generate(mlSalidas.mock());
    const byWeekday = [0, 0, 0, 0, 0, 0, 0];
    for (const r of rows) byWeekday[(new Date(Number(r.__date)).getUTCDay() + 6) % 7]++;
    const share = byWeekday.map((n) => n / rows.length);
    expect(Math.max(...share)).toBeLessThan(0.3);
    for (const s of share.slice(0, 5)) expect(s).toBeGreaterThan(0.15);
    const hours = new Set(rows.map((r) => new Date(Number(r.__date)).getUTCHours()));
    expect(hours.size).toBeGreaterThan(8);
  });

  it("salidas generales: las copias de un radicado comparten los datos del documento", () => {
    const rows = generate(salidasGenerales.mock()).map((r) => salidasGenerales.normalize(r));
    const byRadicado = new Map<string, (typeof rows)[number]>();
    let copies = 0;
    for (const r of rows) {
      const first = byRadicado.get(String(r.Numero_radicado));
      if (!first) {
        byRadicado.set(String(r.Numero_radicado), r);
        continue;
      }
      copies++;
      for (const f of ["Asunto", "Tramite", "Estado", "Aprobador", "Fecha_radicacion", "Radicado_entrada", "Copia"]) {
        expect(r[f], `${r.Numero_radicado} · ${f}`).toBe(first[f]);
      }
      expect(["Interna", "Externa", "Interna y externa"]).toContain(r.Copia);
    }
    expect(copies / rows.length).toBeGreaterThan(0.05);
    expect(copies / rows.length).toBeLessThan(0.15);
  });

  it("ML entradas: el tiempo por vencer cuadra con la fecha máxima de respuesta", () => {
    const rows = generate(mlEntradas.mock()).map((r) => mlEntradas.normalize(r));
    // La fecha máxima se muestra como día: el plazo corre hasta el final de ese día (hora de pared de Bogotá).
    const today = Math.floor((Date.now() - 5 * 3_600_000) / 86_400_000);
    let vigentes = 0;
    for (const r of rows) {
      if (typeof r.fecha_max_respuesta !== "number") continue;
      const vigente = Math.floor(r.fecha_max_respuesta / 86_400_000) >= today;
      const label = `${r.numero_radicado} · ${r.tiempo_por_vencer}`;
      if (vigente) {
        vigentes++;
        expect(["Vencido", "Fuera de Término"], label).not.toContain(r.tiempo_por_vencer);
      }
    }
    // Los radicados recientes (con el plazo vigente) existen y quedan "En término"
    expect(vigentes).toBeGreaterThan(50);
    expect(rows.some((r) => r.tiempo_por_vencer === "Vencido")).toBe(true);
  });

  it("ML salidas: dentro de SLA ⇔ aprobada a más tardar en la fecha máxima", () => {
    const rows = generate(mlSalidas.mock()).map((r) => mlSalidas.normalize(r));
    let conPlazo = 0;
    for (const r of rows) {
      if (typeof r.FECHA_MAXIMA_RESPUESTA !== "number") continue;
      conPlazo++;
      const aTiempo = Number(r.FECHA_APROBACION) <= r.FECHA_MAXIMA_RESPUESTA;
      expect(r.DENTRO_SLA, String(r.NUMERO_RADICADO)).toBe(aTiempo ? "Sí" : "No");
    }
    expect(conPlazo).toBeGreaterThan(1000);
  });

  it("plazo en días con plural correcto", () => {
    expect(diasPlazo("2 dia(s)")).toBe("2 días");
    expect(diasPlazo("1 dia(s)")).toBe("1 día");
    expect(diasPlazo("0 dias")).toBe("0 días");
    expect(diasPlazo("21 día(s)")).toBe("21 días");
    expect(diasPlazo("")).toBe("No reporta");
    expect(diasPlazo(null)).toBe("No reporta");
  });
});
