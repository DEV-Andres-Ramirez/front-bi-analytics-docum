"use client";

import { Chart as ChartJS, type ActiveDataPoint, type Chart, type ChartType, type Plugin } from "chart.js";
import { useCallback, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";

/**
 * Piezas comunes de las visualizaciones Chart.js v2 (AreaTimeseries, ColumnBars,
 * MonthlyBarsDelta, Histogram). Los plugins leen su configuración de
 * `options.plugins[id]` (se actualiza con las opciones; nunca de closures viejos).
 */

// ─── Tipografía ──────────────────────────────────────────────────────────────
export function canvasFont(size: number, weight: number | string = 600): string {
  const family = ChartJS.defaults.font.family ?? "Montserrat, ui-sans-serif, system-ui, sans-serif";
  return `${weight} ${size}px ${family}`;
}

/** Paso en px entre dos categorías consecutivas del eje x. */
function xStep(chart: Chart): number {
  const x = chart.scales.x;
  const n = chart.data.labels?.length ?? 0;
  if (!x || n < 2) return chart.chartArea ? chart.chartArea.right - chart.chartArea.left : 0;
  return Math.abs(x.getPixelForValue(1) - x.getPixelForValue(0));
}

// ─── Escala Y "justa" ────────────────────────────────────────────────────────
/** Mantisas de paso permitidas (× 10^k): más finas que el 1-2-5 de Chart.js para no desperdiciar alto. */
const NICE_MANTISSAS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

/**
 * Máximo y paso del eje Y para `dataMax` con como mucho `ticks` intervalos y ~5 % de aire.
 * Reemplaza grace + maxTicksLimit (el niceNum de Chart.js salta a pasos 50/100 y deja vacío el
 * 30–40 % del alto: 57 → 100, 105 → 150). Ejemplos: 57 → 0–60 (paso 15) · 105 → 0–120 (paso 30).
 * `quantum`: el paso debe ser múltiplo de este valor (1 en conteos, 0,01 en proporciones) para
 * que las etiquetas del eje nunca redondeen a cifras repetidas.
 */
export function niceScale(dataMax: number, ticks = 4, quantum = 0): { max: number; stepSize: number } {
  const target = Math.max(0, dataMax) * 1.05;
  const minStep = quantum > 0 ? quantum : 0;
  if (!(target > 0)) {
    const step = minStep || 0.25;
    return { max: step * ticks, stepSize: step };
  }
  const isMultiple = (s: number) => !quantum || Math.abs(s / quantum - Math.round(s / quantum)) < 1e-6;
  const niceAtLeast = (raw: number) => {
    let exp = Math.floor(Math.log10(raw));
    for (let guard = 0; guard < 4; guard++, exp++) {
      const pow = 10 ** exp;
      for (const m of NICE_MANTISSAS) {
        const s = m * pow;
        if (s >= raw - 1e-9 && s >= minStep && isMultiple(s)) return s;
      }
    }
    return raw;
  };
  let best: { max: number; stepSize: number } | null = null;
  for (let count = Math.max(2, ticks); count >= Math.max(2, ticks - 1); count--) {
    const stepSize = niceAtLeast(target / count);
    const max = Math.ceil(target / stepSize - 1e-9) * stepSize;
    if (!best || max < best.max - 1e-9 || (Math.abs(max - best.max) < 1e-9 && stepSize < best.stepSize)) best = { max, stepSize };
  }
  return best as { max: number; stepSize: number };
}

/** Múltiplo mínimo del paso del eje según el formato (el eje se rotula con enteros o % enteros). */
export function axisQuantum(format: string): number {
  if (format === "pct") return 0.01;
  if (format === "decimal") return 0;
  return 1;
}

// ─── Color ───────────────────────────────────────────────────────────────────
function parseColor(c: string): [number, number, number] | null {
  const s = c.trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (x) => x + x) : hex[1];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

/**
 * Color OPACO equivalente a `fg` con opacidad `a` sobre `bg` (hex). Las bandas se pintan opacas para
 * que el halo de las cifras que caen sobre ellas pueda usar exactamente el mismo tono.
 */
export function blend(fg: string, bg: string, a: number): string {
  const f = parseColor(fg);
  const b = parseColor(bg);
  if (!f || !b) return fg;
  const mix = f.map((v, i) => Math.round(v * a + b[i] * (1 - a)));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ─── Bandas de fondo (fines de semana, selección) ────────────────────────────
export interface BandSpec {
  /** Índices de categoría (inclusive). */
  from: number;
  to: number;
  /** Color opaco (también es el halo de las cifras que caen dentro de la banda). */
  color: string;
  /**
   * Franja de `strip` px bajo la línea base (fuera del área de trazado) en lugar de una banda a
   * alto completo. Se usa con columnas: una banda alta se leería como otra columna.
   */
  strip?: number;
}

interface BandsOpts {
  bands?: BandSpec[];
}

/** Límites en px [izquierda, derecha] de una banda. */
function bandBounds(chart: Chart, b: BandSpec): [number, number] | null {
  const x = chart.scales.x;
  if (!x) return null;
  const step = xStep(chart);
  return [x.getPixelForValue(b.from) - step / 2, x.getPixelForValue(b.to) + step / 2];
}

/** Bandas verticales detrás de la grilla y de las marcas (fin de semana, categoría seleccionada). */
export const bandsPlugin: Plugin = {
  id: "docBands",
  beforeDraw(chart, _args, opts) {
    const bands = (opts as BandsOpts).bands;
    const area = chart.chartArea;
    if (!bands?.length || !area || !chart.scales.x) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    // Las franjas van bajo el eje: el recorte es solo horizontal para ellas
    ctx.rect(area.left, area.top, area.right - area.left, chart.height - area.top);
    ctx.clip();
    for (const b of bands) {
      const lr = bandBounds(chart, b);
      if (!lr) continue;
      ctx.fillStyle = b.color;
      if (b.strip) ctx.fillRect(lr[0] + 1, area.bottom + 2, lr[1] - lr[0] - 2, b.strip);
      else ctx.fillRect(lr[0], area.top, lr[1] - lr[0], area.bottom - area.top);
    }
    ctx.restore();
  },
};

/** Color de la banda a alto completo que contiene la coordenada x (para el halo de las cifras). */
function bandAt(chart: Chart, px: number): string | null {
  const bands = ((chart.options.plugins as Record<string, unknown> | undefined)?.docBands as BandsOpts | undefined)?.bands;
  if (!bands?.length) return null;
  let hit: string | null = null;
  for (const b of bands) {
    if (b.strip) continue;
    const lr = bandBounds(chart, b);
    if (lr && px >= lr[0] && px <= lr[1]) hit = b.color;
  }
  return hit;
}

// ─── Barras parciales (contorno punteado) ────────────────────────────────────
export interface PartialBar {
  datasetIndex: number;
  index: number;
  color: string;
}

/**
 * "Punteado = parcial" también en columnas: contorno punteado de 1,5 px en el color pleno sobre la
 * columna del tramo en curso (relleno tenue). Chart.js no punteá bordes de barra, por eso el plugin.
 */
export const partialBarsPlugin: Plugin = {
  id: "docPartial",
  afterDatasetsDraw(chart, _args, raw) {
    const items = (raw as { items?: PartialBar[] }).items;
    if (!items?.length) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 2]);
    for (const it of items) {
      if (!chart.isDatasetVisible(it.datasetIndex)) continue;
      const el = chart.getDatasetMeta(it.datasetIndex).data[it.index] as unknown as { x: number; y: number; base: number; width: number } | undefined;
      if (!el || ![el.x, el.y, el.base, el.width].every(Number.isFinite)) continue;
      const h = el.base - el.y;
      if (h < 1) continue;
      const l = el.x - el.width / 2 + 0.75;
      const r = el.x + el.width / 2 - 0.75;
      const t = el.y + 0.75;
      const rad = Math.min(3.25, (r - l) / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(l, el.base);
      ctx.lineTo(l, t + rad);
      ctx.arcTo(l, t, l + rad, t, rad);
      ctx.lineTo(r - rad, t);
      ctx.arcTo(r, t, r, t + rad, rad);
      ctx.lineTo(r, el.base);
      ctx.strokeStyle = it.color;
      ctx.stroke();
    }
    ctx.restore();
  },
};

// ─── Marcadores del periodo anterior (columnas) ─────────────────────────────
export interface MarkerOpts {
  /** Dataset de barras INVISIBLES (sin relleno ni borde) cuyo tope se marca con una raya; −1 lo apaga. */
  datasetIndex?: number;
  color?: string;
  /** Color de la raya en la categoría activa (hover o foco de teclado). */
  activeColor?: string;
  /** Grosor de la raya (px). */
  lineWidth?: number;
}

/**
 * Periodo anterior en columnas: raya horizontal de 2 px en el tope de cada barra del dataset (que queda
 * invisible y solo aporta geometría, tooltip y hover). Se dibuja aquí y no con el borde superior de la
 * barra: Chart.js pinta ese borde con un recorte y un relleno evenodd, y el antialias dejaba un contorno
 * tenue en los otros tres lados (una "caja" fantasma alrededor de la columna). Un valor 0 no se marca
 * (la raya se confundiría con el eje); queda en el tooltip.
 */
export const markersPlugin: Plugin = {
  id: "docMarkers",
  afterDatasetsDraw(chart, _args, raw) {
    const o = raw as MarkerOpts;
    const di = o.datasetIndex;
    if (di === undefined || di < 0 || di >= chart.data.datasets.length || !chart.isDatasetVisible(di)) return;
    const active = new Set(chart.getActiveElements().filter((a) => a.datasetIndex === di).map((a) => a.index));
    const lw = o.lineWidth ?? 2;
    const ctx = chart.ctx;
    ctx.save();
    chart.getDatasetMeta(di).data.forEach((item, i) => {
      const el = item as unknown as { x: number; y: number; base: number; width: number };
      if (![el.x, el.y, el.base, el.width].every(Number.isFinite) || el.base - el.y < 0.5) return;
      ctx.fillStyle = active.has(i) ? (o.activeColor ?? o.color ?? "#222") : (o.color ?? "#888");
      ctx.fillRect(el.x - el.width / 2, el.y, el.width, Math.min(lw, el.base - el.y));
    });
    ctx.restore();
  },
};

// ─── Crosshair ───────────────────────────────────────────────────────────────
/** Línea vertical en la categoría activa (detrás de las marcas). */
export const crosshairPlugin: Plugin = {
  id: "docCrosshair",
  beforeDatasetsDraw(chart, _args, opts) {
    const color = (opts as { color?: string }).color;
    const active = chart.getActiveElements();
    const area = chart.chartArea;
    if (!color || !active.length || !area) return;
    const x = active[0].element.x;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, area.top);
    ctx.lineTo(Math.round(x) + 0.5, area.bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  },
};

// ─── Etiquetas directas (L10) y valores sobre columnas ───────────────────────
export interface CanvasLabel {
  datasetIndex: number;
  index: number;
  /** Cifra (12/700 en tinta). */
  text: string;
  /** Texto secundario ("parcial"), en muted. */
  sub?: string;
  /** Punto marcador (series). */
  marker?: boolean;
  /** Color del marcador. */
  color?: string;
  /** Mayor prioridad se coloca primero; las que chocan con una ya colocada se omiten. */
  priority?: number;
  /** Otras series (visibles) que la etiqueta debe librar en el mismo índice (p. ej. columna fantasma). */
  clear?: number[];
  /** Peso de la cifra (por defecto 700). Permite destacar el máximo frente al resto (600). */
  weight?: 600 | 700;
}

interface LabelsOpts {
  items?: CanvasLabel[];
  text?: string;
  muted?: string;
  surface?: string;
  /** "point": etiqueta sobre un punto (series) · "bar": sobre la columna. */
  kind?: "point" | "bar";
  /** Separación vertical mínima entre etiquetas que se solapan en x (L10: 16 px). */
  minGap?: number;
}

interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
}

