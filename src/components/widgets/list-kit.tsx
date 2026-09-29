"use client";

/**
 * Piezas compartidas por las visualizaciones de lista (RankingList, PeopleLeaderboard,
 * SplitRows y DrilldownBars): medición del cuerpo, estimación de líneas de texto,
 * reparto en columnas con numeración continua, pie, diálogo con búsqueda y barra apilada.
 * Especificación: docs/ui-design-system.md (§ RankingList, PeopleLeaderboard, SplitRows, DrilldownBars).
 */

import { Search } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import type { SemanticFamily, StatusTone, VizOptions } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { isNeutral, resolveStatus } from "@/lib/charts/semantic";
import { inkOn } from "@/lib/charts/theme";
import { formatInt, formatPct } from "@/lib/format";
import { displayLabel, type LabelKind } from "@/lib/labels";
import type { TooltipContent } from "./kit/chart-tooltip";

// ─── Medición ────────────────────────────────────────────────────────────────

/**
 * Mide el ancho del elemento y, solo si la fila del tablero tiene alto fijo (tier S/M/L/XL en
 * contenedores ≥ 600 px), su alto disponible. En móvil (alto por contenido), en el diálogo
 * "Ampliar" o fuera de una fila, `height` es null y el componente decide por presupuesto.
 * Ref callback: compatible con el React Compiler (no lee refs en render).
 */
