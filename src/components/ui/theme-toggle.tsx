"use client";

import { Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/cn";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={dark ? "Tema claro" : "Tema oscuro"}
      className={cn(
        "relative grid size-10 place-items-center overflow-hidden rounded-full border border-border bg-surface text-text-2 transition-colors hover:border-primary/40 hover:text-primary",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ y: 14, rotate: -90, opacity: 0 }}
          animate={{ y: 0, rotate: 0, opacity: 1 }}
          exit={{ y: -14, rotate: 90, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="grid place-items-center"
        >
          {dark ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
