"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Portal } from "./portal";

interface Props {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "right";
  className?: string;
  /** Envuelve en span con tabIndex para que sea enfocable con teclado. */
  focusable?: boolean;
}

/** Tooltip accesible (hover + foco) renderizado en portal para no recortarse. */
export function Tooltip({ content, children, side = "top", className, focusable }: Props) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const show = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    if (side === "right") setPos({ x: r.right + 8, y: r.top + r.height / 2 });
    else setPos({ x: r.left + r.width / 2, y: side === "top" ? r.top - 8 : r.bottom + 8 });
  }, [side]);
  const hide = useCallback(() => setPos(null), []);

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={focusable ? 0 : undefined}
        aria-describedby={pos ? id : undefined}
        className={cn("inline-flex", className)}
      >
        {children}
      </span>
      <Portal>
        <AnimatePresence>
          {pos && (
            <motion.div
              id={id}
              role="tooltip"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              style={{
                position: "fixed",
                left: pos.x,
                top: pos.y,
                transform:
                  side === "right" ? "translate(0, -50%)" : side === "top" ? "translate(-50%, -100%)" : "translate(-50%, 0)",
              }}
              className="pointer-events-none z-[90] max-w-xs rounded-xl bg-[#14171c] px-3 py-2 text-xs leading-relaxed text-white shadow-pop dark:bg-[#2a303b]"
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
