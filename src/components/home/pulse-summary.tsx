"use client";

import { Activity, ChevronDown, Info } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { DeltaChip } from "@/components/widgets/kit/delta-chip";
import { StatusIcon } from "@/components/widgets/kit/status-icon";
import type { CatalogResponse } from "@/dashboards/dto";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import { formatValue } from "@/lib/format";
import { compactRange, figureShort, type Pulse } from "./home-data";

interface Props {
  pulse: Pulse | null;
  range: CatalogResponse["range"] | undefined;
  loading: boolean;
  failed: boolean;
  className?: string;
}

/**
 * PulseSummary ("Pulso del mes"): las 3 señales de salud que más empeoraron (tono bad, mayor |Δ|),
 * cada una como fila-enlace, y el balance mejoraron / empeoraron / estables frente al periodo anterior.
 * El tono es el mismo de los chips de las tarjetas (describeDelta): el balance cuenta los chips verdes y rojos.
 * Excluye la polaridad neutral y los avisos de calidad; las bases pequeñas cuentan como estables. Colapsable en móvil.
 * Cada fila lleva el tile del módulo (la forma del ícono distingue módulos de color cercano) y, en un contenedor
 * angosto (< 360 px), apila cifra y chip para que el KPI —lo accionable— no se trunque.
 */
