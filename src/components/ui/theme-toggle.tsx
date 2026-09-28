"use client";

import { Moon, Sun, type LucideIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/cn";
import type { Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Tema claro", icon: Sun },
  { value: "dark", label: "Tema oscuro", icon: Moon },
];

/**
 * ThemeSwitch: radiogroup Sol/Luna con thumb deslizante.
 * Muestra las dos opciones (no el estado); el thumb se posiciona por CSS con la variante
 * `dark:` (data-theme en <html>), así no hay salto al hidratar. Flechas del teclado para cambiar.
 */
const SIZES = {
  sm: { btn: "size-7", shift: "dark:translate-x-7", icon: "size-3.5" },
  md: { btn: "size-8", shift: "dark:translate-x-8", icon: "size-4" },
  /** 28 px en móvil (el topbar de 390 px no da para más) y 32 px desde sm. */
  auto: { btn: "size-7 sm:size-8", shift: "dark:translate-x-7 sm:dark:translate-x-8", icon: "size-3.5 sm:size-4" },
} as const;

export function ThemeSwitch({ className, size = "md" }: { className?: string; size?: keyof typeof SIZES }) {
  const { theme, setTheme } = useTheme();
  const { btn, shift, icon } = SIZES[size];

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: Theme | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = "dark";
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = "light";
    else if (e.key === "Home") next = "light";
    else if (e.key === "End") next = "dark";
    if (!next) return;
    e.preventDefault();
    setTheme(next);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Tema de la interfaz"
      onKeyDown={onKeyDown}
      className={cn("relative inline-flex shrink-0 items-center rounded-full border border-border bg-surface-2 p-[3px]", className)}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-[3px] top-[3px] rounded-full bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.14)] ring-1 ring-border transition-transform duration-300 ease-out dark:bg-surface-3",
          btn,
          shift,
        )}
      />
      {OPTIONS.map((o) => {
        const on = theme === o.value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            title={o.label}
            data-value={o.value}
            tabIndex={on ? 0 : -1}
            onClick={() => setTheme(o.value)}
            className={cn(
              "relative z-10 grid place-items-center rounded-full transition-colors",
              btn,
              o.value === "light" ? "text-text dark:text-muted dark:hover:text-text" : "text-muted hover:text-text dark:text-text",
            )}
          >
            <Icon className={icon} strokeWidth={2.25} />
          </button>
        );
      })}
    </div>
  );
}

/** @deprecated usar ThemeSwitch (se conserva la firma para pantallas existentes, p. ej. login). */
export function ThemeToggle({ className }: { className?: string }) {
  return <ThemeSwitch className={className} />;
}
