"use client";

import { motion } from "motion/react";
import type { DashboardMeta, ModuleMeta } from "@/config/dashboards";
import type { CatalogItem, CatalogResponse } from "@/dashboards/dto";
import { DashboardCard, type WideKind } from "./dashboard-card";

interface Props {
  module: ModuleMeta;
  /** Tableros visibles del módulo (ya filtrados por la búsqueda). */
  items: DashboardMeta[];
  /** Total de tableros del módulo (sin filtrar). */
  total: number;
  catalog: Map<string, CatalogItem>;
  range: CatalogResponse["range"] | undefined;
  loading: boolean;
  failed: boolean;
  favorites: string[];
  onToggleFavorite: (slug: string) => void;
}

/**
 * Posición de cada tarjeta sin huérfanas (contenedor `mods`):
 * - ≥ 1000 px, grid de 12: 3 → 4/4/4 · 2 → 6/6 · 1 → 12 (tarjeta ancha). Por debajo de 1000 px una tarjeta
 *   de 4 columnas mide < 330 px y el título, la cifra y la salud se parten;
 * - 560–999 px, 2 columnas: la impar final (o la única) ocupa la fila y pasa a la variante ancha (≥ 640 px);
 * - < 560 px: una columna de filas compactas.
 * Cada tarjeta es subgrid de 3 filas (cabecera · cifra · salud): las hermanas comparten líneas base.
 */
function spanClass(count: number, index: number): string {
  if (count === 1) return "@min-[560px]/mods:col-span-2 @min-[1000px]/mods:col-span-12";
  if (count === 2) return "@min-[1000px]/mods:col-span-6";
  if (count % 2 === 1 && index === count - 1) return "@min-[560px]/mods:col-span-2 @min-[1000px]/mods:col-span-4";
  return "@min-[1000px]/mods:col-span-4";
}

function wideKind(count: number, index: number): WideKind | undefined {
  if (count === 1) return "single";
  if (count % 2 === 1 && index === count - 1) return "span";
  return undefined;
}

/** Sección de un módulo del Home: cabecera en soft/ink con ícono, nombre y resumen; tarjetas sin huérfanas. */
export function ModuleSection({ module, items, total, catalog, range, loading, failed, favorites, onToggleFavorite }: Props) {
  const Icon = module.icon;
  const titleId = `mod-${module.id}-titulo`;
  const filtered = items.length !== total;
  return (
    <section id={module.id} data-module={module.id} aria-labelledby={titleId} className="scroll-mt-[136px]">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "0px 0px -24px 0px" }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="flex min-h-11 items-center gap-3 rounded-2xl bg-mod-soft px-2 py-1.5 sm:pl-2 sm:pr-3"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-surface text-mod-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)] ring-1 ring-mod/15">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 @min-[640px]/mods:flex @min-[640px]/mods:items-baseline @min-[640px]/mods:gap-3">
          <h2 id={titleId} className="truncate text-[15px] font-bold leading-5 tracking-tight text-mod-ink @min-[640px]/mods:shrink-0">
            {module.label}
          </h2>
          {/* En móvil el resumen se oculta: la cabecera queda en una línea de 44 px. */}
          <p className="min-w-0 truncate text-[13px] leading-[18px] text-text-2 @max-[560px]/mods:hidden">{module.summary}</p>
        </div>
        <span className="tabular shrink-0 rounded-full bg-surface/70 px-2 py-0.5 text-xs font-semibold text-mod-ink">
          {filtered ? `${items.length} de ${total}` : total}
          <span className="@max-[560px]/mods:sr-only"> {total === 1 && !filtered ? "tablero" : "tableros"}</span>
        </span>
      </motion.header>

      <ul role="list" className="mt-3 grid grid-cols-1 gap-3 @min-[560px]/mods:grid-cols-2 @min-[560px]/mods:gap-4 @min-[1000px]/mods:grid-cols-12">
        {items.map((d, i) => (
          <DashboardCard
            key={d.slug}
            meta={d}
            item={catalog.get(d.slug)}
            range={range}
            loading={loading}
            failed={failed}
            favorite={favorites.includes(d.slug)}
            onToggleFavorite={onToggleFavorite}
            index={i}
            wide={wideKind(items.length, i)}
            className={spanClass(items.length, i)}
          />
        ))}
      </ul>
    </section>
  );
}
