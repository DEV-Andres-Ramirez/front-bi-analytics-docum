"use client";

import { Chart as ChartJS, type ActiveElement, type ChartData, type ChartEvent, type ChartOptions, type Plugin, type TooltipModel } from "chart.js";
import { TreemapController, TreemapElement, type TreemapDataPoint } from "chartjs-chart-treemap";
import { ChevronDown } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type UIEvent } from "react";
import { Chart } from "react-chartjs-2";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { Segmented } from "@/components/ui/primitives";
import type { CategoryResult } from "@/dashboards/dto";
import type { BarWidget, DonutWidget, ValueFormat } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { useMediaQuery } from "@/hooks/use-media-query";
import { registerCharts } from "@/lib/charts/register";
import { isMissing, isNeutral } from "@/lib/charts/semantic";
import { inkOn, seqColor, useChartTheme } from "@/lib/charts/theme";
import { formatInt, formatPct, formatValue } from "@/lib/format";
import { displayLabel } from "@/lib/labels";
import { useExporter } from "./frame-context";
import { ChartTooltip, chartJsExternal, useChartTooltip, type TooltipContent } from "./kit/chart-tooltip";
import { HeaderSlot, LegendSlot } from "./kit/legend-slot";
import { CountChip, QUALITY_CHIP_MIN, QUALITY_NOTICE_MIN, QualityChip } from "./kit/quality";
import { mixHex, RESIZE_RECOVERY, selectionOf } from "./matrix-kit";
import { RankingList } from "./ranking-list";
import type { VizProps } from "./types";

registerCharts();
ChartJS.register(TreemapController, TreemapElement);

/**
 * Treemap (docs/ui-design-system.md › Treemap): partes de un todo con muchas categorías cortas.
 * - Un solo tono secuencial por valor. Los faltantes ("No reporta", "Sin …") NO entran al árbol: chip en
 *   la franja (calidad entre el 15 y el 85 %, conteo gris por debajo). Las cubetas residuales del
 *   catálogo ("Otros", "Resto / otras", "Otros motivos") no son faltantes: van a la tesela gris "Otras (N)".
 * - Máximo 12 tiles + "Otras (N)", siempre al final (abajo a la derecha): se pliega además toda
 *   categoría con menos del 2 % del árbol y, con el lienzo medido, la cola (< 6 %) cuyo tile real
 *   (réplica del squarify del plugin) no alcanza para mostrar su nombre: ningún tile queda en un número.
 * - Etiqueta dentro (inkOn): nombre por palabras enteras (sin partir sílabas; elipsis en la última
 *   línea) + valor si el tile mide ≥ 80×36; entre 44 y 80 px, el valor y el nombre solo si cabe
 *   completo (nombre en tooltip y Lista).
 * - Hueco de 2 px; ChartTooltip con nombre completo, valor y %; clic filtra.
 * - vizOptions.listToggle: Segmented "Mapa de árbol | Lista" (RankingList con el mismo resultado).
 *   En angosto (< 480 px) abre en Lista mientras el usuario no elija; si el cuerpo tiene alto fijo y
 *   la lista no cabe, desvanecido inferior + pie "+N más · desplaza".
 */

const MAX_TILES = 12;
/** Participación mínima en el árbol para tener tile propio. */
const MIN_SHARE = 0.02;
/**
 * Participación desde la que una categoría nunca se pliega por tamaño de tile (solo por MAX_TILES):
 * el ajuste al lienzo solo manda a "Otras (N)" la cola de categorías pequeñas.
 */
const FOLD_CAP = 0.06;
/** Etiqueta completa (nombre + valor). */
const FULL_W = 80;
/** Solo el valor (tiles angostos). */
const MIN_W = 44;
const MIN_H = 36;
const PAD = 7;
/** Separación de chartjs-chart-treemap (dataset.spacing): cada tile se dibuja 2 × SPACING más chico. */
const SPACING = 1;
const NARROW_BELOW = 480;
const LIST_FADE = "linear-gradient(to bottom, #000 calc(100% - 32px), transparent)";

interface Tile {
  key: string;
  /** Etiqueta cruda (valor de filtro); null en "Otras N". */
  raw: string | null;
  label: string;
  full: string;
  value: number;
  members?: { label: string; value: number }[];
}

/** Categorías del resultado separadas en reales (por valor), faltantes (chip) y residuales ("Otras"). */
interface Classified {
  real: Tile[];
  /** Faltantes (chip de calidad): "No reporta", "Sin …", "N/A". */
  neutrals: { label: string; value: number }[];
  /** Cubetas residuales del catálogo: van a "Otras (N)" (gris, al final), no al chip. */
  residual: { label: string; value: number }[];
  residualValue: number;
  /** "Otros" del motor (categorías ya plegadas en el servidor) y cuántas son. */
  engineOthers: number;
  engineCount: number;
  treeTotal: number;
}

