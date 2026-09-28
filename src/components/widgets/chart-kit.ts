"use client";

import type { Chart, Plugin, TooltipOptions } from "chart.js";
import type { ValueFormat } from "@/dashboards/types";
import { alpha, type ChartTheme } from "@/lib/charts/theme";
import { formatAxis, formatValue } from "@/lib/format";

/** Tooltip consistente en todas las gráficas. */
export function tooltipOptions(theme: ChartTheme): Partial<TooltipOptions<"bar" | "line" | "doughnut">> {
  return {
    backgroundColor: theme.tooltipBg,
    titleColor: theme.tooltipText,
    bodyColor: "rgba(255,255,255,0.88)",
    footerColor: "rgba(255,255,255,0.7)",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    padding: { x: 12, y: 10 },
    cornerRadius: 12,
    boxPadding: 5,
    usePointStyle: true,
    titleFont: { weight: 700, size: 12 },
    bodyFont: { size: 12 },
    caretSize: 6,
  };
}

/** Ejes recesivos: hairline sólida, sin bordes, ticks en tinta atenuada. */
export function valueAxis(theme: ChartTheme, format: ValueFormat = "int", opts: { stacked?: boolean; title?: string } = {}) {
  return {
    beginAtZero: true,
    stacked: opts.stacked,
    grid: { color: theme.grid, drawTicks: false, lineWidth: 1 },
    border: { display: false },
    ticks: {
      color: theme.tick,
      padding: 8,
      font: { size: 11 },
      maxTicksLimit: 6,
      callback: (v: string | number) => formatAxis(Number(v), format),
    },
    title: opts.title ? { display: true, text: opts.title, color: theme.muted, font: { size: 11, weight: 600 as const } } : undefined,
  };
}

/** Parte una etiqueta larga en hasta 2 líneas (con elipsis al final). */
export function wrapLabel(label: string, width: number): string | string[] {
  if (label.length <= width) return label;
  const words = label.split(/\s+/);
  const lines: string[] = [""];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (!cur) lines[lines.length - 1] = w;
    else if (`${cur} ${w}`.length <= width) lines[lines.length - 1] = `${cur} ${w}`;
    else if (lines.length < 2) lines.push(w);
    else {
      lines[1] = `${lines[1]} ${w}`;
    }
  }
  return lines.map((l, i) => (l.length > width || (i === 1 && lines.join(" ").length < label.length) ? `${l.slice(0, width - 1)}…` : l));
}

export function categoryAxis(theme: ChartTheme, opts: { stacked?: boolean; maxChars?: number; horizontal?: boolean } = {}) {
  const max = opts.maxChars ?? 26;
  return {
    stacked: opts.stacked,
    grid: { display: false },
    border: { color: theme.axis },
    ticks: {
      color: theme.tick,
      font: { size: 11 },
      autoSkip: false,
      maxRotation: 0,
      callback(this: { getLabelForValue: (v: number) => string }, value: string | number) {
        const label = this.getLabelForValue(Number(value));
        return wrapLabel(label, max);
      },
    },
  };
}

/** Línea vertical que sigue al cursor en series de tiempo. */
export const crosshairPlugin: Plugin<"line"> = {
  id: "crosshair",
  afterDraw(chart: Chart<"line">) {
    const active = chart.tooltip?.getActiveElements?.();
    if (!active?.length) return;
    const x = active[0].element.x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = (chart.options.plugins as { crosshair?: { color?: string } } | undefined)?.crosshair?.color ?? "rgba(120,120,120,0.4)";
    ctx.stroke();
    ctx.restore();
  },
};

/** Gradiente vertical del color de la serie (área al ~10 %). */
export function areaGradient(chart: Chart, color: string, strength = 0.18) {
  const { ctx, chartArea } = chart;
  if (!chartArea) return alpha(color, 0.1);
  const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  g.addColorStop(0, alpha(color, strength));
  g.addColorStop(1, alpha(color, 0));
  return g;
}

export const fmt = (v: number | null | undefined, f: ValueFormat = "int") => formatValue(v ?? null, f);
