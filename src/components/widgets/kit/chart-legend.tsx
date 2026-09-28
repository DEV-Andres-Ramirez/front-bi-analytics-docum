"use client";

import { Check } from "lucide-react";
import type { MouseEvent } from "react";
import type { StatusTone } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { TONE_VARS } from "@/lib/charts/semantic";
import { StatusIcon } from "./status-icon";

/**
 * Familia única de leyendas (legendSystem L1–L12):
 * - ChartLegend: series y categorías (franja bajo el título, alineada a la izquierda).
 * - ScaleLegend: magnitud (clases con rangos reales o escala continua).
 * - SectionLegend: codificación compartida por varias tarjetas (en el header de sección).
 * Texto siempre en tinta; la muestra repite la forma de la marca.
 */

export type SwatchShape = "square" | "line" | "line-prev" | "dashed" | "dot" | "band";

export function Swatch({ shape = "square", color, className }: { shape?: SwatchShape; color: string; className?: string }) {
  switch (shape) {
    case "line":
      return <span aria-hidden className={cn("inline-block h-[2px] w-4 shrink-0 rounded-full", className)} style={{ background: color }} />;
    case "line-prev":
      return <span aria-hidden className={cn("inline-block h-[1.5px] w-4 shrink-0 rounded-full opacity-60", className)} style={{ background: color }} />;
    case "dashed":
      return <span aria-hidden className={cn("inline-block h-0 w-4 shrink-0 border-t-2 border-dashed", className)} style={{ borderColor: color }} />;
    case "dot":
      return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color }} />;
    case "band":
      return <span aria-hidden className={cn("inline-block h-2.5 w-4 shrink-0 rounded-[2px]", className)} style={{ background: color }} />;
    default:
      return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-[2px]", className)} style={{ background: color }} />;
  }
}

export interface LegendItem {
  key: string;
  label: string;
  /** Color de la marca (CSS). Si hay tone y no color, se usa el sólido del tono. */
  color?: string;
  /** Estado: ícono en -ink + punto. */
  tone?: StatusTone;
  shape?: SwatchShape;
  /** Valor (12/600, en tinta). */
  value?: string;
  /** % (muted). */
  share?: string;
  hidden?: boolean;
  selected?: boolean;
}

interface ChartLegendProps {
  items: LegendItem[];
  /**
   * static: solo lectura · series: clic oculta (Alt+clic aísla) · filter: clic filtra (toggleValue)
   */
  mode?: "static" | "series" | "filter";
  onItemClick?: (key: string, e: MouseEvent<HTMLButtonElement>) => void;
  layout?: "inline" | "list" | "grid";
  className?: string;
  label?: string;
}

export function ChartLegend({ items, mode = "static", onItemClick, layout = "inline", className, label = "Leyenda" }: ChartLegendProps) {
  const interactive = mode !== "static" && Boolean(onItemClick);
  return (
    <ul
      role="list"
      aria-label={label}
      className={cn(
        layout === "inline" && "flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1",
        layout === "list" && "flex flex-col gap-1.5",
        layout === "grid" && "grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-4 gap-y-1.5",
        className,
      )}
    >
      {items.map((it) => {
        const color = it.color ?? (it.tone ? TONE_VARS[it.tone].solid : "var(--chart-1)");
        const body = (
          <>
            {it.tone ? (
              <span className="inline-flex items-center gap-1">
                <StatusIcon tone={it.tone} />
              </span>
            ) : (
              <Swatch shape={it.shape} color={color} />
            )}
            <span className={cn("truncate text-xs text-text-2", it.hidden && "line-through")}>{it.label}</span>
            {it.value && <span className="tabular text-xs font-semibold text-text">{it.value}</span>}
            {it.share && <span className="tabular text-xs text-muted">{it.share}</span>}
            {it.selected && <Check className="size-3 text-primary-text" aria-hidden />}
          </>
        );
        return (
          <li key={it.key} className={cn("min-w-0", interactive && "-mx-1")}>
            {interactive ? (
              <button
                type="button"
                aria-pressed={mode === "series" ? !it.hidden : Boolean(it.selected)}
                title={mode === "filter" ? "Clic para filtrar" : "Clic para ocultar · Alt+clic para aislar"}
                onClick={(e) => onItemClick?.(it.key, e)}
                className={cn(
                  "inline-flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 transition hover:bg-surface-3",
                  it.hidden && "opacity-40",
                  it.selected && "bg-primary-soft",
                )}
              >
                {body}
              </button>
            ) : (
              <span className={cn("inline-flex max-w-full items-center gap-1.5", it.hidden && "opacity-40")}>{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Leyenda compartida de una sección (mismo componente en línea). */
export function SectionLegend({ items }: { items: { label: string; tone?: StatusTone; color?: string }[] }) {
  return <ChartLegend label="Convención de la sección" items={items.map((i) => ({ key: i.label, label: i.label, tone: i.tone, color: i.color }))} />;
}

type ScaleProps = {
  title?: string;
  /** Nota del método ("Clases por cuantiles", "Escala raíz"). */
  note?: string;
  /** Muestra la muestra "Sin registros". */
  noData?: boolean;
  className?: string;
} & (
  | { classes: { color: string; label: string }[]; gradient?: never }
  | { gradient: string[]; min: string; max: string; classes?: never }
);

/** Escala de magnitud: clases con rangos reales o barra continua con mínimo y máximo reales. */
export function ScaleLegend(props: ScaleProps) {
  const { title, note, noData, className } = props;
  return (
    <div className={cn("min-w-0", className)}>
      {title && <p className="mb-1.5 text-[11px] font-semibold text-text-2">{title}</p>}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        {props.classes ? (
          <ol className="flex items-end gap-0.5" aria-label={title ?? "Escala"}>
            {props.classes.map((c) => (
              <li key={c.label} className="flex min-w-[42px] flex-col gap-1">
                <span className="h-2 rounded-[2px]" style={{ background: c.color }} aria-hidden />
                <span className="tabular whitespace-nowrap text-[10.5px] text-muted">{c.label}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex w-44 flex-col gap-1">
            <span className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${props.gradient.join(", ")})` }} aria-hidden />
            <span className="tabular flex justify-between text-[10.5px] text-muted">
              <span>{props.min}</span>
              <span>{props.max}</span>
            </span>
          </div>
        )}
        {noData && (
          <span className="flex flex-col gap-1">
            <span className="h-2 w-[42px] rounded-[2px] border border-border bg-surface-3" aria-hidden />
            <span className="whitespace-nowrap text-[10.5px] text-muted">Sin registros</span>
          </span>
        )}
      </div>
      {note && <p className="mt-1 text-[10.5px] text-muted">{note}</p>}
    </div>
  );
}
