"use client";

import { ArrowDown, ArrowDownRight, ArrowRight, ChevronDown, ChevronsDownUp, ChevronsLeftRight, ChevronsRightLeft, ChevronsUpDown, CircleDashed, Info } from "lucide-react";
import { useCallback, useMemo, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { textWidth } from "@/components/dashboard/kpi/shared";
import { useElementSize } from "@/hooks/use-element-size";
import type { PivotResult } from "@/dashboards/dto";
import type { PivotWidget, StatusTone } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { isNeutral, resolveStatus, TONE_VARS } from "@/lib/charts/semantic";
import { inkOn, seqColor, useChartTheme } from "@/lib/charts/theme";
import { formatInt, formatPct } from "@/lib/format";
import { displayLabel, initials, type LabelKind } from "@/lib/labels";
import { ScaleLegend, Swatch } from "./kit/chart-legend";
import { ChartTooltip, useChartTooltip } from "./kit/chart-tooltip";
import { HeaderSlot } from "./kit/legend-slot";
import { QualityChip } from "./kit/quality";
import { StatusIcon } from "./kit/status-icon";
import { MoreButton } from "./list-kit";
import { EDGE_B, EDGE_L, EDGE_R, EDGE_T, useScrollEdges } from "./table-scroll";
import type { VizProps } from "./types";

/**
 * PivotHeatmap v2 / RolePivot (docs/ui-design-system.md › "PivotHeatmap v2 / RolePivot").
 * - Celdas píldora (2 px de separación, radio 4) con rampa raíz única; "·" en ceros.
 * - Columnas de estado con ícono y tono, ordenadas por severidad o ciclo de vida, con cabecera de grupo.
 * - Filas agrupadas (oficina › persona) plegables con subtotal; neutrales en gris, al final y fuera de escala.
 * - Cabecera, primera columna y totales fijos, con bandas de sombra continuas (table-scroll.ts)
 *   y un aviso "N filas · desplaza" cuando hay contenido oculto.
 * - Ancho medido: si primera columna + columnas + Total no caben, los grupos de columnas arrancan
 *   contraídos en una columna de subtotal (clic en la cabecera para expandir): primero lo cerrado
 *   (Finalizado, Anulado) y lo de menor volumen; el grupo más accionable (En curso = Pendientes) nunca
 *   se contrae solo: si no cabe, la tabla se desplaza en horizontal.
 * - Cabeceras sin palabras partidas: cada columna reserva el ancho de su palabra más larga y, con muchas
 *   columnas, las palabras de más de 12 letras se abrevian ("corresp.") con el nombre completo en title.
 *   Un grupo de una sola columna es su propia cabecera ("⚠ Reclasificar"; el estado va en el tooltip).
 * - Píldoras con ancho tope uniforme (≤ 56 px con muchas columnas, ≤ 96 px con pocas) y, si todo cabe,
 *   columnas de ancho igual salvo las que necesitan más para su cabecera (table-layout fixed); la fila
 *   parcialmente oculta se desvanece sobre el Total.
 * Tier "auto": ≥ 600 px, tabla con máximo de 640 px y scroll interno; < 600 px, vista por filas
 * (nombre, total, barra 100 % por grupo o columna y cifras) con alto por contenido y "Ver N más".
 */

// ─── Modelo ──────────────────────────────────────────────────────────────────
interface PivotCol {
  key: string;
  /** Índice en result.columns (-1 = columna estable sin registros). */
  src: number;
  label: string;
  tone: StatusTone | null;
  group?: string;
  neutral: boolean;
  total: number;
}

interface PivotLeaf {
  id: string;
  label: string;
  /** Etiqueta compacta (Ger., Dir.…) para la primera columna de la tabla. */
  short: string;
  /** Texto completo (title) cuando label es abreviado. */
  full: string;
  neutral: boolean;
  person: boolean;
  values: number[];
  total: number;
}

interface PivotGroup {
  key: string;
  label: string;
  short: string;
  full: string;
  neutral: boolean;
  leaves: PivotLeaf[];
  values: number[];
  total: number;
  /** Único hijo y es "Sin responsable": se dibuja como una fila de oficina. */
  merged: boolean;
}

interface ColumnRun {
  key: string;
  label: string;
  tone: StatusTone | null;
  /** Índice de la primera columna del grupo en model.cols. */
  start: number;
  span: number;
  count: number;
  total: number;
}

/** Columna visible: una columna del modelo o un grupo contraído (subtotal de sus columnas). */
interface DisplayCol {
  key: string;
  label: string;
  /** Texto visible de la cabecera (abreviado con muchas columnas; el grupo si es su única columna). */
  head: string;
  /** Nombre completo (title, lector de pantalla y tooltip): "Reclasificar › Solicitud de reclasificación". */
  full: string;
  tone: StatusTone | null;
  neutral: boolean;
  total: number;
  /** Índices en model.cols que suma. */
  idx: number[];
  /** Grupo contraído: número de columnas que resume. */
  folded: number;
  /** Clave del plegado que la produce (para expandirla). */
  foldKey?: string;
  /** Única columna de su grupo: una sola cabecera (ocupa las dos filas) en lugar de franja + etiqueta. */
  solo?: boolean;
  /** Ancho mínimo estimado (px). */
  width: number;
}

/** Cabecera efectiva de una columna del modelo. */
interface ColHead {
  head: string;
  full: string;
  solo: boolean;
}

/** Plegado posible: un grupo de varias columnas, o una secuencia contigua de grupos de una sola columna. */
interface Fold {
  key: string;
  label: string;
  tone: StatusTone | null;
  /** Índices en runs que cubre (contiguos). */
  runs: number[];
  idx: number[];
  total: number;
  /** Secuencia de grupos pequeños (se pliega antes que cualquier grupo grande). */
  small: boolean;
}

/** Segmento de la cabecera de grupos: un grupo tal cual, un grupo de una sola columna o un plegado contraído. */
type Segment = { type: "run"; run: ColumnRun } | { type: "solo"; run: ColumnRun; col: DisplayCol } | { type: "fold"; fold: Fold; col: DisplayCol };

/** Parte de la barra 100 % de la vista por filas (móvil): un grupo de columnas o una columna. */
interface Part {
  key: string;
  label: string;
  tone: StatusTone | null;
  neutral: boolean;
  total: number;
  color: string;
  idx: number[];
}

type Line =
  | { type: "group"; key: string; label: string; short: string; full: string; neutral: boolean; values: number[]; total: number; count: number; open: boolean }
  | { type: "leaf"; key: string; label: string; short: string; full: string; neutral: boolean; person: boolean; depth: 0 | 1; values: number[]; total: number; groupLabel?: string; note?: string; office?: boolean };

const PERSON_FIELD = /responsable_de|asignador|gestionador|revisor|aprobador|usuario|funcionario|abogado|persona/i;
const OFFICE_FIELD = /oficina|gerencia|dependencia/i;

function guessKind(field: string | undefined): LabelKind | undefined {
  if (!field) return undefined;
  if (OFFICE_FIELD.test(field)) return "oficina";
  if (PERSON_FIELD.test(field)) return "persona";
  return undefined;
}

function neutralText(kind: LabelKind, raw: string): string {
  if (kind === "persona") return "Sin responsable asignado";
  if (kind === "oficina") return "Sin oficina asignada";
  return displayLabel(raw).full;
}

function buildColumns(widget: PivotWidget, result: PivotResult): PivotCol[] {
  const family = widget.vizOptions?.columnFamily ?? widget.semantic;
  const overrides = widget.vizOptions?.overrides;
  const explicit = widget.vizOptions?.groups;
  const keys = [...result.columns];
  for (const s of widget.stableColumns ?? []) if (!keys.includes(s) && !(widget.columnExclude ?? []).includes(s)) keys.push(s);

  const items = keys.map((key, i) => {
    const src = result.columns.indexOf(key);
    const st = family ? resolveStatus(key, family, overrides) : null;
    const group = explicit ? Object.keys(explicit).find((g) => explicit[g].includes(key)) : (st?.group ?? undefined);
    const col: PivotCol = {
      key,
      src,
      label: st?.display ?? displayLabel(key).full,
      tone: st?.tone ?? null,
      group,
      neutral: isNeutral(key),
      total: src >= 0 ? (result.totals[src] ?? 0) : 0,
    };
    return { col, order: st?.order ?? 50, i };
  });

  const groupRank = new Map<string, number>();
  if (explicit) Object.keys(explicit).forEach((g, gi) => groupRank.set(g, gi));
  else for (const it of items) if (it.col.group) groupRank.set(it.col.group, Math.min(groupRank.get(it.col.group) ?? Infinity, it.order));
  const pos = (k: string) => {
    const p = widget.columnOrder?.indexOf(k) ?? -1;
    return p < 0 ? 1e6 : p;
  };
  const rank = (it: (typeof items)[number]) => (it.col.group !== undefined ? (groupRank.get(it.col.group) ?? 1e6) : explicit ? 1000 + it.order : it.order);

  items.sort((a, b) => {
    if (a.col.neutral !== b.col.neutral) return a.col.neutral ? 1 : -1;
    if (widget.columnOrder) return pos(a.col.key) - pos(b.col.key) || a.i - b.i;
    if (family || explicit) return rank(a) - rank(b) || a.order - b.order || a.i - b.i;
    return a.i - b.i;
  });
  return items.map((it) => it.col);
}

/** Cabecera de grupo de columnas (solo si hay ≥ 2 grupos contiguos con nombre). */
function columnRuns(cols: PivotCol[]): ColumnRun[] | null {
  const named = new Set(cols.filter((c) => !c.neutral && c.group).map((c) => c.group));
  if (named.size < 2) return null;
  const runs: ColumnRun[] = [];
  cols.forEach((c, i) => {
    const key = c.group ?? "";
    const last = runs.at(-1);
    if (last && last.key === key) {
      last.span++;
      last.count++;
      last.total += c.total;
      if (last.tone !== c.tone) last.tone = null;
    } else runs.push({ key, label: key, tone: c.tone, start: i, span: 1, count: 1, total: c.total });
  });
  const seen = new Set<string>();
  for (const r of runs) {
    if (!r.key) continue;
    if (seen.has(r.key)) return null; // grupos no contiguos (orden explícito): sin cabecera de grupo
    seen.add(r.key);
  }
  return runs;
}

function buildModel(widget: PivotWidget, result: PivotResult) {
  const cols = buildColumns(widget, result);
  const grouped = widget.rows.length > 1 && result.rows.some((r) => r.group !== undefined);
  const leafField = widget.rows.at(-1)?.field;
  const leafKind: LabelKind = widget.labelKind ?? guessKind(leafField) ?? (grouped ? "persona" : "generic");
  const groupKind: LabelKind = guessKind(widget.rows[0]?.field) ?? "oficina";
  const pick = (values: number[]) => cols.map((c) => (c.src >= 0 ? (values[c.src] ?? 0) : 0));

  const leaves: (PivotLeaf & { group?: string })[] = result.rows.map((r, i) => {
    const neutral = isNeutral(r.label);
    const d = displayLabel(r.label, leafKind);
    const label = neutral ? neutralText(leafKind, r.label) : d.full;
    return {
      id: `${r.group ?? ""}\u0001${r.label}\u0001${i}`,
      label,
      short: neutral ? label : d.short,
      full: d.full,
      neutral,
      person: leafKind === "persona",
      values: pick(r.values),
      total: r.total,
      group: r.group,
    };
  });

  let groups: PivotGroup[] = [];
  if (grouped) {
    const map = new Map<string, PivotGroup>();
    for (const l of leaves) {
      const key = l.group ?? "No reporta";
      let g = map.get(key);
      if (!g) {
        const neutral = isNeutral(key);
        const d = displayLabel(key, groupKind);
        const label = neutral ? neutralText(groupKind, key) : d.full;
        g = { key, label, short: neutral ? label : d.short, full: d.full, neutral, leaves: [], values: cols.map(() => 0), total: 0, merged: false };
        map.set(key, g);
      }
      g.leaves.push(l);
      l.values.forEach((v, ci) => (g.values[ci] += v));
      g.total += l.total;
    }
    groups = [...map.values()];
    // Neutrales al final (orden estable)
    groups = [...groups.filter((g) => !g.neutral), ...groups.filter((g) => g.neutral)];
    for (const g of groups) {
      g.leaves = [...g.leaves.filter((l) => !l.neutral), ...g.leaves.filter((l) => l.neutral)];
      g.merged = g.leaves.length === 1 && g.leaves[0].neutral;
    }
  }
  const flat = grouped ? [] : [...leaves.filter((l) => !l.neutral), ...leaves.filter((l) => l.neutral)];
  const allMerged = grouped && groups.length > 0 && groups.every((g) => g.merged);

  // Escala: celdas no neutrales (filas y columnas); los neutrales van en gris y fuera del máximo
  let max = 0;
  let min = Infinity;
  const scan = (values: number[]) =>
    values.forEach((v, ci) => {
      if (cols[ci].neutral || !v) return;
      if (v > max) max = v;
      if (v < min) min = v;
    });
  if (grouped) for (const g of groups) (g.merged ? [g.values] : g.leaves.filter((l) => !l.neutral).map((l) => l.values)).forEach(scan);
  else flat.filter((l) => !l.neutral).forEach((l) => scan(l.values));
  if (!max) {
    max = result.max || 1;
    min = 1;
  }
  if (!Number.isFinite(min)) min = max;

  const grand = cols.reduce((a, c) => a + c.total, 0);
  const neutralRows = (grouped ? groups.flatMap((g) => g.leaves) : flat).filter((l) => l.neutral).reduce((a, l) => a + l.total, 0);
  const neutralCols = cols.filter((c) => c.neutral).reduce((a, c) => a + c.total, 0);
  const runs = columnRuns(cols);
  const many = cols.length > MANY_COLS;
  const heads = colHeads(cols, runs, many);
  const widths = heads.map((h) => colWidth(h.head, many));
  return { cols, runs, heads, widths, many, grouped, groups, flat, allMerged, leafKind, groupKind, max, min, grand, neutralRows, neutralCols };
}

type Model = ReturnType<typeof buildModel>;

const sumAt = (values: number[], idx: number[]) => idx.reduce((a, i) => a + (values[i] ?? 0), 0);

function sortBy<T extends { neutral: boolean; values: number[]; total: number }>(items: T[], key: number[] | null): T[] {
  if (key === null) return items;
  return [...items].sort((a, b) => (a.neutral !== b.neutral ? (a.neutral ? 1 : -1) : sumAt(b.values, key) - sumAt(a.values, key) || b.total - a.total));
}

function buildLines(m: Model, sort: number[] | null, collapsed: Set<string>): Line[] {
  if (!m.grouped)
    return sortBy(m.flat, sort).map((l) => ({ type: "leaf", key: l.id, label: l.label, short: l.short, full: l.full, neutral: l.neutral, person: l.person, depth: 0, values: l.values, total: l.total }));
  const lines: Line[] = [];
  for (const g of sortBy(m.groups, sort)) {
    if (g.merged) {
      lines.push({
        type: "leaf",
        key: `m:${g.key}`,
        label: g.label,
        short: g.short,
        full: g.full,
        neutral: g.neutral,
        person: false,
        office: true,
        depth: 0,
        values: g.values,
        total: g.total,
        note: m.allMerged ? undefined : m.leafKind === "persona" ? "Sin responsable asignado" : g.leaves[0].label,
      });
      continue;
    }
    const open = !collapsed.has(g.key);
    lines.push({ type: "group", key: `g:${g.key}`, label: g.label, short: g.short, full: g.full, neutral: g.neutral, values: g.values, total: g.total, count: g.leaves.filter((l) => !l.neutral).length, open });
    if (!open) continue;
    for (const l of sortBy(g.leaves, sort))
      lines.push({ type: "leaf", key: l.id, label: l.label, short: l.short, full: l.full, neutral: l.neutral, person: l.person, depth: 1, values: l.values, total: l.total, groupLabel: g.label });
  }
  return lines;
}

// ─── Ancho: columnas y grupos contraídos ─────────────────────────────────────
/** Más columnas que esto: cabeceras compactas (10,5 px, palabras largas abreviadas) y píldoras de ≤ 56 px. */
const MANY_COLS = 8;
const TOTAL_W = 104;
const FOLDED_W = 84;
/** Ancho mínimo de columna con muchas columnas (píldora de 50 px: 3 cifras holgadas) y con pocas. */
const MIN_COL_MANY = 52;
const MIN_COL_FEW = 76;
/** Relleno horizontal de la cabecera (botón + celda) + 2 px de holgura, por modo. */
const HEAD_PAD_MANY = 6;
const HEAD_PAD_FEW = 12;
/** Cuerpo de la cabecera (px) por modo; ColHeader usa los mismos tamaños. */
const HEAD_PX_MANY = 10.5;
const HEAD_PX_FEW = 11;
/** Con muchas columnas, las palabras de más letras que esto se abrevian en la cabecera. */
const LONG_WORD = 12;
const EMPTY = new Set<string>();

const VOWEL = /[aeiouáéíóúü]/i;
const LETTER = /\p{L}/u;

/**
 * Abreviatura por truncamiento, como se abrevia en español: corte ante vocal tras consonante con al
 * menos 7 letras y punto final ("correspondencia" → "corresp.", "reclasificación" → "reclasif.").
 */
function abbreviateWord(word: string): string {
  if (word.length <= LONG_WORD) return word;
  for (let i = 7; i <= word.length - 3; i++) if (LETTER.test(word[i - 1]) && !VOWEL.test(word[i - 1]) && VOWEL.test(word[i])) return `${word.slice(0, i)}.`;
  return word;
}

/** Ancho mínimo de una columna según su cabecera: la palabra más larga cabe entera (nunca se parte con guion). */
function colWidth(text: string, many: boolean): number {
  const longest = Math.max(0, ...text.split(/\s+/).map((w) => textWidth(w, many ? HEAD_PX_MANY : HEAD_PX_FEW, "semibold")));
  return Math.max(many ? MIN_COL_MANY : MIN_COL_FEW, longest + (many ? HEAD_PAD_MANY : HEAD_PAD_FEW));
}

/**
 * Cabecera efectiva de cada columna: su etiqueta o, si es la única de su grupo, el nombre del grupo
 * (una sola cabecera "⚠ Reclasificar"; el estado queda en title y tooltip). Con muchas columnas, las
 * palabras largas se abrevian.
 */
function colHeads(cols: PivotCol[], runs: ColumnRun[] | null, many: boolean): ColHead[] {
  const solo = new Map<number, string>();
  for (const r of runs ?? []) if (r.key && r.span === 1) solo.set(r.start, r.label);
  return cols.map((c, i) => {
    const group = solo.get(i);
    const text = group ?? c.label;
    return {
      head: many ? text.split(" ").map(abbreviateWord).join(" ") : text,
      full: group && group !== c.label ? `${group} › ${c.label}` : c.label,
      solo: group !== undefined,
    };
  });
}

const SMALL_FOLD = "__pequenos";

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} y ${labels[1]}`;
  return "Otros estados";
}

/** Plegados posibles: la primera secuencia contigua de ≥ 2 grupos de una sola columna y cada grupo de varias columnas. */
function buildFolds(runs: ColumnRun[] | null): Fold[] {
  if (!runs) return [];
  const folds: Fold[] = [];
  const range = (r: ColumnRun) => Array.from({ length: r.span }, (_, k) => r.start + k);
  let seq: number[] = [];
  let found = false;
  const flush = () => {
    if (!found && seq.length >= 2) {
      const rs = seq.map((i) => runs[i]);
      const tones = new Set(rs.map((r) => r.tone));
      folds.push({
        key: SMALL_FOLD,
        label: joinLabels(rs.map((r) => r.label)),
        tone: tones.size === 1 ? rs[0].tone : null,
        runs: [...seq],
        idx: rs.flatMap(range),
        total: rs.reduce((a, r) => a + r.total, 0),
        small: true,
      });
      found = true;
    }
    seq = [];
  };
  runs.forEach((r, i) => {
    if (r.key && r.span === 1) seq.push(i);
    else flush();
    if (r.key && r.span > 1) folds.push({ key: r.key, label: r.label, tone: r.tone, runs: [i], idx: range(r), total: r.total, small: false });
  });
  flush();
  return folds;
}

/** Ancho medio de un carácter de la primera columna (Montserrat 12,5 px). */
const ROW_CHAR_W = 6.4;
/** Holgura para la barra de scroll vertical clásica (Windows): la tabla nunca desborda por ella. */
const SLACK = 16;
/** Tope del ancho uniforme de columna (con muchas columnas, píldoras de 56 px; con pocas, de 96 px). */
const CELL_MAX_MANY = 96;
const CELL_MAX_FEW = 200;

/** Ancho de la columna Total: mini barra de 40 px + cifra del gran total (nunca se recorta). */
function totalWidth(grand: number): number {
  return Math.max(TOTAL_W, 68 + Math.ceil(formatInt(grand).length * 7.4));
}

/** Anchos de la tabla (px) para un conjunto de grupos contraídos. */
interface TableSizes {
  first: number;
  /**
   * Nivel común de las columnas abiertas cuando todo cabe: cada una mide max(su mínimo, cell), así que
   * son iguales salvo las que necesitan más para su cabecera (null = anchos mínimos y scroll horizontal).
   */
  cell: number | null;
  total: number;
}

/** Medidas compartidas por el plan de plegado y el reparto de anchos. */
function tableMetrics(width: number, m: Model, folds: Fold[], rowNeed: number, total: number) {
  const { many, widths } = m;
  const minFirst = width < 900 ? 180 : 200;
  const maxFirst = many ? 280 : 300;
  const room = width - SLACK - total;
  const need = (collapsed: Set<string>) => {
    let w = widths.reduce((a, x) => a + x, 0);
    for (const f of folds) if (collapsed.has(f.key)) w += FOLDED_W - f.idx.reduce((a, i) => a + widths[i], 0);
    return w;
  };
  return { many, minFirst, prefFirst: Math.max(minFirst, Math.min(maxFirst, rowNeed)), room, need, fits: (first: number, collapsed: Set<string>) => first + need(collapsed) <= room };
}

/**
 * Prioridad de plegado por tono del grupo: primero lo cerrado (Finalizado, Anulado), luego lo mixto
 * y al final lo accionable (En curso, Reclasificar, Devuelto, Vencido).
 */
const FOLD_RANK: Record<StatusTone, number> = { good: 0, neutral: 1, info: 3, warning: 4, serious: 5, critical: 6 };
const foldRank = (tone: StatusTone | null) => (tone ? FOLD_RANK[tone] : 2);

/**
 * Qué plegados arrancan contraídos para un ancho de contenedor (≥ 600 px). `rowNeed` es el ancho
 * con el que las etiquetas de fila caben en una línea. Orden: 1) los grupos pequeños (una columna
 * cada uno) se funden en una columna si así los nombres caben en una línea; 2) si ni con la primera
 * columna mínima caben, se contraen los grupos grandes en orden de FOLD_RANK y, a igual tono, el de
 * menor volumen. El grupo más accionable (el último del orden: "En curso", que coincide con el KPI
 * Pendientes) nunca se contrae solo: si aun así no cabe, la tabla se desplaza en horizontal con la
 * primera columna y el Total fijos; 3) los grupos pequeños se reabren si ya caben.
 */
function planFolds(width: number, m: Model, folds: Fold[], rowNeed: number, total: number): Set<string> | null {
  if (width < 600) return null;
  const { minFirst, prefFirst, fits } = tableMetrics(width, m, folds, rowNeed, total);
  const collapsed = new Set<string>();
  if (!m.runs) return collapsed;
  const small = folds.filter((f) => f.small);
  const big = folds.filter((f) => !f.small).sort((a, b) => foldRank(a.tone) - foldRank(b.tone) || a.total - b.total || a.idx.length - b.idx.length);
  for (const f of small) if (!fits(prefFirst, collapsed)) collapsed.add(f.key);
  for (const f of big.slice(0, -1)) if (!fits(minFirst, collapsed)) collapsed.add(f.key);
  // Reabrir los grupos pequeños si contraer un grupo grande liberó espacio
  for (const f of small) {
    if (!collapsed.has(f.key)) continue;
    collapsed.delete(f.key);
    if (!fits(prefFirst, collapsed)) collapsed.add(f.key);
  }
  return collapsed;
}

/**
 * Nivel de reparto: ancho común c tal que Σ max(wᵢ, c) = space. Las columnas cuya cabecera pide más
 * que c conservan su mínimo y el resto se reparte en partes iguales.
 */
function waterLevel(widths: number[], space: number): number {
  let n = widths.length;
  let fixed = 0;
  let c = space / n;
  for (const w of [...widths].sort((a, b) => b - a)) {
    if (w <= c) break;
    fixed += w;
    n--;
    c = n ? (space - fixed) / n : 0;
  }
  return Math.floor(c);
}

/**
 * Reparto de anchos para los grupos contraídos vigentes (automáticos o elegidos por la persona).
 * Si todo cabe, las columnas abiertas se reparten el espacio por nivel (waterLevel: iguales salvo las
 * que necesitan más para su palabra más larga) y lo que excede el tope va a la primera columna. Si no
 * cabe, anchos mínimos y scroll horizontal.
 */
function sizeTable(width: number, m: Model, folds: Fold[], collapsed: Set<string>, rowNeed: number, total: number): TableSizes | null {
  if (width < 600) return null;
  const { many, minFirst, prefFirst, room, need, fits } = tableMetrics(width, m, folds, rowNeed, total);
  if (!fits(minFirst, collapsed)) return { first: minFirst, cell: null, total };
  const shut = folds.filter((f) => collapsed.has(f.key));
  const hidden = new Set(shut.flatMap((f) => f.idx));
  const open = m.widths.filter((_, i) => !hidden.has(i));
  const avail = room - shut.length * FOLDED_W;
  if (!open.length) return { first: Math.round(avail), cell: null, total };
  const first = Math.max(minFirst, Math.min(prefFirst, room - need(collapsed)));
  const cell = Math.min(many ? CELL_MAX_MANY : CELL_MAX_FEW, waterLevel(open, avail - first));
  const used = open.reduce((a, w) => a + Math.max(w, cell), 0);
  return { first: Math.round(avail - used), cell, total };
}

/** Segmentos de la cabecera de grupos y columnas visibles según los plegados contraídos. */
function layoutCols(m: Model, folds: Fold[], collapsed: Set<string>): { dcols: DisplayCol[]; segments: Segment[] } {
  const { cols, runs, heads, widths } = m;
  const single = (c: PivotCol, i: number): DisplayCol => ({
    key: c.key,
    label: c.label,
    head: heads[i].head,
    full: heads[i].full,
    tone: c.tone,
    neutral: c.neutral,
    total: c.total,
    idx: [i],
    folded: 0,
    solo: heads[i].solo,
    width: widths[i],
  });
  if (!runs) return { dcols: cols.map((c, i) => single(c, i)), segments: [] };
  const dcols: DisplayCol[] = [];
  const segments: Segment[] = [];
  const foldAt = new Map<number, Fold>();
  const skip = new Set<number>();
  for (const f of folds) {
    if (!collapsed.has(f.key)) continue;
    foldAt.set(f.runs[0], f);
    f.runs.slice(1).forEach((i) => skip.add(i));
  }
  runs.forEach((r, i) => {
    if (skip.has(i)) return;
    const f = foldAt.get(i);
    if (f) {
      const col: DisplayCol = {
        key: `grp:${f.key}`,
        label: f.label,
        head: f.label,
        full: f.label,
        tone: f.tone,
        neutral: f.idx.every((k) => cols[k].neutral),
        total: f.total,
        idx: f.idx,
        folded: f.idx.length,
        foldKey: f.key,
        width: FOLDED_W,
      };
      dcols.push(col);
      segments.push({ type: "fold", fold: f, col });
      return;
    }
    if (r.key && r.span === 1) {
      const col = single(cols[r.start], r.start);
      dcols.push(col);
      segments.push({ type: "solo", run: r, col });
      return;
    }
    segments.push({ type: "run", run: r });
    for (let k = r.start; k < r.start + r.span; k++) dcols.push(single(cols[k], k));
  });
  return { dcols, segments };
}

function toneColor(c: { tone: StatusTone | null; neutral: boolean }, i: number): string {
  if (c.tone) return TONE_VARS[c.tone].solid;
  if (c.neutral) return "var(--chart-other)";
  return `var(--chart-${Math.min(5, i + 1)})`;
}

/** Partes de la barra por fila (móvil): grupos de columnas si existen; si no, columnas. */
function buildParts(cols: PivotCol[], runs: ColumnRun[] | null): Part[] {
  const single = (c: PivotCol, i: number): Part => ({ key: c.key, label: c.label, tone: c.tone, neutral: c.neutral, total: c.total, color: toneColor(c, i), idx: [i] });
  if (!runs) return cols.map(single);
  const out: Part[] = [];
  for (const r of runs) {
    const idx = Array.from({ length: r.span }, (_, k) => r.start + k);
    if (!r.key || r.span === 1) for (const i of idx) out.push(single(cols[i], i));
    else {
      const neutral = idx.every((i) => cols[i].neutral);
      out.push({ key: `grp:${r.key}`, label: r.label, tone: r.tone, neutral, total: r.total, color: toneColor({ tone: r.tone, neutral }, out.length), idx });
    }
  }
  return out;
}

const NOUN: Record<LabelKind, [string, string]> = {
  oficina: ["oficina", "oficinas"],
  persona: ["responsable", "responsables"],
  proveedor: ["proveedor", "proveedores"],
  ente: ["ente", "entes"],
  generic: ["fila", "filas"],
};
const countOf = (n: number, kind: LabelKind) => `${formatInt(n)} ${NOUN[kind][n === 1 ? 0 : 1]}`;

// ─── Estilos compartidos ─────────────────────────────────────────────────────
/** Total fijo a la derecha (la tabla solo se muestra con contenedor ≥ 600 px). */
const STICKY_R = cn("sticky right-0", EDGE_R);
/** Ancho de la primera columna (variable fijada por el plan de ancho o por container query). */
const FIRST_W = { width: "var(--pv-first)", minWidth: "var(--pv-first)", maxWidth: "var(--pv-first)" };
/** Filas visibles en la vista por filas (móvil) antes de "Ver N más". */
const LIST_LIMIT = 8;

// ─── Piezas ──────────────────────────────────────────────────────────────────
function Avatar({ name, neutral }: { name: string; neutral: boolean }) {
  if (neutral)
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-border-strong text-muted" aria-hidden>
        <CircleDashed className="size-3.5" />
      </span>
    );
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-3 text-[10px] font-bold text-text-2" aria-hidden>
      {initials(name)}
    </span>
  );
}

function ColHeader({ col, active, top, compact, rowSpan, onSort }: { col: DisplayCol; active: boolean; top: number; compact: boolean; rowSpan?: number; onSort: () => void }) {
  const abbreviated = col.head !== col.full;
  return (
    <th
      scope="col"
      rowSpan={rowSpan}
      aria-sort={active ? "descending" : "none"}
      style={{ top }}
      className={cn("sticky z-20 border-b border-border bg-surface pb-1 pt-1 align-bottom", compact ? "px-0" : "px-px", EDGE_T)}
    >
      <button
        type="button"
        onClick={onSort}
        title={`Ordenar por ${col.full}`}
        className={cn(
          "mx-auto flex w-full max-w-[120px] flex-col items-center gap-1 rounded-md pb-1 pt-1 text-center text-[11px] font-semibold leading-tight transition hover:bg-surface-3",
          compact ? "px-0.5" : "min-w-14 px-1",
          col.neutral ? "text-muted" : "text-text-2",
          active && "bg-primary-soft text-text",
        )}
      >
        {col.tone && <StatusIcon tone={col.tone} />}
        {/* Nunca se parte una palabra: la columna reserva el ancho de la más larga (colWidth) y, con muchas
            columnas (10,5 px), las de más de 12 letras llegan abreviadas ("corresp.") con el nombre completo
            en title y para el lector de pantalla */}
        <span className={cn("break-normal hyphens-manual", compact ? "text-wrap text-[10.5px]" : "text-balance")}>
          <span aria-hidden={abbreviated || undefined}>{col.head}</span>
          {abbreviated && <span className="sr-only">{col.full}</span>}
          {active && <ArrowDown className="ml-0.5 inline size-3 align-[-2px] text-primary-text" aria-label="Orden descendente" />}
        </span>
        <span aria-hidden className="mt-0.5 h-[3px] w-6 rounded-full" style={{ background: col.tone ? TONE_VARS[col.tone].solid : col.neutral ? "var(--neutral-mark)" : "transparent" }} />
      </button>
    </th>
  );
}

/** Cabecera de un grupo contraído (ocupa las dos filas de cabecera): expande al hacer clic. */
function FoldedHeader({ col, onToggle }: { col: DisplayCol; onToggle: () => void }) {
  return (
    <th rowSpan={2} scope="col" className={cn("sticky top-0 z-20 border-b border-border bg-surface px-px pb-1 pt-1 align-bottom", EDGE_T)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={false}
        title={`Expandir ${col.label} (${col.folded} columnas)`}
        className="mx-auto flex w-full flex-col items-center gap-1 rounded-md border border-dashed border-border-strong px-0.5 pb-1 pt-1.5 text-center text-[11px] font-semibold leading-tight text-text-2 transition hover:bg-surface-3"
        style={col.tone ? { background: TONE_VARS[col.tone].soft, color: TONE_VARS[col.tone].ink, borderColor: "transparent" } : undefined}
      >
        {col.tone && <StatusIcon tone={col.tone} />}
        <span className="break-normal text-balance hyphens-manual">{col.label}</span>
        <span className="tabular inline-flex items-center gap-0.5 text-[10.5px] font-medium opacity-80">
          <ChevronsLeftRight className="size-3" aria-hidden />
          {col.folded} columnas
        </span>
      </button>
    </th>
  );
}

/** Ancho tope de las píldoras (var --pv-pill): uniforme aunque alguna columna sea más ancha por su cabecera. */
const PILL_CAP = "max-w-(--pv-pill)";

function Pill({ v, bg, fg, gray, cell }: { v: number; bg: string; fg: string; gray: boolean; cell: string }) {
  if (!v)
    return (
      <td className="p-px" data-cell={cell}>
        <div className="grid h-7 place-items-center text-sm leading-none text-muted" aria-label="0">
          ·
        </div>
      </td>
    );
  return (
    <td className="p-px" data-cell={cell}>
      {/* Ancho tope uniforme: la intensidad se lee como color, no como área */}
      <div
        className={cn("tabular mx-auto grid h-7 w-full place-items-center rounded-[4px] px-1.5 text-[12px] font-semibold", PILL_CAP, gray && "bg-surface-3 text-text-2")}
        style={gray ? undefined : { background: bg, color: fg }}
      >
        {formatInt(v)}
      </div>
    </td>
  );
}

/** Subtotal de un grupo contraído: fuera de la rampa (no es una celda del heatmap). */
function FoldedCell({ v, cell }: { v: number; cell: string }) {
  return (
    <td className="p-px" data-cell={cell}>
      <div className={cn("tabular mx-auto grid h-7 w-full place-items-center rounded-[4px] border border-dashed border-border-strong text-[12px] font-bold", PILL_CAP, v ? "text-text" : "font-normal text-muted")}>
        {v ? formatInt(v) : "·"}
      </div>
    </td>
  );
}

function TotalCell({ total, max, neutral, strong }: { total: number; max: number; neutral: boolean; strong?: boolean }) {
  return (
    <td className={cn("z-10 bg-surface pl-3 pr-2 group-hover/row:bg-surface-2", STICKY_R)}>
      <div className="flex items-center justify-end gap-2">
        {max > 0 && (
          <span className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (total / max) * 100)}%`, background: neutral ? "var(--neutral-mark)" : "var(--chart-1)" }} />
          </span>
        )}
        <span className={cn("tabular min-w-8 text-right text-[12.5px]", strong ? "font-bold text-text" : "font-semibold text-text")}>{formatInt(total)}</span>
      </div>
    </td>
  );
}

