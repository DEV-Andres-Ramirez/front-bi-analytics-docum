import type { KpiCellDef, KpiDef, KpiRowDef } from "@/dashboards/types";

/**
 * Banda de respaldo para specs sin kpiLayout (migración incremental):
 * héroe = el KPI con hero (o el primero) + grupos "list" de hasta 4 métricas en plantillas válidas.
 * - ≤ 4 restantes: 4-8 [héroe | grupo].
 * - 5–8: 4-8 + fila compacta 12 o 6-6.
 * - 9–12: 4-8 + fila compacta 4-4-4.
 */
export function fallbackKpiLayout(kpis: KpiDef[]): KpiRowDef[] {
  if (!kpis.length) return [];
  const hero = kpis.find((k) => k.hero) ?? kpis[0];
  const rest = kpis.filter((k) => k.id !== hero.id).map((k) => k.id);
  const heroCell: KpiCellDef = { kind: "hero", kpi: hero.id };
  if (!rest.length) return [{ template: "12", cells: [heroCell] }];
  const group = (ids: string[], title: string): KpiCellDef => ({ kind: "group", title, variant: "list", kpis: ids });
  const rows: KpiRowDef[] = [{ template: "4-8", cells: [heroCell, group(rest.slice(0, 4), "Indicadores del periodo")] }];
  const tail = rest.slice(4);
  if (!tail.length) return rows;
  if (tail.length <= 2) rows.push({ template: "12", compact: true, cells: [group(tail, "Más indicadores")] });
  else if (tail.length <= 8) {
    const h = Math.ceil(tail.length / 2);
    rows.push({ template: "6-6", compact: true, cells: [group(tail.slice(0, h), "Más indicadores"), group(tail.slice(h), "Otros indicadores")] });
  } else {
    const h = Math.ceil(tail.length / 3);
    rows.push({
      template: "4-4-4",
      compact: true,
      cells: [group(tail.slice(0, h), "Más indicadores"), group(tail.slice(h, 2 * h), "Otros indicadores"), group(tail.slice(2 * h), "Complementarios")],
    });
  }
  return rows;
}