/**
 * Centro x de una cifra de ancho `w` que no toque una línea vertical en `px` (≥ 4 px de aire).
 * Se corre al lado más cercano y, si no cabe sin salirse de su columna, al otro; si tampoco cabe,
 * queda centrada (el halo de superficie la mantiene legible).
 */
function clearOfLine(cx: number, w: number, px: number, barX: number, barW: number): number {
  const half = w / 2 + 4;
  if (Math.abs(px - cx) >= half) return cx;
  const sides = px >= cx ? [px - half, px + half] : [px + half, px - half];
  return sides.find((c) => Math.abs(c - barX) <= barW / 2) ?? cx;
}

/** Punto (x, y) de la marca de una etiqueta; null si su serie está oculta o el punto no existe. */
function labelPoint(chart: Chart, it: CanvasLabel): { x: number; y: number } | null {
  if (it.datasetIndex >= chart.data.datasets.length || !chart.isDatasetVisible(it.datasetIndex)) return null;
  const el = chart.getDatasetMeta(it.datasetIndex).data[it.index] as unknown as { x: number; y: number } | undefined;
  return el && Number.isFinite(el.x) && Number.isFinite(el.y) ? el : null;
}

const overlaps = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

/** Radio del marcador de una etiqueta de punto (3,5 px + trazo de 2 px) más 2 px de aire. */
const MARKER_CLEAR = 7.5;

