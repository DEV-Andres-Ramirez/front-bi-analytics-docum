"use client";

import { AlertTriangle, Download, Expand, FlaskConical, ImageDown, Info, Loader2, MoreHorizontal, RotateCcw, Table2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Popover } from "@/components/ui/popover";
import { Badge, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import { WidgetFrameContext } from "@/components/widgets/frame-context";
import { download, resultToTable, tableToCsv } from "@/components/widgets/result-table";
import { isEmptyResult, WidgetRenderer } from "@/components/widgets/widget-renderer";
import type { WidgetResult } from "@/dashboards/dto";
import type { WidgetDef, WidgetSize } from "@/dashboards/types";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/cn";
import { useDashboard } from "./dashboard-context";

export const SIZE_CLASS: Record<WidgetSize, string> = {
  sm: "md:col-span-3 xl:col-span-4",
  md: "md:col-span-6 xl:col-span-6",
  lg: "md:col-span-6 xl:col-span-8",
  xl: "md:col-span-6 xl:col-span-12",
  full: "md:col-span-6 xl:col-span-12",
};

const DEFAULT_HEIGHT: Partial<Record<WidgetDef["type"], number>> = {
  donut: 240,
  map: 440,
  pivot: 420,
  bartable: 340,
  efficiency: 520,
  drilldown: 420,
  sankey: 380,
};

/** Widgets de tabla: el alto es un máximo (con scroll), no un mínimo. */
const CONTENT_SIZED = new Set<WidgetDef["type"]>(["pivot", "bartable", "efficiency"]);

function slugify(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function WidgetMenu({ widget, result, onExpand, onTable, exporter }: { widget: WidgetDef; result?: WidgetResult; onExpand: () => void; onTable: () => void; exporter: () => string | null }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { meta, filters } = useDashboard();
  const name = `${meta.slug}_${slugify(widget.title)}_${filters.from}_${filters.to}`;
  const canPng = !["pivot", "bartable", "efficiency"].includes(widget.type);
  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-surface-3 disabled:opacity-40";
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen((o) => !o)} aria-label={`Opciones de ${widget.title}`} className="grid size-8 place-items-center rounded-full text-muted transition hover:bg-surface-3 hover:text-text">
        <MoreHorizontal className="size-[18px]" />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align="end" width={220} label="Opciones del gráfico">
        <div className="p-1.5">
          <button type="button" className={item} onClick={() => { setOpen(false); onExpand(); }}>
            <Expand className="size-4 text-muted" /> Ampliar
          </button>
          <button type="button" className={item} disabled={!result} onClick={() => { setOpen(false); onTable(); }}>
            <Table2 className="size-4 text-muted" /> Ver datos
          </button>
          <button type="button" className={item} disabled={!result} onClick={() => { setOpen(false); if (result) download(`${name}.csv`, tableToCsv(resultToTable(widget, result))); }}>
            <Download className="size-4 text-muted" /> Descargar CSV
          </button>
          {canPng && (
            <button
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                const url = exporter();
                if (!url) return;
                const a = document.createElement("a");
                a.href = url;
                a.download = `${name}.png`;
                a.click();
              }}
            >
              <ImageDown className="size-4 text-muted" /> Descargar PNG
            </button>
          )}
        </div>
      </Popover>
    </>
  );
}

