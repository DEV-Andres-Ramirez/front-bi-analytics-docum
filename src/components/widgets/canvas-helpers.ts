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

// ─── Bandas de fondo (fines de semana, selección) ────────────────────────────
export interface BandSpec {
  /** Índices de categoría (inclusive). */
  from: number;
  to: number;
  color: string;
}

/** Bandas verticales detrás de la grilla y de las marcas (fin de semana, categoría seleccionada). */
export const bandsPlugin: Plugin = {
  id: "docBands",
  beforeDraw(chart, _args, opts) {
    const bands = (opts as { bands?: BandSpec[] }).bands;
    const area = chart.chartArea;
    const x = chart.scales.x;
    if (!bands?.length || !area || !x) return;
    const step = xStep(chart);
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
    ctx.clip();
    for (const b of bands) {
      const left = x.getPixelForValue(b.from) - step / 2;
      const right = x.getPixelForValue(b.to) + step / 2;
      ctx.fillStyle = b.color;
      ctx.fillRect(left, area.top, right - left, area.bottom - area.top);
    }
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

/** Etiquetas sin colisión: marcador + cifra (y "parcial") sobre el punto o la columna. */
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
    const sorted = [...items].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    ctx.save();
    for (const it of sorted) {
      if (!chart.isDatasetVisible(it.datasetIndex)) continue;
      const el = chart.getDatasetMeta(it.datasetIndex).data[it.index] as unknown as { x: number; y: number } | undefined;
      if (!el || !Number.isFinite(el.x) || !Number.isFinite(el.y)) continue;
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
        cx = Math.max(area.left + w / 2, Math.min(chart.width - w / 2 - 1, cx));
        const bottom = topY - 4;
        const box = { l: cx - w / 2 - 2, r: cx + w / 2 + 2, t: bottom - h, b: bottom };
        if (placed.some((p) => p.l < box.r && box.l < p.r && p.t < box.b && box.t < p.b)) continue;
        placed.push(box);
        // Halo de superficie: la cifra se lee aunque la cruce una referencia o una columna fantasma
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.lineJoin = "round";
        ctx.lineWidth = 3;
        ctx.strokeStyle = o.surface ?? "#fff";
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

      // Punto: cifra + sub en una línea, arriba del punto (abajo si no cabe). La caja nunca pasa
      // del borde derecho del área de trazado: en el último punto queda a la izquierda del marcador.
      const gap = it.sub ? 4 : 0;
      const w = wMain + gap + wSub;
      const h = 13;
      let top = el.y - 9 - h;
      if (top < area.top - 14) top = el.y + 9;
      let left = el.x - w / 2;
      left = Math.max(area.left - 4, Math.min(area.right - w, left));
      const box = { l: left - 2, r: left + w + 2, t: top, b: top + h };
      const clash = placed.some((p) => p.l < box.r && box.l < p.r && Math.abs((p.t + p.b) / 2 - (box.t + box.b) / 2) < minGap);
      if (clash) continue;
      placed.push(box);
      if (it.marker) {
        ctx.beginPath();
        ctx.arc(el.x, el.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = it.color ?? o.text ?? "#222";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = o.surface ?? "#fff";
        ctx.stroke();
      }
      // halo de superficie para legibilidad sobre la serie
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = o.surface ?? "#fff";
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
 * en la lista): las cifras, con halo de superficie, quedan encima y la línea nunca las tacha.
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
        if (chart.isDatasetVisible(datasetIndex) && chart.getDatasetMeta(datasetIndex).data[i]) els.push({ datasetIndex, index: i });
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