function classify(result: CategoryResult, kind: BarWidget["labelKind"]): Classified {
  const neutrals: Classified["neutrals"] = [];
  const residual: Classified["residual"] = [];
  const real: Tile[] = [];
  let engineOthers = 0;
  result.labels.forEach((label, i) => {
    const value = result.values[i] ?? 0;
    if (value <= 0) return;
    const n = label.trim().toLowerCase();
    // "Otros" del motor (categorías plegadas) se suma a "Otras N"
    if (result.folded && (n === "otros" || n === "otras")) {
      engineOthers += value;
      return;
    }
    if (isNeutral(label)) {
      // Cubeta residual ("Otros", "Resto / otras", "Otros motivos"): neutral pero no es un faltante
      if (!isMissing(label)) residual.push({ label: displayLabel(label).full, value });
      else neutrals.push({ label: displayLabel(label).short, value });
      return;
    }
    const d = displayLabel(label, kind);
    real.push({ key: label, raw: label, label: d.short, full: d.full, value });
  });
  real.sort((a, b) => b.value - a.value);
  const residualValue = residual.reduce((s, t) => s + t.value, 0);
  const treeTotal = real.reduce((s, t) => s + t.value, 0) + engineOthers + residualValue;
  return { real, neutrals, residual, residualValue, engineOthers, engineCount: result.folded ?? 0, treeTotal };
}

/** ¿"Otras" tendría algo más que la única categoría plegada? (un "Otras (1)" solo no aporta). */
const othersBesides = (c: Classified) => c.engineOthers > 0 || c.residualValue > 0;

/** Corte por participación: hasta MAX_TILES categorías con ≥ 2 % del árbol. */
function shareCut(c: Classified): number {
  let cut = 0;
  while (cut < c.real.length && cut < MAX_TILES && (!c.treeTotal || c.real[cut].value / c.treeTotal >= MIN_SHARE)) cut++;
  // Un "Otras 1" no aporta: si queda una sola categoría pequeña, va con su nombre
  if (c.real.length - cut === 1 && !othersBesides(c) && cut < MAX_TILES) cut++;
  return cut;
}

/** Tiles del árbol con las `cut` categorías más grandes; el resto (y los residuales) va a "Otras (N)". */
function assemble(c: Classified, cut: number): Tile[] {
  const tiles = c.real.slice(0, cut);
  const rest = c.real.slice(cut);
  const restCount = rest.length + c.engineCount + c.residual.length;
  const restValue = rest.reduce((s, t) => s + t.value, 0) + c.engineOthers + c.residualValue;
  if (restValue > 0) {
    // "Otras (4)": el conteo entre paréntesis no se confunde con el valor del tile ("Otras (4)  16").
    // Va último en el árbol (unsorted): el neutral queda al final, abajo a la derecha.
    const label = `Otras (${formatInt(restCount || 1)})`;
    const members = [...rest.map((t) => ({ label: t.full, value: t.value })), ...c.residual].sort((a, b) => b.value - a.value);
    tiles.push({ key: "__otras", raw: null, label, full: `Otras ${restCount} categorías`, value: restValue, members });
  }
  return tiles;
}

/**
 * Réplica del squarify de chartjs-chart-treemap 4.x (un nivel, `unsorted`): tamaño de cada tile en
 * el lienzo, en el mismo orden de `values`. Con él se decide el plegado sobre el tile real y no sobre
 * un área estimada (un tile alto y angosto de 48 px no alcanza para el nombre aunque su área sí).
 */
function squarify(values: number[], W: number, H: number): { w: number; h: number }[] {
  const total = values.reduce((s, v) => s + v, 0);
  if (!total || W <= 0 || H <= 0) return values.map(() => ({ w: 0, h: 0 }));
  const ratio = (W * H) / total;
  let ix = 0;
  let iy = 0;
  // Dirección del renglón: en columna ("y") si el espacio libre es más ancho que alto
  const columnar = () => H - iy <= W - ix && H - iy > 0;
  const side = () => (columnar() ? H - iy : W - ix);
  const worst = (row: number[], len: number) => {
    const sum = row.reduce((s, v) => s + v, 0);
    const s2 = sum * sum;
    const l2 = len * len;
    return Math.max((l2 * Math.max(...row)) / s2, s2 / (l2 * Math.min(...row)));
  };
  const out: { w: number; h: number }[] = [];
  const place = (row: number[]) => {
    const col = columnar();
    const len = side();
    const sum = row.reduce((s, v) => s + v, 0);
    const thick = sum / len;
    for (const a of row) out.push(col ? { w: thick, h: (a * len) / sum } : { w: (a * len) / sum, h: thick });
    if (col) ix += thick;
    else iy += thick;
  };
  let row: number[] = [];
  let len = side();
  for (const v of values) {
    const a = v * ratio;
    if (!row.length || worst([...row, a], len) <= worst(row, len)) {
      row.push(a);
      continue;
    }
    place(row);
    len = side();
    row = [a];
  }
  if (row.length) place(row);
  return out;
}

