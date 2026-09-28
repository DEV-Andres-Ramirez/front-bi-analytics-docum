"use client";

import { ChevronRight, CornerLeftUp } from "lucide-react";
import { useMemo, useState } from "react";
import type { CategoryResult, DrilldownResult, DrillNode } from "@/dashboards/dto";
import type { BarWidget, DrilldownWidget } from "@/dashboards/types";
import { BarChart } from "./bar-chart";

/** Barras apiladas con navegación jerárquica (clic para bajar de nivel). */
export function DrilldownChart({ widget, result, height }: { widget: DrilldownWidget; result: DrilldownResult; height: number }) {
  const [path, setPath] = useState<string[]>([]);

  const { nodes, validPath } = useMemo(() => {
    let current: DrillNode[] = result.nodes;
    const valid: string[] = [];
    for (const step of path) {
      const next = current.find((n) => n.label === step);
      if (!next?.children) break;
      valid.push(step);
      current = next.children;
    }
    return { nodes: current, validPath: valid };
  }, [result.nodes, path]);

  const level = validPath.length;
  const levelDef = widget.levels[level];
  const categoryResult: CategoryResult = useMemo(
    () => ({
      kind: "category",
      labels: nodes.map((n) => n.label),
      values: nodes.map((n) => n.value),
      total: nodes.reduce((a, n) => a + n.value, 0),
      stacks: result.stackKeys.length
        ? result.stackKeys.map((k) => ({ key: k, values: nodes.map((n) => n.stacks?.[k] ?? 0) }))
        : undefined,
    }),
    [nodes, result.stackKeys],
  );
  const barWidget: BarWidget = {
    id: widget.id,
    type: "bar",
    title: widget.title,
    size: widget.size,
    dimension: levelDef.field,
    orientation: "horizontal",
    semantic: widget.semantic,
    stackBy: widget.stackBy,
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <nav aria-label="Nivel" className="flex flex-wrap items-center gap-1 text-xs">
        <button type="button" onClick={() => setPath([])} className="rounded-full px-2 py-1 font-semibold text-muted hover:bg-surface-3 hover:text-text" disabled={!level}>
          {widget.levels[0].label}
        </button>
        {validPath.map((step, i) => (
          <span key={`${i}-${step}`} className="flex items-center gap-1">
            <ChevronRight className="size-3.5 text-faint" />
            <button type="button" onClick={() => setPath(validPath.slice(0, i + 1))} className="max-w-[180px] truncate rounded-full bg-primary-soft px-2 py-1 font-semibold text-primary-strong" title={step}>
              {step}
            </button>
          </span>
        ))}
        {level > 0 && (
          <button type="button" onClick={() => setPath(validPath.slice(0, -1))} className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 font-semibold text-text-2 hover:border-primary/40">
            <CornerLeftUp className="size-3.5" /> Subir
          </button>
        )}
      </nav>
      <p className="text-xs text-muted">
        Nivel {level + 1} de {widget.levels.length}: <strong className="text-text-2">{levelDef.label}</strong>
        {level < widget.levels.length - 1 && " · clic en una barra para bajar"}
      </p>
      <BarChart
        widget={barWidget}
        result={categoryResult}
        height={height - 60}
        noCrossFilter
        onBarClick={(label) => {
          const node = nodes.find((n) => n.label === label);
          if (node?.children?.length) setPath([...validPath, label]);
        }}
      />
    </div>
  );
}
