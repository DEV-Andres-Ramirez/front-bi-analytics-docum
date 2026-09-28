"use client";

import { Star } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { DASHBOARD_BY_SLUG, type DashboardMeta } from "@/config/dashboards";
import { cn } from "@/lib/cn";

const MAX = 6;

interface Props {
  favorites: string[];
  recents: string[];
  className?: string;
}

/**
 * QuickAccessRail: un solo carril de hasta 6 chips — primero favoritos (con estrella) y luego
 * recientes (con el punto del módulo). Título corto sin truncar; el carril desplaza en horizontal.
 */
export function QuickAccessRail({ favorites, recents, className }: Props) {
  const items = useMemo(() => {
    const out: { meta: DashboardMeta; favorite: boolean }[] = [];
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

  return (
    <nav aria-label="Accesos rápidos" className={cn("flex min-h-8 min-w-0 items-center gap-2", className)}>
      <span className="shrink-0 text-xs font-semibold text-muted">Accesos rápidos</span>
      {items.length === 0 ? (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted">
          <Star className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 text-balance">Marca una tarjeta con la estrella para tenerla a mano.</span>
        </span>
      ) : (
        <ul className="-my-1 flex min-w-0 items-center gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map(({ meta, favorite }) => (
            <li key={meta.slug} data-module={meta.module} className="shrink-0">
              <Link
                href={`/tableros/${meta.slug}`}
                title={meta.title}
                className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-3 text-[13px] font-semibold text-text-2 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors hover:border-mod/40 hover:text-text"
              >
                {favorite ? (
                  <Star className="size-3.5 shrink-0 fill-current text-primary" aria-hidden />
                ) : (
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-mod" />
                )}
                <span className="sr-only">{favorite ? "Favorito: " : "Reciente: "}</span>
                {meta.heading}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
