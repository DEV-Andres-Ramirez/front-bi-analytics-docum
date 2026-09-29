"use client";

import { Check } from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import type { CategoryResult } from "@/dashboards/dto";
import type { BarWidget, DonutWidget, SemanticFamily, ValueFormat } from "@/dashboards/types";
import { innerWidth } from "@/dashboards/layout";
import { cn } from "@/lib/cn";
import { isNeutral, normalizeLabel, TONE_VARS } from "@/lib/charts/semantic";
import { formatPct, formatValue } from "@/lib/format";
import { Swatch } from "./kit/chart-legend";
import { ChartTooltip, useChartTooltip } from "./kit/chart-tooltip";
import { LegendSlot } from "./kit/legend-slot";
import { QUALITY_CHIP_MIN, QUALITY_NOTICE_MIN, QualityChip } from "./kit/quality";
import { StatusIcon, TONE_LABEL } from "./kit/status-icon";
import { VizEmpty } from "./kit/viz-states";
import {
  buildParts,
  dimensionOf,
  emphasis,
  FADE_MASK,
  formatOf,
  groupParts,
  longestWord,
  mergeNeutrals,
  missingShare,
  orderOf,
  partTooltip,
  textWidth,
  toneNote,
  ProportionBar,
  useBox,
  useHover,
  useScrollFade,
  useSelection,
  type Part,
  type PartGroup,
} from "./status-shared";
import type { VizProps } from "./types";

/**
 * StatusStrip: estados con familia semántica (≤ 7 valores).
 * - tiles (horizontal): barra 100 % de 12 px + tiles (≥ 112 px) sobre UNA rejilla de columnas (mcm de los
 *   tiles por línea): cada línea reparte todo el ancho entre sus tiles, sin huecos (Abiertos 3 + Cerrados 2
 *   → 3 × 2 y 2 × 3 columnas de 6). Cada tile usa subgrid de filas: etiqueta, cifra de 24 px + % y barra de
 *   participación al pie; todas las cifras de una línea comparten línea base aunque alguna etiqueta ocupe
 *   2 líneas. Grupos con cabecera (Abiertos | Cerrados); los neutrales forman el grupo "Sin clasificar"
 *   (separador discontinuo en el hueco de 8 px o su propia línea con el ancho de un tile). Sin grupos, las
 *   líneas se equilibran (5 → 3 + 2, con el neutral como último slot) y se estiran.
 * - vertical (interno ≤ 305 px, sin grupos con cabecera): tiles apilados de 56 px.
 * - rows: lista compacta agrupada (26 px por estado) cuando los tiles no caben en el alto medido.
 * - list: lista con los neutrales en una cabecera fuera de escala (guías; solo por spec).
 * La variante se decide con el ancho y el alto MEDIDOS de la celda (no con el span de diseño).
 * Con orden declarado, los estados sin casos se muestran en 0 (atenuados): los hermanos se leen igual.
 */

/** Contexto de la cabecera neutral en la variante lista. */
const NEUTRAL_CONTEXT: Partial<Record<SemanticFamily, string>> = { guia: "envío electrónico" };

/** Tile: ancho mínimo, mínimo apretado (≤ 4 tiles en una sola línea) y separación. */
const TILE_MIN = 112;
const TILE_MIN_TIGHT = 88;
const TILE_GAP = 8;
/** Cabecera de grupo (h-7). */
const GROUP_HEAD = 28;
/** Barra de 12 px + separación de 12 px. */
const BAR_BLOCK = 24;
/** Alto del tile: borde 3 + pt 8 + etiqueta (16/línea) + 6 + cifra 24 (+ 18 con el % debajo) + 6 + barra 4 + pb 10. */
const TILE_CHROME = 3 + 8 + 6 + 24 + 6 + 4 + 10;
const LABEL_LINE = 16;
const PCT_BELOW = 18;
/** Variante vertical: fila mínima de 56 px (la variante rows usa 24 por cabecera, 26 por estado y 9 de separador). */
const VERTICAL_ROW = 56;
/** Holgura del presupuesto: la estimación de texto no es exacta. */
const SLACK = 4;

type Props = VizProps<BarWidget | DonutWidget, CategoryResult>;

interface Shared {
  fmt: ValueFormat;
  sel: ReturnType<typeof useSelection>;
  hover: ReturnType<typeof useHover>;
  tip: (p: Part) => ReturnType<typeof partTooltip>;
}

function ariaFor(p: Part, fmt: ValueFormat) {
  return `${p.code ? `${p.code} ` : ""}${p.display}: ${formatValue(p.value, fmt)} (${formatPct(p.share)})${p.tone ? `, ${TONE_LABEL[p.tone]}` : ""}`;
}

