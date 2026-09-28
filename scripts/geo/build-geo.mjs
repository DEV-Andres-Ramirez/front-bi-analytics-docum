#!/usr/bin/env node
/**
 * Prepara la geografía para Mapbox a partir de los GeoJSON originales de public/data
 * (que NO se modifican):
 *
 *  - Corrige el mojibake "¥" → "Ñ" (20 municipios) y el código falso 88000 → 88564.
 *  - Simplifica preservando topología (mapshaper) y redondea a 5 decimales (~1 m).
 *  - Deja solo propiedades de código y nombre.
 *  - Parte los municipios por departamento (carga perezosa en el drill-down).
 *  - Genera el catálogo DIVIPOLA (nombre oficial, bbox y centroide por código).
 *
 * Salidas:
 *   public/data/geo/departamentos.json
 *   public/data/geo/municipios/<DPTO>.json
 *   src/lib/geo/divipola.json
 *
 * Uso: node scripts/geo/build-geo.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mapshaper from "mapshaper";
import { readCSV } from "../mock/csv.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = join(ROOT, "public", "data");
const OUT = join(DATA, "geo");
const OUT_MPIOS = join(OUT, "municipios");
const CATALOG = join(ROOT, "src", "lib", "geo", "divipola.json");
mkdirSync(OUT_MPIOS, { recursive: true });
mkdirSync(dirname(CATALOG), { recursive: true });

/** Nombres oficiales DANE de los departamentos. */
const DPTO_NAMES = {
  "05": "Antioquia", "08": "Atlántico", "11": "Bogotá D.C.", "13": "Bolívar", "15": "Boyacá", "17": "Caldas",
  "18": "Caquetá", "19": "Cauca", "20": "Cesar", "23": "Córdoba", "25": "Cundinamarca", "27": "Chocó",
  "41": "Huila", "44": "La Guajira", "47": "Magdalena", "50": "Meta", "52": "Nariño", "54": "Norte de Santander",
  "63": "Quindío", "66": "Risaralda", "68": "Santander", "70": "Sucre", "73": "Tolima", "76": "Valle del Cauca",
  "81": "Arauca", "85": "Casanare", "86": "Putumayo", "88": "San Andrés, Providencia y Santa Catalina",
  "91": "Amazonas", "94": "Guainía", "95": "Guaviare", "97": "Vaupés", "99": "Vichada",
};

/** Nombres oficiales vigentes de municipios cuya denominación cambió respecto al GeoJSON. */
const MPIO_OFFICIAL = {
  "11001": "Bogotá D.C.", "54001": "San José de Cúcuta", "13001": "Cartagena de Indias", "25843": "Villa de San Diego de Ubaté",
  "05042": "Santa Fe de Antioquia", "52835": "San Andrés de Tumaco", "76111": "Guadalajara de Buga", "73443": "San Sebastián de Mariquita",
  "05664": "San Pedro de los Milagros", "05674": "San Vicente Ferrer", "19548": "Piendamó - Tunía", "70742": "San Luis de Sincé",
  "70823": "San José de Toluviejo", "52224": "Cuaspud Carlosama", "50370": "Uribe", "50223": "Cubarral", "88564": "Providencia y Santa Catalina",
  "76001": "Santiago de Cali",
};

