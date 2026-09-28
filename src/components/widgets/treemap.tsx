"use client";

import { Chart as ChartJS, type ActiveElement, type ChartData, type ChartEvent, type ChartOptions, type Plugin, type TooltipModel } from "chart.js";
import { TreemapController, TreemapElement, type TreemapDataPoint } from "chartjs-chart-treemap";
import { useCallback, useMemo, useRef, useState } from "react";
import { Chart } from "react-chartjs-2";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { Segmented } from "@/components/ui/primitives";
import type { CategoryResult } from "@/dashboards/dto";
import type { BarWidget, DonutWidget, ValueFormat } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { useMediaQuery } from "@/hooks/use-media-query";
import { registerCharts } from "@/lib/charts/register";
import { isNeutral } from "@/lib/charts/semantic";
import { inkOn, seqColor, useChartTheme } from "@/lib/charts/theme";
import { formatInt, formatPct, formatValue } from "@/lib/format";
import { displayLabel } from "@/lib/labels";
import { useExporter } from "./frame-context";
import { ChartTooltip, chartJsExternal, useChartTooltip, type TooltipContent } from "./kit/chart-tooltip";
import { HeaderSlot, LegendSlot } from "./kit/legend-slot";
import { CountChip, QUALITY_CHIP_MIN, QUALITY_NOTICE_MIN, QualityChip } from "./kit/quality";
import { mixHex, RESIZE_RECOVERY, selectionOf } from "./matrix-kit";
import { RankingList } from "./ranking-list";
import { useScrollEdges } from "./table-scroll";
import type { VizProps } from "./types";

registerCharts();
ChartJS.register(TreemapController, TreemapElement);

/**
 * Treemap (docs/ui-design-system.md › Treemap): partes de un todo con muchas categorías cortas.
 * - Un solo tono secuencial por valor; los neutrales NO entran al árbol (chip en la franja: chip de
 *   calidad entre el 15 y el 85 %, conteo gris por debajo).
 * - Máximo 12 tiles + "Otras (N)": se pliega además toda categoría con menos del 2 % del árbol o cuyo
 *   tile estimado no alcanza para una etiqueta, así que todo tile visible lleva al menos su valor.
 * - Etiqueta dentro (inkOn): nombre en hasta 4 líneas + valor si el tile mide ≥ 80×36; solo el valor
 *   (y el nombre si hay alto) desde 44 px de ancho.
 * - Hueco de 2 px; ChartTooltip con nombre completo, valor y %; clic filtra.
 * - vizOptions.listToggle: Segmented "Mapa de árbol | Lista" (RankingList con el mismo resultado).
 *   En angosto (< 480 px) abre en Lista mientras el usuario no elija.
 */

const MAX_TILES = 12;
/** Participación mínima en el árbol para tener tile propio. */
const MIN_SHARE = 0.02;
/** Etiqueta completa (nombre + valor). */
const FULL_W = 80;
/** Solo el valor (tiles angostos). */
const MIN_W = 44;
const MIN_H = 36;
const PAD = 7;
/** Holgura por la proporción de los tiles del squarify al estimar su área. */
const AREA_SLACK = 1.6;
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

/**
 * Tiles del árbol. `area` (px², 0 si no se ha medido) estima el tamaño de cada tile para plegar a
 * "Otras N" los que no alcanzarían una etiqueta completa.
 */
