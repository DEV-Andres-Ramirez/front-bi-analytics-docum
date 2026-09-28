"use client";

import { motion } from "motion/react";
import { useEffect, useMemo } from "react";
import { SectionLegend } from "@/components/widgets/kit/chart-legend";
import type { CellRef, RowDef, SectionDef, WidgetDef } from "@/dashboards/types";
import { cellKey, packRows, rowHasLegendStrip, templateSpans, templateSpansMd, validateLayout } from "@/dashboards/layout";
import { cn } from "@/lib/cn";
import { useDashboard } from "./dashboard-context";
import { CompositeCard, WidgetCard } from "./widget-card";

/**
 * Sección de tablero: SectionHeader (eyebrow = nav, H2 = question) + filas con plantilla cerrada.
 * Cada fila suma 12 y sus celdas comparten el alto del tier (globals.css: .dash-row).
 */
export function SectionHeader({ section, index }: { section: SectionDef; index: number }) {
  const eyebrow = section.nav;
  const heading = section.question ?? section.title;
  if (!heading && !eyebrow) return null;
  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay: Math.min(0.02 * index, 0.12) }}
      className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between"
    >
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 pl-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{eyebrow}</p>}
        {heading && (
          <h2 id={`s-${section.id}`} className="flex items-center gap-2.5 text-xl font-bold tracking-tight">
            <span className="h-5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
            <span className="text-balance">{heading}</span>
          </h2>
        )}
        {section.description && <p className="mt-1 max-w-3xl pl-4 text-sm text-muted">{section.description}</p>}
      </div>
      {section.legend && section.legend.length > 0 && (
        <div className="shrink-0 pl-4 lg:pl-0">
          <SectionLegend items={section.legend} />
        </div>
      )}
    </motion.header>
  );
}

function Cell({
  cell,
  widgets,
  span,
  spanMd,
  row,
  strip,
  sectionNav,
  soloMd,
}: {
  cell: CellRef;
  widgets: Map<string, WidgetDef>;
  span: number;
  spanMd: number;
  row: RowDef;
  strip: boolean;
  sectionNav?: string;
  /** A 6 columnas la celda queda sola en su línea (globals.css › data-md-solo: sin aire del tier). */
  soloMd: boolean;
}) {
  const style = { "--span": span, "--span-md": spanMd } as React.CSSProperties;
  const solo = soloMd ? "1" : undefined;
  if (typeof cell === "string") {
    const w = widgets.get(cell);
    return (
      <div className="dash-cell" style={style} data-md-solo={solo}>
        {w ? <WidgetCard widget={w} span={span} tier={row.tier} legendStrip={strip} sectionNav={sectionNav} /> : <MissingCell id={cell} />}
      </div>
    );
  }
  if ("stack" in cell) {
    return (
      <div className="dash-cell" style={style}>
        <div className="dash-stack h-full" data-ratio={cell.ratio ?? "1:1"}>
          {cell.stack.map((id) => {
            const w = widgets.get(id);
            return w ? <WidgetCard key={id} widget={w} span={span} tier={row.tier} legendStrip={false} stacked /> : <MissingCell key={id} id={id} />;
          })}
        </div>
      </div>
    );
  }
  if ("composite" in cell) {
    const ws = cell.widgets.map((id) => widgets.get(id)).filter((w): w is WidgetDef => Boolean(w));
    return (
      <div className="dash-cell" style={style} data-md-solo={solo}>
        <CompositeCard cell={cell} widgets={ws} span={span} tier={row.tier} legendStrip={strip} sectionNav={sectionNav} />
      </div>
    );
  }
  const ws = cell.tabs.map((id) => widgets.get(id)).filter((w): w is WidgetDef => Boolean(w));
  if (!ws.length) return <MissingCell id={cell.id} />;
  return (
    <div className="dash-cell" style={style} data-md-solo={solo}>
      <WidgetCard widget={ws[0]} tabs={ws} tabsTitle={cell.title} tabsSubtitle={cell.subtitle} span={span} tier={row.tier} legendStrip={strip} sectionNav={sectionNav} />
    </div>
  );
}

function MissingCell({ id }: { id: string }) {
  return <div className="dash-layout-error card grid place-items-center p-4 text-xs text-critical-ink">Widget inexistente: {id}</div>;
}

export function DashboardRow({ row, widgets, sectionNav }: { row: RowDef; widgets: Map<string, WidgetDef>; sectionNav?: string }) {
  const spans = templateSpans(row.template);
  const spansMd = templateSpansMd(row.template);
  const strip = rowHasLegendStrip(row, widgets);
  const invalid = spans.length !== row.cells.length;
  // En tablet (600–839 px) estas celdas se apilan a ancho completo: la franja de leyenda vacía sobra (globals.css)
  const mdStacked = spansMd.every((s) => s >= 6);
  // Celdas que a 6 columnas van solas en su línea sin serlo a 12 (en "12" el alto del tier es el de diseño)
  const soloMd = spansMd.map((s) => row.template !== "12" && s >= 6);
  return (
    <div className={cn("dash-row", invalid && "dash-layout-error")} data-t={row.template} data-tier={row.tier} data-md-stack={mdStacked ? "1" : undefined}>
      {row.cells.map((cell, i) => (
        <Cell key={cellKey(cell, i)} cell={cell} widgets={widgets} span={spans[i] ?? 12} spanMd={spansMd[i] ?? 6} row={row} strip={strip} sectionNav={sectionNav} soloMd={soloMd[i] ?? false} />
      ))}
    </div>
  );
}

export function DashboardSection({ section, index }: { section: SectionDef; index: number }) {
  const widgets = useMemo(() => new Map(section.widgets.map((w) => [w.id, w] as const)), [section.widgets]);
  const rows = useMemo(() => section.rows ?? packRows(section), [section]);
  return (
    <section id={section.id} aria-labelledby={section.question || section.title ? `s-${section.id}` : undefined} className="dash-section">
      <SectionHeader section={section} index={index} />
      <div className="flex flex-col gap-[var(--row-gap)]">
        {rows.map((row, i) => (
          <DashboardRow key={i} row={row} widgets={widgets} sectionNav={section.nav} />
        ))}
      </div>
    </section>
  );
}

/** En desarrollo: valida el layout del tablero una vez y reporta en consola. */
export function useLayoutCheck() {
  const { spec } = useDashboard();
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const issues = validateLayout(spec);
    for (const i of issues) {
      if (i.level === "error") console.error(`[layout ${spec.slug}] ${i.where}: ${i.message}`);
    }
  }, [spec]);
}
