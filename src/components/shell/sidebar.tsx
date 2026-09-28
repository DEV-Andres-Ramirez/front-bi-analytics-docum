"use client";

import { ChevronDown, Home, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { PositivaLogo, PositivaMark } from "@/components/brand/logo";
import { Tooltip } from "@/components/ui/tooltip";
import { dashboardsByModule, type ModuleId } from "@/config/dashboards";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/cn";
import { logout } from "@/server/auth/actions";

interface Props {
  /** Riel de 76 px (solo íconos). */
  rail: boolean;
  onToggleRail?: () => void;
  onNavigate?: () => void;
  /** Variante del drawer móvil (siempre expandida, sin "Contraer"). */
  mobile?: boolean;
}

const GROUPS = dashboardsByModule();
const NO_CLOSED: ModuleId[] = [];
const SPRING = { type: "spring", stiffness: 520, damping: 42 } as const;

/** Indicador izquierdo de 3×18 px compartido por todos los ítems (layoutId). */
function ActiveIndicator({ id, className }: { id: string; className?: string }) {
  return (
    <motion.span
      layoutId={id}
      aria-hidden
      className={cn("absolute top-[calc(50%-9px)] h-[18px] w-[3px] rounded-full bg-primary", className)}
      transition={SPRING}
    />
  );
}

function RailTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip content={label} side="right">
      {children}
    </Tooltip>
  );
}

/**
 * Sidebar v2 (284 px; riel de 76 px).
 * Lockup de 64 px alineado con la línea del topbar, "Inicio" primero, grupos por módulo con
 * punto de color (data-module → var(--mod)), guía vertical, ítems de 34 px e indicador activo.
 * Presupuesto vertical ≈ 840 px: cabe en 900 sin scroll.
 */
