"use client";

import { AlertTriangle } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { isNeutral } from "@/lib/charts/semantic";
import { formatInt, formatPct } from "@/lib/format";

/** Umbrales de calidad de dato (colorSystem H). */
export const QUALITY_CHIP_MIN = 0.15;
export const QUALITY_NOTICE_MIN = 0.85;

/** Suma y proporción de categorías neutrales ("No reporta", "Otros", "Sin …"). */
export function neutralShare(labels: string[], values: number[], total?: number): { neutral: number; share: number; total: number } {
  let neutral = 0;
  let sum = 0;
  labels.forEach((l, i) => {
    sum += values[i] ?? 0;
    if (isNeutral(l)) neutral += values[i] ?? 0;
  });
  const t = total ?? sum;
  return { neutral, share: t ? neutral / t : 0, total: t };
}

/**
 * Chip de calidad de dato (15–85 % neutral) para la franja de leyenda (LegendSlot side="end").
 * Con ≥ 85 % el widget se convierte en DataQualityNotice.
 */
export function QualityChip({ neutral, total, label = "sin dato", className, force }: { neutral: number; total: number; label?: string; className?: string; force?: boolean }) {
  const share = total ? neutral / total : 0;
  if (!force && (share < QUALITY_CHIP_MIN || share >= QUALITY_NOTICE_MIN)) return null;
  return (
    <Tooltip content={`${formatInt(neutral)} de ${formatInt(total)} registros sin dato reportado. Se muestran en gris, al final y fuera de escala.`} focusable>
      <span className={cn("tabular inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-ink", className)}>
        <AlertTriangle className="size-3" aria-hidden />
        {formatPct(share, 0)} {label}
      </span>
    </Tooltip>
  );
}

/** Chip neutro con un conteo ("Sin dato: 230", "No reporta 293 · 29 %"). */
export function CountChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("tabular inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-text-2", className)}>{children}</span>;
}
