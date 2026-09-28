"use client";

import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import type { BarTableResult } from "@/dashboards/dto";
import type { BarTableWidget, StatusTone } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { isNeutral, resolveStatus, statusDisplay, TONE_VARS } from "@/lib/charts/semantic";
import { DAY_MS, formatDayShort, isoToMs, todayISO } from "@/lib/dates";
import { formatCOP, formatInt, formatValue, nf1 } from "@/lib/format";
import { displayLabel } from "@/lib/labels";
import { StatusIcon } from "./kit/status-icon";
import { MoreButton } from "./list-kit";
import { EDGE_B, EDGE_T, useScrollEdges } from "./table-scroll";
import type { VizProps } from "./types";

/**
 * ResolutionTable (BarTable v2, docs/ui-design-system.md › "ResolutionTable").
 * Resoluciones DIAN de facturación: una fila por resolución (vigencia y rango de consecutivos)
 * con sus combinaciones documento × estado y el valor neto. table-layout fixed: la columna de
 * valor (barra de 80–160 px + cifra de 96 px) nunca se recorta. Las resoluciones vacías o de relleno
 * (99999999999999) se agrupan al final bajo "Sin resolución válida" con la nota visible.
 * Fechas y rangos no se parten a mitad (el único corte posible es la flecha o la etiqueta).
 * Tarjetas por debajo de 740 px de contenedor: alto por contenido (sin scroll anidado) y cada
 * resolución con más de 3 combinaciones se pliega tras "Ver N más".
 */

const FIELDS = {
  estado: "estado",
  nro: "nro_resolucion",
  inicio: "fecha_inicio",
  fin: "fecha_fin",
  desde: "consecutivo_inicial",
  hasta: "consecutivo_final",
  doc: "tipo_documento",
} as const;
type FieldKey = keyof typeof FIELDS;

const DOC_NAMES: Record<string, string> = { FC: "Factura de venta", NC: "Nota crédito", ND: "Nota débito" };
const DEFAULT_NOTE = "Resoluciones vacías o con el valor de relleno 99999999999999, que llega desde la fuente en facturas inconsistentes.";
/** Combinaciones visibles por tarjeta antes de "Ver N más". */
const CARD_LINES = 3;

interface ResLine {
  estado: string;
  doc: string;
  value: number;
}

interface ResGroup {
  key: string;
  nro: string;
  inicio: string | null;
  fin: string | null;
  desde: number | null;
  hasta: number | null;
  /** Vacía ("No reporta") o de relleno (9999…). */
  invalid: boolean;
  missing: boolean;
  lines: ResLine[];
  total: number;
}

const isoOrNull = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
const intOrNull = (s: string | undefined) => {
  const t = (s ?? "").trim();
  return /^\d+$/.test(t) ? Number(t) : null;
};
const isFiller = (nro: string) => /^9{8,}$/.test(nro.trim());

function buildGroups(widget: BarTableWidget, result: BarTableResult) {
  const idx = Object.fromEntries((Object.keys(FIELDS) as FieldKey[]).map((k) => [k, widget.columns.findIndex((c) => c.field === FIELDS[k])])) as Record<FieldKey, number>;
  const cell = (cells: string[], k: FieldKey) => (idx[k] >= 0 ? (cells[idx[k]] ?? "") : "");
  const map = new Map<string, ResGroup>();
  for (const r of result.rows) {
    const nro = cell(r.cells, "nro").trim();
    const missing = !nro || isNeutral(nro);
    const key = [nro, cell(r.cells, "inicio"), cell(r.cells, "fin"), cell(r.cells, "desde"), cell(r.cells, "hasta")].join("\u0001");
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        nro,
        inicio: isoOrNull(cell(r.cells, "inicio")),
        fin: isoOrNull(cell(r.cells, "fin")),
        desde: intOrNull(cell(r.cells, "desde")),
        hasta: intOrNull(cell(r.cells, "hasta")),
        invalid: missing || isFiller(nro),
        missing,
        lines: [],
        total: 0,
      };
      map.set(key, g);
    }
    g.lines.push({ estado: cell(r.cells, "estado"), doc: cell(r.cells, "doc").trim(), value: r.value });
    g.total += r.value;
  }
  const groups = [...map.values()];
  for (const g of groups) g.lines.sort((a, b) => b.value - a.value);
  groups.sort((a, b) => b.total - a.total);
  return { valid: groups.filter((g) => !g.invalid), invalid: groups.filter((g) => g.invalid), known: idx.nro >= 0 };
}

