"use client";

import type { BarTableResult } from "@/dashboards/dto";
import type { BarTableWidget } from "@/dashboards/types";
import { useChartTheme } from "@/lib/charts/theme";
import { formatInt, formatPct, formatValue } from "@/lib/format";

/** Tabla con barra dentro de la celda (ranking legible, sin etiquetas truncadas). */
export function BarTable({ widget, result, height }: { widget: BarTableWidget; result: BarTableResult; height: number }) {
  const theme = useChartTheme();
  const format = widget.valueFormat ?? "int";
  if (!result.rows.length) return <p className="py-10 text-center text-sm text-muted">Sin registros para los filtros actuales.</p>;
  return (
    <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: height }}>
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        <thead className="sticky top-0 z-10 bg-surface-2">
          <tr>
            <th className="w-10 border-b border-border px-3 py-2.5 text-left text-xs font-bold text-text-2">#</th>
            {widget.columns.map((c) => (
              <th key={c.field} className="whitespace-nowrap border-b border-border px-3 py-2.5 text-left text-xs font-bold text-text-2">
                {c.label}
              </th>
            ))}
            <th className="min-w-[180px] border-b border-border px-3 py-2.5 text-left text-xs font-bold text-text-2">{widget.measureLabel}</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r, i) => (
            <tr key={i} className="hover:bg-surface-2">
              <td className="tabular border-b border-border px-3 py-2 text-xs text-muted">{i + 1}</td>
              {r.cells.map((c, j) => (
                <td key={j} className="max-w-[320px] truncate border-b border-border px-3 py-2 text-text-2" title={c}>
                  {c}
                </td>
              ))}
              <td className="border-b border-border px-3 py-2">
                <div className="flex items-center gap-2.5">
                  <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <span className="block h-full rounded-full" style={{ width: `${(r.value / (result.max || 1)) * 100}%`, background: theme.series[0] }} />
                  </span>
                  <span className="tabular w-24 text-right font-semibold">{formatValue(r.value, format)}</span>
                  {format === "int" && <span className="tabular w-12 text-right text-xs text-muted">{formatPct(r.value / (result.total || 1))}</span>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0 bg-surface-2">
          <tr>
            <td colSpan={widget.columns.length + 1} className="border-t border-border px-3 py-2 text-xs font-bold">
              Total ({formatInt(result.rows.length)} filas)
            </td>
            <td className="tabular border-t border-border px-3 py-2 text-right text-xs font-bold">{formatValue(result.total, format)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
