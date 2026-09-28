"use client";

import { motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import type { BarTableResult, CategoryResult, KpiResult } from "@/dashboards/dto";
import type { BarTableWidget, BarWidget, DashboardSpec, SemanticFamily, StatusTone, ValueFormat, VizOptions } from "@/dashboards/types";
import { innerWidth } from "@/dashboards/layout";
import { cn } from "@/lib/cn";
import { isNeutral, resolveStatus, TONE_VARS } from "@/lib/charts/semantic";
import { formatInt, formatPct, formatValue } from "@/lib/format";
import { displayLabel, type LabelKind } from "@/lib/labels";
import { useWidgetFrame } from "./frame-context";
import { Swatch } from "./kit/chart-legend";
import { LegendSlot } from "./kit/legend-slot";
import { QualityChip } from "./kit/quality";
import { StatusIcon, TONE_ICON } from "./kit/status-icon";
import {
  COL_GAP,
  columnRowWidth,
  FOOTER_H,
  gridColumns,
  gridLayout,
  isOthers,
  kindNoun,
  lineCount,
  type ListGrid,
  ListFooter,
  listColumns,
  monoWidth,
  MoreButton,
  numWidth,
  othersLabel,
  pickGrid,
  rowStateClass,
  SearchListDialog,
  stretchRows,
  textWidth,
  useFitBox,
} from "./list-kit";
import type { VizProps } from "./types";

/**
 * RankingList (docs/ui-design-system.md § RankingList): nominales largas en HTML.
 * - Fila de 40 px (rango · etiqueta · id secundario · valor · %) + pista de 6 px; 2 líneas (56) o compacta (32).
 * - 1/2/3 columnas con numeración continua y escala común: la MENOR cantidad de columnas en la que
 *   caben las filas (tope por ancho); las filas se alinean entre columnas y reparten el alto sobrante.
 * - Neutrales tras una hairline, sin rango y fuera del máximo; "Otros" → "Otras N categorías"
 *   (si la capacidad oculta filas con nombre, se suman a "Otras" y su "Ver N más" va EN esa fila:
 *   el enlace nunca queda después de un agregado que no lo contiene).
 * - Identificador secundario (NIT) en línea; si en varias columnas partiría filas (alto dispar),
 *   se omite en la fila y queda en el tooltip, el aria-label y el diálogo. En la anatomía apilada
 *   (móvil) va en su propio renglón: todas las filas tienen la misma forma (nombre / NIT / barra).
 * - Varias columnas: oficinas con su forma corta ("Ger. …", nombre completo en el tooltip). Si aun así
 *   una etiqueta se parte, se prueba la anatomía apilada (filas uniformes, alineadas entre columnas);
 *   si queda alguna fila más alta, cada columna fluye con sus propios altos (sin huecos por la vecina).
 *   La compacta solo suma columnas si ninguna etiqueta se parte.
 * - Pie "Top 15 de 42 · 91 % del total"; "Ver N más" (scroll interno o Dialog con búsqueda si > 30).
 * - Cabecera de concentración, fila fijada (tono de la familia del filtro) y bullet secundario (vizOptions).
 */

const EASE = [0.22, 1, 0.36, 1] as const;
const RANK_W = 20;
const GAP = 8;
const HAIRLINE_BLOCK = 9;
const CONCENTRATION_H = 40;
const PINNED_H = 48;
const BULLET_HEAD_H = 22;
/** Pista del bullet secundario (72–96 px) y separación con su valor. */
const BULLET_TRACK = 80;
const BULLET_GAP = 4;
/** Por debajo de este ancho de cuerpo (móvil) la etiqueta va en su propia línea: nunca se recorta. */
const STACK_BELOW = 400;
/** Ancho mínimo de etiqueta para sumar una columna (con menos, las etiquetas se parten en 3+ líneas). */
const MIN_LABEL = 160;
const MIN_LABEL_COMPACT = 140;
/** Alto extra máximo por fila al repartir el sobrante (40 → 64, compacta 32 → 44): pocas filas llenan el cuerpo sin banda muerta. */
const STRETCH: Record<Mode, number> = { regular: 24, stacked: 12, compact: 12 };
/** Más ítems que esto: "Ver los N" abre un Dialog con búsqueda. */
const DIALOG_MIN = 30;

type Mode = "regular" | "stacked" | "compact";

interface Item {
  /** Clave única (varias columnas de una bartable pueden repetir la primera celda). */
  key: string;
  raw: string;
  label: string;
  full: string;
  /** Forma corta para contextos compactos (varias columnas): "Ger. Sucursal …" en oficinas. */
  short: string;
  secondary?: string;
  value: number;
  bullet: number | null;
  neutral: boolean;
  others: boolean;
  filterable: boolean;
  color: string;
  /** Tono de estado (familia semántica explícita): se muestra con ícono junto a la etiqueta. */
  tone?: StatusTone;
  /** Detalle para el tooltip nativo (p. ej. miembros de "Otras N"). */
  note?: string;
}

interface BulletSpec {
  lo: number;
  hi: number;
  ref: number | null;
  format: ValueFormat;
  label: string;
  color: string;
  tone: StatusTone | null;
  valueW: number;
  width: number;
}

interface Plan {
  cols: number;
  mode: Mode;
  barW: number;
  dropPct: boolean;
  /** Identificador secundario en línea (false: solo en tooltip, aria-label y diálogo). */
  secondary: boolean;
  /** Etiquetas en su forma corta (varias columnas). */
  short: boolean;
  /**
   * "aligned": filas de la grilla compartidas entre columnas (barras a la misma altura; solo con altos
   * uniformes). "free": cada columna fluye con sus propios altos (sin huecos frente a una fila partida).
   */
  flow: "aligned" | "free";
  heights: number[];
  neutralHeights: number[];
  /** Altos de los neutrales cuando hay filas ocultas ("Otras N" con "Ver N más" en línea). */
  neutralHeightsHidden: number[];
}

function detectKind(labels: string[], declared?: LabelKind): LabelKind {
  if (declared) return declared;
  return labels.some((l) => /^\[\s*[\d.\-]+\s*\]/.test(l)) ? "proveedor" : "generic";
}

function buildItems(
  entries: { key: string; raw: string; label?: string; value: number; bullet: number | null }[],
  kind: LabelKind,
  folded: number,
  semantic: SemanticFamily | undefined,
  overrides: VizOptions["overrides"],
  crossFilter: boolean,
): Item[] {
  return entries.map(({ key, raw, label, value, bullet }) => {
    if (isOthers(raw)) {
      const text = othersLabel(kind, folded);
      return { key, raw, label: text, full: text, short: text, value, bullet, neutral: true, others: true, filterable: false, color: "var(--neutral-mark)" };
    }
    const neutral = isNeutral(raw);
    const ov = overrides?.[raw]?.label;
    const d = displayLabel(label ?? raw, kind);
    const status = semantic && !neutral ? resolveStatus(raw, semantic, overrides) : null;
    const color = neutral ? "var(--neutral-mark)" : (status?.color ?? "var(--chart-1)");
    return {
      key,
      raw,
      label: ov ?? d.full,
      full: ov ?? d.full,
      short: ov ?? (neutral ? d.full : d.short),
      secondary: ov ? undefined : d.secondary,
      value,
      bullet,
      neutral,
      others: false,
      filterable: crossFilter,
      color,
      tone: status?.tone ?? undefined,
    };
  });
}

/**
 * Combinaciones fuera del topN de una bartable ("Top 60 de 218"). El motor las informa en
 * `restCount` (opcional en el contrato): sin el dato, el pie queda como "Top 60 · 56 % del total".
 */
function barTableRest(r: BarTableResult): number {
  if (!("restCount" in r)) return 0;
  const n = r.restCount;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

/** Familia semántica declarada para un campo (columna de la tabla o widget que lo grafica). */
function familyOf(spec: DashboardSpec, field: string): SemanticFamily | undefined {
  const col = spec.table.columns.find((c) => c.field === field && c.semantic);
  if (col?.semantic) return col.semantic;
  for (const s of spec.sections)
    for (const w of s.widgets) {
      if (!w.semantic) continue;
      if ("dimension" in w && w.dimension === field) return w.semantic;
      if (w.type === "bartable" && w.columns[0]?.field === field) return w.semantic;
    }
  return undefined;
}

/** Tono con el que la banda de KPIs pinta un KPI (grupo de proporción, tile de estado o acento). */
function kpiTone(spec: DashboardSpec, kpi: string): StatusTone | null {
  for (const row of spec.kpiLayout ?? [])
    for (const cell of row.cells) {
      if (cell.kind === "group") {
        const i = cell.kpis.indexOf(kpi);
        if (i >= 0 && cell.tones?.[i]) return cell.tones[i];
        if (cell.accents?.[kpi]) return cell.accents[kpi];
      }
      if (cell.kind === "tile" && cell.kpi === kpi && cell.tone) return cell.tone;
    }
  return null;
}

// ─── Fila ────────────────────────────────────────────────────────────────────

interface RowProps {
  item: Item;
  rank: number | null;
  mode: Mode;
  height?: number;
  max: number;
  total: number;
  format: ValueFormat;
  showPct: boolean;
  valueW: number;
  pctW: number;
  barW: number;
  twoLine: boolean;
  bullet: BulletSpec | null;
  selected: boolean;
  dimmed: boolean;
  onToggle?: () => void;
  delay: number;
  /** Sin el identificador secundario en la fila (queda en tooltip y aria-label). */
  hideSecondary?: boolean;
  /** Alineación vertical dentro de la fila de la grilla: "end" alinea las barras entre columnas. */
  align?: "center" | "end";
  /** Con align "end": alto extra repartido que va bajo el contenido (la mitad del sobrante, como al centrar). */
  endInset?: number;
  /** Acción en línea tras la etiqueta (p. ej. "Ver N más" en "Otras N"). */
  action?: ReactNode;
  /** Etiqueta en su forma corta (el nombre completo queda en el tooltip y el aria-label). */
  useShort?: boolean;
  /** % del total fuera de la fila (p. ej. con bullet secundario): solo en el tooltip y el aria-label. */
  shareInTip?: boolean;
  /**
   * Flujo libre: alto repartido como relleno arriba y abajo (px por lado) en lugar de un alto mínimo
   * estimado; la fila mide su contenido real (una estimación al límite no deja aire suelto).
   */
  padY?: number;
}

/**
 * Bullet secundario como punto sobre una pista con dominio ajustado a los datos (p. ej. 70–100 %):
 * un punto no codifica longitud, así que el dominio puede no empezar en 0 sin engañar. La marca
 * vertical es el valor global del KPI; el valor va fuera de la pista, a 4 px.
 */
function Bullet({ value, spec }: { value: number | null; spec: BulletSpec }) {
  const span = spec.hi - spec.lo || 1;
  const at = (v: number) => BULLET_GAP + Math.max(0, Math.min(1, (v - spec.lo) / span)) * (BULLET_TRACK - 2 * BULLET_GAP);
  return (
    <span className="flex shrink-0 items-center" style={{ width: spec.width, gap: BULLET_GAP }}>
      <span className="relative h-2.5 shrink-0" style={{ width: BULLET_TRACK }} aria-hidden>
        <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-3" />
        {value !== null && <span className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: at(value), background: spec.color }} />}
        {spec.ref !== null && <span className="absolute top-0 h-2.5 w-0.5 -translate-x-1/2 rounded-full bg-text" style={{ left: at(spec.ref) }} />}
      </span>
      <span className="tabular whitespace-nowrap text-right text-xs leading-[18px] text-text-2" style={{ width: spec.valueW }}>
        {formatValue(value, spec.format)}
      </span>
    </span>
  );
}

