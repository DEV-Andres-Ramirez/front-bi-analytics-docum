#!/usr/bin/env node
/**
 * Construye los perfiles ANONIMIZADOS de datos mock a partir de los CSV locales
 * de top_secret/db (que NO se versionan). Salida: src/server/data/mock/profiles/<id>.json
 *
 * Uso:  node scripts/mock/build-profiles.mjs
 *
 * Ver scripts/mock/config.mjs para qué se conserva de cada vista.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DATASETS } from "./config.mjs";
import { readCSV } from "./csv.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "top_secret", "db");
const OUT = join(ROOT, "src", "server", "data", "mock", "profiles");
const SALT = "docum-bi-mock-v1";

if (!existsSync(SRC)) {
  console.error(`No existe ${SRC}. Este script solo corre en local con los CSV de contexto.`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

// ─── Fechas ──────────────────────────────────────────────────────────────────
const NULLISH = /^(|no reporta|no reporta sin fecha vencimiento|n\/a|null|none)$/i;

function parseDate(value, format, time) {
  if (!value || NULLISH.test(value.trim())) return null;
  const v = value.trim();
  let m;
  if (format === "dmy2" && (m = v.match(/^(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/))) {
    return Date.UTC(2000 + +m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
  }
  if (format === "dmy4" && (m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/))) {
    return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
  }
  if ((format === "iso" || format === "utc") && (m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/))) {
    let ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
    if (time && !m[4]) {
      const t = time.match(/^(\d{2}):(\d{2})/);
      if (t) ms += (+t[1] * 60 + +t[2]) * 60_000;
    }
    // Los timestamps "UTC" se llevan a hora de pared de Bogotá (UTC-5)
    if (format === "utc") ms -= 5 * 3_600_000;
    return ms;
  }
  return null;
}

// ─── Seudónimos ──────────────────────────────────────────────────────────────
const FIRST = [
  "Andrea", "Carlos", "Diana", "Felipe", "Laura", "Julián", "Natalia", "Santiago", "Camila", "Mateo",
  "Valentina", "Sebastián", "Paula", "Andrés", "Mariana", "Daniel", "Juliana", "Nicolás", "Carolina", "David",
  "Alejandra", "Tomás", "Lorena", "Esteban", "Viviana", "Mauricio", "Catalina", "Óscar", "Ximena", "Ricardo",
  "Luisa", "Gabriel", "Marcela", "Iván", "Tatiana", "Camilo", "Sofía", "Hernán", "Adriana", "Fernando",
];
const LAST = [
  "Rojas", "Gómez", "Martínez", "Herrera", "Castro", "Vargas", "Moreno", "Jiménez", "Ortiz", "Rincón",
  "Salazar", "Cárdenas", "Mejía", "Pardo", "Quintero", "Acosta", "Beltrán", "Cifuentes", "Duarte", "Escobar",
  "Forero", "Galvis", "Hurtado", "Lozano", "Montoya", "Navarro", "Ospina", "Peña", "Restrepo", "Sierra",
  "Téllez", "Uribe", "Valencia", "Zapata", "Arango", "Bermúdez", "Cortés", "Delgado", "Franco", "Guzmán",
];
const KEEP_TOKEN = /^(|no reporta|n\/a|null|user|sin definir|ninguno|no aplica)$/i;

function hashInt(value, salt = "") {
  return createHash("sha256").update(`${SALT}|${salt}|${value}`).digest().readUInt32BE(0);
}

function pseudoName(real) {
  const v = (real ?? "").trim();
  if (KEEP_TOKEN.test(v)) return v;
  const h = hashInt(v.toLowerCase(), "name");
  const f = FIRST[h % FIRST.length];
  const l1 = LAST[(h >>> 8) % LAST.length];
  const l2 = LAST[(h >>> 16) % LAST.length];
  return `${f} ${l1} ${l2}`;
}

function pseudoNit(real) {
  const v = (real ?? "").trim();
  if (!v || KEEP_TOKEN.test(v)) return v;
  const digits = v.replace(/\D/g, "");
  const h = hashInt(digits, "nit");
  const body = String(h % 100_000_000).padStart(8, "0");
  return digits.length >= 10 ? `1${body}${h % 10}` : `9${body}`;
}

// ─── Construcción ────────────────────────────────────────────────────────────
function toNumber(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s || NULLISH.test(s)) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function build(cfg) {
  let rows = cfg.files.flatMap((f) => readCSV(join(SRC, f)));
  if (cfg.dedupe) {
    const seen = new Set();
    rows = rows.filter((r) => {
      const k = r[cfg.dedupe];
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  const numeric = new Set(cfg.numeric ?? []);
  const offsetCols = Object.keys(cfg.offsets ?? {});
  const flagCols = Object.keys(cfg.flags ?? {});
  const columns = [
    ...(cfg.keep ?? []),
    ...(cfg.pseudo ?? []),
    ...(cfg.pseudoNit ?? []),
    ...flagCols,
    ...offsetCols.map((c) => `__off_${c}`),
  ];
  const dicts = Object.fromEntries(columns.map((c) => [c, []]));
  const dictIndex = Object.fromEntries(columns.map((c) => [c, new Map()]));
  const encode = (col, value) => {
    const key = value === null ? "\u0000null" : String(value);
    let idx = dictIndex[col].get(key);
    if (idx === undefined) {
      idx = dicts[col].length;
      dicts[col].push(value);
      dictIndex[col].set(key, idx);
    }
    return idx;
  };

  const tupleIndex = new Map();
  const tuples = [];
  const weights = [];
  const weekday = Array(7).fill(0);
  const hour = Array(24).fill(0);
  const independent = Object.fromEntries((cfg.independent ?? []).map((c) => [c, new Map()]));
  const geo = new Map();

  for (const r of rows) {
    const base = parseDate(r[cfg.base.field], cfg.base.format, cfg.base.time ? r[cfg.base.time] : undefined);
    if (base !== null) {
      const d = new Date(base);
      weekday[(d.getUTCDay() + 6) % 7]++;
      hour[d.getUTCHours()]++;
    }

    const values = columns.map((col) => {
      if (col.startsWith("__off_")) {
        const src = col.slice(6);
        const other = parseDate(r[src], cfg.offsets[src]);
        if (base === null || other === null) return encode(col, null);
        return encode(col, Math.round(((other - base) / 3_600_000) * 4) / 4);
      }
      if (flagCols.includes(col)) {
        const raw = (r[cfg.flags[col]] ?? "").trim();
        return encode(col, raw && !KEEP_TOKEN.test(raw) ? "Sí" : "No");
      }
      if (cfg.pseudo?.includes(col)) return encode(col, pseudoName(r[col]));
      if (cfg.pseudoNit?.includes(col)) return encode(col, pseudoNit(r[col]));
      if (numeric.has(col)) return encode(col, toNumber(r[col]));
      return encode(col, (r[col] ?? "").replace(/ /g, " "));
    });
    const key = values.join(",");
    const existing = tupleIndex.get(key);
    if (existing !== undefined) weights[existing]++;
    else {
      tupleIndex.set(key, tuples.length);
      tuples.push(values);
      weights.push(1);
    }

    for (const c of cfg.independent ?? []) {
      const v = (r[c] ?? "").trim();
      independent[c].set(v, (independent[c].get(v) ?? 0) + 1);
    }

    let geoValues = null;
    if (cfg.geo) geoValues = cfg.geo.map((c) => (r[c] ?? "").trim());
    else if (cfg.geoFrom) {
      const parts = (r[cfg.geoFrom.field] ?? "").split(cfg.geoFrom.separator).map((s) => s.trim());
      geoValues = [parts[1] ?? "", parts[2] ?? ""];
    }
    if (geoValues) {
      const k = JSON.stringify(geoValues);
      geo.set(k, (geo.get(k) ?? 0) + 1);
    }
  }

  const geoColumns = cfg.geo ?? cfg.geoFrom?.columns ?? [];
  return {
    id: cfg.id,
    source: cfg.files.map((f) => f.replace(/\.csv$/, "")),
    sampleRows: rows.length,
    note: "Perfil anonimizado generado por scripts/mock/build-profiles.mjs. Sin datos personales: nombres y NIT son seudónimos ficticios; no hay fechas reales ni textos libres.",
    columns,
    dicts,
    tuples,
    weights,
    independent: Object.fromEntries(
      Object.entries(independent).map(([c, m]) => [c, [...m.entries()].sort((a, b) => b[1] - a[1])]),
    ),
    geo: geoColumns.length
      ? { columns: geoColumns, values: [...geo.entries()].map(([k, n]) => [...JSON.parse(k), n]).sort((a, b) => b.at(-1) - a.at(-1)) }
      : null,
    weekday,
    hour,
  };
}

for (const cfg of DATASETS) {
  const profile = build(cfg);
  const path = join(OUT, `${cfg.id}.json`);
  writeFileSync(path, JSON.stringify(profile));
  const kb = (Buffer.byteLength(JSON.stringify(profile)) / 1024).toFixed(1);
  console.log(`✔ ${cfg.id.padEnd(20)} ${String(profile.sampleRows).padStart(5)} filas → ${profile.tuples.length} tuplas · ${kb} KB`);
}
