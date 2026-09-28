"use client";

import { Home, LogOut, Minus, Presentation, Search, SunMoon, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, useTransition, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { DASHBOARDS, MODULES, type DashboardMeta, type ModuleMeta } from "@/config/dashboards";
import type { CatalogFigure } from "@/dashboards/dto";
import { useRecents } from "@/hooks/use-recents";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/cn";
import { describeDelta, formatValue } from "@/lib/format";
import { logout } from "@/server/auth/actions";
import { useCatalog } from "./shell-hooks";

// ─── Búsqueda insensible a tildes y mayúsculas ───────────────────────────────
function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Plegado carácter a carácter para mapear coincidencias al texto original (resaltado con <mark>). */
function foldWithMap(s: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const f = fold(s[i]);
    for (let j = 0; j < f.length; j++) {
      text += f[j];
      map.push(i);
    }
  }
  return { text, map };
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = fold(query.trim());
  if (!q) return <>{text}</>;
  const { text: folded, map } = foldWithMap(text);
  const at = folded.indexOf(q);
  if (at < 0) return <>{text}</>;
  const start = map[at];
  const end = map[at + q.length - 1] + 1;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-[3px] bg-primary-soft-2 px-px text-inherit">{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

// ─── Ítems ───────────────────────────────────────────────────────────────────
type ActionId = "home" | "theme" | "present" | "logout";

type Item =
  | { kind: "dashboard"; key: string; meta: DashboardMeta; module: ModuleMeta }
  | { kind: "action"; key: string; action: ActionId; label: string; hint: string; icon: LucideIcon; keywords: string };

interface Group {
  id: string;
  label: string;
  module?: ModuleMeta;
  items: Item[];
}

const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m])) as Record<string, ModuleMeta>;

const DASH_ITEMS: Item[] = DASHBOARDS.map((d) => ({ kind: "dashboard", key: d.slug, meta: d, module: MODULE_BY_ID[d.module] }));

const ACTIONS: Item[] = [
  { kind: "action", key: "a-home", action: "home", label: "Ir al inicio", hint: "Catálogo de tableros", icon: Home, keywords: "inicio home catalogo tableros" },
  { kind: "action", key: "a-theme", action: "theme", label: "Cambiar tema", hint: "Claro u oscuro", icon: SunMoon, keywords: "tema claro oscuro modo noche dia" },
  { kind: "action", key: "a-present", action: "present", label: "Modo presentación", hint: "Pantalla completa sin menú lateral", icon: Presentation, keywords: "presentacion pantalla completa proyectar" },
  { kind: "action", key: "a-logout", action: "logout", label: "Cerrar sesión", hint: "Salir de Docum BI", icon: LogOut, keywords: "cerrar sesion salir logout" },
];

/** Relevancia: 3 = el título empieza con la consulta · 2 = alguna palabra empieza · 1 = contiene. */
function score(item: Item, q: string): number {
  const primary =
    item.kind === "dashboard" ? [item.meta.heading, item.meta.short, item.meta.title].map(fold) : [fold(item.label)];
  const secondary =
    item.kind === "dashboard"
      ? fold(`${item.module.label} ${item.module.short} ${item.meta.tags.join(" ")} ${item.meta.summary} ${item.meta.description}`)
      : fold(`${item.hint} ${item.keywords}`);
  if (primary.some((p) => p.startsWith(q))) return 3;
  if (primary.some((p) => p.split(/[\s·/-]+/).some((w) => w.startsWith(q)))) return 2;
  if (primary.some((p) => p.includes(q)) || secondary.includes(q)) return 1;
  return 0;
}

