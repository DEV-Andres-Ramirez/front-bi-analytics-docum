"use client";

/**
 * Piezas comunes de CompositionBar, StatusStrip, StatusBoard y PipelineSteps:
 * partes normalizadas (etiqueta visible, tono, color, orden, grupo), plegado en "Otras N",
 * selección para el filtro cruzado, barra 100 % con separación de 2 px y tooltips.
 */

import { useCallback, useState, type FocusEvent, type MouseEvent } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import type { BarTableWidget, BarWidget, DonutWidget, SemanticFamily, StatusTone, ValueFormat, VizOptions, WidgetDef } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { isNeutral, normalizeLabel, resolveStatus, statusDisplay, TONE_ORDER, TONE_VARS } from "@/lib/charts/semantic";
import { inkOn, type ChartTheme } from "@/lib/charts/theme";
import { displayLabel, type LabelKind } from "@/lib/labels";
import { formatPct, formatValue } from "@/lib/format";
import type { TooltipContent } from "./kit/chart-tooltip";
import { TONE_LABEL } from "./kit/status-icon";

// ─── Partes ──────────────────────────────────────────────────────────────────

export interface PartMember {
  label: string;
  display: string;
  value: number;
}

export interface Part {
  /** Clave única (la etiqueta cruda o "__fold" / "__neutral"). */
  key: string;
  /** Valores de filtro que representa (vacío si no filtra). */
  labels: string[];
  display: string;
  /** Código de proceso (RADIAN "030") mostrado en mono antes de la etiqueta. */
  code?: string;
  value: number;
  /** Proporción sobre el total de la visualización (0..1). */
  share: number;
  tone: StatusTone | null;
  /** Color propio de la familia cuando no es un estado (canal-envio, binario). */
  familyColor?: string;
  /** Variable CSS del color sólido (sin mezcla). */
  solid: string;
  /** Mezcla con la superficie (1 · 0,72 · 0,48) para tonos repetidos. */
  mix: number;
  /** Color final (CSS). */
  color: string;
  neutral: boolean;
  /** Orden de familia (proceso o severidad). */
  order: number;
  group?: string;
  /** Miembros agrupados ("Otras N", neutrales fusionados). */
  members?: PartMember[];
  /** Categorías plegadas en el servidor (sin detalle en el cliente). */
  hiddenCount?: number;
  filterable: boolean;
}

/** "Otros" / "Otras N": cubeta de plegado (no es un valor filtrable). */
export function isFoldBucket(label: string): boolean {
  const n = normalizeLabel(label);
  return n === "otros" || n === "otras" || /^otr[oa]s \d+/.test(n);
}

const MIX_STEPS = [1, 0.72, 0.48];

function colorFor(solid: string, mix: number): string {
  return mix >= 1 ? solid : `color-mix(in srgb, ${solid} ${Math.round(mix * 100)}%, var(--surface))`;
}

/** Etiqueta visible de un estado, separando el código de proceso de 3 dígitos ("030. Acuse de recibo"). */
function statusText(label: string, familyDisplay: string | undefined): { display: string; code?: string } {
  const m = label.trim().match(/^(\d{3})\.\s*(.+)$/);
  if (m) return { display: familyDisplay && !/^\d{3}\./.test(familyDisplay) ? familyDisplay : statusDisplay(m[2]), code: m[1] };
  return { display: familyDisplay ?? statusDisplay(label) };
}

export interface BuildOptions {
  family?: SemanticFamily;
  overrides?: VizOptions["overrides"];
  /** Orden fijo de categorías (spec.order). */
  order?: string[];
  labelKind?: LabelKind;
  /** Categorías que el servidor plegó en "Otros". */
  folded?: number;
  /** Resto fuera del topN (sin "Otros"): se añade como cubeta. */
  rest?: { count: number; value: number };
  /** Conserva categorías en 0 (etapas declaradas del pipeline). */
  keepZero?: boolean;
}

const norm = (s: string) => normalizeLabel(s);

/** Familias categóricas (no son estados): sin íconos de estado; "No" / "Sin canal" en gris. */
const CATEGORICAL_FAMILIES = new Set<SemanticFamily>(["binario", "canal-envio"]);

/**
 * Normaliza un resultado de categoría a partes ordenadas:
 * orden del spec → orden de la familia → valor descendente; neutrales siempre al final.
 */
