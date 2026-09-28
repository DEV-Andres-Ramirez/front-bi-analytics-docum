"use client";

import { CircleDashed } from "lucide-react";
import { useMemo } from "react";
import type { CategoryResult } from "@/dashboards/dto";
import type { BarWidget, DonutWidget, StatusTone, VizOptions } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { isNeutral, normalizeLabel, resolveStatus, TONE_VARS } from "@/lib/charts/semantic";
import { formatInt, formatPct } from "@/lib/format";
import { displayLabel } from "@/lib/labels";
import { useCrossFilter, useHoverTip } from "./category-tiles";
import { ChartTooltip } from "./kit/chart-tooltip";
import { StatusIcon } from "./kit/status-icon";
import type { VizProps } from "./types";

interface Entry {
  label: string;
  display: string;
  value: number;
}

interface Family {
  label: string;
  tone: StatusTone;
  entries: Entry[];
  value: number;
}

/** Familias por defecto (familia semántica "fallo"; por validar con jurídica). */
const DEFAULT_FAMILIES: { label: string; tone: StatusTone }[] = [
  { label: "Favorable", tone: "good" },
  { label: "Desfavorable", tone: "critical" },
  { label: "Trámite o informativo", tone: "neutral" },
];

function buildFamilies(result: CategoryResult, widget: BarWidget | DonutWidget): { families: Family[]; noData: Entry[] } {
  const opts: VizOptions = widget.vizOptions ?? {};
  const family = widget.semantic ?? "fallo";
  const declared = opts.families;
  const defs = declared?.length ? declared.map((f) => ({ label: f.label, tone: f.tone })) : DEFAULT_FAMILIES;
  const members = new Map<string, number>();
  declared?.forEach((f, i) => f.members.forEach((m) => members.set(normalizeLabel(m), i)));

  const families: Family[] = defs.map((d) => ({ ...d, entries: [], value: 0 }));
  const noData: Entry[] = [];
  const extra: Family = { label: "Otros estados", tone: "neutral", entries: [], value: 0 };

  for (let i = 0; i < result.labels.length; i++) {
    const label = result.labels[i];
    const value = result.values[i] ?? 0;
    const entry: Entry = { label, value, display: opts.overrides?.[label]?.label ?? displayLabel(label, widget.labelKind).full };
    let idx = members.get(normalizeLabel(label));
    if (idx === undefined && isNeutral(label)) {
      noData.push({ ...entry, display: normalizeLabel(label) === "no reporta" ? "Sin dato" : entry.display });
      continue;
    }
    if (idx === undefined) {
      const group = resolveStatus(label, family, opts.overrides)?.group;
      const found = group ? families.findIndex((f) => normalizeLabel(f.label) === normalizeLabel(group)) : -1;
      if (found >= 0) idx = found;
    }
    const target = idx === undefined ? extra : families[idx];
    target.entries.push(entry);
    target.value += value;
  }
  if (extra.entries.length) families.push(extra);
  for (const f of families) f.entries.sort((a, b) => b.value - a.value);
  return { families, noData };
}

/**
 * FamilySplit (Tutelas · Estado del fallo): cabecera split por familias
 * (Favorable good · Desfavorable critical · Trámite o informativo neutral) con cifra de 28 px y %
 * sobre los registros con dato; barra 100 % de 8 px; "Sin dato" en nota; legend-table en 2 columnas
 * (filas de 20 px) agrupada por familia con TODOS los estados. Clic en un estado filtra la dimensión.
 */
