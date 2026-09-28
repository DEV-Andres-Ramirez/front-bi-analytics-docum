/**
 * Diccionario entre los códigos/nombres geográficos de la BD y los códigos DANE
 * de los GeoJSON (DPTO de 2 dígitos, MPIOS de 5 dígitos).
 *
 *  - Por código (SMART M1/M2, Salidas Generales): cruce directo tras padStart.
 *    El departamento se deriva del municipio (slice 0,2) porque hay filas incoherentes.
 *  - Por nombre (PQRD, Entes, Entradas, ML, Tutelas, M3): normalización + alias,
 *    siempre acotado por departamento (hay nombres repetidos entre departamentos).
 *
 * Ver `scripts/geo/check-dictionary.mjs` para medir la tasa de cruce contra los CSV.
 */
import catalog from "./divipola.json" with { type: "json" };

interface DptoEntry {
  n: string;
  b: [number, number, number, number];
  c: [number, number];
}
interface MpioEntry {
  n: string;
  d: string;
  g: string[];
  c?: [number, number];
}

const DPTOS = catalog.dptos as unknown as Record<string, DptoEntry>;
const MPIOS = catalog.mpios as unknown as Record<string, MpioEntry>;

/** "BOGOTÁ, D.C." → "BOGOTA D C" · corrige "¥" → "Ñ" antes de quitar tildes. */
export function norm(value: string): string {
  return value
    .replace(/¥/g, "Ñ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NULL_TOKENS = new Set(["", "NO REPORTA", "N A", "NA", "NULL", "NINGUNO", "NO APLICA", "SIN DEFINIR"]);

/** Alias de departamento (nombre normalizado → DPTO). */
export const DPTO_ALIASES: Record<string, string> = {
  BOGOTA: "11",
  "BOGOTA D C": "11",
  "SANTAFE DE BOGOTA D C": "11",
  "SANTA FE DE BOGOTA": "11",
  "ARCHIPIELAGO DE SAN ANDRES": "88",
  "SAN ANDRES": "88",
  "SAN ANDRES PROVIDENCIA Y SANTA CATALINA": "88",
  "ARCHIPIELAGO DE SAN ANDRES PROVIDENCIA Y SANTA CATALINA": "88",
  "VALLE": "76",
  "GUAJIRA": "44",
  "NORTE SANTANDER": "54",
};

/** Alias de municipio acotados por departamento (nombre normalizado → MPIOS). */
export const MPIO_ALIASES: Record<string, Record<string, string>> = {
  "11": { "BOGOTA D C": "11001", BOGOTA: "11001" },
  "54": { "SAN JOSE DE CUCUTA": "54001", CUCUTA: "54001" },
  "13": { "CARTAGENA DE INDIAS": "13001", CARTAGENA: "13001" },
  "25": { "VILLA DE SAN DIEGO DE UBATE": "25843", UBATE: "25843" },
  "05": {
    "SANTA FE DE ANTIOQUIA": "05042",
    "SAN PEDRO DE LOS MILAGROS": "05664",
    "SAN VICENTE FERRER": "05674",
  },
  "52": { "SAN ANDRES DE TUMACO": "52835", TUMACO: "52835", "CUASPUD CARLOSAMA": "52224", CARLOSAMA: "52224" },
  "76": { "GUADALAJARA DE BUGA": "76111", BUGA: "76111", "SANTIAGO DE CALI": "76001" },
  "73": { "SAN SEBASTIAN DE MARIQUITA": "73443" },
  "19": { "PIENDAMO TUNIA": "19548", PIENDAMO: "19548" },
  "70": { "SAN LUIS DE SINCE": "70742", "SAN JOSE DE TOLUVIEJO": "70823" },
  "50": { URIBE: "50370", CUBARRAL: "50223" },
  "88": { "PROVIDENCIA Y SANTA CATALINA": "88564", "SANTA CATALINA": "88564", PROVIDENCIA: "88564" },
};

// Índices construidos una sola vez
const dptoByName = new Map<string, string>();
for (const [code, d] of Object.entries(DPTOS)) dptoByName.set(norm(d.n), code);
for (const [alias, code] of Object.entries(DPTO_ALIASES)) dptoByName.set(alias, code);

const mpioByName = new Map<string, Map<string, string>>();
for (const [code, m] of Object.entries(MPIOS)) {
  let idx = mpioByName.get(m.d);
  if (!idx) mpioByName.set(m.d, (idx = new Map()));
  for (const name of [m.n, ...m.g]) {
    const k = norm(name);
    if (!idx.has(k)) idx.set(k, code);
  }
}
for (const [dpto, aliases] of Object.entries(MPIO_ALIASES)) {
  let idx = mpioByName.get(dpto);
  if (!idx) mpioByName.set(dpto, (idx = new Map()));
  for (const [alias, code] of Object.entries(aliases)) idx.set(alias, code);
}

// Nombres de municipio únicos en todo el país (para filas sin departamento)
const uniqueMpio = new Map<string, string | null>();
for (const [code, m] of Object.entries(MPIOS)) {
  for (const name of new Set([m.n, ...m.g].map(norm))) {
    uniqueMpio.set(name, uniqueMpio.has(name) && uniqueMpio.get(name) !== code ? null : code);
  }
}
uniqueMpio.set("BOGOTA D C", "11001");

function isNullish(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  return NULL_TOKENS.has(norm(String(value)));
}

/** Código o nombre de departamento → DPTO ("05"), o null. */
export function resolveDepartamento(value: string | number | null | undefined): string | null {
  if (isNullish(value)) return null;
  const s = String(value).trim();
  if (/^\d{1,2}$/.test(s)) {
    const code = s.padStart(2, "0");
    return DPTOS[code] ? code : null;
  }
  return dptoByName.get(norm(s)) ?? null;
}

export interface GeoResolution {
  dpto: string | null;
  mpio: string | null;
}

/**
 * Resuelve (departamento, municipio) a códigos DANE. Si el municipio no existe
 * dentro del departamento indicado (dato incoherente de la fuente), conserva
 * solo el departamento.
 */
export function resolveGeo(
  dptoValue: string | number | null | undefined,
  mpioValue: string | number | null | undefined,
): GeoResolution {
  // Municipio por código: manda sobre el departamento declarado
  if (!isNullish(mpioValue)) {
    const s = String(mpioValue).trim();
    if (/^\d{4,5}$/.test(s)) {
      let code = s.padStart(5, "0");
      if (code === "88000") code = "88564";
      if (MPIOS[code]) return { dpto: code.slice(0, 2), mpio: code };
    }
  }
  const dpto = resolveDepartamento(dptoValue);
  if (isNullish(mpioValue)) return { dpto, mpio: null };
  const key = norm(String(mpioValue));
  if (dpto) {
    const code = mpioByName.get(dpto)?.get(key);
    if (code) return { dpto, mpio: code };
    // Bogotá: el municipio suele venir igual al departamento
    if (dpto === "11") return { dpto, mpio: "11001" };
    return { dpto, mpio: null };
  }
  // Sin departamento: solo si el nombre del municipio es único en el país
  const unique = uniqueMpio.get(key);
  if (unique) return { dpto: unique.slice(0, 2), mpio: unique };
  return { dpto, mpio: null };
}

export function dptoName(code: string): string {
  return DPTOS[code]?.n ?? code;
}

export function mpioName(code: string): string {
  return MPIOS[code]?.n ?? code;
}

export function mpioDpto(code: string): string | null {
  return MPIOS[code]?.d ?? null;
}

export function dptoBBox(code: string): [number, number, number, number] | null {
  return DPTOS[code]?.b ?? null;
}

export const DPTO_CODES = Object.keys(DPTOS);