/** Una sola unidad COP para toda la tabla ("M" desde un millón). */
function copFormatter(max: number) {
  const [div, suffix] = max >= 1e6 ? [1e6, " M"] : max >= 1e4 ? [1e3, " mil"] : [1, ""];
  const nf = div === 1 ? new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }) : nf1;
  return (n: number) => `$ ${nf.format(n / div)}${suffix}`;
}

// ─── Piezas ──────────────────────────────────────────────────────────────────
function EstadoBadge({ estado }: { estado: string }) {
  const st = resolveStatus(estado, "factura");
  const tone: StatusTone = st?.tone ?? "neutral";
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: TONE_VARS[tone].soft, color: TONE_VARS[tone].ink }}>
      <StatusIcon tone={tone} className="size-3" />
      {st?.display ?? statusDisplay(estado)}
    </span>
  );
}

function DocChip({ doc }: { doc: string }) {
  const code = doc && !isNeutral(doc) ? doc.toUpperCase() : "—";
  return (
    <span title={DOC_NAMES[code] ?? displayLabel(doc).full} className="inline-flex h-6 min-w-9 items-center justify-center rounded-md border border-border bg-surface-2 px-1.5 font-mono text-[11px] font-bold text-text-2">
      {code}
      <span className="sr-only"> ({DOC_NAMES[code] ?? "sin tipo"})</span>
    </span>
  );
}

function Timeline({ start, end, today }: { start: number; end: number; today: number }) {
  const span = end - start;
  const p = span > 0 ? Math.min(1, Math.max(0, (today - start) / span)) : 1;
  const inRange = today >= start && today <= end;
  return (
    <span className="relative mt-1.5 block h-1 w-20 shrink-0 rounded-full bg-surface-3" aria-hidden>
      <span className="absolute inset-y-0 left-0 rounded-full bg-neutral-mark" style={{ width: `${p * 100}%` }} />
      {inRange && <span className="absolute -top-[3px] h-2.5 w-0.5 -translate-x-1/2 rounded-full bg-text" style={{ left: `${p * 100}%` }} />}
    </span>
  );
}

function Remaining({ start, end, today }: { start: number; end: number; today: number }) {
  if (today > end)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-critical-ink">
        <StatusIcon tone="critical" className="size-3" /> Vencida
      </span>
    );
  if (today < start) return <span className="text-[11px] text-muted">Inicia en {formatInt(Math.round((start - today) / DAY_MS))} días</span>;
  const left = Math.round((end - today) / DAY_MS);
  if (left <= 90)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning-ink">
        <StatusIcon tone="warning" className="size-3" /> Vence en {formatInt(left)} {left === 1 ? "día" : "días"}
      </span>
    );
  return <span className="tabular text-[11px] text-muted">Quedan {formatInt(left)} días</span>;
}

function Vigencia({ g, today, muted }: { g: ResGroup; today: number; muted?: boolean }) {
  if (!g.inicio || !g.fin) return <span className="text-muted">—</span>;
  const start = isoToMs(g.inicio);
  const end = isoToMs(g.fin);
  return (
    <span className="block">
      {/* Cada fecha es indivisible: si no cabe en una línea, se parte en la flecha */}
      <span className={cn("tabular block text-[12.5px]", muted ? "text-muted" : "text-text-2")}>
        <span className="whitespace-nowrap">{formatDayShort(g.inicio)} →</span> <span className="whitespace-nowrap">{formatDayShort(g.fin)}</span>
      </span>
      {!muted && (
        <span className="flex flex-wrap items-center gap-x-2">
          <Timeline start={start} end={end} today={today} />
          <span className="mt-1 whitespace-nowrap">
            <Remaining start={start} end={end} today={today} />
          </span>
        </span>
      )}
    </span>
  );
}

function Rango({ g, muted, inline }: { g: ResGroup; muted?: boolean; inline?: boolean }) {
  if (g.desde === null || g.hasta === null) return <span className="text-muted">—</span>;
  return (
    <span className={cn("tabular block", inline ? "text-[11px]" : "text-[12.5px]", muted ? "text-muted" : "text-text-2")}>
      {inline && <span className="text-muted">Rango </span>}
      <span className="whitespace-nowrap">
        {formatInt(g.desde)} – {formatInt(g.hasta)}
      </span>
      {!inline && !muted && <span className="block text-[11px] text-muted">{formatInt(g.hasta - g.desde + 1)} consecutivos</span>}
    </span>
  );
}

