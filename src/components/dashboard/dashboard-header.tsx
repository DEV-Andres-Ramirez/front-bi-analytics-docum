"use client";

import { Database } from "lucide-react";
import { useCallback, ViewTransition } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { MODULES } from "@/config/dashboards";
import { getTopbarState, setTopbar, TOPBAR_H } from "@/hooks/use-topbar";
import { formatInt } from "@/lib/format";
import { useDashboard } from "./dashboard-context";
import { DataNotesPopover } from "./data-notes";

/**
 * Sentinel del H1: marca headerHidden cuando el título queda bajo la zona sticky
 * (topbar + FilterBar). Ref callback con limpieza (React 19): sin lecturas de refs en render.
 */
function useHeadingSentinel() {
  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      const limit = getTopbarState().stickyH || TOPBAR_H;
      setTopbar({ headerHidden: el.getBoundingClientRect().bottom < limit });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      setTopbar({ headerHidden: false });
    };
  }, []);
}

/**
 * DashboardHeader: tile de 56 px con el degradado del módulo (ViewTransition dash-icon-<slug>),
 * eyebrow del módulo en --mod-ink, H1 corto en una línea (dash-title-<slug>), descripción y
 * "N radicados en el periodo · N vistas · N notas de datos".
 * Los metadatos van a la derecha solo si la página mide ≥ 1040 px (@container page): por debajo
 * (1024 con riel, 1280 con sidebar abierto) ocupaban ≈ 440 px y cortaban la descripción, así que
 * pasan a su propia línea. Bajo 600 px la descripción usa todo el ancho, bajo el tile, con hasta
 * 3 líneas: no se corta con "…" en el teléfono.
 * El rango de fechas vive solo en la FilterBar; "Datos de prueba", solo en el topbar.
 */
export function DashboardHeader() {
  const { spec, meta, data } = useDashboard();
  const mod = MODULES.find((m) => m.id === meta.module);
  const heading = useHeadingSentinel();
  const Icon = meta.icon;
  const unit = spec.unit ?? { singular: "registro", plural: "registros" };
  const n = data?.rowsInRange;
  const views = meta.views;

  return (
    <header className="flex flex-col gap-3 pb-5 pt-6 lg:pt-8 @min-[1040px]/page:flex-row @min-[1040px]/page:items-center @min-[1040px]/page:justify-between @min-[1040px]/page:gap-6">
      {/* Grid: el tile ocupa las dos filas (título y descripción) desde 600 px; en el teléfono la descripción baja a todo el ancho */}
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 sm:gap-x-4">
        <ViewTransition name={`dash-icon-${meta.slug}`} share="morph" default="none">
          <span className="mod-tile grid size-12 shrink-0 place-items-center rounded-2xl sm:size-14 @min-[600px]/page:row-span-2">
            <Icon className="size-6 sm:size-7" aria-hidden />
          </span>
        </ViewTransition>
        <div className="min-w-0 self-center @min-[600px]/page:self-end">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-mod-ink">{mod?.label}</p>
          <ViewTransition name={`dash-title-${meta.slug}`} share="morph" default="none">
            <h1
              ref={heading}
              title={meta.title}
              className="mt-0.5 line-clamp-2 text-balance text-2xl font-bold leading-tight tracking-tight sm:line-clamp-1 sm:text-[30px] sm:leading-[1.2]"
            >
              {/* "Momento 2 · Transmisión": el separador se queda con la primera parte al partir la línea */}
              {meta.heading.replaceAll(" · ", "\u00a0· ")}
            </h1>
          </ViewTransition>
        </div>
        <p
          className="col-span-2 mt-2.5 line-clamp-3 max-w-[75ch] self-start text-pretty text-sm text-muted @min-[600px]/page:col-span-1 @min-[600px]/page:col-start-2 @min-[600px]/page:mt-1 @min-[600px]/page:line-clamp-2"
          title={meta.description}
        >
          {meta.description}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 @min-[1040px]/page:justify-end">
        <p className="whitespace-nowrap text-sm text-text-2" aria-live="polite">
          {n === undefined ? (
            <span className="skeleton inline-block h-4 w-44 align-middle" aria-label="Cargando registros" />
          ) : (
            <>
              <strong className="tabular font-bold text-text">{formatInt(n)}</strong> {n === 1 ? unit.singular : unit.plural} en el periodo
            </>
          )}
        </p>
        <span aria-hidden className="hidden h-4 w-px bg-border sm:block" />
        <Tooltip
          side="bottom"
          focusable
          content={
            <span className="block">
              <span className="mb-1 block font-semibold">{views.length === 1 ? "Vista de origen" : "Vistas de origen"}</span>
              {views.map((v) => (
                <span key={v} className="block font-mono text-[11px] opacity-90">
                  {v}
                </span>
              ))}
            </span>
          }
        >
          <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-3 px-2.5 text-xs font-semibold text-text-2">
            <Database className="size-3.5" aria-hidden />
            {views.length === 1 ? "1 vista" : `${views.length} vistas`}
          </span>
        </Tooltip>
        <DataNotesPopover notes={spec.notes} />
      </div>
    </header>
  );
}