function RankRow({
  item,
  rank,
  mode,
  height,
  max,
  total,
  format,
  showPct,
  valueW,
  pctW,
  barW,
  twoLine,
  bullet,
  selected,
  dimmed,
  onToggle,
  delay,
  hideSecondary,
  align = "center",
  endInset = 0,
  action,
  useShort,
  shareInTip,
  padY = 0,
}: RowProps) {
  const frac = item.neutral || !max ? 0 : Math.max(0, Math.min(1, item.value / max));
  const value = formatValue(item.value, format);
  const pct = total ? formatPct(item.value / total) : "";
  const text = useShort ? item.short : item.label;
  const Tag = onToggle ? "button" : "div";
  const aria = `${rank ? `${rank}. ` : ""}${item.full}${item.secondary ? ` (${item.secondary})` : ""}: ${value}${(showPct || shareInTip) && pct ? `, ${pct} del total` : ""}${
    bullet && !item.neutral ? `; ${bullet.label}: ${formatValue(item.bullet, bullet.format)}${bullet.ref !== null ? ` (global ${formatValue(bullet.ref, bullet.format)})` : ""}` : ""
  }${item.note ? `. ${item.note}` : ""}`;
  const rankCell = item.neutral ? (
    <span className="flex h-[18px] items-center justify-end pr-0.5">
      <Swatch color="var(--neutral-mark)" />
    </span>
  ) : (
    <span className="tabular text-right text-[11px] leading-[18px] text-muted">{rank}</span>
  );
  // Apilada: el NIT en su propio renglón (18 px), así todas las filas tienen la misma anatomía
  const idBlock = mode === "stacked" && !item.neutral;
  const labelCell = (
    <span className={cn("min-w-0 text-[13px] font-medium leading-[18px] [overflow-wrap:anywhere]", item.neutral ? "text-text-2" : "text-text", twoLine && mode === "regular" && !item.neutral && "self-end")}>
      {item.tone && <StatusIcon tone={item.tone} className="mr-1.5 inline-block align-[-2px]" />}
      {text}
      {item.secondary &&
        !hideSecondary &&
        (idBlock ? (
          <span className="mt-0.5 block whitespace-nowrap font-mono text-[11px] font-normal leading-4 text-muted">{item.secondary}</span>
        ) : (
          <>
            {" "}
            <span className="whitespace-nowrap font-mono text-[11px] font-normal leading-none text-muted">{item.secondary}</span>
          </>
        ))}
      {action && (
        <>
          {" "}
          {action}
        </>
      )}
    </span>
  );
  // Cifras en una línea de 18 px exactos: alinear por la base 13 px y 12 px (o el NIT mono en la etiqueta)
  // agranda la línea 1–2 px y descuadra la grilla alineada, que se calcula con 18 px por línea.
  const numbers = (
    <span className={cn("flex h-[18px] shrink-0 items-baseline gap-2 leading-[18px]", twoLine && mode === "regular" && !item.neutral && "self-end")}>
      {bullet && !item.neutral && <Bullet value={item.bullet} spec={bullet} />}
      {bullet && item.neutral && <span style={{ width: bullet.width }} aria-hidden />}
      <span className="tabular text-right text-[13px] font-semibold text-text" style={{ minWidth: valueW }}>
        {value}
      </span>
      {showPct && (
        <span className="tabular text-right text-xs leading-[18px] text-muted" style={{ minWidth: pctW }}>
          {pct}
        </span>
      )}
    </span>
  );
  const track = (
    <span className="relative block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
      <motion.span
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.5, ease: EASE, delay }}
        className="absolute inset-y-0 left-0 origin-left rounded-full transition-[width] duration-500"
        style={{ width: `${frac * 100}%`, background: item.color }}
      />
    </span>
  );

  const base = cn(
    "w-full rounded-lg px-2 text-left transition",
    onToggle && !selected && "hover:bg-surface-3",
    onToggle && "cursor-pointer focus-visible:outline-offset-[-2px]",
    rowStateClass(selected, dimmed),
  );
  // Tooltip: lo que la fila no muestra (nombre completo, NIT omitido, % del total fuera de la fila)
  const tip = [text !== item.full ? item.full : null, hideSecondary && item.secondary ? item.secondary : null, shareInTip && pct ? `${pct} del total` : null]
    .filter(Boolean)
    .join(" · ");
  // Al pie de la fila, pero con la mitad del alto repartido debajo: barras alineadas entre columnas
  // y el sobrante partido arriba y abajo, como en una columna centrada.
  const pad = item.neutral || mode === "compact" ? 7 : 5;
  const inset =
    align === "end" && endInset > 0
      ? { paddingBottom: pad + endInset }
      : padY > 0
        ? { paddingTop: pad + Math.floor(padY), paddingBottom: pad + Math.ceil(padY) }
        : null;
  const common = {
    style: height || inset ? { ...(height ? { minHeight: height } : null), ...inset } : undefined,
    ...(onToggle
      ? { type: "button" as const, onClick: onToggle, "aria-pressed": selected, "aria-label": `${aria}. Clic para filtrar`, title: tip ? `${tip} · Clic para filtrar` : "Clic para filtrar" }
      : { "aria-label": aria, role: "group", title: item.note ?? (tip || undefined) }),
  };
  const vAlign = align === "end" ? "content-end" : "content-center";

  if (item.neutral) {
    return (
      <li>
        <Tag {...common} className={cn(base, "grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-x-2 py-[7px]", vAlign)}>
          {rankCell}
          {labelCell}
          {numbers}
        </Tag>
      </li>
    );
  }
  if (mode === "stacked") {
    return (
      <li>
        <Tag {...common} className={cn(base, "grid grid-cols-[20px_minmax(0,1fr)] gap-x-2 py-[5px]", vAlign)}>
          {rankCell}
          {labelCell}
          <span className="col-start-2 mt-1 flex items-center gap-2">
            {track}
            {numbers}
          </span>
        </Tag>
      </li>
    );
  }
  if (mode === "compact") {
    return (
      <li>
        <Tag {...common} className={cn(base, "grid items-center gap-x-2 py-[7px]", align === "end" && "content-end")} style={{ ...common.style, gridTemplateColumns: `20px minmax(0,1fr) ${barW}px auto` }}>
          {rankCell}
          {labelCell}
          {track}
          {numbers}
        </Tag>
      </li>
    );
  }
  return (
    <li>
      <Tag
        {...common}
        className={cn(base, "grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-x-2 py-[5px]", vAlign, twoLine && "grid-rows-[minmax(36px,auto)_auto]")}
      >
        {twoLine ? <span className="self-end">{rankCell}</span> : rankCell}
        {labelCell}
        {numbers}
        <span className="col-start-2 col-end-4 mt-[5px] flex">{track}</span>
      </Tag>
    </li>
  );
}

