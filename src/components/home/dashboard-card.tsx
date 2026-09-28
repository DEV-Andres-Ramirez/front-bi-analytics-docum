"use client";

import { ArrowRight, BellRing, Coins, Grid3x3, Info, MapPinned, Star, Timer, TriangleAlert, Users, Workflow, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState, ViewTransition } from "react";
import { CountUp } from "@/components/ui/count-up";
import { Tooltip } from "@/components/ui/tooltip";
import { DeltaChip } from "@/components/widgets/kit/delta-chip";
import type { DashboardFeature, DashboardMeta } from "@/config/dashboards";
import type { CatalogFigure, CatalogItem, CatalogResponse } from "@/dashboards/dto";
import { cn } from "@/lib/cn";
import { todayISO } from "@/lib/dates";
import { formatValue } from "@/lib/format";
import { FEATURE_LABEL, figureShort, fold, healthNote, heroShort } from "./home-data";
import { MicroColumns } from "./micro-columns";

/** Capacidades del tablero (íconos con tooltip en la fila de salud). */
const FEATURE_ICON: Record<DashboardFeature, LucideIcon> = {
  mapa: MapPinned,
  sla: Timer,
  matriz: Grid3x3,
  flujo: Workflow,
  responsables: Users,
  valor: Coins,
  notificaciones: BellRing,
};

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Tarjeta que ocupa la fila completa:
 * - "single": módulo de un solo tablero (Tutelas), ancha desde 640 px de contenedor `mods`;
 * - "span": la impar final en la grilla de 2 columnas (560–999 px), ancha entre 640 y 999 px.
 * Se decide con el contenedor `mods` porque la tarjeta es subgrid y no puede ser contenedor (la
 * contención de layout de `container-type` anula el subgrid). Clases literales para que Tailwind las genere.
 */
export type WideKind = "single" | "span";

const WIDE_LINK: Record<WideKind, string> = {
  single: "@min-[640px]/mods:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] @min-[640px]/mods:gap-x-8",
  span: "@min-[640px]/mods:@max-[1000px]/mods:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] @min-[640px]/mods:@max-[1000px]/mods:gap-x-8",
};
const WIDE_SHOW: Record<WideKind, string> = {
  single: "@min-[640px]/mods:block",
  span: "@min-[640px]/mods:@max-[1000px]/mods:block",
};
const WIDE_HIDE: Record<WideKind, string> = {
  single: "@min-[640px]/mods:hidden",
  span: "@min-[640px]/mods:@max-[1000px]/mods:hidden",
};

interface Props {
  meta: DashboardMeta;
  item: CatalogItem | undefined;
  range: CatalogResponse["range"] | undefined;
  loading: boolean;
  /** El catálogo falló (las cifras se muestran como "—"). */
  failed: boolean;
  favorite: boolean;
  onToggleFavorite: (slug: string) => void;
  /** Posición en la sección (entrada escalonada, tope 240 ms). */
  index: number;
  /** La tarjeta ocupa la fila completa (ver WideKind). */
  wide?: WideKind;
  className?: string;
}

/**
 * DashboardCard (Home v2, ≈ 196 px).
 * - Fila 1: tile del módulo (dash-icon) + título corto en 1 línea (dash-title) + resumen.
 * - Fila 2: KPI titular con CountUp + DeltaChip con polaridad + micro-columnas del mes.
 * - Fila 3 (tras hairline): KPI de salud con su variación y capacidades del tablero.
 * Las tres filas son subgrid de la sección: la cifra y el pie comparten línea en toda la fila de tarjetas,
 * aunque el título o el resumen de una hermana ocupe más líneas.
 * Con el contenedor `mods` por debajo de 560 px pasa a fila compacta de 72 px.
 * La estrella de favorito va FUERA del enlace y siempre abajo a la derecha.
 */