function buildGroups(query: string, recents: string[]): Group[] {
  const q = fold(query.trim());
  if (!q) {
    const recentItems = recents
      .map((s) => DASH_ITEMS.find((i) => i.key === s))
      .filter((i): i is Item => Boolean(i))
      .slice(0, 4)
      .map((i) => ({ ...i, key: `r-${i.key}` }));
    return [
      ...(recentItems.length ? [{ id: "recientes", label: "Recientes", items: recentItems }] : []),
      ...MODULES.map((m) => ({ id: m.id, label: m.label, module: m, items: DASH_ITEMS.filter((i) => i.kind === "dashboard" && i.module.id === m.id) })),
      { id: "acciones", label: "Acciones", items: ACTIONS },
    ];
  }
  const rank = (items: Item[]) =>
    items
      .map((item, idx) => ({ item, idx, s: score(item, q) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || a.idx - b.idx)
      .map((r) => r.item);
  const dash = rank(DASH_ITEMS);
  const acts = rank(ACTIONS);
  return [
    ...(dash.length ? [{ id: "tableros", label: "Tableros", items: dash }] : []),
    ...(acts.length ? [{ id: "acciones", label: "Acciones", items: acts }] : []),
  ];
}

// ─── Cifra del catálogo (si está en caché) ───────────────────────────────────
function Figure({ fig }: { fig: CatalogFigure }) {
  const d = describeDelta(fig.value, fig.previous, fig.format, fig.polarity);
  const Icon = d.direction === "up" ? TrendingUp : d.direction === "down" ? TrendingDown : Minus;
  return (
    <span className="flex shrink-0 flex-col items-end leading-tight" title={`${fig.label} en el mes`}>
      <span className="tabular text-sm font-bold text-text">{formatValue(fig.value, fig.format, { compact: true })}</span>
      <span
        className={cn(
          "tabular mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-semibold",
          d.tone === "good" && "text-good-ink",
          d.tone === "bad" && "text-critical-ink",
          d.tone === "neutral" && "text-muted",
        )}
      >
        <Icon className="size-3" aria-hidden />
        {d.text}
      </span>
    </span>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-grid min-w-5 place-items-center rounded-md border border-border bg-surface px-1 py-px font-sans text-[10px] font-semibold text-text-2">
      {children}
    </kbd>
  );
}

// ─── Cuerpo (se monta en cada apertura: consulta y selección reiniciadas) ─────
function PaletteBody({ onClose, onTogglePresent }: { onClose: () => void; onTogglePresent: () => void }) {
  const router = useRouter();
  const { recents } = useRecents();
  const { toggle: toggleTheme } = useTheme();
  const catalog = useCatalog(true);
  const [, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [activeRaw, setActive] = useState(0);
  const uid = useId();
  const listboxId = `${uid}-list`;

  const groups = useMemo(() => buildGroups(q, recents), [q, recents]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  // Índice global de la primera opción de cada grupo (para aria-activedescendant)
  const starts = useMemo(() => groups.reduce<number[]>((acc, _g, gi) => [...acc, gi === 0 ? 0 : acc[gi - 1] + groups[gi - 1].items.length], []), [groups]);
  const active = flat.length ? Math.min(activeRaw, flat.length - 1) : -1;
  const optionId = (i: number) => `${uid}-opt-${i}`;
  const figures = useMemo(() => {
    const items = catalog.data?.items;
    return new Map((Array.isArray(items) ? items : []).map((i) => [i.slug, i.hero ?? null]));
  }, [catalog.data]);

  useEffect(() => {
    if (active < 0) return;
    document.getElementById(`${uid}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, uid]);

  const run = (item: Item | undefined) => {
    if (!item) return;
    if (item.kind === "dashboard") {
      onClose();
      router.push(`/tableros/${item.meta.slug}`);
      return;
    }
    onClose();
    if (item.action === "home") router.push("/");
    else if (item.action === "theme") toggleTheme();
    else if (item.action === "present") onTogglePresent();
    else if (item.action === "logout") startTransition(() => logout());
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!flat.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((active + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((active - 1 + flat.length) % flat.length);
    } else if (e.key === "Home" && e.ctrlKey) {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End" && e.ctrlKey) {
      e.preventDefault();
      setActive(flat.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(flat[active]);
    }
  };

  return (
    <div className="flex max-h-[min(640px,80vh)] flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search className="size-5 shrink-0 text-muted" aria-hidden />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          aria-label="Buscar tablero o acción"
          placeholder="Buscar tablero, módulo o acción…"
          className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted"
          autoComplete="off"
          spellCheck={false}
        />
        <Kbd>Esc</Kbd>
      </div>

      <ul id={listboxId} role="listbox" aria-label="Resultados" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
        {flat.length === 0 && (
          <li role="presentation" className="px-3 py-10 text-center text-sm text-muted">
            Sin resultados para “{q.trim()}”.
          </li>
        )}
        {groups.map((g, gi) => {
          const headId = `${uid}-g-${g.id}`;
          return (
            <li key={g.id} role="presentation" className="pb-1" data-module={g.module?.id}>
              <div id={headId} role="presentation" className="flex h-8 items-center gap-2 px-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                {g.module && <span aria-hidden className="size-1.5 rounded-full bg-mod" />}
                {g.label}
              </div>
              <ul role="group" aria-labelledby={headId}>
                {g.items.map((item, ii) => {
                  const i = starts[gi] + ii;
                  const on = i === active;
                  if (item.kind === "dashboard") {
                    const Icon = item.meta.icon;
                    const fig = figures.get(item.meta.slug) ?? null;
                    return (
                      <li
                        key={item.key}
                        id={optionId(i)}
                        role="option"
                        aria-selected={on}
                        data-module={item.module.id}
                        onMouseMove={() => !on && setActive(i)}
                        onClick={() => run(item)}
                        className={cn("flex h-12 cursor-pointer items-center gap-3 rounded-xl px-2.5 transition-colors", on ? "bg-surface-3" : "hover:bg-surface-2")}
                      >
                        <span
                          className={cn(
                            "grid size-8 shrink-0 place-items-center rounded-lg transition-colors",
                            on ? "mod-tile" : "bg-mod-soft text-mod-ink",
                          )}
                        >
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block truncate text-[13px] font-semibold text-text">
                            <Highlight text={item.meta.heading} query={q} />
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            <Highlight text={item.module.label} query={q} />
                          </span>
                        </span>
                        {fig && fig.value !== null ? <Figure fig={fig} /> : null}
                      </li>
                    );
                  }
                  const Icon = item.icon;
                  return (
                    <li
                      key={item.key}
                      id={optionId(i)}
                      role="option"
                      aria-selected={on}
                      onMouseMove={() => !on && setActive(i)}
                      onClick={() => run(item)}
                      className={cn("flex h-12 cursor-pointer items-center gap-3 rounded-xl px-2.5 transition-colors", on ? "bg-surface-3" : "hover:bg-surface-2")}
                    >
                      <span
                        className={cn(
                          "grid size-8 shrink-0 place-items-center rounded-lg transition-colors",
                          on ? "bg-primary-soft-2 text-primary-text" : "bg-surface-3 text-text-2",
                          item.action === "logout" && on && "bg-critical-soft text-critical-ink",
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-[13px] font-semibold text-text">
                          <Highlight text={item.label} query={q} />
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted">{item.hint}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>

      <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-[11px] text-muted">
        <span className="flex flex-wrap items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> Navegar <span aria-hidden>·</span> <Kbd>↵</Kbd> Abrir <span aria-hidden>·</span> <Kbd>Esc</Kbd> Cerrar
        </span>
        <span role="status" aria-live="polite" className="tabular hidden sm:inline">
          {q.trim() ? `${flat.length} ${flat.length === 1 ? "resultado" : "resultados"}` : ""}
        </span>
      </footer>
    </div>
  );
}

/**
 * CommandPalette v2: combobox ARIA con aria-activedescendant (las opciones son li role=option,
 * sin botones anidados). Sin consulta: Recientes, módulos y Acciones. Con consulta: relevancia
 * (empieza con > contiene) y <mark>. La cifra del mes sale de la caché ["catalogo"].
 */
export function CommandPalette({ open, onClose, onTogglePresent }: { open: boolean; onClose: () => void; onTogglePresent: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} hideHeader className="max-w-[640px]!">
      <PaletteBody onClose={onClose} onTogglePresent={onTogglePresent} />
    </Dialog>
  );
}