export function buildParts(labels: string[], values: number[], opts: BuildOptions): Part[] {
  const { family, overrides, order, labelKind, folded = 0, rest, keepZero } = opts;
  const orderIdx = new Map((order ?? []).map((l, i) => [norm(l), i] as const));
  const raw = labels.map((label, i) => ({ label, value: values[i] ?? 0, i })).filter((e) => keepZero || e.value > 0);
  // Alias declarado en el spec (vizOptions.overrides[label].label): aplica con o sin familia semántica y
  // sin distinguir mayúsculas ni tildes ("GERENCIA DE INDEMNIZACIONES, GERENCIA MÉDICA" → "Ambas gerencias").
  const aliases = new Map(Object.entries(overrides ?? {}).flatMap(([k, v]) => (v?.label ? [[norm(k), v.label] as const] : [])));
  const aliasOf = (label: string) => overrides?.[label]?.label ?? aliases.get(norm(label));

  const parts: Part[] = raw.map(({ label, value }) => {
    const status = family ? resolveStatus(label, family, overrides) : null;
    // Reglas categóricas (canal-envio, binario "Sí"): su color no es el del tono. resolveStatus
    // devuelve tone "neutral" en ese caso (rule.tone null ?? "neutral"), así que se detecta por color.
    const categorical = Boolean(status && (CATEGORICAL_FAMILIES.has(family!) || !status.tone || status.color !== TONE_VARS[status.tone].solid));
    const fold = isFoldBucket(label) && (folded > 0 || !family);
    const neutral = isNeutral(label) || fold;
    const alias = aliasOf(label);
    const text = status ? statusText(label, alias ?? status.display) : { display: alias ?? displayLabel(label, labelKind ?? "generic").full };
    return {
      key: label,
      labels: fold ? [] : [label],
      display: fold && folded > 0 ? `Otras ${folded} categorías` : text.display,
      code: text.code,
      value,
      share: 0,
      tone: status ? (categorical ? null : status.tone) : neutral ? "neutral" : null,
      familyColor: status && categorical ? status.color : undefined,
      solid: "",
      mix: 1,
      color: "",
      neutral,
      order: status?.order ?? (neutral ? 99 : 50),
      group: status?.group,
      hiddenCount: fold && folded > 0 ? folded : undefined,
      filterable: !fold,
    };
  });

  if (rest && rest.value > 0) {
    parts.push({
      key: "__rest",
      labels: [],
      display: `Otras ${rest.count} categorías`,
      value: rest.value,
      share: 0,
      tone: "neutral",
      solid: "var(--neutral-mark)",
      mix: 1,
      color: "",
      neutral: true,
      order: 98,
      hiddenCount: rest.count,
      filterable: false,
    });
  }

  const byValue = (a: Part, b: Part) => b.value - a.value;
  const real = parts.filter((p) => !p.neutral);
  const neutrals = parts.filter((p) => p.neutral).sort((a, b) => Number(b.labels.length === 0) - Number(a.labels.length === 0) || byValue(a, b));
  if (order?.length) {
    real.sort((a, b) => (orderIdx.get(norm(a.key)) ?? 1e3) - (orderIdx.get(norm(b.key)) ?? 1e3) || byValue(a, b));
  } else if (family) {
    real.sort((a, b) => a.order - b.order || byValue(a, b));
  } else {
    real.sort(byValue);
  }
  const sorted = [...real, ...neutrals];
  const sum = sorted.reduce((s, p) => s + p.value, 0);
  sorted.forEach((p) => (p.share = sum ? p.value / sum : 0));
  return paint(sorted);
}

/** Colores: tono de la familia (con mezcla escalonada si se repite), color de la familia o slots 1–5. */
export function paint(parts: Part[]): Part[] {
  const toneCount = new Map<string, number>();
  // Los slots que ya usa la familia (Digital = chart-1) no se repiten en las demás categorías.
  const taken = new Set(parts.map((p) => p.familyColor).filter(Boolean));
  let slot = 0;
  const nextSlot = () => {
    while (slot < 5 && taken.has(`var(--chart-${slot + 1})`)) slot++;
    const c = slot < 5 ? `var(--chart-${slot + 1})` : "var(--chart-other)";
    slot++;
    return c;
  };
  return parts.map((p) => {
    let solid: string;
    let mix = 1;
    if (p.tone) {
      solid = TONE_VARS[p.tone].solid;
      const k = toneCount.get(p.tone) ?? 0;
      toneCount.set(p.tone, k + 1);
      mix = p.neutral ? 1 : MIX_STEPS[k % MIX_STEPS.length];
    } else if (p.familyColor) {
      solid = p.familyColor;
    } else if (p.neutral) {
      solid = "var(--neutral-mark)";
    } else {
      solid = nextSlot();
    }
    return { ...p, solid, mix, color: colorFor(solid, mix) };
  });
}

