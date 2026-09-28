"use client";

import { ArrowUpRight, Star } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { ViewTransition } from "react";
import { Sparkline } from "@/components/ui/sparkline";
import { Skeleton } from "@/components/ui/primitives";
import { MODULES, type DashboardMeta } from "@/config/dashboards";
import type { KpiResult } from "@/dashboards/dto";
import type { ValueFormat } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { formatDelta, formatValue } from "@/lib/format";

interface Props {
  meta: DashboardMeta;
  kpi?: { label: string; format: string; kpi: KpiResult | null };
  loading: boolean;
  favorite: boolean;
  onToggleFavorite: () => void;
  index: number;
}

export function DashboardCard({ meta, kpi, loading, favorite, onToggleFavorite, index }: Props) {
  const Icon = meta.icon;
  const mod = MODULES.find((m) => m.id === meta.module)!;
  const value = kpi?.kpi?.value ?? null;
  const delta = kpi?.kpi?.delta ?? null;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.04, 0.4), ease: [0.22, 1, 0.36, 1] }}
      className="group relative"
    >
      <Link
        href={`/tableros/${meta.slug}`}
        className="card relative flex h-full flex-col overflow-hidden p-5 transition duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-glow focus-visible:-translate-y-1"
      >
        {/* halo decorativo */}
        <span className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-primary/10 opacity-0 blur-2xl transition duration-500 group-hover:opacity-100" />

        <div className="flex items-start gap-3.5">
          <ViewTransition name={`dash-icon-${meta.slug}`} share="morph" default="none">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(145deg,#f39a33,#c05800)] text-white shadow-[0_10px_24px_-12px_rgb(192_88_0/0.8)] transition duration-300 group-hover:rotate-[-4deg] group-hover:scale-105">
              <Icon className="size-[22px]" />
            </span>
          </ViewTransition>
          <div className="min-w-0 flex-1 pr-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-faint">{mod.label}</p>
            <ViewTransition name={`dash-title-${meta.slug}`} share="morph" default="none">
              <h3 className="mt-0.5 text-[17px] font-bold leading-snug text-text">{meta.title}</h3>
            </ViewTransition>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">{meta.description}</p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {meta.tags.map((t) => (
            <span key={t} className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-text-2">
              {t}
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div className="min-w-0">
            {loading ? (
              <>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-7 w-28" />
              </>
            ) : (
              <>
                <p className="truncate text-xs font-medium text-muted" title={`${kpi?.label ?? ""} · mes actual`}>{kpi?.label ?? "—"}</p>
                <p className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-2xl font-bold tracking-tight">{formatValue(value, (kpi?.format ?? "int") as ValueFormat, { compact: true })}</span>
                  {delta !== null && (
                    <span className="text-xs font-semibold text-text-2" title="Variación frente al periodo anterior de igual duración">
                      {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {formatDelta(delta)}
                    </span>
                  )}
                </p>
              </>
            )}
          </div>
          {!loading && kpi?.kpi && <Sparkline values={kpi.kpi.spark} className="h-9 w-28 shrink-0" />}
        </div>

        <span className="absolute bottom-5 right-5 grid size-8 translate-x-2 place-items-center rounded-full bg-primary text-white opacity-0 transition duration-300 group-hover:translate-x-0 group-hover:opacity-100 max-sm:hidden">
          <ArrowUpRight className="size-4" />
        </span>
      </Link>

      <button
        type="button"
        onClick={onToggleFavorite}
        aria-pressed={favorite}
        aria-label={favorite ? `Quitar ${meta.title} de favoritos` : `Agregar ${meta.title} a favoritos`}
        className={cn(
          "absolute right-4 top-4 grid size-8 place-items-center rounded-full transition",
          favorite ? "text-primary" : "text-faint opacity-60 hover:bg-surface-3 hover:text-text hover:opacity-100",
        )}
      >
        <Star className={cn("size-[18px]", favorite && "fill-current")} />
      </button>
    </motion.li>
  );
}
