/**
 * Etiquetas legibles para toda la UI (gráficas, rankings, tablas, tooltips).
 * Solo cambia la PRESENTACIÓN: los valores de filtro siguen siendo la etiqueta cruda.
 */

export type LabelKind = "oficina" | "persona" | "proveedor" | "ente" | "generic";

export interface DisplayLabel {
  /** Para contextos compactos (con el texto completo en title). */
  short: string;
  /** Texto completo en tipo título es-CO. */
  full: string;
  /** Identificador secundario (NIT, sigla) en mono. */
  secondary?: string;
}

const CONNECTORS = new Set(["de", "del", "y", "e", "la", "las", "los", "el", "en", "a", "al", "o", "u", "para", "por", "con", "sin", "su", "sus"]);

/** Siglas que se conservan en mayúsculas. */
const ACRONYMS: Record<string, string> = {
  pqrd: "PQRD",
  arl: "ARL",
  jrc: "JRC",
  ml: "ML",
  ia: "IA",
  ai: "AI",
  nit: "NIT",
  dian: "DIAN",
  radian: "RADIAN",
  sla: "SLA",
  pcl: "PCL",
  at: "AT",
  eps: "EPS",
  ips: "IPS",
  sfc: "SFC",
  cufe: "CUFE",
  "d.c.": "D.C.",
  "d.c": "D.C.",
  "s.a.": "S.A.",
  "s.a": "S.A.",
  "s.a.s.": "S.A.S.",
  "s.a.s": "S.A.S.",
  sas: "S.A.S.",
  ltda: "LTDA",
  "ltda.": "LTDA.",
  ii: "II",
  iii: "III",
  iv: "IV",
  web: "Web",
  sms: "SMS",
  fc: "FC",
  nc: "NC",
  nd: "ND",
};

/** Sigla del ente de control (monograma de EntityTiles). */
export const ENTE_ACRONYMS: Record<string, string> = {
  superfinanciera: "SFC",
  "superintendencia financiera": "SFC",
  supersalud: "SNS",
  "superintendencia nacional de salud": "SNS",
  mintrabajo: "MT",
  "ministerio del trabajo": "MT",
  "rama judicial": "RJ",
  fiscalia: "FGN",
  "fiscalia general de la nacion": "FGN",
  "defensoria del pueblo": "DP",
  contraloria: "CGR",
  procuraduria: "PGN",
};

const OFFICE_ABBR: [RegExp, string][] = [
  [/\bVicepresidencia\b/g, "Vic."],
  [/\bGerencia\b/g, "Ger."],
  [/\bDirección\b/g, "Dir."],
  [/\bSubgerencia\b/g, "Subg."],
  [/\bCoordinación\b/g, "Coord."],
  [/\bDepartamento\b/g, "Depto."],
  [/\bRegional\b/g, "Reg."],
];

const bare = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function isMostlyUpper(s: string): boolean {
  const letters = s.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, "");
  if (letters.length < 3) return false;
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, "").length;
  return upper / letters.length > 0.7;
}

/**
 * Tildes que la fuente pierde en MAYÚSCULAS ("GERENCIA MEDICA" → "Gerencia Médica").
 * Solo se aplican al pasar de mayúsculas a tipo título (titleCase), nunca a textos ya escritos.
 */
const ACCENTS: Record<string, string> = {
  medica: "médica",
  medico: "médico",
  medicas: "médicas",
  medicos: "médicos",
  juridica: "jurídica",
  juridico: "jurídico",
  tecnica: "técnica",
  tecnico: "técnico",
  publica: "pública",
  publico: "público",
  clinica: "clínica",
  economica: "económica",
  bogota: "bogotá",
  atlantico: "atlántico",
  bolivar: "bolívar",
  boyaca: "boyacá",
  caqueta: "caquetá",
  cordoba: "córdoba",
  quindio: "quindío",
  narino: "nariño",
};

/** Corrige tildes de una palabra en minúsculas: diccionario + terminación -ión (aguda en n: siempre lleva tilde). */
function fixAccents(lower: string): string {
  const m = lower.match(/^([^a-záéíóúñü]*)([a-záéíóúñü]+)([^a-záéíóúñü]*)$/);
  if (!m) return lower;
  const [, pre, word, post] = m;
  const fixed = ACCENTS[word] ?? (word.length >= 5 && !/[áéíóú]/.test(word) ? word.replace(/ion$/, "ión") : word);
  return `${pre}${fixed}${post}`;
}

/**
 * Siglas que coinciden con un conector ("EL" = enfermedad laboral): al FINAL de un texto en
 * MAYÚSCULAS no pueden ser artículo ("ORIGEN EL" → "Origen EL", como "Origen AT").
 */
