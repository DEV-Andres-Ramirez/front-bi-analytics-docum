"use client";

import type { ActiveElement, Chart as ChartJS, ChartData, ChartEvent, ChartOptions, Plugin, ScriptableContext, TooltipModel } from "chart.js";
import type { SankeyDataPoint } from "chartjs-chart-sankey";
import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { Chart } from "react-chartjs-2";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import type { SankeyResult } from "@/dashboards/dto";
import type { SankeyWidget, SemanticFamily, StatusTone } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import { registerCharts } from "@/lib/charts/register";
import { isNeutral, resolveStatus } from "@/lib/charts/semantic";
import { alpha, useChartTheme, type ChartTheme } from "@/lib/charts/theme";
import { formatInt, formatPct } from "@/lib/format";
import { displayLabel } from "@/lib/labels";
import { useExporter } from "./frame-context";
import { ChartTooltip, chartJsExternal, useChartTooltip, type TooltipContent } from "./kit/chart-tooltip";
import { StatusIcon } from "./kit/status-icon";
import { anchorOf, RESIZE_RECOVERY, selectionOf, useToggleMany } from "./matrix-kit";
import type { VizProps } from "./types";

registerCharts();

/**
 * Sankey v2 (docs/ui-design-system.md › DrilldownBars v2 + Sankey v2):
 * - Orígenes por debajo del 3 % (o cuyo nodo mediría < 14 px) plegados en "Otras tipologías (N)"
 *   (detalle en el tooltip): así no se amontonan rótulos de nodos diminutos en el borde inferior.
 * - nodePadding = clamp(10, 28 − n, 18), nodeWidth 10.
 * - Etiquetas externas en HTML (tinta, con el valor): orígenes a la izquierda, destinos a la derecha.
 *   El valor va pegado a la última palabra del nombre (nunca queda solo en una línea).
 * - Destino con la familia semántica (momento); enlaces al 35 % (70 % en hover).
 */

const NODE_W = 10;
/** Participación mínima de un origen para tener nodo propio. */
const FOLD_SHARE = 0.03;
/** Alto mínimo de nodo (px) para no plegarlo; el umbral en % sube hasta FOLD_MAX si el lienzo es bajo. */
const MIN_NODE_PX = 14;
const FOLD_MAX = 0.06;
const FOLD_KEY = "__otras";
const LINE_H = 16;
/** Separación mínima entre rótulos vecinos (px). */
const LABEL_GAP = 4;

interface Member {
  label: string;
  value: number;
  byTo: Map<string, number>;
}

interface SNode {
  /** Clave del nodo en Chart.js (prefijada por lado para evitar colisiones). */
  id: string;
  side: "from" | "to";
  /** Valor de filtro; null en el nodo plegado. */
  raw: string | null;
  label: string;
  full: string;
  total: number;
  color: string;
  tone: StatusTone | null;
  neutral: boolean;
  members?: Member[];
  /** Desglose del nodo hacia el otro lado (clave cruda → valor). */
  links: Map<string, number>;
}

interface Model {
  from: SNode[];
  to: SNode[];
  byId: Map<string, SNode>;
  flows: SankeyDataPoint[];
  total: number;
  padding: number;
  priority: Record<string, number>;
  /** Umbral de plegado aplicado (0..1). */
  foldShare: number;
}

const paddingFor = (n: number) => Math.max(10, Math.min(28 - n, 18));

/** Plural simple es-CO en minúscula ("Tipología" → "tipologías", "Oficina" → "oficinas", "Canal" → "canales"). */
function plural(label: string): string {
  const l = label.trim().toLocaleLowerCase("es-CO");
  if (!l) return "categorías";
  return /[aeiouáéíóú]$/.test(l) ? `${l}s` : `${l}es`;
}

const fId = (k: string) => `f:${k}`;
const tId = (k: string) => `t:${k}`;

