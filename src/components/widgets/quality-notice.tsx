"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import { Dialog } from "@/components/ui/dialog";
import type { BarTableResult, CategoryResult } from "@/dashboards/dto";
import type { BarTableWidget, BarWidget, DonutWidget, StatusTone } from "@/dashboards/types";
import { useElementSize } from "@/hooks/use-element-size";
import { cn } from "@/lib/cn";
import { isNeutral, normalizeLabel, resolveStatus, sortByFamily, TONE_VARS } from "@/lib/charts/semantic";
import { formatInt, formatPct } from "@/lib/format";
import { displayLabel } from "@/lib/labels";
import { canFilterLabel, useCrossFilter, useMergedRef, usePageWide } from "./category-tiles";
import { StatusIcon } from "./kit/status-icon";
import type { VizProps } from "./types";

interface Item {
  label: string;
  value: number;
}

/** Filas de un resultado de categoría o de una bartable de una columna. */
function toItems(result: CategoryResult | BarTableResult): { items: Item[]; total: number } {
  if (result.kind === "bartable") {
    const items = result.rows.map((r) => ({ label: r.cells.join(" · "), value: r.value }));
    return { items, total: result.total || items.reduce((a, b) => a + b.value, 0) };
  }
  const items = result.labels.map((label, i) => ({ label, value: result.values[i] ?? 0 }));
  return { items, total: result.total || items.reduce((a, b) => a + b.value, 0) };
}

/** "Macro motivos" → "macro motivo" · "Canales de radicación" → "canal de radicación". */
function singularNoun(title: string): string {
  const words = title.trim().split(/\s+/);
  let plural = true;
  return words
    .map((w, i) => {
      const lower = i === 0 || !/^[A-ZÁÉÍÓÚÑ]{2,}$/.test(w) ? w.toLocaleLowerCase("es-CO") : w;
      if (["de", "del", "por", "con", "en", "para", "según"].includes(lower)) plural = false;
      if (!plural) return lower;
      if (/[^aeiouáéíóú]es$/.test(lower) && /(l|r|n|d|j)es$/.test(lower)) return lower.slice(0, -2);
      if (lower.endsWith("s") && lower.length > 3) return lower.slice(0, -1);
      return lower;
    })
    .join(" ");
}

/** Frase del neutral ("sin macro motivo", "sin cruce con PQRD") y del complemento ("cruzan con PQRD"). */
function phrases(label: string, title: string): { without: string; with: string } {
  const neutralLabel = label.replace(/^\s*\d{1,2}\.\s*/, "");
  const n = normalizeLabel(neutralLabel);
  if (n.startsWith("sin cruce")) {
    const rest = neutralLabel.replace(/^\s*sin cruce\s*/i, "");
    return { without: `sin cruce ${rest}`.trim(), with: `cruzan ${rest}`.trim() };
  }
  if (n.startsWith("sin ")) {
    const rest = neutralLabel.replace(/^\s*sin\s+/i, "");
    return { without: `sin ${rest.toLocaleLowerCase("es-CO")}`, with: `con ${rest.toLocaleLowerCase("es-CO")}` };
  }
  const noun = singularNoun(title);
  return { without: `sin ${noun}`, with: `con ${noun}` };
}

const upperFirst = (t: string) => t.charAt(0).toLocaleUpperCase("es-CO") + t.slice(1);

/** Alto aproximado de una fila de la mini lista (1 o 2 líneas de 16 px). */
function rowHeight(label: string, width: number): number {
  const chars = Math.max(12, Math.floor((width - 64) / 6.4));
  return label.length > chars ? 36 : 22;
}