export function DashboardCard({ meta, item, range, loading, failed, favorite, onToggleFavorite, index, wide, className }: Props) {
  const Icon = meta.icon;
  const hero = item?.hero ?? null;
  const [announce, setAnnounce] = useState("");
  const heroLabel = heroShort(meta.slug, hero);
  // En la fila compacta el subtítulo nunca repite el título.
  const rowSubtitle = fold(heroLabel) === fold(meta.short) ? meta.summary : heroLabel;
  const partialLast = Boolean(range && range.to === todayISO());

  const toggle = () => {
    setAnnounce(favorite ? `${meta.short} se quitó de favoritos` : `${meta.short} se agregó a favoritos`);
    onToggleFavorite(meta.slug);
  };

  return (
    <motion.li
      data-module={meta.module}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -24px 0px" }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.06, 0.24), ease: EASE }}
      className={cn("relative min-w-0 @min-[560px]/mods:row-span-3 @min-[560px]/mods:grid @min-[560px]/mods:grid-rows-subgrid", className)}
    >
      <Link
        href={`/tableros/${meta.slug}`}
        className={cn(
          "group card relative grid h-full min-w-0 grid-cols-1 gap-y-3.5 overflow-hidden p-[18px] transition-[translate,border-color,box-shadow] duration-200 ease-out",
          "@min-[560px]/mods:row-span-3 @min-[560px]/mods:grid-rows-subgrid",
          "hover:-translate-y-0.5 hover:border-mod/35 hover:shadow-mod focus-visible:border-mod/35 focus-visible:shadow-mod motion-reduce:hover:translate-y-0",
          "@max-[560px]/mods:min-h-[72px] @max-[560px]/mods:grid-cols-[minmax(0,1fr)_auto] @max-[560px]/mods:items-center @max-[560px]/mods:gap-x-3 @max-[560px]/mods:rounded-2xl @max-[560px]/mods:py-3 @max-[560px]/mods:pl-3.5 @max-[560px]/mods:pr-12",
          wide && WIDE_LINK[wide],
        )}
      >
        {/* Barra superior de 3 px en el color del módulo (hover / foco) */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 bg-mod transition-transform duration-300 ease-out group-hover:scale-x-100 group-focus-visible:scale-x-100"
        />

        {/* Fila 1 · tile + título corto + resumen */}
        <div className="col-start-1 row-start-1 grid min-w-0 grid-cols-[40px_minmax(0,1fr)] items-start gap-x-3 @max-[560px]/mods:items-center">
          <ViewTransition name={`dash-icon-${meta.slug}`} share="morph" default="none">
            <span className="mod-tile grid size-10 place-items-center rounded-xl transition-transform duration-300 group-hover:-rotate-3 motion-reduce:group-hover:rotate-0">
              <Icon className="size-5" aria-hidden />
            </span>
          </ViewTransition>
          <div className="min-w-0 @min-[560px]/mods:pt-px">
            <div className="flex min-w-0 items-center gap-1.5">
              <ViewTransition name={`dash-title-${meta.slug}`} share="morph" default="none">
                <h3
                  title={meta.title}
                  className="min-w-0 truncate text-[15px] font-bold leading-5 tracking-tight text-text transition-colors group-hover:text-mod-ink group-focus-visible:text-mod-ink @max-[560px]/mods:text-[14px]"
                >
                  {meta.short}
                </h3>
              </ViewTransition>
              <ArrowRight
                aria-hidden
                className="size-4 shrink-0 -translate-x-1 text-mod-ink opacity-0 transition duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 @max-[560px]/mods:hidden"
              />
            </div>
            <p className="mt-1 line-clamp-2 text-pretty text-[13px] leading-[18px] text-muted @max-[560px]/mods:hidden">{meta.summary}</p>
            <p className="mt-0.5 truncate text-xs leading-4 text-muted @min-[560px]/mods:hidden">{rowSubtitle}</p>
          </div>
        </div>

        {/* Fila 2 · KPI titular: etiqueta; cifra + variación a la izquierda y micro-columnas a la derecha */}
        <div className="col-start-1 row-start-2 min-w-0 self-end @max-[560px]/mods:col-start-2 @max-[560px]/mods:row-start-1 @max-[560px]/mods:self-center">
          {loading ? (
            <span className="skeleton block h-3 w-24 @max-[560px]/mods:hidden" />
          ) : (
            <p className="truncate text-xs font-medium leading-4 text-muted @max-[560px]/mods:hidden">{heroLabel}</p>
          )}
          <div className="mt-1 flex min-w-0 items-end justify-between gap-3 @max-[560px]/mods:mt-0">
            <HeroFigure hero={hero} loading={loading} failed={failed} range={range} />
            {/* Ancho fluido (96–184 px): cede espacio antes de que la cifra y su variación se partan. */}
            <div className={cn("w-[clamp(96px,calc(100%-180px),184px)] min-w-20 shrink @max-[560px]/mods:hidden", wide && WIDE_HIDE[wide])}>
              {loading ? (
                <span className="skeleton block h-10 w-full" />
              ) : hero && range ? (
                <MicroColumns values={hero.spark} from={range.from} format={hero.format} label={`${hero.label} por día`} partialLast={partialLast} />
              ) : null}
            </div>
          </div>
        </div>

        {/* Fila 3 · salud + capacidades (pr-7 reserva la estrella) */}
        <div className="@container/foot col-start-1 row-start-3 flex min-h-8 min-w-0 items-center justify-between gap-3 border-t border-[var(--hairline)] pr-7 pt-3 @max-[560px]/mods:hidden">
          <HealthLine slug={meta.slug} fig={item?.health ?? null} loading={loading} failed={failed} range={range} />
          <ul className="flex shrink-0 items-center gap-0.5 @max-[272px]/foot:hidden" aria-label="Incluye">
            {meta.features.map((f) => {
              const FIcon = FEATURE_ICON[f];
              return (
                <li key={f}>
                  <Tooltip content={FEATURE_LABEL[f]}>
                    <span className="grid size-5 place-items-center rounded-md text-muted transition-colors group-hover:text-text-2">
                      <FIcon className="size-3.5" aria-hidden />
                      <span className="sr-only">{FEATURE_LABEL[f]}</span>
                    </span>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Variante ancha: micro-columnas de 112 px con ticks, promedio y máximo (columna derecha, filas 1–3) */}
        {wide && (
          <div className={cn("col-start-2 row-[1/span_3] hidden min-w-0 self-end pr-7", WIDE_SHOW[wide])}>
            {loading ? (
              <span className="skeleton block h-[172px] w-full" />
            ) : hero && range ? (
              <MicroColumns variant="wide" values={hero.spark} from={range.from} format={hero.format} label={`${hero.label} por día`} partialLast={partialLast} />
            ) : null}
          </div>
        )}
      </Link>

      {/* Favorito (fuera del enlace), centrado con la fila de salud */}
      <button
        type="button"
        onClick={toggle}
        aria-pressed={favorite}
        aria-label={`Favorito: ${meta.short}`}
        title={favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
        className={cn(
          "absolute bottom-[19px] right-2.5 grid size-8 place-items-center rounded-full transition-colors",
          "@max-[560px]/mods:bottom-auto @max-[560px]/mods:right-2 @max-[560px]/mods:top-1/2 @max-[560px]/mods:-translate-y-1/2",
          favorite ? "text-primary hover:bg-primary-soft" : "text-muted hover:bg-surface-3 hover:text-text",
        )}
      >
        <Star className={cn("size-[18px]", favorite && "fill-current")} aria-hidden />
      </button>
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </motion.li>
  );
}

function HeroFigure({ hero, loading, failed, range }: { hero: CatalogFigure | null; loading: boolean; failed: boolean; range: CatalogResponse["range"] | undefined }) {
  if (loading) {
    return <span className="skeleton block h-8 w-28 shrink-0 @max-[560px]/mods:h-5 @max-[560px]/mods:w-14" />;
  }
  const format = hero?.format ?? "int";
  // Los días llevan la unidad aparte (más pequeña) para que la cifra y su variación quepan en una línea.
  const fmt = (n: number) => (format === "days" ? formatValue(n, "days").replace(/\s+días?$/, "") : formatValue(n, format, { compact: true }));
  const unit = format === "days" && hero?.value !== null && hero?.value !== undefined ? (Math.abs(hero.value) === 1 ? "día" : "días") : null;
  return (
    <div className="flex shrink-0 flex-nowrap items-center gap-x-2 @max-[560px]/mods:flex-col @max-[560px]/mods:items-end @max-[560px]/mods:gap-0.5">
      {hero && hero.value !== null ? (
        <span className="tabular whitespace-nowrap text-[28px] font-bold leading-8 tracking-tight text-text @max-[560px]/mods:text-lg @max-[560px]/mods:leading-6">
          <CountUp value={hero.value} format={fmt} />
          {unit && <span className="ml-1 text-base font-semibold tracking-normal text-text-2 @max-[560px]/mods:text-sm">{unit}</span>}
        </span>
      ) : (
        <Tooltip content={failed ? "No fue posible cargar la cifra del mes." : "Sin dato para el periodo."}>
          <span className="tabular text-[28px] font-bold leading-8 text-faint @max-[560px]/mods:text-lg @max-[560px]/mods:leading-6">—</span>
        </Tooltip>
      )}
      {hero && hero.value !== null && (
        <DeltaChip value={hero.value} previous={hero.previous} format={hero.format} polarity={hero.polarity} prevRange={range} size="md" className="shrink-0" />
      )}
    </div>
  );
}

function HealthLine({
  slug,
  fig,
  loading,
  failed,
  range,
}: {
  slug: string;
  fig: CatalogFigure | null;
  loading: boolean;
  failed: boolean;
  range: CatalogResponse["range"] | undefined;
}) {
  if (loading) return <span className="skeleton block h-4 w-32" />;
  if (!fig) return <span className="text-xs text-muted">{failed ? "Salud: —" : "Sin indicador de salud"}</span>;
  const note = healthNote(slug, fig);
  // Hallazgo de calidad de la vista (AGENTS §6): la cifra no informa; se muestra el aviso en su lugar.
  if (note?.kind === "quality") {
    return (
      <Tooltip content={<span className="block max-w-72">{note.hint}</span>} focusable className="min-w-0">
        <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-ink">
          <TriangleAlert className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{note.label}</span>
        </span>
      </Tooltip>
    );
  }
  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-x-1">
      <Tooltip content={fig.label} className="min-w-0">
        <span className="truncate text-xs font-medium text-muted">{figureShort(slug, fig)}</span>
      </Tooltip>
      <span className="tabular mr-0.5 shrink-0 whitespace-nowrap text-[13px] font-bold text-text">{formatValue(fig.value, fig.format, { compact: true })}</span>
      {note?.kind === "info" ? (
        <Tooltip content={<span className="block max-w-72">{note.hint}</span>} focusable className="shrink-0">
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-surface-3 px-1.5 py-px text-[11px] font-semibold text-text-2">
            <Info className="size-3" aria-hidden />
            {note.label}
          </span>
        </Tooltip>
      ) : (
        fig.value !== null && <DeltaChip value={fig.value} previous={fig.previous} format={fig.format} polarity={fig.polarity} prevRange={range} className="shrink-0" />
      )}
    </div>
  );
}
