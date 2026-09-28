"use client";

import { ChevronDown, Home, LogOut, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PositivaLogo, PositivaMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Tooltip } from "@/components/ui/tooltip";
import { dashboardsByModule } from "@/config/dashboards";
import { cn } from "@/lib/cn";
import { logout } from "@/server/auth/actions";

interface Props {
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onOpenPalette: () => void;
  onNavigate?: () => void;
  /** Variante del drawer móvil (siempre expandida). */
  mobile?: boolean;
}

const GROUPS = dashboardsByModule();

function ActiveBg({ mobile }: { mobile?: boolean }) {
  return (
    <motion.span
      layoutId={mobile ? "nav-active-m" : "nav-active"}
      className="absolute inset-0 -z-10 rounded-xl bg-primary-soft-2/80 ring-1 ring-primary/20"
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
    />
  );
}

export function Sidebar({ collapsed, onToggleCollapsed, onOpenPalette, onNavigate, mobile }: Props) {
  const pathname = usePathname();
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const rail = collapsed && !mobile;

  const itemClass = (active: boolean) =>
    cn(
      "group relative flex items-center gap-3 rounded-xl text-[13px] font-medium outline-none transition-colors",
      rail ? "size-11 justify-center" : "px-3 py-2",
      active ? "text-primary-strong" : "text-text-2 hover:bg-surface-3 hover:text-text",
    );

  const wrap = (label: string, node: React.ReactNode) =>
    rail ? (
      <Tooltip content={label} side="right">
        {node}
      </Tooltip>
    ) : (
      node
    );

  return (
    <div className="flex h-full flex-col">
      {/* Marca */}
      <div className={cn("flex items-center gap-3 px-4 pb-3 pt-5", rail && "justify-center px-0")}>
        <Link href="/" onClick={onNavigate} className="flex items-center gap-3 rounded-lg" aria-label="Inicio">
          {rail ? (
            <PositivaMark size={34} className="text-primary" />
          ) : (
            <PositivaLogo height={34} priority />
          )}
        </Link>
      </div>
      {!rail && (
        <p className="px-5 pb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Docum BI · Seguimiento de flujos</p>
      )}

      {/* Buscador */}
      <div className={cn("px-3 pb-2", rail && "flex justify-center px-0")}>
        {wrap(
          "Buscar tablero (Ctrl K)",
          <button
            type="button"
            onClick={onOpenPalette}
            className={cn(
              "flex items-center gap-2.5 rounded-xl border border-border bg-surface-2 text-sm text-muted transition hover:border-primary/40 hover:text-text",
              rail ? "size-11 justify-center" : "w-full px-3 py-2",
            )}
            aria-label="Buscar tablero"
          >
            <Search className="size-4 shrink-0" />
            {!rail && (
              <>
                <span className="flex-1 text-left">Buscar tablero…</span>
                <kbd className="rounded-md border border-border bg-surface px-1.5 py-0.5 font-sans text-[10px] font-semibold text-faint">Ctrl K</kbd>
              </>
            )}
          </button>,
        )}
      </div>

      {/* Navegación */}
      <nav aria-label="Tableros" className={cn("min-h-0 flex-1 overflow-y-auto pb-4", rail ? "px-0" : "px-3")}>
        <ul className={cn("space-y-0.5", rail && "flex flex-col items-center")}>
          <li>
            {wrap(
              "Inicio",
              <Link href="/" onClick={onNavigate} className={itemClass(pathname === "/")} aria-current={pathname === "/" ? "page" : undefined}>
                {pathname === "/" && <ActiveBg mobile={mobile} />}
                <Home className="size-[18px] shrink-0" />
                {!rail && <span>Inicio · Catálogo</span>}
              </Link>,
            )}
          </li>
        </ul>

        {GROUPS.map(({ module, items }) => {
          const open = !closedGroups.has(module.id);
          const ModuleIcon = module.icon;
          return (
            <div key={module.id} className={cn("mt-4", rail && "mt-3 border-t border-border pt-3")}>
              {!rail && (
                <button
                  type="button"
                  onClick={() =>
                    setClosedGroups((s) => {
                      const n = new Set(s);
                      if (n.has(module.id)) n.delete(module.id);
                      else n.add(module.id);
                      return n;
                    })
                  }
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-faint transition hover:text-text-2"
                  aria-expanded={open}
                >
                  <ModuleIcon className="size-3.5" />
                  <span className="flex-1 truncate text-left" title={module.label}>
                    {module.short}
                  </span>
                  <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
                </button>
              )}
              <AnimatePresence initial={false}>
                {(open || rail) && (
                  <motion.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className={cn("space-y-0.5 overflow-hidden", !rail && "mt-1", rail && "flex flex-col items-center")}
                  >
                    {items.map((d) => {
                      const href = `/tableros/${d.slug}`;
                      const active = pathname === href;
                      const Icon = d.icon;
                      return (
                        <li key={d.slug}>
                          {wrap(
                            d.title,
                            <Link href={href} onClick={onNavigate} className={itemClass(active)} aria-current={active ? "page" : undefined}>
                              {active && <ActiveBg mobile={mobile} />}
                              <Icon className="size-[18px] shrink-0" />
                              {!rail && <span className="truncate">{d.short}</span>}
                            </Link>,
                          )}
                        </li>
                      );
                    })}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>

      {/* Pie */}
      <div className={cn("flex items-center gap-2 border-t border-border p-3", rail ? "flex-col" : "justify-between")}>
        <form action={logout}>
          {wrap(
            "Cerrar sesión",
            <button
              type="submit"
              className={cn(
                "flex items-center gap-2 rounded-full text-sm font-medium text-muted transition hover:bg-critical-soft hover:text-critical-ink",
                rail ? "size-10 justify-center" : "px-3 py-2",
              )}
              aria-label="Cerrar sesión"
            >
              <LogOut className="size-[18px]" />
              {!rail && <span>Salir</span>}
            </button>,
          )}
        </form>
        <div className={cn("flex items-center gap-2", rail && "flex-col")}>
          <ThemeToggle />
          {onToggleCollapsed &&
            wrap(
              rail ? "Expandir menú" : "Contraer menú",
              <button
                type="button"
                onClick={onToggleCollapsed}
                className="grid size-10 place-items-center rounded-full border border-border bg-surface text-text-2 transition hover:border-primary/40 hover:text-primary"
                aria-label={rail ? "Expandir menú" : "Contraer menú"}
              >
                {rail ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
              </button>,
            )}
        </div>
      </div>
    </div>
  );
}
