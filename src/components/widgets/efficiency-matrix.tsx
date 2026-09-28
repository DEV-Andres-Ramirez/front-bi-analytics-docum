"use client";

import { AlarmClock, AlertOctagon, CheckCircle2, CircleDashed, Info, Medal, Minus, Search, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import type { EfficiencyPhase, EfficiencyResult, EfficiencyTone } from "@/dashboards/dto";
import type { EfficiencyWidget, StatusTone } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { TONE_VARS } from "@/lib/charts/semantic";
import { formatInt, nf1 } from "@/lib/format";
import { displayLabel } from "@/lib/labels";
import { MoreButton } from "./list-kit";
import { EDGE_T, searchKey, useScrollEdges } from "./table-scroll";
import type { VizProps } from "./types";

/**
 * EfficiencyMatrix (EfficiencyTable v2, docs/ui-design-system.md › "EfficiencyMatrix").
 * Ranking semanal de gerencias (vw_reporte_datastudio_pqrd_eficiencia): por fase, las 3 últimas
 * semanas como mini columnas coloreadas por cuartil (Q1 ágil → Q4 lento; la actual sólida),
 * el valor actual y el mensaje de tendencia en el tooltip. Sin scroll horizontal desde 1036 px:
 * table-layout fixed con fases de ancho fijo y la Gerencia con ≥ 240 px (la tabla aparece desde
 * 848 px con 3 fases y desde 980 px con 4). Por debajo, una tarjeta por gerencia con las fases
 * en 2×2, alto por contenido (sin scroll anidado) y "Ver N gerencias más".
 */

type PhaseKey = "asignacion" | "gestion" | "revision" | "aprobacion";

const PHASES: { key: PhaseKey; label: string }[] = [
  { key: "asignacion", label: "Asignación" },
  { key: "gestion", label: "Gestión" },
  { key: "revision", label: "Revisión" },
  { key: "aprobacion", label: "Aprobación" },
];

/** Tendencia → tono de estado + ícono + etiqueta corta (el color nunca va solo). */
const TREND: Record<EfficiencyTone, { tone: StatusTone; icon: LucideIcon; label: string }> = {
  good: { tone: "good", icon: CheckCircle2, label: "Referente" },
  improving: { tone: "good", icon: TrendingDown, label: "Mejorando" },
  stable: { tone: "neutral", icon: Minus, label: "Estable" },
  worsening: { tone: "warning", icon: TrendingUp, label: "Empeorando" },
  critical: { tone: "serious", icon: AlarmClock, label: "Crítico" },
  alert: { tone: "critical", icon: AlertOctagon, label: "Alerta" },
  unknown: { tone: "neutral", icon: CircleDashed, label: "Sin datos" },
};

type Quartile = 1 | 2 | 3 | 4;
const Q: Record<Quartile, { soft: string; solid: string; label: string }> = {
  1: { soft: "var(--good-soft)", solid: "var(--good)", label: "Q1 más ágil" },
  2: { soft: "var(--surface-3)", solid: "var(--neutral-mark)", label: "Q2" },
  3: { soft: "var(--warning-soft)", solid: "var(--warning)", label: "Q3" },
  4: { soft: "var(--critical-soft)", solid: "var(--critical)", label: "Q4 más lento" },
};


/** Tarjetas visibles antes de "Ver N gerencias más" (modo tarjetas, sin búsqueda). */
const CARD_LIMIT = 5;

/**
 * Umbral tabla ↔ tarjetas por número de fases (clases literales para Tailwind).
 * Puesto 64 + Gerencia ≥ 240 + fases: 3 × 180 = 844 → 848 px; 4 × 168 = 976 → 980 px.
 */
const LAYOUT = {
  3: { phaseW: 180, cards: "@min-[848px]/em:hidden", table: "@min-[848px]/em:table", cap: "@min-[848px]/em:max-h-[640px]", fade: "@min-[848px]/em:block" },
  4: { phaseW: 168, cards: "@min-[980px]/em:hidden", table: "@min-[980px]/em:table", cap: "@min-[980px]/em:max-h-[640px]", fade: "@min-[980px]/em:block" },
} as const;

const days = (v: number | null) => (v === null ? "sin datos" : `${nf1.format(v)} ${v === 1 ? "día" : "días"}`);

// ─── Piezas ──────────────────────────────────────────────────────────────────
function QBox({ q, current, height, className }: { q: Quartile; current?: boolean; height?: number; className?: string }) {
  const c = Q[q];
  return <span aria-hidden className={cn("inline-block shrink-0 rounded-t-[2px]", className)} style={{ height, background: current ? c.solid : c.soft, boxShadow: current ? undefined : `inset 0 0 0 1px ${c.solid}` }} />;
}

function MiniColumns({ phase }: { phase: EfficiencyPhase }) {
  const last = phase.quartiles.length - 1;
  return (
    <span className="flex h-7 shrink-0 items-end gap-[3px] border-b border-border-strong" aria-hidden>
      {phase.quartiles.map((q, i) =>
        q === null ? (
          <span key={i} className="h-[3px] w-2.5 rounded-t-[2px] bg-border" />
        ) : (
          <QBox key={i} q={q as Quartile} current={i === last} height={(q as Quartile) * 7} className="w-2.5" />
        ),
      )}
    </span>
  );
}

function PhaseCell({ phase, weeks, label }: { phase: EfficiencyPhase; weeks: string[]; label: string }) {
  const t = TREND[phase.tone];
  const Icon = t.icon;
  const cur = phase.values.at(-1) ?? null;
  const tip = (
    <span className="block">
      <span className="block font-semibold text-white">
        {label} · {phase.message}
      </span>
      {weeks.map((w, i) => (
        <span key={w} className="tabular mt-0.5 block text-white/80">
          {w}: {days(phase.values[i] ?? null)}
          {phase.quartiles[i] ? ` · Q${phase.quartiles[i]}` : ""}
        </span>
      ))}
    </span>
  );
  return (
    <Tooltip content={tip} focusable className="w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <span className="flex w-full min-w-0 items-center gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full" style={{ background: TONE_VARS[t.tone].soft }} aria-hidden>
          <Icon className="size-3" style={{ color: TONE_VARS[t.tone].ink }} strokeWidth={2.5} />
        </span>
        <MiniColumns phase={phase} />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className={cn("tabular whitespace-nowrap text-[13px] font-semibold", cur === null ? "text-muted" : "text-text")}>{cur === null ? "—" : `${nf1.format(cur)} d`}</span>
          <span className="whitespace-nowrap text-[10.5px] text-muted">{t.label}</span>
        </span>
        <span className="sr-only">
          {label}: {phase.message}. Semana actual: {days(cur)}.
        </span>
      </span>
    </Tooltip>
  );
}

function RankBadge({ rank, tied, medal }: { rank: number | null; tied: boolean; medal: boolean }) {
  if (rank === null)
    return (
      <span className="inline-flex h-7 min-w-9 items-center justify-center text-xs text-muted" title="Sin datos suficientes en la semana actual">
        —
      </span>
    );
  return (
    <span
      title={tied ? `Empatada en el puesto ${rank}` : `Puesto ${rank}`}
      className={cn(
        "tabular inline-flex h-7 min-w-9 items-center justify-center gap-0.5 rounded-full px-2 text-xs font-bold",
        medal ? "bg-primary-soft-2 text-primary-text" : "bg-surface-3 text-text-2",
      )}
    >
      {medal && <Medal className="size-3.5" aria-hidden />}
      {tied ? `=${rank}` : rank}
    </span>
  );
}

function QuartileLegend({ current }: { current?: string }) {
  return (
    <ul role="list" aria-label="Cuartiles de 52 semanas" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-2">
      <li className="text-muted">Cuartil (52 semanas):</li>
      {([1, 2, 3, 4] as Quartile[]).map((q) => (
        <li key={q} className="inline-flex items-center gap-1.5">
          <QBox q={q} className="size-2.5 rounded-[2px]" />
          {Q[q].label}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className="inline-block size-2.5 rounded-[2px] bg-text-2" />
        {current ? (
          <span>
            Semana actual (sólida)<span className="text-muted">: {current.replace(/^Sem \d+ · /, "")}</span>
          </span>
        ) : (
          "Semana actual (sólida)"
        )}
      </li>
    </ul>
  );
}

// ─── Vista ───────────────────────────────────────────────────────────────────
export function EfficiencyMatrix({ widget, result, expanded }: VizProps<EfficiencyWidget, EfficiencyResult>) {
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const { ref: scrollRef, onScroll, dataAttrs, edges } = useScrollEdges();

  const revisionManual = useMemo(() => result.rows.length > 0 && result.rows.every((r) => r.phases.revision.tone === "unknown"), [result.rows]);
  const phases = revisionManual ? PHASES.filter((p) => p.key !== "revision") : PHASES;
  const layout = LAYOUT[phases.length > 3 ? 4 : 3];

  const rows = useMemo(() => {
    const counts = new Map<number, number>();
    for (const r of result.rows) if (r.ranking !== null) counts.set(r.ranking, (counts.get(r.ranking) ?? 0) + 1);
    const k = searchKey(q);
    return result.rows
      .map((r) => {
        const tied = r.ranking !== null && (counts.get(r.ranking) ?? 0) > 1;
        const d = displayLabel(r.gerencia, "oficina");
        return { ...r, name: d.full, tied, medal: r.ranking !== null && r.ranking <= 3 && !tied };
      })
      .filter((r) => !k || searchKey(r.name).includes(k));
  }, [result.rows, q]);
  const ranked = rows.filter((r) => r.ranking !== null);
  const unranked = rows.filter((r) => r.ranking === null);
  const currentWeek = result.weeks.at(-1);
  const ordered = [...ranked, ...unranked];
  // Tarjetas: primeras N (con búsqueda o ampliado se ven todas)
  const canLimit = !expanded && !q && ordered.length > CARD_LIMIT + 1;
  const limited = canLimit && !showAll;
  const cards = limited ? ordered.slice(0, CARD_LIMIT) : ordered;
  const hiddenCards = ordered.length - CARD_LIMIT;

  const nameCell = (r: (typeof rows)[number]) => (
    <span className="block min-w-0">
      <span className="block text-[13px] font-semibold leading-snug text-text">{r.name}</span>
      <span className="tabular block text-[11px] text-muted">{r.score === null ? "Sin datos esta semana" : `Cuartil promedio ${nf1.format(r.score)}`}</span>
    </span>
  );

  return (
    // El contenedor mide el ancho; el tope de 640 px con scroll interno solo aplica en modo tabla
    // (en tarjetas el alto es por contenido: sin scroll anidado dentro de la página).
    <div className={cn("@container/em min-h-0", expanded && "h-full")}>
      <div className={cn("flex min-h-0 flex-col", expanded ? "h-full" : layout.cap)}>
        <div className="mb-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <QuartileLegend current={currentWeek} />
            <label className="relative w-full sm:w-56">
              <span className="sr-only">Buscar gerencia</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar gerencia…"
                className="h-8 w-full rounded-full border border-border bg-surface-2 pl-8 pr-3 text-xs text-text outline-none transition placeholder:text-muted focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </label>
          </div>
          {revisionManual && (
            <p className="flex items-start gap-1.5 text-xs text-text-2">
              <Info className="mt-px size-3.5 shrink-0 text-muted" aria-hidden />
              <span>
                <span className="font-semibold">Revisión</span> no se muestra: la vista no reporta días de revisión y el 100 % de las gerencias queda en “Necesario validación manual”.
              </span>
            </p>
          )}
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={scrollRef} onScroll={onScroll} {...dataAttrs} className="group/sc relative min-h-0 flex-1 overflow-auto overscroll-contain">
            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Ninguna gerencia coincide con “{q}”.</p>
            ) : (
              <>
                <div className={layout.cards}>
                  <ul role="list" aria-label={widget.title} className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3">
                    {cards.map((r) => (
                      <li key={r.gerencia} className="rounded-xl border border-border p-3">
                        <div className="mb-2.5 flex items-start gap-2.5">
                          <RankBadge rank={r.ranking} tied={r.tied} medal={r.medal} />
                          {nameCell(r)}
                        </div>
                        {/* 2×2; con 3 fases la última ocupa la fila completa (sin hueco huérfano) */}
                        <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">
                          {phases.map((p) => (
                            <div key={p.key} className="min-w-0 rounded-lg bg-surface-2 px-2 py-1.5">
                              <p className="mb-1 text-[11px] font-semibold text-muted">{p.label}</p>
                              <PhaseCell phase={r.phases[p.key]} weeks={result.weeks} label={p.label} />
                            </div>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {canLimit && (
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-2.5 text-xs text-muted">
                      <span className="tabular">
                        {formatInt(cards.length)} de {formatInt(ordered.length)} gerencias
                      </span>
                      <MoreButton onClick={() => setShowAll((v) => !v)} expanded={!limited}>
                        {limited ? `Ver ${formatInt(hiddenCards)} ${hiddenCards === 1 ? "gerencia" : "gerencias"} más` : "Ver menos"}
                      </MoreButton>
                    </div>
                  )}
                </div>
                <table className={cn("hidden w-full table-fixed border-separate border-spacing-0 text-[13px]", layout.table)} aria-label={widget.title}>
                  <colgroup>
                    <col style={{ width: 64 }} />
                    <col />
                    {phases.map((p) => (
                      <col key={p.key} style={{ width: layout.phaseW }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col" className={cn("sticky top-0 z-10 border-b border-border bg-surface px-2 pb-2 text-left text-[11px] font-bold text-text-2", EDGE_T)}>
                        Puesto
                      </th>
                      <th scope="col" className={cn("sticky top-0 z-10 border-b border-border bg-surface px-3 pb-2 text-left text-[11px] font-bold text-text-2", EDGE_T)}>
                        Gerencia
                      </th>
                      {phases.map((p) => (
                        <th key={p.key} scope="col" className={cn("sticky top-0 z-10 border-b border-border bg-surface px-3 pb-2 text-left text-[11px] font-bold text-text-2", EDGE_T)}>
                          {p.label}
                          <span className="block text-[10.5px] font-medium text-muted">Días promedio · 3 semanas</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((r) => (
                      <tr key={r.gerencia} className="transition-colors hover:bg-surface-2">
                        <td className="border-b border-[color:var(--hairline)] px-2 py-2.5 align-middle">
                          <RankBadge rank={r.ranking} tied={r.tied} medal={r.medal} />
                        </td>
                        <td className="border-b border-[color:var(--hairline)] px-3 py-2.5 align-middle">{nameCell(r)}</td>
                        {phases.map((p) => (
                          <td key={p.key} className="border-b border-[color:var(--hairline)] px-3 py-2 align-middle">
                            <PhaseCell phase={r.phases[p.key]} weeks={result.weeks} label={p.label} />
                          </td>
                        ))}
                      </tr>
                    ))}
                    {unranked.length > 0 && (
                      <tr>
                        <th colSpan={2 + phases.length} scope="rowgroup" className="border-b border-border bg-surface-2 px-3 py-1.5 text-left text-[11px] font-semibold text-muted">
                          Sin puesto: sin datos en la semana actual ({formatInt(unranked.length)})
                        </th>
                      </tr>
                    )}
                    {unranked.map((r) => (
                      <tr key={r.gerencia} className="transition-colors hover:bg-surface-2">
                        <td className="border-b border-[color:var(--hairline)] px-2 py-2.5 align-middle">
                          <RankBadge rank={r.ranking} tied={r.tied} medal={r.medal} />
                        </td>
                        <td className="border-b border-[color:var(--hairline)] px-3 py-2.5 align-middle">{nameCell(r)}</td>
                        {phases.map((p) => (
                          <td key={p.key} className="border-b border-[color:var(--hairline)] px-3 py-2 align-middle">
                            <PhaseCell phase={r.phases[p.key]} weeks={result.weeks} label={p.label} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
          {/* Modo tabla con filas ocultas abajo: la última fila se desvanece en lugar de cortarse en seco */}
          {edges.bottom && <span aria-hidden className={cn("pointer-events-none absolute inset-x-0 bottom-0 hidden h-10 bg-linear-to-t from-surface to-transparent", layout.fade)} />}
        </div>
      </div>
    </div>
  );
}