function handlers(p: Part, { sel, hover, tip }: Shared) {
  const interactive = sel.canFilter && p.filterable && p.labels.length > 0 && p.value > 0;
  return {
    interactive,
    props: {
      type: "button" as const,
      "aria-pressed": interactive ? sel.isOn(p) : undefined,
      "aria-disabled": interactive ? undefined : true,
      onClick: hover.tap(() => interactive && sel.toggle(p)),
      onMouseEnter: hover.enter(p.key, tip(p)),
      onMouseMove: hover.enter(p.key, tip(p)),
      onMouseLeave: hover.leave,
      onFocus: hover.focus(p.key, tip(p)),
      onBlur: hover.leave,
    },
  };
}

// ─── Plan de tiles (rejilla común) ───────────────────────────────────────────

interface TileSlot {
  part: Part;
  line: number;
  /** Columna (1-based) y columnas que ocupa en la rejilla de la tira. */
  col: number;
  span: number;
}

interface GroupBox {
  group: PartGroup;
  /** Dibuja cabecera (Abiertos | Cerrados | Sin clasificar). */
  head: boolean;
  /** Separador discontinuo a la izquierda (el grupo neutral comparte línea). */
  sep: boolean;
  line0: number;
  line1: number;
  col: number;
  span: number;
  tiles: TileSlot[];
}

interface TileLine {
  head: boolean;
  labelLines: number;
}

