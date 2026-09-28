"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Database, FlaskConical, Info, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, ViewTransition } from "react";
import { Badge } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import { DASHBOARD_BY_SLUG, MODULES } from "@/config/dashboards";
import type { DashboardResponse } from "@/dashboards/dto";
import { SPECS } from "@/dashboards/specs";
import { useRecents } from "@/hooks/use-recents";
import { cn } from "@/lib/cn";
import { formatRange } from "@/lib/dates";
import { formatInt } from "@/lib/format";
import { DashboardProvider, useUrlFilters } from "./dashboard-context";
import { DetailTable } from "./detail-table";
import { FilterBar } from "./filters";
import { KpiCard } from "./kpi-card";
import { DashboardSection } from "./section";

export function DashboardView({ slug }: { slug: string }) {
  const spec = SPECS[slug];
  const meta = DASHBOARD_BY_SLUG[slug];
  const mod = MODULES.find((m) => m.id === meta.module)!;
  const { filters, qs, actions } = useUrlFilters();
  const { push } = useRecents();
  const router = useRouter();

  useEffect(() => push(slug), [slug, push]);

  const query = useQuery({
    queryKey: ["tablero", slug, qs],
    queryFn: async ({ signal }): Promise<DashboardResponse> => {
      const res = await fetch(`/api/tableros/${slug}?${qs}`, { signal, cache: "no-store" });
      if (res.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        throw new Error("Sesión expirada");
      }
      if (!res.ok) throw new Error("No fue posible cargar el tablero");
      return res.json();
    },
    placeholderData: keepPreviousData,
  });

  const { data, isFetching, isError, refetch } = query;
  const ctx = useMemo(
    () => ({
      spec,
      meta,
      filters,
      qs,
      data,
      isFetching,
      isError,
      refetch: () => void refetch(),
      ...actions,
    }),
    [spec, meta, filters, qs, data, isFetching, isError, refetch, actions],
  );

  const Icon = meta.icon;
  const kpiCols = spec.kpis.length >= 6 ? "xl:grid-cols-6" : spec.kpis.length === 5 ? "xl:grid-cols-5" : spec.kpis.length === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3";

  return (
    <DashboardProvider value={ctx}>
      <div className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-6 lg:px-10">
        {/* Encabezado */}
        <header className="relative pb-5 pt-6 lg:pt-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <ViewTransition name={`dash-icon-${slug}`} share="morph" default="none">
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(145deg,#f39a33,#c05800)] text-white shadow-[0_12px_28px_-14px_rgb(192_88_0/0.9)]">
                  <Icon className="size-7" />
                </span>
              </ViewTransition>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary-strong">{mod.label}</p>
                <ViewTransition name={`dash-title-${slug}`} share="morph" default="none">
                  <h1 className="mt-0.5 text-balance text-2xl font-bold tracking-tight sm:text-3xl">{meta.title}</h1>
                </ViewTransition>
                <p className="mt-1.5 max-w-3xl text-sm text-muted">{meta.description}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {query.data?.source === "mock" && (
                <Tooltip content="Datos sintéticos generados a partir de distribuciones anonimizadas de las vistas reales. Se reemplazarán por la base de datos.">
                  <Badge tone="warning" icon={<FlaskConical className="size-3" />}>
                    Datos de prueba
                  </Badge>
                </Tooltip>
              )}
              <Tooltip content={`Fuente: ${meta.views.join(", ")}`}>
                <Badge icon={<Database className="size-3" />}>{meta.views.length > 1 ? `${meta.views.length} vistas` : "1 vista"}</Badge>
              </Tooltip>
              {query.data && (
                <span className="text-xs text-muted">
                  {formatInt(query.data.rowsInRange)} registros · {formatRange(filters.from, filters.to)} · {spec.dateLabel.toLowerCase()}
                </span>
              )}
            </div>
          </div>
          {spec.notes && spec.notes.length > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-info/25 bg-info-soft px-4 py-3 text-xs text-info-ink">
              <Info className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-1">
                {spec.notes.map((n) => (
                  <p key={n}>{n}</p>
                ))}
              </div>
            </div>
          )}
        </header>

        <FilterBar />

        {query.isError && !query.data && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-critical/30 bg-critical-soft px-4 py-3 text-sm text-critical-ink">
            <AlertTriangle className="size-5" />
            No fue posible cargar el tablero.
            <button type="button" onClick={() => query.refetch()} className="ml-auto inline-flex items-center gap-1 font-semibold">
              <RotateCcw className="size-4" /> Reintentar
            </button>
          </div>
        )}

        {/* KPIs */}
        <section aria-label="Indicadores clave" className={cn("mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3", kpiCols)}>
          {spec.kpis.map((k, i) => (
            <KpiCard key={k.id} def={k} index={i} loading={query.isLoading} result={query.data?.kpis.find((r) => r.id === k.id)} prevRange={query.data?.range} />
          ))}
        </section>

        {/* Secciones */}
        <div className="mt-10 space-y-10">
          {spec.sections.map((s, i) => (
            <DashboardSection key={s.id} section={s} index={i} />
          ))}
          <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <DetailTable />
          </motion.div>
        </div>
      </div>
    </DashboardProvider>
  );
}
