"use client";

import { AlertTriangle, ChevronRight, Filter, FilterX, Layers, MousePointerClick, X } from "lucide-react";
import { StatusIcon } from "@/components/widgets/kit/status-icon";
import type { StatusTone } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { TONE_VARS } from "@/lib/charts/semantic";
import { formatInt, formatPct } from "@/lib/format";
import { displayLabel } from "@/lib/labels";
import { pluralArticle, type MapUnit } from "./classify";

/**
 * Panel de insights del HeroMap (mapRedesign 7):
 * (a) título con la geografía explícita + migas · (b) tres cifras · banner de cobertura
 * (c) ranking top 10 sincronizado con el mapa · (d) detalle del seleccionado · (e) leyenda (map-legend.tsx).
 * El ranking es la ruta por teclado del mapa.
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
export function PanelHeader({ title, geo, level, dptoName, onBack }: { title: string; geo: string | null; level: MapLevel; dptoName?: string; onBack: () => void }) {
  return (
    <div className="min-w-0">
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
      <h4 className="mt-1 text-[15px] font-bold leading-snug text-text">{title}</h4>
      {geo && <p className="text-xs text-muted">{geo}</p>}
    </div>
  );
}

// ─── (b) Tres cifras ─────────────────────────────────────────────────────────
function locTone(ratio: number): StatusTone {
  return ratio >= 0.95 ? "good" : ratio >= 0.8 ? "warning" : "critical";
}

export function PanelSummary({
  level,
  withData,
  universe,
  top,
  located,
  total,
  className,
}: {
  level: MapLevel;
  withData: number;
  /** Territorios del nivel (33 departamentos o los municipios del departamento). */
  universe: number | null;
  top: GeoRow | null;
  located: number;
  total: number;
  className?: string;
}) {
  const noun = level === "dpto" ? "departamentos" : "municipios";
  const ratio = total ? located / total : 1;
  const tone = locTone(ratio);
  const missing = Math.max(0, total - located);
  const cell = "flex min-w-0 flex-col rounded-xl bg-surface-2 px-2.5 py-2 @min-[400px]:px-3";
  const lab = "text-[11px] font-semibold leading-tight text-muted";
  const num = "tabular whitespace-nowrap text-lg font-bold leading-none text-text @min-[400px]:text-xl";
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
          <span className={num}>{top ? formatPct(top.pct, 0) : "—"}</span>
          <span className="mt-1 block text-[11px] leading-tight text-text-2 [overflow-wrap:anywhere]">{top ? `en ${top.name}` : "sin datos"}</span>
        </dd>
      </div>
      <div className={cell}>
        <dt className={lab}>{level === "dpto" ? "Ubicación válida" : "Con municipio"}</dt>
        <dd className="mt-1">
          <span className="flex items-center gap-1">
            <StatusIcon tone={tone} />
            <span className={num}>{formatPct(ratio, ratio > 0.999 ? 0 : 1)}</span>
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
          <span className="tabular mt-1 block text-[11px] leading-tight text-text-2">{missing ? `${formatInt(missing)} sin ubicación` : "todos ubicados"}</span>
        </dd>
      </div>
    </dl>
  );
}

/** Banner cuando más del 20 % no tiene ubicación: el mapa no representa el total. */
export function CoverageBanner({ located, total, unit }: { located: number; total: number; unit: MapUnit }) {
  if (!total || (total - located) / total <= 0.2) return null;
  const missing = total - located;
  return (
    <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs leading-snug text-warning-ink">
      <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        El mapa representa el <strong className="tabular font-bold">{formatPct(located / total, 0)}</strong> de {pluralArticle(unit.plural)} {unit.plural} (
        <span className="tabular">{formatInt(missing)}</span> sin ubicación)
      </span>
    </p>
  );
}

