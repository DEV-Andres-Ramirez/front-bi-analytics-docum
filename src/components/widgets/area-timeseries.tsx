"use client";

import type { Chart as ChartJS, ChartData, ChartOptions, ScriptableContext, ScriptableLineSegmentContext, TooltipModel } from "chart.js";
import { useCallback, useMemo, useRef, useState, type MouseEvent } from "react";
import { Bar, Line } from "react-chartjs-2";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { Segmented } from "@/components/ui/primitives";
import type { TimeseriesResult } from "@/dashboards/dto";
import type { SemanticFamily, TimeseriesWidget, ValueFormat, VizOptions } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { registerCharts } from "@/lib/charts/register";
import { isNeutral, resolveStatus, sortByFamily } from "@/lib/charts/semantic";
import { alpha, categoryColors, useChartTheme } from "@/lib/charts/theme";
import { DAY_MS, formatDayShort, formatRange, isoToMs, MONTHS_ES, MONTHS_ES_LONG, msToISO, todayISO, WEEKDAYS_ES, weekStart } from "@/lib/dates";
import { describeDelta, formatAxis, formatCompact, formatInt, formatPct, formatValue } from "@/lib/format";
import { displayLabel } from "@/lib/labels";
import {
  axisQuantum,
  bandsPlugin,
  blend,
  chartToPng,
  crosshairPlugin,
  labelsPlugin,
  niceScale,
  partialBarsPlugin,
  useChartAnimation,
  useChartKeyboard,
  useChartResizeGuard,
  type BandSpec,
  type CanvasLabel,
  type PartialBar,
} from "./canvas-helpers";
import { areaGradient } from "./chart-kit";
import { useExporter, useWidgetFrame } from "./frame-context";
import { ChartLegend, type LegendItem } from "./kit/chart-legend";
import { ChartTooltip, chartJsExternal, useChartTooltip, type TooltipContent, type TooltipRow } from "./kit/chart-tooltip";
import { HeaderSlot, LegendSlot } from "./kit/legend-slot";
import type { VizProps } from "./types";

registerCharts();

/**
 * AreaTimeseries (TimeseriesChart v2) · docs/ui-design-system.md §AreaTimeseries.
 * Modos: area (1 serie) · lines (2–4 series con tokens de métrica) · stacked (partes por splitBy,
 * tonos de la familia) · columns (automático con > 60 % de días en 0, o por día cuando los fines de
 * semana son un "peine"; el periodo anterior es un marcador de 2 px y el fin de semana, una franja
 * bajo el eje).
 * Granularidad en cliente (Día/Semana/Mes, semanas ISO) independiente del ancho de la tarjeta (salvo
 * teléfono), bandas de fin de semana, tramo parcial punteado (y aparte, como punto hueco, si cubre
 * < 50 % de sus días), eje Y justo (niceScale), etiquetas directas sin colisión (L10), crosshair y
 * ChartTooltip con Δ.
 * Gramática fija en cualquier ancho: "Periodo anterior" y "Fin de semana" van en la leyenda (nunca en el
 * pie). Si la franja de 24 px no alcanza, cede primero "Fin de semana"; la clave de la serie principal
 * nunca sale. El pie pierde el Pico antes de envolver.
 */

type Gran = "day" | "week" | "month";
type Mode = "area" | "lines" | "stacked" | "columns";

const PREV_KEY = "__prev";
const WEEKEND_KEY = "__weekend";

interface Bucket {
  /** Inicio del bucket calendario (ms de pared). */
  key: number;
  /** Primer y último día dentro del rango. */
  first: number;
  last: number;
  /** Índices de los días (alineados con el periodo anterior). */
  idx: number[];
  /** Cubre el bucket calendario completo y ya terminó. */
  complete: boolean;
  /** Días del bucket calendario. */
  calDays: number;
}

interface SeriesModel {
  key: string;
  name: string;
  color: string;
  values: number[];
  total: number;
}

const monthStart = (ms: number) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};
const monthEnd = (ms: number) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
};

function buildBuckets(startMs: number, days: number, g: Gran, todayMs: number): Bucket[] {
  const out: Bucket[] = [];
  let cur: Bucket | null = null;
  for (let i = 0; i < days; i++) {
    const ms = startMs + i * DAY_MS;
    const key = g === "day" ? ms : g === "week" ? weekStart(ms) : monthStart(ms);
    if (!cur || cur.key !== key) {
      cur = { key, first: ms, last: ms, idx: [], complete: false, calDays: 1 };
      out.push(cur);
    }
    cur.last = ms;
    cur.idx.push(i);
  }
  for (const b of out) {
    const calEnd = g === "day" ? b.key : g === "week" ? b.key + 6 * DAY_MS : monthEnd(b.key);
    b.calDays = Math.round((calEnd - b.key) / DAY_MS) + 1;
    b.complete = b.first === b.key && b.last === calEnd && b.last < todayMs;
  }
  return out;
}

const sumAt = (values: number[] | undefined, idx: number[]) => idx.reduce((s, i) => s + (values?.[i] ?? 0), 0);

