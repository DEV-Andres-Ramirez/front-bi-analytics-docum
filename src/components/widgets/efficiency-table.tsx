"use client";

import { AlertOctagon, ArrowDownRight, ArrowUpRight, CircleHelp, Minus, Search, ShieldCheck, Siren } from "lucide-react";
import { useMemo, useState } from "react";
import type { EfficiencyPhase, EfficiencyResult, EfficiencyTone } from "@/dashboards/dto";
import { cn } from "@/lib/cn";
import { norm } from "@/lib/geo/diccionario";
import { nf1 } from "@/lib/format";

const PHASES = [
  ["asignacion", "Asignación"],
  ["gestion", "Gestión"],
  ["revision", "Revisión"],
  ["aprobacion", "Aprobación"],
] as const;

const TONE: Record<EfficiencyTone, { cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  good: { cls: "bg-good-soft text-good-ink", icon: ShieldCheck },
  improving: { cls: "bg-good-soft text-good-ink", icon: ArrowDownRight },
  stable: { cls: "bg-surface-3 text-text-2", icon: Minus },
  worsening: { cls: "bg-warning-soft text-warning-ink", icon: ArrowUpRight },
  critical: { cls: "bg-critical-soft text-critical-ink", icon: AlertOctagon },
  alert: { cls: "bg-critical text-white", icon: Siren },
  unknown: { cls: "bg-surface-3 text-muted", icon: CircleHelp },
};

function PhaseCell({ phase, weeks }: { phase: EfficiencyPhase; weeks: string[] }) {
  const t = TONE[phase.tone];
  const Icon = t.icon;
  return (
    <div className="flex min-w-[170px] flex-col gap-1.5">
      <span className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", t.cls)}>
        <Icon className="size-3.5" />
        {phase.message}
      </span>
      <div className="flex items-end gap-1" aria-label="Últimas 3 semanas">
        {phase.values.map((v, i) => (
          <span key={i} className="flex flex-col items-center" title={`${weeks[i]}: ${v === null ? "sin dato" : `${nf1.format(v)} días`}${phase.quartiles[i] ? ` (Q${phase.quartiles[i]})` : ""}`}>
            <span
              className={cn("w-5 rounded-t-[3px]", i === 2 ? "bg-primary" : "bg-border-strong")}
              style={{ height: v === null ? 2 : 4 + (phase.quartiles[i] ?? 1) * 5 }}
            />
            <span className="tabular mt-0.5 text-[10px] text-muted">{v === null ? "–" : nf1.format(v)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Ranking semanal de eficiencia por gerencia (réplica de vw_reporte_datastudio_pqrd_eficiencia). */
export function EfficiencyTable({ result, height }: { result: EfficiencyResult; height: number }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const k = norm(q);
    return k ? result.rows.filter((r) => norm(r.gerencia).includes(k)) : result.rows;
  }, [q, result.rows]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar gerencia…" className="h-9 w-full rounded-xl border border-border bg-surface-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
        </label>
        <p className="text-xs text-muted">
          Semanas: {result.weeks.join(" · ")}. La barra naranja es la semana actual y la altura indica el cuartil.
        </p>
      </div>
      <div className="overflow-auto rounded-xl border border-border" style={{ maxHeight: height }}>
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr>
              <th className="w-16 border-b border-border px-3 py-2.5 text-left text-xs font-bold text-text-2">Ranking</th>
              <th className="sticky left-0 min-w-[220px] border-b border-border bg-surface-2 px-3 py-2.5 text-left text-xs font-bold text-text-2">Gerencia</th>
              {PHASES.map(([, label]) => (
                <th key={label} className="border-b border-border px-3 py-2.5 text-left text-xs font-bold text-text-2">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.gerencia} className="align-top hover:bg-surface-2/60">
                <td className="border-b border-border px-3 py-3">
                  <span className={cn("grid size-8 place-items-center rounded-full text-xs font-bold", r.ranking === null ? "bg-surface-3 text-muted" : r.ranking <= 3 ? "bg-primary text-white" : "bg-primary-soft-2 text-primary-strong")}>
                    {r.ranking ?? "–"}
                  </span>
                </td>
                <td className="sticky left-0 border-b border-border bg-surface px-3 py-3 font-semibold text-text-2">{r.gerencia}</td>
                {PHASES.map(([key]) => (
                  <td key={key} className="border-b border-border px-3 py-3">
                    <PhaseCell phase={r.phases[key]} weeks={result.weeks} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
