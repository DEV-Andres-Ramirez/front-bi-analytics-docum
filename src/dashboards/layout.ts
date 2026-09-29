/**
 * Sistema de layout de los tableros: plantillas cerradas, tiers, presupuestos de alto
 * por componente y validación (validateLayout corre en desarrollo y en vitest).
 * Especificación completa: docs/ui-design-system.md §Layout.
 */
import type { CellRef, DashboardSpec, KpiCellDef, KpiRowTemplate, RowDef, RowTemplate, SectionDef, Tier, Viz, WidgetDef } from "./types";
import { CONTENT_VIZ, HORIZONTAL_VIZ, LEGEND_STRIP_VIZ, resolveViz } from "./viz";

// ─── Plantillas ──────────────────────────────────────────────────────────────
export const ROW_TEMPLATES: RowTemplate[] = ["12", "8-4", "4-8", "7-5", "5-7", "6-6", "4-4-4", "3-3-3-3", "6-3-3"];
export const KPI_TEMPLATES: KpiRowTemplate[] = [...ROW_TEMPLATES, "3-3-6", "3-6-3", "3-4-5"];

export function templateSpans(t: KpiRowTemplate): number[] {
  return t.split("-").map(Number);
}

/**
 * Spans en el grid de 6 columnas (contenedor 600–839 px).
 * Simétricas se reparten; asimétricas se apilan a ancho completo (la P1 nunca queda a media anchura).
 */
export function templateSpansMd(t: KpiRowTemplate, kpi = false): number[] {
  switch (t) {
    case "12":
      return [6];
    case "6-6":
      return [3, 3];
    case "4-4-4":
      return [3, 3, 6];
    case "3-3-3-3":
      return [3, 3, 3, 3];
    case "6-3-3":
      return [6, 3, 3];
    case "3-3-6":
      return [3, 3, 6];
    case "3-6-3":
      return [3, 6, 3];
    case "3-4-5":
      return [3, 3, 6];
    default:
      // 8-4, 4-8, 7-5, 5-7: en la banda de KPIs van mitad y mitad; en secciones se apilan
      return kpi ? [3, 3] : [6, 6];
  }
}

// ─── Tiers ───────────────────────────────────────────────────────────────────
/** Alto total de la tarjeta (escritorio). */
export const TIER_HEIGHT: Record<Exclude<Tier, "auto">, number> = { S: 280, M: 380, L: 480, XL: 640 };
/** Padding (40) + header (44 + 12) + borde (2). */
const CARD_CHROME = 98;
/** Franja de leyenda (24 + 8). */
export const LEGEND_STRIP = 32;

/** Cuerpo útil en px (escritorio). 0 = por contenido. */
export function tierBody(tier: Tier, withStrip: boolean, stacked = false): number {
  if (tier === "auto") return 0;
  if (stacked) return Math.round((TIER_HEIGHT[tier] - 20) / 2 - CARD_CHROME);
  return TIER_HEIGHT[tier] - CARD_CHROME - (withStrip ? LEGEND_STRIP : 0);
}

/** Ancho interno (sin padding) de una celda a 1440 con sidebar expandido (contenido de 1076 px). */
export function innerWidth(span: number): number {
  const col = (1076 - 11 * 20) / 12;
  return Math.round(span * col + (span - 1) * 20 - 40);
}

// ─── Celdas ──────────────────────────────────────────────────────────────────
export function cellWidgetIds(cell: CellRef): string[] {
  if (typeof cell === "string") return [cell];
  if ("stack" in cell) return [...cell.stack];
  if ("composite" in cell) return [...cell.widgets];
  return [...cell.tabs];
}

export function cellKey(cell: CellRef, i: number): string {
  if (typeof cell === "string") return cell;
  if ("stack" in cell) return `stack:${cell.stack.join("+")}`;
  return cell.id ?? `cell-${i}`;
}

/** ¿La fila reserva la franja de leyenda? (si alguna celda la usa; legendFrom = la leyenda es el vecino) */
export function rowHasLegendStrip(row: RowDef, widgets: Map<string, WidgetDef>): boolean {
  return row.cells.some((c) => {
    if (typeof c !== "string") return false;
    const w = widgets.get(c);
    if (!w || w.vizOptions?.legendFrom) return false;
    const viz = resolveViz(w);
    // column-bars sin familia semántica no dibuja leyenda (solo el chip de calidad, que va en el header)
    if (viz === "column-bars" && !w.semantic) return false;
    return LEGEND_STRIP_VIZ.has(viz);
  });
}

