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
 * cada una como fila-enlace de 44 px, y el balance mejoraron / empeoraron / estables frente al periodo
 * anterior. Excluye la polaridad neutral; las bases pequeñas cuentan como estables. Colapsable en móvil.
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
      className={cn("card flex flex-col bg-[color-mix(in_oklab,var(--surface)_80%,transparent)] p-4 backdrop-blur-[2px]", className)}
    >
      <header className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary-soft-2 text-primary-text">
          <Activity className="size-4" aria-hidden />
        </span>
        <h2 id={`${listId}-t`} className="text-[15px] font-bold tracking-tight text-text">
          Pulso del mes
        </h2>
        <Tooltip
          focusable
          content={
            <span>
              Indicador de salud de cada tablero comparado con el periodo anterior de igual duración. No se incluyen los indicadores sin
              polaridad (p. ej. valor recibido) ni los que tienen un aviso de calidad de la vista. Las bases pequeñas y las variaciones
              menores de 1 p.p. (o del 3 % en conteos y días) cuentan como estables.
            </span>
          }
        >
          <span className="grid size-5 place-items-center rounded-full text-muted hover:text-text">
            <Info className="size-3.5" aria-hidden />
            <span className="sr-only">Cómo se calcula</span>
          </span>
        </Tooltip>
        {prev && !mobile && <span className="tabular ml-auto whitespace-nowrap text-xs text-muted">vs. {prev}</span>}
        {mobile && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={expanded}
            aria-controls={listId}
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-text-2 ring-1 ring-border transition-colors hover:text-text"
          >
            {open ? "Ocultar" : "Ver señales"}
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        )}
      </header>

      <div id={listId} hidden={!expanded} className="mt-1.5">
        <p className="text-xs leading-4 text-muted">Indicadores de salud que más empeoraron</p>
        {loading ? (
          <ul className="mt-2 space-y-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex h-10 items-center gap-3">
                <span className="skeleton size-2 rounded-full" />
                <span className="flex-1 space-y-1.5">
                  <span className="skeleton block h-3 w-3/5" />
                  <span className="skeleton block h-2.5 w-2/5" />
                </span>
                <span className="skeleton block h-5 w-20" />
              </li>
            ))}
          </ul>
        ) : failed || !pulse ? (
          <p className="mt-3 rounded-xl bg-surface-3 px-3 py-2.5 text-xs text-text-2">No fue posible calcular el pulso del mes.</p>
        ) : pulse.top.length === 0 ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-good-soft px-3 py-2.5 text-[13px] font-medium text-good-ink">
            <StatusIcon tone="good" className="mt-0.5 size-4" />
            Ningún indicador de salud empeoró frente al periodo anterior.
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-[var(--hairline)]">
            {pulse.top.map((s) => (
              <li key={s.meta.slug} data-module={s.meta.module}>
                {/* Punto · título y KPI · valor · chip: valores y chips forman columnas alineadas a la derecha. */}
                <Link
                  href={`/tableros/${s.meta.slug}`}
                  className="group -mx-2 grid min-h-10 grid-cols-[8px_minmax(0,1fr)_auto_88px] items-center gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-surface-3"
                >
                  <span aria-hidden className="size-2 rounded-full bg-mod" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold leading-4 text-text group-hover:text-mod-ink">{s.meta.short}</span>
                    <span className="mt-0.5 block truncate text-[11px] leading-4 text-muted">
                      {s.module.short} · {figureShort(s.meta.slug, s.fig)}
                    </span>
                  </span>
                  <span className="tabular text-right text-sm font-bold text-text">{formatValue(s.fig.value, s.fig.format, { compact: true })}</span>
                  <DeltaChip value={s.fig.value} previous={s.fig.previous} format={s.fig.format} polarity={s.fig.polarity} prevRange={range} className="justify-self-end" />
                </Link>
              </li>
            ))}
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
      <div className="mt-auto pt-3" aria-hidden>
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
    <div className="mt-auto border-t border-[var(--hairline)] pt-2.5">
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {parts
          .filter((p) => p.n > 0)
          .map((p) => (
            <span key={p.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ flexGrow: p.n, background: p.color }} />
          ))}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-2">
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
