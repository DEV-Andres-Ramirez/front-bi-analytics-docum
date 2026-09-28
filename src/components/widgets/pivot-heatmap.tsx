"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import type { PivotResult, PivotRow } from "@/dashboards/dto";
import type { PivotWidget } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { inkOn, seqColor, useChartTheme } from "@/lib/charts/theme";
import { formatInt } from "@/lib/format";

/** Tabla dinámica con escala de color secuencial (heatmap). */
export function PivotHeatmap({ widget, result, height }: { widget: PivotWidget; result: PivotResult; height: number }) {
  const theme = useChartTheme();
  const grouped = widget.rows.length > 1;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    if (!grouped) return [{ group: "", rows: result.rows, totals: [] as number[], total: 0 }];
    const map = new Map<string, PivotRow[]>();
    for (const r of result.rows) {
      const g = r.group ?? "—";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(r);
    }
    return [...map.entries()].map(([group, rows]) => ({
      group,
      rows,
      totals: result.columns.map((_, c) => rows.reduce((a, r) => a + r.values[c], 0)),
      total: rows.reduce((a, r) => a + r.total, 0),
    }));
  }, [grouped, result]);

  const cell = (v: number, key: string) => {
    if (!v) return (
      <td key={key} className="tabular px-3 py-2 text-center text-faint">
        –
      </td>
    );
    const bg = seqColor(theme, 0.08 + 0.92 * (v / (result.max || 1)));
    return (
      <td key={key} className="tabular px-3 py-2 text-center font-semibold" style={{ background: bg, color: inkOn(bg) }}>
        {formatInt(v)}
      </td>
    );
  };

  if (!result.rows.length) return <p className="py-10 text-center text-sm text-muted">Sin registros para los filtros actuales.</p>;

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border" style={{ maxHeight: height }}>
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr>
              <th className="sticky left-0 z-10 min-w-[220px] border-b border-border bg-surface-2 px-3 py-2.5 text-left text-xs font-bold text-text-2">
                {widget.rows.map((r) => r.label).join(" › ")}
              </th>
              {result.columns.map((c) => (
                <th key={c} className="whitespace-nowrap border-b border-border px-3 py-2.5 text-center text-xs font-bold text-text-2">
                  {c}
                </th>
              ))}
              <th className="border-b border-border px-3 py-2.5 text-center text-xs font-bold text-text-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const isCollapsed = collapsed.has(g.group);
              return (
                <Fragment key={g.group || "all"}>
                  {grouped && (
                    <tr className="bg-surface-3/60">
                      <th className="sticky left-0 z-[1] border-b border-border bg-surface-3 px-3 py-2 text-left">
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsed((s) => {
                              const n = new Set(s);
                              if (n.has(g.group)) n.delete(g.group);
                              else n.add(g.group);
                              return n;
                            })
                          }
                          aria-expanded={!isCollapsed}
                          className="flex w-full items-center gap-2 text-left text-xs font-bold uppercase tracking-wide text-text-2"
                        >
                          <ChevronDown className={cn("size-3.5 shrink-0 transition", isCollapsed && "-rotate-90")} />
                          <span className="truncate" title={g.group}>{g.group}</span>
                          <span className="ml-auto font-medium normal-case text-muted">{g.rows.length}</span>
                        </button>
                      </th>
                      {g.totals.map((t, i) => (
                        <td key={i} className="tabular border-b border-border px-3 py-2 text-center text-xs font-bold text-text-2">
                          {t ? formatInt(t) : "–"}
                        </td>
                      ))}
                      <td className="tabular border-b border-border px-3 py-2 text-center text-xs font-bold">{formatInt(g.total)}</td>
                    </tr>
                  )}
                  {!isCollapsed &&
                    g.rows.map((r, ri) => (
                      <tr key={`${g.group}-${r.label}-${ri}`} className="group">
                        <th className={cn("sticky left-0 z-[1] max-w-[280px] truncate border-b border-border bg-surface px-3 py-2 text-left font-medium text-text-2 group-hover:bg-surface-2", grouped && "pl-8")} title={r.label}>
                          {r.label}
                        </th>
                        {r.values.map((v, ci) => (
                          <Fragment key={ci}>{cell(v, `${ri}-${ci}`)}</Fragment>
                        ))}
                        <td className="tabular border-b border-border px-3 py-2 text-center font-bold">{formatInt(r.total)}</td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-surface-2">
            <tr>
              <th className="sticky left-0 border-t border-border bg-surface-2 px-3 py-2 text-left text-xs font-bold">Total</th>
              {result.totals.map((t, i) => (
                <td key={i} className="tabular border-t border-border px-3 py-2 text-center text-xs font-bold">
                  {formatInt(t)}
                </td>
              ))}
              <td className="tabular border-t border-border px-3 py-2 text-center text-xs font-bold">{formatInt(result.totals.reduce((a, b) => a + b, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span className="flex items-center gap-2">
          Menos
          <span className="h-2 w-28 rounded-full" style={{ background: `linear-gradient(90deg, ${theme.seq.join(",")})` }} />
          Más
        </span>
        {result.truncated > 0 && <span>+{formatInt(result.truncated)} filas no mostradas</span>}
      </div>
    </div>
  );
}
