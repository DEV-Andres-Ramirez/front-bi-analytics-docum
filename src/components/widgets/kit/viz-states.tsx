"use client";

import { AlertTriangle, FilterX, Inbox, RotateCcw } from "lucide-react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import type { Viz } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { activeFilterCount } from "@/lib/filters";

type Archetype = "ranking" | "series" | "columns" | "strip" | "map" | "tiles" | "table" | "block";

const ARCHETYPE: Partial<Record<Viz, Archetype>> = {
  ranking: "ranking",
  people: "ranking",
  "split-rows": "ranking",
  drilldown: "ranking",
  area: "series",
  "monthly-delta": "columns",
  "column-bars": "columns",
  histogram: "columns",
  "status-strip": "strip",
  "status-board": "strip",
  pipeline: "strip",
  composition: "strip",
  "family-split": "strip",
  "hero-map": "map",
  "category-tiles": "tiles",
  "entity-tiles": "tiles",
  pivot: "table",
  "role-pivot": "table",
  "efficiency-matrix": "table",
  "resolution-table": "table",
  heatmap: "table",
};

const WIDTHS = [92, 78, 66, 58, 50, 44, 38, 32, 28, 24, 20, 18];

/** Skeleton por arquetipo con el alto exacto de la celda (sin saltos al cargar). */
export function VizSkeleton({ viz, className }: { viz?: Viz; className?: string }) {
  const a = (viz && ARCHETYPE[viz]) ?? "block";
  if (a === "ranking")
    return (
      <div className={cn("flex h-full flex-col gap-3 overflow-hidden", className)} aria-hidden>
        {WIDTHS.map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton h-3 w-4 rounded" />
            <div className="skeleton h-3 rounded" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    );
  if (a === "series")
    return (
      <div className={cn("relative h-full overflow-hidden", className)} aria-hidden>
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <path d="M0,30 C10,26 18,32 28,22 C38,12 46,24 56,18 C66,12 74,20 84,10 C90,6 96,12 100,8 L100,40 L0,40 Z" fill="var(--surface-3)" />
        </svg>
        <div className="skeleton absolute inset-x-0 bottom-0 h-px" />
      </div>
    );
  if (a === "columns")
    return (
      <div className={cn("flex h-full items-end gap-2 overflow-hidden", className)} aria-hidden>
        {[40, 62, 55, 80, 70, 48, 90, 66, 52, 74].map((h, i) => (
          <div key={i} className="skeleton flex-1 rounded-t-md" style={{ height: `${h}%` }} />
        ))}
      </div>
    );
  if (a === "strip")
    return (
      <div className={cn("flex h-full flex-col gap-3 overflow-hidden", className)} aria-hidden>
        <div className="skeleton h-3 w-full rounded-full" />
        <div className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton min-h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  if (a === "tiles")
    return (
      <div className={cn("grid h-full grid-cols-2 gap-3 overflow-hidden", className)} aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton rounded-xl" />
        ))}
      </div>
    );
  if (a === "map")
    return (
      <div className={cn("grid h-full gap-5 overflow-hidden md:grid-cols-[minmax(0,600px)_minmax(0,1fr)]", className)} aria-hidden>
        <div className="skeleton relative rounded-2xl">
          <svg viewBox="0 0 100 130" className="absolute inset-0 m-auto h-3/4 w-3/4 opacity-50">
            <path
              d="M38,4 L52,2 L60,10 L70,14 L74,26 L86,30 L92,44 L84,58 L88,72 L80,90 L66,96 L60,112 L50,126 L42,110 L30,104 L22,88 L12,80 L8,62 L16,48 L12,34 L22,24 L30,12 Z"
              fill="var(--surface)"
            />
          </svg>
        </div>
        <div className="flex flex-col gap-3">
          <div className="skeleton h-5 w-2/3" />
          <div className="grid grid-cols-3 gap-2">
            <div className="skeleton h-14 rounded-xl" />
            <div className="skeleton h-14 rounded-xl" />
            <div className="skeleton h-14 rounded-xl" />
          </div>
          {WIDTHS.slice(0, 8).map((w, i) => (
            <div key={i} className="skeleton h-3" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    );
  if (a === "table")
    return (
      <div className={cn("flex min-h-48 flex-col gap-2 overflow-hidden", className)} aria-hidden>
        <div className="skeleton h-7 w-full rounded-lg" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-5 w-full rounded" />
        ))}
      </div>
    );
  return <div className={cn("skeleton h-full min-h-24 w-full", className)} aria-hidden />;
}

/** Estado vacío compacto dentro de la tarjeta, con "Quitar filtros". */
export function VizEmpty({ note, className }: { note?: string; className?: string }) {
  const { filters, clearAll } = useDashboard();
  const n = activeFilterCount(filters);
  return (
    <div className={cn("flex h-full min-h-28 flex-col items-center justify-center gap-1.5 px-4 text-center", className)}>
      <span className="grid size-8 place-items-center rounded-xl bg-surface-3 text-muted">
        <Inbox className="size-4" aria-hidden />
      </span>
      <p className="text-[13px] font-semibold text-text-2">Sin datos para los filtros actuales</p>
      {note ? <p className="max-w-xs text-xs text-muted">{note}</p> : n > 0 && <p className="text-xs text-muted">{n === 1 ? "1 filtro activo" : `${n} filtros activos`}</p>}
      {n > 0 && (
        <button type="button" onClick={clearAll} className="mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-primary-text transition hover:bg-primary-soft">
          <FilterX className="size-3.5" aria-hidden /> Quitar filtros
        </button>
      )}
    </div>
  );
}

export function VizError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full min-h-28 flex-col items-center justify-center gap-1.5 text-center">
      <span className="grid size-8 place-items-center rounded-xl bg-critical-soft text-critical-ink">
        <AlertTriangle className="size-4" aria-hidden />
      </span>
      <p className="text-[13px] font-semibold text-text-2">No fue posible cargar este gráfico</p>
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-primary-text transition hover:bg-primary-soft">
        <RotateCcw className="size-3.5" aria-hidden /> Reintentar
      </button>
    </div>
  );
}