/** Contexto 2D para medir texto fuera del gráfico (null en el servidor). */
let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  measureCtx ??= document.createElement("canvas").getContext("2d");
  return measureCtx;
}

/**
 * Corte final con el lienzo real: mientras algún tile con nombre propio no pueda mostrarlo (el
 * squarify lo deja angosto o bajo, o su primera palabra no cabe), la categoría más pequeña pasa a
 * "Otras (N)". Solo se pliega la cola (< 6 % del árbol) y nunca para dejar un "Otras (1)" solo.
 * Así ningún tile real queda como un número suelto; el nombre sigue en el tooltip y en la Lista.
 */
function fitCut(c: Classified, from: number, w: number, h: number, format: ValueFormat): number {
  const ctx = getMeasureCtx();
  if (!ctx || w <= 0 || h <= 0) return from;
  let cut = from;
  while (cut > 1) {
    const tiles = assemble(c, cut);
    const rects = squarify(
      tiles.map((t) => t.value),
      w,
      h,
    );
    const mute = tiles.some((t, i) => t.raw !== null && !layoutLabel(ctx, t, rects[i].w - 2 * SPACING, rects[i].h - 2 * SPACING, format)?.named);
    if (!mute) break;
    // Un "Otras (1)" solo mide lo mismo que la categoría que pliega: se pliegan dos a la vez
    const step = c.real.length - (cut - 1) === 1 && !othersBesides(c) ? 2 : 1;
    if (cut - step < 1 || c.real.slice(cut - step, cut).some((t) => c.treeTotal && t.value / c.treeTotal >= FOLD_CAP)) break;
    cut -= step;
  }
  return cut;
}

/** Recorta un texto al ancho disponible (con elipsis) midiendo en el canvas. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid).trimEnd()}…`).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return lo > 1 ? `${text.slice(0, lo).trimEnd()}…` : "";
}

const VOWEL = /[aeiouáéíóúü]/i;
const LETTER = /\p{L}/u;
/** Grupos consonánticos que no se separan al silabear ("ha-blar", "Ins-truc-ción", "ca-lle"). */
const CLUSTERS = new Set(["bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "kl", "kr", "pl", "pr", "tl", "tr", "ch", "ll", "rr"]);
/** Palabras de hasta 14 letras nunca se parten ("Actualización", "Informativos", "Heredadas"). */
const MAX_WHOLE = 14;
/** Conectores que no cierran una línea con elipsis ("Datos de…" → "Datos…"). */
const CONNECTOR = /^(de|del|el|la|las|los|en|y|e|o|u|a|al|por|para|con|sin)$/i;

/**
 * ¿Se puede partir `w` antes de `w[k]`? Silabeo español simplificado: nunca antes de vocal
 * (sílaba CV, diptongos e hiatos quedan juntos); V-CV ("He-re-da-das"), VC-CV ("In-for-ma")
 * y V-CCV con grupo inseparable ("Ins-truc-ción").
 */
function syllableBreak(w: string, k: number): boolean {
  const a = w[k - 1] ?? "";
  const b = w[k] ?? "";
  const c = w[k + 1] ?? "";
  if (!LETTER.test(a) || !LETTER.test(b) || !LETTER.test(c) || VOWEL.test(b)) return false;
  const bc = CLUSTERS.has(`${b}${c}`.toLowerCase());
  if (VOWEL.test(a)) return VOWEL.test(c) || (bc && VOWEL.test(w[k + 2] ?? ""));
  return !CLUSTERS.has(`${a}${b}`.toLowerCase()) && (VOWEL.test(c) || bc);
}

interface Token {
  text: string;
  /** Va separada de la anterior por un espacio (false: sigue a una "/"). */
  space: boolean;
}

/** Palabras del texto; tras una "/" se puede cortar sin guion ("Heredadas/" + "Trasladadas"). */
function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    // Separador suelto ("reembolso / incapacidad"): viaja con la palabra anterior, nunca abre línea
    const prev = out[out.length - 1];
    if (prev && /^[/\-–—·|]+$/.test(word)) {
      out[out.length - 1] = { ...prev, text: `${prev.text} ${word}` };
      continue;
    }
    let rest = word;
    let space = true;
    let at = rest.indexOf("/");
    while (at >= 0 && at < rest.length - 1) {
      out.push({ text: rest.slice(0, at + 1), space });
      rest = rest.slice(at + 1);
      space = false;
      at = rest.indexOf("/");
    }
    out.push({ text: rest, space });
  }
  return out;
}

