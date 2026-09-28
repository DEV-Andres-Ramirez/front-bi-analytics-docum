"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { DASHBOARD_BY_SLUG } from "@/config/dashboards";
import type { DashboardResponse } from "@/dashboards/dto";
import { SPECS } from "@/dashboards/specs";
import { useRecents } from "@/hooks/use-recents";
import { clearTopbar, setTopbar, type TopbarSection } from "@/hooks/use-topbar";
import { DashboardProvider, useUrlFilters } from "./dashboard-context";
import { DashboardHeader } from "./dashboard-header";
import { DetailTable } from "./detail-table";
import { FilterBar } from "./filters";
import { KpiBand } from "./kpi-band";
import { formatSpan } from "./kpi/shared";
import { DashboardSection, useLayoutCheck } from "./section";

function LayoutCheck() {
  useLayoutCheck();
  return null;
}

export function DashboardView({ slug }: { slug: string }) {
  const spec = SPECS[slug];
  const meta = DASHBOARD_BY_SLUG[slug];
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

  const { data, isFetching, isError, refetch, dataUpdatedAt } = query;
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

  // ── Topbar: secciones (SectionNav), hora de los datos, origen y periodo ──────
  const sections = useMemo<TopbarSection[]>(
    () => [
      ...spec.sections.map((s) => ({ id: s.id, label: s.nav ?? s.title ?? s.question ?? s.id })),
      { id: "detalle", label: "Detalle" },
    ],
    [spec.sections],
  );
  useEffect(() => {
    setTopbar({ slug, sections });
    return () => clearTopbar(slug);
  }, [slug, sections]);
  useEffect(() => {
    setTopbar({ updatedAt: data ? dataUpdatedAt : 0, source: data?.source ?? null });
  }, [data, dataUpdatedAt]);
  useEffect(() => {
    setTopbar({ period: formatSpan(filters.from, filters.to) });
  }, [filters.from, filters.to]);

  // ── Deep link (#seccion): al llegar el primer dato, se reubica la sección ─────
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || !data) return;
    jumped.current = true;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const raf = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(raf);
  }, [data]);

  return (
    <DashboardProvider value={ctx}>
      <LayoutCheck />
      <div data-module={meta.module} className="dash-page mx-auto max-w-[var(--content-max)] px-4 pb-16 sm:px-5 xl:px-8">
        <DashboardHeader />

        <FilterBar />

        {query.isError && !query.data && (
          <div role="alert" className="mt-6 flex items-center gap-3 rounded-2xl border border-critical/30 bg-critical-soft px-4 py-3 text-sm text-critical-ink">
            <AlertTriangle className="size-5 shrink-0" aria-hidden />
            No fue posible cargar el tablero.
            <button type="button" onClick={() => query.refetch()} className="ml-auto inline-flex items-center gap-1 font-semibold">
              <RotateCcw className="size-4" aria-hidden /> Reintentar
            </button>
          </div>
        )}

        {/* KPIs */}
        <KpiBand />

        {/* Secciones (la tabla de detalle siempre es la última) */}
        <div className="dash-sections mt-12 flex flex-col gap-[var(--section-gap)]">
          {spec.sections.map((s, i) => (
            <DashboardSection key={s.id} section={s} index={i} />
          ))}
          <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
            <DetailTable />
          </motion.div>
        </div>

        {/* Pie global de convenciones */}
        <footer className="mt-12 border-t border-border pt-5 text-xs leading-relaxed text-muted">
          Variación vs. periodo anterior de igual duración <span aria-hidden>·</span> p.p. = puntos porcentuales{" "}
          <span aria-hidden>·</span> verde y rojo según si subir es bueno <span aria-hidden>·</span> Fuente: vistas SGDEA
          {data?.source === "mock" ? " (datos de prueba)" : ""}
        </footer>
      </div>
    </DashboardProvider>
  );
}