function buildModel(result: SankeyResult, family: SemanticFamily | undefined, theme: ChartTheme, kind: SankeyWidget["labelKind"], fromPlural: string, height: number): Model {
  const total = result.flows.reduce((s, f) => s + f.value, 0);
  const fromTotals = new Map<string, number>();
  const toTotals = new Map<string, number>();
  for (const f of result.flows) {
    fromTotals.set(f.from, (fromTotals.get(f.from) ?? 0) + f.value);
    toTotals.set(f.to, (toTotals.get(f.to) ?? 0) + f.value);
  }
  // Umbral: 3 % o lo que mida un nodo de 14 px con el alto útil del lienzo (tope 6 %)
  const kept = [...fromTotals.values()].filter((v) => total && v / total >= FOLD_SHARE).length + 1;
  const usable = height > 0 ? height - 8 - paddingFor(kept) * (kept - 1) : 0;
  const foldShare = usable > 0 ? Math.max(FOLD_SHARE, Math.min(FOLD_MAX, MIN_NODE_PX / usable)) : FOLD_SHARE;
  // Plegado: solo si hay 2 o más orígenes pequeños (un "Otras (1)" no aporta)
  const small = [...fromTotals.entries()].filter(([, v]) => total && v / total < foldShare).map(([k]) => k);
  const folded = new Set(small.length >= 2 ? small : []);

  const fromNodes = new Map<string, SNode>();
  const members = new Map<string, Member>();
  const toNodes = new Map<string, SNode>();
  const agg = new Map<string, number>();

  for (const f of result.flows) {
    const isFold = folded.has(f.from);
    const fKey = isFold ? FOLD_KEY : f.from;
    let fn = fromNodes.get(fKey);
    if (!fn) {
      const d = displayLabel(f.from, kind);
      const neutral = !isFold && isNeutral(f.from);
      fn = {
        id: fId(fKey),
        side: "from",
        raw: isFold ? null : f.from,
        label: isFold ? "" : d.short,
        full: isFold ? "" : d.full,
        total: 0,
        // Orígenes en gris tenue: el color lo lleva el destino (familia semántica)
        color: neutral || isFold ? alpha(theme.other, 0.7) : alpha(theme.muted, 0.75),
        tone: null,
        neutral: neutral || isFold,
        links: new Map(),
      };
      fromNodes.set(fKey, fn);
    }
    fn.total += f.value;
    fn.links.set(f.to, (fn.links.get(f.to) ?? 0) + f.value);
    if (isFold) {
      let m = members.get(f.from);
      if (!m) members.set(f.from, (m = { label: displayLabel(f.from, kind).full, value: 0, byTo: new Map() }));
      m.value += f.value;
      m.byTo.set(f.to, (m.byTo.get(f.to) ?? 0) + f.value);
    }
    let tn = toNodes.get(f.to);
    if (!tn) {
      const st = family ? resolveStatus(f.to, family) : null;
      const neutral = isNeutral(f.to);
      tn = {
        id: tId(f.to),
        side: "to",
        raw: f.to,
        label: st?.display ?? displayLabel(f.to).short,
        full: st?.display ?? displayLabel(f.to).full,
        total: 0,
        color: st ? theme.resolve(st.color) : neutral ? theme.other : theme.series[toNodes.size] ?? theme.other,
        tone: st?.tone ?? (neutral ? "neutral" : null),
        neutral,
        links: new Map(),
      };
      toNodes.set(f.to, tn);
    }
    tn.total += f.value;
    tn.links.set(fKey, (tn.links.get(fKey) ?? 0) + f.value);
    const k = `${fKey}\u0001${f.to}`;
    agg.set(k, (agg.get(k) ?? 0) + f.value);
  }

  const fold = fromNodes.get(FOLD_KEY);
  if (fold) {
    fold.members = [...members.values()].sort((a, b) => b.value - a.value);
    fold.label = `Otras ${fromPlural} (${fold.members.length})`;
    fold.full = fold.label;
  }

  const from = [...fromNodes.values()].sort((a, b) => Number(a.raw === null) - Number(b.raw === null) || Number(a.neutral) - Number(b.neutral) || b.total - a.total);
  const toOrder = (n: SNode) => (family && n.raw ? (resolveStatus(n.raw, family)?.order ?? 50) : 0);
  const to = [...toNodes.values()].sort((a, b) => Number(a.neutral) - Number(b.neutral) || toOrder(a) - toOrder(b) || b.total - a.total);

  const priority: Record<string, number> = {};
  from.forEach((n, i) => (priority[n.id] = i));
  to.forEach((n, i) => (priority[n.id] = i));

  const flows: SankeyDataPoint[] = [...agg.entries()].map(([k, flow]) => {
    const [f, t] = k.split("\u0001");
    return { from: fId(f), to: tId(t), flow };
  });
  const byId = new Map<string, SNode>([...from, ...to].map((n) => [n.id, n]));
  return { from, to, byId, flows, total, padding: paddingFor(from.length), priority, foldShare };
}

