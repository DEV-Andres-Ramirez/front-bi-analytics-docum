"use client";

import { ChevronRight, Filter, FilterX, Layers, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { StatusIcon, TONE_ICON } from "@/components/widgets/kit/status-icon";
import type { StatusTone } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { cn } from "@/lib/cn";
import { TONE_VARS } from "@/lib/charts/semantic";
import { formatInt, formatPct } from "@/lib/format";
import { displayLabel } from "@/lib/labels";
import { pluralArticle, shortGeoName, type MapUnit } from "./classify";

/**
 * Panel de insights del HeroMap (mapRedesign 7):
 * (a) título con la geografía explícita + migas · (b) tres cifras · banner de cobertura
 * (c) ranking top 10 sincronizado con el mapa · (d) detalle del seleccionado · (e) leyenda (map-legend.tsx).
 * El ranking es la ruta por teclado del mapa. Lado a lado, el ranking se ajusta al alto que le queda
 * (filas enteras, "Top N" real y "Ver los 33" siempre visible) en lugar de cortar la última fila.
 */

export interface GeoRow {
  code: string;
  name: string;
  value: number;
  /** Proporción sobre el total del nivel (0..1). */
  pct: number;
  /** Color de su clase (une lista y mapa). */
  color: string;
  top?: { label: string; value: number }[];
}

export type MapLevel = "dpto" | "mpio";

// ─── (a) Título + migas ──────────────────────────────────────────────────────
export function PanelHeader({
  title,
  geo,
  level,
  dptoName,
  onBack,
  compact = false,
}: {
  title: string;
  geo: string | null;
  level: MapLevel;
  dptoName?: string;
  onBack: () => void;
  /** Lado a lado: solo las migas (el título repetía el de la tarjeta y costaba ≈ 45 px del ranking). */
  compact?: boolean;
}) {
  return (
    <div className="min-w-0 shrink-0">
      <nav aria-label="Nivel del mapa" className="flex flex-wrap items-center gap-1 text-[11px] font-semibold">
        <Layers className="size-3.5 text-muted" aria-hidden />
        {level === "mpio" ? (
          <button type="button" onClick={onBack} className="rounded text-primary-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary">
            Colombia
          </button>
        ) : (
          <span className="text-text-2" aria-current="page">
            Colombia
          </span>
        )}
        {level === "mpio" && (
          <>
            <ChevronRight className="size-3 text-muted" aria-hidden />
            <span className="text-text-2" aria-current="page">
              {dptoName}
            </span>
          </>
        )}
      </nav>
      <h4 className={compact ? "sr-only" : "mt-1 text-[15px] font-bold leading-snug text-text"}>{title}</h4>
      {geo && <p className={compact ? "sr-only" : "text-xs text-muted"}>{geo}</p>}
    </div>
  );
}

// ─── (b) Tres cifras ─────────────────────────────────────────────────────────
/**
 * Tono de la ubicación válida: bueno ≥ 95 %, advertencia ≥ 50 %, crítico < 50 %. El banner de
 * cobertura (< 80 %) usa el mismo tono: un mismo hecho nunca se dice con dos severidades.
 */
function locTone(ratio: number): StatusTone {
  return ratio >= 0.95 ? "good" : ratio >= 0.5 ? "warning" : "critical";
}

/** "100 %" exacto sin decimal (a 390 px "100,0 %" desbordaba la celda); el resto con 1 decimal. */
function sharePct(ratio: number): string {
  return ratio >= 1 ? "100\u00a0%" : formatPct(ratio);
}

export function PanelSummary({
  level,
  withData,
  universe,
  top,
  located,
  total,
  unit,
  className,
}: {
  level: MapLevel;
  withData: number;
  /** Territorios del nivel (33 departamentos o los municipios del departamento). */
  universe: number | null;
  top: GeoRow | null;
  located: number;
  total: number;
  unit: MapUnit;
  className?: string;
}) {
  const noun = level === "dpto" ? "departamentos" : "municipios";
  const ratio = total ? located / total : 1;
  // El tono se evalúa sobre la cifra mostrada (1 decimal): 0,4997 se lee "50,0 %" y es advertencia, no crítico
  const tone = locTone(shownRatio(located, total));
  const missing = Math.max(0, total - located);
  // Con el banner de cobertura, la concentración describe el mapa que se ve (sobre lo ubicado): sobre el
  // total, SMART 3 decía "19,9 % en Bogotá" cuando Bogotá tiene el 74,8 % de lo que el mapa muestra
  const partial = needsCoverageBanner(located, total);
  const conc = top ? (partial ? top.value / (located || 1) : top.pct) : null;
  const located_ = pluralArticle(unit.plural) === "las" ? "ubicadas" : "ubicados";
  // Celdas de ≈ 103 px a 390: cifra y relleno se reducen bajo 360 px de contenedor
  const cell = "flex min-w-0 flex-col rounded-xl bg-surface-2 px-2 py-2 @min-[360px]:px-2.5 @min-[400px]:px-3";
  // Una sola línea: las cifras de las tres celdas quedan en la misma línea base (a 390 px "Ubicación válida" se partía)
  const lab = "whitespace-nowrap text-[11px] font-semibold leading-tight text-muted";
  const num = "tabular whitespace-nowrap text-base font-bold leading-none text-text @min-[360px]:text-lg @min-[400px]:text-xl";
  const foot = "mt-1 block whitespace-nowrap text-[11px] leading-tight text-text-2";
  const locLabel = level === "dpto" ? "Ubicación válida" : "Con municipio";
  return (
    <dl className={cn("@container grid grid-cols-3 gap-2", className)}>
      <div className={cell}>
        <dt className={lab}>Con registros</dt>
        <dd className="mt-1" aria-label={`${formatInt(withData)}${universe !== null ? ` de ${formatInt(universe)}` : ""} ${noun} con registros`}>
          <span className={num}>{formatInt(withData)}</span>
          {universe !== null && <span className="tabular ml-1 whitespace-nowrap text-xs text-muted">de {formatInt(universe)}</span>}
          <span className="mt-1 block text-[11px] leading-tight text-text-2">{noun}</span>
        </dd>
      </div>
      <div className={cell}>
        <dt className={lab}>Concentración</dt>
        <dd className="mt-1">
          <span className={num}>{conc !== null ? sharePct(conc) : "—"}</span>
          <span className="mt-1 block text-[11px] leading-tight text-text-2 [overflow-wrap:anywhere]">
            {top ? (partial ? `de ${pluralArticle(unit.plural)} ${located_} · en ${top.name}` : `en ${top.name}`) : "sin datos"}
          </span>
        </dd>
      </div>
      <div className={cell}>
        <dt className={lab}>
          {level === "dpto" ? (
            <>
              {/* Cada variante se oculta (display: none) en el otro ancho: el lector lee solo la visible */}
              <span className="@max-[399px]:hidden">{locLabel}</span>
              <span className="@min-[400px]:hidden">Con ubicación</span>
            </>
          ) : (
            locLabel
          )}
        </dt>
        <dd className="mt-1">
          <span className="flex items-center gap-1">
            <StatusIcon tone={tone} />
            <span className={num}>{sharePct(ratio)}</span>
          </span>
          <span
            className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-3"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio * 100)}
            aria-label="Registros con ubicación válida"
          >
            <span className="block h-full rounded-full" style={{ width: `${Math.max(2, ratio * 100)}%`, background: TONE_VARS[tone].solid }} />
          </span>
          {/* Con el banner a la vista la cifra no se repite; en celdas angostas, "sin ubicar" cabe en una línea */}
          <span className={cn(foot, "tabular")}>
            {partial ? (
              "ver aviso"
            ) : missing ? (
              <>
                {formatInt(missing)} <span className="@max-[399px]:hidden">sin ubicación</span>
                <span className="@min-[400px]:hidden">sin ubicar</span>
              </>
            ) : (
              "todos ubicados"
            )}
          </span>
        </dd>
      </div>
    </dl>
  );
}

/** Proporción ubicada tal como se muestra (1 decimal en %): tono y banner se deciden sobre esa cifra. */
function shownRatio(located: number, total: number): number {
  return total ? Math.round((located / total) * 1000) / 1000 : 1;
}

/** Más del 20 % sin ubicación (la cifra mostrada queda bajo 80,0 %): el mapa no representa el total. */
export function needsCoverageBanner(located: number, total: number): boolean {
  return total > 0 && shownRatio(located, total) < 0.8;
}

/**
 * Banner cuando más del 20 % no tiene ubicación: el mapa no representa el total. Toma el tono de la
 * celda "Ubicación válida" (advertencia de 50 a 80 %, crítico bajo 50 %).
 */
export function CoverageBanner({ located, total, unit }: { located: number; total: number; unit: MapUnit }) {
  if (!needsCoverageBanner(located, total)) return null;
  const missing = total - located;
  const critical = locTone(shownRatio(located, total)) === "critical";
  const Icon = TONE_ICON[critical ? "critical" : "warning"];
  return (
    <p className={cn("flex items-start gap-2 rounded-xl px-3 py-2 text-xs leading-snug", critical ? "bg-critical-soft text-critical-ink" : "bg-warning-soft text-warning-ink")}>
      <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        El mapa representa el <strong className="tabular font-bold">{formatPct(located / total)}</strong> de {pluralArticle(unit.plural)} {unit.plural} (
        <span className="tabular">{formatInt(missing)}</span> sin ubicación)
      </span>
    </p>
  );
}

// ─── (c) Ranking ─────────────────────────────────────────────────────────────
/** Alto de una fila del ranking ajustado (24 px; hasta 28 px si reparte el sobrante) y del botón "Ver los N" (h-6 + mt-1). */
const ROW_H = 24;
const ROW_H_MAX = 28;
const TOGGLE_H = 28;

export function MapRanking({
  rows,
  zeros,
  level,
  limit,
  showAll,
  onToggleAll,
  selected,
  hovered,
  filtered,
  canDrill,
  onHover,
  onPick,
  onDrill,
  columns = 1,
  fit = false,
  className,
}: {
  rows: GeoRow[];
  /** Territorios sin registros (se listan al ver todos). */
  zeros: string[];
  level: MapLevel;
  /** Máximo de filas del top (apilado, 10; lado a lado, todas las que quepan). */
  limit: number;
  showAll: boolean;
  onToggleAll: () => void;
  selected: string | null;
  hovered: string | null;
  filtered: string[];
  canDrill: boolean;
  onHover: (code: string | null) => void;
  onPick: (code: string) => void;
  onDrill: (code: string) => void;
  /** 2: lista en dos columnas (panel ancho: diálogo Ampliar o > 1600 px). */
  columns?: 1 | 2;
  /**
   * Lado a lado: ocupa el alto restante del panel con filas enteras (el título dice el N real) y
   * "Ver los N" siempre visible; la lista completa hace scroll dentro de ese alto. Con el detalle
   * abierto (le quita alto) muestra una ventana de filas alrededor del elegido (sus vecinas, sin
   * scroll ni desvanecido). Si todo cabe, la lista mide su contenido y el sobrante queda al pie.
   */
  fit?: boolean;
  className?: string;
}) {
  const { ref: boxRef, height: boxH, measured } = useElementSize<HTMLDivElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sizing = fit && measured;
  // Con el detalle abierto (le quita alto), "Ver los N" sube al encabezado: su fila es para vecinas
  const pinned = sizing && !showAll && selected !== null;
  // Filas enteras que caben (en dos columnas, el doble), reservando o no el sitio del botón
  const cap = (reserve: number) => Math.max(1, Math.floor((boxH - reserve) / ROW_H)) * columns;
  const count = !sizing ? Math.min(limit, rows.length) : rows.length <= Math.min(limit, cap(0)) ? rows.length : Math.min(limit, cap(pinned ? 0 : TOGGLE_H));
  const truncated = rows.length > count;
  // Ventana con la fila elegida y sus vecinas (±2 o lo que quepa) si quedó fuera del top visible
  const selIdx = selected ? rows.findIndex((r) => r.code === selected) : -1;
  const around = Math.floor((count - 1) / 2);
  const start = !sizing || showAll || selIdx < 0 || selIdx + Math.min(2, around) < count ? 0 : Math.max(0, Math.min(rows.length - count, selIdx - around));
  const visible = showAll ? rows : rows.slice(start, start + count);
  // Top recortado: el sobrante (< 1 fila) se reparte entre las filas (24 → máx. 28 px), sin hueco sobre el pie
  const lines = Math.max(1, Math.ceil(visible.length / columns));
  const rowH = sizing && !showAll && truncated ? Math.max(ROW_H, Math.min(ROW_H_MAX, Math.floor((boxH - (pinned ? 0 : TOGGLE_H)) / lines))) : ROW_H;
  // Área con scroll: solo la lista completa
  const scrollH = Math.max(ROW_H, Math.floor((boxH - TOGGLE_H) / ROW_H) * ROW_H);
  const overflows = sizing && showAll;
  const grow = fit && (!sizing || truncated || showAll);
  const nounFor = (n: number) => (level === "dpto" ? (n === 1 ? "departamento" : "departamentos") : n === 1 ? "municipio" : "municipios");
  const max = rows[0]?.value || 1;
  const anyFilter = filtered.length > 0;
  const toggleLabel = `Ver los ${formatInt(rows.length + zeros.length)}`;
  const heading = showAll || !truncated ? `${formatInt(rows.length)} ${nounFor(rows.length)} con registros` : start > 0 ? `Puestos ${start + 1}–${start + visible.length} de ${formatInt(rows.length)}` : `Top ${count} ${nounFor(count)}`;

  // La fila elegida (en el mapa o en la lista) queda a la vista dentro de la lista completa con scroll
  const selIndex = selected ? visible.findIndex((r) => r.code === selected) : -1;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !overflows || selIndex < 0 || columns !== 1) return;
    const top = selIndex * ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
  }, [selIndex, overflows, scrollH, columns]);

  return (
    // @container: apilado, bajo 400 px la minibarra se oculta y el nombre cabe en una línea
    <div className={cn("@container flex min-w-0 flex-col", fit && "min-h-0", grow && "flex-1", className)}>
      <div className="mb-1 flex shrink-0 items-baseline justify-between gap-2 px-1">
        <p className="text-xs font-semibold text-text-2">{heading}</p>
        {pinned && truncated ? (
          <button type="button" onClick={onToggleAll} aria-expanded={false} className="-my-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold text-primary-text transition hover:bg-primary-soft">
            {toggleLabel}
          </button>
        ) : (
          <span className="text-[11px] text-muted">{level === "dpto" ? "% del total" : "% del departamento"}</span>
        )}
      </div>
      <div ref={boxRef} className={cn("min-w-0", fit && "min-h-0 flex-1 overflow-hidden")}>
        <div ref={scrollRef} className={cn(overflows && "overflow-y-auto overscroll-contain")} style={overflows ? { maxHeight: scrollH } : undefined}>
          <ol role="list" start={start + 1} className={columns === 2 ? "columns-2 gap-x-6 [&>li]:break-inside-avoid" : "flex flex-col"} onMouseLeave={() => onHover(null)}>
            {visible.map((r, i) => {
              const isSel = r.code === selected;
              const isHover = r.code === hovered;
              const isFiltered = filtered.includes(r.code);
              return (
                <li key={r.code} className={cn("flex items-stretch rounded-lg transition-opacity", anyFilter && !isFiltered && !isSel && "opacity-45")} style={fit ? { height: rowH } : undefined}>
                  <button
                    type="button"
                    aria-pressed={isSel}
                    onClick={() => onPick(r.code)}
                    onMouseEnter={() => onHover(r.code)}
                    onFocus={() => onHover(r.code)}
                    onBlur={() => onHover(null)}
                    title={`${r.name}: ${formatInt(r.value)} (${formatPct(r.pct)})`}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary",
                      fit ? "py-0" : "py-[3px]",
                      isSel ? "border-primary/40 bg-primary-soft" : isHover ? "border-transparent bg-surface-3" : "border-transparent hover:bg-surface-3",
                    )}
                  >
                    <span className="tabular w-4 shrink-0 text-right text-[11px] text-muted">{start + i + 1}</span>
                    <span className="flex min-w-0 flex-1 items-center gap-1">
                      {/* Lado a lado la fila mide 24–28 px fijos: el nombre completo queda en el title */}
                      <span className={cn("min-w-0 text-[12.5px] leading-tight text-text", fit ? "truncate" : "[overflow-wrap:anywhere]")}>{fit ? shortGeoName(r.name) : r.name}</span>
                      {isFiltered && <Filter className="size-3 shrink-0 text-primary-text" aria-label="Filtrado" />}
                    </span>
                    <span className={cn("h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-surface-3", !fit && "@max-[399px]:hidden")} aria-hidden>
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: r.color }} />
                    </span>
                    <span className="tabular w-11 shrink-0 text-right text-xs font-semibold text-text">{formatInt(r.value)}</span>
                    <span className="tabular w-12 shrink-0 text-right text-[11px] text-muted">{formatPct(r.pct)}</span>
                  </button>
                  {canDrill && (
                    <button
                      type="button"
                      onClick={() => onDrill(r.code)}
                      aria-label={`Ver municipios de ${r.name}`}
                      title="Ver municipios"
                      className="grid w-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface-3 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                    >
                      <ChevronRight className="size-4" aria-hidden />
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {showAll && zeros.length > 0 && (
            <p className="mt-2 px-1 text-[11px] leading-snug text-muted">
              <span className="font-semibold text-text-2">Sin registros ({zeros.length}):</span> {zeros.join(", ")}
            </p>
          )}
          {/* Lista completa con scroll: desvanecido al pie mientras hay más (el espaciador evita tapar el final) */}
          {overflows && (
            <>
              <span aria-hidden className="block h-4" />
              <span aria-hidden className="pointer-events-none sticky bottom-0 -mt-4 block h-4 bg-gradient-to-t from-surface to-transparent" />
            </>
          )}
        </div>
        {(truncated || showAll) && !pinned && (
          <button type="button" onClick={onToggleAll} aria-expanded={showAll} className="mt-1 h-6 shrink-0 rounded-full px-2 text-xs font-semibold text-primary-text transition hover:bg-primary-soft">
            {showAll ? "Ver menos" : toggleLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── (d) Detalle del seleccionado ────────────────────────────────────────────
export interface BreakdownPart {
  label: string;
  value: number;
  color: string;
}

export function MapDetail({
  row,
  level,
  rank,
  of,
  unit,
  breakdownLabel,
  parts,
  isFiltered,
  canDrill,
  onFilter,
  onDrill,
  onClear,
  scopeLabel,
  bare,
}: {
  row: GeoRow;
  level: MapLevel;
  rank: number | null;
  of: number;
  unit: MapUnit;
  breakdownLabel?: string;
  parts: BreakdownPart[];
  isFiltered: boolean;
  canDrill: boolean;
  onFilter: () => void;
  onDrill: () => void;
  onClear: () => void;
  /** "del total" o "de Antioquia". */
  scopeLabel: string;
  /** Sin marco (dentro de la hoja inferior). */
  bare?: boolean;
}) {
  const sum = parts.reduce((s, p) => s + p.value, 0) || 1;
  // En el panel lateral la ficha es compacta (≈ 20 px menos): el ranking conserva la fila elegida y sus vecinas
  return (
    <div className={cn(!bare && "rounded-xl border border-border bg-surface-2 px-3 py-2.5")}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[15px] font-bold leading-tight text-text [overflow-wrap:anywhere]">
          <span className="sr-only">{level === "dpto" ? "Departamento: " : "Municipio: "}</span>
          {row.name}
        </p>
        {!bare && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Quitar selección"
            title="Quitar selección"
            className="-my-1 -mr-1 grid size-7 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-3 hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      <div className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-0.5", bare ? "mt-1.5" : "mt-1")}>
        <span className="tabular text-[28px] font-bold leading-none text-text">{formatInt(row.value)}</span>
        <span className="text-xs text-text-2">{row.value === 1 ? unit.singular : unit.plural}</span>
        <span className="tabular text-xs text-muted">
          {formatPct(row.pct)} {scopeLabel}
          {rank !== null && ` · #${rank} de ${formatInt(of)}`}
        </span>
      </div>
      {parts.length > 0 && (
        <div className={bare ? "mt-2.5" : "mt-2"}>
          {breakdownLabel && <p className="mb-1 text-[11px] font-semibold leading-tight text-text-2">{breakdownLabel}</p>}
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-3" role="img" aria-label={parts.map((p) => `${p.label}: ${formatInt(p.value)}`).join(", ")}>
            {parts.map((p) => (
              <span key={p.label} className="h-full border-r border-surface last:border-r-0" style={{ width: `${(p.value / sum) * 100}%`, background: p.color }} />
            ))}
          </div>
          <ul role="list" className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {parts.map((p) => (
              <li key={p.label} className="flex min-w-0 items-center gap-1.5 text-[11.5px]">
                <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: p.color }} aria-hidden />
                <span className="leading-tight text-text-2">{displayLabel(p.label).full}</span>
                <span className="tabular font-semibold text-text">{formatInt(p.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={cn("flex flex-wrap gap-2", bare ? "mt-2.5" : "mt-2")}>
        <button
          type="button"
          onClick={onFilter}
          aria-pressed={isFiltered}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            bare ? "py-1.5" : "py-1",
            isFiltered ? "bg-surface-3 text-text hover:bg-border" : "btn-primary",
          )}
        >
          {isFiltered ? <FilterX className="size-3.5" aria-hidden /> : <Filter className="size-3.5" aria-hidden />}
          {isFiltered ? "Quitar filtro" : "Filtrar tablero"}
        </button>
        {canDrill && (
          <button type="button" onClick={onDrill} className={cn("inline-flex items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-text-2 transition hover:border-primary/40 hover:text-text", bare ? "py-1.5" : "py-1")}>
            <Layers className="size-3.5" aria-hidden /> Ver municipios
          </button>
        )}
        {bare && (
          <button type="button" onClick={onClear} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-3 hover:text-text">
            <X className="size-3.5" aria-hidden /> Quitar selección
          </button>
        )}
      </div>
    </div>
  );
}