const joinTokens = (ts: Token[]) => ts.map((t, i) => (i && t.space ? ` ${t.text}` : t.text)).join("");

/** Corte con guion en un límite de sílaba (solo para palabras de más de 14 letras). */
function hyphenate(ctx: CanvasRenderingContext2D, w: string, maxW: number): [string, string] | null {
  let k = w.length - 3;
  while (k >= 3 && (ctx.measureText(`${w.slice(0, k)}-`).width > maxW || !syllableBreak(w, k))) k--;
  return k >= 3 ? [`${w.slice(0, k)}-`, w.slice(k)] : null;
}

/** Cierra una línea con elipsis quitando palabras enteras (y conectores colgantes). */
function ellipsize(ctx: CanvasRenderingContext2D, ts: Token[], maxW: number): string {
  for (let n = ts.length; n > 0; n--) {
    if (n > 1 && CONNECTOR.test(ts[n - 1].text)) continue;
    const t = `${joinTokens(ts.slice(0, n)).replace(/[\s,;:./-]+$/, "")}…`;
    if (ctx.measureText(t).width <= maxW) return t;
  }
  return fitText(ctx, joinTokens(ts), maxW);
}

/**
 * Parte un texto en hasta `maxLines` líneas por palabras enteras: nunca parte una palabra de hasta
 * 14 letras (las más largas, por sílaba y con guion). Si el texto no cabe, la última línea se cierra
 * con elipsis sin partir palabras. Devuelve [] si ni la primera palabra cabe entera (el tile muestra
 * solo el valor; el nombre queda en el tooltip y en la Lista).
 */
function wrapN(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  if (maxLines <= 0 || maxW <= 0) return [];
  if (ctx.measureText(text).width <= maxW) return [text];
  const tokens = tokenize(text);
  const fits = (ts: Token[]) => ctx.measureText(joinTokens(ts)).width <= maxW;
  const lines: Token[][] = [];
  let line: Token[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tk = tokens[i];
    if (fits([...line, tk])) {
      line.push(tk);
      i++;
      continue;
    }
    if (line.length) {
      if (lines.length === maxLines - 1) break;
      lines.push(line);
      line = [];
      continue;
    }
    // Palabra sola más ancha que la línea
    const letters = [...tk.text].filter((ch) => LETTER.test(ch)).length;
    const cut = letters > MAX_WHOLE && lines.length < maxLines - 1 ? hyphenate(ctx, tk.text, maxW) : null;
    if (!cut) break;
    lines.push([{ text: cut[0], space: tk.space }]);
    tokens[i] = { text: cut[1], space: false };
  }
  if (line.length) lines.push(line);
  if (i >= tokens.length) return lines.map(joinTokens);
  if (!lines.length) return [];
  const last = lines.pop()!;
  return [...lines.map(joinTokens), ellipsize(ctx, last, maxW)];
}

const FONT_NAME = { size: 11, weight: 600 as const, lineHeight: 1.3 };
const FONT_VALUE = { size: 13, weight: 700 as const, lineHeight: 1.3 };
type LabelFont = typeof FONT_NAME | typeof FONT_VALUE;

function fontString(f: { size: number; weight: number }) {
  return `${f.weight} ${f.size}px ${ChartJS.defaults.font.family ?? "sans-serif"}`;
}

interface LabelLayout {
  lines: string[];
  fonts: LabelFont[];
  /** La etiqueta lleva el nombre (no solo el valor). */
  named: boolean;
}

/**
 * Etiqueta del tile (cada línea con su fuente):
 * - ≥ 80 px de ancho: una línea "Nombre  valor" hasta 48 px de alto; desde 48 px, nombre por palabras
 *   enteras en tantas líneas como quepan (máx. 3) + valor. Si ni la primera palabra cabe, solo el valor.
 * - 44–80 px: el valor, con el nombre encima solo si cabe COMPLETO por palabras enteras (sin elipsis:
 *   "Otras" / "(5)" / "17"); si no, solo el valor (un nombre cortado en 60 px no se lee: va al tooltip
 *   y a la Lista). fitCut ya pliega a "Otras (N)" las categorías que quedarían sin nombre.
 * - < 44×36: nada (tooltip y lista).
 */