// ─── Posición de nodos (para las etiquetas HTML) ─────────────────────────────
interface NodeRect {
  id: string;
  x: number;
  y: number;
  h: number;
}

interface RawNode {
  key: string;
  in: number;
  out: number;
  x?: number;
  y?: number;
}

/**
 * Lee la geometría de los nodos tras dibujar (réplica de getNodeRect de chartjs-chart-sankey 0.19)
 * y la publica solo cuando cambia. Las etiquetas viven en HTML para envolver texto y ser clicables.
 */
function nodesPlugin(publish: (rects: NodeRect[]) => void): Plugin<"sankey"> {
  let last = "";
  return {
    id: "documSankeyNodes",
    afterDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      const ctrl = meta.controller as unknown as { _nodes?: Map<string, RawNode>; _maxX?: number };
      const xs = meta.xScale;
      const ys = meta.yScale;
      if (!ctrl._nodes || !xs || !ys) return;
      const trailing = chart.width - chart.chartArea.right;
      const colPad = Math.max(0, NODE_W + 3 - trailing);
      const maxX = ctrl._maxX ?? 0;
      const rects: NodeRect[] = [];
      for (const n of ctrl._nodes.values()) {
        const size = Math.max(n.in || n.out, n.out || n.in);
        const y1 = ys.getPixelForValue(n.y ?? 0);
        const y2 = ys.getPixelForValue((n.y ?? 0) + size);
        const x = xs.getPixelForValue(n.x ?? 0) - (maxX ? ((n.x ?? 0) / maxX) * colPad : 0);
        rects.push({ id: n.key, x: Math.round(x), y: Math.round(Math.min(y1, y2)), h: Math.round(Math.abs(y2 - y1)) });
      }
      const sig = rects.map((r) => `${r.id}:${r.x}:${r.y}:${r.h}`).join("|");
      if (sig === last) return;
      last = sig;
      publish(rects);
    },
  };
}

