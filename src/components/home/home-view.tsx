"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, LayoutGrid, Search, Sparkles, Star } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DASHBOARD_BY_SLUG, DASHBOARDS, MODULES, type ModuleId } from "@/config/dashboards";
import type { KpiResult } from "@/dashboards/dto";
import { useFavorites, useRecents } from "@/hooks/use-recents";
import { cn } from "@/lib/cn";
import { MONTHS_ES_LONG, todayISO } from "@/lib/dates";
import { norm } from "@/lib/geo/diccionario";
import { DashboardCard } from "./dashboard-card";

interface CatalogResponse {
  range: { from: string; to: string };
  items: { slug: string; label: string; format: string; kpi: KpiResult | null }[];
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function longDate() {
  const iso = todayISO();
  const [y, m, d] = iso.split("-").map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)}, ${d} de ${MONTHS_ES_LONG[m - 1]} de ${y}`;
}

export function HomeView({ source }: { source: "mock" | "db" }) {
  const [q, setQ] = useState("");
  const [mod, setMod] = useState<ModuleId | "all">("all");
  const { favorites, toggle } = useFavorites();
  const { recents } = useRecents();

  const { data, isLoading } = useQuery({
    queryKey: ["catalogo"],
    queryFn: async (): Promise<CatalogResponse> => {
      const res = await fetch("/api/catalogo", { cache: "no-store" });
      if (!res.ok) throw new Error("No fue posible cargar el catálogo");
      return res.json();
    },
  });
  const kpis = useMemo(() => Object.fromEntries((data?.items ?? []).map((i) => [i.slug, i])), [data]);

  const filtered = useMemo(() => {
    const k = norm(q);
    return DASHBOARDS.filter(
      (d) =>
        (mod === "all" || d.module === mod) &&
        (!k || norm(`${d.title} ${d.description} ${d.tags.join(" ")} ${MODULES.find((m) => m.id === d.module)?.label}`).includes(k)),
    );
  }, [q, mod]);

  const favoriteItems = favorites.map((s) => DASHBOARD_BY_SLUG[s]).filter(Boolean);
  const recentItems = recents.map((s) => DASHBOARD_BY_SLUG[s]).filter(Boolean).slice(0, 4);

  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="mesh-bg pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 animate-float rounded-full bg-primary/15 blur-3xl" />
        <div className="relative mx-auto max-w-[1440px] px-4 pb-10 pt-10 sm:px-6 lg:px-10 lg:pb-14 lg:pt-14">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm font-medium text-muted"
            suppressHydrationWarning
          >
            {longDate()}
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mt-2 text-balance text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl"
            suppressHydrationWarning
          >
            {greeting()}. <span className="text-primary">¿Qué quieres revisar hoy?</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-3 max-w-2xl text-base text-text-2"
          >
            Catálogo de los 13 tableros de seguimiento de flujos de Positiva. Cada tarjeta muestra la cifra principal del mes en curso.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-7 flex flex-col gap-4 lg:flex-row lg:items-center"
          >
            <label className="group relative w-full max-w-xl">
              <span className="sr-only">Buscar tablero</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-faint transition group-focus-within:text-primary" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre, módulo o tema (p. ej. SLA, tutelas, SealMail)…"
                className="h-12 w-full rounded-2xl border border-border bg-surface pl-12 pr-4 text-[15px] shadow-card outline-none transition placeholder:text-faint focus:border-primary focus:ring-4 focus:ring-[var(--ring)]"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 ring-1 ring-border">
                <LayoutGrid className="size-3.5" /> 13 tableros · 6 módulos
              </span>
              {source === "mock" && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1.5 text-warning-ink">
                  <Sparkles className="size-3.5" /> Datos de prueba anonimizados
                </span>
              )}
            </div>
          </motion.div>

          {/* Chips de módulo */}
          <div className="mt-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar por módulo">
            {[{ id: "all" as const, label: "Todos", icon: LayoutGrid }, ...MODULES].map((m) => {
              const active = mod === m.id;
              const Icon = m.icon;
              const n = m.id === "all" ? DASHBOARDS.length : DASHBOARDS.filter((d) => d.module === m.id).length;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMod(m.id)}
                  className={cn(
                    "relative inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition",
                    active ? "text-white" : "bg-surface text-text-2 ring-1 ring-border hover:ring-primary/40",
                  )}
                >
                  {active && (
                    <motion.span layoutId="module-chip" className="absolute inset-0 -z-0 rounded-full bg-[linear-gradient(135deg,#e5870f,#c05800)]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
                  )}
                  <Icon className="relative size-4" />
                  <span className="relative">{m.label}</span>
                  <span className={cn("relative rounded-full px-1.5 text-[11px]", active ? "bg-white/25" : "bg-surface-3 text-muted")}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1440px] space-y-10 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        {/* Accesos rápidos */}
        {(favoriteItems.length > 0 || recentItems.length > 0) && !q && mod === "all" && (
          <section className="grid gap-4 lg:grid-cols-2">
            {favoriteItems.length > 0 && (
              <QuickList title="Favoritos" icon={<Star className="size-4 fill-current text-primary" />} items={favoriteItems.map((d) => d!.slug)} />
            )}
            {recentItems.length > 0 && <QuickList title="Vistos recientemente" icon={<Clock className="size-4 text-muted" />} items={recentItems.map((d) => d!.slug)} />}
          </section>
        )}

        <section aria-labelledby="catalogo-titulo">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 id="catalogo-titulo" className="text-xl font-bold tracking-tight">
                {mod === "all" ? "Todos los tableros" : MODULES.find((m) => m.id === mod)?.label}
              </h2>
              <p className="text-sm text-muted">
                {filtered.length} {filtered.length === 1 ? "tablero" : "tableros"}
                {q && ` para “${q}”`}
              </p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="card grid place-items-center px-6 py-16 text-center">
              <p className="font-semibold">No encontramos tableros con ese criterio.</p>
              <button type="button" onClick={() => { setQ(""); setMod("all"); }} className="mt-3 text-sm font-semibold text-primary-strong hover:underline">
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            <motion.ul layout className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              <AnimatePresence mode="popLayout">
                {filtered.map((d, i) => (
                  <DashboardCard
                    key={d.slug}
                    meta={d}
                    index={i}
                    kpi={kpis[d.slug]}
                    loading={isLoading}
                    favorite={favorites.includes(d.slug)}
                    onToggleFavorite={() => toggle(d.slug)}
                  />
                ))}
              </AnimatePresence>
            </motion.ul>
          )}
        </section>
      </div>
    </div>
  );
}

function QuickList({ title, icon, items }: { title: string; icon: React.ReactNode; items: string[] }) {
  return (
    <div className="card p-4">
      <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-bold">
        {icon} {title}
      </h2>
      <ul className="grid gap-1 sm:grid-cols-2">
        {items.map((slug) => {
          const d = DASHBOARD_BY_SLUG[slug];
          const Icon = d.icon;
          return (
            <li key={slug}>
              <Link href={`/tableros/${slug}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-3">
                <span className="grid size-8 place-items-center rounded-lg bg-primary-soft-2 text-primary-strong">
                  <Icon className="size-4" />
                </span>
                <span className="truncate text-sm font-medium">{d.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
