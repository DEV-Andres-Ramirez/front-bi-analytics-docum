"use client";

import { Download, Expand, FlaskConical, ImageDown, Info, Loader2, MoreHorizontal, Table2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Popover } from "@/components/ui/popover";
import { Badge } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import { WidgetFrameContext, type Exporter, type FrameCtx } from "@/components/widgets/frame-context";
import { VizEmpty, VizError, VizSkeleton } from "@/components/widgets/kit/viz-states";
import { download, resultToTable, tableToCsv } from "@/components/widgets/result-table";
import { CompositeRenderer, effectiveViz, isEmptyResult, WidgetRenderer } from "@/components/widgets/widget-renderer";
import type { CompositeCell } from "@/components/widgets/types";
import type { WidgetResult } from "@/dashboards/dto";
import type { Tier, WidgetDef } from "@/dashboards/types";
import { tierBody } from "@/dashboards/layout";
import { CANVAS_VIZ, resolveViz } from "@/dashboards/viz";
import { useInView } from "@/hooks/use-in-view";
import { cn } from "@/lib/cn";
import { useDashboard } from "./dashboard-context";

function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ─── Menú ⋯ ──────────────────────────────────────────────────────────────────
interface MenuSource {
  widget: WidgetDef;
  result?: WidgetResult;
}