function DataTableView({ widget, result }: { widget: WidgetDef; result: WidgetResult }) {
  const t = useMemo(() => resultToTable(widget, result), [widget, result]);
  return (
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-[13px]">
        <thead className="sticky top-0 bg-surface-2">
          <tr>
            {t.columns.map((c) => (
              <th key={c} className="whitespace-nowrap border-b border-border px-4 py-2.5 text-left text-xs font-bold text-text-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, i) => (
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
  );
}

export function WidgetBody({ widget, height, expanded }: { widget: WidgetDef; height: number; expanded?: boolean }) {
  const { data, isError, refetch } = useDashboard();
  const result = data?.widgets[widget.id];
  if (isError && !result) {
    return (
      <EmptyState
        title="No fue posible cargar este gráfico"
        icon={<AlertTriangle className="size-5" />}
        description={
          <button type="button" onClick={refetch} className="inline-flex items-center gap-1 font-semibold text-primary-strong">
            <RotateCcw className="size-3.5" /> Reintentar
          </button>
        }
      />
    );
  }
  if (!result) return <Skeleton className="w-full" />;
  if (isEmptyResult(result)) {
    return <EmptyState title="Sin datos para los filtros seleccionados" description={widget.note ?? "Prueba ampliando el rango de fechas o quitando filtros."} className="h-full" />;
  }
  return <WidgetRenderer widget={widget} result={result} height={expanded ? Math.max(height, 520) : height} />;
}

export function WidgetCard({ widget, className, headerExtra }: { widget: WidgetDef; className?: string; headerExtra?: ReactNode }) {
  const { data, isFetching } = useDashboard();
  const { ref, inView } = useInView<HTMLElement>();
  const [expanded, setExpanded] = useState(false);
  const [table, setTable] = useState(false);
  const exporterRef = useRef<(() => string | null) | null>(null);
  const setExporter = useCallback((fn: (() => string | null) | null) => {
    exporterRef.current = fn;
  }, []);
  const frame = useMemo(() => ({ expanded: false, setExporter }), [setExporter]);
  const frameExpanded = useMemo(() => ({ expanded: true, setExporter: () => {} }), []);
  const height = widget.height ?? DEFAULT_HEIGHT[widget.type] ?? 300;
  const result = data?.widgets[widget.id];

  return (
    <article ref={ref} className={cn("card flex min-w-0 flex-col p-4 sm:p-5", SIZE_CLASS[widget.size], className)} aria-labelledby={`w-${widget.id}`}>
      <header className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`w-${widget.id}`} className="text-[15px] font-bold leading-snug">
              {widget.title}
            </h3>
            {widget.type === "monthly" && widget.scope === "ytd" && <Badge tone="info">Año en curso</Badge>}
            {widget.provisional && (
              <Badge tone="warning" icon={<FlaskConical className="size-3" />}>
                Provisional
              </Badge>
            )}
            {widget.note && (
              <Tooltip content={widget.note} focusable>
                <Info className="size-4 text-faint" aria-label="Nota" />
              </Tooltip>
            )}
          </div>
          {widget.subtitle && <p className="mt-0.5 text-xs text-muted">{widget.subtitle}</p>}
        </div>
        {headerExtra}
        {isFetching && data && <Loader2 className="mt-1.5 size-4 animate-spin text-faint" aria-label="Actualizando" />}
        <WidgetMenu widget={widget} result={result} onExpand={() => setExpanded(true)} onTable={() => setTable(true)} exporter={() => exporterRef.current?.() ?? null} />
      </header>

      <div
        className={cn("min-h-0 flex-1 transition-opacity duration-300", isFetching && data && "opacity-60")}
        style={{ minHeight: CONTENT_SIZED.has(widget.type) && result ? undefined : height }}
      >
        <WidgetFrameContext.Provider value={frame}>{inView ? <WidgetBody widget={widget} height={height} /> : <Skeleton className="h-full w-full" />}</WidgetFrameContext.Provider>
      </div>

      <Dialog open={expanded} onClose={() => setExpanded(false)} title={widget.title} className="max-w-6xl">
        <div className="p-5">
          <WidgetFrameContext.Provider value={frameExpanded}>
            <WidgetBody widget={widget} height={Math.round((typeof window !== "undefined" ? window.innerHeight : 800) * 0.6)} expanded />
          </WidgetFrameContext.Provider>
        </div>
      </Dialog>
      <Dialog open={table} onClose={() => setTable(false)} title={`Datos · ${widget.title}`} className="max-w-4xl">
        {result && <DataTableView widget={widget} result={result} />}
      </Dialog>
    </article>
  );
}
