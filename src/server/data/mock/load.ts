import "server-only";

import { resolveGeo } from "@/lib/geo/diccionario";
import { DATASETS } from "../datasets";
import { TableBuilder, type Table } from "../table";
import { generate } from "./generator";

/**
 * Construye (una sola vez por proceso) la tabla columnar de un dataset mock.
 * Agrega __dpto / __mpio con los códigos DANE resueltos por el diccionario geo.
 */
// Caché a nivel de módulo: se invalida sola cuando HMR recarga un dataset.
const tables = new Map<string, Table>();

export function loadMockTable(id: string): Table {
  const hit = tables.get(id);
  if (hit) return hit;
  const def = DATASETS[id];
  if (!def) throw new Error(`Dataset desconocido: ${id}`);

  const started = performance.now();
  const rows = generate(def.mock());
  const builder = new TableBuilder({ ...def.schema, __dpto: "cat", __mpio: "cat" });
  for (const raw of rows) {
    const row = def.normalize(raw);
    if (def.geo) {
      const g = resolveGeo(row[def.geo.dpto] as string, def.geo.mpio ? (row[def.geo.mpio] as string) : null);
      row.__dpto = g.dpto ?? "";
      row.__mpio = g.mpio ?? "";
    }
    builder.push(row);
  }
  const table = builder.build();
  tables.set(id, table);
  if (process.env.NODE_ENV !== "production") {
    console.log(`[mock] ${id}: ${table.n.toLocaleString("es-CO")} filas en ${Math.round(performance.now() - started)} ms`);
  }
  return table;
}