/**
 * Pliega las partes reales que exceden maxReal en una cubeta "Otras N" (neutral, con
 * miembros para el tooltip). Nunca pliega una sola categoría: con maxReal + 1 deja maxReal − 1.
 */
export function foldParts(parts: Part[], maxReal: number): Part[] {
  const real = parts.filter((p) => !p.neutral);
  if (real.length <= maxReal) return parts;
  const keepN = real.length === maxReal + 1 ? Math.max(1, maxReal - 1) : maxReal;
  const keep = new Set(
    [...real]
      .sort((a, b) => b.value - a.value)
      .slice(0, keepN)
      .map((p) => p.key),
  );
  const kept = real.filter((p) => keep.has(p.key));
  const out = real.filter((p) => !keep.has(p.key));
  const neutrals = parts.filter((p) => p.neutral);
  const server = neutrals.find((p) => p.key !== "__rest" && p.labels.length === 0);
  const restBucket = neutrals.find((p) => p.key === "__rest");
  const hidden = (server?.hiddenCount ?? 0) + (restBucket?.hiddenCount ?? 0);
  const count = out.length + hidden;
  const bucket: Part = {
    key: "__fold",
    labels: [],
    display: `Otras ${count} categorías`,
    value: out.reduce((s, p) => s + p.value, 0) + (server?.value ?? 0) + (restBucket?.value ?? 0),
    share: 0,
    tone: null,
    solid: "var(--neutral-mark)",
    mix: 1,
    color: "var(--neutral-mark)",
    neutral: true,
    order: 97,
    members: out.map((p) => ({ label: p.key, display: p.display, value: p.value })),
    hiddenCount: hidden || undefined,
    filterable: false,
  };
  const others = neutrals.filter((p) => p !== server && p !== restBucket);
  const total = parts.reduce((s, p) => s + p.value, 0);
  // Los slots categóricos se reasignan tras plegar; los tonos y colores de familia se conservan.
  return paint([...kept, bucket, ...others].map((p) => ({ ...p, share: total ? p.value / total : 0 })));
}

/** Fusiona los neutrales en una sola parte ("Sin clasificar") con el desglose como miembros. */
export function mergeNeutrals(parts: Part[], fallback = "Sin clasificar"): Part[] {
  const neutrals = parts.filter((p) => p.neutral);
  if (neutrals.length <= 1) return parts;
  const merged: Part = {
    key: "__neutral",
    labels: neutrals.flatMap((p) => p.labels),
    display: fallback,
    value: neutrals.reduce((s, p) => s + p.value, 0),
    share: neutrals.reduce((s, p) => s + p.share, 0),
    tone: "neutral",
    solid: "var(--neutral-mark)",
    mix: 1,
    color: "var(--neutral-mark)",
    neutral: true,
    order: 99,
    group: neutrals[0].group,
    members: neutrals.map((p) => ({ label: p.key, display: p.display, value: p.value })),
    hiddenCount: neutrals.reduce((s, p) => s + (p.hiddenCount ?? 0), 0) || undefined,
    filterable: neutrals.some((p) => p.filterable),
  };
  return [...parts.filter((p) => !p.neutral), merged];
}

/** Proporción neutral real (sin contar "Otros", que no es falta de dato). */
export function missingShare(parts: Part[]): { neutral: number; total: number } {
  let neutral = 0;
  let total = 0;
  for (const p of parts) {
    total += p.value;
    if (p.key === "__neutral") neutral += (p.members ?? []).filter((m) => !isFoldBucket(m.label)).reduce((s, m) => s + m.value, 0);
    else if (p.neutral && p.filterable) neutral += p.value;
  }
  return { neutral, total };
}

