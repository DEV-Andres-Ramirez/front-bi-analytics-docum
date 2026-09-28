"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Download, Loader2, Rows3, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "@/components/ui/popover";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import type { DetailResponse } from "@/dashboards/dto";
import type { ColumnDef } from "@/dashboards/types";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import { semanticVar } from "@/lib/charts/semantic";
import { formatDateTime } from "@/lib/dates";
import { formatCOP, formatInt, nf2 } from "@/lib/format";
import { useDashboard } from "./dashboard-context";

type Row = DetailResponse["rows"][number];

function Cell({ col, value, full }: { col: ColumnDef; value: Row[string]; full?: boolean }) {
  if (value === null || value === undefined || value === "") return <span className="text-faint">—</span>;
  switch (col.format) {
    case "date":
      return <span className="tabular whitespace-nowrap">{formatDateTime(Number(value), false)}</span>;
    case "datetime":
      return <span className="tabular whitespace-nowrap">{formatDateTime(Number(value))}</span>;
    case "int":
      return <span className="tabular">{formatInt(Number(value))}</span>;
    case "decimal":
    case "days":
      return <span className="tabular">{nf2.format(Number(value))}</span>;
    case "cop":
      return <span className="tabular whitespace-nowrap">{formatCOP(Number(value), false)}</span>;
    case "mono":
      return <span className={cn("font-mono text-[12px]", !full && "block max-w-[220px] truncate")} title={String(value)}>{String(value)}</span>;
    case "badge": {
      const v = String(value);
      const sem = col.semantic ? semanticVar(col.semantic, v) : null;
      return (
        <span className="inline-flex max-w-[240px] items-center gap-1.5 truncate rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-text-2" title={v}>
          {sem && <span className="size-2 shrink-0 rounded-full" style={{ background: sem }} />}
          <span className="truncate">{v}</span>
        </span>
      );
    }
    case "long":
      return <span className={cn(!full && "line-clamp-2 block max-w-[360px]")} title={String(value)}>{String(value)}</span>;
    default:
      return <span className={cn(!full && "block max-w-[260px] truncate")} title={String(value)}>{String(value)}</span>;
  }
}