export function PulseSummary({ pulse, range, loading, failed, className }: Props) {
  const mobile = useMediaQuery("(max-width: 639.98px)");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const expanded = !mobile || open;
  const prev = range ? compactRange(range.prevFrom, range.prevTo) : null;

  return (
    <section
      aria-labelledby={`${listId}-t`}
      className={cn("@container/pulse card flex flex-col bg-[color-mix(in_oklab,var(--surface)_80%,transparent)] px-4 py-3.5 backdrop-blur-[2px]", className)}
    >
      {/* Cabecera en 2 líneas junto al ícono: título + qué lista (ahorra una fila frente al subtítulo suelto). */}
      <header className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft-2 text-primary-text">
          <Activity className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <h2 id={`${listId}-t`} className="text-[15px] font-bold leading-5 tracking-tight text-text">
              Pulso del mes
            </h2>
            <Tooltip
              focusable
              content={
                <span className="block max-w-80">
                  Indicador de salud de cada tablero frente al periodo anterior de igual duración, con la misma regla de los chips de las
                  tarjetas: verde si mejoró y rojo si empeoró según si subir es bueno. Cuentan como estables los que no cambian al redondear
                  (0,0) y las bases pequeñas (menos de 20 casos). No se incluyen los indicadores sin polaridad (p. ej. valor recibido) ni los
                  que tienen un aviso de calidad de la vista.
                </span>
              }
            >
              <span className="grid size-5 place-items-center rounded-full text-muted hover:text-text">
                <Info className="size-3.5" aria-hidden />
                <span className="sr-only">Cómo se calcula</span>
              </span>
            </Tooltip>
          </div>
          <p className="line-clamp-2 text-pretty text-xs leading-4 text-muted">Indicadores de salud que más empeoraron</p>
        </div>
        {prev && !mobile && <span className="tabular shrink-0 self-start whitespace-nowrap pt-0.5 text-xs text-muted">vs. {prev}</span>}
        {mobile && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={expanded}
            aria-controls={listId}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-text-2 ring-1 ring-border transition-colors hover:text-text"
          >
            {open ? "Ocultar" : "Ver señales"}
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        )}
      </header>

      <div id={listId} hidden={!expanded} className="mt-1.5">
        {loading ? (
          <ul className="space-y-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex h-8 items-center gap-3">
                <span className="skeleton size-6 rounded-md" />
                <span className="flex-1 space-y-1.5">
                  <span className="skeleton block h-3 w-3/5" />
                  <span className="skeleton block h-2.5 w-2/5" />
                </span>
                <span className="skeleton block h-5 w-20" />
              </li>
            ))}
          </ul>
        ) : failed || !pulse ? (
          <p className="rounded-xl bg-surface-3 px-3 py-2.5 text-xs text-text-2">No fue posible calcular el pulso del mes.</p>
        ) : pulse.top.length === 0 ? (
          <p className="flex items-start gap-2 rounded-xl bg-good-soft px-3 py-2.5 text-[13px] font-medium text-good-ink">
            <StatusIcon tone="good" className="mt-0.5 size-4" />
            Ningún indicador de salud empeoró frente al periodo anterior.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--hairline)]">
            {pulse.top.map((s) => {
              const Icon = s.meta.icon;
              return (
                <li key={s.meta.slug} data-module={s.meta.module}>
                  {/* Tile · tablero y KPI · valor · chip (valores y chips en columnas alineadas a la derecha). */}
                  <Link
                    href={`/tableros/${s.meta.slug}`}
                    className="group -mx-2 grid min-h-8 grid-cols-[24px_minmax(0,1fr)_auto_88px] items-center gap-x-3 rounded-lg px-2 py-px transition-colors hover:bg-surface-3 @max-[360px]/pulse:grid-cols-[24px_minmax(0,1fr)_auto]"
                  >
                    <span aria-hidden className="mod-tile grid size-6 place-items-center rounded-md">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold leading-4 text-text group-hover:text-mod-ink">{s.meta.heading}</span>
                      {/* El KPI va primero: es lo accionable y lo último que debe truncarse. */}
                      <span className="block truncate text-[11px] leading-[14px] text-muted">
                        {figureShort(s.fig)}
                        {s.module.short !== s.meta.heading && ` · ${s.module.short}`}
                      </span>
                    </span>
                    <span className="contents @max-[360px]/pulse:flex @max-[360px]/pulse:flex-col @max-[360px]/pulse:items-end @max-[360px]/pulse:gap-0.5">
                      <span className="tabular text-right text-sm font-bold leading-5 text-text">{formatValue(s.fig.value, s.fig.format, { compact: true })}</span>
                      <DeltaChip value={s.fig.value} previous={s.fig.previous} format={s.fig.format} polarity={s.fig.polarity} prevRange={range} className="justify-self-end" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!failed && <Balance pulse={pulse} loading={loading} prev={mobile ? prev : null} />}
    </section>
  );
}

/** Barra "mejoraron / empeoraron / estables" (ícono + etiqueta; el color nunca va solo). */
function Balance({ pulse, loading, prev }: { pulse: Pulse | null; loading: boolean; prev: string | null }) {
  if (loading || !pulse) {
    return (
      <div className="mt-auto pt-2" aria-hidden>
        <span className="skeleton block h-1.5 w-full rounded-full" />
        <span className="skeleton mt-2 block h-3 w-3/4" />
      </div>
    );
  }
  const parts = [
    { key: "good", n: pulse.improved, label: pulse.improved === 1 ? "mejoró" : "mejoraron", color: "var(--good)", tone: "good" as const },
    { key: "bad", n: pulse.worsened, label: pulse.worsened === 1 ? "empeoró" : "empeoraron", color: "var(--critical)", tone: "critical" as const },
    { key: "flat", n: pulse.stable, label: pulse.stable === 1 ? "estable" : "estables", color: "var(--neutral-mark)", tone: "neutral" as const },
  ];
  return (
    <div className="mt-auto border-t border-[var(--hairline)] pt-2">
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {parts
          .filter((p) => p.n > 0)
          .map((p) => (
            <span key={p.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ flexGrow: p.n, background: p.color }} />
          ))}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-2">
        {parts.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1">
            <StatusIcon tone={p.tone} />
            <span className="tabular font-bold text-text">{p.n}</span> {p.label}
          </span>
        ))}
        {prev && <span className="ml-auto whitespace-nowrap text-muted">vs. {prev}</span>}
      </p>
    </div>
  );
}
