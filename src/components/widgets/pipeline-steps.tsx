"use client";

import { AlertTriangle, Check, CornerDownRight, Info, LogOut } from "lucide-react";
import { useMemo } from "react";
import { useDashboard } from "@/components/dashboard/dashboard-context";
import type { CategoryResult } from "@/dashboards/dto";
import type { BarWidget, DonutWidget, ValueFormat } from "@/dashboards/types";
import { innerWidth } from "@/dashboards/layout";
import { cn } from "@/lib/cn";
import { isNeutral, normalizeLabel } from "@/lib/charts/semantic";
import { formatPct, formatValue } from "@/lib/format";
import { Swatch } from "./kit/chart-legend";
import { ChartTooltip, useChartTooltip, type TooltipContent } from "./kit/chart-tooltip";
import { StatusIcon } from "./kit/status-icon";
import { VizEmpty } from "./kit/viz-states";
import { buildParts, dimensionOf, formatOf, orderOf, partTooltip, toneNote, useBox, useHover, useSelection, type Part } from "./status-shared";
import type { VizProps } from "./types";

/**
 * PipelineSteps: estados o etapas con orden de proceso ("Etapa actual de cada radicado"; no es un embudo).
 * - horizontal (interno ≥ n·150): chevrons de 64 px con etiqueta (reserva 2 líneas: las cifras comparten
 *   línea base), cifra y %, y una barra fina con la participación (el mismo % que se lee).
 *   La etapa pendiente con más casos es una alerta de cuello de botella, no una selección: trazo y chip
 *   "Mayor acumulación" en warning (el naranja Balú queda para la interacción).
 * - vertical: pasos de 40 px unidos por un conector.
 * vizOptions: finalStage (good-soft), criticalStages (critical), branch (rama secundaria) y exits (chips).
 * Pie: la rama y "Fuera del flujo" como grupos con su rótulo; la nota fija al final, en su propia línea.
 * En vertical, si el pie (medido) no deja alto para pasos de 48 px, los pasos pasan a 32 px.
 */

type Props = VizProps<BarWidget | DonutWidget, CategoryResult>;

const STEP_MIN = 150;
const NOTCH = 14;
const OVERLAP = 10;
const CHEVRON_H = 64;

type StageKind = "final" | "critical" | "peak" | "plain";

interface Stage {
  part: Part;
  kind: StageKind;
}

interface Shared {
  fmt: ValueFormat;
  sel: ReturnType<typeof useSelection>;
  hover: ReturnType<typeof useHover>;
  tip: (p: Part) => TooltipContent;
}

function stageHandlers(p: Part, { sel, hover, tip }: Shared) {
  const interactive = sel.canFilter && p.filterable && p.labels.length > 0 && p.value > 0;
  const tt = tip(p);
  return {
    interactive,
    props: {
      type: "button" as const,
      "aria-pressed": interactive ? sel.isOn(p) : undefined,
      "aria-disabled": interactive ? undefined : true,
      onClick: hover.tap(() => interactive && sel.toggle(p)),
      onMouseEnter: hover.enter(p.key, tt),
      onMouseMove: hover.enter(p.key, tt),
      onMouseLeave: hover.leave,
      onFocus: hover.focus(p.key, tt),
      onBlur: hover.leave,
    },
  };
}

function dimClass(p: Part, { sel, hover }: Shared) {
  if (hover.hovered) return hover.hovered === p.key ? "" : "opacity-40";
  if (sel.any && !sel.isOn(p)) return "opacity-45";
  return "";
}

