"use client";

import { ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type UIEvent } from "react";
import { Popover } from "@/components/ui/popover";
import { getTopbarState, TOPBAR_H, type TopbarSection } from "@/hooks/use-topbar";
import { cn } from "@/lib/cn";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Scroll suave a una sección (respeta scroll-margin-top = --sticky-h + 16) y deja el ancla en la URL. */
export function goToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${id}`);
}

export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

/**
 * Scroll-spy: la sección activa es la ÚLTIMA (en orden del documento) cuyo inicio ya pasó la línea
 * de lectura, a 40 % del viewport bajo la zona sticky. Con la primera que cruzaba la banda, el pie
 * de la sección anterior (≈ 70 px) mantenía activa la pestaña equivocada. Al llegar al final de la
 * página se activa la última sección que asoma (las cortas nunca alcanzan la línea).
 * Scroll + rAF (sin setState síncrono en el efecto).
 */
export function useScrollSpy(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join("|");
  useEffect(() => {
    const list = key ? key.split("|") : [];
    if (!list.length) return;
    let raf = 0;
    const compute = () => {
      raf = 0;
      const stickyH = getTopbarState().stickyH || TOPBAR_H;
      const vh = window.innerHeight;
      const line = stickyH + (vh - stickyH) * 0.4;
      const atBottom = window.scrollY + vh >= document.documentElement.scrollHeight - 2;
      let current: string | null = null;
      for (const id of list) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top === undefined) continue;
        if (top <= line || (atBottom && top < vh)) current = id;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [key]);
  return active;
}

/**
 * Carril horizontal con máscara de desvanecido en el borde que tiene más contenido.
 * Ref callback (ResizeObserver + MutationObserver) compatible con el React Compiler.
 */
export function useHorizontalFade<T extends HTMLElement>(fade = 28) {
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = useCallback((el: T) => {
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((s) => (s.left === left && s.right === right ? s : { left, right }));
  }, []);
  const attach = useCallback(
    (el: T | null) => {
      if (!el) return;
      measure(el);
      // El contenedor y cada hijo (cambian de ancho al cargar fuentes o al cambiar etiquetas)
      const ro = new ResizeObserver(() => measure(el));
      const observeAll = () => {
        ro.observe(el);
        for (const c of el.children) ro.observe(c);
      };
      observeAll();
      const mo = new MutationObserver(() => {
        observeAll();
        measure(el);
      });
      mo.observe(el, { childList: true, subtree: true, characterData: true });
      return () => {
        ro.disconnect();
        mo.disconnect();
      };
    },
    [measure],
  );
  const onScroll = useCallback((e: UIEvent<T>) => measure(e.currentTarget), [measure]);
  const mask =
    edges.left || edges.right
      ? `linear-gradient(to right, ${edges.left ? `transparent 0, black ${fade}px` : "black 0"}, ${edges.right ? `black calc(100% - ${fade}px), transparent 100%` : "black 100%"})`
      : undefined;
  const style: CSSProperties | undefined = mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined;
  return { attach, onScroll, style, overflowing: edges.left || edges.right };
}

// ─── Priority+ ───────────────────────────────────────────────────────────────
/** Ancho disponible del carril (se lee al montar, antes del primer pintado, y con ResizeObserver). */
function useRailWidth() {
  const [width, setWidth] = useState(0);
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const read = (w: number) => setWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
    read(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => read(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/**
 * Anchos medidos en una capa invisible: cada pestaña (n), el botón "Más" y, después, el botón con
 * la etiqueta de cada sección (n): cuando la sección activa está en el menú, el botón la nombra.
 */
function useTabWidths() {
  const [widths, setWidths] = useState<number[] | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
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

/**
 * Cuántas pestañas caben completas. Si no caben todas, se reserva el botón del menú con el ancho de
 * su etiqueta más larga posible ("Más" o el nombre de cualquier sección del menú): así no salta
 * cuando pasa a nombrar la sección activa.
 */
function countFitting(widths: number[] | null, available: number, total: number): number {
  if (!widths || widths.length !== total * 2 + 1 || available <= 0) return 0;
  const tabs = widths.slice(0, total);
  const more = widths[total];
  const named = widths.slice(total + 1);
  if (tabs.reduce((a, w) => a + w, 0) <= available + 0.5) return total;
  for (let fit = total - 1; fit >= 0; fit--) {
    const used = tabs.slice(0, fit).reduce((a, w) => a + w, 0);
    const reserve = Math.max(more, ...named.slice(fit));
    if (used + reserve <= available + 0.5) return fit;
  }
  return 0;
}

/**
 * Pestaña de 64 px. El foco visible no es el rectángulo de toda la barra: el anillo redondeado
 * va en la etiqueta interna (TAB_LABEL), como el resto de controles del sistema.
 */
const TAB = "group/tab relative flex h-16 shrink-0 items-center whitespace-nowrap px-1.5 text-[13px] font-semibold transition-colors focus-visible:outline-none";
const TAB_LABEL =
  "flex items-center gap-1 rounded-lg px-1 py-1 group-focus-visible/tab:outline-2 group-focus-visible/tab:outline-offset-0 group-focus-visible/tab:outline-primary group-focus-visible/tab:outline-solid";

function Underline() {
  return (
    <motion.span
      layoutId="section-nav-underline"
      aria-hidden
      className="absolute inset-x-2.5 bottom-0 h-[3px] rounded-t-full bg-primary"
      transition={{ type: "spring", stiffness: 520, damping: 42 }}
    />
  );
}

/**
 * SectionNav (topbar de escritorio): pestañas con subrayado compartido (layoutId) y scroll-spy.
 * Priority+: se miden las pestañas y las que no caben completas pasan a un menú "Más",
 * así nunca se ve una etiqueta partida ni fragmentos de letras bajo una máscara.
 */
export function SectionNav({ sections, className }: { sections: TopbarSection[]; className?: string }) {
  const active = useScrollSpy(sections.map((s) => s.id));
  const { ref: railRef, width: railWidth } = useRailWidth();
  const { ref: measureRef, widths: tabWidths } = useTabWidths();
  const fit = countFitting(tabWidths, railWidth, sections.length);
  const measured = tabWidths !== null && railWidth > 0;
  const shown = sections.slice(0, fit);
  const rest = sections.slice(fit);
  const activeRest = rest.find((s) => s.id === active);
  const activeInRest = Boolean(activeRest);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  // Etiquetas de la capa de medida: si cambian, se vuelve a montar y medir
  const measureKey = sections.map((s) => s.label).join("|");

  return (
    <nav aria-label="Secciones del tablero" className={cn("relative min-w-0", className)}>
      <div ref={railRef} className="flex h-16 min-w-0 items-stretch overflow-hidden">
        {measured && (
          <ul className="flex min-w-0 items-stretch">
            {shown.map((s) => {
              const on = active === s.id;
              return (
                <li key={s.id} className="flex">
                  <a
                    href={`#${s.id}`}
                    data-section={s.id}
                    aria-current={on ? "location" : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      goToSection(s.id);
                    }}
                    className={cn(TAB, on ? "text-text" : "text-muted hover:text-text")}
                  >
                    <span className={TAB_LABEL}>{s.label}</span>
                    {on && <Underline />}
                  </a>
                </li>
              );
            })}
          </ul>
        )}
        {measured && rest.length > 0 && (
          <button
            ref={moreRef}
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={activeRest ? `Sección actual: ${activeRest.label}. Más secciones (${rest.length})` : `Más secciones (${rest.length})`}
            className={cn(TAB, activeInRest ? "text-text" : "text-muted hover:text-text")}
          >
            {/* Con la sección activa dentro del menú, el botón la nombra (no "Más"): se sabe dónde se está */}
            <span className={TAB_LABEL}>
              {activeRest ? activeRest.label : "Más"}
              <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
            </span>
            {activeInRest && <Underline />}
          </button>
        )}
      </div>

      {/* Capa de medida (invisible, fuera del flujo): pestañas, botón "Más" y botón con cada etiqueta */}
      <div key={measureKey} ref={measureRef} aria-hidden inert className="pointer-events-none invisible absolute left-0 top-0 flex h-0 overflow-hidden whitespace-nowrap">
        {sections.map((s) => (
          <span key={s.id} className={TAB}>
            <span className={TAB_LABEL}>{s.label}</span>
          </span>
        ))}
        {["Más", ...sections.map((s) => s.label)].map((label, i) => (
          <span key={`more-${i}`} className={TAB}>
            <span className={TAB_LABEL}>
              {label}
              <ChevronDown className="size-3.5" aria-hidden />
            </span>
          </span>
        ))}
      </div>

      <Popover anchor={moreRef} open={open && rest.length > 0} onClose={close} align="end" width={240} label="Más secciones">
        <ul className="p-1.5">
          {rest.map((s) => {
            const on = active === s.id;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={on ? "location" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    close();
                    goToSection(s.id);
                  }}
                  className={cn(
                    "flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-semibold transition-colors",
                    on ? "bg-primary-soft-2 text-primary-text" : "text-text-2 hover:bg-surface-3 hover:text-text",
                  )}
                >
                  <span aria-hidden className={cn("h-4 w-[3px] shrink-0 rounded-full", on ? "bg-primary" : "bg-transparent")} />
                  {s.label}
                </a>
              </li>
            );
          })}
        </ul>
      </Popover>
    </nav>
  );
}
