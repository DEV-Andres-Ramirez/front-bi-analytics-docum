"use client";

import type { Chart as ChartJS, ChartData, ChartOptions, TooltipModel } from "chart.js";
import { useCallback, useMemo, useRef } from "react";
import { Bar } from "react-chartjs-2";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import type { CategoryResult } from "@/dashboards/dto";
import type { BarWidget, DonutWidget, StatusTone, ValueFormat } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { registerCharts } from "@/lib/charts/register";
import { isNeutral, resolveStatus } from "@/lib/charts/semantic";
import { alpha, useChartTheme } from "@/lib/charts/theme";
import { formatAxis, formatPct, formatValue } from "@/lib/format";
import { dayShort, displayLabel, stripOrdinal } from "@/lib/labels";
import { bandsPlugin, chartToPng, labelsPlugin, useChartAnimation, useChartKeyboard, useChartResizeGuard, type BandSpec, type CanvasLabel } from "./canvas-helpers";
import { useExporter } from "./frame-context";
import { ChartLegend, type LegendItem } from "./kit/chart-legend";
import { ChartTooltip, chartJsExternal, useChartTooltip, type TooltipContent } from "./kit/chart-tooltip";
import { LegendSlot } from "./kit/legend-slot";
import { neutralShare, QualityChip } from "./kit/quality";
import type { VizProps } from "./types";

registerCharts();

/**
 * ColumnBars · columnas ordinales cortas (días de la semana, N.º de copia…).
 * docs/ui-design-system.md §ColumnBars: maxBarThickness 24, radio 4 solo arriba,
 * categoryPercentage 0,72, orden natural, valor arriba con ≤ 12 columnas, eje X de 11 px
 * sin rotación (autoSkip si no cabe) y filtro cruzado con la selección resaltada.
 * Preset semana: todas las columnas en el token pleno (el atenuado a 0,45 queda reservado a
 * "filtrar es resaltar"); el máximo se marca con la cifra en 700 y el rótulo "máx" en muted.
 */

const DAY_ORDER = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

interface Column {
  /** Valor crudo (filtro); null en días rellenados sin datos. */
  raw: string | null;
  /** Etiqueta del eje. */
  tick: string;
  /** Etiqueta completa (tooltip). */
  full: string;
  value: number;
  neutral: boolean;
  /** "Otros" plegado: no filtra. */
  folded: boolean;
  tone?: StatusTone | null;
  color?: string;
}

function copyTick(raw: string): { tick: string; full: string; order: number } {
  const n = raw.trim().toUpperCase();
  if (n === "PRINCIPAL" || n === "PPAL") return { tick: "Ppal", full: "Principal", order: 0 };
  const m = n.match(/^COPIA\s*(\d+)$/);
  if (m) return { tick: m[1], full: `Copia ${m[1]}`, order: Number(m[1]) };
  const d = displayLabel(raw);
  return { tick: d.short, full: d.full, order: 900 };
}

/** Parte una etiqueta en líneas por palabras (≤ maxChars cuando es posible, máximo 2 líneas). */
function splitTick(label: string, maxChars: number): string[] {
  if (label.length <= maxChars) return [label];
  const words = label.split(/\s+/);
  const lines: string[] = [];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if (cur !== undefined && `${cur} ${w}`.length <= maxChars) lines[lines.length - 1] = `${cur} ${w}`;
    else lines.push(w);
  }
  return lines.length > 2 ? [label] : lines;
}