export function PipelineSteps({ widget, result, span, expanded }: Props) {
  const { spec } = useDashboard();
  const { ref, width, height: boxHeight, measured, fixed } = useBox<HTMLDivElement>();
  const { ref: footRef, height: footHeight, measured: footMeasured } = useBox<HTMLDivElement>();
  const { state, show, hide } = useChartTooltip();
  const hover = useHover(show, hide);
  const sel = useSelection(dimensionOf(widget));
  const fmt = formatOf(widget);
  const vo = widget.vizOptions;
  const family = widget.semantic;
  const order = orderOf(widget);
  const labelKind = widget.labelKind;

  const model = useMemo(() => {
    const n = normalizeLabel;
    const data = new Map(result.labels.map((l, i) => [n(l), { label: l, value: result.values[i] ?? 0 }] as const));
    const pick = (declared: string) => data.get(n(declared)) ?? { label: declared, value: 0 };
    const branchKeys = new Set((vo?.branch ?? []).map(n));
    const exitKeys = new Set((vo?.exits ?? []).map(n));
    const inFlow = (l: string) => !branchKeys.has(n(l)) && !exitKeys.has(n(l)) && !isNeutral(l);
    const main = order?.length ? order.filter(inFlow).map(pick) : result.labels.filter(inFlow).map(pick);
    const mainKeys = new Set(main.map((m) => n(m.label)));
    const extras = order?.length ? result.labels.filter((l) => inFlow(l) && !mainKeys.has(n(l))).map(pick) : [];
    const branch = (vo?.branch ?? []).map(pick);
    const exits = [...(vo?.exits ?? []).map(pick), ...extras];
    const neutral = result.labels.filter((l) => isNeutral(l)).map(pick);
    const grand = result.values.reduce((a, b) => a + (b ?? 0), 0);

    const toParts = (list: { label: string; value: number }[], keepOrder: boolean) =>
      buildParts(
        list.map((e) => e.label),
        list.map((e) => e.value),
        {
          family,
          overrides: vo?.overrides,
          order: keepOrder ? list.map((e) => e.label) : undefined,
          labelKind,
          keepZero: true,
          folded: result.folded,
        },
      ).map((p) => ({ ...p, share: grand ? p.value / grand : 0 }));

    const mainParts = toParts(main, Boolean(order?.length));
    const finalKey = vo?.finalStage ? n(vo.finalStage) : n([...mainParts].reverse().find((p) => p.tone === "good")?.key ?? "");
    const criticalKeys = new Set(vo?.criticalStages?.length ? vo.criticalStages.map(n) : mainParts.filter((p) => p.tone === "critical").map((p) => n(p.key)));
    const pending = mainParts.filter((p) => n(p.key) !== finalKey && !criticalKeys.has(n(p.key)) && p.value > 0);
    const peak = pending.length > 1 ? pending.reduce((a, b) => (b.value > a.value ? b : a)) : undefined;
    const stages: Stage[] = mainParts.map((part) => ({
      part,
      kind: n(part.key) === finalKey ? "final" : criticalKeys.has(n(part.key)) ? "critical" : peak && part.key === peak.key ? "peak" : "plain",
    }));
    return {
      stages,
      branch: toParts(branch, true),
      exits: toParts(exits, true),
      neutral: toParts(neutral, true),
      grand,
    };
  }, [result, family, vo, order, labelKind]);

  if (!model.grand) return <VizEmpty note={widget.note} />;

  const tip = (p: Part) =>
    partTooltip(p, fmt, {
      on: sel.isOn(p),
      canFilter: sel.canFilter && p.value > 0,
      extra: toneNote(p.tone),
    });
  const shared: Shared = { fmt, sel, hover, tip };
  const inner = measured ? width : expanded ? 1036 : innerWidth(span);
  const horizontal = inner >= model.stages.length * STEP_MIN;
  const unit = spec.unit?.singular ?? "radicado";
  // Vertical: si el pie (rama, salidas y nota, medido) no deja alto para pasos de 48 px, pasos compactos de 32
  const stepsRoom = measured && fixed && footMeasured ? boxHeight - footHeight - 12 : 0;
  const dense = !horizontal && stepsRoom > 0 && stepsRoom < model.stages.length * 48 - 8;

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col gap-3" onMouseLeave={hover.leave}>
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        {horizontal ? <Chevrons stages={model.stages} width={inner} title={widget.title} {...shared} /> : <VerticalSteps stages={model.stages} title={widget.title} dense={dense} {...shared} />}
      </div>
      <div ref={footRef} className="flex shrink-0 flex-col gap-2">
        {(model.branch.length > 0 || model.exits.length > 0 || model.neutral.length > 0) && (
          // Rama y salidas: cada grupo con su rótulo; comparten línea si caben y si no, bajan a la suya
          <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-1 text-[11.5px]">
            {model.branch.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1" role="group" aria-label="Rama secundaria">
                <span className="inline-flex shrink-0 items-center gap-1 text-muted">
                  <CornerDownRight className="size-3.5 shrink-0" aria-hidden />
                  Rama
                </span>
                {model.branch.map((p, i) => (
                  <span key={p.key} className="inline-flex items-center gap-1.5">
                    {i > 0 && (
                      <span aria-hidden className="text-muted">
                        →
                      </span>
                    )}
                    <StageChip p={p} {...shared} />
                  </span>
                ))}
              </div>
            )}
            {(model.exits.length > 0 || model.neutral.length > 0) && (
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1" role="group" aria-label="Fuera del flujo">
                <span className="inline-flex shrink-0 items-center gap-1 text-muted">
                  <LogOut className="size-3.5 shrink-0" aria-hidden />
                  Fuera del flujo
                </span>
                {model.exits.map((p) => (
                  <StageChip key={p.key} p={p} {...shared} />
                ))}
                {model.neutral.map((p) => (
                  <StageChip key={p.key} p={p} {...shared} muted />
                ))}
              </div>
            )}
          </div>
        )}
        <p className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-muted">
          <Info className="size-3.5 shrink-0" aria-hidden />
          Etapa actual de cada {unit}
        </p>
      </div>
      <ChartTooltip state={state} />
    </div>
  );
}