function tickLabel(b: Bucket, g: Gran, multiYear: boolean, i: number): string {
  const d = new Date(b.first);
  if (g === "month") {
    const m = MONTHS_ES[d.getUTCMonth()];
    return multiYear && (i === 0 || d.getUTCMonth() === 0) ? `${m} ${d.getUTCFullYear()}` : m;
  }
  return `${d.getUTCDate()} ${MONTHS_ES[d.getUTCMonth()]}`;
}

function bucketTitle(b: Bucket, g: Gran): string {
  const d = new Date(b.first);
  if (g === "day") return `${WEEKDAYS_ES[d.getUTCDay()]} ${formatDayShort(msToISO(b.first))}`;
  if (g === "week") return `Semana ${formatRange(msToISO(b.first), msToISO(b.last))}`;
  const name = `${MONTHS_ES_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return b.first === b.key && b.last === monthEnd(b.key) ? name : `${name} (${formatRange(msToISO(b.first), msToISO(b.last))})`;
}

function prevLabel(prevStartMs: number, b: Bucket, g: Gran): string {
  const from = prevStartMs + b.idx[0] * DAY_MS;
  const to = prevStartMs + b.idx[b.idx.length - 1] * DAY_MS;
  if (g === "day") return `${WEEKDAYS_ES[new Date(from).getUTCDay()]} ${formatDayShort(msToISO(from), false)}`;
  return formatRange(msToISO(from), msToISO(to));
}

const GRAN_UNIT: Record<Gran, string> = { day: "día", week: "semana", month: "mes" };
const GRAN_OPTIONS: { value: Gran; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

const capitalize = (s: string) => (s ? s.charAt(0).toLocaleUpperCase("es-CO") + s.slice(1) : s);

function seriesName(s: { id: string; label: string }, unitPlural: string, family?: SemanticFamily, overrides?: VizOptions["overrides"]): string {
  if (/^(registros|total)$/i.test(s.label.trim()) || s.id === "total") return capitalize(unitPlural);
  if (family) {
    const st = resolveStatus(s.label, family, overrides);
    if (st) return st.display;
  }
  return displayLabel(s.label).short;
}

/** Promedio corto: 1 decimal por debajo de 10, entero por encima. */
function formatAvg(n: number, format: ValueFormat): string {
  if (format !== "int" && format !== "compact") return formatValue(n, format);
  return n < 10 ? formatCompact(n) : formatInt(Math.round(n));
}

// ─── Componente ──────────────────────────────────────────────────────────────
export function AreaTimeseries({ widget, result, height, span }: VizProps<TimeseriesWidget, TimeseriesResult>) {
  const theme = useChartTheme();
  const { spec, data } = useDashboard();
  const motion = useChartAnimation();
  const { state: tip, show, hide } = useChartTooltip();
  const { ref: sizeRef, width: measured } = useElementSize<HTMLDivElement>();
  // En la franja de 24 px la leyenda va en una sola línea (lo que no cabe se recorta, nunca se superpone)
  const inStrip = Boolean(useWidgetFrame()?.legendEl);
  const width = measured || Math.max(280, span * 88);
  const format: ValueFormat = widget.valueFormat ?? "int";
  const vo = widget.vizOptions;
  const family = widget.semantic;
  const unitPlural = spec.unit?.plural ?? "registros";

  const days = result.series[0]?.values.length ?? 0;
  const startMs = isoToMs(result.start);
  const todayMs = isoToMs(data?.generatedAt ? todayISO(Date.parse(data.generatedAt)) : msToISO(startMs + days * DAY_MS));
  const prevStartMs = result.prevStart ? isoToMs(result.prevStart) : null;

  // Proporción de días en 0 (sin contar hoy ni días futuros) y "peine" semanal: los fines de semana
  // promedian ≤ 40 % de un día hábil y ≥ 75 % de ellos quedan en ≤ 50 % (p. ej. sáb 8 · dom 6 frente a
  // 40/día, o sáb 0 · dom 1 frente a 7/día), con ≥ 50 % de los días hábiles con dato. Una sola regla
  // para el mismo fenómeno en todos los tableros (antes el umbral de 15 % dejaba la mitad en área).
  const { zeroShare, weekendComb } = useMemo(() => {
    let past = 0;
    let zeros = 0;
    const weekendTotals: number[] = [];
    let weekday = 0;
    let weekdayData = 0;
    let weekdaySum = 0;
    for (let i = 0; i < days; i++) {
      const ms = startMs + i * DAY_MS;
      if (ms >= todayMs && i > 0) continue;
      past++;
      const total = result.series.reduce((acc, s) => acc + (s.values[i] ?? 0), 0);
      if (!total) zeros++;
      const dow = new Date(ms).getUTCDay();
      if (dow === 0 || dow === 6) weekendTotals.push(total);
      else {
        weekday++;
        weekdaySum += total;
        if (total) weekdayData++;
      }
    }
    const weekdayAvg = weekday ? weekdaySum / weekday : 0;
    const weekendAvg = weekendTotals.length ? weekendTotals.reduce((a, v) => a + v, 0) / weekendTotals.length : 0;
    const low = weekendTotals.filter((v) => v <= 0.5 * weekdayAvg).length;
    return {
      zeroShare: past ? zeros / past : 0,
      weekendComb:
        weekendTotals.length >= 2 && weekday > 0 && weekdayAvg > 0 && weekdayData / weekday >= 0.5 && weekendAvg <= 0.4 * weekdayAvg && low / weekendTotals.length >= 0.75,
    };
  }, [days, startMs, todayMs, result.series]);

  const declared = vo?.mode ?? "auto";
  // El peine por día se dibuja en columnas cuando hay una sola serie; con varias series (líneas o
  // apiladas) no hay columnas posibles y se agrupa por semana.
  const dayColumns = declared === "columns" || (declared === "auto" && result.series.length === 1);
  // La granularidad NO depende del ancho de la tarjeta (antes < 600 px pasaba a semanas y la misma
  // serie cambiaba de forma entre 1440, 1280 y 1024, o entre dos tarjetas hermanas de la misma fila).
  // Solo en teléfono (< 440 px, ~15 px por día) el peine diario se agrupa por semana.
  const phone = width < 440;
  const autoGran: Gran = days > 240 ? "month" : days <= 31 && zeroShare < 0.4 ? (weekendComb && (phone || !dayColumns) ? "week" : "day") : "week";
  const available = useMemo(() => {
    const count = (g: Gran) => buildBuckets(startMs, days, g, todayMs).length;
    return GRAN_OPTIONS.filter((o) => {
      const n = count(o.value);
      return n >= 2 && n <= 400;
    });
  }, [startMs, days, todayMs]);
  const [granPick, setGranPick] = useState<Gran | null>(null);
  const g: Gran = granPick && available.some((o) => o.value === granPick) ? granPick : autoGran;

  const mode: Mode = useMemo(() => {
    if (declared !== "auto") return declared;
    if (zeroShare > 0.6) return "columns";
    if (result.series.length > 1) return widget.splitBy ? "stacked" : "lines";
    // Peine por día: columnas (los fines de semana se leen como columnas bajas, no como un sismógrafo)
    if (weekendComb && g === "day") return "columns";
    return "area";
  }, [declared, zeroShare, result.series.length, widget.splitBy, weekendComb, g]);

  const buckets = useMemo(() => buildBuckets(startMs, days, g, todayMs), [startMs, days, g, todayMs]);
  const n = buckets.length;
  const last = buckets[n - 1];
  const partialIdx = last && !last.complete && (g !== "day" || last.last >= todayMs) ? n - 1 : -1;
  // Primer tramo parcial: el rango no empieza en lunes (semana) ni en el día 1 (mes)
  const partialFirst = g !== "day" && n > 1 && buckets[0].first !== buckets[0].key ? 0 : -1;
  // Tramo parcial corto (< 50 % de sus días, p. ej. solo el lunes de la semana en curso): unido a la
  // línea simularía una caída (252 → 30). Se dibuja aparte, como punto hueco con "1 de 7 días".
  const stubs = useMemo(
    () => buckets.map((b, i) => g !== "day" && buckets.length > 2 && (i === partialIdx || i === partialFirst) && b.idx.length / b.calDays < 0.5),
    [buckets, g, partialIdx, partialFirst],
  );
  const hasStub = stubs.some(Boolean);
  const multiYear = n > 0 && new Date(buckets[0].first).getUTCFullYear() !== new Date(buckets[n - 1].last).getUTCFullYear();
  const labels = useMemo(() => buckets.map((b, i) => tickLabel(b, g, multiYear, i)), [buckets, g, multiYear]);

  // Series en el orden de la leyenda (familia o neutrales al final)
  const series: SeriesModel[] = useMemo(() => {
    const src = [...result.series];
    const ordered = family ? sortByFamily(src, (s) => s.label, family, vo?.overrides) : [...src.filter((s) => !isNeutral(s.label)), ...src.filter((s) => isNeutral(s.label))];
    const slot = vo?.colorSlot ?? 1;
    const metric = slot === 2 ? [theme.series[1], theme.series[0], theme.series[2], theme.series[3]] : theme.series.slice(0, 4);
    const cat = mode === "stacked" && !family ? categoryColors(theme, ordered.map((s) => s.label)) : null;
    return ordered.map((s, i) => {
      let color = metric[i] ?? theme.other;
      if (mode === "stacked") {
        const st = family ? resolveStatus(s.label, family, vo?.overrides) : null;
        color = st ? theme.resolve(st.color) : (cat?.[i] ?? theme.other);
      }
      if (isNeutral(s.label) && mode !== "lines") color = theme.other;
      const values = buckets.map((b) => sumAt(s.values, b.idx));
      return { key: s.id, name: seriesName(s, unitPlural, family, vo?.overrides), color, values, total: values.reduce((a, v) => a + v, 0) };
    });
  }, [result.series, family, vo?.overrides, vo?.colorSlot, theme, mode, buckets, unitPlural]);

  const prev = useMemo(() => (result.previous && series.length === 1 ? buckets.map((b) => sumAt(result.previous, b.idx)) : null), [result.previous, series.length, buckets]);

  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const showWeekend = g === "day" && days <= 93 && mode !== "stacked" && !hidden.has(WEEKEND_KEY);
  const columns = mode === "columns";
  // Fin de semana. Área y líneas: banda a alto completo (contexto detrás de la curva), opaca y en
  // oscuro más tenue que --surface-3 para no igualar el tono de ninguna marca. Columnas: franja de
  // 4 px bajo el eje; una banda alta junto a las columnas se leía como una columna de valor máximo.
  const surface3 = theme.resolve("var(--surface-3)");
  const weekendColor = theme.mode === "dark" ? blend(surface3, theme.surface, 0.55) : surface3;
  const weekendStrip = blend(theme.tick, theme.surface, theme.mode === "dark" ? 0.5 : 0.4);
  // Muestra de la leyenda: en oscuro, el --surface-3 pleno (la banda tenue sería invisible como cuadro de 10 px)
  const weekendKeyColor = columns ? weekendStrip : surface3;
  const prevColor = alpha(theme.tick, 0.55);
  // Periodo anterior en columnas: marcador de 2 px (sin relleno), encima de la columna actual
  const prevMarker = blend(theme.tick, theme.surface, 0.85);

  const bands: BandSpec[] = useMemo(() => {
    if (g !== "day" || days > 93) return [];
    const out: BandSpec[] = [];
    buckets.forEach((b, i) => {
      const dow = new Date(b.first).getUTCDay();
      if (dow !== 0 && dow !== 6) return;
      const prevBand = out[out.length - 1];
      if (prevBand && prevBand.to === i - 1) prevBand.to = i;
      else out.push({ from: i, to: i, color: columns ? weekendStrip : weekendColor, strip: columns ? 4 : undefined });
    });
    return out;
  }, [g, days, buckets, columns, weekendColor, weekendStrip]);

  // ─── Resumen (pie) ───────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const primary = mode === "stacked" ? buckets.map((_b, i) => series.reduce((s, x) => s + x.values[i], 0)) : (series[0]?.values ?? []);
    const total = primary.reduce((a, v) => a + v, 0);
    const complete = primary.filter((_v, i) => buckets[i]?.complete);
    const base = complete.length ? complete : primary;
    const avg = base.length ? base.reduce((a, v) => a + v, 0) / base.length : 0;
    let peak = 0;
    primary.forEach((v, i) => {
      if (v > primary[peak]) peak = i;
    });
    return { primary, total, avg, peak, peakValue: primary[peak] ?? 0 };
  }, [mode, buckets, series]);

  const peakLabel = buckets[summary.peak] ? (g === "week" ? `sem. ${labels[summary.peak]}` : labels[summary.peak]) : "";
  const footer: { label: string; value: string }[] = [];
  if (mode === "lines") series.forEach((s) => footer.push({ label: s.name, value: formatValue(s.total, format) }));
  else footer.push({ label: "Total", value: formatValue(summary.total, format) });
  footer.push({ label: "Promedio", value: `${formatAvg(summary.avg, format)}/${GRAN_UNIT[g]}` });
  if (summary.peakValue > 0) footer.push({ label: "Pico", value: `${formatValue(summary.peakValue, format)} (${peakLabel})` });
  const footerText = footer.map((f) => `${f.label} ${f.value}`).join(" · ");
  // El pie se recorta antes que la leyenda: sin espacio para una línea, el Pico sale (va en el tooltip)
  const footerWidth = (items: { label: string; value: string }[]) => items.reduce((w, f, i) => w + (f.label.length + f.value.length + 1) * 6.3 + (i ? 12 : 0), 0);
  const footerShown = footer.length > 2 && footerWidth(footer) > width ? footer.filter((f) => f.label !== "Pico") : footer;
  // Área apilada con leyenda vecina (legendFrom): el total repite el pie de la serie principal
  const showFooter = !(mode === "stacked" && vo?.legendFrom);

  // ─── Etiquetas directas (L10) ────────────────────────────────────────────
  const directLabels: CanvasLabel[] = useMemo(() => {
    const out: CanvasLabel[] = [];
    if (!n || mode === "stacked") return out;
    const fmt = (v: number) => formatAxis(v, format);
    // Por debajo de 400 px el rótulo es solo la cifra: "parcial" queda en el tooltip (y el tramo punteado)
    const partialSub = width >= 400 ? "parcial" : undefined;
    // Tramo corto separado de la línea: dice cuántos días cubre ("1 de 7 días")
    const stubSub = (i: number) => (width >= 400 ? `${buckets[i].idx.length} de ${buckets[i].calDays} días` : "parcial");
    if (mode === "columns") {
      if (n > 12 || series.length > 1) return out;
      series[0]?.values.forEach((v, i) => {
        const partial = i === partialIdx || i === partialFirst;
        if (v > 0 || i === partialIdx) out.push({ datasetIndex: 0, index: i, text: fmt(v), sub: stubs[i] ? stubSub(i) : partial ? partialSub : undefined, priority: 1, clear: prev ? [1] : undefined });
      });
      return out;
    }
    // Con el último tramo aparte, la etiqueta final va en el último punto unido (L10) y el tramo
    // corto lleva su propia cifra (solo la serie principal, para no amontonar rótulos)
    const lastIdx = stubs[n - 1] ? n - 2 : n - 1;
    series.forEach((s, si) => {
      if (mode === "area" && si > 0) return;
      out.push({ datasetIndex: si, index: lastIdx, text: fmt(s.values[lastIdx] ?? 0), sub: lastIdx === partialIdx ? partialSub : undefined, marker: true, color: s.color, priority: 10 - si });
    });
    if (stubs[n - 1] && series[0]) {
      out.push({ datasetIndex: series.length + (prev ? 1 : 0), index: n - 1, text: fmt(series[0].values[n - 1] ?? 0), sub: stubSub(n - 1), priority: 6 });
    }
    const pk = summary.peak;
    if (mode === "area" && series[0] && pk !== lastIdx && !stubs[pk] && summary.peakValue > 0 && height >= 180) {
      out.push({ datasetIndex: 0, index: pk, text: fmt(summary.peakValue), sub: pk === partialFirst ? partialSub : undefined, marker: true, color: series[0].color, priority: 5 });
    }
    return out;
  }, [n, mode, series, partialIdx, partialFirst, stubs, buckets, format, summary.peak, summary.peakValue, height, prev, width]);

  // ─── Tooltip ─────────────────────────────────────────────────────────────
  const contentAt = useCallback(
    (i: number): TooltipContent | null => {
      const b = buckets[i];
      if (!b) return null;
      const vis = series.filter((s) => !hidden.has(s.key));
      const fmt = (v: number) => formatValue(v, format);
      let hint: string | undefined;
      if (stubs[i]) hint = `Parcial: ${b.idx.length} de ${b.calDays} días.${mode === "columns" ? "" : " Va aparte: no se compara con un tramo completo."}`;
      else if (i === partialIdx) hint = g === "day" ? "Parcial: el día está en curso." : `Parcial: ${b.idx.length} de ${b.calDays} días.`;
      else if (i === partialFirst) hint = `Parcial: ${b.idx.length} de ${b.calDays} días en el rango.`;
      else if (g !== "day" && !b.complete) hint = `Incompleto: ${b.idx.length} de ${b.calDays} días en el rango.`;
      if (mode === "stacked") {
        const total = vis.reduce((s, x) => s + x.values[i], 0);
        return {
          title: bucketTitle(b, g),
          value: fmt(total),
          valueNote: unitPlural,
          rows: vis.map((s) => ({ label: s.name, value: fmt(s.values[i]), share: total ? formatPct(s.values[i] / total) : undefined, color: s.color, shape: "square" })),
          hint,
        };
      }
      const p = vis[0];
      const rows: TooltipRow[] = vis.slice(1).map((s) => ({ label: s.name, value: fmt(s.values[i]), color: s.color, shape: mode === "columns" ? "square" : "line" }));
      const pv = prev && !hidden.has(PREV_KEY) ? prev[i] : null;
      if (pv !== null && prevStartMs !== null) rows.push({ label: `Anterior (${prevLabel(prevStartMs, b, g)})`, value: fmt(pv), color: mode === "columns" ? prevMarker : prevColor, shape: "line-prev" });
      const d = p && pv !== null && p.key === series[0]?.key ? describeDelta(p.values[i], pv, format, "neutral") : null;
      return {
        title: bucketTitle(b, g),
        value: p ? fmt(p.values[i]) : undefined,
        valueNote: p ? p.name.toLocaleLowerCase("es-CO") === unitPlural.toLocaleLowerCase("es-CO") ? unitPlural : p.name : undefined,
        rows,
        delta: d && d.reason !== "no-base" ? { text: d.text, tone: d.tone } : undefined,
        hint,
      };
    },
    [buckets, series, hidden, format, partialIdx, partialFirst, stubs, g, mode, unitPlural, prev, prevStartMs, prevColor, prevMarker],
  );

  const describe = useCallback(
    (i: number) => {
      const c = contentAt(i);
      if (!c) return "";
      const rows = (c.rows ?? []).map((r) => `${r.label} ${r.value}`).join("; ");
      return `${c.title}: ${c.value ?? ""} ${c.valueNote ?? ""}${rows ? `; ${rows}` : ""}${c.delta ? `; ${c.delta.text} frente al periodo anterior` : ""}`;
    },
    [contentAt],
  );

  const external = useMemo(
    () => chartJsExternal<"line" | "bar">(show, hide, (t: TooltipModel<"line" | "bar">) => contentAt(t.dataPoints[0]?.dataIndex ?? -1)),
    [show, hide, contentAt],
  );

  // ─── Leyenda ─────────────────────────────────────────────────────────────
  // Una sola gramática en cualquier ancho: "Periodo anterior" y "Fin de semana" siempre en la leyenda
  const narrow = width < 520;
  const hasWeekendKey = g === "day" && days <= 93 && mode !== "stacked" && !vo?.legendFrom;
  const legendItems: LegendItem[] = useMemo(() => {
    if (vo?.legendFrom) return [];
    const items: LegendItem[] = series.map((s) => ({
      key: s.key,
      label: s.name,
      color: s.color,
      shape: mode === "stacked" || mode === "columns" ? "square" : "line",
      value: mode === "stacked" && !narrow ? formatValue(s.total, format) : undefined,
      hidden: hidden.has(s.key),
    }));
    // L4: el periodo anterior es una línea (serie) o un marcador de 2 px (columnas): muestra de línea en ambos
    if (prev) items.push({ key: PREV_KEY, label: "Periodo anterior", color: mode === "columns" ? prevMarker : prevColor, shape: "line-prev", hidden: hidden.has(PREV_KEY) });
    if (hasWeekendKey) items.push({ key: WEEKEND_KEY, label: "Fin de semana", color: weekendKeyColor, shape: "band", hidden: hidden.has(WEEKEND_KEY) });
    // L3: con una sola serie y sin codificaciones adicionales, el título la nombra
    if (items.length < 2) return [];
    // La franja es de 24 px (una línea): si no cabe todo, cede primero "Fin de semana" (las bandas siguen
    // y el tooltip nombra el día). La clave de la serie principal nunca sale: es la marca protagonista.
    // Nunca se recortan etiquetas con "…".
    const est = items.reduce((w, it, i) => w + 16 + 6 + 8 + (it.label.length + (it.value?.length ?? 0)) * 6.6 + (i ? 14 : 0), 0);
    if (inStrip && est > width) {
      const withoutWeekend = items.filter((it) => it.key !== WEEKEND_KEY);
      if (withoutWeekend.length >= 2 && withoutWeekend.length < items.length) return withoutWeekend;
    }
    return items;
  }, [vo?.legendFrom, series, mode, format, hidden, prev, narrow, prevMarker, prevColor, hasWeekendKey, weekendKeyColor, inStrip, width]);

  const onLegendClick = useCallback(
    (key: string, e: MouseEvent<HTMLButtonElement>) => {
      setHidden((cur) => {
        const seriesKeys = series.map((s) => s.key);
        if (e.altKey && seriesKeys.includes(key)) {
          const others = seriesKeys.filter((k) => k !== key);
          const isolated = !cur.has(key) && others.every((k) => cur.has(k));
          const next = new Set([...cur].filter((k) => !seriesKeys.includes(k)));
          if (!isolated) others.forEach((k) => next.add(k));
          return next;
        }
        const next = new Set(cur);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [series],
  );

  // ─── Chart.js ────────────────────────────────────────────────────────────
  const lineRef = useRef<ChartJS<"line", (number | null)[], string> | null>(null);
  const barRef = useRef<ChartJS<"bar", number[], string> | null>(null);
  const guardRef = useChartResizeGuard(lineRef, barRef);
  const exporter = useCallback(() => chartToPng(lineRef.current ?? barRef.current, theme.surface), [theme.surface]);
  useExporter(exporter);
  const lineKeys = useChartKeyboard(lineRef, n, describe);
  const barKeys = useChartKeyboard(barRef, n, describe);
  const keys = columns ? barKeys : lineKeys;

  // Tramo parcial punteado en ambos extremos: el último (semana/mes/día en curso) y el primero
  // (el rango no empieza en lunes o en el día 1)
  const dashed = useCallback(
    (c: ScriptableLineSegmentContext) => ((partialIdx > 0 && c.p1DataIndex >= partialIdx) || (partialFirst === 0 && c.p0DataIndex === 0) ? [4, 4] : undefined),
    [partialIdx, partialFirst],
  );

  const lineData: ChartData<"line", (number | null)[], string> = useMemo(() => {
    const strength = theme.mode === "dark" ? 0.18 : 0.12;
    const stacked = mode === "stacked";
    // Los tramos cortos quedan fuera de la línea (null, sin spanGaps) y se dibujan como punto hueco
    const cut = (values: number[]) => (hasStub ? values.map((v, i) => (stubs[i] ? null : v)) : values);
    // Apilado: el primero de la familia queda arriba (mismo orden que la leyenda)
    const drawOrder = stacked ? [...series].reverse() : series;
    const datasets: ChartData<"line", (number | null)[], string>["datasets"] = drawOrder.map((s, i) => {
      const areaFill = !stacked && i === 0;
      return {
        label: s.name,
        data: cut(s.values),
        borderColor: s.color,
        borderWidth: stacked ? 1.5 : 2,
        backgroundColor: stacked ? alpha(s.color, theme.mode === "dark" ? 0.62 : 0.72) : areaFill ? (ctx: ScriptableContext<"line">) => areaGradient(ctx.chart, s.color, strength) : "transparent",
        fill: stacked ? (i === 0 ? "origin" : "-1") : areaFill ? "origin" : false,
        cubicInterpolationMode: "monotone",
        tension: 0.2,
        pointRadius: n === 1 ? 3 : 0,
        pointHoverRadius: 4,
        pointHitRadius: 10,
        pointBackgroundColor: s.color,
        pointBorderColor: theme.surface,
        pointBorderWidth: 2,
        pointHoverBorderWidth: 2,
        spanGaps: false,
        hidden: hidden.has(s.key),
        segment: { borderDash: dashed },
        order: i,
      };
    });
    if (prev) {
      datasets.push({
        label: "Periodo anterior",
        data: cut(prev),
        borderColor: prevColor,
        backgroundColor: "transparent",
        borderWidth: 1.5,
        fill: false,
        cubicInterpolationMode: "monotone",
        tension: 0.2,
        pointRadius: 0,
        pointHoverRadius: 3,
        pointHitRadius: 10,
        pointBackgroundColor: prevColor,
        pointBorderColor: theme.surface,
        pointBorderWidth: 1.5,
        spanGaps: false,
        hidden: hidden.has(PREV_KEY),
        order: 50,
      });
    }
    if (hasStub) {
      // Punto hueco por serie (apilado: uno solo en el total, en gris y en su propia pila)
      const marks = stacked
        ? [{ key: "__stub", color: theme.tick, values: buckets.map((_b, i) => series.reduce((a, s) => a + (hidden.has(s.key) ? 0 : s.values[i]), 0)), hide: false }]
        : series.map((s) => ({ key: s.key, color: s.color, values: s.values, hide: hidden.has(s.key) }));
      marks.forEach((m) =>
        datasets.push({
          label: "Tramo parcial",
          data: m.values.map((v, i) => (stubs[i] ? v : null)),
          showLine: false,
          fill: false,
          borderColor: m.color,
          backgroundColor: theme.surface,
          pointRadius: 4,
          pointHoverRadius: 5,
          pointHitRadius: 10,
          pointBackgroundColor: theme.surface,
          pointHoverBackgroundColor: theme.surface,
          pointBorderColor: m.color,
          pointHoverBorderColor: m.color,
          pointBorderWidth: 2,
          pointHoverBorderWidth: 2,
          stack: stacked ? "__stub" : undefined,
          hidden: m.hide,
          order: -1,
        }),
      );
    }
    return { labels, datasets };
  }, [theme, mode, series, n, hidden, dashed, prev, prevColor, labels, hasStub, stubs, buckets]);

  // Relleno del tramo parcial (en oscuro más tenue: al 0,28 el naranja se lee marrón)
  const partialFill = theme.mode === "dark" ? 0.18 : 0.28;
  const partialCols = useCallback((j: number) => j === partialIdx || j === partialFirst, [partialIdx, partialFirst]);

  const barData: ChartData<"bar", number[], string> = useMemo(() => {
    const multi = series.length > 1;
    // Pocas columnas (≤ 6 semanas o meses): barras de hasta 40 px para no dejar el lienzo vacío
    const barMax = n <= 6 ? 40 : 24;
    const datasets: ChartData<"bar", number[], string>["datasets"] = series.map((s, i) => ({
      label: s.name,
      data: s.values,
      // Parcial: relleno tenue + contorno punteado (partialBarsPlugin), igual que el tramo punteado de la línea
      backgroundColor: s.values.map((_v, j) => (partialCols(j) ? alpha(s.color, partialFill) : s.color)),
      hoverBackgroundColor: s.values.map((_v, j) => (partialCols(j) ? alpha(s.color, partialFill + 0.12) : s.color)),
      borderRadius: multi && i < series.length - 1 ? 0 : { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
      borderSkipped: "start",
      grouped: multi,
      stack: widget.splitBy ? "s" : undefined,
      maxBarThickness: barMax,
      barPercentage: multi ? 0.9 : 0.62,
      categoryPercentage: 0.8,
      hidden: hidden.has(s.key),
      order: i,
    }));
    if (prev) {
      // Periodo anterior como marcador (raya de 2 px, sin relleno) ENCIMA de la columna actual: se lee
      // como referencia y nunca como otra columna gris junto a la banda de fin de semana
      datasets.push({
        label: "Periodo anterior",
        data: prev,
        backgroundColor: "transparent",
        hoverBackgroundColor: "transparent",
        borderColor: prevMarker,
        hoverBorderColor: theme.text,
        borderWidth: { top: 2, left: 0, right: 0, bottom: 0 },
        // Chart.js acepta el objeto en hover igual que en borderWidth (sus tipos solo declaran número); sin él,
        // al pasar el mouse el marcador se volvía un rectángulo con borde en los 4 lados
        hoverBorderWidth: { top: 2, left: 0, right: 0, bottom: 0 } as unknown as number,
        borderRadius: 0,
        borderSkipped: "start",
        grouped: false,
        maxBarThickness: barMax + 8,
        barPercentage: 1,
        categoryPercentage: 0.8,
        hidden: hidden.has(PREV_KEY),
        order: -1,
      });
    }
    return { labels, datasets };
  }, [series, n, partialCols, partialFill, widget.splitBy, hidden, prev, prevMarker, theme.text, labels]);

  const partialItems: PartialBar[] = useMemo(
    () => (columns ? series.flatMap((s, si) => [partialIdx, partialFirst].filter((j) => j >= 0).map((j) => ({ datasetIndex: si, index: j, color: s.color }))) : []),
    [columns, series, partialIdx, partialFirst],
  );

  // Eje Y justo: máximo visible (+5 %) con pasos finos; sin grace ni el niceNum de Chart.js, que con
  // 4 ticks saltaba a 0–100 para un máximo de 57 y dejaba vacío el 40 % del alto
  const yStacked = mode === "stacked" || (columns && Boolean(widget.splitBy));
  const yMax = useMemo(() => {
    const vis = series.filter((s) => !hidden.has(s.key));
    let m = 0;
    if (yStacked) for (let i = 0; i < n; i++) m = Math.max(m, vis.reduce((a, s) => a + (s.values[i] ?? 0), 0));
    else for (const s of vis) for (const v of s.values) m = Math.max(m, v);
    if (prev && !hidden.has(PREV_KEY)) for (const v of prev) m = Math.max(m, v);
    return m;
  }, [series, hidden, yStacked, n, prev]);
  const yNice = niceScale(yMax, height > 0 && height < 150 ? 3 : 4, axisQuantum(format));

  const scales = useMemo(
    () => ({
      x: {
        stacked: yStacked,
        grid: { display: false },
        border: { color: theme.axis },
        // Con columnas, la franja de fin de semana ocupa 2–6 px bajo el eje: los rótulos bajan a 10 px
        ticks: { color: theme.tick, font: { size: 11 }, maxRotation: 0, minRotation: 0, autoSkip: true, autoSkipPadding: 14, maxTicksLimit: 8, padding: columns ? 10 : 6 },
      },
      y: {
        beginAtZero: true,
        min: 0,
        max: yNice.max,
        stacked: yStacked,
        grid: { color: theme.grid, drawTicks: false },
        border: { display: false },
        ticks: {
          color: theme.tick,
          font: { size: 11 },
          padding: 8,
          stepSize: yNice.stepSize,
          maxTicksLimit: 6,
          callback: (v: string | number) => formatAxis(Number(v), format),
        },
      },
    }),
    [yStacked, columns, theme, format, yNice.max, yNice.stepSize],
  );

  const pluginOpts = useMemo(
    () => ({
      legend: { display: false },
      tooltip: { enabled: false, external },
      docBands: { bands: showWeekend ? bands : [] },
      docCrosshair: { color: columns ? undefined : alpha(theme.tick, 0.45) },
      docPartial: { items: partialItems },
      docLabels: { items: directLabels, text: theme.text, muted: theme.muted, surface: theme.surface, kind: columns ? "bar" : "point", minGap: 16 },
    }),
    [external, showWeekend, bands, columns, theme, partialItems, directLabels],
  );

  const lineOptions = useMemo(
    () =>
      ({
        responsive: true,
        maintainAspectRatio: false,
        ...motion,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: 20, right: 8, left: 0, bottom: 0 } },
        scales,
        plugins: pluginOpts,
      }) as unknown as ChartOptions<"line">,
    [motion, scales, pluginOpts],
  );

  const barOptions = useMemo(
    () =>
      ({
        responsive: true,
        maintainAspectRatio: false,
        ...motion,
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: 24, right: 4, left: 0, bottom: 0 } },
        scales,
        plugins: pluginOpts,
      }) as unknown as ChartOptions<"bar">,
    [motion, scales, pluginOpts],
  );

  const aria = `${widget.title}. ${footerText}. Use las flechas para recorrer los valores.`;

  return (
    <div ref={sizeRef} className="flex h-full min-h-0 flex-col">
      {available.length > 1 && (
        <HeaderSlot>
          <Segmented label="Granularidad" value={g} onChange={setGranPick} options={width < 360 ? available.map((o) => (o.value === "week" ? { ...o, label: "Sem." } : o)) : available} />
        </HeaderSlot>
      )}
      {legendItems.length > 0 && (
        <LegendSlot>
          <ChartLegend items={legendItems} mode="series" onItemClick={onLegendClick} label={`Series de ${widget.title}`} className={inStrip ? "flex-nowrap! [&_button]:max-w-[calc(100%+0.5rem)]" : "[&_button]:max-w-[calc(100%+0.5rem)]"} />
        </LegendSlot>
      )}
      <div
        ref={guardRef}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        tabIndex={0}
        role="group"
        aria-label={aria}
        onKeyDown={keys.onKeyDown}
        onBlur={keys.onBlur}
        onMouseLeave={hide}
      >
        {columns ? (
          <Bar ref={barRef} data={barData} options={barOptions} plugins={[bandsPlugin, partialBarsPlugin, labelsPlugin]} role="img" aria-label={`${widget.title}: ${footerText}`} />
        ) : (
          <Line ref={lineRef} data={lineData} options={lineOptions} plugins={[bandsPlugin, crosshairPlugin, labelsPlugin]} role="img" aria-label={`${widget.title}: ${footerText}`} />
        )}
      </div>
      {showFooter && (
        // Ítems con separación por espacio (sin "·"): al envolver ninguna línea empieza con un separador huérfano
        <ul role="list" aria-label="Resumen del periodo" className="tabular mt-2.5 flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 text-[11px] leading-4 text-muted">
          {footerShown.map((f) => (
            <li key={f.label} className="whitespace-nowrap">
              {f.label} <span className="font-semibold text-text-2">{f.value}</span>
            </li>
          ))}
        </ul>
      )}
      <span className="sr-only" aria-live="polite">
        {keys.announce}
      </span>
      <ChartTooltip state={tip} />
    </div>
  );
}