export function useFitBox<T extends HTMLElement = HTMLDivElement>() {
  const [box, setBox] = useState<{ w: number; h: number | null } | null>(null);
  const ref = useCallback((el: T | null) => {
    if (!el) return;
    const read = () => {
      const row = el.closest(".dash-row");
      const rowH = row ? getComputedStyle(row).getPropertyValue("--row-h").trim() : "";
      const fixed = rowH !== "" && rowH !== "auto";
      const w = el.clientWidth;
      const h = fixed ? el.clientHeight : null;
      setBox((b) => {
        if (b && Math.abs(b.w - w) < 1 && (b.h === h || (b.h !== null && h !== null && Math.abs(b.h - h) < 1))) return b;
        return { w, h };
      });
    };
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width: box?.w ?? 0, height: box?.h ?? null, measured: box !== null };
}

// ─── Texto ───────────────────────────────────────────────────────────────────

let ctx2d: CanvasRenderingContext2D | null | undefined;
let fontFamily = "sans-serif";
const widthCache = new Map<string, number>();

/** Ancho del texto en px con la fuente de la aplicación (canvas; aproximación en servidor). */
export function textWidth(text: string, weight = 500, size = 13): number {
  if (typeof document === "undefined") return text.length * size * 0.57;
  if (ctx2d === undefined) {
    ctx2d = document.createElement("canvas").getContext("2d");
    fontFamily = getComputedStyle(document.body).fontFamily || "sans-serif";
  }
  if (!ctx2d) return text.length * size * 0.57;
  const key = `${weight}|${size}|${text}`;
  let w = widthCache.get(key);
  if (w === undefined) {
    ctx2d.font = `${weight} ${size}px ${fontFamily}`;
    w = ctx2d.measureText(text).width;
    if (widthCache.size > 6000) widthCache.clear();
    widthCache.set(key, w);
  }
  return w;
}

/** Pila de `font-mono` de Tailwind (no hay fuente mono propia). */
const MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

/** Ancho de texto monoespaciado (identificadores, NIT) medido con canvas; aproximación en servidor. */
export function monoWidth(text: string, size = 11): number {
  if (typeof document === "undefined") return text.length * size * 0.61;
  if (ctx2d === undefined) textWidth("", 400, size);
  if (!ctx2d) return text.length * size * 0.61;
  const key = `mono|${size}|${text}`;
  let w = widthCache.get(key);
  if (w === undefined) {
    ctx2d.font = `400 ${size}px ${MONO_STACK}`;
    w = Math.max(ctx2d.measureText(text).width, text.length * size * 0.55);
    widthCache.set(key, w);
  }
  return w;
}

/**
 * Ancho de una cifra con dígitos tabulares (clase `tabular`): canvas no aplica
 * font-variant-numeric, así que se mide con todos los dígitos como "0" (ancho tabular).
 */
export function numWidth(text: string, weight = 600, size = 13): number {
  return Math.ceil(textWidth(text.replace(/\d/g, "0"), weight, size)) + 1;
}

/**
 * Líneas que ocupa un texto al envolver por palabras en `maxWidth` px.
 * `tail` es un bloque que no se parte (p. ej. "NIT 938376353" en mono) con su ancho en px.
 */
export function lineCount(text: string, maxWidth: number, weight = 500, size = 13, tail = 0): number {
  // Canvas mide con la misma fuente que el DOM (verificado al 0,01 px): basta 1 px de margen (un factor
  // del 3 % sobrestimaba líneas y, con la grilla alineada, dejaba filas altas vacías).
  const limit = maxWidth - 1;
  if (limit <= 8) return 1;
  const space = textWidth(" ", weight, size);
  const tokens = text.split(/\s+/).filter(Boolean).map((t) => textWidth(t, weight, size));
  if (tail > 0) tokens.push(tail);
  let lines = 1;
  let cur = 0;
  for (const w of tokens) {
    if (cur === 0) {
      if (w > limit) {
        lines += Math.ceil(w / limit) - 1;
        cur = w % limit;
      } else cur = w;
      continue;
    }
    if (cur + space + w <= limit) cur += space + w;
    else {
      lines++;
      if (w > limit) {
        lines += Math.ceil(w / limit) - 1;
        cur = w % limit;
      } else cur = w;
    }
  }
  return lines;
}

// ─── Columnas ────────────────────────────────────────────────────────────────

/** Separación horizontal entre columnas de filas (cada fila ya lleva 8 px de padding). */
export const COL_GAP = 16;

/**
 * Máximo de columnas por ancho interno (layoutSystem §6): 1 < 624 ≤ 2 < 960 ≤ 3 (compacta: 2 desde 480).
 * Es un TOPE: cada lista usa la menor cantidad de columnas en la que caben sus filas (ver `pickGrid`).
 * Con columnas forzadas, la compacta admite 2 desde 400 (span 6 a 1024–1280: cuerpo de 402–414 px); el
 * componente decide después con la medida real de las etiquetas si la columna extra cabe.
 */
export function listColumns(width: number, compact: boolean, forced?: 1 | 2 | 3): number {
  const byWidth = width >= 960 ? 3 : width >= (compact ? 480 : 624) ? 2 : 1;
  if (!forced) return byWidth;
  const max = width >= 900 ? 3 : width >= (compact ? 400 : 440) ? 2 : 1;
  return Math.min(forced, max);
}

/** Ancho útil de una fila en `cols` columnas (la grilla lleva -mx-2: 16 px más que el cuerpo; cada fila, 8 px de padding). */
export function columnRowWidth(width: number, cols: number): number {
  return (width + 16 - (cols - 1) * COL_GAP) / cols - 16;
}

// ─── Grilla alineada (filas iguales entre columnas) ─────────────────────────

/** Margen de seguridad de la estimación de altos (px). */
export const FIT_SAFETY = 4;

export interface ListGrid {
  /** Filas reales visibles (en orden). */
  shown: number;
  /** Columnas y filas de la grilla (numeración continua por columna: 1–5 | 6–10). */
  cols: number;
  rows: number;
  /** Alto de cada fila de la grilla: el de su celda más alta, así las columnas quedan alineadas. */
  heights: number[];
  /** Alto ocupado: suma de las filas de la grilla o, en flujo libre, la columna más alta. */
  total: number;
  /** Índice de celda del primer neutral con separador (null si no hay o si abre una columna). */
  sepAt: number | null;
}

/**
 * Grilla de `cols` columnas con R = ⌈celdas / cols⌉ filas: las filas reales visibles y luego los
 * neutrales (`tail`). Cada fila de la grilla mide lo que su celda más alta, de modo que la fila 1
 * de una columna queda a la altura de la fila 1 de la otra aunque una etiqueta se envuelva.
 * `sep`: alto del separador (hairline) antes del primer neutral, salvo que abra una columna.
 * `free`: cada columna fluye con sus propios altos (sin filas compartidas); el alto ocupado es el de la
 * columna más alta.
 */
export function gridLayout(real: number[], tail: number[], cols: number, shown: number, sep = 0, free = false): ListGrid {
  const cells = [...real.slice(0, shown), ...tail];
  const n = cells.length;
  if (!n) return { shown, cols: 1, rows: 0, heights: [], total: 0, sepAt: null };
  const rows = Math.ceil(n / Math.max(1, Math.min(cols, n)));
  const used = Math.ceil(n / rows);
  const sepAt = tail.length && shown % rows !== 0 ? shown : null;
  const heights = new Array<number>(rows).fill(0);
  const colSums = new Array<number>(used).fill(0);
  cells.forEach((h, i) => {
    const j = i % rows;
    const hh = h + (i === sepAt ? sep : 0);
    heights[j] = Math.max(heights[j], hh);
    colSums[Math.floor(i / rows)] += hh;
  });
  const total = free ? Math.max(...colSums) : heights.reduce((a, b) => a + b, 0);
  return { shown, cols: used, rows, heights, total, sepAt };
}

/**
 * Cuántas filas reales caben (hasta `cap`) en la grilla alineada de `cols` columnas y alto `maxH`.
 * `tailHidden`: altos de los neutrales cuando quedan filas ocultas (p. ej. "Otras N" con su
 * "Ver N más" en línea, que puede partir la etiqueta).
 */
export function fitGrid(real: number[], tail: number[], cols: number, maxH: number, cap = Infinity, sep = 0, tailHidden?: number[], free = false): ListGrid {
  const start = Math.min(real.length, Math.max(0, cap));
  const tailFor = (r: number) => (tailHidden && r < real.length ? tailHidden : tail);
  for (let r = start; r > 0; r--) {
    const g = gridLayout(real, tailFor(r), cols, r, sep, free);
    if (g.total <= maxH) return g;
  }
  return gridLayout(real, tailFor(0), cols, 0, sep, free);
}

/**
 * Elige la grilla: el PRIMER candidato en el que caben todas las filas (hasta `cap`); si ninguno
 * alcanza, el que muestra más filas (a igualdad, el primero). Los candidatos van de menos a más
 * columnas, así 8 productos van 4 | 4 en lugar de 3 | 3 | 2 y un top 7 a span 8 va en una columna
 * de filas de una línea. Cada candidato trae los altos estimados con su ancho de columna.
 */
export function pickGrid(
  candidates: { cols: number; heights: number[]; tail: number[]; tailHidden?: number[]; free?: boolean }[],
  maxH: number,
  cap = Infinity,
  sep = 0,
): { grid: ListGrid; index: number } {
  let best: { grid: ListGrid; index: number } | null = null;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const grid = fitGrid(c.heights, c.tail, c.cols, maxH, cap, sep, c.tailHidden, c.free);
    if (!best || grid.shown > best.grid.shown) best = { grid, index: i };
    if (grid.shown >= Math.min(cap, c.heights.length)) return { grid, index: i };
  }
  return best ?? { grid: gridLayout([], [], 1, 0), index: 0 };
}

