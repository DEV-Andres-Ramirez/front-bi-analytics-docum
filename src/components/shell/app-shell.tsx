"use client";

import { Maximize2, Menu, Minimize2, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { PositivaLogo } from "@/components/brand/logo";
import { Sheet } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Tooltip } from "@/components/ui/tooltip";
import { DASHBOARD_BY_SLUG, MODULES } from "@/config/dashboards";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/cn";
import { CommandPalette } from "./command-palette";
import { Sidebar } from "./sidebar";

function subscribeFullscreen(cb: () => void) {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useLocalStorage("docum:sidebar-collapsed", false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const fullscreen = useSyncExternalStore(subscribeFullscreen, () => Boolean(document.fullscreenElement), () => false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }, []);

  const slug = pathname.startsWith("/tableros/") ? pathname.split("/")[2] : null;
  const meta = slug ? DASHBOARD_BY_SLUG[slug] : null;
  const mod = meta ? MODULES.find((m) => m.id === meta.module) : null;

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar escritorio */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-r border-border bg-surface transition-[width] duration-300 ease-out lg:block",
          collapsed ? "w-[76px]" : "w-[284px]",
        )}
      >
        <Sidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed(!collapsed)} onOpenPalette={() => setPaletteOpen(true)} />
      </aside>

      {/* Drawer móvil / tablet */}
      <Sheet open={mobileOpen} onClose={() => setMobileOpen(false)} side="left" width="min(320px, 88vw)" title="Menú de navegación" bare>
        <div className="h-full">
          <Sidebar
            mobile
            collapsed={false}
            onOpenPalette={() => {
              setMobileOpen(false);
              setPaletteOpen(true);
            }}
            onNavigate={() => setMobileOpen(false)}
          />
        </div>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-[color-mix(in_oklab,var(--bg)_82%,transparent)] backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="grid size-10 place-items-center rounded-full border border-border bg-surface text-text-2 lg:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="size-5" />
            </button>
            <Link href="/" className="lg:hidden" aria-label="Inicio">
              <PositivaLogo height={26} className="hidden sm:block" />
            </Link>

            <nav aria-label="Ruta" className="hidden min-w-0 flex-1 items-center gap-2 text-sm lg:flex">
              <Link href="/" className="text-muted transition hover:text-text">
                Inicio
              </Link>
              {mod && (
                <>
                  <span className="text-faint">/</span>
                  <span className="text-muted">{mod.label}</span>
                </>
              )}
              {meta && (
                <>
                  <span className="text-faint">/</span>
                  <span className="truncate font-semibold text-text">{meta.title}</span>
                </>
              )}
              {!meta && pathname === "/" && (
                <>
                  <span className="text-faint">/</span>
                  <span className="font-semibold text-text">Catálogo</span>
                </>
              )}
            </nav>
            <div className="flex-1 lg:hidden" />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-3 text-sm text-muted transition hover:border-primary/40 hover:text-text"
                aria-label="Buscar tablero"
              >
                <Search className="size-4" />
                <span className="hidden md:inline">Buscar</span>
                <kbd className="hidden rounded-md border border-border px-1.5 text-[10px] font-semibold text-faint md:inline">Ctrl K</kbd>
              </button>
              <Tooltip content={fullscreen ? "Salir de pantalla completa" : "Modo presentación"} side="bottom">
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="hidden size-10 place-items-center rounded-full border border-border bg-surface text-text-2 transition hover:border-primary/40 hover:text-primary sm:grid"
                  aria-label={fullscreen ? "Salir de pantalla completa" : "Modo presentación"}
                >
                  {fullscreen ? <Minimize2 className="size-[18px]" /> : <Maximize2 className="size-[18px]" />}
                </button>
              </Tooltip>
              <ThemeToggle className="lg:hidden" />
            </div>
          </div>
        </header>

        <main id="contenido" className="min-w-0 flex-1">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
