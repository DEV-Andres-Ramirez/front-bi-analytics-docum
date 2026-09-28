"use client";

import { Info, NotebookText } from "lucide-react";
import { useRef, useState } from "react";
import { Popover } from "@/components/ui/popover";
import { cn } from "@/lib/cn";

/**
 * DataNotesPopover: reemplaza el banner azul de notas. Un badge "N notas de datos"
 * que abre un popover con spec.notes (hallazgos documentados de las vistas de origen).
 */
export function DataNotesPopover({ notes, className }: { notes: string[] | undefined; className?: string }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  if (!notes || notes.length === 0) return null;
  const label = `${notes.length} ${notes.length === 1 ? "nota de datos" : "notas de datos"}`;
  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-info-soft px-2.5 text-xs font-semibold text-info-ink transition hover:brightness-[0.97] dark:hover:brightness-110",
          className,
        )}
      >
        <Info className="size-3.5" aria-hidden />
        {label}
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align="end" width={380} label="Notas de datos">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <NotebookText className="size-4 text-info-ink" aria-hidden />
          <p className="text-sm font-bold">Notas de datos</p>
        </div>
        <ul className="max-h-80 space-y-3 overflow-y-auto px-4 py-3">
          {notes.map((n) => (
            <li key={n} className="flex gap-2.5 text-[13px] leading-relaxed text-text-2">
              <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-info" />
              <span>{n}</span>
            </li>
          ))}
        </ul>
        <p className="border-t border-border bg-surface-2 px-4 py-2.5 text-xs text-muted">
          Hallazgos documentados de las vistas de origen (SGDEA).
        </p>
      </Popover>
    </>
  );
}