// ─── Grupos (Abiertos | Cerrados, Finalizado | En curso | Devuelto | Anulado) ─

const GROUP_ORDER = ["Abiertos", "Cerrados", "Finalizado", "En curso", "Devuelto", "Anulado", "Favorable", "Desfavorable"];

export interface PartGroup {
  key: string;
  label: string;
  tone: StatusTone;
  parts: Part[];
  value: number;
  share: number;
  neutral: boolean;
}

/** Agrupa por vizOptions.groups (orden de declaración) o por el grupo de la familia. */
export function groupParts(parts: Part[], groups?: Record<string, string[]>): PartGroup[] {
  const declared = groups ? Object.entries(groups) : [];
  const lookup = new Map<string, string>();
  declared.forEach(([g, members]) => members.forEach((m) => lookup.set(norm(m), g)));
  const map = new Map<string, Part[]>();
  for (const p of parts) {
    const g = p.neutral ? "__neutral" : (lookup.get(norm(p.key)) ?? p.group ?? "__none");
    map.set(g, [...(map.get(g) ?? []), p]);
  }
  const rank = (k: string) => {
    if (k === "__neutral") return 1e4;
    if (k === "__none") return 9e3;
    const d = declared.findIndex(([g]) => g === k);
    if (d >= 0) return d;
    const c = GROUP_ORDER.indexOf(k);
    return c >= 0 ? 100 + c : 500 + Math.min(...(map.get(k) ?? []).map((p) => p.order));
  };
  const total = parts.reduce((s, p) => s + p.value, 0);
  return [...map.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([key, ps]) => {
      const value = ps.reduce((s, p) => s + p.value, 0);
      return {
        key,
        label: key === "__neutral" ? "Sin clasificar" : key === "__none" ? "Otros estados" : key,
        tone: groupTone(ps),
        parts: ps,
        value,
        share: total ? value / total : 0,
        neutral: key === "__neutral",
      };
    });
}