// ─── Horizontal: chevrons ────────────────────────────────────────────────────

function chevronPath(w: number, first: boolean, last: boolean): string {
  const s = 1;
  const h = CHEVRON_H;
  const right = last ? `L${w - s},${s} L${w - s},${h - s}` : `L${w - NOTCH},${s} L${w - s},${h / 2} L${w - NOTCH},${h - s}`;
  const left = first ? "" : ` L${NOTCH},${h / 2}`;
  return `M${s},${s} ${right} L${s},${h - s}${left} Z`;
}

const FILL: Record<StageKind, { fill: string; stroke: string; width: number }> = {
  plain: { fill: "var(--surface-2)", stroke: "var(--border)", width: 1 },
  final: {
    fill: "var(--good-soft)",
    stroke: "color-mix(in srgb, var(--good) 45%, transparent)",
    width: 1,
  },
  critical: {
    fill: "var(--critical-soft)",
    stroke: "color-mix(in srgb, var(--critical) 45%, transparent)",
    width: 1,
  },
  peak: { fill: "var(--warning-soft)", stroke: "var(--warning)", width: 2 },
};

function Chevrons({ stages, width, title, ...shared }: Shared & { stages: Stage[]; width: number; title: string }) {
  const n = stages.length;
  const cw = Math.max(80, (width + OVERLAP * (n - 1)) / n);
  return (
    <ol role="list" aria-label={title} className="flex w-full min-w-0">
      {stages.map(({ part: p, kind }, i) => {
        const first = i === 0;
        const last = i === n - 1;
        const { interactive, props } = stageHandlers(p, shared);
        const on = shared.sel.isOn(p);
        const hot = shared.hover.hovered === p.key;
        const zero = p.value === 0;
        const style = kind === "critical" && zero ? FILL.plain : FILL[kind];
        const fill = on ? "var(--primary-soft-2)" : hot && kind === "plain" ? "var(--surface-3)" : style.fill;
        const stroke = on ? "var(--primary)" : style.stroke;
        const padL = first ? 14 : NOTCH + 10;
        const padR = last ? 14 : NOTCH + 8;
        return (
          <li
            key={p.key}
            className={cn("flex min-w-0 flex-col transition-opacity", dimClass(p, shared))}
            style={{
              flex: "1 1 0",
              marginLeft: first ? 0 : -OVERLAP,
              zIndex: n - i,
            }}
          >
            <div className="flex h-5 items-center" style={{ paddingLeft: padL }}>
              {kind === "peak" && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-warning-soft px-2 py-px text-[10.5px] font-semibold text-warning-ink">
                  <AlertTriangle className="size-3" aria-hidden />
                  Mayor acumulación
                </span>
              )}
            </div>
            <button
              {...props}
              aria-label={`${p.display}: ${formatValue(p.value, shared.fmt)} (${formatPct(p.share)})${kind === "final" ? ", etapa final" : kind === "critical" ? ", crítica" : kind === "peak" ? ", mayor acumulación" : ""}`}
              className={cn("relative block w-full text-left outline-offset-2", interactive ? "cursor-pointer" : "cursor-default")}
              style={{ height: CHEVRON_H }}
            >
              <svg aria-hidden className="absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${cw} ${CHEVRON_H}`} preserveAspectRatio="none">
                <path
                  d={chevronPath(cw, first, last)}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={on ? 2 : style.width}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  className="transition-[fill] duration-200"
                />
              </svg>
              <span className="relative flex h-full min-w-0 flex-col justify-center gap-0.5" style={{ paddingLeft: padL, paddingRight: padR }}>
                {/* La etiqueta reserva 2 líneas y se apoya abajo: todas las cifras quedan en la misma línea base */}
                <span className="flex min-h-[2lh] min-w-0 items-end gap-1 text-[12.5px] font-medium leading-tight text-text-2">
                  {kind === "final" && <StatusIcon tone="good" className="mb-px" />}
                  {kind === "critical" && !zero && <StatusIcon tone="critical" className="mb-px" />}
                  <span className="line-clamp-2 min-w-0 hyphens-auto break-words">{p.display}</span>
                </span>
                <span className="flex items-baseline gap-1.5">
                  <span className={cn("tabular text-xl font-bold leading-none tracking-tight", zero ? "text-muted" : "text-text")}>{formatValue(p.value, shared.fmt)}</span>
                  <span className="tabular text-xs text-muted">{formatPct(p.share)}</span>
                  {on && <Check className="size-3 self-center text-primary-text" aria-hidden />}
                </span>
              </span>
            </button>
            {/* Participación sobre el total: la barra mide lo mismo que el % impreso */}
            <div aria-hidden className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3" style={{ marginLeft: padL, marginRight: padR }}>
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${p.share * 100}%`,
                  background: "var(--chart-1)",
                }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Vertical: pasos con conector ────────────────────────────────────────────

function VerticalSteps({ stages, title, dense, ...shared }: Shared & { stages: Stage[]; title: string; dense: boolean }) {
  return (
    <ol role="list" aria-label={title} className="flex min-h-0 flex-col">
      {stages.map(({ part: p, kind }, i) => {
        const { interactive, props } = stageHandlers(p, shared);
        const on = shared.sel.isOn(p);
        const zero = p.value === 0;
        const node =
          kind === "final" ? (
            <span className={cn("grid place-items-center rounded-full border border-good/50 bg-good-soft", dense ? "size-5" : "size-6")}>
              <StatusIcon tone="good" />
            </span>
          ) : kind === "critical" && !zero ? (
            <span className={cn("grid place-items-center rounded-full border border-critical/50 bg-critical-soft", dense ? "size-5" : "size-6")}>
              <StatusIcon tone="critical" />
            </span>
          ) : (
            <span
              className={cn(
                "tabular grid place-items-center rounded-full border font-semibold",
                dense ? "size-5 text-[10px]" : "size-6 text-[11px]",
                kind === "peak" ? "border-2 border-warning bg-warning-soft text-warning-ink" : "border-border bg-surface-2 text-text-2",
              )}
            >
              {i + 1}
            </span>
          );
        return (
          <li key={p.key} className={cn("relative flex transition-opacity last:pb-0", dense ? "gap-2 pb-1.5" : "gap-2.5 pb-2", dimClass(p, shared))}>
            {i < stages.length - 1 && <span aria-hidden className={cn("absolute bottom-0 w-0.5 rounded-full bg-border", dense ? "left-[9px] top-6" : "left-[11px] top-8")} />}
            <span className={cn("relative shrink-0", dense ? "mt-1" : "mt-2")}>{node}</span>
            <button
              {...props}
              aria-label={`Paso ${i + 1}, ${p.display}: ${formatValue(p.value, shared.fmt)} (${formatPct(p.share)})${kind === "final" ? ", etapa final" : kind === "critical" ? ", crítica" : kind === "peak" ? ", mayor acumulación" : ""}`}
              className={cn(
                "flex min-w-0 flex-1 flex-col justify-center rounded-lg px-2 text-left transition",
                dense ? "gap-0.5 py-0.5" : "min-h-10 gap-1 py-1",
                interactive ? "cursor-pointer hover:bg-surface-3" : "cursor-default",
                on && "bg-primary-soft ring-1 ring-inset ring-primary/40",
              )}
            >
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="min-w-0 flex-1 break-words text-[12.5px] font-medium leading-tight text-text-2">
                  {p.display}
                  {kind === "peak" && (
                    // Compacto: solo el ícono (el nodo ya va en warning y el aria-label lo nombra); así no parte línea
                    <span
                      title="Mayor acumulación"
                      className={cn(
                        "ml-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-warning-soft align-middle text-[10px] font-semibold text-warning-ink",
                        dense ? "p-0.5" : "px-1.5",
                      )}
                    >
                      <AlertTriangle className="size-3" aria-hidden />
                      {!dense && "Mayor acumulación"}
                    </span>
                  )}
                </span>
                <span className={cn("tabular text-[15px] font-bold", zero ? "text-muted" : "text-text")}>{formatValue(p.value, shared.fmt)}</span>
                <span className="tabular w-12 text-right text-xs text-muted">{formatPct(p.share)}</span>
              </span>
              <span aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
                <span
                  className="block h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${p.share * 100}%`,
                    background: "var(--chart-1)",
                  }}
                />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Chips (rama, fuera de flujo, neutrales) ────────────────────────────────

function StageChip({ p, muted, ...shared }: Shared & { p: Part; muted?: boolean }) {
  const { interactive, props } = stageHandlers(p, shared);
  const on = shared.sel.isOn(p);
  const zero = p.value === 0;
  return (
    <button
      {...props}
      aria-label={`${p.display}: ${formatValue(p.value, shared.fmt)} (${formatPct(p.share)})`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 transition",
        muted ? "border-dashed border-border" : "border-border bg-surface-2",
        interactive ? "cursor-pointer hover:bg-surface-3" : "cursor-default",
        zero && "opacity-60",
        on && "border-primary bg-primary-soft",
        dimClass(p, shared),
      )}
    >
      {p.tone ? <StatusIcon tone={p.tone} /> : <Swatch color="var(--neutral-mark)" />}
      <span className="text-text-2">{p.display}</span>
      <span className="tabular font-semibold text-text">{formatValue(p.value, shared.fmt)}</span>
    </button>
  );
}