// ─── Encabezados ─────────────────────────────────────────────────────────────

/**
 * Segundo tramo de la barra de concentración: el primario aclarado hacia blanco en ambos temas. En claro
 * coincide con la mezcla con la superficie; en oscuro, mezclar con la superficie daba 1,7:1 frente a la
 * pista (#704210 sobre #242A34) y la marca desaparecía.
 */
const CONCENTRATION_2ND = "color-mix(in srgb, var(--chart-1) 50%, white)";

function Concentration({ items, total, kind, narrow }: { items: Item[]; total: number; kind: LabelKind; narrow: boolean }) {
  const [a, b] = items;
  if (!a || !total) return null;
  const s1 = a.value / total;
  const s2 = b ? b.value / total : 0;
  const n = b ? 2 : 1;
  const rest = Math.max(0, 1 - s1 - s2);
  const restLabel = <span className="tabular shrink-0 whitespace-nowrap text-xs leading-[18px] text-muted">Resto {formatPct(rest)}</span>;
  const bar = (
    <div className={cn("flex h-2 gap-[2px] overflow-hidden rounded-full", narrow && "min-w-0 flex-1")} role="img" aria-label={`${a.full} ${formatPct(s1)}${b ? ` · ${b.full} ${formatPct(s2)}` : ""} · resto ${formatPct(rest)}`}>
      <span title={`${a.full}: ${formatPct(s1)}`} className="h-full" style={{ flex: `${s1} 1 0px`, background: "var(--chart-1)" }} />
      {b && <span title={`${b.full}: ${formatPct(s2)}`} className="h-full" style={{ flex: `${s2} 1 0px`, background: CONCENTRATION_2ND }} />}
      {rest > 0 && <span title={`Resto: ${formatPct(rest)}`} className="h-full bg-surface-3" style={{ flex: `${rest} 1 0px` }} />}
    </div>
  );
  return (
    <div className="mb-2 shrink-0" style={{ minHeight: CONCENTRATION_H - 8 }}>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs leading-[18px] text-text-2">
        <span>
          <strong className="font-semibold text-text">
            {n === 1 ? `1 ${kindNoun(kind, 1)} concentra` : `${n} ${kindNoun(kind, 2)} concentran`}
          </strong>{" "}
          el <strong className="tabular font-semibold text-text">{formatPct(s1 + s2)}</strong> del total
        </span>
        {!narrow && restLabel}
      </p>
      {narrow ? (
        // Angosto: "Resto X %" al final de la barra (junto a su tramo gris), en la misma línea
        <div className="mt-1 flex items-center gap-2">
          {bar}
          {restLabel}
        </div>
      ) : (
        <div className="mt-1.5">{bar}</div>
      )}
    </div>
  );
}