/**
 * Reparte el alto sobrante entre las filas de la grilla (hasta `maxExtra` px por fila) para que la
 * lista llene el cuerpo en lugar de dejar una banda vacía al pie ("tiles y strips distribuyen con 1fr").
 */
export function stretchRows(grid: ListGrid, avail: number | null, maxExtra: number): number[] {
  if (avail === null || !grid.rows || !Number.isFinite(avail)) return grid.heights;
  const extra = Math.max(0, Math.min(maxExtra, Math.floor((avail - grid.total - FIT_SAFETY) / grid.rows)));
  return extra ? grid.heights.map((h) => h + extra) : grid.heights;
}

/** Celdas de cada columna de la grilla: índices [inicio, fin) sobre la secuencia filas reales + neutrales. */
export function gridColumns(grid: ListGrid, cells: number): { from: number; to: number }[] {
  if (!grid.rows) return [];
  return Array.from({ length: grid.cols }, (_, k) => ({ from: k * grid.rows, to: Math.min(cells, (k + 1) * grid.rows) })).filter((c) => c.to > c.from);
}

/** Reparte bloques (alto en px) en columnas, en orden, sin superar `limit`. null si no caben (SplitRows). */
function greedy(heights: number[], cols: number, limit: number): number[][] | null {
  const out: number[][] = [[]];
  let h = 0;
  for (let i = 0; i < heights.length; i++) {
    const hi = heights[i];
    if (hi > limit) return null;
    if (h + hi > limit && out[out.length - 1].length) {
      if (out.length === cols) return null;
      out.push([]);
      h = 0;
    }
    out[out.length - 1].push(i);
    h += hi;
  }
  return out;
}

