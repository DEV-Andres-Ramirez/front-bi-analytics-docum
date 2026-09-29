"use client";

import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Menu, Presentation, RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PositivaMark } from "@/components/brand/logo";
import { ThemeSwitch } from "@/components/ui/theme-toggle";
import { Tooltip } from "@/components/ui/tooltip";
import { DASHBOARD_BY_SLUG, MODULES, type DashboardMeta, type ModuleMeta } from "@/config/dashboards";
import { useTopbar } from "@/hooks/use-topbar";
import { cn } from "@/lib/cn";
import { SectionNav } from "./section-nav";
import { clockLabel, moduleEchoesDashboard, updatedLabel, useCatalog, useNow, useShortcutLabel } from "./shell-hooks";

interface Props {
  onOpenMenu: () => void;
  onOpenPalette: () => void;
  presenting: boolean;
  onTogglePresent: () => void;
}

const ICON_BTN =
  "grid size-10 shrink-0 place-items-center rounded-full border border-border bg-surface text-text-2 transition-colors hover:border-border-strong hover:text-text";

/**
 * Contexto izquierdo: ruta (módulo / título corto; solo el título si el módulo se llama igual) o, con el
 * H1 fuera de pantalla, tile + título.
 * El periodo no se repite aquí: la FilterBar sticky, justo debajo, ya muestra el rango.
 */
function TopbarContext({ meta, mod, compact }: { meta: DashboardMeta | null; mod: ModuleMeta | null; compact: boolean }) {
  if (!meta || !mod) {
    return <span className="text-sm font-semibold text-text">Inicio</span>;
  }
  const Icon = meta.icon;
  const echo = moduleEchoesDashboard(mod, meta);
  return (
    <div data-module={mod.id} className="grid min-w-0 flex-1 items-center">
      {/* Ruta (H1 visible): si falta espacio se recorta primero el módulo, no el tablero */}
      <nav
        aria-label="Ruta"
        aria-hidden={compact}
        inert={compact}
        className={cn(
          "col-start-1 row-start-1 flex min-w-0 items-center gap-2 text-sm transition-[opacity,translate] duration-300 ease-out",
          // La capa oculta no reserva ancho (w-0): el título compacto no queda separado de las pestañas
          compact ? "pointer-events-none w-0 -translate-y-1.5 opacity-0" : "opacity-100",
        )}
      >
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-mod" />
        {/* Módulo con el mismo nombre que su único tablero (Tutelas): un solo crumb, no "Tutelas / Tutelas" */}
        {!echo && (
          <>
            <Link href={`/#${mod.id}`} title={mod.label} className="min-w-[2.5rem] shrink-[8] truncate whitespace-nowrap text-muted transition-colors hover:text-text">
              {mod.short}
            </Link>
            <span aria-hidden className="shrink-0 text-faint">
              /
            </span>
          </>
        )}
        <span aria-current="page" title={meta.title} className="min-w-0 truncate whitespace-nowrap font-semibold text-text">
          {meta.short}
        </span>
      </nav>
      {/* Compacto (H1 fuera de pantalla) */}
      <div
        aria-hidden={!compact}
        inert={!compact}
        className={cn(
          "col-start-1 row-start-1 flex min-w-0 items-center gap-2.5 transition-[opacity,translate] duration-300 ease-out",
          compact ? "opacity-100" : "pointer-events-none w-0 translate-y-1.5 opacity-0",
        )}
      >
        <span className="mod-tile grid size-7 shrink-0 place-items-center rounded-lg">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 truncate whitespace-nowrap text-sm font-bold text-text" title={meta.title}>
          {meta.heading}
        </span>
      </div>
    </div>
  );
}

