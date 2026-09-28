"use client";

import { ArrowRight, CornerDownLeft, Home, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { DASHBOARDS, MODULES } from "@/config/dashboards";
import { cn } from "@/lib/cn";
import { norm } from "@/lib/geo/diccionario";

interface Item {
  href: string;
  title: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ITEMS: Item[] = [
  { href: "/", title: "Inicio · Catálogo de tableros", hint: "Inicio", icon: Home },
  ...DASHBOARDS.map((d) => ({
    href: `/tableros/${d.slug}`,
    title: d.title,
    hint: MODULES.find((m) => m.id === d.module)?.label ?? "",
    icon: d.icon,
  })),
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const k = norm(q);
    if (!k) return ITEMS;
    return ITEMS.filter((i) => norm(`${i.title} ${i.hint}`).includes(k));
  }, [q]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    setQ("");
    router.push(item.href);
  };

  return (
    <Dialog open={open} onClose={onClose} hideHeader className="max-w-xl">
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search className="size-5 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(results[active]);
            }
          }}
          placeholder="Buscar tablero, módulo…"
          aria-label="Buscar tablero"
          className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
        />
        <kbd className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold text-faint">Esc</kbd>
      </div>
      <ul ref={listRef} role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
        {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Sin resultados para “{q}”.</li>}
        {results.map((item, i) => {
          const Icon = item.icon;
          return (
            <li key={item.href} data-index={i} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                  i === active ? "bg-primary-soft text-text" : "text-text-2",
                )}
              >
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", i === active ? "bg-primary text-white" : "bg-surface-3 text-muted")}>
                  <Icon className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.title}</span>
                  <span className="block truncate text-xs text-muted">{item.hint}</span>
                </span>
                {i === active ? <CornerDownLeft className="size-4 text-muted" /> : <ArrowRight className="size-4 text-faint" />}
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