/** Fila fijada (44 px) en el tono de su hecho: el mismo que usan la banda de KPIs y el panel vecino. */
function PinnedRow({
  item,
  total,
  format,
  tone,
  cta,
  onCta,
  selected,
}: {
  item: Item;
  total: number;
  format: ValueFormat;
  tone: StatusTone;
  cta?: string;
  onCta?: () => void;
  selected: boolean;
}) {
  const Icon = TONE_ICON[tone];
  const t = TONE_VARS[tone];
  return (
    <div className="mb-1 flex min-h-11 shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl px-3 py-1.5" style={{ background: t.soft }}>
      <Icon className="size-4 shrink-0" style={{ color: t.ink }} strokeWidth={2.25} aria-hidden />
      <p className="min-w-[11rem] flex-1 text-[13px] leading-[18px] text-text">
        <span className="font-semibold">{item.full}</span>
        <span className="tabular text-text-2">
          {" · "}
          {formatValue(item.value, format)}
          {total ? ` · ${formatPct(item.value / total)}` : ""}
        </span>
      </p>
      {onCta && (
        <button
          type="button"
          onClick={onCta}
          aria-pressed={selected}
          className={cn("shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ring-current transition hover:bg-surface/60", selected && "bg-surface")}
          style={{ color: t.ink }}
        >
          {cta ?? "Filtrar"}
        </button>
      )}
    </div>
  );
}