const LOWER = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en"]);
function titleCase(s) {
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w, i) => {
      if (/^\s+$|^-$/.test(w)) return w;
      if (w === "d.c." || w === "d.c") return "D.C.";
      if (i > 0 && LOWER.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join("");
}
const fixMojibake = (s) => String(s ?? "").replace(/¥/g, "Ñ");

// ─── 1. Leer y corregir propiedades ──────────────────────────────────────────
const dptos = JSON.parse(readFileSync(join(DATA, "colombia-departamentos.geojson"), "utf8"));
const mpios = JSON.parse(readFileSync(join(DATA, "colombia-municipios.geojson"), "utf8"));

for (const f of dptos.features) {
  f.properties = { code: f.properties.DPTO, name: DPTO_NAMES[f.properties.DPTO] ?? titleCase(fixMojibake(f.properties.NOMBRE_DPT)) };
}

/** Nombres oficiales observados en vistas con código DANE (si hay CSV locales). */
const observed = {};
const csvDir = join(ROOT, "top_secret", "db");
if (existsSync(csvDir)) {
  const sources = [
    ["vw_reporte_datastudio_smart_momento1.csv", "municipio", "nombre_municipio"],
    ["vw_reporte_datastudio_smart_momento2.csv", "municipio", "nombre_municipio"],
    ["reporte_smart_momento1.csv", "municipio", "nombre_municipio"],
    ["vw_reporte_datastudio_salidas_generales.csv", "Codigo_municipio_destinatario", "Municipio_destinatario"],
  ];
  for (const [file, codeCol, nameCol] of sources) {
    const path = join(csvDir, file);
    if (!existsSync(path)) continue;
    for (const r of readCSV(path)) {
      const code = (r[codeCol] ?? "").trim();
      const name = (r[nameCol] ?? "").trim();
      if (/^\d{5}$/.test(code) && name && !/no reporta/i.test(name)) observed[code] = name;
    }
  }
}

const catalogMpios = {};
for (const f of mpios.features) {
  const p = f.properties;
  const code = p.MPIOS === "88000" ? "88564" : p.MPIOS;
  const geoName = fixMojibake(p.NOMBRE_MPI);
  const cab = fixMojibake(p.NOMBRE_CAB);
  const name = MPIO_OFFICIAL[code] ?? (observed[code] ? titleCase(observed[code]) : titleCase(geoName));
  f.properties = { code, dpto: p.DPTO, name };
  const entry = (catalogMpios[code] ??= { n: name, d: p.DPTO, g: [] });
  for (const alt of [geoName, cab, observed[code]]) if (alt && !entry.g.includes(alt)) entry.g.push(alt);
}

// ─── 2. Simplificar con mapshaper ────────────────────────────────────────────
async function simplify(fc, pct, extra = "") {
  const out = await mapshaper.applyCommands(
    `-i in.json -simplify ${pct}% keep-shapes planar ${extra} -o out.json format=geojson precision=0.00001`,
    { "in.json": JSON.stringify(fc) },
  );
  return JSON.parse(out["out.json"]);
}

const dptosOut = await simplify(dptos, 9);
writeFileSync(join(OUT, "departamentos.json"), JSON.stringify(dptosOut));

const mpiosOut = await simplify(mpios, 18);
const byDpto = {};
for (const f of mpiosOut.features) (byDpto[f.properties.dpto] ??= []).push(f);
for (const [dpto, features] of Object.entries(byDpto)) {
  writeFileSync(join(OUT_MPIOS, `${dpto}.json`), JSON.stringify({ type: "FeatureCollection", features }));
}

// ─── 3. Catálogo DIVIPOLA con bbox y centroide ───────────────────────────────
function bboxOf(features) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c) => {
    if (typeof c[0] === "number") {
      w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]);
    } else c.forEach(walk);
  };
  features.forEach((f) => walk(f.geometry.coordinates));
  const r = (x) => Math.round(x * 1e4) / 1e4;
  return [r(w), r(s), r(e), r(n)];
}
const center = (b) => [Math.round(((b[0] + b[2]) / 2) * 1e4) / 1e4, Math.round(((b[1] + b[3]) / 2) * 1e4) / 1e4];

const catalog = { dptos: {}, mpios: {} };
for (const f of dptosOut.features) {
  const b = bboxOf([f]);
  catalog.dptos[f.properties.code] = { n: f.properties.name, b, c: center(b) };
}
const mpioFeatures = {};
for (const f of mpiosOut.features) (mpioFeatures[f.properties.code] ??= []).push(f);
for (const [code, entry] of Object.entries(catalogMpios)) {
  const feats = mpioFeatures[code];
  const b = feats ? bboxOf(feats) : null;
  catalog.mpios[code] = { ...entry, ...(b ? { c: center(b) } : {}) };
}
writeFileSync(CATALOG, JSON.stringify(catalog));

const size = (p) => (readFileSync(p).length / 1024).toFixed(0) + " KB";
console.log(`✔ departamentos.json ${size(join(OUT, "departamentos.json"))} (${dptosOut.features.length} features)`);
console.log(`✔ municipios/*.json ${Object.keys(byDpto).length} archivos, ${mpiosOut.features.length} features`);
console.log(`✔ divipola.json ${size(CATALOG)} · ${Object.keys(catalog.dptos).length} dptos · ${Object.keys(catalog.mpios).length} municipios · ${Object.keys(observed).length} nombres oficiales observados`);
