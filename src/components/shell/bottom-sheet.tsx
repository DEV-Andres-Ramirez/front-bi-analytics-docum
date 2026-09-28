"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, type ReactNode } from "react";
import { Portal } from "@/components/ui/portal";

/** Panel inferior (móvil y tablet): secciones del tablero y acciones rápidas. */
export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
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
          <div className="fixed inset-0 z-[60]" role="presentation">
            <motion.div
              className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${id}-title`}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 40 }}
              className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[82dvh] w-full max-w-xl flex-col rounded-t-3xl border-t border-border bg-surface shadow-pop"
            >
              <span aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border-strong" />
              <header className="flex items-center justify-between gap-3 px-5 pb-1 pt-2">
                <h2 id={`${id}-title`} className="text-base font-bold">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar"
                  autoFocus
                  className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-surface-3 hover:text-text"
                >
                  <X className="size-5" />
                </button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(16px,env(safe-area-inset-bottom))]">{children}</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}