// ─── Presupuesto de alto por componente (layoutSystem §6) ────────────────────
/**
 * Alto requerido por el contenido. Devuelve null para componentes que truncan con
 * "Ver N más" o llenan el cuerpo (rankings, canvas): esos siempre caben.
 */
export function requiredHeight(viz: Viz, w: WidgetDef, inner: number): number | null {
  const n = w.maxItems ?? 0;
  if (!n) return null;
  switch (viz) {
    case "status-strip": {
      const variant = w.vizOptions?.variant ?? (inner <= 305 ? "vertical" : "horizontal");
      if (variant === "list") return 40 + n * 32;
      const headed = Boolean(w.vizOptions?.groups) || w.semantic === "semaforo";
      // Respaldo del componente (lista compacta agrupada): 24 + 24 por cabecera + 26 por estado + 9 del neutral
      const rows = 24 + (headed ? 48 : 0) + n * 26 + 9;
      if (variant === "vertical") return Math.min(24 + n * 56 + (n - 1) * 8, rows);
      const perLine = Math.max(1, Math.floor((inner + 8) / 120));
      const lines = Math.ceil(n / perLine);
      return Math.min(24 + lines * ((headed ? 28 : 0) + 77) + (lines - 1) * 8, rows);
    }
    case "pipeline": {
      // Solo las etapas del flujo principal ocupan chevrons; rama y salidas van como chips
      const side = (w.vizOptions?.branch?.length ?? 0) + (w.vizOptions?.exits?.length ?? 0);
      const steps = Math.max(1, n - side);
      return (inner >= steps * 150 ? 120 : 24 + steps * 48) + (side ? 32 : 0);
    }
    case "composition": {
      const layout = w.vizOptions?.layout ?? (n <= 3 ? "split" : "legend");
      // Total en una fila del cuerpo (18 + 10) salvo franja; split en columnas desde ≈ 120 px por parte (etiqueta
      // más larga; composition-bar.tsx › splitColMin), nota de neutrales 34
      if (layout === "split") return 28 + (inner >= n * 120 + (n - 1) * 12 ? 14 + 10 + 83 : 14 + 10 + n * 24) + 34;
      // legend-table: columnas de 150–232 px según la etiqueta (composition-bar.tsx › colRange); neutrales tras hairline (9 px)
      const cols = Math.max(1, Math.min(3, Math.floor((inner + 16) / 216)));
      return 28 + 14 + 10 + Math.ceil(n / cols) * 24 + 9;
    }
    case "family-split":
      return 96 + 20 + Math.ceil(n / 2) * 20;
    case "split-rows":
      // Bajo 420 px la etiqueta va sobre la barra (≈ 52 px por fila)
      return n * (inner < 420 ? 52 : w.vizOptions?.compact ? 32 : 36);
    case "entity-tiles": {
      const perLine = Math.max(1, Math.floor((inner + 12) / 192));
      const lines = Math.ceil(n / perLine);
      return lines * 112 + (lines - 1) * 12;
    }
    case "category-tiles":
      return 2 * 104 + 12;
    default:
      return null;
  }
}

// ─── KPIs ────────────────────────────────────────────────────────────────────
export function kpiCellIds(cell: KpiCellDef): string[] {
  if (cell.kind === "hero" || cell.kind === "tile") return [cell.kpi];
  return [...cell.kpis, ...(cell.after ?? []), ...(cell.secondary ? [cell.secondary] : [])];
}

// ─── Validación ──────────────────────────────────────────────────────────────
export interface LayoutIssue {
  level: "error" | "warn";
  where: string;
  message: string;
}