export function Sidebar({ rail: railProp, onToggleRail, onNavigate, mobile }: Props) {
  const pathname = usePathname();
  const rail = railProp && !mobile;
  const [closed, setClosed] = useLocalStorage<ModuleId[]>("docum:nav-closed", NO_CLOSED);
  const indicatorId = mobile ? "nav-indicator-m" : rail ? "nav-indicator-r" : "nav-indicator";

  const activeSlug = pathname.startsWith("/tableros/") ? pathname.split("/")[2] : null;
  const activeModule = activeSlug ? GROUPS.find((g) => g.items.some((d) => d.slug === activeSlug))?.module.id : undefined;

  // Al llegar a una ruta, su grupo se abre solo (y deja de figurar como cerrado).
  // Solo al cambiar de grupo activo: después el usuario puede volver a cerrarlo.
  const lastActive = useRef<ModuleId | undefined>(undefined);
  useEffect(() => {
    if (activeModule === lastActive.current) return;
    lastActive.current = activeModule;
    if (activeModule && closed.includes(activeModule)) setClosed((c) => c.filter((m) => m !== activeModule));
  }, [activeModule, closed, setClosed]);

  const toggleGroup = (id: ModuleId) => setClosed((c) => (c.includes(id) ? c.filter((m) => m !== id) : [...c, id]));
  const homeActive = pathname === "/";

  return (
    <div className="flex h-full flex-col">
      {/* Lockup: 64 px, misma línea que el topbar */}
      <div className={cn("flex h-16 shrink-0 items-center border-b border-border", rail ? "justify-center" : "px-5")}>
        <Link href="/" onClick={onNavigate} aria-label="Docum BI · Inicio" className="flex min-w-0 items-center gap-3 rounded-lg">
          {rail ? (
            <PositivaMark size={30} className="text-primary" />
          ) : (
            <>
              <PositivaLogo height={28} priority />
              <span aria-hidden className="h-6 w-px shrink-0 bg-border" />
              <span className="whitespace-nowrap text-[12px] font-bold tracking-tight text-text">Docum BI</span>
            </>
          )}
        </Link>
      </div>

      {/* Navegación */}
      <nav aria-label="Tableros" className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden", rail ? "px-0 py-2" : "px-3 py-3")}>
        <ul className={cn(rail && "flex flex-col items-center")}>
          <li className="relative">
            {rail ? (
              <RailTip label="Inicio">
                <Link
                  href="/"
                  onClick={onNavigate}
                  aria-current={homeActive ? "page" : undefined}
                  aria-label="Inicio"
                  className={cn(
                    "relative grid size-11 place-items-center rounded-xl transition-colors",
                    homeActive ? "bg-primary-soft-2 text-primary-text" : "text-text-2 hover:bg-surface-3 hover:text-text",
                  )}
                >
                  <Home className="size-[18px]" />
                </Link>
              </RailTip>
            ) : (
              <Link
                href="/"
                onClick={onNavigate}
                aria-current={homeActive ? "page" : undefined}
                className={cn(
                  "relative flex h-[34px] items-center gap-2.5 rounded-lg px-3 text-[13px] transition-colors",
                  homeActive ? "bg-primary-soft-2 font-semibold text-primary-text" : "font-medium text-text-2 hover:bg-surface-3 hover:text-text",
                )}
              >
                {homeActive && <ActiveIndicator id={indicatorId} className="-left-3" />}
                <Home className="size-4 shrink-0" />
                <span>Inicio</span>
              </Link>
            )}
            {rail && homeActive && <ActiveIndicator id={indicatorId} className="left-0" />}
          </li>
        </ul>

        {GROUPS.map(({ module, items }) => {
          const open = rail || !closed.includes(module.id);
          const listId = `nav-${module.id}`;
          if (rail) {
            return (
              <div key={module.id} data-module={module.id} role="group" aria-label={module.label}>
                <div aria-hidden className="flex h-3 items-center justify-center gap-1.5">
                  <span className="h-px w-3 bg-border" />
                  <span className="size-1.5 rounded-full bg-mod" />
                  <span className="h-px w-3 bg-border" />
                </div>
                <ul className="flex flex-col items-center">
                  {items.map((d) => {
                    const active = d.slug === activeSlug;
                    const Icon = d.icon;
                    return (
                      <li key={d.slug} className="relative flex w-full justify-center">
                        <RailTip label={`${d.short} — ${module.short}`}>
                          <Link
                            href={`/tableros/${d.slug}`}
                            onClick={onNavigate}
                            aria-current={active ? "page" : undefined}
                            aria-label={`${d.short} — ${module.short}`}
                            className={cn(
                              "grid size-11 place-items-center rounded-xl transition-colors",
                              active ? "bg-primary-soft-2 text-primary-text" : "text-text-2 hover:bg-surface-3 hover:text-text",
                            )}
                          >
                            <Icon className="size-[18px]" />
                          </Link>
                        </RailTip>
                        {active && <ActiveIndicator id={indicatorId} className="left-0" />}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          }
          return (
            <div key={module.id} data-module={module.id} className="mt-2">
              <button
                type="button"
                onClick={() => toggleGroup(module.id)}
                aria-expanded={open}
                aria-controls={listId}
                title={module.label}
                className="group/h flex h-7 w-full items-center gap-2 rounded-lg px-3 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-muted transition-colors hover:text-text-2"
              >
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-mod" />
                <span className="min-w-0 flex-1 truncate">{module.short}</span>
                <span className="tabular text-[11px] font-semibold tracking-normal text-muted">{items.length}</span>
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0 transition-[opacity,transform] duration-200",
                    open ? "opacity-0 group-hover/h:opacity-100 group-focus-visible/h:opacity-100" : "-rotate-90 opacity-100",
                  )}
                />
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.ul
                    id={listId}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    // Guía vertical de 1 px alineada con el punto del módulo (x = 15 px)
                    className="space-y-px overflow-hidden bg-[linear-gradient(var(--border-strong),var(--border-strong))] bg-[length:1px_100%] bg-[position:15px_0] bg-no-repeat pl-6"
                  >
                    {items.map((d) => {
                      const active = d.slug === activeSlug;
                      const Icon = d.icon;
                      return (
                        <li key={d.slug} className="relative">
                          <Link
                            href={`/tableros/${d.slug}`}
                            onClick={onNavigate}
                            aria-current={active ? "page" : undefined}
                            title={d.title}
                            className={cn(
                              "flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors",
                              active ? "bg-primary-soft-2 font-semibold text-primary-text" : "font-medium text-text-2 hover:bg-surface-3 hover:text-text",
                            )}
                          >
                            <Icon className={cn("size-4 shrink-0", !active && "text-muted")} />
                            <span className="min-w-0 truncate">{d.short}</span>
                          </Link>
                          {active && <ActiveIndicator id={indicatorId} className="-left-[10px]" />}
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
      <div className={cn("shrink-0 border-t border-border", rail ? "flex flex-col items-center gap-1 p-2" : "flex items-center justify-between gap-2 p-3")}>
        <form action={logout}>
          {rail ? (
            <RailTip label="Cerrar sesión">
              <button
                type="submit"
                aria-label="Cerrar sesión"
                className="grid size-10 place-items-center rounded-xl text-muted transition-colors hover:bg-critical-soft hover:text-critical-ink"
              >
                <LogOut className="size-[18px]" />
              </button>
            </RailTip>
          ) : (
            <button
              type="submit"
              className="flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-semibold text-text-2 transition-colors hover:bg-critical-soft hover:text-critical-ink"
            >
              <LogOut className="size-4" />
              Salir
            </button>
          )}
        </form>
        {onToggleRail && !mobile && (
          <Fragment>
            {rail ? (
              <RailTip label="Expandir menú">
                <button
                  type="button"
                  onClick={onToggleRail}
                  aria-label="Expandir menú"
                  className="grid size-10 place-items-center rounded-xl text-text-2 transition-colors hover:bg-surface-3 hover:text-text"
                >
                  <PanelLeftOpen className="size-[18px]" />
                </button>
              </RailTip>
            ) : (
              <button
                type="button"
                onClick={onToggleRail}
                className="flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-semibold text-text-2 transition-colors hover:bg-surface-3 hover:text-text"
              >
                <PanelLeftClose className="size-4" />
                Contraer
              </button>
            )}
          </Fragment>
        )}
      </div>
    </div>
  );
}