/** Reparto equilibrado (columnas de alto parecido: 8 | 7 en lugar de 12 | 3). */
export function packBalanced(heights: number[], cols: number, maxH: number): number[][] | null {
  if (!heights.length) return [];
  const limit = Number.isFinite(maxH) ? Math.floor(maxH) : heights.reduce((a, b) => a + b, 0);
  const full = greedy(heights, cols, limit);
  if (!full) return null;
  let lo = Math.max(...heights) - 1;
  let hi = limit;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (greedy(heights, cols, mid)) hi = mid;
    else lo = mid;
  }
  return greedy(heights, cols, hi) ?? full;
}

/**
 * Cuántas filas reales caben (en orden) junto con un bloque final opcional (neutrales),
 * repartidas en `cols` columnas de alto `maxH`. Devuelve también el reparto:
 * índices < shown son filas; el índice === shown (si hay tail) es el bloque final.
 */
export function fitRows(real: number[], tail: number, cols: number, maxH: number, cap = Infinity): { shown: number; columns: number[][] } {
  const start = Math.min(real.length, Math.max(0, cap));
  for (let r = start; r >= 0; r--) {
    const blocks = tail > 0 ? [...real.slice(0, r), tail] : real.slice(0, r);
    const columns = packBalanced(blocks, cols, maxH);
    if (columns) return { shown: r, columns };
  }
  return { shown: 0, columns: tail > 0 ? [[0]] : [] };
}

// ─── Etiquetas ───────────────────────────────────────────────────────────────

const NOUNS: Record<LabelKind, { plural: string; fem: boolean }> = {
  oficina: { plural: "oficinas", fem: true },
  persona: { plural: "personas", fem: true },
  proveedor: { plural: "proveedores", fem: false },
  ente: { plural: "entes", fem: false },
  generic: { plural: "categorías", fem: true },
};

export function kindNoun(kind: LabelKind, n: number): string {
  const noun = NOUNS[kind] ?? NOUNS.generic;
  if (n === 1) return noun.plural.replace(/es$/, "").replace(/s$/, "");
  return noun.plural;
}

/** "Otros" → "Otras 23 oficinas" / "Otros 68 proveedores". */
export function othersLabel(kind: LabelKind, folded?: number): string {
  const noun = NOUNS[kind] ?? NOUNS.generic;
  if (!folded) return noun.fem ? "Otras" : "Otros";
  return `${noun.fem ? "Otras" : "Otros"} ${formatInt(folded)} ${folded === 1 ? kindNoun(kind, 1) : noun.plural}`;
}

export function isOthers(raw: string): boolean {
  return raw.trim().toLowerCase() === "otros" || raw.trim().toLowerCase() === "otras";
}

/** Normaliza para búsqueda (sin tildes, minúsculas). */
export function searchKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// ─── Selección ───────────────────────────────────────────────────────────────