function BulletLegend({ spec }: { spec: BulletSpec }) {
  const pct = spec.format === "pct";
  const zoomed = spec.lo > 0 || (pct && spec.hi < 1);
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-2">
      <span className="inline-flex items-center gap-1.5">
        {spec.tone ? <StatusIcon tone={spec.tone} className="size-3" /> : <Swatch shape="dot" color={spec.color} />}
        {spec.label}
      </span>
      {spec.ref !== null && (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-0.5 rounded-full bg-text" aria-hidden />
          Global <span className="tabular font-semibold text-text">{formatValue(spec.ref, spec.format)}</span>
        </span>
      )}
      {zoomed && (
        <span className="tabular text-muted">
          Escala {pct ? `${Math.round(spec.lo * 100)}–${formatPct(spec.hi, 0)}` : `${formatValue(spec.lo, spec.format)}–${formatValue(spec.hi, spec.format)}`}
        </span>
      )}
    </span>
  );
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function RankingList({ widget, result, height, span, expanded }: VizProps<BarWidget | BarTableWidget, CategoryResult | BarTableResult>) {
  const { filters, toggleValue, data, spec } = useDashboard();
  const frame = useWidgetFrame();
  const { ref, width: mw, height: mh, measured } = useFitBox<HTMLDivElement>();
  const [showAll, setShowAll] = useState(false);
  /** Diálogo con búsqueda: null cerrado; modo de fila según el ancho de la ventana al abrir. */
  const [dialog, setDialog] = useState<Mode | null>(null);
  const vo = widget.vizOptions ?? {};
  const isBar = widget.type === "bar";
  const dimension = isBar ? widget.dimension : (widget.columns[0]?.field ?? "");
  const crossFilter = !(isBar && widget.noCrossFilter) && Boolean(dimension);
  const format: ValueFormat = widget.valueFormat ?? "int";
  const measure = widget.measure;
  const additive = !measure || measure.kind === "count" || measure.kind === "sum";
  const selected = useMemo(() => filters.eq[dimension] ?? [], [filters.eq, dimension]);

  // Ítems normalizados (CategoryResult o BarTableResult de una columna)
  const { items, kind, total, folded, othersFolded, restCount, secondaryFmt } = useMemo(() => {
    if (result.kind === "bartable") {
      const entries = result.rows.map((r) => ({ key: r.cells.join("\u0001"), raw: r.cells[0] ?? "", label: r.cells.join(" · "), value: r.value, bullet: null }));
      const k = detectKind(entries.map((e) => e.raw), widget.labelKind);
      return {
        items: buildItems(entries, k, 0, widget.semantic, vo.overrides, crossFilter),
        kind: k,
        total: result.total,
        folded: 0,
        othersFolded: 0,
        restCount: barTableRest(result),
        secondaryFmt: null,
      };
    }
    const entries = result.labels.map((raw, i) => ({ key: raw, raw, value: result.values[i] ?? 0, bullet: result.secondary?.[i] ?? null }));
    const k = detectKind(result.labels, widget.labelKind);
    const hasOthers = result.labels.some(isOthers);
    const fmt = isBar && widget.secondary ? widget.secondary : null;
    return {
      items: buildItems(entries, k, result.folded ?? 0, widget.semantic, vo.overrides, crossFilter),
      kind: k,
      total: result.total,
      folded: hasOthers ? 0 : (result.rest?.count ?? result.folded ?? 0),
      othersFolded: hasOthers ? (result.folded ?? 0) : 0,
      restCount: result.rest?.count ?? 0,
      secondaryFmt: fmt,
    };
  }, [result, widget, vo.overrides, crossFilter, isBar]);

  // Fila fijada, reales y neutrales
  const pinned = vo.pinned ? items.find((i) => i.raw === vo.pinned!.label || i.full === vo.pinned!.label) : undefined;
  const real = useMemo(() => items.filter((i) => !i.neutral && i !== pinned), [items, pinned]);
  const neutrals = useMemo(() => items.filter((i) => i.neutral && i !== pinned), [items, pinned]);
  const max = real.reduce((m, i) => Math.max(m, i.value), 0);
  const showPct = additive && total > 0;

  // Tono de la fila fijada: explícito, o el del valor que filtra su CTA en la familia de su campo
  // (factura/INCONSISTENTE → critical, como el tile de la banda y el panel vecino); si no, warning.
  const pinnedTone = useMemo<StatusTone>(() => {
    const explicit = vo.pinned?.tone;
    if (explicit) return explicit;
    const f = vo.pinned?.filter;
    const family = f ? familyOf(spec, f.field) : undefined;
    return (f && family ? resolveStatus(f.value, family)?.tone : null) ?? "warning";
  }, [vo.pinned, spec]);

  // Bullet secundario: punto con dominio ajustado a los datos y marca en el valor global de un KPI
  const kpi: KpiResult | undefined = vo.bulletKpi ? data?.kpis.find((k) => k.id === vo.bulletKpi) : undefined;
  const bullet = useMemo<BulletSpec | null>(() => {
    if (!vo.bulletKpi || !secondaryFmt || result.kind !== "category" || !result.secondary) return null;
    const vals = result.secondary.filter((v): v is number => v !== null && Number.isFinite(v));
    const ref = kpi?.value ?? null;
    const all = ref !== null ? [...vals, ref] : vals;
    let lo = 0;
    let hi = Math.max(0, ...all);
    if (secondaryFmt.format === "pct" && all.length) {
      // Pasos de 5 p.p. con 5 p.p. de margen: 78,1–100 % → escala 70–100 %
      lo = Math.max(0, Math.floor((Math.min(...all) - 0.05) * 20) / 20);
      hi = Math.min(1, Math.ceil((Math.max(...all) + 0.05) * 20) / 20);
      if (hi - lo < 0.1) hi = Math.min(1, lo + 0.1);
    }
    const tone = kpiTone(spec, vo.bulletKpi);
    const valueW = Math.max(numWidth(formatValue(0.999, secondaryFmt.format), 400, 12), ...vals.map((v) => numWidth(formatValue(v, secondaryFmt.format), 400, 12)));
    return {
      lo,
      hi,
      ref,
      format: secondaryFmt.format,
      label: secondaryFmt.label,
      tone,
      color: tone ? TONE_VARS[tone].solid : "var(--chart-2)",
      valueW,
      width: BULLET_TRACK + BULLET_GAP + valueW,
    };
  }, [vo.bulletKpi, secondaryFmt, result, kpi, spec]);

  // Calidad de dato ("No reporta" entre 15 y 85 %)
  const neutralSum = neutrals.filter((i) => !i.others).reduce((a, i) => a + i.value, 0);
  const chip = additive && neutralSum > 0 ? <QualityChip neutral={neutralSum} total={total} /> : null;
  const chipInFooter = Boolean(chip) && !frame?.chipsEl && !expanded;

  // Con bullet secundario, cada fila ya lleva un % (el del bullet): el % del total pasa al tooltip y al
  // aria-label para no poner dos porcentajes de distinto significado juntos y sin rótulo.
  const showPctRow = showPct && !bullet;

  // Alcance del pie: "Top 15 de 42 · 91 % del total" (categorías y bartable)
  const cats = items.filter((i) => !i.neutral).length;
  const shareShown = total ? items.filter((i) => !i.neutral).reduce((a, i) => a + i.value, 0) / total : 0;
  const outside = folded || restCount;
  const scope =
    outside > 0
      ? `Top ${formatInt(cats)} de ${formatInt(cats + outside)}${additive ? ` · ${formatPct(shareShown)} del total` : ""}`
      : result.kind === "bartable" && additive && shareShown < 0.999
        ? `Top ${formatInt(cats)} · ${formatPct(shareShown)} del total`
        : null;

  // ── Layout: un plan por cantidad de columnas (altos estimados con su ancho de columna) ─────
  const W = mw || innerWidth(span);
  const compact = Boolean(vo.compact);
  const twoLine = Boolean(vo.twoLine);
  const useDialog = items.length > DIALOG_MIN;
  /** Con fila "Otras N", su "Ver N más" va en línea en esa fila (no en el pie). */
  const inlineMore = neutrals.some((i) => i.others);
  const layout = useMemo(() => {
    const valueW = Math.max(0, ...items.map((i) => numWidth(formatValue(i.value, format), 600, 13)));
    const pctW = showPctRow ? Math.max(numWidth("0,0 %", 400, 12), ...items.map((i) => numWidth(formatPct(i.value / total), 400, 12))) : 0;
    const narrow = !compact && W < STACK_BELOW;
    const maxCols = narrow ? 1 : listColumns(W, compact, vo.columns);
    // "Otras N" con filas ocultas: etiqueta con la mayor N posible y el enlace en línea (cota)
    const hiddenOthers = othersLabel(kind, othersFolded + real.length);
    const moreW = inlineMore ? Math.max(textWidth(`Ver ${formatInt(real.length)} más`, 600, 12), textWidth(`Ver los ${formatInt(items.length)}`, 600, 12)) + 8 : 0;
    /** Planes para `c` columnas, en orden de preferencia ([] si la columna extra no deja espacio a la etiqueta). */
    const build = (c: number, secondary: boolean): Plan[] => {
      const rowW = columnRowWidth(W, c);
      // Varias columnas: forma corta de las oficinas ("Ger. …"), como en el pivote y la tabla
      const short = c > 1;
      const text = (i: Item) => (short ? i.short : i.label);
      const base: Mode = compact ? "compact" : narrow ? "stacked" : "regular";
      const dropPct = base === "compact" && rowW < 300;
      const numbersW = valueW + (showPctRow && !dropPct ? GAP + pctW : 0) + (bullet ? GAP + bullet.width : 0);
      const barW = Math.round(Math.max(40, Math.min(120, rowW * 0.2)));
      const labelWOf = (mode: Mode) =>
        mode === "stacked" ? rowW - RANK_W - GAP : mode === "compact" ? rowW - RANK_W - 3 * GAP - barW - numbersW : rowW - RANK_W - 2 * GAP - numbersW;
      // Una columna más solo si la etiqueta conserva espacio (si no, se parte en 3+ líneas)
      if (c > 1 && labelWOf(base) < (compact ? MIN_LABEL_COMPACT : MIN_LABEL)) return [];
      const neutralW = rowW - RANK_W - 2 * GAP - numbersW;
      // Apilada: el NIT va en su propio renglón (+1 línea); en las demás, en línea tras el nombre
      const lines = (i: Item, w: number, mode: Mode) => {
        const idBlock = mode === "stacked" && secondary && Boolean(i.secondary);
        return lineCount(text(i), w - (i.tone ? 20 : 0), 500, 13, secondary && i.secondary && !idBlock ? monoWidth(i.secondary) : 0) + (idBlock ? 1 : 0);
      };
      const neutralHeights = neutrals.map((i) => 14 + 18 * lines(i, neutralW, "regular"));
      const neutralHeightsHidden = neutrals.map((i, k) => (i.others ? 14 + 18 * lineCount(hiddenOthers, neutralW, 500, 13, moreW) : neutralHeights[k]));
      const make = (mode: Mode): Plan => {
        const labelW = labelWOf(mode);
        const heights = real.map((i) => {
          const l = lines(i, labelW, mode);
          if (mode === "stacked") return 32 + 18 * l;
          if (mode === "compact") return 14 + 18 * l;
          return 21 + 18 * (twoLine ? Math.max(2, l) : l);
        });
        // Filas compartidas entre columnas solo con altos uniformes: una fila partida abriría huecos en la vecina
        const uniform = heights.every((h) => h === heights[0]);
        return { cols: c, mode, barW, dropPct, secondary, short, flow: c > 1 && !uniform ? "free" : "aligned", heights, neutralHeights, neutralHeightsHidden };
      };
      const first = make(base);
      if (c === 1) return [first];
      // Compacta (32 px, barra en línea): una columna más solo si ninguna etiqueta se parte
      if (base === "compact") return first.heights.some((h) => h > 32) ? [] : [first];
      // Regular con etiquetas partidas: primero la anatomía apilada (nombre en su renglón con todo el ancho
      // de la columna; barra y cifras debajo), luego la regular en flujo libre (si la apilada muestra menos filas)
      if (base === "regular" && !twoLine && first.heights.some((h) => h > 39)) return [make("stacked"), first];
      return [first];
    };
    // Con el identificador en línea, de menos a más columnas; después, sin él en las cantidades de
    // columnas donde partiría filas (a 1024/768 px: 5 | 5 filas de una línea en lugar de 5 | 4 disparejas)
    const plans: Plan[] = [];
    const alt: Plan[] = [];
    const withId = real.some((i) => i.secondary);
    for (let c = 1; c <= maxCols; c++) {
      const ps = build(c, true);
      const qs = withId ? build(c, false) : [];
      if (!ps.length && !qs.length) break;
      plans.push(...ps);
      for (const q of qs) if (ps.every((p) => p.mode !== q.mode || q.heights.some((h, k) => h !== p.heights[k]))) alt.push(q);
    }
    return { valueW, pctW, plans, alt };
  }, [W, compact, twoLine, vo.columns, real, neutrals, items, format, showPctRow, total, bullet, kind, othersFolded, inlineMore]);

  const fixedH = measured ? mh : height > 0 ? height : null;
  const all = expanded || showAll;
  const bulletInline = Boolean(bullet) && !frame?.legendEl;
  const chrome = (vo.concentration && real.length > 1 ? CONCENTRATION_H : 0) + (pinned ? PINNED_H : 0) + (bulletInline ? BULLET_HEAD_H : 0);
  const cap = widget.visibleRows ?? Infinity;
  const fit = useMemo((): { plan: Plan; grid: ListGrid; cellH: number[]; extra: number; footer: boolean } => {
    const { plans, alt } = layout;
    const base = Boolean(scope || chipInFooter);
    /** Alto de cada celda (filas reales visibles y luego neutrales): el de su fila de la grilla o, en flujo libre, el propio. */
    const cells = (plan: Plan, grid: ListGrid, extra: number) => {
      const tailH = grid.shown < real.length ? plan.neutralHeightsHidden : plan.neutralHeights;
      return [...plan.heights.slice(0, grid.shown), ...tailH].map(
        (h, i) => (plan.flow === "free" ? h + (i === grid.sepAt ? HAIRLINE_BLOCK : 0) : (grid.heights[i % Math.max(1, grid.rows)] ?? h)) + extra,
      );
    };
    if (all || fixedH === null) {
      // Alto por contenido (móvil, "Ampliar" o "Ver todo"): al menos 3 filas por columna (6 en "Ampliar")
      const count = real.length + neutrals.length;
      const cols = Math.max(1, Math.min(Math.ceil(count / (expanded ? 6 : 3)), plans[plans.length - 1].cols));
      const plan = plans.find((p) => p.cols === cols) ?? plans[0];
      const shown = all ? real.length : Math.min(cap, real.length <= 12 ? real.length : 10);
      const grid = gridLayout(plan.heights, shown < real.length ? plan.neutralHeightsHidden : plan.neutralHeights, plan.cols, shown, HAIRLINE_BLOCK, plan.flow === "free");
      const footer = base || (all ? !expanded && showAll : grid.shown < real.length && !inlineMore);
      return { plan, grid, cellH: cells(plan, grid, 0), extra: 0, footer };
    }
    const options = [...plans, ...alt];
    const cands = options.map((p) => ({ cols: p.cols, heights: p.heights, tail: p.neutralHeights, tailHidden: p.neutralHeightsHidden, free: p.flow === "free" }));
    let avail = fixedH - chrome - (base ? FOOTER_H : 0);
    let pick = pickGrid(cands, avail, cap, HAIRLINE_BLOCK);
    let footer = base;
    if (!base && !inlineMore && pick.grid.shown < real.length) {
      avail = fixedH - chrome - FOOTER_H;
      pick = pickGrid(cands, avail, cap, HAIRLINE_BLOCK);
      footer = true;
    }
    const plan = options[pick.index];
    const stretched = stretchRows(pick.grid, avail, STRETCH[plan.mode]);
    const extra = pick.grid.rows ? Math.max(0, stretched[0] - pick.grid.heights[0]) : 0;
    return { plan, grid: pick.grid, cellH: cells(plan, pick.grid, extra), extra, footer };
  }, [layout, all, fixedH, chrome, scope, chipInFooter, cap, expanded, showAll, real.length, neutrals.length, inlineMore]);

  const { plan, grid } = fit;
  const hidden = real.length - grid.shown;
  /** Flujo libre: las filas miden su contenido (sin alto mínimo estimado). */
  const free = plan.flow === "free";

  // Si la capacidad oculta filas con nombre, "Otras N" las incluye (el orden y la suma no engañan)
  const tail = useMemo(() => {
    if (hidden <= 0 || all) return neutrals;
    const rest = real.slice(grid.shown);
    const restSum = rest.reduce((a, i) => a + i.value, 0);
    return neutrals.map((it) => {
      if (!it.others) return it;
      const text = othersLabel(kind, othersFolded + rest.length);
      const names = rest.slice(0, 4).map((i) => i.full).join(", ");
      const note = `Incluye ${formatInt(rest.length)} ${kindNoun(kind, rest.length)} del top fuera de la vista (${names}${rest.length > 4 ? "…" : ""})${
        othersFolded ? ` y ${formatInt(othersFolded)} fuera del top` : ""
      }`;
      return { ...it, label: text, full: text, short: text, value: it.value + restSum, note };
    });
  }, [hidden, all, neutrals, real, grid.shown, kind, othersFolded]);

  const anySel = selected.length > 0;
  const toggle = (raw: string) => () => toggleValue(dimension, raw);
  const rowProps = {
    max,
    total,
    format,
    showPct: showPctRow && !plan.dropPct,
    shareInTip: showPct && !showPctRow,
    valueW: layout.valueW,
    pctW: layout.pctW,
    barW: plan.barW,
    twoLine,
    bullet,
    hideSecondary: !plan.secondary,
    useShort: plan.short,
    // Varias columnas alineadas: filas cortas al pie de su fila de la grilla (barras a la misma altura);
    // en flujo libre cada fila se centra en su propio alto
    align: grid.cols > 1 && plan.flow === "aligned" ? ("end" as const) : ("center" as const),
    endInset: Math.floor(fit.extra / 2),
    padY: free ? fit.extra / 2 : 0,
  };

  // Columnas de la grilla: numeración continua; filas alineadas entre columnas (o flujo libre por columna)
  const columns = gridColumns(grid, grid.shown + tail.length);

  const openMore = () => (useDialog ? setDialog(window.innerWidth >= 640 ? "regular" : "stacked") : setShowAll(true));
  const moreText = useDialog ? `Ver los ${formatInt(items.length)}` : `Ver ${formatInt(hidden)} más`;
  // "Ver N más" en línea en "Otras N" (que ya suma las filas ocultas); si no hay "Otras", en el pie
  const inlineAction =
    !expanded && !all && hidden > 0 && inlineMore ? (
      <button
        type="button"
        onClick={openMore}
        aria-expanded={false}
        className="whitespace-nowrap rounded-md px-1 text-xs font-semibold leading-[18px] text-primary-text transition hover:bg-primary-soft focus-visible:outline-offset-0"
      >
        {moreText}
      </button>
    ) : null;
  const more =
    !expanded && (showAll || (hidden > 0 && !inlineMore)) ? (
      showAll ? (
        <MoreButton onClick={() => setShowAll(false)} expanded>
          Ver menos
        </MoreButton>
      ) : (
        <MoreButton onClick={openMore}>{moreText}</MoreButton>
      )
    ) : null;

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col">
      {chip && !chipInFooter && <LegendSlot side="end">{chip}</LegendSlot>}
      {bullet && frame?.legendEl && (
        <LegendSlot>
          <BulletLegend spec={bullet} />
        </LegendSlot>
      )}
      {vo.concentration && real.length > 1 && <Concentration items={real} total={total} kind={kind} narrow={W < STACK_BELOW} />}
      {pinned && (
        <PinnedRow
          item={pinned}
          total={showPct ? total : 0}
          format={format}
          tone={pinnedTone}
          cta={vo.pinned?.cta}
          selected={vo.pinned?.filter ? (filters.eq[vo.pinned.filter.field] ?? []).includes(vo.pinned.filter.value) : selected.includes(pinned.raw)}
          onCta={
            vo.pinned?.filter
              ? () => toggleValue(vo.pinned!.filter!.field, vo.pinned!.filter!.value)
              : crossFilter
                ? () => toggleValue(dimension, pinned.raw)
                : undefined
          }
        />
      )}
      {bulletInline && bullet && (
        // Franja de leyenda bajo el header, alineada a la izquierda (L2)
        <div className="flex shrink-0 justify-start pb-1" style={{ minHeight: BULLET_HEAD_H }}>
          <BulletLegend spec={bullet} />
        </div>
      )}
      <div
        className={cn("-mx-2 grid min-h-0 flex-1 content-start", all ? "overflow-y-auto overscroll-contain" : "overflow-hidden")}
        style={{ gridTemplateColumns: `repeat(${Math.max(1, grid.cols)}, minmax(0, 1fr))`, columnGap: COL_GAP }}
        role="group"
        aria-label={`${widget.title}: ${formatInt(real.length)} ${kindNoun(kind, real.length)}`}
      >
        {columns.map(({ from, to }, c) => {
          const rows: number[] = [];
          const tails: number[] = [];
          for (let i = from; i < to; i++) (i < grid.shown ? rows : tails).push(i);
          return (
            <div key={c} className="flex min-w-0 flex-col">
              {rows.length > 0 && (
                <ol start={rows[0] + 1} className="flex flex-col">
                  {rows.map((idx) => {
                    const it = real[idx];
                    const sel = selected.includes(it.raw);
                    return (
                      <RankRow
                        key={it.key}
                        item={it}
                        rank={idx + 1}
                        mode={plan.mode}
                        height={free ? undefined : fit.cellH[idx]}
                        selected={sel}
                        dimmed={anySel && !sel}
                        onToggle={it.filterable ? toggle(it.raw) : undefined}
                        delay={Math.min(idx * 0.02, 0.24)}
                        {...rowProps}
                      />
                    );
                  })}
                </ol>
              )}
              {tails.length > 0 && (
                <>
                  {grid.sepAt === tails[0] && <div className="mx-2 my-1 h-px shrink-0 bg-[var(--hairline)]" aria-hidden />}
                  <ul className="flex flex-col" aria-label="Sin clasificar">
                    {tails.map((i) => {
                      const it = tail[i - grid.shown];
                      const sel = selected.includes(it.raw);
                      return (
                        <RankRow
                          key={it.key}
                          item={it}
                          rank={null}
                          mode={plan.mode}
                          height={free ? undefined : fit.cellH[i] - (i === grid.sepAt ? HAIRLINE_BLOCK : 0)}
                          selected={sel}
                          dimmed={anySel && !sel}
                          onToggle={it.filterable ? toggle(it.raw) : undefined}
                          delay={0.2}
                          {...rowProps}
                          action={it.others ? inlineAction : undefined}
                        />
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          );
        })}
      </div>
      {fit.footer && (
        <ListFooter
          left={scope ? <span className="tabular">{scope}</span> : null}
          right={
            chipInFooter || more ? (
              <>
                {chipInFooter && chip}
                {more}
              </>
            ) : null
          }
        />
      )}
      {useDialog && (
        <SearchListDialog
          open={dialog !== null}
          onClose={() => setDialog(null)}
          title={widget.title}
          items={items}
          getText={(i) => `${i.full} ${i.secondary ?? ""}`}
          placeholder={`Buscar ${kindNoun(kind, 2)}…`}
          footer={scope}
          renderItem={(it) => {
            const idx = real.indexOf(it);
            const sel = selected.includes(it.raw);
            return (
              <RankRow
                key={it.key}
                item={it}
                rank={idx >= 0 ? idx + 1 : null}
                mode={dialog ?? "stacked"}
                selected={sel}
                dimmed={anySel && !sel}
                onToggle={it.filterable ? toggle(it.raw) : undefined}
                delay={0}
                {...rowProps}
                showPct={showPctRow}
                twoLine={false}
                hideSecondary={false}
                useShort={false}
                padY={0}
                align="center"
              />
            );
          }}
        />
      )}
    </div>
  );
}