function UpdatedAgo({ updatedAt, className }: { updatedAt: number; className?: string }) {
  const now = useNow();
  const qc = useQueryClient();
  if (!updatedAt) return null;
  return (
    // La visibilidad va en un envoltorio propio (cn no fusiona clases: el inline-flex del tooltip ganaría a "hidden").
    // Oculto, no deja un hueco extra en la fila.
    <span className={className}>
      <Tooltip content={`Datos consultados a las ${clockLabel(updatedAt)}. Clic para actualizar.`} side="bottom">
        <button
          type="button"
          onClick={() => {
            void qc.invalidateQueries({ queryKey: ["tablero"] });
            void qc.invalidateQueries({ queryKey: ["detalle"] });
            void qc.invalidateQueries({ queryKey: ["catalogo"] });
          }}
          className="group inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-medium text-muted transition-colors hover:bg-surface-3 hover:text-text"
        >
          <RefreshCw className="size-3.5 transition-transform duration-500 group-hover:rotate-180" aria-hidden />
          {updatedLabel(updatedAt, now)}
        </button>
      </Tooltip>
    </span>
  );
}

function MockBadge({ variant }: { variant: "full" | "short" | "icon" }) {
  return (
    <Tooltip
      side="bottom"
      content="Datos sintéticos generados a partir de distribuciones anonimizadas de las vistas reales. Se reemplazarán por la base de datos."
    >
      <span
        tabIndex={0}
        aria-label="Datos de prueba"
        title={variant === "full" ? undefined : "Datos de prueba"}
        className={cn(
          "inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-warning-soft font-semibold text-warning-ink",
          variant === "full" && "h-8 gap-1.5 px-2.5 text-xs",
          variant === "short" && "h-7 gap-1 px-2 text-[11px]",
          variant === "icon" && "size-8 justify-center",
        )}
      >
        <FlaskConical className={cn("shrink-0", variant === "short" ? "size-3" : "size-3.5")} aria-hidden />
        {variant === "full" && <span>Datos de prueba</span>}
        {variant === "short" && <span aria-hidden>Prueba</span>}
      </span>
    </Tooltip>
  );
}

/**
 * Topbar v2 (64 px, sticky, con blur).
 * Escritorio: contexto a la izquierda, SectionNav (priority+) cuando el H1 sale de pantalla y, a la
 * derecha, barra de comandos (solo ícono en el Home, que tiene su propio buscador, y con SectionNav),
 * "Actualizado hace N min", badge "Datos de prueba", modo presentación y
 * ThemeSwitch. Qué cabe se decide con container queries sobre el ancho real del topbar (@container/topbar),
 * que depende del sidebar (284 px o riel de 76 px), no solo del viewport.
 * Móvil: menú + isotipo + "Docum BI" + buscar + "Prueba" + tema.
 */
