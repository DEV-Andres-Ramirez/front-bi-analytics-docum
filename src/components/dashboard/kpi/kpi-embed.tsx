"use client";

import { Download, MoreHorizontal, Table2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { Dialog } from "@/components/ui/dialog";
import { Popover } from "@/components/ui/popover";
import { StatusIcon } from "@/components/widgets/kit/status-icon";
import { download, resultToTable, tableToCsv } from "@/components/widgets/result-table";
import type { CategoryResult, WidgetResult } from "@/dashboards/dto";
import type { StatusTone, WidgetDef } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { isNeutral, normalizeLabel, resolveStatus, sortByFamily } from "@/lib/charts/semantic";
import { displayLabel } from "@/lib/labels";
import { formatInt, formatPct } from "@/lib/format";
import { Swatch } from "@/components/widgets/kit/chart-legend";
import { FigureSkeleton } from "./shared";

/**
 * Widget de categoría embebido en un KpiGroup (p. ej. "momento" en SMART 3):
 * barra 100 % de 8 px con su familia semántica (en el orden de las cifras del grupo) + leyenda de una línea, y un mini menú
 * con "Ver datos" y "Descargar CSV" (la métrica conserva su exportación).
 */

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function dimensionOf(w: WidgetDef): string | undefined {
  if ("dimension" in w) return w.dimension;
  if (w.type === "bartable") return w.columns[0]?.field;
  return undefined;
}

const canFilter = (label: string) => !/^otr[oa]s( \d+.*)?$/.test(normalizeLabel(label));

interface Part {
  label: string;
  display: string;
  value: number;
  share: number;
  color: string;
  tone: StatusTone | null;
}

function toParts(widget: WidgetDef, r: CategoryResult, order?: string[]): Part[] {
  const fam = widget.semantic;
  const ov = widget.vizOptions?.overrides;
  let slot = 0;
  const rows = r.labels.map((label, i) => ({ label, value: r.values[i] ?? 0 }));
  const base = fam ? sortByFamily(rows, (x) => x.label, fam, ov) : [...rows].sort((a, b) => Number(isNeutral(a.label)) - Number(isNeutral(b.label)) || b.value - a.value);
  // Mismo orden que las cifras del grupo (p. ej. Gestión · Cierre): barra, leyenda y cifras coinciden.
  // Las categorías que no son una cifra del grupo conservan su orden y van después; los neutrales, al final.
  const rank = new Map((order ?? []).map((l, i) => [normalizeLabel(l), i] as const));
  const pos = (label: string) => {
    const display = fam ? resolveStatus(label, fam, ov)?.display : undefined;
    return rank.get(normalizeLabel(label)) ?? (display ? rank.get(normalizeLabel(display)) : undefined) ?? (isNeutral(label) ? Infinity : rank.size);
  };
  const ordered = rank.size ? base.map((x, i) => ({ x, i })).sort((a, b) => pos(a.x.label) - pos(b.x.label) || a.i - b.i).map(({ x }) => x) : base;
  const total = r.total || ordered.reduce((a, b) => a + b.value, 0);
  return ordered.map(({ label, value }) => {
    const st = fam ? resolveStatus(label, fam, ov) : null;
    const neutral = isNeutral(label);
    const color = st ? st.color : neutral ? "var(--chart-other)" : `var(--chart-${Math.min(++slot, 5)})`;
    return { label, display: st?.display ?? displayLabel(label, widget.labelKind).full, value, share: total ? value / total : 0, color, tone: st?.tone ?? (neutral ? "neutral" : null) };
  });
}

export function EmbedBar({ widget, result, order }: { widget: WidgetDef; result?: CategoryResult; order?: string[] }) {
  const { filters, toggleValue } = useDashboard();
  const orderKey = order?.join("\u0000");
  const parts = useMemo(() => (result && result.kind === "category" ? toParts(widget, result, orderKey ? orderKey.split("\u0000") : undefined) : []), [widget, result, orderKey]);
  if (!result) {
    return (
      <div className="mt-2.5">
        <FigureSkeleton className="block h-2 w-full rounded-full" />
        <span className="mt-1.5 flex h-4 items-center">
          <FigureSkeleton className="h-3 w-40" />
        </span>
      </div>
    );
  }
  const dim = dimensionOf(widget);
  const noCross = widget.type === "bar" && widget.noCrossFilter;
  const selected = dim ? (filters.eq[dim] ?? []) : [];
  const visible = parts.filter((p) => p.value > 0);
  return (
    <div className="mt-2.5 min-w-0">
      <div className="flex h-2 w-full items-center gap-[2px]" role="group" aria-label={widget.title}>
        {visible.map((p, i) => {
          const interactive = Boolean(dim) && !noCross && canFilter(p.label);
          const dimmed = selected.length > 0 && !selected.includes(p.label);
          const cls = cn(
            "flex h-5 items-center transition-opacity",
            i === 0 && "[&>span]:rounded-l-full",
            i === visible.length - 1 && "[&>span]:rounded-r-full",
            dimmed && "opacity-45",
          );
          const mark = <span aria-hidden className="block h-2 w-full" style={{ background: p.color }} />;
          const title = `${p.display}: ${formatInt(p.value)} · ${formatPct(p.share)}`;
          const style = { flexGrow: p.share, flexBasis: 0, minWidth: 3 };
          return interactive ? (
            <button
              key={p.label}
              type="button"
              title={`${title} · clic para filtrar`}
              aria-label={`${title}. Filtrar`}
              aria-pressed={selected.includes(p.label)}
              onClick={() => toggleValue(dim!, p.label)}
              className={cn(cls, "-my-1.5 hover:opacity-80")}
              style={style}
            >
              {mark}
            </button>
          ) : (
            <span key={p.label} title={title} className={cls} style={style}>
              {mark}
            </span>
          );
        })}
      </div>
      <ul className="mt-1.5 flex h-4 min-w-0 flex-wrap items-center gap-x-3 overflow-hidden text-xs leading-4" aria-label={`Leyenda de ${widget.title}`}>
        {visible.map((p) => (
          <li key={p.label} className={cn("inline-flex items-center gap-1", selected.length > 0 && !selected.includes(p.label) && "opacity-45")}>
            {p.tone ? <StatusIcon tone={p.tone} className="size-3" /> : <Swatch color={p.color} />}
            <span className="text-text-2">{p.display}</span>
            <span className="tabular font-semibold text-text">{formatPct(p.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmbedMenu({ widget, result }: { widget: WidgetDef; result?: WidgetResult }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [table, setTable] = useState(false);
  const { meta, filters } = useDashboard();
  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-surface-3 disabled:opacity-40";
  const data = useMemo(() => (result ? resultToTable(widget, result) : null), [widget, result]);
  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Opciones de ${widget.title}`}
        className="-my-1 -mr-1.5 grid size-7 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-3 hover:text-text"
      >
        <MoreHorizontal className="size-4" />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align="end" width={230} label={`Opciones de ${widget.title}`}>
        <div className="p-1.5">
          <p className="truncate px-3 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{widget.title}</p>
          <button
            type="button"
            className={item}
            disabled={!data}
            onClick={() => {
              setOpen(false);
              setTable(true);
            }}
          >
            <Table2 className="size-4 text-muted" /> Ver datos
          </button>
          <button
            type="button"
            className={item}
            disabled={!data}
            onClick={() => {
              setOpen(false);
              if (data) download(`${meta.slug}_${slugify(widget.title)}_${filters.from}_${filters.to}.csv`, tableToCsv(data));
            }}
          >
            <Download className="size-4 text-muted" /> Descargar CSV
          </button>
        </div>
      </Popover>
      <Dialog open={table} onClose={() => setTable(false)} title={`Datos · ${widget.title}`} className="max-w-2xl">
        {data && (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead className="sticky top-0 bg-surface-2">
                <tr>
                  {data.columns.map((c) => (
                    <th key={c} scope="col" className="whitespace-nowrap border-b border-border px-4 py-2.5 text-left text-xs font-bold text-text-2">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-surface-2">
                    {r.map((v, j) => (
                      <td key={j} className={cn("border-b border-border px-4 py-2", typeof v === "number" && "tabular text-right")}>
                        {v === null ? "—" : typeof v === "number" ? v.toLocaleString("es-CO") : v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Dialog>
    </>
  );
}
