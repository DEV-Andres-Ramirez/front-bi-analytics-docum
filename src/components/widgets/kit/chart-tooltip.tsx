"use client";

import type { Chart, ChartType, TooltipModel } from "chart.js";
import { useCallback, useState, type ReactNode } from "react";
import { Portal } from "@/components/ui/portal";
import type { StatusTone } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { TONE_VARS } from "@/lib/charts/semantic";
import { Swatch, type SwatchShape } from "./chart-legend";

/**
 * Tooltip único (legendSystem L11): el valor primero; la clave con la forma de la marca;
 * luego %, Δ y la pista de filtro. Se dibuja en un portal (nunca innerHTML).
 * - Chart.js: plugins.tooltip = { enabled: false, external: chartJsExternal(show, hide, toContent) }
 * - HTML y mapa: <ChartTooltip state={...} /> con coordenadas de viewport.
 */

export interface TooltipRow {
  label: string;
  value: string;
  share?: string;
  color?: string;
  tone?: StatusTone;
  shape?: SwatchShape;
  /** Resalta la fila (serie bajo el cursor). */
  active?: boolean;
}

export interface TooltipContent {
  /** Encabezado pequeño (fecha, categoría). */
  title?: string;
  /** Cifra principal (14/700). */
  value?: string;
  /** Texto junto a la cifra (%, unidad). */
  valueNote?: string;
  rows?: TooltipRow[];
  /** Variación vs. periodo anterior. */
  delta?: { text: string; tone: "good" | "bad" | "neutral"; label?: string };
  /** Línea final (p. ej. "Clic para filtrar"). */
  hint?: string;
  extra?: ReactNode;
}

export interface TooltipState {
  x: number;
  y: number;
  content: TooltipContent;
}

export function useChartTooltip() {
  const [state, setState] = useState<TooltipState | null>(null);
  const show = useCallback((x: number, y: number, content: TooltipContent) => setState({ x, y, content }), []);
  const hide = useCallback(() => setState((s) => (s ? null : s)), []);
  return { state, show, hide };
}

/** Adaptador para plugins.tooltip.external de Chart.js. */
export function chartJsExternal<T extends ChartType>(
  show: (x: number, y: number, c: TooltipContent) => void,
  hide: () => void,
  toContent: (tooltip: TooltipModel<T>, chart: Chart<T>) => TooltipContent | null,
) {
  return (ctx: { chart: Chart<T>; tooltip: TooltipModel<T> }) => {
    const { chart, tooltip } = ctx;
    if (tooltip.opacity === 0 || !tooltip.dataPoints?.length) {
      hide();
      return;
    }
    const content = toContent(tooltip, chart);
    if (!content) {
      hide();
      return;
    }
    const rect = chart.canvas.getBoundingClientRect();
    show(rect.left + tooltip.caretX, rect.top + tooltip.caretY, content);
  };
}

const W = 280;

export function ChartTooltip({ state }: { state: TooltipState | null }) {
  if (!state) return null;
  const { x, y, content } = state;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
  const left = Math.min(Math.max(8, x + 14), vw - W - 8);
  const flip = x + 14 + W > vw - 8;
  const pos = flip ? { left: Math.max(8, x - W - 14), top: y } : { left, top: y };
  const toneColor = content.delta?.tone === "good" ? "#5ed48a" : content.delta?.tone === "bad" ? "#f59a9a" : "rgba(255,255,255,.7)";
  return (
    <Portal>
      <div
        role="tooltip"
        style={{ position: "fixed", left: pos.left, top: pos.top, maxWidth: W, transform: "translateY(-50%)", background: "var(--tooltip-bg)" }}
        className="pointer-events-none z-[95] rounded-xl px-3 py-2.5 text-xs text-white shadow-pop"
      >
        {content.title && <p className="mb-1 font-semibold text-white/75">{content.title}</p>}
        {content.value && (
          <p className="flex items-baseline gap-1.5">
            <span className="tabular text-[14px] font-bold">{content.value}</span>
            {content.valueNote && <span className="tabular text-white/70">{content.valueNote}</span>}
          </p>
        )}
        {content.rows && content.rows.length > 0 && (
          <ul className={cn("space-y-1", (content.value || content.title) && "mt-1.5")}>
            {content.rows.map((r) => (
              <li key={r.label} className={cn("flex items-center gap-2", r.active === false && "opacity-60")}>
                <Swatch shape={r.shape} color={r.color ?? (r.tone ? TONE_VARS[r.tone].solid : "#fff")} />
                <span className="min-w-0 flex-1 truncate text-white/85">{r.label}</span>
                <span className="tabular font-semibold">{r.value}</span>
                {r.share && <span className="tabular text-white/60">{r.share}</span>}
              </li>
            ))}
          </ul>
        )}
        {content.delta && (
          <p className="tabular mt-1.5 font-semibold" style={{ color: toneColor }}>
            {content.delta.text} <span className="font-normal text-white/60">{content.delta.label ?? "vs. periodo anterior"}</span>
          </p>
        )}
        {content.extra}
        {content.hint && <p className="mt-1.5 border-t border-white/10 pt-1.5 text-[11px] text-white/60">{content.hint}</p>}
      </div>
    </Portal>
  );
}