export function DetailTable() {
  const { spec, meta, qs, data: dash } = useDashboard();
  const def = spec.table;
  const [size, setSize] = useState(25);
  const [sort, setSort] = useState(def.defaultSort);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [row, setRow] = useState<Row | null>(null);
  const [dense, setDense] = useLocalStorage("docum:table-dense", false);
  const defaultHidden = useMemo(() => def.columns.filter((c) => c.visible === false).map((c) => c.field), [def.columns]);
  const [hidden, setHidden] = useLocalStorage<string[]>(`docum:cols:${spec.slug}`, defaultHidden);
  const colsAnchor = useRef<HTMLButtonElement>(null);
  const [colsOpen, setColsOpen] = useState(false);
  const mobile = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(t);
  }, [q]);
  // La página vuelve a 1 cuando cambian filtros, búsqueda, orden o tamaño (sin efecto extra)
  const pageKey = `${qs}|${debouncedQ}|${size}|${sort.field}:${sort.dir}`;
  const [pageState, setPageState] = useState({ key: pageKey, page: 1 });
  const page = pageState.key === pageKey ? pageState.page : 1;
  const setPage = (fn: (p: number) => number) => setPageState({ key: pageKey, page: fn(page) });

  const params = useMemo(() => {
    const p = new URLSearchParams(qs);
    p.set("page", String(page));
    p.set("size", String(size));
    p.set("sort", `${sort.field}:${sort.dir}`);
    if (debouncedQ) p.set("q", debouncedQ);
    return p.toString();
  }, [qs, page, size, sort, debouncedQ]);

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ["detalle", spec.slug, params],
    queryFn: async (): Promise<DetailResponse> => {
      const res = await fetch(`/api/tableros/${spec.slug}/detalle?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("detalle");
      return res.json();
    },
    placeholderData: keepPreviousData,
  });

  const visible = def.columns.filter((c) => !hidden.includes(c.field));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;
  const csvHref = useMemo(() => {
    const p = new URLSearchParams(qs);
    p.set("format", "csv");
    p.set("sort", `${sort.field}:${sort.dir}`);
    if (debouncedQ) p.set("q", debouncedQ);
    return `/api/tableros/${spec.slug}/detalle?${p.toString()}`;
  }, [qs, sort, debouncedQ, spec.slug]);

  const toggleSort = (field: string) =>
    setSort((s) => (s.field === field ? { field, dir: s.dir === "desc" ? "asc" : "desc" } : { field, dir: "desc" }));

  return (
    <section aria-labelledby="detalle" className="card overflow-hidden">
      <header className="flex flex-col gap-3 border-b border-border p-4 sm:p-5 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <h2 id="detalle" className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
            <span className="h-5 w-1.5 rounded-full bg-primary" aria-hidden />
            {def.title}
          </h2>
          <p className="mt-0.5 pl-4 text-sm text-muted">
            {data ? `${formatInt(data.total)} registros con los filtros actuales` : "Cargando registros…"} · clic en una fila para ver la ficha completa
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la tabla…" aria-label="Buscar en la tabla" className="h-10 w-full rounded-full border border-border bg-surface-2 pl-9 pr-8 text-sm outline-none focus:border-primary" />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface-3">
                <X className="size-3.5" />
              </button>
            )}
          </label>
          <button ref={colsAnchor} type="button" onClick={() => setColsOpen((o) => !o)} className="hidden h-10 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-sm font-semibold text-text-2 hover:border-primary/40 md:flex">
            <Columns3 className="size-4" /> Columnas
          </button>
          <button type="button" onClick={() => setDense(!dense)} aria-pressed={dense} className="hidden h-10 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-sm font-semibold text-text-2 hover:border-primary/40 md:flex">
            <Rows3 className="size-4" /> {dense ? "Cómoda" : "Compacta"}
          </button>
          <a href={csvHref} className="btn-primary flex h-10 items-center gap-2 px-4 text-sm" download>
            <Download className="size-4" /> CSV
          </a>
        </div>
        <Popover anchor={colsAnchor} open={colsOpen} onClose={() => setColsOpen(false)} align="end" width={260} label="Columnas visibles">
          <div className="border-b border-border px-4 py-2.5 text-sm font-bold">Columnas visibles</div>
          <ul className="max-h-80 overflow-y-auto p-1.5">
            {def.columns.map((c) => {
              const on = !hidden.includes(c.field);
              return (
                <li key={c.field}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-3">
                    <input type="checkbox" checked={on} onChange={() => setHidden(on ? [...hidden, c.field] : hidden.filter((f) => f !== c.field))} className="size-4 accent-[var(--primary)]" />
                    {c.label}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border p-2">
            <button type="button" onClick={() => setHidden(defaultHidden)} className="w-full rounded-lg px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-3">
              Restablecer columnas
            </button>
          </div>
        </Popover>
      </header>

      <div className={cn("relative transition-opacity", isFetching && data && "opacity-60")}>
        {isError && <EmptyState title="No fue posible cargar el detalle" />}
        {isLoading && !data && (
          <div className="space-y-2 p-5">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        )}
        {data && data.rows.length === 0 && <EmptyState title="No hay registros para estos filtros" />}
        {data && data.rows.length > 0 && !mobile && (
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead className="sticky top-0 z-10 bg-surface-2">
                <tr>
                  {visible.map((c, i) => {
                    const active = sort.field === c.field;
                    const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                    return (
                      <th key={c.field} scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("whitespace-nowrap border-b border-border bg-surface-2 px-4 py-2.5 text-left", i === 0 && "sticky left-0 z-10")}>
                        <button type="button" onClick={() => toggleSort(c.field)} className={cn("inline-flex items-center gap-1.5 text-xs font-bold transition", active ? "text-primary-strong" : "text-text-2 hover:text-text")}>
                          {c.label}
                          <Icon className={cn("size-3.5", !active && "opacity-40")} />
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, ri) => (
                  <tr key={ri} onClick={() => setRow(r)} className="group cursor-pointer" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setRow(r)}>
                    {visible.map((c, i) => (
                      <td key={c.field} className={cn("border-b border-border px-4 text-text-2 transition-colors group-hover:bg-primary-soft group-focus-visible:bg-primary-soft", dense ? "py-1.5" : "py-2.5", i === 0 && "sticky left-0 bg-surface font-semibold text-text")}>
                        <Cell col={c} value={r[c.field]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.rows.length > 0 && mobile && (
          <ul className="divide-y divide-border">
            {data.rows.map((r, ri) => (
              <li key={ri}>
                <button type="button" onClick={() => setRow(r)} className="block w-full px-4 py-3 text-left hover:bg-surface-2">
                  <p className="text-sm font-semibold">
                    <Cell col={visible[0]} value={r[visible[0].field]} />
                  </p>
                  <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    {visible.slice(1, 5).map((c) => (
                      <div key={c.field} className="min-w-0">
                        <dt className="text-faint">{c.label}</dt>
                        <dd className="truncate text-text-2">
                          <Cell col={c} value={r[c.field]} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm sm:flex-row sm:px-5">
        <div className="flex items-center gap-2 text-muted">
          Filas por página
          <select value={size} onChange={(e) => setSize(Number(e.target.value))} className="h-8 rounded-lg border border-border bg-surface px-2 text-sm text-text outline-none">
            {[25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          {isFetching && <Loader2 className="size-4 animate-spin text-faint" />}
          <span className="tabular text-muted">
            {data ? `${formatInt((data.page - 1) * data.size + 1)}–${formatInt(Math.min(data.page * data.size, data.total))} de ${formatInt(data.total)}` : "—"}
          </span>
          <div className="flex gap-1">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label="Página anterior" className="grid size-9 place-items-center rounded-full border border-border hover:border-primary/40 disabled:opacity-40">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} aria-label="Página siguiente" className="grid size-9 place-items-center rounded-full border border-border hover:border-primary/40 disabled:opacity-40">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </footer>

      <Sheet open={Boolean(row)} onClose={() => setRow(null)} title="Ficha del registro" description={meta.title} width="min(560px, 100vw)">
        {row && (
          <dl className="divide-y divide-border rounded-2xl border border-border">
            {def.columns.map((c) => (
              <div key={c.field} className="grid grid-cols-[minmax(120px,40%)_1fr] gap-3 px-4 py-2.5 text-sm">
                <dt className="font-semibold text-muted">{c.label}</dt>
                <dd className="min-w-0 break-words text-text">
                  <Cell col={c} value={row[c.field]} full />
                </dd>
              </div>
            ))}
          </dl>
        )}
        {dash?.source === "mock" && (
          <p className="mt-4 text-xs text-muted">
            <Badge tone="warning">Datos de prueba</Badge> Los identificadores y nombres son ficticios.
          </p>
        )}
      </Sheet>
    </section>
  );
}
