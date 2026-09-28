"use client";

import { Star } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { DASHBOARD_BY_SLUG, type DashboardMeta } from "@/config/dashboards";
import { useElementSize } from "@/hooks/use-element-size";
import { cn } from "@/lib/cn";
import { fitChips, MODULE_BY_ID } from "./home-data";

const MAX = 6;
/** Líneas del carril antes de agrupar el resto en "+N". */
const LINES = 2;
/** Separación entre chips (gap-2) y ancho reservado para el chip "+N". */
const GAP = 8;
const MORE_WIDTH = 48;

const CHIP =
  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-3 text-[13px] font-semibold text-text-2 shadow-[0_1px_2px_rgb(0_0_0/0.04)]";

interface Item {
  meta: DashboardMeta;
  favorite: boolean;
}

interface Props {
  favorites: string[];
  recents: string[];
  className?: string;
}

/** Contenido del chip (ícono + título corto), compartido por el chip real y su medición. */
function ChipBody({ meta, favorite }: Item) {
  return (
    <>
      {favorite ? <Star className="size-3.5 shrink-0 fill-current text-primary" aria-hidden /> : <span aria-hidden className="size-2 shrink-0 rounded-full bg-mod" />}
      {meta.short}
    </>
  );
}

/**
 * QuickAccessRail: hasta 6 chips — primero favoritos (con estrella) y luego recientes (con el punto del módulo) —
 * con el título corto completo. Los chips se envuelven en 2 líneas como máximo; si no caben todos, el último lugar
 * es un chip "+N" que despliega el resto (ningún chip queda cortado a media palabra ni oculto sin aviso).
 * Los anchos se miden en una fila invisible (ResizeObserver: también reacciona a la carga de la fuente).
 */
export function QuickAccessRail({ favorites, recents, className }: Props) {
  const items = useMemo(() => {
    const out: Item[] = [];
    const seen = new Set<string>();
    for (const slug of favorites) {
      const meta = DASHBOARD_BY_SLUG[slug];
      if (meta && !seen.has(slug)) {
        seen.add(slug);
        out.push({ meta, favorite: true });
      }
    }
    for (const slug of recents) {
      const meta = DASHBOARD_BY_SLUG[slug];
      if (meta && !seen.has(slug)) {
        seen.add(slug);
        out.push({ meta, favorite: false });
      }
    }
    return out.slice(0, MAX);
  }, [favorites, recents]);

  const { ref: laneRef, width: lane } = useElementSize<HTMLUListElement>();
  const [widths, setWidths] = useState<number[]>([]);
  const [expanded, setExpanded] = useState(false);

  const measureRef = useCallback((el: HTMLUListElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const next = Array.from(el.children, (c) => (c as HTMLElement).offsetWidth);
      setWidths((w) => (w.length === next.length && w.every((v, i) => v === next[i]) ? w : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const measured = lane > 0 && widths.length === items.length;
  const fit = measured ? fitChips(widths, lane, GAP, LINES, MORE_WIDTH) : items.length;
  const shown = expanded ? items.length : fit;
  const hidden = items.length - shown;
  const signature = items.map((i) => i.meta.slug).join(",");

  return (
    <nav
      aria-label="Accesos rápidos"
      className={cn("relative flex min-h-8 min-w-0 items-start gap-x-2 gap-y-1.5 @max-[520px]/hero:flex-col", className)}
    >
      <span className="shrink-0 text-xs font-semibold leading-8 text-muted @max-[520px]/hero:leading-4">Accesos rápidos</span>
      {items.length === 0 ? (
        <span className="inline-flex min-h-8 min-w-0 items-center gap-1.5 text-xs text-muted">
          <Star className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 text-balance">Marca una tarjeta con la estrella para tenerla a mano.</span>
        </span>
      ) : (
        <>
          <ul
            ref={laneRef}
            className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-2 self-stretch @max-[520px]/hero:flex-none", !measured && "max-h-[72px] overflow-hidden")}
          >
            {items.slice(0, shown).map((item) => (
              <li key={item.meta.slug} data-module={item.meta.module} className="shrink-0">
                <Link href={`/tableros/${item.meta.slug}`} title={item.meta.title} className={cn(CHIP, "transition-colors hover:border-mod/40 hover:text-text")}>
                  <span className="sr-only">{item.favorite ? "Favorito: " : "Reciente: "}</span>
                  <ChipBody {...item} />
                  <span className="sr-only"> ({MODULE_BY_ID[item.meta.module].label})</span>
                </Link>
              </li>
            ))}
            {hidden > 0 && (
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  aria-expanded={false}
                  aria-label={`Mostrar ${hidden} ${hidden === 1 ? "acceso más" : "accesos más"}`}
                  className="tabular inline-flex h-8 items-center rounded-full border border-dashed border-border-strong px-2.5 text-[13px] font-semibold text-text-2 transition-colors hover:border-primary/50 hover:text-text"
                >
                  +{hidden}
                </button>
              </li>
            )}
            {expanded && fit < items.length && (
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  aria-expanded
                  className="inline-flex h-8 items-center rounded-full px-2.5 text-[13px] font-semibold text-muted transition-colors hover:text-text"
                >
                  Ver menos
                </button>
              </li>
            )}
          </ul>
          {/*
            Medición: la misma fila de chips, invisible, fuera del flujo y recortada a 0 × 0 (no genera scroll horizontal).
            Se vuelve a montar si cambian los accesos.
          */}
          <div aria-hidden className="pointer-events-none invisible absolute left-0 top-0 size-0 overflow-hidden">
            <ul key={signature} ref={measureRef} className="flex w-max gap-2">
              {items.map((item) => (
                <li key={item.meta.slug} data-module={item.meta.module} className={CHIP}>
                  <ChipBody {...item} />
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </nav>
  );
}
