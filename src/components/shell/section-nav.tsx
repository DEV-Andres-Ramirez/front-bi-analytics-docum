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
 * Scroll-spy: la sección activa es la primera (en orden del documento) que cruza la banda
 * entre el borde inferior de la zona sticky y el 40 % superior del viewport
 * (rootMargin −(sticky-h) 0 −60 % 0).
 */
export function useScrollSpy(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join("|");
  useEffect(() => {
    const list = key ? key.split("|") : [];
    const els = list.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    if (!els.length) return;
    const stickyH = Math.round(getTopbarState().stickyH || TOPBAR_H);
    const visible = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting);
        const first = list.find((id) => visible.get(id));
        if (first) setActive(first);
      },
      { rootMargin: `-${stickyH}px 0px -60% 0px` },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
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

/** Anchos de cada pestaña y del botón "Más" (último hijo) medidos en una capa invisible. */
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

/** Cuántas pestañas caben completas; si no caben todas, se reserva el botón "Más". */
function countFitting(widths: number[] | null, available: number, total: number): number {
  if (!widths || widths.length !== total + 1 || available <= 0) return 0;
  const tabs = widths.slice(0, total);
  const all = tabs.reduce((a, w) => a + w, 0);
  if (all <= available + 0.5) return total;
  const room = available - widths[total];
  let used = 0;
  let fit = 0;
  for (const w of tabs) {
    if (used + w > room + 0.5) break;
    used += w;
    fit += 1;
  }
  return fit;
}

const TAB =
  "relative flex h-16 shrink-0 items-center whitespace-nowrap px-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-offset-[-4px]";

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
  const activeInRest = rest.some((s) => s.id === active);
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
                    {s.label}
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
            aria-label={`Más secciones (${rest.length})${activeInRest ? ", incluye la sección actual" : ""}`}
            className={cn(TAB, "gap-1", activeInRest ? "text-text" : "text-muted hover:text-text")}
          >
            Más
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
            {activeInRest && <Underline />}
          </button>
        )}
      </div>

      {/* Capa de medida (invisible, fuera del flujo): pestañas + botón "Más" */}
      <div key={measureKey} ref={measureRef} aria-hidden inert className="pointer-events-none invisible absolute left-0 top-0 flex h-0 overflow-hidden whitespace-nowrap">
        {sections.map((s) => (
          <span key={s.id} className={TAB}>
            {s.label}
          </span>
        ))}
        <span className={cn(TAB, "gap-1")}>
          Más
          <ChevronDown className="size-3.5" aria-hidden />
        </span>
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
