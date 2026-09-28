import type { WidgetResult } from "@/dashboards/dto";
import type { WidgetDef } from "@/dashboards/types";
import { DAY_MS, formatMonth, isoToMs, msToISO } from "@/lib/dates";

export interface SimpleTable {
  columns: string[];
  rows: (string | number | null)[][];
}

/** Representación tabular de cualquier widget ("Ver datos" y exportar CSV). */
export function resultToTable(widget: WidgetDef, result: WidgetResult): SimpleTable {
  switch (result.kind) {
    case "category": {
      if (result.stacks?.length) {
        return {
          columns: ["Categoría", ...result.stacks.map((s) => s.key), "Total"],
          rows: result.labels.map((l, i) => [l, ...result.stacks!.map((s) => s.values[i]), result.values[i]]),
        };
      }
      const sec = widget.type === "bar" ? widget.secondary : undefined;
      return {
        columns: ["Categoría", "Valor", ...(sec ? [sec.label] : [])],
        rows: result.labels.map((l, i) => [l, result.values[i], ...(sec ? [result.secondary?.[i] ?? null] : [])]),
      };
    }
    case "timeseries": {
      const start = isoToMs(result.start);
      const n = result.series[0]?.values.length ?? 0;
      return {
        columns: ["Fecha", ...result.series.map((s) => s.label), ...(result.previous ? ["Periodo anterior"] : [])],
        rows: Array.from({ length: n }, (_, i) => [msToISO(start + i * DAY_MS), ...result.series.map((s) => s.values[i]), ...(result.previous ? [result.previous[i] ?? null] : [])]),
      };
    }
    case "monthly":
      return {
        columns: ["Mes", "Valor", "Variación vs mes anterior"],
        rows: result.months.map((m, i) => [
          formatMonth(m),
          result.values[i],
          i && result.values[i - 1] ? Math.round(((result.values[i] - result.values[i - 1]) / result.values[i - 1]) * 1000) / 10 : null,
        ]),
      };
    case "pivot":
      return {
        columns: [...(result.rows.some((r) => r.group) ? ["Grupo"] : []), "Fila", ...result.columns, "Total"],
        rows: result.rows.map((r) => [...(r.group !== undefined ? [r.group] : []), r.label, ...r.values, r.total]),
      };
    case "bartable":
      return {
        columns: [...(widget.type === "bartable" ? widget.columns.map((c) => c.label) : []), widget.type === "bartable" ? widget.measureLabel : "Valor"],
        rows: result.rows.map((r) => [...r.cells, r.value]),
      };
    case "map":
      return {
        columns: ["Nivel", "Código DANE", "Territorio", "Registros", "% del total"],
        rows: [
          ...result.dptos.map((d) => ["Departamento", d.code, d.name, d.value, Math.round(d.share * 1000) / 10]),
          ...result.mpios.map((m) => ["Municipio", m.code, m.name, m.value, Math.round(m.share * 1000) / 10]),
        ],
      };
    case "sankey":
      return { columns: ["Origen", "Destino", "Registros"], rows: result.flows.map((f) => [f.from, f.to, f.value]) };
    case "drilldown":
      return {
        columns: ["Categoría", "Registros", ...result.stackKeys],
        rows: result.nodes.map((n) => [n.label, n.value, ...result.stackKeys.map((k) => n.stacks?.[k] ?? 0)]),
      };
    case "histogram":
      return { columns: ["Intervalo", "Registros"], rows: [...result.labels.map((l, i) => [l, result.values[i]]), ["Sin dato", result.empty]] };
    case "efficiency":
      return {
        columns: ["Ranking", "Gerencia", "Asignación", "Gestión", "Revisión", "Aprobación"],
        rows: result.rows.map((r) => [r.ranking, r.gerencia, r.phases.asignacion.message, r.phases.gestion.message, r.phases.revision.message, r.phases.aprobacion.message]),
      };
  }
}

export function tableToCsv(t: SimpleTable): string {
  const esc = (v: string | number | null) => {
    if (v === null) return "";
    const s = typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${[t.columns.map(esc).join(";"), ...t.rows.map((r) => r.map(esc).join(";"))].join("\r\n")}`;
}

export function download(filename: string, content: string | Blob, type = "text/csv;charset=utf-8") {
  const blob = typeof content === "string" ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
