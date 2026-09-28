"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/cn";
import { Portal } from "./portal";

interface Props {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
  width?: number | "anchor";
  /** Etiqueta accesible del diálogo. */
  label?: string;
}

function placeAt(el: HTMLDivElement | null, a: HTMLElement | null, align: "start" | "end", width: number | "anchor" | undefined) {
  if (!el || !a) return;
  const r = a.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(width === "anchor" ? r.width : (width ?? 320), vw - 16);
  let left = align === "end" ? r.right - w : r.left;
  left = Math.max(8, Math.min(left, vw - w - 8));
  const below = vh - r.bottom - 12;
  const above = r.top - 12;
  const up = below < 260 && above > below;
  el.style.left = `${left}px`;
  el.style.width = `${w}px`;
  el.style.maxHeight = `${Math.max(180, (up ? above : below) - 8)}px`;
  el.style.top = up ? "" : `${r.bottom + 8}px`;
  el.style.bottom = up ? `${vh - r.top + 8}px` : "";
  el.style.transformOrigin = up ? "bottom" : "top";
}

/**
 * Popover anclado (portal + posición fija). La posición se aplica de forma
 * imperativa sobre el nodo (sin estado), y se recalcula en scroll/resize.
 */
export function Popover({ anchor, open, onClose, children, align = "start", className, width, label }: Props) {
  const panel = useRef<HTMLDivElement | null>(null);

  // Ref callback: posiciona el panel en cuanto se monta (antes del primer pintado)
  const setPanel = (el: HTMLDivElement | null) => {
    panel.current = el;
    placeAt(el, anchor.current, align, width);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        anchor.current?.focus();
      }
    };
    const reflow = () => placeAt(panel.current, anchor.current, align, width);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", reflow);
    window.addEventListener("scroll", reflow, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reflow);
      window.removeEventListener("scroll", reflow, true);
    };
  }, [open, onClose, anchor, align, width]);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={setPanel}
            role="dialog"
            aria-label={label}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: "fixed" }}
            className={cn("z-[70] flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-pop", className)}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