/**
 * DataQualityNotice: reemplaza la gráfica cuando lo neutral es ≥ 85 % del widget.
 * AlertTriangle en warning-ink, cifra grande del neutral ("97,8 % sin macro motivo · 978 de 1.000"),
 * barra 100 % de 10 px (con dato en chart-1 · sin dato en neutral-mark), una línea de explicación
 * (widget.note) y, anclado al pie, las categorías reales principales con "Ver las N" (solo si hay más
 * de las que se ven). Variante status (qualityVariant, o widget con familia semántica): mini StatusStrip
 * de los registros con dato; sin ninguno, los estados declarados (widget.order) en 0, sin repetir la frase.
 * Conserva "Ver datos" y CSV (menú de la tarjeta) con todas las categorías.
 */
export function DataQualityNotice({ widget, result, height }: VizProps<BarWidget | DonutWidget | BarTableWidget, CategoryResult | BarTableResult>) {
  const { spec } = useDashboard();
  const cf = useCrossFilter(widget);
  const { ref: sizeRef, width, measured } = useElementSize<HTMLDivElement>();
  const { ref: pageRef, wide } = usePageWide();
  const ref = useMergedRef(sizeRef, pageRef);
  const [open, setOpen] = useState(false);
  const variant = widget.vizOptions?.qualityVariant ?? (widget.semantic ? "status" : "list");

  const model = useMemo(() => {
    const { items, total } = toItems(result);
    // Neutral "sin dato" (No reporta, Sin …); "Otros" no es ausencia de dato y va con las reales al final.
    const noData = items.filter((it) => isNeutral(it.label) && canFilterLabel(it.label)).sort((a, b) => b.value - a.value);
    const others = items.filter((it) => isNeutral(it.label) && !canFilterLabel(it.label));
    const real = items.filter((it) => !isNeutral(it.label)).sort((a, b) => b.value - a.value);
    const neutral = noData.reduce((a, b) => a + b.value, 0);
    return { items, total, noData, others, real, neutral, main: noData[0]?.label ?? "No reporta" };
  }, [result]);

  const { without, with: withText } = phrases(model.main, widget.title);
  const share = model.total ? model.neutral / model.total : 0;
  const unit = spec.unit?.plural;
  const withData = model.total - model.neutral;
  const w = measured ? width : 480;

  // Capacidad de la mini lista según el presupuesto del cuerpo (escritorio) y el ancho medido
  // En celdas angostas de alto fijo la nota se omite (sigue en el ícono (i) del header de la tarjeta)
  const showNote = Boolean(widget.note) && (!wide || w >= 400);
  const noteH = showNote ? ((widget.note?.length ?? 0) * 6.2 > w ? 42 : 26) : 0;
  const headH = (w < 420 ? 52 : 36) + COVERAGE_H;
  const budget = height > 0 && wide ? height - headH - noteH - 36 : Infinity;
  const visible: Item[] = [];
  let used = 0;
  for (const it of [...model.real, ...model.others]) {
    if (visible.length >= 3) break;
    const h = rowHeight(displayLabel(it.label, widget.labelKind).full, w);
    if (visible.length > 0 && used + h > budget) break;
    visible.push(it);
    used += h;
  }
  const allCount = model.real.length + model.others.length + model.noData.length;
  // "Ver las N" solo si hay categorías con dato que no se ven (el neutral ya lo dice el titular)
  const moreHidden = model.real.length + model.others.length > visible.length;

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col" role="group" aria-label={`Aviso de calidad de dato: ${widget.title}`}>
      {/* Titular: el neutral domina */}
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning-soft">
          <AlertTriangle className="size-[18px] text-warning-ink" aria-hidden />
        </span>
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 leading-tight">
          <span className="tabular text-[26px] font-bold tracking-tight text-text">{formatPct(share)}</span>
          <span className="text-sm font-semibold text-text">{without}</span>
          <span className="tabular text-xs text-muted">
            · {formatInt(model.neutral)} de {formatInt(model.total)}
            {unit ? ` ${unit}` : ""}
          </span>
        </p>
      </div>

      <CoverageBar withData={withData} total={model.total} withText={withText} without={without} />

      {showNote && <p className="mt-2.5 line-clamp-2 text-xs leading-4 text-text-2">{widget.note}</p>}

      {variant === "status" && widget.semantic ? (
        <StatusMini widget={widget} real={model.real} withText={withText} cf={cf} />
      ) : (
        <div className="mt-auto flex min-h-0 flex-col pt-3">
          <div className="flex h-5 items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
            <span className="truncate">
              {visible.length ? upperFirst(withText) : `Ningún registro ${withText}`}
            </span>
            {moreHidden && (
              <button type="button" onClick={() => setOpen(true)} className="-mr-1 inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold normal-case tracking-normal text-primary-text hover:bg-primary-soft">
                Ver las {formatInt(allCount)}
                <ChevronRight className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
          <ul className="mt-1 flex flex-col" aria-label={`Registros ${withText}`}>
            {visible.map((it) => (
              <QualityRow key={it.label} item={it} total={model.total} widget={widget} cf={cf} />
            ))}
          </ul>
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={`${widget.title} · todas las categorías`} className="max-w-2xl">
        <ul className="divide-y divide-border px-5 py-2" aria-label={`Todas las categorías de ${widget.title}`}>
          {[...model.real, ...model.others, ...model.noData].map((it) => (
            <QualityRow key={it.label} item={it} total={model.total} widget={widget} cf={cf} wide />
          ))}
        </ul>
      </Dialog>
    </div>
  );
}

function QualityRow({ item, total, widget, cf, wide }: { item: Item; total: number; widget: BarWidget | DonutWidget | BarTableWidget; cf: ReturnType<typeof useCrossFilter>; wide?: boolean }) {
  const name = displayLabel(item.label, widget.labelKind).full;
  const neutral = isNeutral(item.label);
  const sel = cf.isSelected(item.label);
  const body = (
    <>
      <span className={cn("min-w-0 flex-1 text-left leading-4", wide ? "" : "line-clamp-2", neutral ? "text-muted" : "text-text-2")}>{name}</span>
      <span className="tabular shrink-0 font-semibold text-text">{formatInt(item.value)}</span>
      <span className="tabular w-12 shrink-0 text-right text-muted">{formatPct(total ? item.value / total : 0)}</span>
    </>
  );
  return (
    <li className={cn(cf.isDimmed(item.label) && "opacity-45")}>
      {cf.can(item.label) ? (
        <button
          type="button"
          aria-pressed={sel}
          title={`${name} · clic para filtrar`}
          onClick={() => cf.toggle(item.label)}
          className={cn("-mx-1.5 flex min-h-[22px] w-[calc(100%+12px)] items-center gap-2 rounded-md px-1.5 py-[3px] text-xs transition hover:bg-surface-3", wide && "py-2 text-[13px]", sel && "bg-primary-soft ring-1 ring-primary")}
        >
          {body}
        </button>
      ) : (
        <span className={cn("flex min-h-[22px] items-center gap-2 py-[3px] text-xs", wide && "py-2 text-[13px]")}>{body}</span>
      )}
    </li>
  );
}

/** Alto de la barra de cobertura (mt-3 + 10 px). */
const COVERAGE_H = 22;

/** Barra 100 % de 10 px: registros con dato (chart-1) frente a sin dato (neutral-mark). */
function CoverageBar({ withData, total, withText, without }: { withData: number; total: number; withText: string; without: string }) {
  const share = total ? withData / total : 0;
  return (
    <div
      role="img"
      aria-label={`${formatInt(withData)} ${withText} (${formatPct(share)}); ${formatInt(total - withData)} ${without}`}
      className="mt-3 flex h-2.5 w-full shrink-0 gap-[2px] overflow-hidden rounded-full"
    >
      {withData > 0 && <span className="block h-full rounded-l-full" style={{ flexGrow: withData, flexBasis: 0, minWidth: 4, background: "var(--chart-1)" }} title={`${upperFirst(withText)}: ${formatInt(withData)}`} />}
      {total - withData > 0 && (
        <span
          className={cn("block h-full rounded-r-full", withData <= 0 && "rounded-l-full")}
          style={{ flexGrow: total - withData, flexBasis: 0, background: "var(--neutral-mark)" }}
          title={`${upperFirst(without)}: ${formatInt(total - withData)}`}
        />
      )}
    </div>
  );
}

/**
 * Mini StatusStrip de los registros con dato: barra de 8 px en los tonos de la familia + chips.
 * Sin registros con dato: los estados declarados (widget.order) en 0, atenuados, en vez de repetir el titular.
 */
function StatusMini({ widget, real, withText, cf }: { widget: BarWidget | DonutWidget | BarTableWidget; real: Item[]; withText: string; cf: ReturnType<typeof useCrossFilter> }) {
  const family = widget.semantic!;
  const overrides = widget.vizOptions?.overrides;
  const declared = widget.type === "bar" || widget.type === "donut" ? (widget.order ?? []) : [];
  const present = new Set(real.map((it) => normalizeLabel(it.label)));
  const withAny = real.some((it) => it.value > 0);
  // Estados declarados sin casos: solo cuando no hay ninguno con dato (con dato, la tira muestra los reales)
  const zeros = withAny ? [] : declared.filter((l) => !isNeutral(l) && !present.has(normalizeLabel(l))).map((label) => ({ label, value: 0 }));
  const parts = sortByFamily([...real, ...zeros], (x) => x.label, family, overrides).map((it) => {
    const st = resolveStatus(it.label, family, overrides);
    const tone: StatusTone = st?.tone ?? "neutral";
    return { ...it, tone, display: st?.display ?? displayLabel(it.label, widget.labelKind).full, color: st?.color ?? TONE_VARS[tone].solid };
  });
  const sum = parts.reduce((a, b) => a + b.value, 0);
  return (
    <div className="mt-auto flex min-h-0 flex-col pt-3">
      <p className="flex h-5 items-center text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
        <span className="truncate">{sum > 0 ? upperFirst(withText) : `${upperFirst(withText)} · por estado`}</span>
      </p>
      {sum > 0 && (
        <div className="mt-1.5 flex h-2 w-full gap-[2px]" role="img" aria-label={parts.map((p) => `${p.display}: ${formatInt(p.value)}`).join(", ")}>
          {parts
            .filter((p) => p.value > 0)
            .map((p, i, arr) => (
              <span
                key={p.label}
                title={`${p.display}: ${formatInt(p.value)}`}
                className={cn("block h-2", i === 0 && "rounded-l-full", i === arr.length - 1 && "rounded-r-full", cf.isDimmed(p.label) && "opacity-45")}
                style={{ flexGrow: p.value, flexBasis: 0, minWidth: 3, background: p.color }}
              />
            ))}
        </div>
      )}
      {sum > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`Estados ${withText}`}>
          {parts.map((p) => {
            const sel = cf.isSelected(p.label);
            const body = (
              <>
                <StatusIcon tone={p.tone} className="size-3" />
                <span className="text-text-2">{p.display}</span>
                <span className="tabular font-semibold text-text">{formatInt(p.value)}</span>
              </>
            );
            return (
              <li key={p.label} className={cn(cf.isDimmed(p.label) && "opacity-45")}>
                {cf.can(p.label) && p.value > 0 ? (
                  <button
                    type="button"
                    aria-pressed={sel}
                    title="Clic para filtrar"
                    onClick={() => cf.toggle(p.label)}
                    className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 text-xs transition hover:bg-surface-3", sel && "border-primary bg-primary-soft")}
                  >
                    {body}
                  </button>
                ) : (
                  <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 text-xs">{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        // Estados en 0: una línea compacta en neutral (el ícono conserva la forma del estado)
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] leading-5 text-muted" aria-label={`Estados ${withText}: ninguno`}>
          {parts.map((p) => (
            <li key={p.label} className="inline-flex items-center gap-1 whitespace-nowrap">
              <StatusIcon tone={p.tone} className="size-3 opacity-60" />
              {p.display}
              <span className="tabular font-semibold text-text-2">0</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