export function FamilySplit({ widget, result }: VizProps<BarWidget | DonutWidget, CategoryResult>) {
  const cf = useCrossFilter(widget);
  const { state, bind } = useHoverTip();
  const { families, noData } = useMemo(() => buildFamilies(result, widget), [result, widget]);
  const known = families.reduce((a, f) => a + f.value, 0);
  const noDataSum = noData.reduce((a, e) => a + e.value, 0);
  const total = result.total || known + noDataSum;
  const withValue = families.filter((f) => f.value > 0);
  const heads = families.filter((f) => f.entries.length > 0 || DEFAULT_FAMILIES.some((d) => d.label === f.label));
  const rows = families.flatMap((f) => f.entries.map((e) => ({ ...e, tone: f.tone, family: f.label })));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Cabecera split */}
      <ul className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(1, heads.length)}, minmax(0, 1fr))` }} aria-label="Familias">
        {heads.map((f) => {
          const share = known ? f.value / known : 0;
          return (
            <li key={f.label} className="flex min-w-0 flex-col">
              <p className="flex min-w-0 items-start gap-1.5 text-[12.5px] font-semibold leading-4 text-text-2">
                <StatusIcon tone={f.tone} className="mt-px" />
                <span className="min-w-0">{f.label}</span>
              </p>
              <p className="@container mt-auto pt-1.5">
                <span className="flex flex-col gap-0.5 @min-[120px]:flex-row @min-[120px]:items-baseline @min-[120px]:gap-1.5">
                  <span className="tabular text-[28px] font-bold leading-none tracking-tight text-text">{formatInt(f.value)}</span>
                  <span className="tabular text-xs leading-4 text-muted">{formatPct(share)}</span>
                </span>
              </p>
            </li>
          );
        })}
      </ul>

      {/* Barra 100 % (familias con dato) */}
      <div className="mt-3 flex h-2 w-full gap-[2px]" role="img" aria-label={withValue.map((f) => `${f.label} ${formatPct(known ? f.value / known : 0)}`).join(", ")}>
        {withValue.map((f, i) => (
          <span
            key={f.label}
            className={cn("block h-2", i === 0 && "rounded-l-full", i === withValue.length - 1 && "rounded-r-full")}
            style={{ flexGrow: f.value, flexBasis: 0, minWidth: 3, background: TONE_VARS[f.tone].solid }}
            {...bind({ title: f.label, value: formatInt(f.value), valueNote: formatPct(known ? f.value / known : 0), rows: f.entries.map((e) => ({ label: e.display, value: formatInt(e.value), tone: f.tone })) })}
          />
        ))}
      </div>

      {/* Nota: Sin dato */}
      <p className="mt-2 flex min-h-5 min-w-0 items-start gap-1.5 text-xs leading-5 text-muted">
        <CircleDashed className="mt-[3px] size-3.5 shrink-0" style={{ color: TONE_VARS.neutral.ink }} aria-hidden />
        {noDataSum > 0 ? (
          <span className="min-w-0">
            {noData.map((e, i) => (
              <span key={e.label}>
                {i > 0 && " · "}
                {cf.can(e.label) ? (
                  <button
                    type="button"
                    aria-pressed={cf.isSelected(e.label)}
                    onClick={() => cf.toggle(e.label)}
                    title="Clic para filtrar"
                    className={cn("rounded px-0.5 hover:bg-surface-3", cf.isSelected(e.label) && "bg-primary-soft", cf.isDimmed(e.label) && "opacity-45")}
                  >
                    {e.display}: <span className="tabular font-semibold text-text-2">{formatInt(e.value)}</span>
                  </button>
                ) : (
                  <>
                    {e.display}: <span className="tabular font-semibold text-text-2">{formatInt(e.value)}</span>
                  </>
                )}
              </span>
            ))}{" "}
            ({formatPct(total ? noDataSum / total : 0)}) · % sobre {formatInt(known)} con dato
          </span>
        ) : (
          <span>Todos los registros tienen estado reportado.</span>
        )}
      </p>

      {/* Legend-table agrupada por familia, 2 columnas, filas de 20 px */}
      <ul className="@container mt-2 min-h-0 flex-1 gap-x-5 overflow-y-auto [column-fill:balance] [columns:2_140px]" aria-label={`Estados de ${widget.title}`}>
        {rows.map((e) => {
          const sel = cf.isSelected(e.label);
          const can = cf.can(e.label);
          const tone = e.tone;
          // Misma base que la cabecera y la nota ("% sobre N con dato"): los miembros suman el % de su familia
          const share = known ? e.value / known : 0;
          const body = (
            <>
              <StatusIcon tone={tone} className="size-3" />
              <span className="min-w-0 flex-1 truncate text-left text-text-2" title={e.display}>
                {e.display}
              </span>
              <span className="tabular font-semibold text-text">{formatInt(e.value)}</span>
              <span className="tabular hidden w-[46px] shrink-0 whitespace-nowrap text-right text-muted @min-[440px]:inline">{formatPct(share)}</span>
            </>
          );
          return (
            <li key={e.label} className={cn("break-inside-avoid", cf.isDimmed(e.label) && "opacity-45")}>
              {can ? (
                <button
                  type="button"
                  aria-pressed={sel}
                  aria-label={`${e.display} (${e.family}): ${formatInt(e.value)}, ${formatPct(share)} de los registros con dato. ${sel ? "Quitar filtro" : "Filtrar"}`}
                  onClick={() => cf.toggle(e.label)}
                  className={cn("-mx-1 flex h-5 w-[calc(100%+8px)] items-center gap-1.5 rounded px-1 text-xs transition hover:bg-surface-3", sel && "bg-primary-soft ring-1 ring-primary")}
                >
                  {body}
                </button>
              ) : (
                <span className="flex h-5 items-center gap-1.5 text-xs">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
      <ChartTooltip state={state} />
    </div>
  );
}
