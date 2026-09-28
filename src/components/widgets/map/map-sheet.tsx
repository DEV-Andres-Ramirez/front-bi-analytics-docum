"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, type ReactNode } from "react";
import { Portal } from "@/components/ui/portal";

/**
 * Hoja inferior (bottom sheet) para el detalle del territorio en pantallas angostas
 * (mapRedesign 2: "detalle en bottom sheet"). Misma gramática que ui/sheet.tsx
 * (portal, overlay, Esc, foco al botón de cerrar), pero anclada abajo.
 */
export function MapSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center" role="presentation">
            <motion.div className="absolute inset-0 bg-[var(--overlay)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${id}-t`}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "tween", ease: [0.22, 1, 0.36, 1], duration: 0.32 }}
              className="relative flex max-h-[85vh] w-full max-w-[560px] flex-col rounded-t-3xl border border-b-0 border-border bg-surface shadow-pop"
            >
              <span className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" aria-hidden />
              <header className="flex items-center justify-between gap-3 px-4 pb-1 pt-2">
                <h2 id={`${id}-t`} className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                  {title}
                </h2>
                <button type="button" onClick={onClose} aria-label="Cerrar detalle" autoFocus className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-surface-3 hover:text-text">
                  <X className="size-5" aria-hidden />
                </button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))]">{children}</div>
            </motion.section>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