function layoutLabel(c: CanvasRenderingContext2D, t: Tile, w: number, h: number, format: ValueFormat): LabelLayout | null {
  if (w < MIN_W || h < MIN_H) return null;
  const maxW = w - 2 * PAD - 2;
  const val = formatValue(t.value, format, { compact: true });
  const lineName = FONT_NAME.size * FONT_NAME.lineHeight;
  const lineValue = FONT_VALUE.size * FONT_VALUE.lineHeight;
  const room = Math.floor((h - 2 * PAD - lineValue) / lineName);
  c.save();
  let out: LabelLayout | null;
  if (w < FULL_W) {
    c.font = fontString(FONT_VALUE);
    const fitsValue = c.measureText(val).width <= maxW;
    c.font = fontString(FONT_NAME);
    const name = fitsValue && room >= 1 ? wrapN(c, t.label, maxW, Math.min(3, room)) : [];
    const whole = name.length > 0 && !name[name.length - 1].endsWith("…");
    out = !fitsValue
      ? null
      : whole
        ? { lines: [...name, val], fonts: [...name.map(() => FONT_NAME), FONT_VALUE], named: true }
        : { lines: [val], fonts: [FONT_VALUE], named: false };
  } else if (h < 48) {
    c.font = fontString(FONT_NAME);
    const vw = c.measureText(val).width;
    const name = wrapN(c, t.label, maxW - vw - 8, 1)[0] ?? "";
    out = { lines: [name ? `${name}  ${val}` : val], fonts: [FONT_NAME], named: name !== "" };
  } else {
    c.font = fontString(FONT_NAME);
    const name = wrapN(c, t.label, maxW, Math.max(1, Math.min(3, room)));
    out = { lines: [...name, val], fonts: [...name.map(() => FONT_NAME), FONT_VALUE], named: name.length > 0 };
  }
  c.restore();
  return out;
}

interface ListOverflow {
  /** Queda contenido bajo el borde inferior (desvanecido). */
  bottom: boolean;
  /** Filas de la lista (li) que no se ven completas. */
  below: number;
}

const NO_LIST_OVERFLOW: ListOverflow = { bottom: false, below: 0 };

function readListOverflow(el: HTMLElement): ListOverflow {
  const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  if (!bottom) return NO_LIST_OVERFLOW;
  const edge = el.getBoundingClientRect().bottom;
  let below = 0;
  el.querySelectorAll("li").forEach((li) => {
    if (li.getBoundingClientRect().bottom > edge + 1) below++;
  });
  return { bottom, below };
}

/**
 * Contenido oculto de la Lista cuando el cuerpo tiene alto fijo (móvil: 300 px): desvanecido y pie
 * "+N más · desplaza". Se mide en un ref callback (ResizeObserver) y en onScroll, nunca en render.
 */
function useListOverflow() {
  const [overflow, setOverflow] = useState<ListOverflow>(NO_LIST_OVERFLOW);
  const update = useCallback((el: HTMLElement) => {
    const next = readListOverflow(el);
    setOverflow((s) => (s.bottom === next.bottom && s.below === next.below ? s : next));
  }, []);
  const ref = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      const ro = new ResizeObserver(() => update(el));
      ro.observe(el);
      for (const child of Array.from(el.children)) ro.observe(child);
      return () => ro.disconnect();
    },
    [update],
  );
  const onScroll = useCallback((e: UIEvent<HTMLElement>) => update(e.currentTarget), [update]);
  return { ref, onScroll, overflow };
}

type TreemapChart = ChartJS<"treemap", TreemapDataPoint[], unknown>;

const tileOf = (raw: unknown): Tile | undefined => (raw as TreemapDataPoint | undefined)?._data as Tile | undefined;

/** Datos de presentación que el plugin de etiquetas lee del dataset (no son opciones de Chart.js). */
interface LabelInfo {
  format: ValueFormat;
  inkOf: (key: string) => string;
}

/**
 * Etiquetas de los tiles dibujadas por nosotros (no por el plugin del treemap): así cada línea
 * lleva su fuente (nombre 11/600, valor 13/700) y el texto se mide con el tamaño real del tile.
 */
