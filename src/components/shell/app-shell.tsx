"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Sheet } from "@/components/ui/sheet";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/cn";
import { CommandPalette } from "./command-palette";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

type SidebarPref = "rail" | "expanded" | null;
/** "auto": antes de hidratar el HTML del servidor no conoce el viewport ni la preferencia; decide el CSS. */
type SidebarMode = "auto" | "rail" | "expanded";

function subscribeFullscreen(cb: () => void) {
  document.addEventListener("fullscreenchange", cb);
  return () => document.removeEventListener("fullscreenchange", cb);
}

/** Ancho del sidebar por modo. En "auto" el riel entre 1024 y 1279 px lo aplica una media query desde el primer pintado. */
const ASIDE_W: Record<SidebarMode, string> = {
  auto: "w-[284px] lg:max-xl:w-[76px]",
  rail: "w-[76px]",
  expanded: "w-[284px]",
};
/** Visibilidad de cada variante del contenido (ambas montadas; se alterna con CSS, sin re-montar). */
const RAIL_VIS: Record<SidebarMode, string> = { auto: "hidden lg:max-xl:block", rail: "block", expanded: "hidden" };
const FULL_VIS: Record<SidebarMode, string> = { auto: "block lg:max-xl:hidden", rail: "hidden", expanded: "block" };

/**
 * Shell de la aplicación: Sidebar v2 (284 px o riel de 76 px), Topbar v2 sticky y paleta ⌘K.
 * El riel es automático entre 1024 y 1279 px de viewport salvo preferencia guardada
 * (docum:sidebar-pref); por debajo de 1024 px el menú es un drawer.
 *
 * Sin salto al hidratar: sin preferencia guardada el modo es "auto" (ancho y variante por media query),
 * así que a 1024–1279 px el primer pintado ya es el riel y la rejilla del tablero no pasa de 6 a 12
 * columnas. Las dos variantes del contenido están montadas y se alternan con CSS. El ancho solo se
 * anima cuando el usuario pulsa "Contraer"/"Expandir".
 */
export function AppShell({ children }: { children: ReactNode }) {
  const autoRail = useMediaQuery("(min-width: 1024px) and (max-width: 1279.98px)");
  const [pref, setPref] = useLocalStorage<SidebarPref>("docum:sidebar-pref", null);
  const rail = pref ? pref === "rail" : autoRail;
  // Sin preferencia (y siempre al hidratar, porque el servidor no lee localStorage) decide el CSS
  const mode: SidebarMode = pref ?? "auto";
  const [userToggled, setUserToggled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const fullscreen = useSyncExternalStore(subscribeFullscreen, () => Boolean(document.fullscreenElement), () => false);
  const [pseudoPresent, setPseudoPresent] = useState(false);
  const presenting = fullscreen || pseudoPresent;

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

  const toggleRail = useCallback(() => {
    const next = !rail;
    setUserToggled(true);
    // Si el valor elegido coincide con el automático, se borra la preferencia
    setPref(next === autoRail ? null : next ? "rail" : "expanded");
  }, [rail, autoRail, setPref]);

  const togglePresent = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      setPseudoPresent(false);
      return;
    }
    if (pseudoPresent) {
      setPseudoPresent(false);
      return;
    }
    const req = document.documentElement.requestFullscreen?.bind(document.documentElement);
    if (!req) {
      setPseudoPresent(true);
      return;
    }
    req().catch(() => setPseudoPresent(true));
  }, [pseudoPresent]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#contenido"
        className="sr-only z-[100] rounded-full bg-surface px-4 py-2 text-sm font-semibold text-text shadow-pop focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Saltar al contenido
      </a>

      {/* Sidebar escritorio (se oculta en modo presentación) */}
      <aside
        aria-label="Navegación principal"
        data-sidebar={mode}
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 overflow-hidden border-r border-border bg-surface",
          userToggled && "transition-[width] duration-300 ease-out motion-reduce:transition-none",
          !presenting && "lg:block",
          ASIDE_W[mode],
        )}
      >
        <div className={cn("h-full", RAIL_VIS[mode])}>
          <Sidebar rail onToggleRail={toggleRail} />
        </div>
        <div className={cn("h-full w-[284px]", FULL_VIS[mode])}>
          <Sidebar rail={false} onToggleRail={toggleRail} />
        </div>
      </aside>

      {/* Drawer móvil / tablet */}
      <Sheet open={mobileOpen} onClose={closeMobile} side="left" width="min(300px, 88vw)" title="Menú de navegación" bare>
        <div className="h-full">
          <Sidebar mobile rail={false} onNavigate={closeMobile} />
        </div>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setMobileOpen(true)} onOpenPalette={openPalette} presenting={presenting} onTogglePresent={togglePresent} />
        <main id="contenido" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={closePalette} onTogglePresent={togglePresent} />
    </div>
  );
}