// ─── Medición de texto para evitar colisiones ────────────────────────────────
let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string, font: string): number {
  if (typeof document === "undefined") return text.length * 6.6;
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 6.6;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/** Nombre partido en [cabeza, última palabra]: la última palabra viaja pegada al valor. */
function splitLast(label: string): [string, string] {
  const i = label.trimEnd().lastIndexOf(" ");
  return i < 0 ? ["", label] : [label.slice(0, i), label.slice(i + 1)];
}

/** Líneas estimadas de una etiqueta envuelta en un ancho dado (tokens que no se parten). */
function lineCount(words: string[], maxW: number, font: string): number {
  let lines = 1;
  let cur = 0;
  const space = textWidth(" ", font);
  for (const w of words) {
    const ww = textWidth(w, font);
    if (cur && cur + space + ww > maxW) {
      lines++;
      cur = ww;
    } else cur += (cur ? space : 0) + ww;
  }
  return lines;
}

/** Reparte etiquetas verticalmente sin solaparse (centros deseados → tops). */
function spread(items: { id: string; center: number; h: number }[], top: number, bottom: number): Map<string, number> {
  const s = [...items].sort((a, b) => a.center - b.center);
  const tops = s.map((it) => it.center - it.h / 2);
  for (let i = 0; i < s.length; i++) tops[i] = Math.max(tops[i], i ? tops[i - 1] + s[i - 1].h + LABEL_GAP : top);
  // Si se sale por abajo, empuja hacia arriba
  for (let i = s.length - 1; i >= 0; i--) {
    const limit = i === s.length - 1 ? bottom - s[i].h : tops[i + 1] - s[i].h - LABEL_GAP;
    tops[i] = Math.min(tops[i], limit);
  }
  for (let i = 0; i < s.length; i++) tops[i] = Math.max(tops[i], top);
  return new Map(s.map((it, i) => [it.id, tops[i]]));
}

type SankeyChart = ChartJS<"sankey", SankeyDataPoint[], unknown>;

export function SankeyV2({ widget, result }: VizProps<SankeyWidget, SankeyResult>) {
  const theme = useChartTheme();
  const { filters, toggleValue, spec } = useDashboard();
  const toggleMany = useToggleMany();
  const { state, show, hide } = useChartTooltip();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const { ref: sizeRef, width, height } = useElementSize<HTMLDivElement>();
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
  const [rects, setRects] = useState<NodeRect[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const chartRef = useRef<SankeyChart | null>(null);
  const unit = spec.unit?.plural ?? "registros";
  const family: SemanticFamily | undefined = widget.semantic ?? (widget.to.field.toLowerCase() === "momento" ? "momento" : undefined);
  const fromField = widget.from.field;
  const toField = widget.to.field;

  const fromPlural = plural(widget.from.label);
  // Alto redondeado a 20 px: el umbral de plegado no cambia en cada píxel de resize
  const foldH = Math.round(height / 20) * 20;
  const model = useMemo(() => buildModel(result, family, theme, widget.labelKind, fromPlural, foldH), [result, family, theme, widget.labelKind, fromPlural, foldH]);
  const clickHint = `Clic para filtrar ${widget.from.label.toLocaleLowerCase("es-CO")} y ${widget.to.label.toLocaleLowerCase("es-CO")}`;
  const fromSel = selectionOf(filters.eq, fromField);
  const toSel = selectionOf(filters.eq, toField);
  const selKey = `${(filters.eq[fromField] ?? []).join("\u0001")}\u0002${(filters.eq[toField] ?? []).join("\u0001")}`;

  // Canal de etiquetas a cada lado (las etiquetas envuelven dentro de su canal)
  const w = width || 400;
  const leftW = Math.round(Math.max(96, Math.min(w * (w < 480 ? 0.4 : 0.36), 210)));
  const rightW = Math.round(Math.max(96, Math.min(w * 0.3, 170)));
  const plugin = useMemo(() => nodesPlugin(setRects), []);
  const plugins = useMemo(() => [plugin, RESIZE_RECOVERY as unknown as Plugin<"sankey">], [plugin]);

  const exporter = useCallback(async () => {
    if (!wrapEl) return chartRef.current?.toBase64Image("image/png", 1) ?? null;
    try {
      const { toPng } = await import("html-to-image");
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#ffffff";
      return await toPng(wrapEl, { pixelRatio: 2, backgroundColor: bg, cacheBust: true });
    } catch {
      return chartRef.current?.toBase64Image("image/png", 1) ?? null;
    }
  }, [wrapEl]);
  useExporter(exporter);

  const flowAlpha = useCallback(
    (p: SankeyDataPoint | undefined, hover: boolean) => {
      const f = p ? model.byId.get(p.from) : undefined;
      const t = p ? model.byId.get(p.to) : undefined;
      const [fs, ts] = selKey.split("\u0002");
      const fOn = !fs || (f?.raw != null && fs.split("\u0001").includes(f.raw));
      const tOn = !ts || (t?.raw != null && ts.split("\u0001").includes(t.raw));
      const nodeHover = hoverId && p ? hoverId === p.from || hoverId === p.to : null;
      if (hover || nodeHover) return 0.7;
      if (hoverId) return 0.14;
      return fOn && tOn ? 0.35 : 0.12;
    },
    [model.byId, selKey, hoverId],
  );

  const data = useMemo<ChartData<"sankey", SankeyDataPoint[], unknown>>(() => {
    const color = (id: string | undefined) => (id ? model.byId.get(id)?.color : undefined) ?? theme.other;
    const raw = (c: ScriptableContext<"sankey">) => c.raw as SankeyDataPoint | undefined;
    return {
      datasets: [
        {
          label: widget.title,
          data: model.flows,
          colorFrom: (c) => color(raw(c)?.from),
          colorTo: (c) => color(raw(c)?.to),
          hoverColorFrom: (c) => color(raw(c)?.from),
          hoverColorTo: (c) => color(raw(c)?.to),
          flowColor: (c) => alpha(color(raw(c)?.to), flowAlpha(raw(c), false)),
          hoverFlowColor: (c: ScriptableContext<"sankey">) => alpha(color(raw(c)?.to), flowAlpha(raw(c), true)),
          colorMode: "to",
          borderWidth: 0,
          nodeWidth: NODE_W,
          nodePadding: model.padding,
          size: "max",
          priority: model.priority,
          nodeLabels: { display: false },
          // Solo se anima el trazo de entrada (progress). Las posiciones (x, x2, y, y2) se aplican al
          // instante: si se animan, un cambio de padding/ancho a mitad de animación deja flujos desfasados.
          animations: {
            numbers: { duration: 0 },
            colors: { duration: 0 },
            progress: reduced ? { duration: 0 } : { duration: 450, delay: 0, easing: "easeOutQuart" },
          },
        } as ChartData<"sankey", SankeyDataPoint[], unknown>["datasets"][number],
      ],
    };
  }, [model, theme, widget.title, flowAlpha, reduced]);

  const toContent = useCallback(
    (tooltip: TooltipModel<"sankey">): TooltipContent | null => {
      const p = tooltip.dataPoints?.[0]?.raw as SankeyDataPoint | undefined;
      const f = p ? model.byId.get(p.from) : undefined;
      const t = p ? model.byId.get(p.to) : undefined;
      if (!p || !f || !t) return null;
      const detail = f.members?.map((m) => ({ label: m.label, value: formatInt(m.byTo.get(t.raw ?? "") ?? 0) })).filter((r) => r.value !== "0");
      return {
        title: `${f.full} → ${t.full}`,
        value: `${formatInt(p.flow)} ${unit}`,
        valueNote: f.total ? `${formatPct(p.flow / f.total)} de ${f.raw === null ? `otras ${fromPlural}` : f.label}` : undefined,
        rows: detail?.length ? detail.slice(0, 8).map((r) => ({ ...r, color: theme.other })) : [{ label: `Del total`, value: formatPct(model.total ? p.flow / model.total : 0), color: t.color }],
        hint: f.raw !== null ? clickHint : undefined,
      };
    },
    [model, unit, theme.other, fromPlural, clickHint],
  );

  const options = useMemo<ChartOptions<"sankey">>(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: reduced ? false : { duration: 400 },
      layout: { padding: { left: leftW, right: rightW, top: 4, bottom: 4 } },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false, external: chartJsExternal<"sankey">(show, hide, toContent) },
      },
      onHover: (e: ChartEvent, els: ActiveElement[]) => {
        const target = e.native?.target as HTMLElement | undefined;
        if (target) target.style.cursor = els.length ? "pointer" : "default";
      },
      onClick: (_e: ChartEvent, els: ActiveElement[], chart) => {
        if (!els.length) return;
        const p = chart.data.datasets[0]?.data[els[0].index] as SankeyDataPoint | undefined;
        const f = p ? model.byId.get(p.from) : undefined;
        const t = p ? model.byId.get(p.to) : undefined;
        if (!f?.raw || !t?.raw) return;
        toggleMany([
          { field: fromField, value: f.raw },
          { field: toField, value: t.raw },
        ]);
      },
    }),
    [reduced, leftW, rightW, show, hide, toContent, model.byId, toggleMany, fromField, toField],
  );

  // ─── Etiquetas HTML ──────────────────────────────────────────────────────
  const labels = useMemo(() => {
    const rectOf = new Map(rects.map((r) => [r.id, r]));
    const font = "600 12px Montserrat, ui-sans-serif, system-ui, sans-serif";
    const place = (nodes: SNode[], maxW: number) => {
      const items = nodes
        .map((n) => {
          const r = rectOf.get(n.id);
          if (!r) return null;
          // Orígenes: la última palabra va pegada al valor; destinos: nombre + "valor %"
          const [head, last] = splitLast(n.label);
          const words =
            n.side === "from" ? [...head.split(/\s+/).filter(Boolean), `${last} ${formatInt(n.total)}`] : [...n.label.split(/\s+/), formatInt(n.total), "100,0 %"];
          const lines = Math.min(3, lineCount(words, maxW - 22, font));
          return { id: n.id, center: r.y + r.h / 2, h: lines * LINE_H + 2, x: r.x };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      const tops = spread(items, 0, height || 360);
      return items.map((it) => ({ id: it.id, top: tops.get(it.id) ?? 0, x: it.x }));
    };
    return { from: place(model.from, leftW - 8), to: place(model.to, rightW - 8) };
  }, [rects, model, leftW, rightW, height]);

  const nodeTip = (el: Element, n: SNode) => {
    const { x, y } = anchorOf(el);
    const other = n.side === "from" ? model.to : model.from;
    const rows =
      n.members && n.members.length
        ? n.members.slice(0, 8).map((m) => ({ label: m.label, value: formatInt(m.value), share: n.total ? formatPct(m.value / n.total) : undefined, color: theme.other }))
        : other
            .map((o) => ({ o, v: n.links.get((n.side === "from" ? o.raw : (o.raw ?? FOLD_KEY)) ?? FOLD_KEY) ?? 0 }))
            .filter((x) => x.v > 0)
            .map(({ o, v }) => ({ label: o.label, value: formatInt(v), share: n.total ? formatPct(v / n.total) : undefined, color: o.color, tone: o.tone ?? undefined }));
    show(x, y, {
      title: n.full,
      value: `${formatInt(n.total)} ${unit}`,
      valueNote: model.total ? `${formatPct(n.total / model.total)} del total` : undefined,
      rows,
      extra: n.members && n.members.length > 8 ? <p className="mt-1 text-white/60">y {n.members.length - 8} más</p> : undefined,
      hint: n.raw !== null ? "Clic para filtrar" : `${fromPlural.charAt(0).toLocaleUpperCase("es-CO")}${fromPlural.slice(1)} con menos del ${formatPct(model.foldShare, 0)} cada una`,
    });
  };

  const labelEl = (n: SNode, pos: { top: number; x: number }) => {
    const field = n.side === "from" ? fromField : toField;
    const s = n.side === "from" ? fromSel : toSel;
    const selected = n.raw !== null && s.has(n.raw);
    const dim = s.active && !selected;
    const share = model.total ? n.total / model.total : 0;
    const style: CSSProperties =
      n.side === "from"
        ? { top: pos.top, right: `calc(100% - ${pos.x - 8}px)`, maxWidth: leftW - 8, textAlign: "right" }
        : { top: pos.top, left: pos.x + NODE_W + 8, maxWidth: rightW - 8 };
    const nameCls = cn("text-xs", n.neutral ? "text-muted" : "text-text-2");
    const value = <span className="tabular text-xs font-semibold text-text">{formatInt(n.total)}</span>;
    const [head, last] = splitLast(n.label);
    const body =
      n.side === "from" ? (
        <>
          {head && <span className={nameCls}>{head} </span>}
          {/* Par última palabra + valor sin partir: el valor nunca queda solo en una línea */}
          <span className="whitespace-nowrap">
            <span className={nameCls}>{last}</span> {value}
          </span>
        </>
      ) : (
        <>
          {n.tone && <StatusIcon tone={n.tone} className="mr-1 inline-block align-[-2px]" />}
          <span className={nameCls}>{n.label}</span>{" "}
          <span className="whitespace-nowrap">
            {value}
            <span className="tabular text-xs text-muted"> {formatPct(share)}</span>
          </span>
        </>
      );
    const common = {
      style: { ...style, lineHeight: `${LINE_H}px` },
      onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
        setHoverId(n.id);
        nodeTip(e.currentTarget, n);
      },
      onMouseLeave: () => {
        setHoverId(null);
        hide();
      },
      onFocus: (e: React.FocusEvent<HTMLElement>) => {
        setHoverId(n.id);
        nodeTip(e.currentTarget, n);
      },
      onBlur: () => {
        setHoverId(null);
        hide();
      },
    };
    if (n.raw === null)
      return (
        <span key={n.id} tabIndex={0} className={cn("pointer-events-auto absolute rounded-md px-1 transition-opacity", dim && "opacity-45")} {...common}>
          {body}
        </span>
      );
    return (
      <button
        key={n.id}
        type="button"
        aria-pressed={selected}
        aria-label={`${n.full}: ${formatInt(n.total)} ${unit}`}
        onClick={() => toggleValue(field, n.raw!)}
        className={cn("pointer-events-auto absolute rounded-md px-1 transition hover:bg-surface-3", selected && "bg-primary-soft", dim && "opacity-45")}
        {...common}
      >
        {body}
      </button>
    );
  };

  const ready = rects.length > 0;
  return (
    <div
      ref={(el) => {
        sizeRef(el);
        setWrapEl(el);
      }}
      className="relative h-full min-h-0"
    >
      <Chart
        ref={chartRef}
        type="sankey"
        data={data}
        options={options}
        plugins={plugins}
        role="img"
        aria-label={`${widget.title}: ${model.from.map((n) => `${n.full} ${formatInt(n.total)}`).join(", ")}`}
      />
      <div className={cn("pointer-events-none absolute inset-0 transition-opacity duration-200", ready ? "opacity-100" : "opacity-0")}>
        {labels.from.map((pos) => {
          const n = model.byId.get(pos.id);
          return n ? labelEl(n, pos) : null;
        })}
        {labels.to.map((pos) => {
          const n = model.byId.get(pos.id);
          return n ? labelEl(n, pos) : null;
        })}
      </div>
      <ChartTooltip state={state} />
    </div>
  );
}