const TILE_LABELS: Plugin<"treemap"> = {
  id: "documTreemapLabels",
  afterDatasetsDraw(chart) {
    const ds = chart.data.datasets[0] as unknown as { data: TreemapDataPoint[]; documLabels?: LabelInfo } | undefined;
    const info = ds?.documLabels;
    if (!ds || !info) return;
    const meta = chart.getDatasetMeta(0);
    const c = chart.ctx;
    const area = chart.chartArea;
    meta.data.forEach((el, i) => {
      const e = el as unknown as { x: number; y: number; width: number; height: number; hidden?: boolean };
      const t = tileOf(ds.data[i]);
      if (!t || e.hidden || e.width < MIN_W || e.height < MIN_H) return;
      const lay = layoutLabel(c, t, e.width, e.height, info.format);
      if (!lay) return;
      c.save();
      c.beginPath();
      c.rect(Math.max(e.x, area.left), Math.max(e.y, area.top), e.width, e.height);
      c.clip();
      c.textAlign = "left";
      c.textBaseline = "top";
      c.fillStyle = info.inkOf(t.key);
      let y = e.y + PAD;
      lay.lines.forEach((line, k) => {
        const f = lay.fonts[k] ?? FONT_NAME;
        c.font = fontString(f);
        c.fillText(line, e.x + PAD, y + 1);
        y += f.size * f.lineHeight;
      });
      c.restore();
    });
  },
};
const PLUGINS = [TILE_LABELS, RESIZE_RECOVERY as unknown as Plugin<"treemap">];

