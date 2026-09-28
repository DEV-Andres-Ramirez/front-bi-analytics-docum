#!/usr/bin/env node
/**
 * Prepara la geografía para Mapbox a partir de los GeoJSON originales de public/data
 * (que NO se modifican):
 *
 *  - Corrige el mojibake "¥" → "Ñ" (20 municipios) y el código falso 88000 → 88564.
 *  - Simplifica preservando topología (mapshaper) y redondea a 5 decimales (~1 m).
 *  - Deja solo propiedades de código y nombre.
 *  - Parte los municipios por departamento (carga perezosa en el drill-down), con un
 *    punto de etiqueta interior `l` por municipio.
 *  - Genera el catálogo DIVIPOLA (nombre oficial, bbox, centroide y punto de etiqueta `l`
 *    por departamento).
 *  - HeroMap: contorno de Colombia (disolución de los departamentos simplificados, así
 *    coincide con los rellenos), máscara "mundo menos Colombia" y src/lib/geo/bounds.ts
 *    (encuadre, límites, ancla de Bogotá, bbox/etiqueta por departamento y la isla de
 *    San Andrés para el recuadro).
 *
 * Salidas:
 *   public/data/geo/departamentos.json
 *   public/data/geo/municipios/<DPTO>.json
 *   public/data/geo/colombia-outline.json
 *   public/data/geo/mask.json
 *   src/lib/geo/divipola.json
 *   src/lib/geo/bounds.ts
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

function round4(x) {
  return Math.round(x * 1e4) / 1e4;
}

/** Área con signo (fórmula del cordón): > 0 antihorario, < 0 horario (en lon/lat). */
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return a / 2;
}

/** Punto interior por feature (mapshaper -points inner), por código. Con varias partes gana la primera. */
async function innerPoints(fc) {
  const out = await mapshaper.applyCommands(`-i in.json -points inner -o out.json format=geojson precision=0.0001`, { "in.json": JSON.stringify(fc) });
  const map = new Map();
  for (const f of JSON.parse(out["out.json"]).features) {
    if (!f.geometry || map.has(f.properties.code)) continue;
    map.set(f.properties.code, f.geometry.coordinates.map(round4));
  }
  return map;
}

// Isla de San Andrés (parte mayor del 88) antes de simplificar: la simplificación a 9 %
// la deja en un puñado de vértices y descarta Providencia; el recuadro necesita su silueta.
const sanAndresRing = await (async () => {
  const f = dptos.features.find((x) => x.properties.code === "88");
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const largest = polys.reduce((a, b) => (Math.abs(ringArea(b[0])) > Math.abs(ringArea(a[0])) ? b : a));
  const fc = { type: "FeatureCollection", features: [{ type: "Feature", properties: { code: "88" }, geometry: { type: "Polygon", coordinates: [largest[0]] } }] };
  const out = await simplify(fc, 2);
  return out.features[0].geometry.coordinates[0].map(([x, y]) => [round4(x), round4(y)]);
})();

const dptosOut = await simplify(dptos, 9);
writeFileSync(join(OUT, "departamentos.json"), JSON.stringify(dptosOut));

const mpiosOut = await simplify(mpios, 18);
// Punto de etiqueta interior por municipio (etiquetas de valor en el drill-down)
const mpioLabels = await innerPoints(mpiosOut);
for (const f of mpiosOut.features) {
  const l = mpioLabels.get(f.properties.code);
  if (l) f.properties.l = l;
}
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

/** Bogotá D.C. se rotula en el casco urbano (su polígono llega hasta Sumapaz). */
const BOGOTA_ANCHOR = [-74.08, 4.65];
const dptoLabels = await innerPoints(dptosOut);
dptoLabels.set("11", BOGOTA_ANCHOR);

const catalog = { dptos: {}, mpios: {} };
for (const f of dptosOut.features) {
  const b = bboxOf([f]);
  const code = f.properties.code;
  catalog.dptos[code] = { n: f.properties.name, b, c: center(b), l: dptoLabels.get(code) ?? center(b) };
}
const mpioFeatures = {};
for (const f of mpiosOut.features) (mpioFeatures[f.properties.code] ??= []).push(f);
for (const [code, entry] of Object.entries(catalogMpios)) {
  const feats = mpioFeatures[code];
  const b = feats ? bboxOf(feats) : null;
  catalog.mpios[code] = { ...entry, ...(b ? { c: center(b) } : {}) };
}
writeFileSync(CATALOG, JSON.stringify(catalog));