/**
 * Resumen: barra 100 % + chips por parte (RolePivot: rol activo; móvil: leyenda de la vista por filas).
 * `action` va en la línea del Total (en tarjetas angostas, "Contraer todo" como enlace de texto).
 */
function PivotSummary({ parts, total, unit, action }: { parts: Part[]; total: number; unit: string; action?: ReactNode }) {
  const shares = parts.map((p) => ({ ...p, share: total ? p.total / total : 0 }));
  const label = shares.map((p) => `${p.label}: ${formatInt(p.total)} (${formatPct(p.share)})`).join(" · ");
  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`Distribución: ${label}`}>
        {shares
          .filter((p) => p.total > 0)
          .map((p) => (
            <span key={p.key} className="h-full min-w-[3px]" style={{ flexGrow: p.total, flexBasis: 0, background: p.color }} />
          ))}
      </div>
      <ul role="list" className="flex flex-wrap items-center gap-1.5" aria-label="Totales por columna">
        {shares.map((p) => (
          <li key={p.key}>
            <span
              aria-label={`${p.label}: ${formatInt(p.total)} (${formatPct(p.share)})`}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] @min-[600px]/pv:px-2.5 @min-[600px]/pv:py-1 @min-[600px]/pv:text-xs",
                p.tone === "critical" && p.total > 0 ? "border-transparent bg-critical-soft" : "border-border bg-surface-2",
              )}
            >
              {p.tone ? <StatusIcon tone={p.tone} /> : <Swatch color={p.color} />}
              <span className={cn("text-text-2", p.neutral && "italic")}>{p.label}</span>
              <span className="tabular font-semibold text-text">{formatInt(p.total)}</span>
              <span className="tabular text-muted">{formatPct(p.share)}</span>
            </span>
          </li>
        ))}
        <li className="ml-auto flex items-center gap-2 whitespace-nowrap pl-2 text-xs text-muted">
          <span className="tabular">
            Total <span className="font-semibold text-text">{formatInt(total)}</span> {unit}
          </span>
          {action}
        </li>
      </ul>
    </div>
  );
}