interface TilePlan {
  cols: number;
  lines: TileLine[];
  boxes: GroupBox[];
  /** El % va bajo la cifra en TODOS los tiles (misma línea base en la tira). */
  pctBelow: boolean;
  need: number;
  /** Alguna etiqueta partiría una palabra (plan apretado inviable). */
  breaksWords: boolean;
  headed: boolean;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const lcm = (a: number, b: number) => (a * b) / gcd(a, b);

function perLineFor(inner: number, min: number) {
  return Math.max(1, Math.floor((inner + TILE_GAP) / (min + TILE_GAP)));
}

/** Grupos con cabecera: al menos un grupo con nombre y dos grupos reales (Abiertos | Cerrados). */
function isHeaded(groups: PartGroup[]) {
  const real = groups.filter((g) => !g.neutral);
  return real.length >= 2 && real.some((g) => g.key !== "__none");
}

/** Rejilla estirada: más columnas que esto (mcm de conteos dispares) dejaría pistas de pocos px entre huecos de 8. */
const MAX_STRETCH_COLS = 24;

/** Caja de un grupo a partir de sus tiles (columna inicial y columnas que abarca). */
function boxOf(group: PartGroup, tiles: TileSlot[], head: boolean, sep: boolean): GroupBox {
  const col = Math.min(...tiles.map((t) => t.col));
  const end = Math.max(...tiles.map((t) => t.col + t.span));
  return { group, head, sep, line0: tiles[0].line, line1: tiles[tiles.length - 1].line, col, span: end - col, tiles };
}

/**
 * Reparte los tiles en líneas sobre una rejilla de `cols` columnas:
 * - un solo grupo sin cabecera (con o sin neutral): líneas equilibradas (5 → 3 + 2) que se estiran (columnas =
 *   mcm de los conteos); el neutral es el último slot, tras un separador discontinuo (nunca solo en su línea);
 * - grupos con cabecera: un grupo no se parte entre líneas salvo que no quepa solo; después cada línea reparte
 *   el ancho entre sus tiles (Abiertos 3 + Cerrados 2 → rejilla de 6: 3 × 2 y 2 × 3; el huérfano ocupa la
 *   línea). Solo el neutral solo en su línea conserva el ancho de un tile (cabecera "Sin clasificar").
 */
function planTiles(groups: PartGroup[], inner: number, min: number, fmt: ValueFormat): TilePlan {
  const P = perLineFor(inner, min);
  const headed = isHeaded(groups);
  const real = groups.filter((g) => !g.neutral);
  const neutralGroup = groups.find((g) => g.neutral);
  const slots: TileSlot[] = [];
  const lineUsed: number[] = [];
  const lineHead: boolean[] = [];
  const boxes: GroupBox[] = [];
  let cols: number;

  if (!headed && real.length === 1) {
    // Tira plana: líneas equilibradas y estiradas (sin huecos); el neutral, último slot de la última línea
    const realParts = real[0].parts;
    const parts = [...realParts, ...(neutralGroup?.parts ?? [])];
    const n = parts.length;
    const nLines = Math.max(1, Math.ceil(n / P));
    const base = Math.floor(n / nLines);
    const extra = n % nLines;
    const counts = Array.from({ length: nLines }, (_, i) => base + (i < extra ? 1 : 0));
    cols = counts.reduce((a, c) => lcm(a, c), 1);
    let k = 0;
    counts.forEach((c, line) => {
      const span = cols / c;
      for (let j = 0; j < c; j++) slots.push({ part: parts[k++], line, col: j * span + 1, span });
      lineUsed.push(cols);
      lineHead.push(false);
    });
    const realTiles = slots.slice(0, realParts.length);
    boxes.push(boxOf(real[0], realTiles, false, false));
    if (neutralGroup) {
      const tiles = slots.slice(realParts.length);
      // Separador discontinuo si comparte línea; solo en la suya (una columna por línea), cabecera
      const sep = tiles[0].col > 1;
      const head = !sep && tiles[0].line > 0;
      if (head) {
        // Solo en su línea (móvil: 2 + 2 + 1) conserva el ancho de un tile, como en las tiras con cabecera
        lineHead[tiles[0].line] = true;
        const span = cols / Math.max(...counts.slice(0, -1));
        tiles.forEach((t, j) => {
          t.col = j * span + 1;
          t.span = span;
        });
      }
      boxes.push(boxOf(neutralGroup, tiles, head, sep));
    }
  } else {
    let line = -1;
    let x = P;
    const newLine = () => {
      line++;
      x = 0;
      lineUsed.push(0);
      lineHead.push(false);
    };
    const placed: { group: PartGroup; head: boolean; sep: boolean; tiles: TileSlot[] }[] = [];
    for (const g of groups) {
      const tiles: TileSlot[] = [];
      let head = headed;
      let sep = false;
      if (g.neutral) {
        if (line < 0 || x + 1 > P) newLine();
        sep = x > 0;
        // En su propia línea (tras otros tiles) la cabecera "Sin clasificar" hace de separador
        head = headed || (!sep && line > 0);
        tiles.push({ part: g.parts[0], line, col: x + 1, span: 1 });
        x += 1;
        // Neutrales fusionados: un solo tile (mergeNeutrals); por si acaso, los demás siguen en la línea
        for (const p of g.parts.slice(1)) {
          if (x >= P) newLine();
          tiles.push({ part: p, line, col: x + 1, span: 1 });
          x += 1;
        }
      } else {
        const k = g.parts.length;
        // Con cabecera, el grupo empieza línea si no cabe entero en lo que queda de la actual
        if (line < 0 || (headed ? x + Math.min(k, P) > P : x >= P)) newLine();
        for (const p of g.parts) {
          if (x >= P) newLine();
          tiles.push({ part: p, line, col: x + 1, span: 1 });
          x += 1;
        }
      }
      if (head) lineHead[tiles[0].line] = true;
      for (const t of tiles) lineUsed[t.line] = Math.max(lineUsed[t.line], t.col);
      placed.push({ group: g, head, sep, tiles });
      slots.push(...tiles);
    }
    // Sin huecos: cada línea reparte el ancho entre sus tiles (rejilla = mcm de los conteos por línea). La línea
    // que solo tiene el neutral conserva el ancho de un tile (su cabecera "Sin clasificar" ya la separa).
    const byLine = lineUsed.map((_, i) => slots.filter((s) => s.line === i));
    const neutralOnly = byLine.map((ls) => ls.every((s) => s.part.neutral));
    const widest = Math.max(1, ...byLine.filter((_, i) => !neutralOnly[i]).map((ls) => ls.length));
    const grid = byLine.reduce((a, ls) => lcm(a, ls.length), widest);
    if (grid <= MAX_STRETCH_COLS) {
      cols = grid;
      byLine.forEach((ls, i) => {
        const span = cols / (neutralOnly[i] ? Math.max(widest, ls.length) : ls.length);
        ls.forEach((s, j) => {
          s.col = j * span + 1;
          s.span = span;
        });
      });
    } else {
      cols = Math.max(1, ...lineUsed);
    }
    for (const b of placed) boxes.push(boxOf(b.group, b.tiles, b.head, b.sep));
  }

  // Estimación de alto: etiquetas de 1–2 líneas por línea de tiles y % en línea o debajo (para toda la tira)
  const colW = (inner - (cols - 1) * TILE_GAP) / cols;
  const tileW = (s: TileSlot) => s.span * colW + (s.span - 1) * TILE_GAP;
  const labelText = (p: Part) => `${p.code ? `${p.code} ` : ""}${p.display}`;
  const labelRoom = (s: TileSlot) => tileW(s) - 24 - 22;
  const lines: TileLine[] = lineUsed.map((_, i) => ({
    head: lineHead[i],
    labelLines: slots.some((s) => s.line === i && textWidth(labelText(s.part), 12.5) > labelRoom(s) * 0.97) ? 2 : 1,
  }));
  const pctBelow = slots.some((s) => textWidth(formatValue(s.part.value, fmt), 24, { bold: true }) + 6 + textWidth(formatPct(s.part.share), 12) > tileW(s) - 24 - 2);
  const breaksWords = slots.some((s) => longestWord(labelText(s.part), 12.5) > labelRoom(s));
  const need =
    BAR_BLOCK +
    lines.reduce((a, l) => a + (l.head ? GROUP_HEAD : 0) + TILE_CHROME + l.labelLines * LABEL_LINE + (pctBelow ? PCT_BELOW : 0), 0) +
    (lines.length - 1) * TILE_GAP;
  return { cols, lines, boxes, pctBelow, need, breaksWords, headed };
}

type Layout = { kind: "tiles"; plan: TilePlan } | { kind: "vertical" } | { kind: "rows"; headed: boolean } | { kind: "list" };

/**
 * Variante por capacidad: la preferida (por spec o por ancho) si cabe en el alto medido; si no, tiles
 * apretados en una sola línea (≥ 88 px, sin partir palabras) y, por último, la lista compacta agrupada.
 * avail = 0: alto por contenido (móvil) → siempre cabe.
 */
function chooseLayout(groups: PartGroup[], inner: number, avail: number, forced: "horizontal" | "vertical" | "list" | undefined, fmt: ValueFormat): Layout {
  if (forced === "list") return { kind: "list" };
  const headed = isHeaded(groups);
  const fits = (need: number) => avail <= 0 || need + SLACK <= avail;
  const n = groups.reduce((a, g) => a + g.parts.length, 0);
  // Vertical: sin cabeceras de grupo (las etiquetas cortas "Vencido" necesitan su grupo para leerse)
  if (!headed && (forced === "vertical" || (!forced && inner <= 305))) {
    return fits(BAR_BLOCK + n * VERTICAL_ROW + (n - 1) * TILE_GAP) ? { kind: "vertical" } : { kind: "rows", headed };
  }
  const plan = planTiles(groups, inner, TILE_MIN, fmt);
  if (fits(plan.need)) return { kind: "tiles", plan };
  // Todos los tiles en una sola línea apretada (≥ 88 px), si ninguna etiqueta parte una palabra
  if (perLineFor(inner, TILE_MIN_TIGHT) >= n) {
    const tight = planTiles(groups, inner, TILE_MIN_TIGHT, fmt);
    if (tight.lines.length === 1 && !tight.breaksWords && fits(tight.need)) return { kind: "tiles", plan: tight };
  }
  return { kind: "rows", headed };
}

// ─── StatusStrip ─────────────────────────────────────────────────────────────

export function StatusStrip({ widget, result, span, height, expanded }: Props) {
  const { ref, width, height: boxHeight, measured, fixed } = useBox<HTMLDivElement>();
  const { state, show, hide } = useChartTooltip();
  const hover = useHover(show, hide);
  const sel = useSelection(dimensionOf(widget));
  const fmt = formatOf(widget);
  const vo = widget.vizOptions;
  const family = widget.semantic;
  const order = orderOf(widget);
  const labelKind = widget.labelKind;

  const parts = useMemo(() => {
    // Estados declarados sin casos (p. ej. "Abierto vencido: 0" en Entes): se muestran en 0, atenuados
    const present = new Set(result.labels.map((l) => normalizeLabel(l)));
    const missing = family && order?.length ? order.filter((l) => !isNeutral(l) && !present.has(normalizeLabel(l))) : [];
    const labels = [...result.labels, ...missing];
    const values = [...result.values, ...missing.map(() => 0)];
    const base = buildParts(labels, values, { family, overrides: vo?.overrides, order, labelKind, folded: result.folded, rest: result.rest, keepZero: missing.length > 0 });
    return mergeNeutrals(base);
  }, [result, family, vo?.overrides, order, labelKind]);
  const groups = useMemo(() => groupParts(parts, vo?.groups), [parts, vo?.groups]);
  const ordered = useMemo(() => groups.flatMap((g) => g.parts), [groups]);

  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <VizEmpty note={widget.note} />;

  const tip = (p: Part) => partTooltip(p, fmt, { on: sel.isOn(p), canFilter: sel.canFilter && p.value > 0, extra: toneNote(p.tone) });
  const shared: Shared = { fmt, sel, hover, tip };
  // Ancho y alto MEDIDOS (a 768 una fila 6-6 pasa a 3 | 3: el span de diseño no sirve); antes de medir,
  // el presupuesto de diseño. avail = 0: alto por contenido (móvil)
  const inner = measured ? width : expanded ? 1036 : innerWidth(span);
  const avail = measured ? (fixed ? boxHeight : 0) : height;
  const layout = chooseLayout(groups, inner, avail, vo?.variant, fmt);

  const miss = missingShare(parts);
  const missShare = miss.total ? miss.neutral / miss.total : 0;
  const chip = layout.kind !== "list" && missShare >= QUALITY_CHIP_MIN && missShare < QUALITY_NOTICE_MIN && (
    <LegendSlot side="end">
      <QualityChip neutral={miss.neutral} total={miss.total} />
    </LegendSlot>
  );

  if (layout.kind === "list") {
    return (
      <div ref={ref} className="flex h-full min-h-0 flex-col" onMouseLeave={hover.leave}>
        <StatusList parts={ordered} family={family} avail={avail} {...shared} title={widget.title} />
        <ChartTooltip state={state} />
      </div>
    );
  }

  const bar = (
    <ProportionBar
      parts={ordered}
      thickness={12}
      hovered={hover.hovered}
      isOn={sel.isOn}
      anySelected={sel.any}
      onEnter={(p) => hover.enter(p.key, tip(p))}
      onLeave={hover.leave}
      onClick={(p) => hover.tap(() => sel.toggle(p))()}
    />
  );

  return (
    <div ref={ref} data-layout={layout.kind} className="flex h-full min-h-0 flex-col" onMouseLeave={hover.leave}>
      {chip}
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {bar}
        {layout.kind === "vertical" ? (
          <ul role="list" aria-label={widget.title} className="grid min-h-0 flex-1 gap-2" style={{ gridAutoRows: `minmax(${VERTICAL_ROW}px, 1fr)` }}>
            {ordered.map((p) => (
              <li key={p.key} className="min-w-0">
                <VerticalTile p={p} {...shared} />
              </li>
            ))}
          </ul>
        ) : layout.kind === "rows" ? (
          <StatusRows groups={groups} headed={layout.headed} title={widget.title} {...shared} />
        ) : (
          <TileGrid plan={layout.plan} title={widget.title} {...shared} />
        )}
      </div>
      <ChartTooltip state={state} />
    </div>
  );
}

// ─── Tiles ───────────────────────────────────────────────────────────────────

const subgrid = (col: string, row: string, cols = false): CSSProperties => ({
  gridColumn: col,
  gridRow: row,
  gridTemplateRows: "subgrid",
  ...(cols ? { gridTemplateColumns: "subgrid" } : {}),
});

/**
 * Rejilla de la tira: por línea, [cabecera 28] + etiqueta · cifra · relleno (1fr) · barra, y 8 px entre
 * líneas. Grupos, listas y tiles son subgrids: las columnas y las líneas base se comparten.
 */
function TileGrid({ plan, title, ...shared }: Shared & { plan: TilePlan; title: string }) {
  const starts: number[] = [];
  const tracks: string[] = [];
  plan.lines.forEach((l, i) => {
    if (i > 0) tracks.push(`${TILE_GAP}px`);
    starts.push(tracks.length + 1);
    if (l.head) tracks.push(`${GROUP_HEAD}px`);
    tracks.push("auto", "auto", "minmax(0, 1fr)", "auto");
  });
  const labelRow = (line: number) => starts[line] + (plan.lines[line].head ? 1 : 0);
  const single = plan.boxes.length === 1 && !plan.boxes[0].head;
  return (
    <div className="grid min-h-0 flex-1 gap-x-2" style={{ gridTemplateColumns: `repeat(${plan.cols}, minmax(0, 1fr))`, gridTemplateRows: tracks.join(" ") }}>
      {plan.boxes.map((box) => {
        const top = starts[box.line0];
        const bottom = labelRow(box.line1) + 3;
        const listTop = labelRow(box.line0);
        const list = (key: string | undefined, listStyle: CSSProperties, offsetRow: number, offsetCol: number, label: string) => (
          <ul key={key} role="list" aria-label={label} className="grid min-w-0" style={listStyle}>
            {box.tiles.map((t) => (
              <li key={t.part.key} className="grid min-w-0" style={subgrid(`${t.col - offsetCol} / span ${t.span}`, `${labelRow(t.line) - offsetRow} / span 4`)}>
                <HTile p={t.part} pctBelow={plan.pctBelow} {...shared} />
              </li>
            ))}
          </ul>
        );
        if (single) return list(box.group.key, subgrid("1 / -1", "1 / -1", true), 0, 0, title);
        const groupLabel = box.group.key === "__none" && !plan.headed ? title : box.group.label;
        return (
          <div
            key={box.group.key}
            role="group"
            aria-label={groupLabel}
            className="relative grid min-w-0"
            style={subgrid(`${box.col} / span ${box.span}`, `${top} / ${bottom + 1}`, true)}
          >
            {/* Separador del grupo neutral: dentro del hueco de 8 px (las columnas no se desplazan) */}
            {box.sep && <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-[4.5px] border-l border-dashed border-border" />}
            {box.head && <GroupHead group={box.group} {...shared} />}
            {list(undefined, subgrid("1 / -1", `${listTop - top + 1} / -1`, true), listTop - 1, box.col - 1, groupLabel)}
          </div>
        );
      })}
    </div>
  );
}

/** Cabecera de grupo: "ABIERTOS 146 · 36,2 %" (clic filtra el grupo) o "SIN CLASIFICAR" (su tile ya dice cuánto). */
function GroupHead({ group, compact, ...shared }: Shared & { group: PartGroup; compact?: boolean }) {
  const labels = group.parts.flatMap((p) => (p.filterable ? p.labels : []));
  const on = labels.length > 0 && labels.every((l) => shared.sel.selected.includes(l));
  const head = cn("flex shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11.5px]", compact ? "h-6" : "h-7");
  const style: CSSProperties = { gridColumn: "1 / -1", gridRow: 1 };
  if (group.neutral) {
    return (
      <p className={head} style={style}>
        <span className="font-semibold uppercase tracking-[0.08em] text-muted">{group.label}</span>
      </p>
    );
  }
  return (
    <button
      type="button"
      disabled={!shared.sel.canFilter || !labels.length}
      aria-pressed={shared.sel.canFilter ? on : undefined}
      title={shared.sel.canFilter ? "Clic para filtrar el grupo" : undefined}
      onClick={() => shared.sel.toggleMany(labels)}
      className={cn("-mx-1 min-w-0 self-center justify-self-start rounded-md px-1 transition enabled:hover:bg-surface-3", head, on && "bg-primary-soft")}
      style={style}
    >
      <span className="font-semibold uppercase tracking-[0.08em] text-muted">{group.label}</span>
      <span className="tabular font-semibold text-text-2">{formatValue(group.value, shared.fmt)}</span>
      <span className="tabular text-muted">· {formatPct(group.share)}</span>
    </button>
  );
}

function tileBase(p: Part, interactive: boolean, on: boolean, shared: Shared) {
  const zero = p.value === 0;
  const critical = p.tone === "critical" && !zero;
  const dim = emphasis(p.key, shared.hover.hovered, on, shared.sel.any);
  return cn(
    "relative w-full min-w-0 rounded-xl text-left transition",
    critical ? "bg-critical-soft" : "bg-surface-2",
    interactive ? "cursor-pointer hover:ring-1 hover:ring-inset hover:ring-border" : "cursor-default",
    on && "ring-2 ring-inset ring-primary hover:ring-2 hover:ring-primary",
    // Estado declarado sin casos: atenuado (la atenuación por hover o selección manda si existe)
    dim || (zero && "opacity-60"),
  );
}

function TileMark({ p }: { p: Part }) {
  return p.tone ? <StatusIcon tone={p.tone} className="size-4" /> : <Swatch color={p.color} />;
}

function TileName({ p, clamp }: { p: Part; clamp?: boolean }) {
  return (
    <span className={cn("block min-w-0 flex-1 hyphens-auto break-words text-[12.5px] leading-tight text-text-2", clamp && "line-clamp-2")}>
      {p.code && <span className="mr-1 font-mono text-[10.5px] text-muted">{p.code}</span>}
      {p.display}
    </span>
  );
}

function TilePct({ p, on }: { p: Part; on: boolean }) {
  return (
    <span className="tabular inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted">
      {formatPct(p.share)}
      {on && <Check className="size-3 text-primary-text" aria-hidden />}
    </span>
  );
}

/**
 * Tile horizontal (subgrid de 4 filas: etiqueta · cifra y % · relleno · barra). Cifra de 24 px/700 y % juntos
 * arriba; si en algún tile de la tira el % no cabe al lado, va debajo en todos (misma línea base).
 */
function HTile({ p, pctBelow, ...shared }: Shared & { p: Part; pctBelow: boolean }) {
  const { interactive, props } = handlers(p, shared);
  const on = shared.sel.isOn(p);
  const edge = p.tone ? TONE_VARS[p.tone].solid : p.color;
  return (
    <button
      {...props}
      aria-label={ariaFor(p, shared.fmt)}
      className={cn(tileBase(p, interactive, on, shared), "grid border-t-[3px] px-3 pb-2.5 pt-2")}
      style={{ gridRow: "1 / span 4", gridTemplateRows: "subgrid", borderTopColor: edge }}
    >
      <span className="flex min-w-0 items-start gap-1.5 pb-1.5">
        <span className="mt-px shrink-0">
          <TileMark p={p} />
        </span>
        <TileName p={p} clamp />
      </span>
      <span className={cn("flex min-w-0 pb-1.5", pctBelow ? "flex-col items-start gap-0.5" : "flex-nowrap items-baseline gap-x-1.5")}>
        <span className={cn("tabular text-2xl font-bold leading-none tracking-tight", p.value === 0 ? "text-muted" : "text-text")}>{formatValue(p.value, shared.fmt)}</span>
        <TilePct p={p} on={on} />
      </span>
      <span aria-hidden className="block h-1 w-full self-end overflow-hidden rounded-full bg-surface-3" style={{ gridRow: 4 }}>
        <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${p.share * 100}%`, background: edge }} />
      </span>
    </button>
  );
}

/** Tile vertical (fila de ≥ 56 px): etiqueta a la izquierda, cifra y % a la derecha. */
function VerticalTile({ p, ...shared }: Shared & { p: Part }) {
  const { interactive, props } = handlers(p, shared);
  const on = shared.sel.isOn(p);
  const edge = p.tone ? TONE_VARS[p.tone].solid : p.color;
  return (
    <button
      {...props}
      aria-label={ariaFor(p, shared.fmt)}
      className={cn(tileBase(p, interactive, on, shared), "flex h-full items-center gap-2.5 border-l-[3px] py-2 pl-3 pr-3")}
      style={{ borderLeftColor: edge }}
    >
      <span className="shrink-0">
        <TileMark p={p} />
      </span>
      <TileName p={p} />
      <span className="flex shrink-0 flex-col items-end">
        <span className={cn("tabular text-xl font-bold leading-tight tracking-tight", p.value === 0 ? "text-muted" : "text-text")}>{formatValue(p.value, shared.fmt)}</span>
        <TilePct p={p} on={on} />
      </span>
    </button>
  );
}

// ─── Variante rows (lista compacta agrupada) ─────────────────────────────────

/**
 * Cuando los tiles no caben en el alto medido (tablet 3 | 3, tarjetas S angostas): una fila de 26 px por
 * estado, con la cabecera de cada grupo y el neutral tras un separador discontinuo. Scroll con desvanecido
 * solo como red de seguridad.
 */
function StatusRows({ groups, headed, title, ...shared }: Shared & { groups: PartGroup[]; headed: boolean; title: string }) {
  const { ref: scrollRef, fade } = useScrollFade<HTMLDivElement>();
  return (
    <div ref={scrollRef} className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", fade && FADE_MASK)}>
      <div className="flex flex-col">
        {groups.map((g) => {
          const label = g.key === "__none" && !headed ? title : g.label;
          return (
            <div key={g.key} role="group" aria-label={label} className={cn("flex flex-col", g.neutral && "mt-1 border-t border-dashed border-border pt-1")}>
              {headed && !g.neutral && (
                <div className="grid">
                  <GroupHead group={g} compact {...shared} />
                </div>
              )}
              <ul role="list" aria-label={label} className="flex flex-col">
                {g.parts.map((p) => (
                  <li key={p.key}>
                    <StatusRow p={p} {...shared} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusRow({ p, ...shared }: Shared & { p: Part }) {
  const { interactive, props } = handlers(p, shared);
  const on = shared.sel.isOn(p);
  const zero = p.value === 0;
  const critical = p.tone === "critical" && !zero;
  return (
    <button
      {...props}
      aria-label={ariaFor(p, shared.fmt)}
      className={cn(
        "grid min-h-[26px] w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 rounded-lg px-1.5 text-left transition",
        critical && "bg-critical-soft",
        interactive ? "cursor-pointer hover:bg-surface-3" : "cursor-default",
        on && "bg-primary-soft ring-1 ring-inset ring-primary/40",
        emphasis(p.key, shared.hover.hovered, on, shared.sel.any) || (zero && "opacity-60"),
      )}
    >
      {p.tone ? <StatusIcon tone={p.tone} /> : <Swatch color={p.color} />}
      <span className="min-w-0 hyphens-auto break-words py-0.5 text-[12.5px] leading-tight text-text-2">
        {p.code && <span className="mr-1 font-mono text-[10.5px] text-muted">{p.code}</span>}
        {p.display}
      </span>
      <span className={cn("tabular text-[13px] font-semibold", zero ? "text-muted" : "text-text")}>{formatValue(p.value, shared.fmt)}</span>
      <span className="tabular inline-flex w-12 items-center justify-end gap-0.5 text-xs text-muted">
        {on && <Check className="size-3 text-primary-text" aria-hidden />}
        {formatPct(p.share)}
      </span>
    </button>
  );
}

// ─── Variante lista ──────────────────────────────────────────────────────────

/** Cabecera neutral (32) + separación (8) + fila de 28 por estado; la nota "Con dato" suma 24. */
const LIST_HEAD = 40;
const LIST_ROW = 30;
const LIST_NOTE = 24;

function StatusList({ parts, family, title, avail, ...shared }: Shared & { parts: Part[]; family?: SemanticFamily; title: string; avail: number }) {
  const neutral = parts.filter((p) => p.neutral);
  const real = parts.filter((p) => !p.neutral);
  const max = Math.max(1, ...real.map((p) => p.value));
  const realTotal = real.reduce((s, p) => s + p.value, 0);
  const context = family ? NEUTRAL_CONTEXT[family] : undefined;
  const { ref: scrollRef, fade } = useScrollFade<HTMLDivElement>();
  const noteText = `Con dato: ${formatValue(realTotal, shared.fmt)} · barras relativas a este grupo`;
  // La nota solo si cabe (en móvil, siempre); si no, va en la etiqueta accesible y en el title de la lista
  const showNote = neutral.length > 0 && real.length > 0 && (avail <= 0 || avail >= (neutral.length ? LIST_HEAD : 0) + LIST_NOTE + real.length * LIST_ROW);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {neutral.map((p) => {
        const { interactive, props } = handlers(p, shared);
        const on = shared.sel.isOn(p);
        return (
          <button
            key={p.key}
            {...props}
            aria-label={`${ariaFor(p, shared.fmt)}${context ? ` (${context})` : ""}, fuera de escala`}
            title={context ? `${p.display} (${context})` : undefined}
            className={cn(
              "flex min-h-8 w-full shrink-0 flex-nowrap items-center gap-2 rounded-xl border border-dashed border-border bg-surface-2 px-3 py-1 text-left transition",
              interactive ? "cursor-pointer hover:bg-surface-3" : "cursor-default",
              on && "border-solid border-primary bg-primary-soft",
              emphasis(p.key, shared.hover.hovered, on, shared.sel.any),
            )}
          >
            <StatusIcon tone="neutral" className="size-4" />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-2">{p.display}</span>
            <span className="tabular shrink-0 whitespace-nowrap text-[12.5px]">
              <span className="font-semibold text-text">{formatValue(p.value, shared.fmt)}</span>
              <span className="text-muted"> · {formatPct(p.share)}</span>
            </span>
          </button>
        );
      })}
      {showNote && <p className="tabular shrink-0 px-1 text-[11px] text-muted">{noteText}</p>}
      <div ref={scrollRef} className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", fade && FADE_MASK)}>
        <ul role="list" aria-label={neutral.length && !showNote ? `${title}. ${noteText}` : title} title={neutral.length && !showNote ? noteText : undefined} className="flex flex-col">
          {real.map((p) => {
            const { interactive, props } = handlers(p, shared);
            const on = shared.sel.isOn(p);
            return (
              <li key={p.key}>
                <button
                  {...props}
                  aria-label={ariaFor(p, shared.fmt)}
                  className={cn(
                    "grid min-h-7 w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 rounded-lg px-1.5 py-0.5 text-left transition",
                    interactive ? "cursor-pointer hover:bg-surface-3" : "cursor-default",
                    on && "bg-primary-soft ring-1 ring-inset ring-primary/40",
                    emphasis(p.key, shared.hover.hovered, on, shared.sel.any),
                  )}
                >
                  {p.tone ? <StatusIcon tone={p.tone} /> : <Swatch color={p.color} />}
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="hyphens-auto break-words text-[12px] leading-[15px] text-text-2">
                      {p.code && <span className="mr-1 font-mono text-[10.5px] text-muted">{p.code}</span>}
                      {p.display}
                    </span>
                    <span aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
                      <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${(p.value / max) * 100}%`, background: p.color }} />
                    </span>
                  </span>
                  <span className="tabular text-[13px] font-semibold text-text">{formatValue(p.value, shared.fmt)}</span>
                  <span className="tabular w-11 text-right text-xs text-muted">{formatPct(p.share)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
