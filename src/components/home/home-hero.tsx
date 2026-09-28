"use client";

import { CalendarDays, Search, X } from "lucide-react";
import { motion } from "motion/react";
import type { KeyboardEvent, RefObject } from "react";
import { DASHBOARDS, MODULES } from "@/config/dashboards";
import type { CatalogResponse } from "@/dashboards/dto";
import { defaultRange } from "@/lib/dates";
import { ColombiaDots } from "./colombia-dots";
import { compactRange, greetingFor, longToday, nowBogotaHour, type Pulse } from "./home-data";
import { PulseSummary } from "./pulse-summary";
import { QuickAccessRail } from "./quick-access-rail";

const EASE = [0.22, 1, 0.36, 1] as const;
const enter = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, delay: Math.min(i * 0.06, 0.24), ease: EASE },
});

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  /** Enter en el buscador: abre el primer resultado. */
  onOpenFirst: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  favorites: string[];
  recents: string[];
  pulse: Pulse | null;
  range: CatalogResponse["range"] | undefined;
  loading: boolean;
  failed: boolean;
}

/**
 * HomeHero compacto (≈ 290 px a 1440): grid 7/5 con @container.
 * Izquierda: fecha y periodo, saludo según la hora de Bogotá, contexto, buscador en sitio y accesos rápidos.
 * Derecha: Pulso del mes. Fondo: degradado --bg-accent → --bg con la silueta de Colombia en puntos.
 */
export function HomeHero({ query, onQueryChange, onOpenFirst, inputRef, favorites, recents, pulse, range, loading, failed }: Props) {
  const period = range ?? { ...defaultRange() };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onOpenFirst();
    } else if (e.key === "Escape") {
      if (query) {
        e.preventDefault();
        onQueryChange("");
      } else {
        e.currentTarget.blur();
      }
    }
  };

  return (
    <section
      aria-labelledby="home-saludo"
      className="relative overflow-hidden border-b border-border bg-[linear-gradient(180deg,var(--bg-accent)_0%,var(--bg)_100%)]"
    >
      <div className="@container/hero relative mx-auto max-w-[var(--content-max)] px-4 pb-4 pt-3 sm:px-5 xl:px-8">
        {/*
          Silueta decorativa. En escritorio va en el hueco entre el buscador (termina a 40 + 480 px) y el Pulso
          (empieza a 41,667 % − 12 px del borde derecho): solo cabe completa desde 1070 px de contenido (1150 con el padding); por debajo se oculta.
        */}
        <ColombiaDots
          dot={1.2}
          accentClassName="text-text-2/40"
          className="absolute -right-6 -top-2 h-[210px] text-primary/15 @min-[760px]/hero:hidden @min-[1070px]/hero:right-[calc(41.667%-2px)] @min-[1070px]/hero:top-1/2 @min-[1070px]/hero:block @min-[1070px]/hero:h-[200px] @min-[1070px]/hero:-translate-y-1/2 dark:text-primary/20"
        />

        <div className="relative grid gap-5 @min-[760px]/hero:grid-cols-12 @min-[760px]/hero:gap-8">
          <div className="flex min-w-0 flex-col justify-start @min-[760px]/hero:col-span-6 @min-[760px]/hero:pt-1 @min-[1000px]/hero:col-span-7">
            {/*
              Fecha y periodo como dos bloques que no se parten. El separador es un punto dibujado antes del 2.º bloque;
              el margen negativo + overflow-hidden lo recorta cuando ese bloque baja a otra línea (nunca queda colgando).
            */}
            <motion.p {...enter(0)} className="overflow-hidden text-[13px] font-medium text-muted">
              <span className="-ml-[19px] flex flex-wrap items-center gap-y-0.5">
                <span className="inline-flex items-center whitespace-nowrap before:mx-2 before:size-[3px] before:rounded-full before:bg-current">
                  <CalendarDays className="mr-2 size-3.5 shrink-0" aria-hidden />
                  <span suppressHydrationWarning>{longToday()}</span>
                </span>
                <span
                  className="tabular inline-flex items-center whitespace-nowrap before:mx-2 before:size-[3px] before:rounded-full before:bg-current"
                  suppressHydrationWarning
                >
                  Mes en curso: {compactRange(period.from, period.to)}
                </span>
              </span>
            </motion.p>
            <motion.h1
              {...enter(1)}
              id="home-saludo"
              className="mt-1.5 text-[26px] font-bold leading-tight tracking-tight text-text sm:text-[32px] sm:leading-10"
              suppressHydrationWarning
            >
              {greetingFor(nowBogotaHour())}
            </motion.h1>
            <motion.p {...enter(2)} className="mt-1 max-w-[500px] text-balance text-sm leading-5 text-text-2">
              {DASHBOARDS.length} tableros en {MODULES.length} módulos: cifra del mes, variación y salud de cada flujo.
            </motion.p>

            <motion.div {...enter(3)} role="search" className="group relative mt-3 w-full max-w-[480px]">
              <label htmlFor="home-search" className="sr-only">
                Buscar tablero
              </label>
              <Search
                className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted transition-colors group-focus-within:text-primary"
                aria-hidden
              />
              <input
                ref={inputRef}
                id="home-search"
                type="search"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={onKeyDown}
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="go"
                placeholder="Buscar tablero, módulo o tema…"
                aria-describedby="home-search-hint"
                aria-controls="home-catalogo"
                className="h-11 w-full rounded-xl border border-border bg-surface pl-11 pr-12 text-[15px] text-text shadow-card outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-[var(--ring)] [&::-webkit-search-cancel-button]:hidden"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    onQueryChange("");
                    inputRef.current?.focus();
                  }}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-text"
                >
                  <X className="size-4" aria-hidden />
                </button>
              ) : (
                <kbd
                  aria-hidden
                  className="pointer-events-none absolute right-3 top-1/2 grid h-6 min-w-6 -translate-y-1/2 place-items-center rounded-md border border-border bg-surface-2 px-1.5 font-sans text-xs font-semibold text-muted"
                >
                  /
                </kbd>
              )}
              <p id="home-search-hint" className="sr-only">
                Filtra los tableros mientras escribes. Enter abre el primer resultado y Escape limpia la búsqueda. Atajo: tecla barra.
              </p>
            </motion.div>

            <motion.div {...enter(4)} className="mt-3 min-w-0">
              <QuickAccessRail favorites={favorites} recents={recents} />
            </motion.div>
          </div>

          <motion.div {...enter(2)} className="min-w-0 @min-[760px]/hero:col-span-6 @min-[1000px]/hero:col-span-5">
            <PulseSummary pulse={pulse} range={range} loading={loading} failed={failed} className="h-full" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