// ─── Vista por filas (contenedor < 600 px) ───────────────────────────────────
function PartStrip({ values, parts }: { values: number[]; parts: Part[] }) {
  return (
    <span className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-surface-3" aria-hidden>
      {parts.map((p, i) =>
        values[i] > 0 ? <span key={p.key} className="h-full min-w-[3px]" style={{ flexGrow: values[i], flexBasis: 0, background: p.neutral ? "var(--neutral-mark)" : p.color }} /> : null,
      )}
    </span>
  );
}

function PartMark({ tone, color }: { tone: StatusTone | null; color: string }) {
  return tone ? <StatusIcon tone={tone} className="size-3" /> : <Swatch color={color} />;
}

function PartValues({ values, parts }: { values: number[]; parts: Part[] }) {
  return (
    <ul role="list" className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
      {parts.map((p, i) =>
        values[i] > 0 ? (
          <li key={p.key} className="inline-flex items-center gap-1 whitespace-nowrap">
            <PartMark tone={p.tone} color={p.color} />
            <span className={cn("text-muted", p.neutral && "italic")}>{p.label}</span>
            <span className="tabular font-semibold text-text">{formatInt(values[i])}</span>
          </li>
        ) : null,
      )}
    </ul>
  );
}

/** Fila de la vista móvil: nombre + total, barra 100 % por parte y cifras; con grupos de columnas, toque para ver el detalle. */
function ListRow({ ln, cols, parts, detail }: { ln: Extract<Line, { type: "leaf" }>; cols: PivotCol[]; parts: Part[]; detail: boolean }) {
  const [open, setOpen] = useState(false);
  const pv = parts.map((p) => sumAt(ln.values, p.idx));
  const head = (
    <span className="flex w-full items-start gap-2">
      {ln.person && <Avatar name={ln.label} neutral={ln.neutral} />}
      <span className="min-w-0 flex-1 text-left">
        <span className={cn("block text-[13px] leading-snug", ln.neutral ? "italic text-muted" : ln.office || !ln.depth ? "font-semibold text-text" : "text-text-2")}>{ln.label}</span>
        {ln.note && <span className="block text-[11px] italic text-muted">{ln.note}</span>}
      </span>
      <span className="tabular shrink-0 text-[13px] font-bold text-text">{formatInt(ln.total)}</span>
      {detail && <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} aria-hidden />}
    </span>
  );
  return (
    <li className={cn("flex flex-col gap-1.5 border-b border-[color:var(--hairline)] py-2.5", ln.depth ? "pl-4" : "")}>
      {detail ? (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="-mx-1 rounded-md px-1 transition hover:bg-surface-2">
          {head}
        </button>
      ) : (
        head
      )}
      <PartStrip values={pv} parts={parts} />
      <PartValues values={pv} parts={parts} />
      {detail && open && (
        <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-surface-2 px-2.5 py-2 text-[11.5px]">
          {cols.map((c, ci) =>
            ln.values[ci] > 0 ? (
              <div key={c.key} className="flex min-w-0 items-center gap-1">
                {c.tone && <StatusIcon tone={c.tone} className="size-3" />}
                <dt className={cn("min-w-0 flex-1 text-text-2", c.neutral && "italic")}>{c.label}</dt>
                <dd className="tabular font-semibold text-text">{formatInt(ln.values[ci])}</dd>
              </div>
            ) : null,
          )}
        </dl>
      )}
    </li>
  );
}