/**
 * Etiquetas sin colisión: marcador + cifra (y "parcial") sobre el punto o la columna.
 * En puntos (L10), los marcadores de TODAS las etiquetas son obstáculos: una cifra nunca tapa el
 * marcador de otra serie. Si arriba choca, la cifra pasa debajo de su punto (la serie inferior se
 * rotula hacia abajo); si tampoco cabe, se omite. Dos marcadores a menos de `minGap` en vertical y en
 * la misma x se leen como un solo punto: solo se rotula el de mayor prioridad (la serie principal).
 */
export const labelsPlugin: Plugin = {
  id: "docLabels",
  afterDatasetsDraw(chart, _args, raw) {
    const o = raw as LabelsOpts;
    const items = o.items;
    const area = chart.chartArea;
    if (!items?.length || !area) return;
    const ctx = chart.ctx;
    const kind = o.kind ?? "point";
    const minGap = o.minGap ?? 16;
    const placed: Box[] = [];
    // Referencia vertical del histograma (docRefLine), si la hay: las cifras se apartan de la línea
    const refX = kind === "bar" ? refLineX(chart, ((chart.options.plugins as Record<string, unknown> | undefined)?.docRefLine ?? {}) as RefLineOpts) : null;
    const sorted = [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    // Cajas de los marcadores (puntos): obstáculos para todas las cifras, también las de mayor prioridad
    const markerBoxes = new Map<CanvasLabel, Box>();
    if (kind === "point") {
      for (const it of sorted) {
        const p = it.marker ? labelPoint(chart, it) : null;
        if (p) markerBoxes.set(it, { l: p.x - MARKER_CLEAR, r: p.x + MARKER_CLEAR, t: p.y - MARKER_CLEAR, b: p.y + MARKER_CLEAR });
      }
    }
    const placedMarkers: { x: number; y: number }[] = [];
    ctx.save();
    for (const it of sorted) {
      const el = labelPoint(chart, it);
      if (!el) continue;
      const weight = it.weight ?? 700;
      ctx.font = canvasFont(11, weight);
      const wMain = ctx.measureText(it.text).width;
      ctx.font = canvasFont(10, 600);
      const wSub = it.sub ? ctx.measureText(it.sub).width : 0;

      if (kind === "bar") {
        // Cifra sobre la columna (o sobre la más alta de las que debe librar); "parcial"/"máx" encima
        let topY = el.y;
        for (const di of it.clear ?? []) {
          if (!chart.isDatasetVisible(di)) continue;
          const other = chart.getDatasetMeta(di).data[it.index] as unknown as { y: number } | undefined;
          if (other && Number.isFinite(other.y)) topY = Math.min(topY, other.y);
        }
        const w = Math.max(wMain, wSub);
        const h = it.sub ? 26 : 13;
        let cx = el.x;
        if (refX !== null) cx = clearOfLine(cx, w, refX, el.x, (el as { width?: number }).width ?? 0);
        cx = Math.max(area.left + w / 2, Math.min(chart.width - w / 2 - 1, cx));
        const bottom = topY - 4;
        const box = { l: cx - w / 2 - 2, r: cx + w / 2 + 2, t: bottom - h, b: bottom };
        if (placed.some((p) => p.l < box.r && box.l < p.r && p.t < box.b && box.t < p.b)) continue;
        placed.push(box);
        // Halo del fondo real (superficie o banda de fin de semana): la cifra se lee aunque la cruce una
        // referencia o un marcador, sin "calcomanía" blanca sobre la banda
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.lineJoin = "round";
        ctx.lineWidth = 3;
        ctx.strokeStyle = bandAt(chart, cx) ?? o.surface ?? "#fff";
        ctx.font = canvasFont(11, weight);
        ctx.strokeText(it.text, cx, bottom - 1);
        ctx.fillStyle = o.text ?? "#222";
        ctx.fillText(it.text, cx, bottom - 1);
        if (it.sub) {
          ctx.font = canvasFont(10, 600);
          ctx.strokeText(it.sub, cx, bottom - 14);
          ctx.fillStyle = o.muted ?? "#666";
          ctx.fillText(it.sub, cx, bottom - 14);
        }
        continue;
      }

      // Punto: cifra + sub en una línea, arriba del punto (abajo si no cabe o si arriba choca). La caja
      // nunca pasa del borde derecho del área de trazado: en el último punto queda a la izquierda del
      // marcador.
      // L10: dos marcadores casi en el mismo sitio se leerían como uno; solo se rotula el principal
      if (it.marker && placedMarkers.some((m) => Math.abs(m.x - el.x) < minGap && Math.abs(m.y - el.y) < minGap)) continue;
      const gap = it.sub ? 4 : 0;
      const w = wMain + gap + wSub;
      const h = 13;
      let left = el.x - w / 2;
      left = Math.max(area.left - 4, Math.min(area.right - w, left));
      const above = el.y - 9 - h;
      const below = el.y + 9;
      // Sin sitio arriba (borde superior): abajo, como siempre. Si arriba choca, abajo solo dentro del área
      const candidates = above < area.top - 14 ? [below] : below + h <= area.bottom ? [above, below] : [above];
      const free = (box: Box) =>
        !placed.some((p) => p.l < box.r && box.l < p.r && Math.abs((p.t + p.b) / 2 - (box.t + box.b) / 2) < minGap) &&
        ![...markerBoxes].some(([other, mb]) => other !== it && overlaps(mb, box));
      const top = candidates.find((t) => free({ l: left - 2, r: left + w + 2, t, b: t + h }));
      if (top === undefined) continue;
      placed.push({ l: left - 2, r: left + w + 2, t: top, b: top + h });
      if (it.marker) placedMarkers.push({ x: el.x, y: el.y });
      if (it.marker) {
        ctx.beginPath();
        ctx.arc(el.x, el.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = it.color ?? o.text ?? "#222";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = o.surface ?? "#fff";
        ctx.stroke();
      }
      // halo del fondo (superficie o banda) para legibilidad sobre la serie
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = bandAt(chart, left + w / 2) ?? o.surface ?? "#fff";
      ctx.font = canvasFont(11, weight);
      ctx.strokeText(it.text, left, top + 1);
      ctx.fillStyle = o.text ?? "#222";
      ctx.fillText(it.text, left, top + 1);
      if (it.sub) {
        ctx.font = canvasFont(10, 600);
        ctx.strokeText(it.sub, left + wMain + gap, top + 2);
        ctx.fillStyle = o.muted ?? "#666";
        ctx.fillText(it.sub, left + wMain + gap, top + 2);
      }
    }
    ctx.restore();
  },
};

// ─── Línea de referencia vertical (histograma) ───────────────────────────────
interface RefLineOpts {
  /** Índice de la columna y fracción (0–1) dentro de ella. */
  index?: number;
  fraction?: number;
  label?: string;
  color?: string;
  bg?: string;
}

function refLineX(chart: Chart, o: RefLineOpts): number | null {
  if (o.index === undefined || o.index < 0 || !chart.chartArea || !o.label) return null;
  const el = chart.getDatasetMeta(0).data[o.index] as unknown as { x: number; width: number } | undefined;
  if (!el || !Number.isFinite(el.x)) return null;
  const left = el.x - el.width / 2;
  return Math.round(left + Math.max(0, Math.min(1, o.fraction ?? 0.5)) * el.width) + 0.5;
}

/**
 * Referencia punteada en tinta con su rótulo en la franja superior del área de trazado.
 * La línea se dibuja tras las columnas y ANTES de las cifras (el plugin va antes de labelsPlugin
 * en la lista). labelsPlugin lee esta misma configuración y corre a un lado de la línea la cifra
 * que cruza (dentro de su columna); si no cabe, el halo de superficie evita que la línea la tache.
 * El rótulo se dibuja al final (afterDraw), sobre todo lo demás.
 */
export const refLinePlugin: Plugin = {
  id: "docRefLine",
  afterDatasetsDraw(chart, _args, raw) {
    const o = raw as RefLineOpts;
    const area = chart.chartArea;
    const px = refLineX(chart, o);
    if (px === null || !area) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = o.color ?? "#222";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(px, area.top - 2);
    ctx.lineTo(px, area.bottom);
    ctx.stroke();
    ctx.restore();
  },
  afterDraw(chart, _args, raw) {
    const o = raw as RefLineOpts;
    const area = chart.chartArea;
    const px = refLineX(chart, o);
    if (px === null || !area || !o.label) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.font = canvasFont(11, 700);
    const w = ctx.measureText(o.label).width;
    let lx = px - w / 2;
    lx = Math.max(area.left, Math.min(chart.width - w - 2, lx));
    const ty = area.top - 20;
    ctx.fillStyle = o.bg ?? "#fff";
    ctx.fillRect(lx - 4, ty - 1, w + 8, 16);
    ctx.fillStyle = o.color ?? "#222";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(o.label, lx, ty + 1);
    ctx.restore();
  },
};

// ─── Redimensionado garantizado ──────────────────────────────────────────────
/** Lo mínimo de un Chart.js que necesita la guarda (evita genéricos por tipo de gráfica). */
interface ResizableChart {
  readonly canvas: HTMLCanvasElement | null;
  width: number;
  height: number;
  resize(width?: number, height?: number): void;
  draw(): void;
}
type ChartRefLike = RefObject<ResizableChart | null | undefined>;
/** Gráfica montada en alguna de las refs (AreaTimeseries alterna Line y Bar en el mismo contenedor). */
function mountedChart(a: ChartRefLike, b: ChartRefLike | undefined): ResizableChart | null {
  return a.current ?? b?.current ?? null;
}

/**
 * Guarda de tamaño del lienzo. Se pone como `ref` del contenedor del canvas (su padre directo).
 *
 * Chart.js aplaza `resize()` mientras hay una animación en curso (`_resizeBeforeDraw`) y lo aplica en el
 * siguiente dibujo; si la animación termina sin dibujar de nuevo, el tamaño nuevo nunca se aplica y un
 * `resize()` inmediato posterior tampoco limpia un tamaño viejo aplazado. Pasa cuando el layout cambia
 * durante el montaje (p. ej. el sidebar pasa a riel y la rejilla de 6 a 12 columnas): el canvas se
 * queda con el ancho viejo e invade la tarjeta vecina. Tras cada cambio de tamaño del contenedor
 * (dos cuadros después, cuando el manejador propio de Chart.js ya corrió) se verifica el tamaño real
 * y, si no coincide o quedó un tamaño viejo pendiente, se fuerza: dibujar (consume el pendiente),
 * redimensionar al contenedor y volver a dibujar. Sin setState: compatible con el React Compiler.
 */
export function useChartResizeGuard(primary: ChartRefLike, secondary?: ChartRefLike) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      let raf = 0;
      let timer = 0;
      const sync = () => {
        raf = 0;
        const chart = mountedChart(primary, secondary);
        if (!chart?.canvas || chart.canvas.parentElement !== el) return;
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (!w || !h) return;
        const pending = (chart as ResizableChart & { _resizeBeforeDraw?: { width?: number; height?: number } | null })._resizeBeforeDraw;
        const off = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) > 1;
        const stale = Boolean(pending && (off(pending.width, w) || off(pending.height, h)));
        if (!stale && !off(chart.width, w) && !off(chart.height, h)) return;
        if (pending) chart.draw();
        chart.resize();
        chart.draw();
      };
      const schedule = () => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          raf = requestAnimationFrame(sync);
        });
        // Segunda verificación al final de la animación de entrada (≤ 500 ms)
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (!raf) raf = requestAnimationFrame(sync);
        }, 520);
      };
      const ro = new ResizeObserver(schedule);
      ro.observe(el);
      return () => {
        ro.disconnect();
        if (raf) cancelAnimationFrame(raf);
        window.clearTimeout(timer);
      };
    },
    [primary, secondary],
  );
}