export function validateLayout(spec: DashboardSpec): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const err = (where: string, message: string) => issues.push({ level: "error", where, message });
  const warn = (where: string, message: string) => issues.push({ level: "warn", where, message });
  const widgets = new Map(spec.sections.flatMap((s) => s.widgets.map((w) => [w.id, w] as const)));
  const placed = new Map<string, number>();
  const bump = (id: string) => placed.set(id, (placed.get(id) ?? 0) + 1);

  // KPIs
  const kpiIds = new Set(spec.kpis.map((k) => k.id));
  if (spec.kpiLayout) {
    if (spec.kpiLayout.length > 2) err("kpiLayout", "máximo 2 filas de KPIs");
    const seen = new Map<string, number>();
    let heroes = 0;
    spec.kpiLayout.forEach((row, r) => {
      if (!KPI_TEMPLATES.includes(row.template)) err(`kpiLayout[${r}]`, `plantilla inválida ${row.template}`);
      const spans = templateSpans(row.template);
      if (spans.length !== row.cells.length) err(`kpiLayout[${r}]`, `${row.cells.length} celdas para la plantilla ${row.template}`);
      row.cells.forEach((cell, c) => {
        if (cell.kind === "hero") heroes++;
        for (const id of kpiCellIds(cell)) {
          if (!kpiIds.has(id)) err(`kpiLayout[${r}][${c}]`, `KPI inexistente "${id}"`);
          seen.set(id, (seen.get(id) ?? 0) + 1);
        }
        if (cell.kind === "group") {
          if (cell.embed) {
            if (!widgets.has(cell.embed)) err(`kpiLayout[${r}][${c}]`, `widget embebido inexistente "${cell.embed}"`);
            else bump(cell.embed);
          }
          const span = spans[c] ?? 12;
          const inner = innerWidth(span);
          const metrics = cell.kpis.length + (cell.after?.length ?? 0);
          const minW = [...cell.kpis, ...(cell.after ?? [])].reduce((a, id) => a + (spec.kpis.find((k) => k.id === id)?.format === "cop" ? 150 : 112), 0);
          const extra = (metrics - 1) * 12;
          if (metrics > 4) err(`kpiLayout[${r}][${c}]`, `grupo "${cell.title}" con ${metrics} métricas (máximo 4)`);
          else if (minW + extra > inner && !row.compact) warn(`kpiLayout[${r}][${c}]`, `grupo "${cell.title}" necesita ${minW + extra}px y tiene ${inner}px (pasa a 2×2)`);
          for (const id of [...cell.kpis, ...(cell.after ?? [])]) {
            const k = spec.kpis.find((x) => x.id === id);
            if (k && (!k.short || k.short.length > 16)) warn(`kpi ${id}`, `falta "short" (≤ 16) para la celda de grupo`);
          }
        }
      });
    });
    if (heroes !== 1) err("kpiLayout", `debe haber exactamente un KpiHero (hay ${heroes})`);
    for (const id of kpiIds) {
      const n = seen.get(id) ?? 0;
      if (n !== 1) err("kpiLayout", `KPI "${id}" aparece ${n} veces (debe ser 1)`);
    }
  } else {
    warn("kpiLayout", "sin kpiLayout: se usa la grilla de respaldo");
  }

  // Secciones
  let cellsTotal = 0;
  let horizontalTotal = 0;
  let heroWidgets = 0;
  let prevDominated = false;
  spec.sections.forEach((section) => {
    const where = `sección ${section.id}`;
    const own = new Map(section.widgets.map((w) => [w.id, w] as const));
    if (!section.rows) {
      warn(where, "sin rows: se usa el empaquetador de respaldo");
      section.widgets.forEach((w) => bump(w.id));
      return;
    }
    if (!section.question) warn(where, "falta question (H2)");
    let sectionCells = 0;
    let sectionHorizontal = 0;
    section.rows.forEach((row, r) => {
      const rw = `${where} fila ${r + 1}`;
      if (!ROW_TEMPLATES.includes(row.template)) err(rw, `plantilla inválida ${row.template}`);
      const spans = templateSpans(row.template);
      if (spans.length !== row.cells.length) err(rw, `${row.cells.length} celdas para la plantilla ${row.template}`);
      const strip = rowHasLegendStrip(row, own);
      row.cells.forEach((cell, c) => {
        const ids = cellWidgetIds(cell);
        for (const id of ids) {
          if (!own.has(id)) err(rw, `widget "${id}" no pertenece a la sección`);
          bump(id);
        }
        if (typeof cell === "object" && "stack" in cell && row.tier !== "L" && row.tier !== "XL") err(rw, "StackCell solo en tier L o XL");
        if (typeof cell === "object" && "composite" in cell && cell.hero) heroWidgets++;
        const span = spans[c] ?? 12;
        const inner = innerWidth(span);
        for (const id of ids) {
          const w = own.get(id);
          if (!w) continue;
          const viz = resolveViz(w);
          if (w.hero) heroWidgets++;
          sectionCells++;
          if (HORIZONTAL_VIZ.has(viz)) sectionHorizontal++;
          const inComposite = typeof cell === "object" && "composite" in cell;
          if (CONTENT_VIZ.has(viz) && row.tier !== "auto" && !inComposite) warn(rw, `"${id}" (${viz}) debería ir en tier auto`);
          if (viz === "hero-map" && (row.template !== "12" || row.tier !== "XL")) warn(rw, `el mapa "${id}" debe ir solo, a 12 columnas y tier XL`);
          const need = requiredHeight(viz, w, inner);
          const stacked = typeof cell === "object" && "stack" in cell;
          const body = tierBody(row.tier, strip && !stacked, stacked);
          if (need !== null && body > 0 && need > body) err(rw, `"${id}" (${viz}) necesita ${need}px y el cuerpo mide ${body}px`);
          // Tableta (6 columnas): una StatusStrip que comparte línea (span-md < 6; sola, mide por contenido) y no cabe
          // en tiles pasa a la lista compacta. Aviso, no error: el componente degrada sin desbordarse.
          const spanMd = templateSpansMd(row.template)[c] ?? 6;
          if (viz === "status-strip" && !w.vizOptions?.variant && spanMd < 6) {
            const md = Math.round(spanMd * 124.33 - 60);
            const perLine = Math.max(1, Math.floor((md + 8) / 120));
            const lines = Math.ceil((w.maxItems ?? 0) / perLine);
            const headed = Boolean(w.vizOptions?.groups) || w.semantic === "semaforo";
            const needMd = 24 + lines * ((headed ? 28 : 0) + 77) + (lines - 1) * 8;
            if (body > 0 && needMd > body) warn(rw, `"${id}" pasa a lista compacta en tablet (${needMd}px > ${body}px)`);
          }
        }
      });
    });
    cellsTotal += sectionCells;
    horizontalTotal += sectionHorizontal;
    if (sectionHorizontal > 2) err(where, `${sectionHorizontal} formas horizontales (máximo 2 por sección)`);
    const dominated = sectionCells > 0 && sectionHorizontal / sectionCells > 0.5;
    if (dominated && prevDominated) warn(where, "dos secciones seguidas dominadas por barras horizontales");
    prevDominated = dominated;
  });

  for (const id of widgets.keys()) {
    const n = placed.get(id) ?? 0;
    if (n !== 1) err("widgets", `widget "${id}" aparece ${n} veces (debe ser 1)`);
  }
  if (cellsTotal && horizontalTotal / cellsTotal > 0.4) err("tablero", `${Math.round((horizontalTotal / cellsTotal) * 100)} % de formas horizontales (máximo 40 %)`);
  const hasRows = spec.sections.some((s) => s.rows);
  if (hasRows && heroWidgets !== 1) err("tablero", `debe haber exactamente una visual protagonista (P1); hay ${heroWidgets}`);
  return issues;
}