function groupTone(ps: Part[]): StatusTone {
  const counts = new Map<StatusTone, number>();
  for (const p of ps) if (p.tone) counts.set(p.tone, (counts.get(p.tone) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || TONE_ORDER[a[0]] - TONE_ORDER[b[0]])[0];
  return best?.[0] ?? "neutral";
}

// ─── Widget helpers ─────────────────────────────────────────────────────────

export function dimensionOf(w: WidgetDef): string | undefined {
  if (w.type === "bar") return w.noCrossFilter ? undefined : w.dimension;
  if (w.type === "donut") return w.dimension;
  if (w.type === "bartable") return w.columns[0]?.field;
  return undefined;
}

export function formatOf(w: BarWidget | DonutWidget | BarTableWidget): ValueFormat {
  return (w.type === "bar" || w.type === "bartable" ? w.valueFormat : undefined) ?? "int";
}

/** La unidad del tablero solo nombra conteos (no sumas en COP ni promedios). */
export function isCountMeasure(w: BarWidget | DonutWidget | BarTableWidget): boolean {
  return !w.measure || w.measure.kind === "count";
}

export function orderOf(w: WidgetDef): string[] | undefined {
  return w.type === "bar" || w.type === "donut" ? w.order : undefined;
}

// ─── Selección (filtro cruzado) ─────────────────────────────────────────────

const EMPTY: string[] = [];

export function useSelection(field: string | undefined) {
  const { filters, toggleValue, setValues } = useDashboard();
  const selected = (field && filters.eq[field]) || EMPTY;
  const isOn = useCallback((p: Part) => p.labels.length > 0 && p.labels.every((l) => selected.includes(l)), [selected]);
  const toggle = useCallback(
    (p: Part) => {
      if (!field || !p.filterable || !p.labels.length) return;
      if (p.labels.length === 1) {
        toggleValue(field, p.labels[0]);
        return;
      }
      const all = p.labels.every((l) => selected.includes(l));
      setValues(field, all ? selected.filter((l) => !p.labels.includes(l)) : [...new Set([...selected, ...p.labels])]);
    },
    [field, selected, setValues, toggleValue],
  );
  const toggleMany = useCallback(
    (labels: string[]) => {
      if (!field || !labels.length) return;
      const all = labels.every((l) => selected.includes(l));
      setValues(field, all ? selected.filter((l) => !labels.includes(l)) : [...new Set([...selected, ...labels])]);
    },
    [field, selected, setValues],
  );
  return { field, selected, any: selected.length > 0, isOn, toggle, toggleMany, canFilter: Boolean(field) };
}

/** Clases de énfasis: hover resalta (resto a 0,4) y la selección atenúa lo no elegido a 0,45. */
export function emphasis(key: string, hovered: string | null, on: boolean, anySelected: boolean): string {
  if (hovered) return hovered === key ? "" : "opacity-40";
  if (anySelected && !on) return "opacity-45";
  return "";
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

/** Tono como texto en el tooltip solo cuando alerta (advertencia, grave, crítico). */
export function toneNote(tone: StatusTone | null | undefined): string | undefined {
  return tone === "warning" || tone === "serious" || tone === "critical" ? TONE_LABEL[tone] : undefined;
}

export function partTooltip(p: Part, fmt: ValueFormat, opts: { on?: boolean; canFilter?: boolean; extra?: string } = {}): TooltipContent {
  const members = p.members ?? [];
  const shown = members.slice(0, 8);
  const rest = members.length - shown.length + (p.hiddenCount ?? 0);
  const total = p.share ? p.value / p.share : 0;
  return {
    title: p.code ? `${p.code} · ${p.display}` : p.display,
    value: formatValue(p.value, fmt),
    valueNote: `${formatPct(p.share)}${opts.extra ? ` · ${opts.extra}` : ""}`,
    rows: shown.length
      ? [
          ...shown.map((m) => ({ label: m.display, value: formatValue(m.value, fmt), share: total ? formatPct(m.value / total) : undefined, color: "var(--neutral-mark)" })),
          ...(rest > 0 ? [{ label: `${rest} ${rest === 1 ? "categoría más" : "categorías más"}`, value: "", color: "transparent" }] : []),
        ]
      : undefined,
    hint:
      p.filterable && opts.canFilter && p.labels.length
        ? opts.on
          ? "Clic para quitar el filtro"
          : "Clic para filtrar"
        : p.hiddenCount || (p.members && !p.filterable)
          ? "Detalle completo en Ver datos"
          : undefined,
  };
}

/** Estado de hover + tooltip compartido por segmentos, filas y tiles. */
export function useHover(show: (x: number, y: number, c: TooltipContent) => void, hide: () => void) {
  const [hovered, setHovered] = useState<string | null>(null);
  const enter = useCallback(
    (key: string, content: TooltipContent) => (e: MouseEvent<HTMLElement>) => {
      setHovered(key);
      show(e.clientX, e.clientY, content);
    },
    [show],
  );
  const focus = useCallback(
    (key: string, content: TooltipContent) => (e: FocusEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setHovered(key);
      show(r.left + r.width / 2, r.top + r.height / 2, content);
    },
    [show],
  );
  const leave = useCallback(() => {
    setHovered(null);
    hide();
  }, [hide]);
  /** Envuelve un clic: tras filtrar oculta el tooltip (el siguiente movimiento muestra la pista actualizada). */
  const tap = useCallback(
    (fn: () => unknown) => () => {
      fn();
      hide();
    },
    [hide],
  );
  return { hovered, enter, focus, leave, tap };
}

// ─── Medición del cuerpo ─────────────────────────────────────────────────────

/**
 * ¿El alto del cuerpo lo fija el tier de la fila? Sí en filas S/M/L/XL con el contenedor "page" ≥ 600 px
 * y en el diálogo "Ampliar" (sin fila). No en móvil (< 600 px) ni en filas "auto" o de KPIs, donde el
 * cuerpo mide por contenido: medir ahí el alto y plegar según él entraría en bucle.
 */
function heightIsFixed(el: HTMLElement): boolean {
  // El diálogo "Ampliar" se dibuja dentro de la tarjeta (sin portal) pero tiene alto propio
  if (el.closest('[role="dialog"]')) return true;
  const row = el.closest<HTMLElement>(".dash-row");
  if (!row) return true;
  if (row.dataset.tier === "auto" || row.dataset.tier === "kpi") return false;
  const page = el.closest<HTMLElement>(".dash-page");
  if (!page) return true;
  const cs = getComputedStyle(page);
  return page.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) >= 600;
}

/**
 * Mide un elemento (ResizeObserver, compatible con el React Compiler) y dice si su alto es fijo.
 * `fixed` = true antes de medir (escritorio): el presupuesto de diseño manda hasta la primera medición.
 */
export function useBox<T extends HTMLElement = HTMLDivElement>() {
  const [box, setBox] = useState<{ width: number; height: number; fixed: boolean } | null>(null);
  const ref = useCallback((el: T | null) => {
    if (!el) return;
    const update = () => {
      const next = { width: el.clientWidth, height: el.clientHeight, fixed: heightIsFixed(el) };
      setBox((s) => (s && Math.abs(s.width - next.width) < 1 && Math.abs(s.height - next.height) < 1 && s.fixed === next.fixed ? s : next));
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const page = el.closest(".dash-page");
    if (page) ro.observe(page);
    return () => ro.disconnect();
  }, []);
  return { ref, width: box?.width ?? 0, height: box?.height ?? 0, measured: box !== null, fixed: box?.fixed ?? true };
}

/**
 * Red de seguridad de listas con scroll interno: `fade` es true mientras quede contenido por debajo
 * (el contenedor muestra un desvanecido al pie). Observa el contenedor y su primer hijo.
 */
export function useScrollFade<T extends HTMLElement = HTMLDivElement>() {
  const [fade, setFade] = useState(false);
  const ref = useCallback((el: T | null) => {
    if (!el) return;
    const update = () => setFade(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, []);
  return { ref, fade };
}

/** Máscara de desvanecido al pie (solo cuando hay más contenido abajo). */
export const FADE_MASK = "[mask-image:linear-gradient(to_bottom,black_calc(100%_-_28px),transparent)]";

// ─── Colores resueltos (texto sobre segmentos) ──────────────────────────────

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.replace("#", ""), 16);
  const pb = parseInt(b.replace("#", ""), 16);
  if (Number.isNaN(pa) || Number.isNaN(pb)) return a;
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * t + ((pb >> sh) & 255) * (1 - t));
  return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, "0")).join("")}`;
}

/** Tinta legible sobre el color final de la parte (blanco o tinta oscura). */
export function inkForPart(p: Part, theme: ChartTheme): string {
  const solid = theme.resolve(p.solid);
  if (!solid.startsWith("#")) return "var(--text)";
  return inkOn(p.mix >= 1 ? solid : mixHex(solid, theme.surface, p.mix));
}

// ─── Barra 100 % ─────────────────────────────────────────────────────────────

interface BarProps {
  parts: Part[];
  /** Grosor en px (14 composición · 12 estados · 8 split). */
  thickness: number;
  hovered: string | null;
  isOn: (p: Part) => boolean;
  anySelected: boolean;
  onEnter: (p: Part) => (e: MouseEvent<HTMLElement>) => void;
  onLeave: () => void;
  onClick: (p: Part) => void;
  /** Ancho medido de la barra: % dentro del segmento si mide ≥ 56 px. */
  width?: number;
  theme?: ChartTheme;
  className?: string;
}

export function ProportionBar({ parts, thickness, hovered, isOn, anySelected, onEnter, onLeave, onClick, width = 0, theme, className }: BarProps) {
  const visible = parts.filter((p) => p.value > 0);
  const usable = Math.max(0, width - 2 * (visible.length - 1));
  return (
    <div aria-hidden className={cn("flex w-full shrink-0 gap-[2px] overflow-hidden", className)} style={{ height: thickness, borderRadius: thickness / 2 }}>
      {visible.map((p) => {
        const px = usable * p.share;
        const label = theme && thickness >= 14 && px >= 56;
        return (
          <div
            key={p.key}
            onMouseMove={onEnter(p)}
            onMouseLeave={onLeave}
            onClick={() => onClick(p)}
            className={cn(
              "grid min-w-[3px] place-items-center transition-[flex-grow,opacity] duration-300",
              p.filterable && p.labels.length ? "cursor-pointer" : "cursor-default",
              emphasis(p.key, hovered, isOn(p), anySelected),
            )}
            style={{ flexGrow: p.value, flexBasis: 0, background: p.color }}
          >
            {label && (
              <span className="tabular text-[10.5px] font-semibold leading-none" style={{ color: inkForPart(p, theme) }}>
                {formatPct(p.share)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
