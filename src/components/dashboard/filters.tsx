"use client";

import { CalendarDays, Check, ChevronDown, ListFilter, Search, SlidersHorizontal, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "@/components/ui/popover";
import { Sheet } from "@/components/ui/sheet";
import type { FilterOption } from "@/dashboards/dto";
import type { DashboardSpec, FilterDef } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { addDays, endOfMonth, formatRange, previousRange, startOfMonth, startOfYear, todayISO } from "@/lib/dates";
import { activeFilterCount } from "@/lib/filters";
import { formatInt } from "@/lib/format";
import { norm } from "@/lib/geo/diccionario";
import { useDashboard } from "./dashboard-context";

// ─── Rango de fechas ─────────────────────────────────────────────────────────
function presets() {
  const t = todayISO();
  const prevMonthEnd = addDays(startOfMonth(t), -1);
  return [
    { id: "hoy", label: "Hoy", from: t, to: t },
    { id: "7d", label: "Últimos 7 días", from: addDays(t, -6), to: t },
    { id: "30d", label: "Últimos 30 días", from: addDays(t, -29), to: t },
    { id: "mes", label: "Mes actual", from: startOfMonth(t), to: t },
    { id: "mes-ant", label: "Mes anterior", from: startOfMonth(prevMonthEnd), to: endOfMonth(prevMonthEnd) },
    { id: "90d", label: "Últimos 3 meses", from: addDays(t, -89), to: t },
    { id: "anio", label: "Año en curso", from: startOfYear(t), to: t },
    { id: "12m", label: "Últimos 12 meses", from: addDays(t, -364), to: t },
    { id: "todo", label: "Todo el histórico", from: "2025-01-01", to: t },
  ];
}

export function DateRangePicker() {
  const { filters, setRange } = useDashboard();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const list = presets();
  const active = list.find((p) => p.from === filters.from && p.to === filters.to);
  const prev = previousRange(filters.from, filters.to);

  const openPicker = () => {
    setFrom(filters.from);
    setTo(filters.to);
    setOpen((o) => !o);
  };

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={openPicker}
        aria-expanded={open}
        className="flex h-10 items-center gap-2 rounded-full border border-border bg-surface pl-3 pr-2.5 text-sm font-semibold shadow-card transition hover:border-primary/40"
      >
        <CalendarDays className="size-4 text-primary" />
        <span className="whitespace-nowrap">{active ? active.label : formatRange(filters.from, filters.to)}</span>
        {active && <span className="hidden whitespace-nowrap font-normal text-muted xl:inline">· {formatRange(filters.from, filters.to)}</span>}
        <ChevronDown className={cn("size-4 text-muted transition", open && "rotate-180")} />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={520} label="Rango de fechas">
        <div className="grid sm:grid-cols-[190px_1fr]">
          <ul className="border-b border-border p-2 sm:border-b-0 sm:border-r">
            {list.map((p) => {
              const selected = p.from === filters.from && p.to === filters.to;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setRange(p.from, p.to);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition",
                      selected ? "bg-primary-soft font-semibold text-primary-strong" : "hover:bg-surface-3",
                    )}
                  >
                    {p.label}
                    {selected && <Check className="size-4" strokeWidth={3} />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-4 p-4">
            <p className="text-sm font-semibold">Rango personalizado</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-muted">
                Desde
                <input type="date" value={from} max={to} min="2025-01-01" onChange={(e) => setFrom(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text outline-none focus:border-primary" />
              </label>
              <label className="text-xs font-semibold text-muted">
                Hasta
                <input type="date" value={to} min={from} max={todayISO()} onChange={(e) => setTo(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text outline-none focus:border-primary" />
              </label>
            </div>
            <button
              type="button"
              disabled={!from || !to || from > to}
              onClick={() => {
                setRange(from, to);
                setOpen(false);
              }}
              className="btn-primary h-10 text-sm"
            >
              Aplicar rango
            </button>
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
              Las variaciones se comparan con el periodo anterior de igual duración: <strong className="text-text-2">{formatRange(prev.prevFrom, prev.prevTo)}</strong>.
            </p>
          </div>
        </div>
      </Popover>
    </>
  );
}

// ─── Lista de opciones con búsqueda ──────────────────────────────────────────
export function OptionList({ field, options, compact }: { field: string; options: FilterOption[]; compact?: boolean }) {
  const { filters, toggleValue, setValues } = useDashboard();
  const [q, setQ] = useState("");
  const selected = filters.eq[field] ?? [];
  const max = Math.max(...options.map((o) => o.count), 1);
  const shown = useMemo(() => {
    const k = norm(q);
    return k ? options.filter((o) => norm(o.value).includes(k)) : options;
  }, [q, options]);

  return (
    <div className="flex min-h-0 flex-col">
      {options.length > 7 && (
        <div className="relative p-2 pb-1">
          <Search className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            autoFocus={!compact}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            className="h-9 w-full rounded-xl border border-border bg-surface-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
      )}
      <div className="flex items-center justify-between px-3 py-1.5 text-xs">
        <span className="text-muted">{selected.length ? `${selected.length} seleccionados` : `${options.length} opciones`}</span>
        <div className="flex gap-3">
          {shown.length > 0 && shown.length <= 60 && (
            <button type="button" className="font-semibold text-primary-strong hover:underline" onClick={() => setValues(field, [...new Set([...selected, ...shown.map((o) => o.value)])])}>
              Todos
            </button>
          )}
          {selected.length > 0 && (
            <button type="button" className="font-semibold text-muted hover:text-text" onClick={() => setValues(field, [])}>
              Limpiar
            </button>
          )}
        </div>
      </div>
      <ul className={cn("min-h-0 overflow-y-auto px-1.5 pb-2", compact ? "max-h-64" : "max-h-80")} role="listbox" aria-multiselectable>
        {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Sin coincidencias</li>}
        {shown.map((o) => {
          const on = selected.includes(o.value);
          return (
            <li key={o.value} role="option" aria-selected={on}>
              <button
                type="button"
                onClick={() => toggleValue(field, o.value)}
                className={cn("relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg px-2.5 py-2 text-left text-sm transition", on ? "bg-primary-soft" : "hover:bg-surface-3")}
              >
                <span
                  aria-hidden
                  className="absolute inset-y-1 left-0 rounded-r bg-primary/10"
                  style={{ width: `${(o.count / max) * 100}%` }}
                />
                <span className={cn("relative grid size-4 shrink-0 place-items-center rounded border transition", on ? "border-primary bg-primary text-white" : "border-border-strong bg-surface")}>
                  {on && <Check className="size-3" strokeWidth={3.5} />}
                </span>
                <span className="relative min-w-0 flex-1 truncate" title={o.value}>
                  {o.value}
                </span>
                <span className="relative tabular text-xs text-muted">{formatInt(o.count)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MultiSelect({ def }: { def: FilterDef }) {
  const { filters, data } = useDashboard();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selected = filters.eq[def.field] ?? [];
  const options = data?.options[def.field] ?? [];

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex h-10 max-w-[240px] items-center gap-2 rounded-full border px-3.5 text-sm transition",
          selected.length ? "border-primary/50 bg-primary-soft font-semibold text-primary-strong" : "border-border bg-surface text-text-2 hover:border-primary/40",
        )}
      >
        <span className="truncate">{def.label}</span>
        {selected.length > 0 && (
          <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">{selected.length}</span>
        )}
        <ChevronDown className={cn("size-4 shrink-0 opacity-60 transition", open && "rotate-180")} />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={320} label={def.label}>
        <div className="border-b border-border px-4 py-2.5 text-sm font-bold">{def.label}</div>
        {options.length ? <OptionList field={def.field} options={options} /> : <p className="px-4 py-6 text-center text-sm text-muted">Cargando opciones…</p>}
      </Popover>
    </>
  );
}

// ─── Texto ("contiene") ──────────────────────────────────────────────────────
function TextFilter({ def }: { def: FilterDef }) {
  const { filters } = useDashboard();
  const current = filters.text[def.field] ?? "";
  // Al cambiar la URL (p. ej. "Limpiar todo") el input se reinicia con la nueva key
  return <TextFilterInput key={current} def={def} current={current} />;
}

function TextFilterInput({ def, current }: { def: FilterDef; current: string }) {
  const { setText } = useDashboard();
  const [value, setValue] = useState(current);
  useEffect(() => {
    if (value === current) return;
    const t = setTimeout(() => setText(def.field, value), 450);
    return () => clearTimeout(t);
  }, [value, current, def.field, setText]);
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted">{def.label}</span>
      <span className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={def.placeholder ?? "Contiene…"}
          className="h-10 w-full rounded-xl border border-border bg-surface-2 pl-9 pr-9 text-sm outline-none focus:border-primary"
        />
        {value && (
          <button type="button" aria-label="Limpiar" onClick={() => setValue("")} className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface-3">
            <X className="size-3.5" />
          </button>
        )}
      </span>
    </label>
  );
}

function DateFilter({ def }: { def: FilterDef }) {
  const { filters, setDates } = useDashboard();
  const r = filters.dates[def.field] ?? {};
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-semibold text-muted">{def.label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <input type="date" aria-label={`${def.label} desde`} value={r.from ?? ""} onChange={(e) => setDates(def.field, { ...r, from: e.target.value || undefined })} className="h-10 rounded-xl border border-border bg-surface-2 px-3 text-sm outline-none focus:border-primary" />
        <input type="date" aria-label={`${def.label} hasta`} value={r.to ?? ""} onChange={(e) => setDates(def.field, { ...r, to: e.target.value || undefined })} className="h-10 rounded-xl border border-border bg-surface-2 px-3 text-sm outline-none focus:border-primary" />
      </div>
    </fieldset>
  );
}

// ─── Cajón "Más filtros" ─────────────────────────────────────────────────────
function FilterDrawer({ open, onClose, spec }: { open: boolean; onClose: () => void; spec: DashboardSpec }) {
  const { filters, data, clearAll } = useDashboard();
  const [expanded, setExpanded] = useState<string | null>(null);
  const multis = spec.filters.filter((f) => f.kind === "multi");
  const others = spec.filters.filter((f) => f.kind !== "multi");
  const n = activeFilterCount(filters);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtros"
      description={`${spec.filters.length} filtros disponibles · ${n} activos`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={clearAll} disabled={!n} className="text-sm font-semibold text-muted hover:text-text disabled:opacity-40">
            Limpiar todo
          </button>
          <button type="button" onClick={onClose} className="btn-primary h-10 px-6 text-sm">
            Ver resultados
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {others.length > 0 && (
          <div className="space-y-4 rounded-2xl border border-border p-4">
            {others.map((f) => (f.kind === "text" ? <TextFilter key={f.field} def={f} /> : <DateFilter key={f.field} def={f} />))}
          </div>
        )}
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {multis.map((f) => {
            const sel = filters.eq[f.field] ?? [];
            const isOpen = expanded === f.field;
            return (
              <li key={f.field}>
                <button type="button" onClick={() => setExpanded(isOpen ? null : f.field)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{f.label}</span>
                    {sel.length > 0 && <span className="block truncate text-xs text-primary-strong">{sel.join(", ")}</span>}
                  </span>
                  {sel.length > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">{sel.length}</span>}
                  <ChevronDown className={cn("size-4 text-muted transition", isOpen && "rotate-180")} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="border-t border-border bg-surface-2/50">
                        <OptionList field={f.field} options={data?.options[f.field] ?? []} compact />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}

// ─── Chips activos ───────────────────────────────────────────────────────────
const GEO_LABELS: Record<string, string> = { __dpto: "Departamento", __mpio: "Municipio" };

function fieldLabel(spec: DashboardSpec, field: string): string {
  const f = spec.filters.find((x) => x.field === field);
  if (f) return f.label;
  if (GEO_LABELS[field]) return GEO_LABELS[field];
  for (const s of spec.sections) for (const w of s.widgets) if ("dimension" in w && w.dimension === field) return w.title;
  return field.replace(/_/g, " ");
}

function ActiveChips({ spec }: { spec: DashboardSpec }) {
  const { filters, data, setValues, setText, setDates, clearAll } = useDashboard();
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  for (const [field, values] of Object.entries(filters.eq)) {
    const names = values.map((v) => data?.geoNames[v] ?? v);
    chips.push({ key: `eq-${field}`, label: `${fieldLabel(spec, field)}: ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`, onRemove: () => setValues(field, []) });
  }
  for (const [field, text] of Object.entries(filters.text)) chips.push({ key: `t-${field}`, label: `${fieldLabel(spec, field)} contiene “${text}”`, onRemove: () => setText(field, "") });
  for (const [field, r] of Object.entries(filters.dates)) chips.push({ key: `d-${field}`, label: `${fieldLabel(spec, field)}: ${r.from ?? "…"} → ${r.to ?? "…"}`, onRemove: () => setDates(field, null) });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 pt-3">
      <AnimatePresence initial={false}>
        {chips.map((c) => (
          <motion.span
            key={c.key}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-soft-2 py-1 pl-3 pr-1 text-xs font-semibold text-primary-strong"
          >
            <span className="truncate">{c.label}</span>
            <button type="button" onClick={c.onRemove} aria-label={`Quitar filtro ${c.label}`} className="grid size-5 place-items-center rounded-full hover:bg-primary/15">
              <X className="size-3.5" />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
      <button type="button" onClick={clearAll} className="text-xs font-semibold text-muted underline-offset-2 hover:text-text hover:underline">
        Limpiar todo
      </button>
    </div>
  );
}

// ─── Barra de filtros ────────────────────────────────────────────────────────
export function FilterBar() {
  const { spec, filters } = useDashboard();
  const [drawer, setDrawer] = useState(false);
  const primary = spec.filters.filter((f) => f.primary && f.kind === "multi");
  const n = activeFilterCount(filters);
  return (
    <div className="sticky top-16 z-30 -mx-4 border-b border-border bg-[color-mix(in_oklab,var(--bg)_88%,transparent)] px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        <DateRangePicker />
        <span className="mx-1 hidden h-6 w-px shrink-0 bg-border sm:block" />
        <div className="hidden items-center gap-2 md:flex">
          {primary.map((f) => (
            <MultiSelect key={f.field} def={f} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setDrawer(true)}
          className={cn(
            "flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition",
            n ? "border-primary/50 bg-primary-soft text-primary-strong" : "border-border bg-surface text-text-2 hover:border-primary/40",
          )}
        >
          <span className="md:hidden">
            <ListFilter className="size-4" />
          </span>
          <span className="hidden md:inline">
            <SlidersHorizontal className="size-4" />
          </span>
          <span>
            <span className="md:hidden">Filtros</span>
            <span className="hidden md:inline">Más filtros</span>
          </span>
          {n > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-white">{n}</span>}
        </button>
      </div>
      <ActiveChips spec={spec} />
      <FilterDrawer open={drawer} onClose={() => setDrawer(false)} spec={spec} />
    </div>
  );
}