function ResolucionLabel({ g, fmt, sub }: { g: ResGroup; fmt: (n: number) => string; sub: boolean }) {
  return (
    <span className="block min-w-0">
      {g.missing ? (
        <span className="block text-[12.5px] italic text-muted">Sin resolución</span>
      ) : (
        <span className={cn("block break-all font-mono text-[12.5px] font-semibold", g.invalid ? "text-muted" : "text-text")}>{g.nro}</span>
      )}
      {g.invalid && !g.missing && <span className="mt-0.5 inline-flex rounded-full bg-surface-3 px-1.5 text-[10.5px] font-semibold text-text-2">Relleno</span>}
      {sub && g.lines.length > 1 && <span className="tabular block text-[11px] text-muted">Subtotal {fmt(g.total)}</span>}
    </span>
  );
}

function ValueBar({ value, max, fmt, muted }: { value: number; max: number; fmt: (n: number) => string; muted?: boolean }) {
  return (
    <span className="flex items-center justify-end gap-2">
      {/* Barra de 80–160 px: la magnitud se lee sin robarle ancho a Vigencia y Rango */}
      <span className="h-2 min-w-20 max-w-40 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <span className="block h-full rounded-full" style={{ width: `${Math.max(1.5, (value / (max || 1)) * 100)}%`, background: muted ? "var(--neutral-mark)" : "var(--chart-2)" }} />
      </span>
      <span title={formatCOP(value, false)} className={cn("tabular w-24 shrink-0 whitespace-nowrap text-right text-[13px] font-semibold", muted ? "text-text-2" : "text-text")}>
        {fmt(value)}
      </span>
    </span>
  );
}

