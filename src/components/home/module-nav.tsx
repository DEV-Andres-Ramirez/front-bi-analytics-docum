"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { MODULES, type ModuleId } from "@/config/dashboards";
import { cn } from "@/lib/cn";

/** Alto del topbar (64) + esta barra (52): el scroll-spy y las anclas descuentan esta franja. */
const STICKY_OFFSET = 64 + 52;
/**
 * Línea de activación: un módulo es el activo cuando su borde superior la cruza. Las secciones llevan
 * scroll-mt de 136 px, así que tras un clic en el chip el módulo destino queda justo por encima de la línea.
 */
const SPY_LINE = STICKY_OFFSET + 40;
/** Desplazamiento (px) que el usuario debe hacer tras un clic en un chip para que el scroll-spy vuelva a mandar. */
const LOCK_SLACK = 32;

interface Props {
  /** Tableros visibles por módulo (reflejan la búsqueda). */
  counts: Record<ModuleId, number>;
  searching: boolean;
}

/**
 * Módulo activo según el scroll:
 * - al final de la página, el último módulo visible (Correspondencia nunca llegaría a la línea);
 * - si no, el último cuyo borde superior ya cruzó la línea de activación;
 * - con el hero a la vista (ningún módulo la cruzó), ninguno.
 */
function spyActive(): ModuleId | null {
  const doc = document.documentElement;
  const atBottom = window.scrollY + window.innerHeight >= doc.scrollHeight - 4;
  let current: ModuleId | null = null;
  let lastVisible: ModuleId | null = null;
  for (const m of MODULES) {
    const el = document.getElementById(m.id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.top <= SPY_LINE && r.bottom > STICKY_OFFSET) current = m.id;
    if (r.bottom > STICKY_OFFSET && r.top < window.innerHeight) lastVisible = m.id;
  }
  return atBottom && lastVisible ? lastVisible : current;
}

/**
 * ModuleNav: barra sticky (52 px, bajo el topbar) con un chip de 34 px por módulo.
 * - Punto del módulo, nombre corto y conteo (con búsqueda: resultados; en 0 baja al 40 %).
 * - Scroll-spy por posición de las secciones (rAF) y anclas (#pqrd). Tras un clic, el chip elegido se
 *   mantiene durante el desplazamiento suave y hasta que el usuario vuelve a desplazarse (no salta a otro).
 * - Máscara en los bordes cuando hay desbordamiento horizontal.
 */
export function ModuleNav({ counts, searching }: Props) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState<ModuleId | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const scroller = useRef<HTMLDivElement | null>(null);
  /**
   * Chip elegido con un clic: se mantiene mientras dura el desplazamiento (y: null) y después, hasta que el usuario
   * se mueva más de LOCK_SLACK px desde donde terminó (un reajuste de alto de la página no lo revierte).
   */
  const lockRef = useRef<{ id: ModuleId; y: number | null } | null>(null);

  // Scroll-spy: se recalcula en cada frame con scroll o cambio de tamaño (y cuando la búsqueda cambia las secciones).
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const lock = lockRef.current;
      if (lock) {
        if (lock.y === null || Math.abs(window.scrollY - lock.y) < LOCK_SLACK) return;
        lockRef.current = null;
      }
      setActive(spyActive());
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [counts]);

  // Mantiene visible el chip activo dentro del carril horizontal.
  useEffect(() => {
    const nav = scroller.current;
    if (!nav) return;
    if (!active) {
      // Arriba del todo (hero visible): el carril vuelve al inicio.
      if (nav.scrollLeft > 0) nav.scrollTo({ left: 0, behavior: reduce ? "auto" : "smooth" });
      return;
    }
    const chip = nav.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    if (!chip) return;
    const left = chip.offsetLeft;
    const right = left + chip.offsetWidth;
    if (left < nav.scrollLeft + 24 || right > nav.scrollLeft + nav.clientWidth - 24) {
      nav.scrollTo({ left: Math.max(0, left - 24), behavior: reduce ? "auto" : "smooth" });
    }
  }, [active, reduce]);

  const measure = useCallback((el: HTMLDivElement) => {
    const next = { left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 };
    setEdges((e) => (e.left === next.left && e.right === next.right ? e : next));
  }, []);

  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      scroller.current = el;
      if (!el) return;
      const ro = new ResizeObserver(() => measure(el));
      ro.observe(el);
      return () => ro.disconnect();
    },
    [measure],
  );

  const go = (e: MouseEvent<HTMLAnchorElement>, id: ModuleId) => {
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    // Congela el scroll-spy durante el desplazamiento; al terminar (scrollend, o el respaldo si no existe) fija la
    // posición de referencia: el chip elegido se mantiene hasta que el usuario vuelva a desplazarse.
    lockRef.current = { id, y: null };
    let fallback = 0;
    const settle = () => {
      window.clearTimeout(fallback);
      window.removeEventListener("scrollend", settle);
      if (lockRef.current?.id === id) lockRef.current = { id, y: window.scrollY };
    };
    window.addEventListener("scrollend", settle, { once: true });
    fallback = window.setTimeout(settle, 1500);
    setActive(id);
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  };

  const mask =
    edges.left || edges.right
      ? `linear-gradient(to right, ${edges.left ? "transparent 0, #000 32px" : "#000 0"}, ${edges.right ? "#000 calc(100% - 32px), transparent 100%" : "#000 100%"})`
      : undefined;

  return (
    <nav
      aria-label="Módulos"
      className="sticky top-16 z-30 border-b border-border bg-[color-mix(in_oklab,var(--bg)_86%,transparent)] backdrop-blur-xl"
    >
      <div
        ref={ref}
        onScroll={(e) => measure(e.currentTarget)}
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        className="relative mx-auto flex h-[52px] max-w-[var(--content-max)] items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:px-6 lg:px-10 [&::-webkit-scrollbar]:hidden"
      >
        {MODULES.map((m) => {
          const n = counts[m.id];
          const empty = n === 0;
          const on = active === m.id && !empty;
          return (
            <a
              key={m.id}
              href={`#${m.id}`}
              data-chip={m.id}
              data-module={m.id}
              onClick={(e) => (empty ? e.preventDefault() : go(e, m.id))}
              aria-current={on ? "location" : undefined}
              aria-disabled={empty || undefined}
              tabIndex={empty ? -1 : undefined}
              className={cn(
                "inline-flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-semibold transition-[background-color,color,box-shadow,opacity] duration-200",
                on
                  ? "bg-primary-soft-2 text-primary-text ring-1 ring-primary/30"
                  : "bg-surface text-text-2 ring-1 ring-border hover:text-text hover:ring-border-strong",
                empty && "pointer-events-none opacity-40",
              )}
            >
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-mod" />
              {m.short}
              <span
                className={cn(
                  "tabular grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold",
                  on ? "bg-surface/80 text-primary-text" : searching && !empty ? "bg-primary-soft-2 text-primary-text" : "bg-surface-3 text-muted",
                )}
              >
                <span className="sr-only">(</span>
                {n}
                <span className="sr-only">{n === 1 ? " tablero)" : " tableros)"}</span>
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