function CardMenu({ title, sources, onExpand, onTable, onPng }: { title: string; sources: MenuSource[]; onExpand: () => void; onTable: (i: number) => void; onPng: (() => void) | null }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { meta, filters } = useDashboard();
  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-surface-3 disabled:opacity-40";
  const multi = sources.length > 1;
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen((o) => !o)} aria-label={`Opciones de ${title}`} className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-3 hover:text-text">
        <MoreHorizontal className="size-[18px]" />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align="end" width={multi ? 260 : 220} label="Opciones del gráfico">
        <div className="p-1.5">
          <button type="button" className={item} onClick={() => { setOpen(false); onExpand(); }}>
            <Expand className="size-4 text-muted" /> Ampliar
          </button>
          {sources.map((s, i) => (
            <div key={s.widget.id} className={cn(multi && "mt-1 border-t border-border pt-1")}>
              {multi && <p className="truncate px-3 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{s.widget.title}</p>}
              <button type="button" className={item} disabled={!s.result} onClick={() => { setOpen(false); onTable(i); }}>
                <Table2 className="size-4 text-muted" /> Ver datos
              </button>
              <button
                type="button"
                className={item}
                disabled={!s.result}
                onClick={() => {
                  setOpen(false);
                  if (s.result) download(`${meta.slug}_${slugify(s.widget.title)}_${filters.from}_${filters.to}.csv`, tableToCsv(resultToTable(s.widget, s.result)));
                }}
              >
                <Download className="size-4 text-muted" /> Descargar CSV
              </button>
            </div>
          ))}
          {onPng && (
            <button type="button" className={cn(item, multi && "mt-1 border-t border-border")} onClick={() => { setOpen(false); onPng(); }}>
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

// ─── Hook común de marco (exportador + franja de leyenda) ────────────────────
function useFrame(expanded: boolean) {
  const exporterRef = useRef<Exporter | null>(null);
  const [legendEl, setLegendEl] = useState<HTMLElement | null>(null);
  const [chipsEl, setChipsEl] = useState<HTMLElement | null>(null);
  const [headerEl, setHeaderEl] = useState<HTMLElement | null>(null);
  const setExporter = useCallback((fn: Exporter | null) => {
    exporterRef.current = fn;
  }, []);
  const frame: FrameCtx = useMemo(() => ({ expanded, setExporter, legendEl, chipsEl, headerEl }), [expanded, setExporter, legendEl, chipsEl, headerEl]);
  return { frame, exporterRef, setLegendEl, setChipsEl, setHeaderEl };
}

const FRAME_EXPANDED: FrameCtx = { expanded: true, setExporter: () => {}, legendEl: null, chipsEl: null, headerEl: null };

async function exportPng(exporter: Exporter | null, body: HTMLElement | null, useHtml: boolean, name: string) {
  let url: string | null = null;
  if (exporter) url = await exporter();
  if (!url && useHtml && body) {
    try {
      const { toPng } = await import("html-to-image");
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#ffffff";
      url = await toPng(body, { pixelRatio: 2, backgroundColor: bg, cacheBust: true });
    } catch {
      url = null;
    }
  }
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.png`;
  a.click();
}

// ─── Encabezado ──────────────────────────────────────────────────────────────
function CardHeader({
  id,
  title,
  subtitle,
  eyebrow,
  badges,
  extra,
  menu,
  fetching,
  slotRef,
  chipsRef,
}: {
  id: string;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  badges?: ReactNode;
  extra?: ReactNode;
  menu: ReactNode;
  fetching: boolean;
  slotRef?: (el: HTMLDivElement | null) => void;
  /** Sin franja de leyenda en la fila: los chips de calidad van aquí, a la izquierda del menú ⋯. */
  chipsRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <header className="dash-card-header mb-3 flex min-h-11 flex-wrap items-start gap-x-2 gap-y-2">
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{eyebrow}</p>}
        <div className="flex min-w-0 items-center gap-2">
          <h3 id={id} title={title} className="dash-card-title text-[15px] font-bold leading-snug">
            {title}
          </h3>
          {badges}
        </div>
        {subtitle && (
          <p title={subtitle} className="dash-card-subtitle mt-0.5 text-xs text-muted">
            {subtitle}
          </p>
        )}
      </div>
      {fetching && <Loader2 className="mt-2 size-4 shrink-0 animate-spin text-faint" aria-label="Actualizando" />}
      {menu}
      {(extra || slotRef || chipsRef) && (
        <div className="dash-card-controls flex min-w-0 max-w-full shrink-0 items-center gap-1.5 empty:hidden">
          {extra}
          {slotRef && <div ref={slotRef} className="flex min-w-0 items-center gap-1.5 empty:hidden" />}
          {chipsRef && <div ref={chipsRef} className="ml-auto flex shrink-0 items-center gap-1.5 empty:hidden" />}
        </div>
      )}
    </header>
  );
}

/** Clave de comparación de rótulos: sin tildes, sin mayúsculas ni espacios extremos. */
const navKey = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/** El eyebrow de la tarjeta héroe sobra si repite el de su sección ("TERRITORIO" / "TERRITORIO"). */
function heroEyebrow(hero: boolean | undefined, eyebrow: string | undefined, sectionNav: string | undefined): string | undefined {
  if (!hero || !eyebrow) return undefined;
  return sectionNav && navKey(sectionNav) === navKey(eyebrow) ? undefined : eyebrow;
}

function WidgetBadges({ widget, sectionNav }: { widget: WidgetDef; sectionNav?: string }) {
  // "Año en curso" sobra si la sección ya se llama así; si no, rótulo en muted (es un alcance, no un estado)
  const ytd = widget.type === "monthly" && widget.scope === "ytd" && !(sectionNav && navKey(sectionNav) === "ano en curso");
  return (
    <>
      {ytd && <span className="whitespace-nowrap text-[11px] font-semibold text-muted">Año en curso</span>}
      {widget.provisional && (
        <Tooltip content="Fórmula provisional: pendiente de validación con negocio." focusable>
          <Badge tone="warning" icon={<FlaskConical className="size-3" />}>
            Provisional
          </Badge>
        </Tooltip>
      )}
      {widget.note && (
        <Tooltip content={widget.note} focusable>
          <Info className="size-4 shrink-0 text-muted" aria-label="Nota" />
        </Tooltip>
      )}
    </>
  );
}

// ─── Cuerpo ──────────────────────────────────────────────────────────────────
export function WidgetBody({ widget, height, span, expanded }: { widget: WidgetDef; height: number; span: number; expanded?: boolean }) {
  const { data, isError, refetch } = useDashboard();
  const result = data?.widgets[widget.id];
  if (isError && !result) return <VizError onRetry={refetch} />;
  if (!result) return <VizSkeleton viz={resolveViz(widget)} />;
  if (isEmptyResult(result)) return <VizEmpty note={widget.note} />;
  return <WidgetRenderer widget={widget} result={result} height={height} span={span} expanded={expanded} />;
}

// ─── Tarjeta de widget (v2) ──────────────────────────────────────────────────
export interface WidgetCardProps {
  widget: WidgetDef;
  span: number;
  tier: Tier;
  /** La fila reserva la franja de leyenda de 24 px. */
  legendStrip: boolean;
  /** Subtarjeta de un StackCell (sin franja). */
  stacked?: boolean;
  /** Pestañas: widgets alternativos que comparten la tarjeta. */
  tabs?: WidgetDef[];
  tabsTitle?: string;
  tabsSubtitle?: string;
  /** Eyebrow de la sección (section.nav): la tarjeta no lo repite. */
  sectionNav?: string;
  className?: string;
}

export function WidgetCard({ widget: initial, span, tier, legendStrip, stacked, tabs, tabsTitle, tabsSubtitle, sectionNav, className }: WidgetCardProps) {
  const { data, isFetching, meta } = useDashboard();
  const { ref, inView } = useInView<HTMLElement>("200px");
  const [activeId, setActiveId] = useState(initial.id);
  const widget = tabs?.find((w) => w.id === activeId) ?? initial;
  const [expanded, setExpanded] = useState(false);
  const [tableIdx, setTableIdx] = useState<number | null>(null);
  const [bodyEl, setBodyEl] = useState<HTMLElement | null>(null);
  const { frame, exporterRef, setLegendEl, setChipsEl, setHeaderEl } = useFrame(false);
  const result = data?.widgets[widget.id];
  const viz = result ? effectiveViz(widget, result) : resolveViz(widget);
  const strip = legendStrip && !stacked;
  const height = tierBody(tier, strip, stacked);
  const hero = Boolean(widget.hero);
  const refetching = isFetching && Boolean(data);
  const titleId = `w-${widget.id}`;
  const name = `${widget.id}`;
  const title = tabs ? (tabsTitle ?? widget.title) : widget.title;
  const subtitle = tabs ? (tabsSubtitle ?? widget.subtitle) : widget.subtitle;

  // En tarjetas angostas (≤ 600 px) el tablist baja a su propia línea y reparte el ancho (globals.css: .dash-tabs)
  const tabControl = tabs && (
    <div role="tablist" aria-label={title} className="dash-tabs inline-flex max-w-full overflow-x-auto rounded-full border border-border bg-surface-2 p-0.5">
      {tabs.map((w) => (
        <button
          key={w.id}
          type="button"
          role="tab"
          aria-selected={w.id === widget.id}
          onClick={() => setActiveId(w.id)}
          className={cn("whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition", w.id === widget.id ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text")}
        >
          {w.title}
        </button>
      ))}
    </div>
  );

  return (
    <article
      ref={ref}
      data-viz={viz}
      aria-labelledby={titleId}
      className={cn("dash-card", hero ? "card-hero" : "card", className)}
    >
      <CardHeader
        id={titleId}
        title={title}
        subtitle={subtitle}
        eyebrow={heroEyebrow(hero, widget.eyebrow, sectionNav)}
        badges={<WidgetBadges widget={widget} sectionNav={sectionNav} />}
        extra={tabControl}
        slotRef={setHeaderEl}
        chipsRef={strip ? undefined : setChipsEl}
        fetching={refetching}
        menu={
          <CardMenu
            title={title}
            sources={[{ widget, result }]}
            onExpand={() => setExpanded(true)}
            onTable={() => setTableIdx(0)}
            onPng={() => void exportPng(exporterRef.current, bodyEl, !CANVAS_VIZ.has(viz), `${meta.slug}_${name}`)}
          />
        }
      />
      {strip && (
        <div className="dash-legend">
          <div ref={setLegendEl} className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden" />
          <div ref={setChipsEl} className="flex shrink-0 items-center gap-1.5" />
        </div>
      )}
      <div ref={setBodyEl} className={cn("dash-body transition-opacity duration-300", refetching && "opacity-60")}>
        <WidgetFrameContext.Provider value={frame}>{inView ? <WidgetBody widget={widget} height={height} span={span} /> : <VizSkeleton viz={viz} />}</WidgetFrameContext.Provider>
      </div>

      <Dialog open={expanded} onClose={() => setExpanded(false)} title={title} className="max-w-[min(95vw,1400px)]">
        <div className="flex h-[min(86vh,900px)] flex-col p-5">
          <WidgetFrameContext.Provider value={FRAME_EXPANDED}>
            <div className="relative min-h-0 flex-1">
              <WidgetBody widget={widget} height={Math.round((typeof window !== "undefined" ? window.innerHeight : 800) * 0.62)} span={12} expanded />
            </div>
          </WidgetFrameContext.Provider>
        </div>
      </Dialog>
      <Dialog open={tableIdx !== null} onClose={() => setTableIdx(null)} title={`Datos · ${widget.title}`} className="max-w-4xl">
        {result && <DataTableView widget={widget} result={result} />}
      </Dialog>
    </article>
  );
}

// ─── Tarjeta compuesta (varios resultados en una sola tarjeta) ───────────────
export function CompositeCard({
  cell,
  widgets,
  span,
  tier,
  legendStrip,
  sectionNav,
}: {
  cell: CompositeCell;
  widgets: WidgetDef[];
  span: number;
  tier: Tier;
  legendStrip: boolean;
  sectionNav?: string;
}) {
  const { data, isFetching, isError, refetch } = useDashboard();
  const { ref, inView } = useInView<HTMLElement>("200px");
  const [expanded, setExpanded] = useState(false);
  const [tableIdx, setTableIdx] = useState<number | null>(null);
  const [bodyEl, setBodyEl] = useState<HTMLElement | null>(null);
  const { frame, exporterRef, setLegendEl, setChipsEl, setHeaderEl } = useFrame(false);
  const results = widgets.map((w) => data?.widgets[w.id]);
  const height = tierBody(tier, legendStrip);
  const refetching = isFetching && Boolean(data);
  const titleId = `c-${cell.id}`;
  const ready = results.every(Boolean);
  const body = (h: number, exp: boolean) =>
    isError && !ready ? <VizError onRetry={refetch} /> : !ready ? <VizSkeleton viz="heatmap" /> : <CompositeRenderer cell={cell} widgets={widgets} results={results} height={h} span={exp ? 12 : span} expanded={exp} />;
  const table = tableIdx !== null ? widgets[tableIdx] : null;
  const tableResult = tableIdx !== null ? results[tableIdx] : undefined;

  return (
    <article ref={ref} data-viz={cell.composite} aria-labelledby={titleId} className={cn("dash-card", cell.hero ? "card-hero" : "card")}>
      <CardHeader
        id={titleId}
        title={cell.title}
        subtitle={cell.subtitle}
        eyebrow={heroEyebrow(cell.hero, cell.eyebrow, sectionNav)}
        slotRef={setHeaderEl}
        chipsRef={legendStrip ? undefined : setChipsEl}
        fetching={refetching}
        badges={widgets.some((w) => w.provisional) ? <Badge tone="warning" icon={<FlaskConical className="size-3" />}>Provisional</Badge> : null}
        menu={
          <CardMenu
            title={cell.title}
            sources={widgets.map((w, i) => ({ widget: w, result: results[i] }))}
            onExpand={() => setExpanded(true)}
            onTable={(i) => setTableIdx(i)}
            onPng={() => void exportPng(exporterRef.current, bodyEl, true, cell.id)}
          />
        }
      />
      {legendStrip && (
        <div className="dash-legend">
          <div ref={setLegendEl} className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden" />
          <div ref={setChipsEl} className="flex shrink-0 items-center gap-1.5" />
        </div>
      )}
      <div ref={setBodyEl} className={cn("dash-body transition-opacity duration-300", refetching && "opacity-60")}>
        <WidgetFrameContext.Provider value={frame}>{inView ? body(height, false) : <VizSkeleton viz="heatmap" />}</WidgetFrameContext.Provider>
      </div>
      <Dialog open={expanded} onClose={() => setExpanded(false)} title={cell.title} className="max-w-[min(95vw,1400px)]">
        <div className="flex h-[min(86vh,900px)] flex-col p-5">
          <WidgetFrameContext.Provider value={FRAME_EXPANDED}>
            <div className="relative min-h-0 flex-1">{body(Math.round((typeof window !== "undefined" ? window.innerHeight : 800) * 0.62), true)}</div>
          </WidgetFrameContext.Provider>
        </div>
      </Dialog>
      <Dialog open={tableIdx !== null} onClose={() => setTableIdx(null)} title={`Datos · ${table?.title ?? ""}`} className="max-w-4xl">
        {table && tableResult && <DataTableView widget={table} result={tableResult} />}
      </Dialog>
    </article>
  );
}