function ListGroupRow({ ln, parts, kind, onToggle }: { ln: Extract<Line, { type: "group" }>; parts: Part[]; kind: LabelKind; onToggle: () => void }) {
  const pv = parts.map((p) => sumAt(ln.values, p.idx));
  return (
    <li className="flex flex-col gap-1.5 border-b border-border bg-surface-2 px-2 py-2.5">
      <button type="button" onClick={onToggle} aria-expanded={ln.open} className="flex w-full items-start gap-1.5 text-left">
        <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none", !ln.open && "-rotate-90")} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[13px] font-semibold leading-snug text-text", ln.neutral && "font-medium italic text-muted")}>{ln.label}</span>
          <span className="block text-[11px] text-muted">{countOf(ln.count, kind)}</span>
        </span>
        <span className="tabular shrink-0 text-[13px] font-bold text-text">{formatInt(ln.total)}</span>
      </button>
      <PartStrip values={pv} parts={parts} />
      {!ln.open && <PartValues values={pv} parts={parts} />}
    </li>
  );
}

// ─── Vista ───────────────────────────────────────────────────────────────────
function PivotView({ widget, result, expanded, summary }: VizProps<PivotWidget, PivotResult> & { summary?: boolean }) {
  const theme = useChartTheme();
  const { spec } = useDashboard();
  const unit = spec.unit?.plural ?? "registros";
  const model = useMemo(() => buildModel(widget, result), [widget, result]);
  const { ref: sizeRef, width, measured } = useElementSize();
  const folds = useMemo(() => buildFolds(model.runs), [model]);
  // Ancho con el que las etiquetas de la primera columna caben en una línea (sangría, chevron y avatar incluidos)
  const rowNeed = useMemo(() => {
    const office = (model.grouped ? model.groupKind : model.leafKind) === "oficina";
    const len = (l: { short: string; label: string }) => (office ? l.short : l.label).length;
    const leafExtra = model.leafKind === "persona" ? 32 : 0;
    const w = model.grouped
      ? Math.max(0, ...model.groups.map((g) => len(g) * ROW_CHAR_W + 20), ...model.groups.flatMap((g) => g.leaves.map((l) => len(l) * ROW_CHAR_W + 20 + leafExtra)))
      : Math.max(0, ...model.flat.map((l) => len(l) * ROW_CHAR_W + leafExtra));
    return Math.ceil(w + 18);
  }, [model]);
  const totalW = totalWidth(model.grand);
  const autoFolds = useMemo(() => (measured ? planFolds(width, model, folds, rowNeed, totalW) : null), [measured, width, model, folds, rowNeed, totalW]);
  // Grupos de columnas contraídos: automático según el ancho hasta que la persona los cambia
  const [colUser, setColUser] = useState<Set<string> | null>(null);
  const colCollapsed = colUser ?? autoFolds ?? EMPTY;
  const sizes = useMemo(() => (measured ? sizeTable(width, model, folds, colCollapsed, rowNeed, totalW) : null), [measured, width, model, folds, colCollapsed, rowNeed, totalW]);
  const { dcols, segments } = useMemo(() => layoutCols(model, folds, colCollapsed), [model, folds, colCollapsed]);
  const parts = useMemo(() => buildParts(model.cols, model.runs), [model]);
  // Orden por clave de columna (sobrevive a cambios de filtros y de pestaña de rol)
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const sortIdx = sortKey === null ? -1 : dcols.findIndex((c) => c.key === sortKey);
  const sortCols = sortIdx < 0 ? null : dcols[sortIdx].idx;
  const lines = useMemo(() => buildLines(model, sortCols, collapsed), [model, sortCols, collapsed]);
  const rows = useMemo(() => lines.map((ln) => ({ ln, dv: dcols.map((dc) => sumAt(ln.values, dc.idx)) })), [lines, dcols]);
  const { ref: scrollRef, onScroll, dataAttrs, edges } = useScrollEdges();
  const { state: tip, show, hide } = useChartTooltip();

  const { cols, runs, grouped, max, min } = model;
  const manyCols = model.many;
  const headerTop = runs ? 28 : 0;
  const rowsLabel = widget.rows.map((r) => r.label).join(" › ");
  const leafMax = useMemo(() => Math.max(1, ...lines.filter((l) => l.type === "leaf").map((l) => l.total)), [lines]);
  const expandable = grouped ? model.groups.filter((g) => !g.merged) : [];
  const allCollapsed = expandable.length > 0 && expandable.every((g) => collapsed.has(g.key));
  const officeRows = (grouped ? model.groupKind : model.leafKind) === "oficina";

  const scale = useCallback(
    (v: number) => {
      const t = 0.1 + 0.9 * Math.sqrt(Math.min(1, v / max));
      const bg = seqColor(theme, t);
      return { bg, fg: inkOn(bg) };
    },
    [theme, max],
  );
  const legendStops = useMemo(() => {
    const t0 = 0.1 + 0.9 * Math.sqrt(Math.min(1, min / max));
    return Array.from({ length: 6 }, (_, i) => seqColor(theme, t0 + ((1 - t0) * i) / 5));
  }, [theme, min, max]);

  const toggleGroup = useCallback((key: string) => {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);
  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(expandable.map((g) => g.key)));
  const toggleColGroup = (key: string) =>
    setColUser((prev) => {
      const n = new Set(prev ?? colCollapsed);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const onOver = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
      if (!el?.dataset.cell) {
        hide();
        return;
      }
      const [ri, ci] = el.dataset.cell.split(":").map(Number);
      const row = rows[ri];
      const col = dcols[ci];
      if (!row || !col) return;
      const { ln } = row;
      const v = row.dv[ci];
      const r = el.getBoundingClientRect();
      show(r.right, r.top + r.height / 2, {
        title: ln.type === "leaf" && ln.groupLabel ? `${ln.groupLabel} › ${ln.label}` : ln.label,
        value: formatInt(v),
        valueNote: `${unit} · ${col.full}${col.folded ? ` (${col.folded} columnas)` : ""}`,
        rows: [
          { label: "Participación en la fila", value: ln.total ? formatPct(v / ln.total) : "—", color: "transparent" },
          { label: "Participación en la columna", value: col.total ? formatPct(v / col.total) : "—", color: "transparent" },
        ],
        hint: col.folded
          ? "Grupo contraído: haz clic en su cabecera para ver cada columna."
          : col.neutral || (ln.type === "leaf" && ln.neutral)
            ? "Sin dato reportado: se muestra en gris y fuera de la escala."
            : undefined,
      });
    },
    [rows, dcols, show, hide, unit],
  );

  const hasZero = rows.some((r) => r.dv.some((v) => !v));
  const hasGray = cols.some((c) => c.neutral) || lines.some((l) => l.type === "leaf" && l.neutral);
  const neutralRowShare = model.grand ? model.neutralRows / model.grand : 0;
  const neutralColShare = model.grand ? model.neutralCols / model.grand : 0;
  // El chip usa el rótulo visible de la columna neutral ("44 % no reporta", como la columna y el resumen);
  // con varias neutrales o un agregado ("Otros"), el genérico "sin categoría"
  const neutralColNames = [...new Set(model.cols.filter((c) => c.neutral && c.total > 0).map((c) => c.label))];
  const neutralColLabel = neutralColNames.length === 1 && /^(no|sin)\s/i.test(neutralColNames[0]) ? neutralColNames[0].toLocaleLowerCase("es-CO") : "sin categoría";
  const leafLabel = widget.rows.at(-1)?.label.toLocaleLowerCase("es-CO") ?? "responsable";
  const leafCount = grouped ? model.groups.reduce((a, g) => a + g.leaves.length, 0) : model.flat.length;
  const rowCount = grouped ? `${countOf(model.groups.length, model.groupKind)} · ${countOf(leafCount, model.leafKind)}` : countOf(leafCount, model.leafKind);

  // Vista por filas: primeras LIST_LIMIT filas (cortando en el límite de un grupo)
  let listCut = lines.length;
  if (!expanded && !showAll && lines.length > LIST_LIMIT + 2) {
    listCut = LIST_LIMIT;
    const isChild = (l: Line) => l.type === "leaf" && l.depth === 1;
    if (grouped) while (listCut < lines.length && isChild(lines[listCut])) listCut++;
  }
  const listLines = lines.slice(0, listCut);
  const listHidden = lines.length - listCut;
  const partsDiffer = runs !== null && parts.length !== cols.length;
  // Píldoras de ancho uniforme: el tope es el nivel común de las columnas (las más anchas por su cabecera no las agrandan)
  const pillW = Math.min(manyCols ? 56 : 96, (sizes?.cell ?? (manyCols ? MIN_COL_MANY : MIN_COL_FEW)) - 2);
  const firstStyle = sizes ? ({ "--pv-first": `${sizes.first}px`, "--pv-pill": `${pillW}px` } as CSSProperties) : undefined;
  // Con el reparto medido, table-layout fixed: los anchos del colgroup se respetan (nivel común o el mínimo de la cabecera)
  const colW = (c: DisplayCol) => (c.folded ? FOLDED_W : sizes?.cell != null ? Math.max(c.width, sizes.cell) : c.width);

  // "Contraer / Expandir todo": en el header de la tarjeta; con la tarjeta angosta (< 460 px) el Segmented de
  // roles llena el header y el botón quedaba como ícono huérfano en su propia línea: pasa a enlace de texto
  // en la línea del Total del resumen
  const groupToggle = grouped && expandable.length > 1 && measured;
  const narrow = width < 460;
  const toggleLabel = allCollapsed ? "Expandir todo" : "Contraer todo";
  const ToggleIcon = allCollapsed ? ChevronsUpDown : ChevronsDownUp;
  const inlineToggle =
    groupToggle && narrow ? (
      <button
        type="button"
        onClick={toggleAll}
        aria-label={allCollapsed ? "Expandir todos los grupos" : "Contraer todos los grupos"}
        className="-mx-1 inline-flex h-6 items-center gap-1 rounded px-1 text-[11px] font-semibold text-primary-text underline-offset-2 transition hover:underline"
      >
        <ToggleIcon className="size-3.5" aria-hidden />
        {toggleLabel}
      </button>
    ) : undefined;

  return (
    <div ref={sizeRef} className={cn("@container/pv min-h-0", expanded && "h-full")}>
      {/* Tope de 640 px con scroll interno solo en modo tabla; la vista por filas mide por contenido */}
      <div className={cn("flex min-h-0 flex-col", expanded ? "h-full" : "@min-[600px]/pv:max-h-[640px]")}>
        {summary && (
          <PivotSummary
            parts={cols.map((c, i) => ({ key: c.key, label: c.label, tone: c.tone, neutral: c.neutral, total: c.total, color: toneColor(c, i), idx: [i] }))}
            total={model.grand}
            unit={unit}
            action={inlineToggle}
          />
        )}
        {(!summary || partsDiffer) && (
          <div className="@min-[600px]/pv:hidden">
            <PivotSummary parts={parts} total={model.grand} unit={unit} action={summary ? undefined : inlineToggle} />
          </div>
        )}

        {groupToggle && !narrow && (
          <HeaderSlot>
            <button
              type="button"
              onClick={toggleAll}
              aria-label={allCollapsed ? "Expandir todos los grupos" : "Contraer todos los grupos"}
              className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full border border-border px-2.5 text-[11px] font-semibold text-text-2 transition hover:bg-surface-3"
            >
              <ToggleIcon className="size-3.5" aria-hidden />
              {toggleLabel}
            </button>
          </HeaderSlot>
        )}

        {model.allMerged && (
          <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-text-2">
            <Info className="mt-px size-3.5 shrink-0 text-muted" aria-hidden />
            <span>
              Ningún registro tiene {leafLabel} asignado en la fuente: se muestra la carga por {widget.rows[0]?.label.toLocaleLowerCase("es-CO") ?? "grupo"}.
            </span>
          </p>
        )}

        {/* ── Vista por filas (< 600 px): nombre, total, barra 100 % y cifras ── */}
        <div className={cn("@min-[600px]/pv:hidden", expanded && "min-h-0 flex-1 overflow-auto")}>
          <ul role="list" aria-label={widget.title} className="border-t border-border">
            {listLines.map((ln) =>
              ln.type === "group" ? (
                <ListGroupRow key={ln.key} ln={ln} parts={parts} kind={model.leafKind} onToggle={() => toggleGroup(ln.key.slice(2))} />
              ) : (
                <ListRow key={ln.key} ln={ln} cols={cols} parts={parts} detail={partsDiffer} />
              ),
            )}
          </ul>
          {(listHidden > 0 || showAll) && !expanded && lines.length > LIST_LIMIT + 2 && (
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted">
              <span className="tabular">{rowCount}</span>
              <MoreButton onClick={() => setShowAll((v) => !v)} expanded={showAll}>
                {showAll ? "Ver menos" : `Ver ${formatInt(listHidden)} ${NOUN[grouped ? "generic" : model.leafKind][listHidden === 1 ? 0 : 1]} más`}
              </MoreButton>
            </div>
          )}
        </div>

        {/* ── Tabla (≥ 600 px) ── */}
        <div
          style={firstStyle}
          className={cn(
            "relative hidden min-h-0 flex-1 flex-col [--pv-first:220px] @min-[600px]/pv:flex",
            manyCols ? "[--pv-pill:50px] @min-[900px]/pv:[--pv-first:232px]" : "[--pv-pill:74px] @min-[900px]/pv:[--pv-first:280px]",
          )}
        >
          <div ref={scrollRef} onScroll={onScroll} {...dataAttrs} className="group/sc relative isolate min-h-0 flex-1 overflow-auto overscroll-contain">
            <table className={cn("w-full border-separate border-spacing-0 text-[12.5px]", sizes && "table-fixed")} aria-label={widget.title}>
              <colgroup>
                <col style={{ width: "var(--pv-first)" }} />
                {dcols.map((c) => (
                  <col key={c.key} style={{ width: colW(c) }} />
                ))}
                <col style={{ width: sizes?.total ?? TOTAL_W }} />
              </colgroup>
              <thead>
                {runs && (
                  <tr>
                    <th
                      rowSpan={2}
                      scope="col"
                      style={FIRST_W}
                      className={cn("sticky left-0 top-0 z-30 border-b border-border bg-surface px-2 pb-2 text-left align-bottom text-[11px] font-bold text-text-2", EDGE_L, EDGE_T)}
                    >
                      {rowsLabel}
                    </th>
                    {segments.map((seg, i) => {
                      if (seg.type === "fold") return <FoldedHeader key={`f-${seg.fold.key}`} col={seg.col} onToggle={() => toggleColGroup(seg.fold.key)} />;
                      if (seg.type === "solo") {
                        // Grupo de una sola columna: una sola cabecera "ícono + grupo" en las dos filas (sin franja
                        // de grupo ni eyebrow repetido); el estado va en title, lector de pantalla y tooltip
                        const c = seg.col;
                        return <ColHeader key={c.key} col={c} top={0} rowSpan={2} compact={manyCols} active={sortKey === c.key} onSort={() => setSortKey((k) => (k === c.key ? null : c.key))} />;
                      }
                      const run = seg.run;
                      const chipStyle = run.tone ? { background: TONE_VARS[run.tone].soft, color: TONE_VARS[run.tone].ink } : undefined;
                      if (!run.label) return <th key={`r-${i}`} colSpan={run.span} scope="colgroup" className="sticky top-0 z-20 h-7 bg-surface px-px py-0" />;
                      const canFold = folds.some((f) => f.key === run.key);
                      const chip = (
                        // La etiqueta se queda visible al desplazar en horizontal
                        <span className="sticky inline-flex items-center gap-1 whitespace-nowrap" style={{ left: "calc(var(--pv-first) + 6px)" }}>
                          {canFold && <ChevronsRightLeft className="size-3 opacity-75" aria-hidden />}
                          {run.tone && <StatusIcon tone={run.tone} className="size-3" />}
                          {run.label}
                          <span className="tabular font-semibold opacity-75">· {run.count}</span>
                        </span>
                      );
                      const chipCls = cn("flex h-6 w-full items-center rounded-[4px] px-1.5 text-left text-[11px] font-bold", run.tone ? undefined : "bg-surface-3 text-text-2");
                      return (
                        <th key={`r-${i}`} colSpan={run.span} scope="colgroup" className="sticky top-0 z-20 h-7 bg-surface px-px py-0">
                          {canFold ? (
                            <button
                              type="button"
                              onClick={() => toggleColGroup(run.key)}
                              aria-expanded
                              title={`Contraer ${run.label} en una columna`}
                              className={cn(chipCls, "transition hover:brightness-95 dark:hover:brightness-110")}
                              style={chipStyle}
                            >
                              {chip}
                            </button>
                          ) : (
                            <div className={chipCls} style={chipStyle}>
                              {chip}
                            </div>
                          )}
                        </th>
                      );
                    })}
                    <th
                      rowSpan={2}
                      scope="col"
                      className={cn("sticky top-0 z-30 border-b border-border bg-surface pb-2 pl-3 pr-2 text-right align-bottom text-[11px] font-bold text-text-2", STICKY_R, EDGE_T)}
                    >
                      Total
                    </th>
                  </tr>
                )}
                <tr>
                  {!runs && (
                    <th
                      scope="col"
                      style={FIRST_W}
                      className={cn("sticky left-0 top-0 z-30 border-b border-border bg-surface px-2 pb-2 text-left align-bottom text-[11px] font-bold text-text-2", EDGE_L, EDGE_T)}
                    >
                      {rowsLabel}
                    </th>
                  )}
                  {dcols.map((c) =>
                    c.folded || (runs && c.solo) ? null : (
                      <ColHeader key={c.key} col={c} top={headerTop} compact={manyCols} active={sortKey === c.key} onSort={() => setSortKey((k) => (k === c.key ? null : c.key))} />
                    ),
                  )}
                  {!runs && (
                    <th
                      scope="col"
                      className={cn("sticky top-0 z-30 border-b border-border bg-surface pb-2 pl-3 pr-2 text-right align-bottom text-[11px] font-bold text-text-2", STICKY_R, EDGE_T)}
                    >
                      Total
                    </th>
                  )}
                </tr>
              </thead>
              <tbody onPointerOver={onOver} onPointerLeave={hide}>
                {rows.map(({ ln, dv }, ri) => {
                  const shown = officeRows ? ln.short : ln.label;
                  if (ln.type === "group") {
                    return (
                      <tr key={ln.key} className="group/row">
                        <th scope="rowgroup" style={FIRST_W} className={cn("sticky left-0 z-10 border-t border-border bg-surface-2 p-0 text-left", EDGE_L)}>
                          <button
                            type="button"
                            onClick={() => toggleGroup(ln.key.slice(2))}
                            aria-expanded={ln.open}
                            title={ln.full}
                            className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left transition hover:bg-surface-3"
                          >
                            <ChevronDown className={cn("mt-0.5 size-3.5 shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none", !ln.open && "-rotate-90")} aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className={cn("block text-pretty text-[12.5px] font-semibold leading-snug text-text", ln.neutral && "font-medium italic text-muted")}>{shown}</span>
                              <span className="block text-[11px] text-muted">
                                {model.leafKind === "persona" ? (ln.count === 1 ? "1 responsable" : `${formatInt(ln.count)} responsables`) : ln.count === 1 ? "1 fila" : `${formatInt(ln.count)} filas`}
                              </span>
                            </span>
                          </button>
                        </th>
                        {dv.map((v, ci) => (
                          <td key={dcols[ci].key} className="border-t border-border bg-surface-2 p-px" data-cell={`${ri}:${ci}`}>
                            <div className={cn("tabular grid h-7 place-items-center text-[12px] font-bold", v ? "text-text-2" : "font-normal text-muted")}>{v ? formatInt(v) : "·"}</div>
                          </td>
                        ))}
                        <td className={cn("z-10 border-t border-border bg-surface-2 pl-3 pr-2 text-right", STICKY_R)}>
                          <span className="tabular text-[12.5px] font-bold text-text">{formatInt(ln.total)}</span>
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={ln.key} className="group/row">
                      <th
                        scope="row"
                        title={ln.full !== shown ? ln.full : undefined}
                        style={FIRST_W}
                        className={cn("sticky left-0 z-10 bg-surface py-1 pr-2 text-left font-normal group-hover/row:bg-surface-2", ln.depth ? "pl-7" : "pl-2", EDGE_L)}
                      >
                        <span className="flex items-center gap-2">
                          {ln.person && <Avatar name={ln.label} neutral={ln.neutral} />}
                          <span className="min-w-0">
                            <span className={cn("block text-pretty text-[12.5px] leading-snug", ln.neutral ? "italic text-muted" : ln.office ? "font-semibold text-text" : "text-text-2")}>{shown}</span>
                            {ln.note && <span className="block text-[11px] italic text-muted">{ln.note}</span>}
                          </span>
                        </span>
                      </th>
                      {dv.map((v, ci) => {
                        const dc = dcols[ci];
                        if (dc.folded) return <FoldedCell key={dc.key} v={v} cell={`${ri}:${ci}`} />;
                        const gray = dc.neutral || ln.neutral;
                        const s = gray || !v ? { bg: "", fg: "" } : scale(v);
                        return <Pill key={dc.key} v={v} bg={s.bg} fg={s.fg} gray={gray} cell={`${ri}:${ci}`} />;
                      })}
                      <TotalCell total={ln.total} max={leafMax} neutral={ln.neutral} />
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" style={FIRST_W} className={cn("sticky bottom-0 left-0 z-30 border-t border-border bg-surface px-2 py-2 text-left text-[12px] font-bold text-text", EDGE_L, EDGE_B)}>
                    Total
                  </th>
                  {dcols.map((c) => (
                    <td key={c.key} className={cn("tabular sticky bottom-0 z-20 border-t border-border bg-surface px-1 py-2 text-center text-[12px] font-bold", c.neutral ? "text-muted" : "text-text", EDGE_B)}>
                      {formatInt(c.total)}
                    </td>
                  ))}
                  <td className={cn("tabular sticky bottom-0 z-30 border-t border-border bg-surface pl-3 pr-2 text-right text-[12.5px] font-bold text-text", STICKY_R, EDGE_B)}>
                    {formatInt(model.grand)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="hidden flex-wrap items-center gap-x-5 gap-y-2 @min-[600px]/pv:flex">
            <ScaleLegend
              title={`${unit.charAt(0).toLocaleUpperCase("es-CO")}${unit.slice(1)} por celda`}
              gradient={legendStops}
              min={formatInt(min)}
              max={formatInt(max)}
              note={theme.mode === "dark" ? "Escala raíz · más claro = más" : "Escala raíz"}
            />
            <ul role="list" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted" aria-label="Convenciones">
              {hasZero && (
                <li className="flex items-center gap-1.5">
                  <span className="grid h-3.5 w-5 place-items-center rounded-[3px] border border-border text-xs leading-none" aria-hidden>
                    ·
                  </span>
                  Sin registros
                </li>
              )}
              {hasGray && (
                <li className="flex items-center gap-1.5">
                  <span className="h-3.5 w-5 rounded-[3px] bg-surface-3" aria-hidden />
                  Sin dato, fuera de escala
                </li>
              )}
              {dcols.some((c) => c.folded) && (
                <li className="flex items-center gap-1.5">
                  <span className="h-3.5 w-5 rounded-[3px] border border-dashed border-border-strong" aria-hidden />
                  Grupo contraído (subtotal)
                </li>
              )}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(edges.bottom || edges.right) && (
              <span className="hidden items-center gap-1 text-[11px] text-text-2 @min-[600px]/pv:inline-flex">
                {edges.bottom && edges.right ? (
                  <ArrowDownRight className="size-3.5 text-muted" aria-hidden />
                ) : edges.bottom ? (
                  <ArrowDown className="size-3.5 text-muted" aria-hidden />
                ) : (
                  <ArrowRight className="size-3.5 text-muted" aria-hidden />
                )}
                <span className="tabular">{rowCount}</span>
                <span className="text-muted">
                  · {edges.bottom && edges.right ? "desplaza la tabla: hay más filas y columnas" : edges.bottom ? "desplaza la tabla para ver todas" : "desplaza para ver más columnas"}
                </span>
              </span>
            )}
            {neutralRowShare >= 0.15 && !model.allMerged && <QualityChip neutral={model.neutralRows} total={model.grand} label={model.leafKind === "persona" ? "sin responsable" : "sin dato"} force />}
            {neutralColShare >= 0.15 && <QualityChip neutral={model.neutralCols} total={model.grand} label={neutralColLabel} force />}
            {result.truncated > 0 && <span className="text-[11px] text-muted">+{formatInt(result.truncated)} filas no mostradas</span>}
          </div>
        </div>
        <ChartTooltip state={tip} />
      </div>
    </div>
  );
}

export function PivotHeatmapV2(props: VizProps<PivotWidget, PivotResult>) {
  return <PivotView {...props} />;
}

/** RolePivot: la tarjeta pone el selector de rol (pestañas); aquí el resumen del rol activo + la matriz. */
export function RolePivot(props: VizProps<PivotWidget, PivotResult>) {
  return <PivotView {...props} summary />;
}
