"use client";

import { ArrowUp, CalendarDays, Check, ChevronDown, ListTree, Search, SlidersHorizontal, TableProperties, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { goToSection, scrollToTop, useHorizontalFade, useScrollSpy } from "@/components/shell/section-nav";
import { Popover } from "@/components/ui/popover";
import { Sheet } from "@/components/ui/sheet";
import type { FilterOption, FiltersState } from "@/dashboards/dto";
import type { DashboardSpec, FilterDef } from "@/dashboards/types";
import { useMediaQuery } from "@/hooks/use-media-query";
import { setTopbar, TOPBAR_H, useTopbar } from "@/hooks/use-topbar";
import { cn } from "@/lib/cn";
import { addDays, endOfMonth, previousRange, startOfMonth, startOfYear, todayISO } from "@/lib/dates";
import { activeFilterCount } from "@/lib/filters";
import { formatInt } from "@/lib/format";
import { norm } from "@/lib/geo/diccionario";
import { displayLabel } from "@/lib/labels";
import { useDashboard } from "./dashboard-context";
import { formatSpan } from "./kpi/shared";

// ─── Estilos compartidos ─────────────────────────────────────────────────────
const PILL = "flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border text-sm transition-colors";
/** Padding horizontal de los botones de la barra (más compacto en móvil). */
const PILL_X = "px-3 md:px-3.5";
const PILL_IDLE = "border-border bg-surface text-text-2 hover:border-border-strong hover:text-text";
const PILL_ON = "border-primary/50 bg-primary-soft font-semibold text-primary-text";
const COUNT = "grid h-5 min-w-5 place-items-center rounded-full bg-primary-strong px-1.5 text-[11px] font-bold leading-none text-primary-ink";

function Count({ n }: { n: number }) {
  return n > 0 ? <span className={cn(COUNT, "tabular")}>{n}</span> : null;
}

// ─── Rótulos cortos ('Ente', 'Tipo', 'Canal') ────────────────────────────────
const SHORT_LABELS: Record<string, string> = {
  "Ente de control": "Ente",
  "Tipo de requerimiento": "Tipo",
  "Canal de radicación": "Canal",
  "Canal de envío": "Canal",
  "Oficina responsable": "Oficina",
  "Oficina asignada": "Oficina",
  "Tipo de trámite": "Trámite",
  "Estado de cumplimiento": "Cumplimiento",
  "Etapa procesal": "Etapa",
  "Último evento RADIAN": "Evento RADIAN",
  "Tipo de documento": "Documento",
  "Forma de envío": "Envío",
  "Evento correo electrónico": "Evento correo",
  "Semáforo de riesgo": "Semáforo",
  "Punto de recepción": "Punto de recepción",
  "Anexos queja/reclamo": "Anexos",
  "Con anexos": "Anexos",
  "Tipo de persona": "Tipo de persona",
};

export function shortLabel(def: FilterDef): string {
  const explicit = (def as FilterDef & { short?: string }).short;
  if (explicit) return explicit;
  if (SHORT_LABELS[def.label]) return SHORT_LABELS[def.label];
  if (def.label.length <= 16) return def.label;
  const head = def.label.split(/\s+(?:de|del)\s+/i)[0];
  return head.length >= 4 && head !== def.label ? head : def.label;
}

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
        aria-haspopup="dialog"
        aria-label={`Periodo: ${active ? `${active.label}, ` : ""}${formatSpan(filters.from, filters.to)}`}
        className={cn(PILL, PILL_IDLE, "pl-3 pr-3 font-semibold text-text sm:pr-2.5")}
      >
        <CalendarDays className="size-4 text-primary-text" aria-hidden />
        <span className="tabular">{active ? active.label : formatSpan(filters.from, filters.to)}</span>
        {/* El rango vive aquí (no en el topbar): visible según el ancho real de la barra, no del viewport */}
        {active && <span className="tabular hidden font-normal text-muted @min-[880px]/fbar:inline">· {formatSpan(filters.from, filters.to)}</span>}
        <ChevronDown className={cn("hidden size-4 text-muted transition-transform sm:block", open && "rotate-180")} aria-hidden />
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
                    aria-pressed={selected}
                    onClick={() => {
                      setRange(p.from, p.to);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      selected ? "bg-primary-soft font-semibold text-primary-text" : "hover:bg-surface-3",
                    )}
                  >
                    {p.label}
                    {selected && <Check className="size-4" strokeWidth={3} aria-hidden />}
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
                <input
                  type="date"
                  value={from}
                  max={to}
                  min="2025-01-01"
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text outline-none focus:border-primary"
                />
              </label>
              <label className="text-xs font-semibold text-muted">
                Hasta
                <input
                  type="date"
                  value={to}
                  min={from}
                  max={todayISO()}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-text outline-none focus:border-primary"
                />
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
              Las variaciones se comparan con el periodo anterior de igual duración:{" "}
              <strong className="text-text-2">{formatSpan(prev.prevFrom, prev.prevTo)}</strong>.
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
          <Search className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            autoFocus={!compact}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            aria-label="Buscar opción"
            className="h-9 w-full rounded-xl border border-border bg-surface-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
      )}
      <div className="flex items-center justify-between px-3 py-1.5 text-xs">
        <span className="text-muted">{selected.length ? `${selected.length} seleccionados` : `${options.length} opciones`}</span>
        <div className="flex gap-3">
          {shown.length > 0 && shown.length <= 60 && (
            <button
              type="button"
              className="font-semibold text-primary-text hover:underline"
              onClick={() => setValues(field, [...new Set([...selected, ...shown.map((o) => o.value)])])}
            >
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
          const label = displayLabel(o.value).full;
          return (
            <li key={o.value} role="option" aria-selected={on}>
              <button
                type="button"
                onClick={() => toggleValue(field, o.value)}
                className={cn(
                  "relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                  on ? "bg-primary-soft" : "hover:bg-surface-3",
                )}
              >
                <span aria-hidden className="absolute inset-y-1 left-0 rounded-r bg-primary/10" style={{ width: `${(o.count / max) * 100}%` }} />
                <span
                  className={cn(
                    "relative grid size-4 shrink-0 place-items-center rounded border transition-colors",
                    on ? "border-primary-strong bg-primary-strong text-primary-ink" : "border-border-strong bg-surface",
                  )}
                >
                  {on && <Check className="size-3" strokeWidth={3.5} aria-hidden />}
                </span>
                <span className="relative min-w-0 flex-1 break-words" title={o.value}>
                  {label}
                </span>
                <span className="tabular relative text-xs text-muted">{formatInt(o.count)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Chip de filtro primario ─────────────────────────────────────────────────
function ChipFace({ label, count, open }: { label: string; count: number; open?: boolean }) {
  return (
    <>
      <span>{label}</span>
      <Count n={count} />
      <ChevronDown className={cn("size-4 shrink-0 opacity-60 transition-transform", open && "rotate-180")} aria-hidden />
    </>
  );
}

export function MultiSelect({ def }: { def: FilterDef }) {
  const { filters, data } = useDashboard();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const selected = filters.eq[def.field] ?? [];
  const options = data?.options[def.field] ?? [];
  const label = shortLabel(def);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={selected.length ? `${def.label}: ${selected.length} seleccionados` : def.label}
        title={def.label}
        className={cn(PILL, "px-3.5", selected.length ? PILL_ON : PILL_IDLE)}
      >
        <ChipFace label={label} count={selected.length} open={open} />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={320} label={def.label}>
        <div className="border-b border-border px-4 py-2.5 text-sm font-bold">{def.label}</div>
        {options.length ? <OptionList field={def.field} options={options} /> : <p className="px-4 py-6 text-center text-sm text-muted">Cargando opciones…</p>}
      </Popover>
    </>
  );
}

// ─── Texto ("contiene") y fechas secundarias ─────────────────────────────────
function TextFilter({ def }: { def: FilterDef }) {
  const { filters } = useDashboard();
  const current = filters.text[def.field] ?? "";
  // Al cambiar la URL (p. ej. "Limpiar") el input se reinicia con la nueva key
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
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={def.placeholder ?? "Contiene…"}
          className="h-10 w-full rounded-xl border border-border bg-surface-2 pl-9 pr-9 text-sm outline-none focus:border-primary"
        />
        {value && (
          <button
            type="button"
            aria-label={`Limpiar ${def.label}`}
            onClick={() => setValue("")}
            className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface-3"
          >
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
        <input
          type="date"
          aria-label={`${def.label} desde`}
          value={r.from ?? ""}
          onChange={(e) => setDates(def.field, { ...r, from: e.target.value || undefined })}
          className="h-10 rounded-xl border border-border bg-surface-2 px-3 text-sm outline-none focus:border-primary"
        />
        <input
          type="date"
          aria-label={`${def.label} hasta`}
          value={r.to ?? ""}
          onChange={(e) => setDates(def.field, { ...r, to: e.target.value || undefined })}
          className="h-10 rounded-xl border border-border bg-surface-2 px-3 text-sm outline-none focus:border-primary"
        />
      </div>
    </fieldset>
  );
}

function isActive(def: FilterDef, filters: FiltersState): boolean {
  if (def.kind === "multi") return (filters.eq[def.field]?.length ?? 0) > 0;
  if (def.kind === "text") return Boolean(filters.text[def.field]);
  const r = filters.dates[def.field];
  return Boolean(r && (r.from || r.to));
}

// ─── Cajón "Más filtros" ─────────────────────────────────────────────────────
function FilterDrawer({ open, onClose, defs }: { open: boolean; onClose: () => void; defs: FilterDef[] }) {
  const { filters, data, clearAll } = useDashboard();
  const [expanded, setExpanded] = useState<string | null>(null);
  const multis = defs.filter((f) => f.kind === "multi");
  const others = defs.filter((f) => f.kind !== "multi");
  const n = activeFilterCount(filters);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtros"
      description={`${defs.length} ${defs.length === 1 ? "filtro" : "filtros"} en este panel · ${n} ${n === 1 ? "activo" : "activos"} en total`}
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
        {multis.length > 0 && (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {multis.map((f) => {
              const sel = filters.eq[f.field] ?? [];
              const isOpen = expanded === f.field;
              return (
                <li key={f.field}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : f.field)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{f.label}</span>
                      {sel.length > 0 && (
                        <span className="block truncate text-xs text-primary-text">{sel.map((v) => displayLabel(v).full).join(", ")}</span>
                      )}
                    </span>
                    <Count n={sel.length} />
                    <ChevronDown className={cn("size-4 text-muted transition-transform", isOpen && "rotate-180")} aria-hidden />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
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
        )}
        {others.length > 0 && (
          <div className="space-y-4 rounded-2xl border border-border p-4">
            {others.map((f) => (f.kind === "text" ? <TextFilter key={f.field} def={f} /> : <DateFilter key={f.field} def={f} />))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ─── Chips activos (filtros y selecciones cruzadas) ──────────────────────────
const GEO_LABELS: Record<string, string> = { __dpto: "Departamento", __mpio: "Municipio" };

function fieldLabel(spec: DashboardSpec, field: string): string {
  const f = spec.filters.find((x) => x.field === field);
  if (f) return shortLabel(f);
  if (GEO_LABELS[field]) return GEO_LABELS[field];
  for (const s of spec.sections) for (const w of s.widgets) if ("dimension" in w && w.dimension === field) return w.title;
  return field.replace(/_/g, " ");
}

function ActiveChips({ spec }: { spec: DashboardSpec }) {
  const { filters, data, setValues, setText, setDates } = useDashboard();
  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  for (const [field, values] of Object.entries(filters.eq)) {
    const names = values.map((v) => data?.geoNames[v] ?? displayLabel(v).full);
    chips.push({
      key: `eq-${field}`,
      label: `${fieldLabel(spec, field)}: ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`,
      onRemove: () => setValues(field, []),
    });
  }
  for (const [field, text] of Object.entries(filters.text)) chips.push({ key: `t-${field}`, label: `${fieldLabel(spec, field)} contiene “${text}”`, onRemove: () => setText(field, "") });
  for (const [field, r] of Object.entries(filters.dates))
    chips.push({ key: `d-${field}`, label: `${fieldLabel(spec, field)}: ${r.from ?? "…"} → ${r.to ?? "…"}`, onRemove: () => setDates(field, null) });
  if (!chips.length) return null;
  return (
    <ul aria-label="Filtros activos" className="flex flex-wrap items-center gap-1.5 pt-2.5">
      <AnimatePresence initial={false}>
        {chips.map((c) => (
          <motion.li
            key={c.key}
            layout
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.18 }}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-soft-2 py-1 pl-3 pr-1 text-xs font-semibold text-primary-text"
          >
            <span className="min-w-0 break-words">{c.label}</span>
            <button type="button" onClick={c.onRemove} aria-label={`Quitar filtro ${c.label}`} className="grid size-5 shrink-0 place-items-center rounded-full hover:bg-primary/15">
              <X className="size-3.5" />
            </button>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

// ─── Hoja de secciones (tablet y móvil) ──────────────────────────────────────
function SectionsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sections = useTopbar((s) => s.sections);
  const active = useScrollSpy(open ? sections.map((s) => s.id) : []);
  const go = (fn: () => void) => {
    onClose();
    requestAnimationFrame(fn);
  };
  const list = sections.filter((s) => s.id !== "detalle");
  return (
    <BottomSheet open={open} onClose={onClose} title="Secciones del tablero">
      <ul className="py-1">
        {list.map((s, i) => {
          const on = active === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => go(() => goToSection(s.id))}
                aria-current={on ? "location" : undefined}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-semibold transition-colors",
                  on ? "bg-primary-soft-2 text-primary-text" : "text-text hover:bg-surface-3",
                )}
              >
                <span className="tabular grid size-7 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-bold text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-2 gap-2 border-t border-border pb-1 pt-3">
        <button
          type="button"
          onClick={() => go(() => goToSection("detalle"))}
          className="flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-surface text-sm font-semibold text-text-2 hover:border-border-strong hover:text-text"
        >
          <TableProperties className="size-4" aria-hidden /> Ir al detalle
        </button>
        <button
          type="button"
          onClick={() => go(scrollToTop)}
          className="flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-surface text-sm font-semibold text-text-2 hover:border-border-strong hover:text-text"
        >
          <ArrowUp className="size-4" aria-hidden /> Volver arriba
        </button>
      </div>
    </BottomSheet>
  );
}

// ─── Priority+: cuántos chips caben ──────────────────────────────────────────
const CHIP_GAP = 8;

function countFitting(widths: number[] | null, available: number, total: number): number {
  if (!widths) return total; // antes de medir: todos (el carril recorta)
  let used = 0;
  let fit = 0;
  for (const w of widths) {
    const next = used + (fit ? CHIP_GAP : 0) + w;
    if (next > available + 0.5) break;
    used = next;
    fit += 1;
  }
  return fit;
}

/** Ancho disponible del carril de primarios (flex-1: no depende de su contenido). */
function useSlotWidth() {
  const [width, setWidth] = useState(0);
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** Mide cada chip en una capa invisible (mismo contenido que el chip real). */
function useChipWidths() {
  const [widths, setWidths] = useState<number[] | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const read = () => {
      const next = [...el.children].map((c) => (c as HTMLElement).getBoundingClientRect().width);
      setWidths((prev) => (prev && prev.length === next.length && prev.every((w, i) => Math.abs(w - next[i]) < 0.5) ? prev : next));
    };
    read();
    const ro = new ResizeObserver(read);
    for (const c of el.children) ro.observe(c);
    return () => ro.disconnect();
  }, []);
  return { ref, widths };
}

/** Alto real (border-box) de la barra para --sticky-h. */
function useBarHeight() {
  const [height, setHeight] = useState(0);
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height;
      setHeight((prev) => (Math.abs(prev - h) < 0.5 ? prev : h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, height };
}

// ─── Barra de filtros (priority+) ────────────────────────────────────────────
/**
 * FilterBar priority+: [Rango] | primarios que caben … [Más filtros (n)] [Secciones] [Limpiar].
 * Los primarios que no caben pasan al cajón. Sticky bajo el topbar; publica --sticky-h.
 * Móvil: "Filtros" y "Secciones", máscara de desvanecido y la barra se oculta al bajar.
 */
export function FilterBar() {
  const { spec, filters, clearAll } = useDashboard();
  const [drawer, setDrawer] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const primaries = useMemo(() => spec.filters.filter((f) => f.primary && f.kind === "multi"), [spec.filters]);

  const { ref: slotRef, width: slotWidth } = useSlotWidth();
  const { ref: chipsRef, widths: chipWidths } = useChipWidths();
  const fit = countFitting(chipWidths, slotWidth, primaries.length);
  const visible = useMemo(() => primaries.slice(0, fit), [primaries, fit]);
  // Cajón: primarios que no caben + el resto de filtros
  const drawerDefs = useMemo(() => [...primaries.slice(fit), ...spec.filters.filter((f) => !primaries.includes(f))], [primaries, fit, spec.filters]);
  const drawerActive = drawerDefs.filter((f) => isActive(f, filters)).length;
  const n = activeFilterCount(filters);
  // La capa de medida se vuelve a montar cuando cambia el contenido de los chips
  const measureKey = primaries.map((f) => `${f.field}:${filters.eq[f.field]?.length ?? 0}`).join("|");

  // ── Ocultar al bajar (móvil) ──
  const mobile = useMediaQuery("(max-width: 767.98px)");
  const [scrolledAway, setScrolledAway] = useState(false);
  useEffect(() => {
    if (!mobile) return;
    let last = window.scrollY;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        if (Math.abs(y - last) < 8) return;
        setScrolledAway(y > last && y > 240);
        last = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [mobile]);
  const hidden = mobile && scrolledAway && !drawer && !sectionsOpen;

  // ── --sticky-h = topbar + barra medida ──
  const { ref: barRef, height: barHeight } = useBarHeight();
  useEffect(() => {
    const h = Math.round(TOPBAR_H + (hidden ? 0 : barHeight));
    document.documentElement.style.setProperty("--sticky-h", `${h}px`);
    setTopbar({ stickyH: h });
  }, [barHeight, hidden]);
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("--sticky-h");
      setTopbar({ stickyH: TOPBAR_H });
    },
    [],
  );

  const { attach: attachFade, onScroll: onFadeScroll, style: fadeStyle } = useHorizontalFade<HTMLDivElement>(24);

  return (
    <div
      ref={barRef}
      className={cn(
        "@container/fbar sticky top-[var(--topbar-h)] z-30 -mx-4 border-b border-border bg-[color-mix(in_oklab,var(--bg)_95%,transparent)] px-4 py-3 backdrop-blur-xl backdrop-saturate-50 transition-transform duration-300 ease-out sm:-mx-5 sm:px-5 xl:-mx-8 xl:px-8",
        hidden && "-translate-y-full",
      )}
    >
      <div className="relative">
        <div
          ref={attachFade}
          onScroll={onFadeScroll}
          style={mobile ? fadeStyle : undefined}
          role="group"
          aria-label="Filtros del tablero"
          className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] md:gap-2 md:overflow-visible [&::-webkit-scrollbar]:hidden"
        >
          <DateRangePicker />
          <span aria-hidden className="mx-1 hidden h-6 w-px shrink-0 bg-border md:block" />

          {/* Primarios que caben (solo md+) */}
          <div ref={slotRef} className="-mx-1 -my-1 hidden min-w-0 flex-1 items-center gap-2 overflow-hidden px-1 py-1 md:flex">
            {visible.map((f) => (
              <MultiSelect key={f.field} def={f} />
            ))}
          </div>

          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-haspopup="dialog"
            className={cn(PILL, PILL_X, "font-semibold", (mobile ? n : drawerActive) ? PILL_ON : PILL_IDLE)}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            <span className="md:hidden">Filtros</span>
            <span className="hidden md:inline">{visible.length ? "Más filtros" : "Filtros"}</span>
            <Count n={mobile ? n : drawerActive} />
          </button>

          <button type="button" onClick={() => setSectionsOpen(true)} aria-haspopup="dialog" className={cn(PILL, PILL_IDLE, PILL_X, "font-semibold lg:hidden")}>
            <ListTree className="size-4" aria-hidden />
            Secciones
          </button>

          {n > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold text-muted transition-colors hover:bg-surface-3 hover:text-text"
            >
              <X className="size-4" aria-hidden />
              Limpiar
            </button>
          )}
        </div>

        {/* Capa de medida (invisible, fuera del flujo) */}
        <div
          key={measureKey}
          ref={chipsRef}
          aria-hidden
          inert
          className="pointer-events-none invisible absolute left-0 top-0 flex h-0 items-center overflow-hidden whitespace-nowrap"
        >
          {primaries.map((f) => {
            const count = filters.eq[f.field]?.length ?? 0;
            return (
              <span key={f.field} className={cn(PILL, "px-3.5", count ? PILL_ON : PILL_IDLE)}>
                <ChipFace label={shortLabel(f)} count={count} />
              </span>
            );
          })}
        </div>
      </div>

      <ActiveChips spec={spec} />
      <FilterDrawer open={drawer} onClose={() => setDrawer(false)} defs={drawerDefs} />
      <SectionsSheet open={sectionsOpen} onClose={() => setSectionsOpen(false)} />
    </div>
  );
}