// ─── Empaquetador de respaldo ────────────────────────────────────────────────
const SIZE_SPAN: Record<WidgetDef["size"], number> = { sm: 4, md: 6, lg: 8, xl: 12, full: 12 };

/** Filas para una sección sin rows: empaqueta por size y estira la última celda hasta 12. */
export function packRows(section: SectionDef): RowDef[] {
  const rows: RowDef[] = [];
  let cur: { id: string; span: number }[] = [];
  const flush = () => {
    if (!cur.length) return;
    const used = cur.reduce((a, c) => a + c.span, 0);
    cur[cur.length - 1].span += 12 - used;
    const template = cur.map((c) => c.span).join("-") as RowTemplate;
    const tierOf = (id: string): Tier => {
      const w = section.widgets.find((x) => x.id === id)!;
      const viz = resolveViz(w);
      if (viz === "hero-map") return "XL";
      if (CONTENT_VIZ.has(viz)) return "auto";
      return "M";
    };
    const tiers = cur.map((c) => tierOf(c.id));
    const tier: Tier = tiers.includes("auto") ? "auto" : tiers.includes("XL") ? "XL" : "M";
    if (ROW_TEMPLATES.includes(template)) rows.push({ template, tier, cells: cur.map((c) => c.id) });
    else for (const c of cur) rows.push({ template: "12", tier: tierOf(c.id), cells: [c.id] });
    cur = [];
  };
  for (const w of section.widgets) {
    const span = SIZE_SPAN[w.size] ?? 12;
    if (cur.reduce((a, c) => a + c.span, 0) + span > 12) flush();
    cur.push({ id: w.id, span });
  }
  flush();
  return rows;
}
