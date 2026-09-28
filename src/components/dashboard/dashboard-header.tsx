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
 * eyebrow del módulo en --mod-ink, H1 corto en una línea (dash-title-<slug>), descripción de hasta
 * dos líneas (nunca cortada a media frase en escritorio) y, a la derecha, "N radicados en el periodo · N vistas · N notas de datos".
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
    <header className="flex flex-col gap-3 pb-5 pt-6 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:pt-8">
      <div className="flex min-w-0 items-center gap-3.5 sm:gap-4">
        <ViewTransition name={`dash-icon-${meta.slug}`} share="morph" default="none">
          <span className="mod-tile grid size-12 shrink-0 place-items-center rounded-2xl sm:size-14">
            <Icon className="size-6 sm:size-7" aria-hidden />
          </span>
        </ViewTransition>
        <div className="min-w-0">
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
          <p className="mt-1 line-clamp-2 max-w-[75ch] text-pretty text-sm text-muted" title={meta.description}>
            {meta.description}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 lg:justify-end">
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