// ─── (c) Ranking ─────────────────────────────────────────────────────────────
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
  className,
}: {
  rows: GeoRow[];
  /** Territorios sin registros (se listan al ver todos). */
  zeros: string[];
  level: MapLevel;
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
  className?: string;
}) {
  const noun = level === "dpto" ? (rows.length === 1 ? "departamento" : "departamentos") : rows.length === 1 ? "municipio" : "municipios";
  const visible = showAll ? rows : rows.slice(0, limit);
  const max = rows[0]?.value || 1;
  const anyFilter = filtered.length > 0;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1 flex items-baseline justify-between gap-2 px-1">
        <p className="text-xs font-semibold text-text-2">{showAll || rows.length <= limit ? `${formatInt(rows.length)} ${noun} con registros` : `Top ${limit} ${noun}`}</p>
        <span className="text-[11px] text-muted">{level === "dpto" ? "% del total" : "% del departamento"}</span>
      </div>
      <ol role="list" className={columns === 2 ? "columns-2 gap-x-6 [&>li]:break-inside-avoid" : "flex flex-col"} onMouseLeave={() => onHover(null)}>
        {visible.map((r, i) => {
          const isSel = r.code === selected;
          const isHover = r.code === hovered;
          const isFiltered = filtered.includes(r.code);
          return (
            <li key={r.code} className={cn("flex items-stretch rounded-lg transition-opacity", anyFilter && !isFiltered && !isSel && "opacity-45")}>
              <button
                type="button"
                aria-pressed={isSel}
                onClick={() => onPick(r.code)}
                onMouseEnter={() => onHover(r.code)}
                onFocus={() => onHover(r.code)}
                onBlur={() => onHover(null)}
                title={`${r.name}: ${formatInt(r.value)} (${formatPct(r.pct)})`}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-1.5 py-[3px] text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary",
                  isSel ? "border-primary/40 bg-primary-soft" : isHover ? "border-transparent bg-surface-3" : "border-transparent hover:bg-surface-3",
                )}
              >
                <span className="tabular w-4 shrink-0 text-right text-[11px] text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 text-[12.5px] leading-tight text-text [overflow-wrap:anywhere]">
                  {r.name}
                  {isFiltered && <Filter className="ml-1 inline size-3 align-[-1px] text-primary-text" aria-label="Filtrado" />}
                </span>
                <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-surface-3" aria-hidden>
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
      {rows.length > limit && (
        <button type="button" onClick={onToggleAll} aria-expanded={showAll} className="mt-1 rounded-full px-2 py-1 text-xs font-semibold text-primary-text transition hover:bg-primary-soft">
          {showAll ? "Ver menos" : `Ver los ${formatInt(rows.length + zeros.length)}`}
        </button>
      )}
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
  return (
    <div className={cn(!bare && "rounded-xl border border-border bg-surface-2 p-3")}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[15px] font-bold leading-tight text-text [overflow-wrap:anywhere]">
          <span className="sr-only">{level === "dpto" ? "Departamento: " : "Municipio: "}</span>
          {row.name}
        </p>
        {!bare && (
          <button type="button" onClick={onClear} aria-label="Quitar selección" title="Quitar selección" className="grid size-7 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-3 hover:text-text">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="tabular text-[28px] font-bold leading-none text-text">{formatInt(row.value)}</span>
        <span className="text-xs text-text-2">{row.value === 1 ? unit.singular : unit.plural}</span>
        <span className="tabular text-xs text-muted">
          {formatPct(row.pct)} {scopeLabel}
          {rank !== null && ` · #${rank} de ${formatInt(of)}`}
        </span>
      </div>
      {parts.length > 0 && (
        <div className="mt-2.5">
          {breakdownLabel && <p className="mb-1 text-[11px] font-semibold text-text-2">{breakdownLabel}</p>}
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
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onFilter}
          aria-pressed={isFiltered}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            isFiltered ? "bg-surface-3 text-text hover:bg-border" : "btn-primary",
          )}
        >
          {isFiltered ? <FilterX className="size-3.5" aria-hidden /> : <Filter className="size-3.5" aria-hidden />}
          {isFiltered ? "Quitar filtro" : "Filtrar tablero"}
        </button>
        {canDrill && (
          <button type="button" onClick={onDrill} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text-2 transition hover:border-primary/40 hover:text-text">
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

/** Pie del panel sin selección. */
export function SelectHint({ level, allowDrill }: { level: MapLevel; allowDrill: boolean }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-dashed border-border px-3 py-1.5 text-[11.5px] leading-snug text-muted">
      <MousePointerClick className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        Clic en un territorio: detalle
        {allowDrill && level === "dpto" ? " · doble clic: municipios" : ""}
      </span>
    </p>
  );
}
