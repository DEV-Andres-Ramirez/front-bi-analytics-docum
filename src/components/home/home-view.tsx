"use client";

import { RefreshCw, SearchX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCatalog } from "@/components/shell/shell-hooks";
import { StatusIcon } from "@/components/widgets/kit/status-icon";
import { DASHBOARDS, MODULES, type ModuleId } from "@/config/dashboards";
import type { CatalogItem } from "@/dashboards/dto";
import { useFavorites, useRecents } from "@/hooks/use-recents";
import { cn } from "@/lib/cn";
import { computePulse, matchesQuery } from "./home-data";
import { HomeHero } from "./home-hero";
import { ModuleNav } from "./module-nav";
import { ModuleSection } from "./module-section";

/** Pie global de convenciones (shellRedesign §6). */
const FOOTER_NOTES = ["Variación vs. periodo anterior de igual duración", "p.p. = puntos porcentuales", "verde y rojo según si subir es bueno"];

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
}

/**
 * Home v2 · "Centro de mando documental".
 * HomeHero (saludo, buscador en sitio, accesos rápidos y Pulso del mes) → ModuleNav sticky →
 * seis ModuleSection en el orden de MODULES → pie de convenciones.
 * Las cifras salen de /api/catalogo (clave ["catalogo"], staleTime 5 min, compartida con la paleta ⌘K).
 */
export function HomeView({ source }: { source: "mock" | "db" }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { favorites, toggle } = useFavorites();
  const { recents } = useRecents();
  const { data, isLoading, isError, isFetching, refetch } = useCatalog(true);

  const failed = isError && !data;
  const loading = isLoading && !data;
  const catalog = useMemo(() => new Map<string, CatalogItem>((data?.items ?? []).map((i) => [i.slug, i])), [data]);
  const pulse = useMemo(() => (data ? computePulse(data.items) : null), [data]);

  const groups = useMemo(
    () =>
      MODULES.map((m) => {
        const all = DASHBOARDS.filter((d) => d.module === m.id);
        return { module: m, total: all.length, items: all.filter((d) => matchesQuery(d, query)) };
      }),
    [query],
  );
  const counts = useMemo(() => Object.fromEntries(groups.map((g) => [g.module.id, g.items.length])) as Record<ModuleId, number>, [groups]);
  const results = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const searching = query.trim().length > 0;

  // "/" enfoca el buscador (fuera de campos de texto).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openFirst = useCallback(() => {
    const first = results[0];
    if (first) router.push(`/tableros/${first.slug}`);
  }, [results, router]);

  const clear = useCallback(() => {
    setQuery("");
    inputRef.current?.focus();
  }, []);

  const dataSource = data?.source ?? source;

  return (
    <div className="relative">
      <HomeHero
        query={query}
        onQueryChange={setQuery}
        onOpenFirst={openFirst}
        inputRef={inputRef}
        favorites={favorites}
        recents={recents}
        pulse={pulse}
        range={data?.range}
        loading={loading}
        failed={failed}
      />

      <ModuleNav counts={counts} searching={searching} />

      <div className="@container/mods mx-auto max-w-[var(--content-max)] px-4 pb-8 pt-6 sm:px-6 lg:px-10">
        {failed && (
          <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl bg-critical-soft px-4 py-3 text-sm text-critical-ink">
            <StatusIcon tone="critical" className="size-4" />
            <p className="min-w-0 flex-1 font-medium">No fue posible cargar las cifras del mes. Las tarjetas muestran “—” mientras tanto.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-semibold text-text ring-1 ring-border transition-colors hover:ring-border-strong disabled:opacity-60"
            >
              <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} aria-hidden />
              Reintentar
            </button>
          </div>
        )}

        <p aria-live="polite" className={cn("text-sm text-text-2", searching ? "mb-5" : "sr-only")}>
          {searching && (
            <>
              <span className="tabular font-bold text-text">{results.length}</span> {results.length === 1 ? "tablero" : "tableros"} para “{query.trim()}”
              {results.length > 0 && <span className="text-muted"> · Enter abre el primero</span>}
            </>
          )}
        </p>

        <div id="home-catalogo">
          {results.length === 0 ? (
            <div className="card flex flex-col items-center px-6 py-14 text-center">
              <span className="grid size-11 place-items-center rounded-2xl bg-surface-3 text-muted">
                <SearchX className="size-5" aria-hidden />
              </span>
              <p className="mt-3 font-semibold text-text">No encontramos tableros para “{query.trim()}”.</p>
              <p className="mt-1 text-sm text-muted">Prueba con el nombre del módulo, un tema (SLA, mapa, RADIAN) o una palabra más corta.</p>
              <button type="button" onClick={clear} className="mt-4 text-sm font-semibold text-primary-text hover:underline">
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-6 @min-[560px]/mods:gap-10">
              {groups
                .filter((g) => g.items.length > 0)
                .map((g) => (
                  <ModuleSection
                    key={g.module.id}
                    module={g.module}
                    items={g.items}
                    total={g.total}
                    catalog={catalog}
                    range={data?.range}
                    loading={loading}
                    failed={failed}
                    favorites={favorites}
                    onToggleFavorite={toggle}
                  />
                ))}
            </div>
          )}
        </div>

        {/* Pie global de convenciones */}
        {/* Cada convención es un bloque que no se parte; el punto separador se recorta al inicio de cada línea. */}
        <footer className="mt-14 overflow-hidden border-t border-border pt-5 text-xs leading-relaxed text-muted">
          <p className="-ml-[19px] flex flex-wrap">
            {FOOTER_NOTES.concat(`Fuente: vistas SGDEA${dataSource === "mock" ? " (datos de prueba)" : ""}`).map((t) => (
              <span key={t} className="inline-flex items-center before:mx-2 before:size-[3px] before:shrink-0 before:rounded-full before:bg-current">
                {t}
              </span>
            ))}
          </p>
        </footer>
      </div>
    </div>
  );
}