const TRAILING_ACRONYMS = new Set(["el"]);

/** Tipo título es-CO: conectores en minúscula, siglas en mayúscula y tildes perdidas restituidas. */
export function titleCase(raw: string): string {
  const words = raw.trim().split(/\s+/);
  const last = words.length - 1;
  return words
    .map((w, i) => {
      const key = bare(w).replace(/[,;:()]/g, "");
      const acr = ACRONYMS[key];
      if (acr) return w.replace(new RegExp(key.replace(/\./g, "\\."), "i"), acr).replace(/^[a-záéíóúñü]/, (c) => c) || acr;
      if (i > 0 && i === last && TRAILING_ACRONYMS.has(key) && w === w.toLocaleUpperCase("es-CO")) return w;
      const lower = fixAccents(w.toLocaleLowerCase("es-CO"));
      if (i > 0 && CONNECTORS.has(key)) return lower;
      // Palabras con guion o barra: capitaliza cada parte
      return lower.replace(/(^|[-/(“"])([a-záéíóúñü])/g, (_m, p: string, c: string) => p + c.toLocaleUpperCase("es-CO"));
    })
    .join(" ");
}

/**
 * Tipo oración conservando siglas ("Cuenta De Cobro" → "Cuenta de cobro").
 * Para etiquetas genéricas que la fuente escribió con mayúscula inicial en cada palabra y para listas
 * de estados, que se leen en tipo oración ("Confirma a Favor" → "Confirma a favor", junto a "A favor").
 */
export function sentenceCase(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w, i) => {
      const key = bare(w).replace(/[,;:()]/g, "");
      if (ACRONYMS[key]) return ACRONYMS[key];
      // Siglas de 2–4 letras que no están en la lista blanca (PYP, SOAT): se conservan
      if (/^[A-ZÁÉÍÓÚÑ]{2,4}$/.test(w)) return w;
      const lower = w.toLocaleLowerCase("es-CO");
      return i === 0 ? lower.charAt(0).toLocaleUpperCase("es-CO") + lower.slice(1) : lower;
    })
    .join(" ");
}

/** Conector en mayúscula en medio del texto ("Cuenta De Cobro"): señal de un tipo título ingenuo de la fuente. */
function hasCapitalizedConnector(s: string): boolean {
  return s
    .trim()
    .split(/\s+/)
    // Conectores de 2+ letras: "Tipo A" o "Vitamina E" no son conectores
    .some((w, i) => i > 0 && /^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+$/.test(w) && CONNECTORS.has(bare(w)));
}

/**
 * Formas canónicas de etiquetas frecuentes (sin tildes, minúsculas → texto visible).
 * Neutrales en tipo oración y variantes de escritura de la misma categoría entre tableros hermanos.
 */
const CANONICAL: Record<string, string> = {
  "no reporta": "No reporta",
  "sin clasificar": "Sin clasificar",
  "sin categoria": "Sin categoría",
  "sin dato": "Sin dato",
  "sin informacion": "Sin información",
  "no aplica": "No aplica",
  "derecho de peticion": "Derecho de petición",
  "cuenta de cobro": "Cuenta de cobro",
  "factura administrativa": "Factura administrativa",
  "medicina laboral": "Medicina laboral",
  "entes control": "Entes de control",
  "entes de control": "Entes de control",
};

/**
 * Plazos con unidad escritos de varias formas en las vistas ("1 Días", "5 Horas", "6 día(s) hábiles"):
 * una sola forma con concordancia de número ("1 día", "5 horas", "6 días hábiles", "1 día hábil").
 * Devuelve null si el texto no es un plazo.
 */
export function durationLabel(raw: string): string | null {
  const m = raw.trim().match(/^(\d+)\s*(d[ií]as?|horas?)(?:\s*\(s\))?(\s+h[aá]biles?)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const one = n === 1;
  const unit = /^h/i.test(m[2]) ? (one ? "hora" : "horas") : one ? "día" : "días";
  const business = m[3] ? (one ? " hábil" : " hábiles") : "";
  return `${m[1]} ${unit}${business}`;
}

/** "6 Grupo Centro de Excelencia" → "Grupo Centro de Excelencia 6" (el número inicial es parte del nombre, no un rango). */
function trailingCode(s: string): string {
  const m = s.match(/^(\d{1,2})\s+(?=[A-Za-zÁÉÍÓÚÑáéíóúñ])(.+)$/);
  return m ? `${m[2]} ${m[1]}` : s;
}

/** Quita el prefijo ordinal de 1–2 dígitos ("1. Lunes" → "Lunes"). */
export function stripOrdinal(label: string): string {
  return label.replace(/^\s*\d{1,2}\.\s*/, "");
}

const DAYS_SHORT: Record<string, string> = { lunes: "Lun", martes: "Mar", miercoles: "Mié", jueves: "Jue", viernes: "Vie", sabado: "Sáb", domingo: "Dom" };

/** "7. Domingo" → "Dom". Devuelve null si no es un día. */
export function dayShort(label: string): string | null {
  return DAYS_SHORT[bare(stripOrdinal(label)).trim()] ?? null;
}

/**
 * Etiqueta visible. Solo normaliza la capitalización cuando el dato viene en MAYÚSCULAS
 * (o es un nombre de persona), para no alterar textos ya correctos.
 */
export function displayLabel(raw: string, kind: LabelKind = "generic"): DisplayLabel {
  const src = stripOrdinal((raw ?? "").trim().replace(/\s+/g, " "));
  if (!src) return { short: "No reporta", full: "No reporta" };

  // Neutrales y variantes frecuentes: una sola forma en todo el aplicativo ("NO REPORTA", "Sin Clasificar")
  const canonical = CANONICAL[bare(src)];
  if (canonical) return { short: canonical, full: canonical };
  const duration = durationLabel(src);
  if (duration) return { short: duration, full: duration };

  if (kind === "proveedor") {
    const m = src.match(/^\[\s*([\d.\-]+)\s*\]\s*(.+)$/);
    if (m) {
      const name = isMostlyUpper(m[2]) ? titleCase(m[2]) : m[2];
      return { short: name, full: name, secondary: `NIT ${m[1]}` };
    }
  }

  let full = kind === "persona" || isMostlyUpper(src) ? titleCase(src) : src;
  // Genéricas con tipo título ingenuo de la fuente ("Cuenta De Cobro") → tipo oración, como sus hermanas
  if (kind === "generic" && full === src && hasCapitalizedConnector(src)) full = sentenceCase(src);

  if (kind === "ente") {
    const acr = ENTE_ACRONYMS[bare(src)];
    return { short: full, full, secondary: acr };
  }
  if (kind === "oficina") {
    full = trailingCode(full);
    let short = full;
    for (const [re, abbr] of OFFICE_ABBR) short = short.replace(re, abbr);
    return { short, full };
  }
  return { short: full, full };
}

/**
 * Segundos nombres frecuentes: con 3 partes, "María José Pérez" es nombre compuesto + apellido;
 * "Lorena Castro Acosta" es nombre + dos apellidos.
 */
const GIVEN_NAMES = new Set(
  [
    "jose", "maria", "juan", "luis", "carlos", "andres", "alberto", "antonio", "eduardo", "enrique", "fernando", "felipe",
    "alejandro", "alejandra", "andrea", "camilo", "camila", "david", "daniel", "esteban", "francisco", "javier", "jesus",
    "jorge", "manuel", "mauricio", "miguel", "pablo", "patricia", "paola", "isabel", "fernanda", "lucia", "teresa", "elena",
    "cristina", "carolina", "marcela", "alexandra", "adriana", "beatriz", "ines", "ximena", "sofia", "valentina", "victoria",
    "angel", "augusto", "arturo", "ricardo", "rafael", "gabriel", "gustavo", "hernan", "humberto", "ignacio", "ivan", "julian",
    "leonardo", "mario", "mateo", "nicolas", "orlando", "oscar", "sebastian", "sergio", "tomas", "alfonso", "ernesto", "german",
    "guillermo", "jaime", "julio", "rodrigo", "milena", "johana", "liliana", "lorena", "amparo", "angelica", "ana", "natalia",
    "laura", "diana", "juliana", "stella", "yolanda", "helena", "eugenia", "del", "pilar", "consuelo", "cecilia", "margarita",
  ],
);

/**
 * Iniciales para avatares con la convención colombiana: nombre + primer apellido.
 * "Lorena Castro Acosta" → "LC" · "María José Pérez" → "MP" · "Juan Carlos Rojas Gómez" → "JR".
 */
export function initials(name: string): string {
  const parts = name
    .replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p && !CONNECTORS.has(bare(p)));
  if (!parts.length) return "?";
  let second: string;
  if (parts.length === 1) second = parts[0][1] ?? "";
  else if (parts.length === 2) second = parts[1][0];
  else if (parts.length === 3) second = GIVEN_NAMES.has(bare(parts[1])) ? parts[2][0] : parts[1][0];
  else second = parts[2][0];
  return `${parts[0][0]}${second}`.toLocaleUpperCase("es-CO");
}