export function rowStateClass(selected: boolean, dimmed: boolean): string {
  return cn(selected && "bg-primary-soft ring-2 ring-inset ring-primary", dimmed && "opacity-[.45]");
}

// ─── Pie ─────────────────────────────────────────────────────────────────────

export const FOOTER_H = 28;

/** Pie de lista (28 px): alcance a la izquierda y "Ver N más" a la derecha. */
export function ListFooter({ left, right, className }: { left?: ReactNode; right?: ReactNode; className?: string }) {
  if (!left && !right) return null;
  return (
    <div className={cn("mt-auto flex min-h-7 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 pt-1.5 text-xs text-muted", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">{left}</div>
      {right && <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

export function MoreButton({ onClick, children, expanded }: { onClick: () => void; children: ReactNode; expanded?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className="whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold text-primary-text transition hover:bg-primary-soft focus-visible:outline-offset-0"
    >
      {children}
    </button>
  );
}

// ─── Diálogo con búsqueda (> 30 ítems) ──────────────────────────────────────

export function SearchListDialog<T>({
  open,
  onClose,
  title,
  items,
  getText,
  renderItem,
  placeholder = "Buscar…",
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  items: T[];
  getText: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  placeholder?: string;
  footer?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const k = searchKey(q.trim());
    const all = items.map((it, i) => ({ it, i }));
    return k ? all.filter(({ it }) => searchKey(getText(it)).includes(k)) : all;
  }, [items, getText, q]);
  return (
    <Dialog
      open={open}
      onClose={() => {
        setQ("");
        onClose();
      }}
      title={title}
      className="max-w-2xl"
    >
      <div className="sticky top-0 z-10 border-b border-border bg-surface px-5 py-3">
        <label className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 focus-within:border-primary">
          <Search className="size-4 shrink-0 text-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:appearance-none"
            autoFocus
          />
          <span className="tabular shrink-0 text-xs text-muted">
            {formatInt(filtered.length)} de {formatInt(items.length)}
          </span>
        </label>
      </div>
      <div className="px-3 py-2">
        {filtered.length ? (
          <ol className="flex flex-col">{filtered.map(({ it, i }) => renderItem(it, i))}</ol>
        ) : (
          <p className="px-2 py-8 text-center text-sm text-muted">Sin coincidencias para “{q}”.</p>
        )}
      </div>
      {footer && <div className="border-t border-border px-5 py-3 text-xs text-muted">{footer}</div>}
    </Dialog>
  );
}

// ─── Barra apilada (SplitRows y DrilldownBars) ───────────────────────────────

export interface StackSegment {
  key: string;
  label: string;
  value: number;
  /** Color CSS del segmento (variable). */
  color: string;
  /** Color de texto sobre el segmento (inkOn). */
  ink: string;
  tone?: StatusTone;
}

/**
 * Color, tinta y tono de cada clave apilada: familia semántica explícita del widget (con ícono en la
 * leyenda), gris para neutrales y slots categóricos en orden fijo para el resto.
 */
export function stackKeyMeta(
  keys: string[],
  semantic: SemanticFamily | undefined,
  overrides: VizOptions["overrides"],
  resolve: (cssColor: string) => string,
): (Omit<StackSegment, "value"> & { neutral: boolean })[] {
  let slot = 0;
  return keys.map((key) => {
    const st = semantic ? resolveStatus(key, semantic, overrides) : null;
    const neutral = isNeutral(key);
    let color: string;
    if (st) color = st.color;
    else if (neutral) color = "var(--neutral-mark)";
    else {
      slot++;
      color = slot <= 8 ? `var(--chart-${slot})` : "var(--chart-other)";
    }
    const hex = resolve(color);
    return {
      key,
      label: overrides?.[key]?.label ?? st?.display ?? displayLabel(key).full,
      color,
      ink: /^#[0-9a-f]{6}$/i.test(hex) ? inkOn(hex) : "#ffffff",
      tone: st?.tone ?? undefined,
      neutral,
    };
  });
}

/** Segmento con su etiqueta interior solo si mide ≥ 56 px. */
export const SEGMENT_LABEL_MIN = 56;

export function StackBar({
  segments,
  total,
  frac,
  trackPx,
  percent,
  rowLabel,
  onSegment,
  selectedKeys,
  onHover,
  onLeave,
  hint,
  height = 14,
}: {
  segments: StackSegment[];
  /** Total de la fila (para % dentro de la fila). */
  total: number;
  /** Fracción del ancho de la pista que ocupa la barra (0..1). */
  frac: number;
  /** Ancho de la pista en px (decide si cabe la etiqueta interior). */
  trackPx: number;
  /** Etiquetas en % de la fila en lugar de cantidades. */
  percent: boolean;
  rowLabel: string;
  onSegment?: (key: string) => void;
  selectedKeys?: string[];
  onHover?: (x: number, y: number, content: TooltipContent) => void;
  onLeave?: () => void;
  hint?: (seg: StackSegment) => string;
  height?: number;
}) {
  const visible = segments.filter((s) => s.value > 0);
  const anySel = Boolean(selectedKeys?.length);
  const content = (active: string): TooltipContent => ({
    title: rowLabel,
    value: formatInt(total),
    valueNote: "en total",
    rows: segments.map((s) => ({
      label: s.label,
      value: formatInt(s.value),
      share: total ? formatPct(s.value / total) : undefined,
      color: s.color,
      tone: s.tone,
      active: s.key === active,
    })),
    hint: onSegment ? hint?.(segments.find((s) => s.key === active) ?? segments[0]) : undefined,
  });
  const barPx = trackPx * Math.max(0, Math.min(1, frac));
  const sum = visible.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div className="flex min-w-0 items-center" style={{ height }}>
      <div
        className="flex h-full min-w-0 gap-[2px] overflow-hidden rounded-[4px] transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%`, minWidth: visible.length ? Math.min(4, trackPx) : 0 }}
      >
        {visible.map((s) => {
          const px = (barPx - 2 * (visible.length - 1)) * (s.value / sum);
          const text = percent ? formatPct(total ? s.value / total : 0, 0) : formatInt(s.value);
          const showText = px >= SEGMENT_LABEL_MIN && height >= 12;
          const dim = anySel && !selectedKeys!.includes(s.key);
          const sel = anySel && selectedKeys!.includes(s.key);
          const style = { flex: `${s.value} 1 0px`, background: s.color, color: s.ink };
          const cls = cn(
            "flex h-full min-w-[2px] items-center justify-center overflow-hidden text-[10.5px] font-semibold leading-none tabular transition-opacity",
            dim && "opacity-[.4]",
            sel && "shadow-[inset_0_0_0_1.5px_var(--text)]",
          );
          const aria = `${s.label}: ${formatInt(s.value)} (${formatPct(total ? s.value / total : 0)})`;
          const events = {
            onPointerEnter: (e: React.PointerEvent) => onHover?.(e.clientX, e.clientY, content(s.key)),
            onPointerMove: (e: React.PointerEvent) => onHover?.(e.clientX, e.clientY, content(s.key)),
            onPointerLeave: () => onLeave?.(),
          };
          if (onSegment)
            return (
              <button
                key={s.key}
                type="button"
                aria-label={`${aria}. ${hint?.(s) ?? "Filtrar"}`}
                aria-pressed={sel}
                onClick={(e) => {
                  e.stopPropagation();
                  onSegment(s.key);
                }}
                onFocus={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  onHover?.(r.left + r.width / 2, r.top + r.height / 2, content(s.key));
                }}
                onBlur={() => onLeave?.()}
                className={cn(cls, "focus-visible:outline-offset-[-2px]")}
                style={style}
                {...events}
              >
                {showText && <span aria-hidden>{text}</span>}
              </button>
            );
          return (
            <span key={s.key} className={cls} style={style} {...events}>
              {showText && <span aria-hidden>{text}</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}