export function Treemap({ widget, result, height, span, expanded }: VizProps<BarWidget | DonutWidget, CategoryResult>) {
  const theme = useChartTheme();
  const { filters, toggleValue } = useDashboard();
  const { state, show, hide } = useChartTooltip();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const chartRef = useRef<TreemapChart | null>(null);
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null);
  // Lista dentro de un cuerpo de alto fijo (móvil: 300 px del canvas): desvanecido y pie con las filas ocultas
  const { ref: listScrollRef, onScroll: onListScroll, overflow: listOverflow } = useListOverflow();
  // Fila por contenido (móvil): la RankingList no se ajusta a un alto (muestra todo y recorta), así
  // que va en un envoltorio de alto automático y el scroll lo lleva este contenedor, con desvanecido.
  const [byContent, setByContent] = useState(false);
  const listRef = useCallback(
    (el: HTMLDivElement | null) => {
      setListEl(el);
      if (!el) return;
      const read = () => {
        const row = el.closest(".dash-row");
        const rowH = row ? getComputedStyle(row).getPropertyValue("--row-h").trim() : "";
        setByContent(rowH !== "" && rowH === "auto");
      };
      read();
      const ro = new ResizeObserver(read);
      ro.observe(el);
      const stop = listScrollRef(el);
      return () => {
        ro.disconnect();
        stop?.();
      };
    },
    [listScrollRef],
  );
  /** null: el usuario no ha elegido (angosto abre en Lista: en táctil no hay hover para leer tiles mudos). */
  const [mode, setMode] = useState<"tree" | "list" | null>(null);
  const { ref: boxRef, width: boxW, height: boxH, measured } = useElementSize<HTMLDivElement>();
  const narrow = measured && boxW < NARROW_BELOW;
  const listToggle = Boolean(widget.vizOptions?.listToggle);
  const effMode = mode ?? (narrow ? "list" : "tree");
  const showList = listToggle && effMode === "list";
  // Sin medir y sin elección: no se monta el canvas (evita dibujar el árbol y cambiar a Lista al medir)
  const pending = listToggle && mode === null && !measured;
  const dimension = widget.dimension;
  const noCross = widget.type === "bar" && widget.noCrossFilter;
  const format: ValueFormat = (widget.type === "bar" ? widget.valueFormat : undefined) ?? "int";
  const total = result.total || result.values.reduce((a, b) => a + (b ?? 0), 0);

  // Lienzo del árbol: medido en su contenedor; antes de montarlo, estimado con la caja (menos la franja)
  const { ref: canvasBoxRef, width: canvasW, height: canvasH, measured: canvasMeasured } = useElementSize<HTMLDivElement>();
  const treeW = Math.floor(canvasMeasured ? canvasW : measured ? boxW : 0);
  const treeH = Math.floor(canvasMeasured ? canvasH : measured ? Math.max(0, boxH - 28) : 0);
  const classified = useMemo(() => classify(result, widget.labelKind), [result, widget.labelKind]);
  // Corte (número): los tiles solo cambian cuando cambia el plegado, no en cada píxel de resize
  const cut = useMemo(() => fitCut(classified, shareCut(classified), treeW, treeH, format), [classified, treeW, treeH, format]);
  const tiles = useMemo(() => assemble(classified, cut), [classified, cut]);
  const { neutrals } = classified;
  const max = classified.real[0]?.value ?? 0;
  const realCount = classified.real.length;
  const sel = selectionOf(filters.eq, dimension);
  const selKey = (filters.eq[dimension] ?? []).join("\u0001");

  // Color por tile: un solo tono secuencial (raíz del valor), atenuado si hay otra selección
  const colors = useMemo(() => {
    const selected = new Set(selKey ? selKey.split("\u0001") : []);
    const m = new Map<string, { bg: string; ink: string; selected: boolean }>();
    for (const t of tiles) {
      const base = t.raw === null ? theme.other : seqColor(theme, 0.22 + 0.72 * Math.sqrt(max ? t.value / max : 0));
      const isSel = t.raw !== null && selected.has(t.raw);
      const bg = selected.size && !isSel ? mixHex(base, theme.surface, 0.45) : base;
      m.set(t.key, { bg, ink: inkOn(bg), selected: isSel });
    }
    return m;
  }, [tiles, max, theme, selKey]);

  const exporter = useCallback(async () => {
    if (showList && listEl) {
      try {
        const { toPng } = await import("html-to-image");
        const bg = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#ffffff";
        return await toPng(listEl, { pixelRatio: 2, backgroundColor: bg, cacheBust: true });
      } catch {
        return null;
      }
    }
    return chartRef.current?.toBase64Image("image/png", 1) ?? null;
  }, [showList, listEl]);
  useExporter(exporter);

  const data = useMemo<ChartData<"treemap", TreemapDataPoint[], unknown>>(() => {
    const documLabels: LabelInfo = { format, inkOf: (key) => colors.get(key)?.ink ?? theme.text };
    return {
      datasets: [
        {
          label: widget.title,
          // Copia nueva en cada cambio: react-chartjs-2 reasigna `data: []` y el controlador solo
          // recalcula el layout cuando cambia la referencia del árbol.
          tree: tiles.map((t) => ({ ...t })) as unknown as Record<string, unknown>[],
          key: "value",
          data: [],
          spacing: SPACING,
          // Selección: borde --primary de 2 px (el resto se atenúa en el color)
          borderWidth: ((ctx: { raw: unknown }) => (colors.get(tileOf(ctx.raw)?.key ?? "")?.selected ? 2 : 0)) as unknown as number,
          borderColor: theme.primary,
          borderRadius: 4,
          backgroundColor: (ctx) => colors.get(tileOf(ctx.raw)?.key ?? "")?.bg ?? theme.other,
          hoverBackgroundColor: (ctx) => {
            const c = colors.get(tileOf(ctx.raw)?.key ?? "")?.bg ?? theme.other;
            return mixHex(c, theme.text, 0.9);
          },
          labels: { display: false },
          captions: { display: false },
          // Orden del árbol = orden de `tiles` (real por valor y "Otras (N)" al final): el neutral no
          // queda en medio del árbol aunque sume más que las últimas categorías
          unsorted: true,
          documLabels,
        } as ChartData<"treemap", TreemapDataPoint[], unknown>["datasets"][number],
      ],
    };
  }, [tiles, colors, theme, widget.title, format]);

  const toContent = useCallback(
    (tooltip: TooltipModel<"treemap">): TooltipContent | null => {
      const t = tileOf(tooltip.dataPoints?.[0]?.raw);
      if (!t) return null;
      return {
        title: t.full,
        value: formatValue(t.value, format),
        valueNote: total ? `${formatPct(t.value / total)} del total` : undefined,
        rows: t.members?.length
          ? t.members.slice(0, 8).map((m) => ({ label: m.label, value: formatValue(m.value, format), color: theme.other }))
          : undefined,
        extra: t.members && t.members.length > 8 ? <p className="mt-1 text-white/60">y {t.members.length - 8} más</p> : undefined,
        hint: t.raw !== null && !noCross ? "Clic para filtrar" : undefined,
      };
    },
    [format, total, theme.other, noCross],
  );

  const options = useMemo<ChartOptions<"treemap">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: reduced ? false : { duration: 400, easing: "easeOutQuart" },
      layout: { padding: 0 },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false, external: chartJsExternal<"treemap">(show, hide, toContent) },
      },
      onHover: (e: ChartEvent, els: ActiveElement[]) => {
        const target = e.native?.target as HTMLElement | undefined;
        if (target) target.style.cursor = els.length && !noCross ? "pointer" : "default";
      },
      onClick: (_e: ChartEvent, els: ActiveElement[], chart) => {
        if (noCross || !els.length) return;
        const point = chart.data.datasets[0]?.data[els[0].index];
        const t = tileOf(point);
        if (t?.raw) toggleValue(dimension, t.raw);
      },
    }),
    [reduced, show, hide, toContent, noCross, toggleValue, dimension],
  );

  const neutralTotal = neutrals.reduce((s, n) => s + n.value, 0);
  const neutralShare = total ? neutralTotal / total : 0;
  // Calidad de dato (colorSystem H): chip warning entre el 15 y el 85 % neutral; conteo gris por debajo
  const chips =
    !showList && !pending && neutrals.length > 0 ? (
      <LegendSlot side="end">
        {neutralShare >= QUALITY_CHIP_MIN && neutralShare < QUALITY_NOTICE_MIN ? (
          <QualityChip neutral={neutralTotal} total={total} label={neutrals.length === 1 ? neutrals[0].label.toLocaleLowerCase("es-CO") : "sin dato"} />
        ) : neutrals.length === 1 ? (
          <CountChip>
            {neutrals[0].label} {formatInt(neutrals[0].value)} · {formatPct(total ? neutrals[0].value / total : 0)}
          </CountChip>
        ) : (
          <CountChip>
            Sin dato {formatInt(neutralTotal)} · {formatPct(total ? neutralTotal / total : 0)}
          </CountChip>
        )}
      </LegendSlot>
    ) : null;

  const listWidget = useMemo(
    () => ({ ...widget, viz: "ranking" as const, vizOptions: { ...widget.vizOptions, columns: (span >= 8 ? 2 : 1) as 1 | 2 } }) as unknown as BarWidget,
    [widget, span],
  );

  return (
    <div ref={boxRef} className="flex h-full min-h-0 flex-col">
      {listToggle && (
        <HeaderSlot>
          <Segmented
            label="Vista"
            value={effMode}
            onChange={(v) => {
              hide();
              setMode(v);
            }}
            options={[
              { value: "tree", label: narrow ? "Árbol" : "Mapa de árbol" },
              { value: "list", label: "Lista" },
            ]}
          />
        </HeaderSlot>
      )}
      {!showList && !pending && (
        <LegendSlot>
          <span className="truncate text-xs text-text-2">
            {narrow ? "" : "Área y color según el valor · "}
            {formatInt(realCount)} {realCount === 1 ? "categoría" : "categorías"} con dato
          </span>
        </LegendSlot>
      )}
      {chips}
      {pending ? (
        <div className="min-h-0 flex-1" aria-hidden />
      ) : showList ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={listRef}
            onScroll={onListScroll}
            data-treemap-list=""
            className="min-h-0 flex-1 overflow-y-auto"
            style={listOverflow.bottom ? { maskImage: LIST_FADE, WebkitMaskImage: LIST_FADE } : undefined}
          >
            <div className={byContent ? undefined : "h-full"}>
              <RankingList widget={listWidget} result={result} height={height} span={span} expanded={expanded} />
            </div>
          </div>
          {/* Filas ocultas bajo el borde: pie flotante sobre el desvanecido (el scroll interno no queda mudo) */}
          {listOverflow.below > 0 && (
            <button
              type="button"
              onClick={() => listEl?.scrollBy({ top: Math.max(48, listEl.clientHeight - 64), behavior: reduced ? "auto" : "smooth" })}
              className="absolute bottom-1 left-1/2 z-[2] inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-text-2 shadow-sm transition hover:bg-surface-3"
            >
              +{formatInt(listOverflow.below)} más · desplaza
              <ChevronDown className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      ) : (
        <div ref={canvasBoxRef} className="relative min-h-0 flex-1" data-selected={sel.active ? "1" : undefined}>
          <Chart
            ref={chartRef}
            type="treemap"
            data={data}
            options={options}
            plugins={PLUGINS}
            role="img"
            aria-label={`${widget.title}: ${tiles
              .slice(0, 5)
              .map((t) => `${t.full} ${formatValue(t.value, format)}`)
              .join(", ")}`}
          />
          <ul className="sr-only">
            {tiles.map((t) => (
              <li key={t.key}>
                {t.raw !== null && !noCross ? (
                  <button type="button" aria-pressed={sel.has(t.raw)} onClick={() => t.raw && toggleValue(dimension, t.raw)}>
                    {t.full}: {formatValue(t.value, format)} ({formatPct(total ? t.value / total : 0)})
                  </button>
                ) : (
                  <span>
                    {t.full}: {formatValue(t.value, format)}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <ChartTooltip state={state} />
        </div>
      )}
    </div>
  );
}