// ─── 4. HeroMap: contorno, máscara y bounds.ts ───────────────────────────────
// El contorno sale de disolver los departamentos YA simplificados: comparte vértices
// con los rellenos, así la máscara y la línea de borde no dejan costuras.
const dissolved = JSON.parse(
  (await mapshaper.applyCommands(`-i in.json -dissolve -o out.json format=geojson precision=0.00001`, { "in.json": JSON.stringify(dptosOut) }))["out.json"],
);
const outlineGeom = dissolved.type === "GeometryCollection" ? dissolved.geometries[0] : dissolved.type === "FeatureCollection" ? dissolved.features[0].geometry : dissolved;
// Solo anillos exteriores: la disolución deja astillas internas (huecos de 4–8 vértices entre
// departamentos simplificados) que el borde dibujaría como anillos sueltos dentro del país.
const outlinePolys = (outlineGeom.type === "Polygon" ? [outlineGeom.coordinates] : outlineGeom.coordinates).map((p) => [p[0]]);
const outline = {
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: { code: "CO", name: "Colombia" }, geometry: { type: "MultiPolygon", coordinates: outlinePolys } }],
};
writeFileSync(join(OUT, "colombia-outline.json"), JSON.stringify(outline));

// Máscara: rectángulo del mundo (antihorario) con un agujero (horario) por cada parte de Colombia
const ccw = (ring) => (ringArea(ring) >= 0 ? ring : [...ring].reverse());
const cw = (ring) => (ringArea(ring) <= 0 ? ring : [...ring].reverse());
const world = ccw([[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]);
const mask = {
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: { kind: "mask" }, geometry: { type: "Polygon", coordinates: [world, ...outlinePolys.map((p) => cw(p[0]))] } }],
};
writeFileSync(join(OUT, "mask.json"), JSON.stringify(mask));

// bounds.ts: constantes de cámara y geografía liviana para el cliente (sin importar divipola.json)
const fmt = (a) => JSON.stringify(a).replace(/,/g, ", ");
const codes = Object.keys(catalog.dptos).sort();
const bounds = `/**
 * Geografía liviana para HeroMap (cámara, etiquetas y recuadro de San Andrés).
 * GENERADO por scripts/geo/build-geo.mjs: no editar a mano.
 */

/** [oeste, sur, este, norte] en grados. */
export type BBox = [number, number, number, number];
export type LngLat = [number, number];

/** Colombia continental (sin el archipiélago): encuadre por defecto. En Mercator, ancho/alto ≈ 0,73. */
export const MAINLAND: BBox = [-79.1, -4.3, -66.8, 12.5];
/** Límite de paneo (deja ver San Andrés al desplazarse). */
export const MAX_BOUNDS: BBox = [-85, -8, -61, 16];
/** Bogotá D.C. se rotula en el casco urbano (su polígono llega hasta Sumapaz). */
export const BOGOTA_ANCHOR: LngLat = ${fmt(BOGOTA_ANCHOR)};
/** Código DANE del archipiélago (recuadro). */
export const SAN_ANDRES_CODE = "88";

/** Caja por departamento (código DANE de 2 dígitos). */
export const DPTO_BBOX: Record<string, BBox> = {
${codes.map((c) => `  "${c}": ${fmt(catalog.dptos[c].b)},`).join("\n")}
};

/** Punto de etiqueta interior por departamento (mapshaper -points inner; Bogotá anclada). */
export const DPTO_LABEL: Record<string, LngLat> = {
${codes.map((c) => `  "${c}": ${fmt(catalog.dptos[c].l)},`).join("\n")}
};

/** Isla de San Andrés (parte mayor del departamento 88, simplificada) para el recuadro. */
export const SAN_ANDRES_RING: LngLat[] = ${fmt(sanAndresRing)};
`;
writeFileSync(join(ROOT, "src", "lib", "geo", "bounds.ts"), bounds);

const size = (p) => (readFileSync(p).length / 1024).toFixed(0) + " KB";
console.log(`✔ departamentos.json ${size(join(OUT, "departamentos.json"))} (${dptosOut.features.length} features)`);
console.log(`✔ municipios/*.json ${Object.keys(byDpto).length} archivos, ${mpiosOut.features.length} features`);
console.log(`✔ colombia-outline.json ${size(join(OUT, "colombia-outline.json"))} · mask.json ${size(join(OUT, "mask.json"))} (${outlinePolys.length} partes)`);
console.log(`✔ bounds.ts ${codes.length} departamentos · isla de San Andrés con ${sanAndresRing.length} vértices`);
console.log(`✔ divipola.json ${size(CATALOG)} · ${Object.keys(catalog.dptos).length} dptos · ${Object.keys(catalog.mpios).length} municipios · ${Object.keys(observed).length} nombres oficiales observados`);
