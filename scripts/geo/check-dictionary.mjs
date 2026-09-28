#!/usr/bin/env node
/**
 * Mide la tasa de cruce del diccionario geográfico (src/lib/geo/diccionario.ts)
 * contra los valores REALES de los CSV locales (top_secret/db, no versionado).
 *
 * Uso: node --experimental-strip-types scripts/geo/check-dictionary.mjs
 *      (Node ≥ 22.6; en Node 24 el flag ya no es necesario)
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readCSV } from "../mock/csv.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CSV = join(ROOT, "top_secret", "db");
if (!existsSync(CSV)) {
  console.error("No existe top_secret/db: este chequeo solo corre en local con los CSV de contexto.");
  process.exit(1);
}

// Importa el diccionario TypeScript (Node 24 ejecuta TS con type stripping)
const { resolveGeo } = await import(join(ROOT, "src", "lib", "geo", "diccionario.ts"));

const SOURCES = [
  ["vw_reporte_datastudio_pqrd.csv", "departamento_del_remitente", "municipio_del_remitente"],
  ["vw_reporte_datastudio_entes_control.csv", "Departamento_Remitente", "Municipio_Remitente"],
  ["vw_Reporte_Entes_Control.csv", "Departamento_Remitente", "Municipio_Remitente"],
  ["vw_reporte_datastudio_entradas_generales.csv", "Departamento_remitente", "Municipio_remitente"],
  ["vw_reporte_datastudio_medicina_laboral_entradas.csv", "departamento_remitente", "municipio_remitente"],
  ["vw_reporte_datastudio_medicina_laboral_entradas.csv", "departamento_destinatario", "municipio_destinatario"],
  ["vw_reporte_datastudio_medicina_laboral_salidas.csv", "DEPARTAMENTO_DESTINATARIO", "MUNICIPIO_DESTINATARIO"],
  ["vw_reporte_datastudio_salidas_generales.csv", "Codigo_departamento_destinatario", "Codigo_municipio_destinatario"],
  ["vw_reporte_datastudio_salidas_generales.csv", "Departamento_destinatario", "Municipio_destinatario"],
  ["vw_reporte_datastudio_tutelas.csv", "departamento", "municipio"],
  ["vw_reporte_datastudio_tutelas.csv", "Departamento_remitente", "Municipio_del_remitente"],
  ["vw_reporte_datastudio_smart_momento1.csv", "departamento", "municipio"],
  ["vw_reporte_datastudio_smart_momento1.csv", "nombre_departamento", "nombre_municipio"],
  ["vw_reporte_datastudio_smart_momento2.csv", "departamento", "municipio"],
  ["vw_reporte_datastudio_smart_momento2.csv", "nombre_departamento", "nombre_municipio"],
];

const NULLISH = /^(|no reporta|n\/a|null|ninguno)$/i;
let totD = 0, okD = 0, totM = 0, okM = 0;
const misses = new Map();

console.log("Fuente".padEnd(70), "Dpto".padStart(8), "Mpio".padStart(8));
for (const [file, dCol, mCol] of SOURCES) {
  const rows = readCSV(join(CSV, file));
  let nd = 0, hd = 0, nm = 0, hm = 0;
  for (const r of rows) {
    const d = (r[dCol] ?? "").trim();
    const m = (r[mCol] ?? "").trim();
    if (NULLISH.test(d) && NULLISH.test(m)) continue;
    const g = resolveGeo(d, m);
    if (!NULLISH.test(d)) {
      nd++;
      if (g.dpto) hd++;
    }
    if (!NULLISH.test(m)) {
      nm++;
      if (g.mpio) hm++;
      else {
        const k = `${d} / ${m}`;
        misses.set(k, (misses.get(k) ?? 0) + 1);
      }
    }
  }
  totD += nd; okD += hd; totM += nm; okM += hm;
  const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
  console.log(`${file.replace(".csv", "")} [${dCol}]`.slice(0, 70).padEnd(70), pct(hd, nd).padStart(8), pct(hm, nm).padStart(8));
}

const pd = (okD / totD) * 100;
const pm = (okM / totM) * 100;
console.log(`\nTOTAL departamentos: ${okD}/${totD} = ${pd.toFixed(2)}%`);
console.log(`TOTAL municipios:    ${okM}/${totM} = ${pm.toFixed(2)}%`);
console.log("\nNo cruzan (dpto / municipio → filas):");
[...misses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));

const ok = pd >= 99.9 && pm >= 98.5;
console.log(ok ? "\n✔ Umbrales cumplidos (≥ 99,9 % dptos, ≥ 98,5 % municipios)" : "\n✘ No se cumplen los umbrales");
process.exit(ok ? 0 : 1);