export function Topbar({ onOpenMenu, onOpenPalette, presenting, onTogglePresent }: Props) {
  const pathname = usePathname();
  const slug = pathname.startsWith("/tableros/") ? pathname.split("/")[2] : null;
  const meta = slug ? (DASHBOARD_BY_SLUG[slug] ?? null) : null;
  const mod = meta ? (MODULES.find((m) => m.id === meta.module) ?? null) : null;
  const shortcut = useShortcutLabel();

  const barSlug = useTopbar((s) => s.slug);
  const sections = useTopbar((s) => s.sections);
  const headerHidden = useTopbar((s) => s.headerHidden);
  const dashUpdatedAt = useTopbar((s) => s.updatedAt);
  const dashSource = useTopbar((s) => s.source);

  // En Home (y rutas sin tablero) la hora y el origen salen de la caché del catálogo
  const catalog = useCatalog(false);
  const onDashboard = Boolean(meta) && barSlug === slug;
  const updatedAt = onDashboard ? dashUpdatedAt : catalog.dataUpdatedAt;
  const source = onDashboard ? dashSource : (catalog.data?.source ?? null);
  const compact = onDashboard && headerHidden;
  const navVisible = compact && sections.length > 1;
  // Barra de comandos ancha solo en tableros: en el Home el hero ya tiene su buscador (dos campos casi
  // iguales en el mismo pliegue confunden) y en tableros con SectionNav las pestañas necesitan el sitio
  const wideSearch = !navVisible && pathname !== "/";

  return (
    // Fondo casi opaco y desaturado: el color de las gráficas no se filtra como manchas bajo la barra
    <header className="@container/topbar sticky top-0 z-40 h-16 shrink-0 border-b border-border bg-[color-mix(in_oklab,var(--bg)_95%,transparent)] backdrop-blur-xl backdrop-saturate-50">
      <div className="flex h-full items-center gap-3 px-4 sm:px-5 xl:px-8">
        {/* Móvil / tablet: menú + isotipo + marca */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5 lg:hidden">
          <button type="button" onClick={onOpenMenu} className={ICON_BTN} aria-label="Abrir menú">
            <Menu className="size-5" />
          </button>
          <Link href="/" className="flex items-center gap-2 rounded-lg" aria-label="Docum BI · Inicio">
            <PositivaMark size={26} className="text-primary" />
            {/* Bajo 390 px el wordmark cede su sitio a buscar, "Prueba" y tema (el isotipo sigue enlazando al Inicio) */}
            <span className="hidden whitespace-nowrap text-[13px] font-bold tracking-tight text-text min-[390px]:inline">Docum BI</span>
          </Link>
        </div>

        {/* Escritorio: contexto (con SectionNav visible, el título no cede ante las pestañas) */}
        <div className={cn("hidden min-w-0 lg:flex", navVisible ? "max-w-[300px] shrink-0" : "flex-1")}>
          <TopbarContext meta={meta} mod={mod} compact={compact} />
        </div>

        {navVisible ? <SectionNav sections={sections} className="hidden min-w-0 flex-1 self-stretch lg:block" /> : null}

        {/* Derecha: lo que se muestra depende del ancho real del topbar (container query), no del viewport */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {wideSearch && (
            <button
              type="button"
              onClick={onOpenPalette}
              aria-label="Buscar tablero o acción"
              aria-keyshortcuts={shortcut === "⌘K" ? "Meta+K" : "Control+K"}
              className="hidden h-10 w-[280px] items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-sm text-muted transition-colors hover:border-border-strong hover:text-text @min-[1100px]/topbar:flex"
            >
              <Search className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">Buscar tablero o acción…</span>
              <kbd className="shrink-0 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted">{shortcut}</kbd>
            </button>
          )}
          <span className={cn("inline-flex", wideSearch && "@min-[1100px]/topbar:hidden")}>
            <Tooltip content={`Buscar tablero o acción (${shortcut})`} side="bottom">
              <button
                type="button"
                onClick={onOpenPalette}
                aria-label="Buscar tablero o acción"
                aria-keyshortcuts={shortcut === "⌘K" ? "Meta+K" : "Control+K"}
                className={ICON_BTN}
              >
                <Search className="size-[18px]" />
              </button>
            </Tooltip>
          </span>

          {/* Con SectionNav (solo lg+) se ceden "Actualizado", el texto del badge y el modo presentación */}
          <UpdatedAgo
            updatedAt={updatedAt}
            className={navVisible ? "hidden max-lg:@min-[860px]/topbar:inline-flex" : "hidden @min-[860px]/topbar:inline-flex"}
          />
          {source === "mock" && (
            <>
              <span className="inline-flex sm:hidden">
                <MockBadge variant="short" />
              </span>
              <span className={cn("hidden sm:inline-flex", navVisible && "lg:hidden")}>
                <MockBadge variant="full" />
              </span>
              {navVisible && (
                <span className="hidden lg:inline-flex">
                  <MockBadge variant="icon" />
                </span>
              )}
            </>
          )}

          <span className={cn("hidden md:inline-flex", navVisible && "lg:hidden")}>
            <Tooltip content={presenting ? "Salir del modo presentación" : "Modo presentación (pantalla completa)"} side="bottom">
              <button
                type="button"
                onClick={onTogglePresent}
                aria-pressed={presenting}
                aria-label={presenting ? "Salir del modo presentación" : "Modo presentación"}
                className={cn(ICON_BTN, presenting && "border-primary/40 bg-primary-soft text-primary-text")}
              >
                {presenting ? <X className="size-[18px]" /> : <Presentation className="size-[18px]" />}
              </button>
            </Tooltip>
          </span>
          <ThemeSwitch size="auto" />
        </div>
      </div>
    </header>
  );
}
