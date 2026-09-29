"use client";

import { AlarmClock, AlertOctagon, CheckCircle2, CircleDashed, Info, Medal, Minus, Search, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import type { EfficiencyPhase, EfficiencyResult, EfficiencyTone } from "@/dashboards/dto";
import type { EfficiencyWidget, StatusTone } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { TONE_VARS } from "@/lib/charts/semantic";
import { formatInt, formatValue, nf1 } from "@/lib/format";
import { displayLabel } from "@/lib/labels";
import { MoreButton } from "./list-kit";
import { EDGE_T, searchKey, useScrollEdges } from "./table-scroll";
import type { VizProps } from "./types";

/**
 * EfficiencyMatrix (EfficiencyTable v2, docs/ui-design-system.md › "EfficiencyMatrix").
 * Ranking semanal de gerencias (vw_reporte_datastudio_pqrd_eficiencia): por fase, las 3 últimas
 * semanas como mini columnas coloreadas por cuartil (Q1 ágil → Q4 lento; la actual sólida),
 * el valor actual y el mensaje de tendencia en el tooltip. Sin scroll horizontal desde 1036 px:
 * table-layout fixed; las fases crecen con el ancho (clamp sobre 100cqw: la Gerencia se queda en
 * ~320 px en lugar de llevarse todo el sobrante) y las mini columnas crecen con ellas (10 → 12 → 14 px
 * de ancho, 28 → 32 px de alto). La tabla aparece desde 848 px con 3 fases y desde 980 px con 4. Por
 * debajo, una tarjeta por gerencia con las fases en paralelo (3 columnas; 2×2 con 4 fases), alto por
 * contenido (sin scroll anidado) y "Ver N gerencias más".
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
/**
 * Relleno de las semanas anteriores: el tono suave con un 35 % del sólido (con el contorno sólido) para
 * que el cuartil se lea por color y no solo por el borde; la semana actual va sólida.
 */
const pastFill = (q: Quartile) => `color-mix(in oklab, ${Q[q].solid} 35%, ${Q[q].soft})`;


/**
 * Tarjetas visibles antes de "Ver N gerencias más" (modo tarjetas, sin búsqueda). Múltiplo de 1, 2 y 3
 * columnas de la rejilla: la última fila nunca queda con un hueco.
 */
const CARD_LIMIT = 6;

/**
 * Umbral tabla ↔ tarjetas por número de fases (clases literales para Tailwind).
 * Puesto 64 + Gerencia ≥ 240 + fases: 3 × 164 = 796 → 848 px (Gerencia ≥ 292); 4 × 168 = 976 → 980 px.
 * Por encima, cada fase mide (ancho − 64 − 320) / n entre min y max: a 1440 (1050 px) quedan fases de
 * ~222 px y la Gerencia en ~320 px, sin el hueco de ~300 px entre el nombre y la primera fase; a 1024
 * (866 px) las fases bajan a 164 px (ícono 20 + mini columnas 42 + cifra/etiqueta 60 + huecos y relleno)
 * y la Gerencia llega a ~310 px: "Gerencia Sucursal Coordinadora Antioquia" cabe en una línea.
 */
const LAYOUT = {
  3: { min: 164, max: 260, cards: "@min-[848px]/em:hidden", table: "@min-[848px]/em:table", cap: "@min-[848px]/em:max-h-[640px]", fade: "@min-[848px]/em:block", grid: "grid-cols-3" },
  4: { min: 168, max: 240, cards: "@min-[980px]/em:hidden", table: "@min-[980px]/em:table", cap: "@min-[980px]/em:max-h-[640px]", fade: "@min-[980px]/em:block", grid: "grid-cols-2" },
} as const;
const RANK_W = 64;
/** Ancho objetivo de la Gerencia cuando sobra espacio (las fases se llevan el resto hasta su máximo). */
const GERENCIA_W = 320;
/** Ancho de columna de fase relativo al contenedor (cqw del @container/em; resuelve a px en el colgroup). */
const phaseWidth = (n: number, min: number, max: number) => `clamp(${min}px, calc((100cqw - ${RANK_W + GERENCIA_W}px) / ${n}), ${max}px)`;

// Mismo formato que los KPI de días: siempre 1 decimal y "días" en plural ("1,0 días")
const days = (v: number | null) => (v === null ? "sin datos" : formatValue(v, "days"));

// ─── Piezas ──────────────────────────────────────────────────────────────────
function QBox({ q, current, height, className }: { q: Quartile; current?: boolean; height?: string; className?: string }) {
  const c = Q[q];
  return <span aria-hidden className={cn("inline-block shrink-0 rounded-t-[2px]", className)} style={{ height, background: current ? c.solid : pastFill(q), boxShadow: current ? undefined : `inset 0 0 0 1px ${c.solid}` }} />;
}

/**
 * 3 semanas como mini columnas de alto proporcional al cuartil. Tamaño por variables del contenedor
 * (--em-bw ancho, --em-bu alto por cuartil): 10 × 28 en tarjetas, 12 × 28 en la tabla y 14 × 32 desde 1036 px.
 */
function MiniColumns({ phase }: { phase: EfficiencyPhase }) {
  const last = phase.quartiles.length - 1;
  return (
    <span className="flex h-[calc(var(--em-bu)*4)] shrink-0 items-end gap-[3px] border-b border-border-strong" aria-hidden>
      {phase.quartiles.map((q, i) =>
        q === null ? (
          <span key={i} className="h-[3px] w-(--em-bw) rounded-t-[2px] bg-border" />
        ) : (
          <QBox key={i} q={q as Quartile} current={i === last} height={`calc(var(--em-bu) * ${q})`} className="w-(--em-bw)" />
        ),
      )}
    </span>
  );
}

/** Contenido del tooltip de una fase: mensaje de tendencia y las 3 semanas con su cuartil. */
function phaseTip(phase: EfficiencyPhase, weeks: string[], label: string) {
  return (
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
}

/**
 * Fase en la tarjeta móvil (3 en paralelo): nombre de 11 px con el ícono de tendencia a la derecha
 * (se oculta con el contenedor < 300 px, ~360 px de pantalla), mini columnas y valor de 14 px. La
 * etiqueta de tendencia va en el tooltip y para el lector de pantalla.
 */
function PhaseCompact({ phase, weeks, label }: { phase: EfficiencyPhase; weeks: string[]; label: string }) {
  const t = TREND[phase.tone];
  const Icon = t.icon;
  const cur = phase.values.at(-1) ?? null;
  return (
    <Tooltip
      content={phaseTip(phase, weeks, label)}
      focusable
      className="flex w-full min-w-0 flex-col gap-1 rounded-lg bg-surface-2 px-1.5 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="flex min-w-0 items-center justify-between gap-1">
        <span className="min-w-0 text-[11px] font-semibold leading-tight text-muted">{label}</span>
        <span className="hidden size-4 shrink-0 place-items-center rounded-full @min-[300px]/em:grid" style={{ background: TONE_VARS[t.tone].soft }} aria-hidden>
          <Icon className="size-2.5" style={{ color: TONE_VARS[t.tone].ink }} strokeWidth={2.75} />
        </span>
      </span>
      <span className="flex min-w-0 items-end gap-1.5">
        <MiniColumns phase={phase} />
        <span className={cn("tabular whitespace-nowrap text-[14px] font-semibold leading-none", cur === null ? "text-muted" : "text-text")}>{cur === null ? "—" : `${nf1.format(cur)} d`}</span>
      </span>
      <span className="sr-only">
        {label}: {t.label}. {phase.message}. Semana actual: {days(cur)}.
      </span>
    </Tooltip>
  );
}

function PhaseCell({ phase, weeks, label }: { phase: EfficiencyPhase; weeks: string[]; label: string }) {
  const t = TREND[phase.tone];
  const Icon = t.icon;
  const cur = phase.values.at(-1) ?? null;
  return (
    <Tooltip content={phaseTip(phase, weeks, label)} focusable className="w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary">
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
      {/* Cobertura: fases con dato esta semana (la misma que usa el motor para el orden y el empate) */}
      <span className="tabular block text-[11px] text-muted">
        {r.score === null
          ? "Sin datos esta semana"
          : `Cuartil promedio ${nf1.format(r.score)} · ${phases.filter((p) => r.phases[p.key].quartiles.at(-1) != null).length} de ${phases.length} fases`}
      </span>
    </span>
  );

  return (
    // El contenedor mide el ancho; el tope de 640 px con scroll interno solo aplica en modo tabla
    // (en tarjetas el alto es por contenido: sin scroll anidado dentro de la página).
    <div className={cn("@container/em min-h-0", expanded && "h-full")}>
      <div
        className={cn(
          "flex min-h-0 flex-col [--em-bu:7px] [--em-bw:10px] @min-[848px]/em:[--em-bw:12px] @min-[1036px]/em:[--em-bu:8px] @min-[1036px]/em:[--em-bw:14px]",
          expanded ? "h-full" : layout.cap,
        )}
      >
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
          <div ref={scrollRef} onScroll={onScroll} {...dataAttrs} className="group/sc relative isolate min-h-0 flex-1 overflow-auto overscroll-contain">
            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Ninguna gerencia coincide con “{q}”.</p>
            ) : (
              <>
                <div className={layout.cards}>
                  <ul role="list" aria-label={widget.title} className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3">
                    {cards.map((r) => (
                      <li key={r.gerencia} className="rounded-xl border border-border p-2.5">
                        <div className="mb-2 flex items-start gap-2.5">
                          <RankBadge rank={r.ranking} tied={r.tied} medal={r.medal} />
                          {nameCell(r)}
                        </div>
                        {/* Fases en paralelo: 3 columnas (2×2 con 4 fases), ~120 px por gerencia */}
                        <div className={cn("grid gap-1.5", layout.grid)}>
                          {phases.map((p) => (
                            <PhaseCompact key={p.key} phase={r.phases[p.key]} weeks={result.weeks} label={p.label} />
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
                    <col style={{ width: RANK_W }} />
                    <col />
                    {phases.map((p) => (
                      <col key={p.key} style={{ width: phaseWidth(phases.length, layout.min, layout.max) }} />
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