// ─── Movimiento ──────────────────────────────────────────────────────────────
const ANIMATION = { duration: 450, easing: "easeOutQuart" as const };
/**
 * Animación ≤ 500 ms (crecimiento en y); sin animación con prefers-reduced-motion.
 * x y width no se animan: un cambio de ancho (resize, contenedor) nunca "desliza" las marcas.
 * Devuelve objetos estables para no disparar chart.update() en cada render.
 */
const STATIC_XY = { x: { duration: 0 }, width: { duration: 0 } } as const;
const MOTION = { animation: ANIMATION, animations: STATIC_XY } as const;
const NO_MOTION = { animation: false, animations: STATIC_XY } as const;
export function useChartAnimation() {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  return reduce ? NO_MOTION : MOTION;
}

// ─── Exportación ─────────────────────────────────────────────────────────────
/** PNG del canvas con el fondo de la superficie (el canvas es transparente). */
export function chartToPng(chart: Chart | null | undefined, bg: string): string | null {
  if (!chart) return null;
  const src = chart.canvas;
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return chart.toBase64Image("image/png", 1);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);
  return out.toDataURL("image/png");
}

// ─── Teclado (L11: el foco muestra lo mismo que el hover) ────────────────────
/**
 * Flechas ←/→ recorren las categorías (muestra el tooltip), Inicio/Fin saltan a los
 * extremos, Enter/Espacio activan (filtro cruzado) y Escape limpia.
 * Devuelve el texto para una región aria-live.
 */