// ─── Vista ───────────────────────────────────────────────────────────────────
export function ResolutionTable({ widget, result, expanded }: VizProps<BarTableWidget, BarTableResult>) {
  const [today] = useState(() => isoToMs(todayISO()));
  const { ref: scrollRef, onScroll, dataAttrs } = useScrollEdges();
  const { valid, invalid, known } = useMemo(() => buildGroups(widget, result), [widget, result]);
  const fmt = useMemo(() => copFormatter(result.max), [result.max]);
  const note = widget.note ?? DEFAULT_NOTE;
  const invalidTotal = invalid.reduce((a, g) => a + g.total, 0);
  const combos = result.rows.length;

  if (!known) {
    // Spec sin columnas de resolución: tabla simple con barra (sin recortes).
    return (
      <div className={cn("min-h-0 overflow-auto", expanded ? "h-full" : "max-h-[640px]")}>
        <table className="w-full table-fixed border-separate border-spacing-0 text-[12.5px]" aria-label={widget.title}>
          <thead>
            <tr>
              {widget.columns.map((c) => (
                <th key={c.field} scope="col" className="sticky top-0 border-b border-border bg-surface px-3 pb-2 text-left text-[11px] font-bold text-text-2">
                  {c.label}
                </th>
              ))}
              <th scope="col" className="sticky top-0 w-[200px] border-b border-border bg-surface px-3 pb-2 text-right text-[11px] font-bold text-text-2">
                {widget.measureLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r, i) => (
              <tr key={i}>
                {r.cells.map((c, j) => (
                  <td key={j} className="break-words border-b border-[color:var(--hairline)] px-3 py-2 text-text-2">
                    {displayLabel(c).full}
                  </td>
                ))}
                <td className="border-b border-[color:var(--hairline)] px-3 py-2">
                  <ValueBar value={r.value} max={result.max} fmt={(n) => formatValue(n, widget.valueFormat ?? "int")} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const footer = (
    <span className="text-[12px] text-text-2">
      <span className="font-bold text-text">Total</span> · {formatInt(valid.length)} {valid.length === 1 ? "resolución válida" : "resoluciones válidas"} · {formatInt(combos)} {combos === 1 ? "combinación" : "combinaciones"}
    </span>
  );

  const invalidCount = invalid.reduce((a, g) => a + g.lines.length, 0);
  const th = "sticky top-0 z-10 border-b border-border bg-surface px-3 pb-2 text-left align-bottom text-[11px] font-bold text-text-2";

  // Tarjetas con contenedor < 740 px (alto por contenido); tabla desde 740 con tope de 640 px
  // y scroll interno (Rango como columna propia desde 940).
  return (
    <div className={cn("@container/rt min-h-0", expanded && "h-full")}>
      <div className={cn("flex min-h-0 flex-col", expanded ? "h-full" : "@min-[740px]/rt:max-h-[640px]")}>
        <div ref={scrollRef} onScroll={onScroll} {...dataAttrs} className="group/sc relative min-h-0 flex-1 overflow-auto overscroll-contain">
          <div className="flex flex-col gap-3 @min-[740px]/rt:hidden">
            <ResolutionCards groups={valid} max={result.max} fmt={fmt} today={today} />
            {invalid.length > 0 && (
              <section aria-label="Sin resolución válida" className="flex flex-col gap-2">
                <InvalidHeader total={invalidTotal} count={invalidCount} note={note} fmt={fmt} />
                <ResolutionCards groups={invalid} max={result.max} fmt={fmt} today={today} muted />
              </section>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
              {footer}
              <span className="tabular text-[13px] font-bold text-text" title={formatCOP(result.total, false)}>
                {fmt(result.total)}
              </span>
            </div>
          </div>

          <table className="hidden w-full table-fixed border-separate border-spacing-0 text-[12.5px] @min-[740px]/rt:table" aria-label={widget.title}>
            <thead>
              <tr>
                <th scope="col" className={cn(th, "w-[150px] @min-[940px]/rt:w-[172px]", EDGE_T)}>
                  Resolución
                </th>
                <th scope="col" className={cn(th, "w-14 @min-[940px]/rt:w-[88px]", EDGE_T)}>
                  <span className="@min-[940px]/rt:hidden" aria-hidden>
                    Doc.
                  </span>
                  <span className="sr-only @min-[940px]/rt:not-sr-only">Documento</span>
                </th>
                <th scope="col" className={cn(th, "w-[124px] @min-[940px]/rt:w-[136px]", EDGE_T)}>
                  Estado
                </th>
                <th scope="col" className={cn(th, "w-[188px] @min-[940px]/rt:w-[212px]", EDGE_T)}>
                  Vigencia
                </th>
                <th scope="col" className={cn(th, "hidden w-[156px] @min-[940px]/rt:table-cell", EDGE_T)}>
                  Rango de consecutivos
                </th>
                <th scope="col" className={cn(th, "text-right", EDGE_T)}>
                  {widget.measureLabel}
                </th>
              </tr>
            </thead>
            {valid.map((g) => (
              <GroupBody key={g.key} g={g} max={result.max} fmt={fmt} today={today} />
            ))}
            {invalid.length > 0 && (
              <tbody>
                <tr>
                  <th colSpan={4} scope="rowgroup" className="border-b border-border bg-surface-2 px-3 py-2 text-left font-normal">
                    <InvalidHeader count={invalidCount} note={note} fmt={fmt} />
                  </th>
                  <td className="hidden border-b border-border bg-surface-2 @min-[940px]/rt:table-cell" />
                  <td className="tabular border-b border-border bg-surface-2 px-3 py-2 text-right align-top text-[12px] font-semibold text-text-2" title={formatCOP(invalidTotal, false)}>
                    {fmt(invalidTotal)}
                  </td>
                </tr>
              </tbody>
            )}
            {invalid.map((g) => (
              <GroupBody key={g.key} g={g} max={result.max} fmt={fmt} today={today} muted />
            ))}
            <tfoot>
              <tr>
                <td colSpan={4} className={cn("sticky bottom-0 border-t border-border bg-surface px-3 py-2.5", EDGE_B)}>
                  {footer}
                </td>
                <td className={cn("sticky bottom-0 hidden border-t border-border bg-surface @min-[940px]/rt:table-cell", EDGE_B)} />
                <td className={cn("tabular sticky bottom-0 border-t border-border bg-surface px-3 py-2.5 text-right text-[13px] font-bold text-text", EDGE_B)} title={formatCOP(result.total, false)}>
                  {fmt(result.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function InvalidHeader({ total, count, note, fmt }: { total?: number; count: number; note: string; fmt: (n: number) => string }) {
  return (
    <span className="block">
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-[12px] font-bold text-text">
          Sin resolución válida{" "}
          <span className="font-normal text-muted">
            · {formatInt(count)} {count === 1 ? "combinación" : "combinaciones"}
          </span>
        </span>
        {total !== undefined && <span className="tabular text-[12px] font-semibold text-text-2">{fmt(total)}</span>}
      </span>
      <span className="mt-1 flex items-start gap-1.5 text-[11.5px] text-text-2">
        <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning-ink" aria-hidden />
        <span>{note}</span>
      </span>
    </span>
  );
}

function GroupBody({ g, max, fmt, today, muted }: { g: ResGroup; max: number; fmt: (n: number) => string; today: number; muted?: boolean }) {
  const n = g.lines.length;
  const cellCls = "border-b border-[color:var(--hairline)] px-3 py-2 align-middle transition-colors group-hover/res:bg-surface-2";
  const spanCls = "border-b border-border px-3 py-2.5 align-top transition-colors group-hover/res:bg-surface-2";
  return (
    <tbody className="group/res">
      {g.lines.map((l, i) => (
        <tr key={`${l.estado}-${l.doc}-${i}`}>
          {i === 0 && (
            <th rowSpan={n} scope="rowgroup" className={cn(spanCls, "text-left font-normal")}>
              <ResolucionLabel g={g} fmt={fmt} sub={!muted} />
              <span className="mt-1 block @min-[940px]/rt:hidden">
                <Rango g={g} muted={muted} inline />
              </span>
            </th>
          )}
          <td className={cn(cellCls, i === n - 1 && "border-border")}>
            <DocChip doc={l.doc} />
          </td>
          <td className={cn(cellCls, i === n - 1 && "border-border")}>
            <EstadoBadge estado={l.estado} />
          </td>
          {i === 0 && (
            <td rowSpan={n} className={spanCls}>
              <Vigencia g={g} today={today} muted={muted} />
            </td>
          )}
          {i === 0 && (
            <td rowSpan={n} className={cn(spanCls, "hidden @min-[940px]/rt:table-cell")}>
              <Rango g={g} muted={muted} />
            </td>
          )}
          <td className={cn(cellCls, i === n - 1 && "border-border")}>
            <ValueBar value={l.value} max={max} fmt={fmt} muted={muted} />
          </td>
        </tr>
      ))}
    </tbody>
  );
}

function ResolutionCards({ groups, max, fmt, today, muted }: { groups: ResGroup[]; max: number; fmt: (n: number) => string; today: number; muted?: boolean }) {
  return (
    <ul role="list" className="flex flex-col gap-2.5">
      {groups.map((g) => (
        <ResolutionCard key={g.key} g={g} max={max} fmt={fmt} today={today} muted={muted} />
      ))}
    </ul>
  );
}

function ResolutionCard({ g, max, fmt, today, muted }: { g: ResGroup; max: number; fmt: (n: number) => string; today: number; muted?: boolean }) {
  const [open, setOpen] = useState(false);
  const foldable = g.lines.length > CARD_LINES + 1;
  const lines = foldable && !open ? g.lines.slice(0, CARD_LINES) : g.lines;
  const hidden = g.lines.length - CARD_LINES;
  return (
    <li className={cn("rounded-xl border border-border p-3", muted && "bg-surface-2")}>
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold text-muted">Resolución</span>
          <ResolucionLabel g={g} fmt={fmt} sub={false} />
        </span>
        {g.lines.length > 1 && (
          <span className="shrink-0 text-right">
            <span className="block text-[11px] text-muted">Subtotal</span>
            <span className="tabular text-[13px] font-bold text-text">{fmt(g.total)}</span>
          </span>
        )}
      </div>
      {(g.inicio || g.desde !== null) && (
        <div className="mt-2 flex flex-col gap-1.5">
          {g.inicio && (
            <span className="block">
              <span className="block text-[11px] font-semibold text-muted">Vigencia</span>
              <Vigencia g={g} today={today} muted={muted} />
            </span>
          )}
          {g.desde !== null && <Rango g={g} muted={muted} inline />}
        </div>
      )}
      <ul role="list" className="mt-2.5 flex flex-col gap-2 border-t border-border pt-2.5">
        {lines.map((l, i) => (
          <li key={`${l.estado}-${l.doc}-${i}`} className="flex flex-col gap-1.5 @min-[480px]/rt:flex-row @min-[480px]/rt:items-center @min-[480px]/rt:justify-between @min-[480px]/rt:gap-4">
            <span className="flex shrink-0 flex-wrap items-center gap-1.5">
              <DocChip doc={l.doc} />
              <EstadoBadge estado={l.estado} />
            </span>
            <span className="block @min-[480px]/rt:w-64 @min-[480px]/rt:shrink-0">
              <ValueBar value={l.value} max={max} fmt={fmt} muted={muted} />
            </span>
          </li>
        ))}
      </ul>
      {foldable && (
        <div className="mt-2 flex justify-end">
          <MoreButton onClick={() => setOpen((v) => !v)} expanded={open}>
            {open ? "Ver menos" : `Ver ${formatInt(hidden)} ${hidden === 1 ? "combinación" : "combinaciones"} más`}
          </MoreButton>
        </div>
      )}
    </li>
  );
}
