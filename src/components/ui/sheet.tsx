"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Portal } from "./portal";

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: "right" | "left";
  width?: string;
  /** Sin encabezado: el contenido ocupa todo el panel (menú móvil). */
  bare?: boolean;
}

/** Panel lateral deslizante (filtros, detalle de fila, menú móvil). */
export function Sheet({ open, onClose, title, description, children, footer, side = "right", width = "min(480px, 100vw)", bare }: Props) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const from = side === "right" ? "100%" : "-100%";
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[60]" role="presentation">
            <motion.div
              className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${id}-title`}
              initial={{ x: from }}
              animate={{ x: 0 }}
              exit={{ x: from }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              style={{ width }}
              className={cn(
                "absolute top-0 flex h-full flex-col bg-surface shadow-pop",
                side === "right" ? "right-0 border-l border-border" : "left-0 border-r border-border",
              )}
            >
              {bare ? (
                <>
                  <h2 id={`${id}-title`} className="sr-only">
                    {title}
                  </h2>
                  <div className="min-h-0 flex-1">{children}</div>
                </>
              ) : (
              <>
              <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                <div className="min-w-0">
                  <h2 id={`${id}-title`} className="text-lg font-bold leading-tight">
                    {title}
                  </h2>
                  {description && <p className="mt-1 text-sm text-muted">{description}</p>}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-3 hover:text-text"
                  autoFocus
                >
                  <X className="size-5" />
                </button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
              {footer && <footer className="border-t border-border px-5 py-3">{footer}</footer>}
              </>
              )}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
