"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Portal } from "./portal";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  hideHeader?: boolean;
  /** Nombre accesible cuando no hay encabezado visible. */
  label?: string;
}

/** Modal centrado (widget ampliado, paleta de comandos). */
export function Dialog({ open, onClose, title, children, className, hideHeader, label }: Props) {
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

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[80] flex items-start justify-center p-3 pt-[8vh] sm:p-6 sm:pt-[10vh]">
            <motion.div
              className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={title && !hideHeader ? `${id}-title` : undefined}
              aria-label={hideHeader ? label : undefined}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={cn("relative flex max-h-[84vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-pop", className)}
            >
              {!hideHeader && (
                <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5">
                  <h2 id={`${id}-title`} className="min-w-0 truncate text-base font-bold">
                    {title}
                  </h2>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Cerrar"
                    className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-surface-3 hover:text-text"
                  >
                    <X className="size-5" />
                  </button>
                </header>
              )}
              <div className="min-h-0 flex-1 overflow-auto">{children}</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