export function ColumnBars({ widget, result, span }: VizProps<BarWidget | DonutWidget, CategoryResult>) {
  const theme = useChartTheme();
  const { filters, toggleValue } = useDashboard();
  const motion = useChartAnimation();
  const { state: tip, show, hide } = useChartTooltip();
  const { ref: sizeRef, width: measured } = useElementSize<HTMLDivElement>();
  const width = measured || Math.max(260, span * 88);
  const chartRef = useRef<ChartJS<"bar", number[], string> | null>(null);
  const guardRef = useChartResizeGuard(chartRef);

  const dimension = widget.dimension;
  const format: ValueFormat = (widget.type === "bar" ? widget.valueFormat : undefined) ?? "int";
  const noCross = widget.type === "bar" && Boolean(widget.noCrossFilter);
  const family = widget.semantic;
  const vo = widget.vizOptions;
  const isWeek = result.labels.length > 0 && result.labels.every((l) => dayShort(l) !== null);
  const real = result.labels.filter((l) => !isNeutral(l));
  const isCopy = real.length > 1 && real.every((l) => /^(principal|ppal|copia\s*\d+)$/i.test(l.trim()));
  const preset = vo?.preset ?? (isWeek ? "semana" : isCopy ? "copia" : undefined);
  const selected = useMemo(() => filters.eq[dimension] ?? [], [filters.eq, dimension]);

  // ─── Columnas en orden natural ───────────────────────────────────────────
  const columns: Column[] = useMemo(() => {
    const base = result.labels.map((raw, i) => ({ raw, value: result.values[i] ?? 0 }));
    const folded = (raw: string) => raw === "Otros" && Boolean(result.folded);
    if (preset === "semana") {
      const byDay = new Map<string, { raw: string; value: number }>();
      base.forEach((b) => {
        const d = dayShort(b.raw);
        if (d) byDay.set(d, b);
      });
      const extra = base.filter((b) => !dayShort(b.raw));
      return [
        ...DAY_ORDER.map((d) => {
          const hit = byDay.get(d);
          return { raw: hit?.raw ?? null, tick: d, full: hit ? displayLabel(hit.raw).full : d, value: hit?.value ?? 0, neutral: false, folded: false };
        }),
        ...extra.map((b) => ({ raw: b.raw, tick: displayLabel(b.raw).short, full: displayLabel(b.raw).full, value: b.value, neutral: isNeutral(b.raw), folded: folded(b.raw) })),
      ];
    }
    if (preset === "copia") {
      return base
        .map((b) => ({ ...b, ...copyTick(b.raw), neutral: isNeutral(b.raw) }))
        .sort((a, b) => (a.neutral ? 1000 : a.order) - (b.neutral ? 1000 : b.order))
        .map((b) => ({ raw: b.raw, tick: b.tick, full: b.full, value: b.value, neutral: b.neutral, folded: folded(b.raw) }));
    }
    // Ordinales numéricas (horas, días): se rellenan los huecos con 0 para que el eje no salte (21 → 23)
    const numeric = base.filter((b) => !isNeutral(b.raw));
    if (!family && numeric.length > 1 && numeric.every((b) => /^\d{1,3}$/.test(b.raw.trim()))) {
      const values = new Map(numeric.map((b) => [Number(b.raw.trim()), b]));
      const min = Math.min(...values.keys());
      const max = Math.max(...values.keys());
      if (max - min <= 60) {
        const filled: Column[] = [];
        for (let k = min; k <= max; k++) {
          const hit = values.get(k);
          filled.push({ raw: hit?.raw ?? null, tick: String(k), full: String(k), value: hit?.value ?? 0, neutral: false, folded: false });
        }
        const rest = base.filter((b) => isNeutral(b.raw)).map((b) => ({ raw: b.raw, tick: displayLabel(b.raw).short, full: displayLabel(b.raw).full, value: b.value, neutral: true, folded: folded(b.raw) }));
        return [...filled, ...rest];
      }
    }
    const cols = base.map((b) => {
      const st = family ? resolveStatus(b.raw, family, vo?.overrides) : null;
      const d = displayLabel(stripOrdinal(b.raw));
      return {
        raw: b.raw,
        tick: st?.display ?? d.short,
        full: st?.display ?? d.full,
        value: b.value,
        neutral: st ? st.tone === "neutral" && isNeutral(b.raw) : isNeutral(b.raw),
        folded: folded(b.raw),
        tone: st?.tone,
        color: st?.color,
      };
    });
    // Neutrales al final (orden natural del resto)
    return [...cols.filter((c) => !c.neutral), ...cols.filter((c) => c.neutral)];
  }, [result.labels, result.values, result.folded, preset, family, vo?.overrides]);

  const n = columns.length;
  const total = result.total || columns.reduce((s, c) => s + c.value, 0);
  const showValues = n <= 12;
  const slot = vo?.colorSlot === 2 ? 1 : 0;
  const metric = theme.series[slot];
  const maxReal = Math.max(0, ...columns.filter((c) => !c.neutral).map((c) => c.value));
  // Semana: el máximo se marca con la cifra (700 + "máx"), nunca con el color (que es el código del filtro)
  const maxIdx = preset === "semana" && maxReal > 0 ? columns.findIndex((c) => !c.neutral && c.value === maxReal) : -1;
  const hasSel = selected.length > 0;
  const isSel = useCallback((c: Column) => c.raw !== null && selected.includes(c.raw), [selected]);

  const colors = useMemo(
    () =>
      columns.map((c) => {
        const color = c.neutral ? theme.other : c.color ? theme.resolve(c.color) : metric;
        // Filtrar es resaltar: solo con selección se atenúa el resto a 0,45
        return hasSel && !isSel(c) ? alpha(color, 0.45) : color;
      }),
    [columns, theme, metric, hasSel, isSel],
  );

  // ─── Bandas: fin de semana (preset semana) y selección ───────────────────
  const bands: BandSpec[] = useMemo(() => {
    const out: BandSpec[] = [];
    if (preset === "semana") {
      const sat = columns.findIndex((c) => c.tick === "Sáb");
      const sun = columns.findIndex((c) => c.tick === "Dom");
      if (sat >= 0 && sun >= 0) out.push({ from: sat, to: sun, color: theme.resolve("var(--surface-3)") });
    }
    if (hasSel) {
      const soft = theme.resolve("var(--primary-soft-2)");
      columns.forEach((c, i) => {
        if (isSel(c)) out.push({ from: i, to: i, color: soft });
      });
    }
    return out;
  }, [preset, columns, theme, hasSel, isSel]);

  // ─── Eje X: ¿caben las etiquetas? (≈ 6,5 px por carácter a 11 px) ────────
  const colWidth = n ? width / n : width;
  const maxChars = Math.max(2, Math.floor(colWidth / 6.5));
  const tickLines = useMemo(() => columns.map((c) => splitTick(c.tick, maxChars)), [columns, maxChars]);
  // La última columna puede desbordar hacia el margen derecho (no tiene vecina)
  const fits = tickLines.every((lines, i) => Math.max(...lines.map((l) => l.length)) <= (i === n - 1 ? maxChars * 2 : maxChars));

  const valueLabels: CanvasLabel[] = useMemo(
    () =>
      showValues
        ? columns
            .map(
              (c, i): CanvasLabel =>
                maxIdx < 0
                  ? { datasetIndex: 0, index: i, text: formatAxis(c.value, format), priority: 1 }
                  : { datasetIndex: 0, index: i, text: formatAxis(c.value, format), priority: i === maxIdx ? 2 : 1, weight: i === maxIdx ? 700 : 600, sub: i === maxIdx ? "máx" : undefined },
            )
            .filter((l) => columns[l.index].value > 0)
        : [],
    [showValues, columns, format, maxIdx],
  );

  const canFilter = useCallback((c: Column | undefined) => Boolean(c && c.raw !== null && !noCross && !c.folded && dimension), [noCross, dimension]);
  const activate = useCallback(
    (i: number) => {
      const c = columns[i];
      if (c && canFilter(c)) toggleValue(dimension, c.raw as string);
    },
    [columns, canFilter, toggleValue, dimension],
  );

  const contentAt = useCallback(
    (i: number): TooltipContent | null => {
      const c = columns[i];
      if (!c) return null;
      return {
        title: c.full,
        value: formatValue(c.value, format),
        valueNote: total && (format === "int" || format === "compact") ? `${formatPct(c.value / total)} del total` : undefined,
        hint: canFilter(c) ? (isSel(c) ? "Clic para quitar el filtro" : "Clic para filtrar") : c.folded ? `${result.folded ?? 0} categorías agrupadas` : undefined,
      };
    },
    [columns, format, total, canFilter, isSel, result.folded],
  );
  const describe = useCallback((i: number) => {
    const c = contentAt(i);
    return c ? `${columns[i]?.full}: ${c.value}${c.valueNote ? ` (${c.valueNote})` : ""}` : "";
  }, [contentAt, columns]);
  const keys = useChartKeyboard(chartRef, n, describe, noCross ? undefined : activate);
  const external = useMemo(() => chartJsExternal<"bar">(show, hide, (t: TooltipModel<"bar">) => contentAt(t.dataPoints[0]?.dataIndex ?? -1)), [show, hide, contentAt]);

  const exporter = useCallback(() => chartToPng(chartRef.current, theme.surface), [theme.surface]);
  useExporter(exporter);

  const data: ChartData<"bar", number[], string> = useMemo(
    () => ({
      labels: columns.map((c) => c.tick),
      datasets: [
        {
          label: widget.title,
          data: columns.map((c) => c.value),
          backgroundColor: colors,
          hoverBackgroundColor: columns.map((c) => (c.neutral ? theme.other : c.color ? theme.resolve(c.color) : metric)),
          borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
          borderSkipped: "start",
          maxBarThickness: 24,
          categoryPercentage: 0.72,
          barPercentage: 0.9,
        },
      ],
    }),
    [columns, widget.title, colors, theme, metric],
  );

  const options = useMemo(
    () =>
      ({
        responsive: true,
        maintainAspectRatio: false,
        ...motion,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: showValues ? (maxIdx >= 0 ? 30 : 18) : 6, right: 2, left: 0, bottom: 0 } },
        scales: {
          x: {
            grid: { display: false },
            border: { color: theme.axis },
            ticks: {
              // La categoría filtrada se resalta también en el eje (tinta y peso)
              color: (c: { index: number }) => (hasSel && columns[c.index] && isSel(columns[c.index]) ? theme.text : theme.tick),
              font: (c: { index: number }) => ({ size: 11, weight: hasSel && columns[c.index] && isSel(columns[c.index]) ? 700 : 400 }),
              maxRotation: 0,
              minRotation: 0,
              autoSkip: !fits,
              autoSkipPadding: 8,
              padding: 6,
              callback: (_v: string | number, i: number) => (fits ? tickLines[i] : columns[i]?.tick),
            },
            title: preset === "copia" ? { display: true, text: "N.º de copia", color: theme.muted, font: { size: 11, weight: 600 }, padding: { top: 4 } } : undefined,
          },
          y: {
            display: !showValues,
            beginAtZero: true,
            grace: "10%",
            grid: { color: theme.grid, drawTicks: false },
            border: { display: false },
            ticks: { color: theme.tick, font: { size: 11 }, padding: 8, maxTicksLimit: 4, precision: format === "int" ? 0 : undefined, callback: (v: string | number) => formatAxis(Number(v), format) },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false, external },
          docBands: { bands },
          docLabels: { items: valueLabels, text: theme.text, muted: theme.muted, surface: theme.surface, kind: "bar" },
        },
        onHover: (e: { native: Event | null }, els: unknown[]) => {
          const t = e.native?.target as HTMLElement | undefined;
          if (t) t.style.cursor = els.length && !noCross ? "pointer" : "default";
        },
        onClick: (_e: unknown, els: { index: number }[]) => {
          if (els.length) activate(els[0].index);
        },
      }) as unknown as ChartOptions<"bar">,
    [motion, showValues, maxIdx, theme, fits, tickLines, columns, hasSel, isSel, preset, format, external, bands, valueLabels, noCross, activate],
  );

  // ─── Franja: leyenda de estados (con ícono) y chip de calidad ───────────
  const legendItems: LegendItem[] = useMemo(
    () => (family ? columns.filter((c) => c.tone).map((c) => ({ key: c.raw ?? c.tick, label: c.full, tone: c.tone ?? undefined })) : []),
    [family, columns],
  );
  const q = neutralShare(result.labels, result.values, result.total);
  const sel = hasSel ? columns.filter(isSel).map((c) => c.full).join(", ") : "";

  return (
    <div ref={sizeRef} className="flex h-full min-h-0 flex-col">
      {legendItems.length > 1 && (
        <LegendSlot>
          <ChartLegend items={legendItems} label={`Estados de ${widget.title}`} />
        </LegendSlot>
      )}
      <LegendSlot side="end">
        <QualityChip neutral={q.neutral} total={q.total} />
      </LegendSlot>
      <div
        ref={guardRef}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        tabIndex={0}
        role="group"
        aria-label={`${widget.title}. ${noCross ? "" : "Enter para filtrar. "}Use las flechas para recorrer las columnas.${sel ? ` Filtrado por ${sel}.` : ""}`}
        onKeyDown={keys.onKeyDown}
        onBlur={keys.onBlur}
        onMouseLeave={hide}
      >
        <Bar
          ref={chartRef}
          data={data}
          options={options}
          plugins={[bandsPlugin, labelsPlugin]}
          role="img"
          aria-label={`${widget.title}: ${columns.map((c) => `${c.full} ${formatValue(c.value, format)}`).join(", ")}`}
        />
      </div>
      <span className="sr-only" aria-live="polite">
        {keys.announce}
      </span>
      <ChartTooltip state={tip} />
    </div>
  );
}
