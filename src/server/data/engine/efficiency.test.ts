import { describe, expect, it } from "vitest";
import { DAY_MS, isoToMs, todayISO, weekStart } from "@/lib/dates";
import { TableBuilder, type RowValue } from "../table";
import { efficiencyResult } from "./efficiency";

/** Un instante dentro de la semana "actual" de efficiencyResult (la anterior si hoy es lunes). */
function currentWeekMs(): number {
  const today = isoToMs(todayISO());
  let anchor = weekStart(today);
  if (anchor === today) anchor -= 7 * DAY_MS;
  return anchor + 12 * 3_600_000;
}

type Days = { asig?: number; gest?: number; aprob?: number };
const row = (oficina: string, d: Days): Record<string, RowValue> => ({
  fecha: currentWeekMs(),
  oficina_responsable_de_respuesta: oficina,
  num_dias_asignacion_gestionador: d.asig ?? null,
  num_dias_gestion_total: d.gest ?? null,
  num_dias_revision: null,
  num_dias_aprobacion: d.aprob ?? null,
});

function run(rows: Record<string, RowValue>[]) {
  const b = new TableBuilder({
    fecha: "date",
    oficina_responsable_de_respuesta: "cat",
    num_dias_asignacion_gestionador: "num",
    num_dias_gestion_total: "num",
    num_dias_revision: "num",
    num_dias_aprobacion: "num",
  });
  for (const r of rows) b.push(r);
  const t = b.build();
  return efficiencyResult(t, Uint32Array.from({ length: t.n }, (_, i) => i), "fecha");
}

describe("eficiencia PQRD · puesto por gerencia", () => {
  it("con el mismo cuartil promedio, la cobertura de fases desempata y el volumen ordena", () => {
    const res = run([
      // Q1 en las 3 fases: B con 2 radicados, A con 1
      row("B", { asig: 0, gest: 0, aprob: 0 }),
      row("B", { asig: 0, gest: 0, aprob: 0 }),
      row("A", { asig: 0, gest: 0, aprob: 0 }),
      // Q1 solo en Gestión (Asignación y Aprobación sin datos)
      row("C", { gest: 0 }),
      // Referencias más lentas para los cuartiles de 52 semanas
      row("D", { asig: 5, gest: 5, aprob: 5 }),
      row("E", { asig: 6, gest: 6, aprob: 6 }),
      row("F", { asig: 7, gest: 7, aprob: 7 }),
      row("G", { asig: 8, gest: 8, aprob: 8 }),
    ]);
    const by = Object.fromEntries(res.rows.map((r) => [r.gerencia, r]));
    expect(by.A.score).toBe(1);
    expect(by.B.score).toBe(1);
    expect(by.C.score).toBe(1);
    // A y B empatan (mismo score y 3 de 3 fases); B va primero por volumen. C (1 de 3 fases) no empata con ellas.
    expect(res.rows.slice(0, 3).map((r) => [r.gerencia, r.ranking])).toEqual([
      ["B", 1],
      ["A", 1],
      ["C", 3],
    ]);
    // El DTO no cambia de forma
    expect(Object.keys(res.rows[0]).sort()).toEqual(["gerencia", "phases", "ranking", "score"]);
  });
});