export function useChartKeyboard<T extends ChartType>(
  chartRef: RefObject<Chart<T> | null | undefined>,
  count: number,
  describe: (i: number) => string,
  onActivate?: (i: number) => void,
) {
  const idx = useRef(-1);
  const [announce, setAnnounce] = useState("");

  const apply = useCallback(
    (i: number) => {
      const chart = chartRef.current;
      if (!chart) return;
      if (i < 0) {
        chart.setActiveElements([]);
        chart.tooltip?.setActiveElements([], { x: 0, y: 0 });
        chart.update("none");
        return;
      }
      const els: ActiveDataPoint[] = [];
      chart.data.datasets.forEach((_d, datasetIndex) => {
        // Sin puntos nulos (tramo parcial separado de la línea): su y es NaN y descolocaría el tooltip
        const el = chart.getDatasetMeta(datasetIndex).data[i] as unknown as { x: number; y: number; skip?: boolean } | undefined;
        if (chart.isDatasetVisible(datasetIndex) && el && !el.skip && Number.isFinite(el.x) && Number.isFinite(el.y)) els.push({ datasetIndex, index: i });
      });
      chart.setActiveElements(els);
      const first = els[0] ? (chart.getDatasetMeta(els[0].datasetIndex).data[i] as unknown as { x: number; y: number }) : null;
      chart.tooltip?.setActiveElements(els, { x: first?.x ?? 0, y: first?.y ?? 0 });
      chart.update("none");
    },
    [chartRef],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (!count) return;
      let i = idx.current;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          i = i < 0 ? 0 : Math.min(count - 1, i + 1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          i = i < 0 ? count - 1 : Math.max(0, i - 1);
          break;
        case "Home":
          i = 0;
          break;
        case "End":
          i = count - 1;
          break;
        case "Enter":
        case " ":
          if (i >= 0 && onActivate) {
            e.preventDefault();
            onActivate(i);
          }
          return;
        case "Escape":
          idx.current = -1;
          apply(-1);
          setAnnounce("");
          return;
        default:
          return;
      }
      e.preventDefault();
      idx.current = i;
      apply(i);
      setAnnounce(describe(i));
    },
    [count, apply, describe, onActivate],
  );

  const onBlur = useCallback(() => {
    if (idx.current < 0) return;
    idx.current = -1;
    apply(-1);
  }, [apply]);

  return { onKeyDown, onBlur, announce };
}

/** Texto de cifra corta (1 decimal como máximo) sin unidad. */
const nfShort = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
export function shortNumber(n: number): string {
  return nfShort.format(n);
}
