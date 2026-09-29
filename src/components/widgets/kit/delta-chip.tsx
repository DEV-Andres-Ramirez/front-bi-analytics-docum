"use client";

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { Polarity, ValueFormat } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { formatRange } from "@/lib/dates";
import { describeDelta, formatValue } from "@/lib/format";

/**
 * Variación vs. periodo anterior de igual duración.
 * % → p.p.; el resto → relativa. Tono = dirección × polaridad (describeDelta es el único cálculo).
 * Base pequeña (conteo con anterior < 20): diferencia absoluta en un chip de borde punteado y la
 * marca visible "base pequeña" (junto al chip, o dentro con `inlineNote`); la variación relativa queda en el tooltip.
 */
export function DeltaChip({
  value,
  previous,
  format,
  polarity,
  size = "sm",
  prevRange,
  showPrevious,
  inlineNote,
  className,
}: {
  value: number | null | undefined;
  previous: number | null | undefined;
  format: ValueFormat;
  polarity: Polarity;
  size?: "sm" | "md";
  prevRange?: { prevFrom: string; prevTo: string };
  /** Muestra "antes: 1.612" junto al chip. */
  showPrevious?: boolean;
  /** Con base pequeña, "base pequeña" va dentro del chip ("−1 · base pequeña") y no como texto suelto. */
  inlineNote?: boolean;
  className?: string;
}) {
  const d = describeDelta(value, previous, format, polarity);
  const Icon = d.direction === "up" ? TrendingUp : d.direction === "down" ? TrendingDown : Minus;
  const prevText = formatValue(previous ?? null, format);
  const small = d.reason === "small-base";
  const tip = (
    <span>
      {d.reason === "no-base" ? "Sin dato en el periodo anterior." : `Periodo anterior${prevRange ? ` (${formatRange(prevRange.prevFrom, prevRange.prevTo)})` : ""}: ${prevText}`}
      {small && (
        <>
          <br />
          Base pequeña (menos de 20): {d.text} casos{d.relText ? ` (${d.relText})` : ""}. La variación no se colorea.
        </>
      )}
    </span>
  );
  const noteInside = small && Boolean(inlineNote);
  const after = [showPrevious && previous !== null && previous !== undefined ? `antes: ${prevText}` : null, small && !noteInside ? "base pequeña" : null].filter(Boolean).join(" · ");
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <Tooltip content={tip} focusable>
        <span
          className={cn(
            "tabular inline-flex items-center gap-1 whitespace-nowrap rounded-full font-semibold",
            size === "md" ? "px-2 py-0.5 text-xs" : "px-1.5 py-px text-[11px]",
            d.tone === "good" && "bg-good-soft text-good-ink",
            d.tone === "bad" && "bg-critical-soft text-critical-ink",
            d.tone === "neutral" && !small && "bg-surface-3 text-text-2",
            small && "text-text-2 outline-1 -outline-offset-1 outline-border-strong outline-dashed",
          )}
        >
          {/* Con base pequeña el signo ya da la dirección: sin ícono, para que quepa "base pequeña" en celdas de 112 px */}
          {!small && <Icon className={size === "md" ? "size-3.5" : "size-3"} aria-hidden />}
          {d.text}
          {noteInside && (
            <span aria-hidden className="font-medium">
              &nbsp;· base pequeña
            </span>
          )}
          {small && <span className="sr-only"> casos, base pequeña</span>}
        </span>
      </Tooltip>
      {after && (
        <span aria-hidden={small && !showPrevious ? true : undefined} className="tabular min-w-0 truncate text-[11px] text-muted">
          {after}
        </span>
      )}
    </span>
  );
}