function buildTiles(result: CategoryResult, kind: BarWidget["labelKind"], area: number) {
  const neutrals: { label: string; value: number }[] = [];
  const real: Tile[] = [];
  let engineOthers = 0;
  result.labels.forEach((label, i) => {
    const value = result.values[i] ?? 0;
    if (value <= 0) return;
    const n = label.trim().toLowerCase();
    // "Otros" del motor (categorías plegadas) se suma a "Otras N"; el resto de neutrales va al chip
    if (result.folded && (n === "otros" || n === "otras")) {
      engineOthers += value;
      return;
    }
    if (isNeutral(label)) {
      neutrals.push({ label: displayLabel(label).short, value });
      return;
    }
    const d = displayLabel(label, kind);
    real.push({ key: label, raw: label, label: d.short, full: d.full, value });
  });
  real.sort((a, b) => b.value - a.value);
  const treeTotal = real.reduce((s, t) => s + t.value, 0) + engineOthers;
  const minShare = Math.max(MIN_SHARE, area > 0 ? (FULL_W * MIN_H * AREA_SLACK) / area : 0);
  let cut = 0;
  while (cut < real.length && cut < MAX_TILES && (!treeTotal || real[cut].value / treeTotal >= minShare)) cut++;
  // Un "Otras 1" no aporta: si queda una sola categoría pequeña (y cabe), va con su nombre
  if (real.length - cut === 1 && !engineOthers && cut < MAX_TILES) cut++;
  const tiles = real.slice(0, cut);
  const rest = real.slice(cut);
  const restCount = rest.length + (result.folded ?? 0);
  const restValue = rest.reduce((s, t) => s + t.value, 0) + engineOthers;
  if (restValue > 0) {
    // "Otras (4)": el conteo entre paréntesis no se confunde con el valor del tile ("Otras (4)  16")
    const label = `Otras (${formatInt(restCount || 1)})`;
    tiles.push({ key: "__otras", raw: null, label, full: `Otras ${restCount} categorías`, value: restValue, members: rest.map((t) => ({ label: t.full, value: t.value })) });
  }
  return { tiles, neutrals, max: real[0]?.value ?? 0, realCount: real.length };
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

/**
 * Parte un texto en hasta `maxLines` líneas por palabras. Una palabra más ancha que la línea se
 * corta con guion; si el texto no cabe, la elipsis va solo en la última línea.
 */
function wrapN(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  if (maxLines <= 0 || maxW <= 0) return [];
  if (ctx.measureText(text).width <= maxW) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  let i = 0;
  while (i < words.length && lines.length < maxLines - 1) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(next).width <= maxW) {
      line = next;
      i++;
      continue;
    }
    if (line) {
      lines.push(line);
      line = "";
      continue;
    }
    // Palabra sola más ancha que la línea: corte preferido tras "/" o "-" (sin guion extra);
    // si no, se corta con guion (mínimo 3 letras por lado)
    const w = words[i];
    let at = -1;
    for (let j = w.length - 1; j >= 3 && at < 0; j--) if ((w[j - 1] === "/" || w[j - 1] === "-") && ctx.measureText(w.slice(0, j)).width <= maxW) at = j;
    if (at > 0) {
      lines.push(w.slice(0, at));
      words[i] = w.slice(at);
      continue;
    }
    // (sin dejar menos de 3 letras antes de una "/": "Heredadas/…" → "Here-" y no "Heredad-" + "as/")
    const bad = (k: number) => {
      const slash = w.indexOf("/", k);
      return ctx.measureText(`${w.slice(0, k)}-`).width > maxW || (slash >= 0 && slash - k < 3) || w[k - 1] === "/";
    };
    let k = w.length - 3;
    while (k >= 3 && bad(k)) k--;
    if (k < 3) break;
    lines.push(`${w.slice(0, k)}-`);
    words[i] = w.slice(k);
  }
  const rest = [line, ...words.slice(i)].filter(Boolean).join(" ");
  if (rest) {
    const last = fitText(ctx, rest, maxW);
    if (last) lines.push(last);
  }
  return lines;
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
}

/**
 * Etiqueta del tile (cada línea con su fuente):
 * - ≥ 80 px de ancho: una línea "Nombre  valor" hasta 48 px de alto; desde 48 px, nombre en tantas
 *   líneas como quepan (máx. 4) + valor.
 * - 44–80 px: el valor solo y, si hay alto y al menos 40 px de línea, el nombre encima (máx. 3 líneas).
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
    const fits = c.measureText(val).width <= maxW;
    c.font = fontString(FONT_NAME);
    const name = maxW >= 40 && h >= 72 ? wrapN(c, t.label, maxW, Math.min(3, room)) : [];
    out = fits ? { lines: [...name, val], fonts: [...name.map(() => FONT_NAME), FONT_VALUE] } : null;
  } else if (h < 48) {
    c.font = fontString(FONT_NAME);
    const vw = c.measureText(val).width;
    const name = fitText(c, t.label, maxW - vw - 8);
    out = { lines: [name ? `${name}  ${val}` : val], fonts: [FONT_NAME] };
  } else {
    c.font = fontString(FONT_NAME);
    const name = wrapN(c, t.label, maxW, Math.max(1, Math.min(4, room)));
    out = { lines: [...name, val], fonts: [...name.map(() => FONT_NAME), FONT_VALUE] };
  }
  c.restore();
  return out;
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
  // Lista dentro de un cuerpo de alto fijo (móvil: 300 px del canvas): desvanecido si queda contenido abajo
  const { ref: listScrollRef, onScroll: onListScroll, edges: listEdges } = useScrollEdges<HTMLDivElement>();
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

  // Área del árbol (px²) redondeada a bloques de 40 px para no recalcular en cada píxel de resize
  const area = measured ? Math.round(boxW / 40) * 40 * Math.max(0, Math.round((boxH - 28) / 40) * 40) : 0;
  const { tiles, neutrals, max, realCount } = useMemo(() => buildTiles(result, widget.labelKind, area), [result, widget.labelKind, area]);
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
          spacing: 1,
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
        <div
          ref={listRef}
          onScroll={onListScroll}
          data-treemap-list=""
          className="min-h-0 flex-1 overflow-y-auto"
          style={listEdges.bottom ? { maskImage: LIST_FADE, WebkitMaskImage: LIST_FADE } : undefined}
        >
          <div className={byContent ? undefined : "h-full"}>
            <RankingList widget={listWidget} result={result} height={height} span={span} expanded={expanded} />
          </div>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1" data-selected={sel.active ? "1" : undefined}>
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
