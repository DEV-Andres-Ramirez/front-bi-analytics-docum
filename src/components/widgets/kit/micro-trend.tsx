"use client";

import { cn } from "@/lib/cn";

/**
 * Micro-tendencia en SVG (KPIs, Home, paleta).
 * - columns para medidas aditivas; line (1,5 px) para tasas y promedios.
 * - De-énfasis en --neutral-mark con el último tramo en el acento; null es un hueco, nunca 0.
 * - Crece una sola vez (500 ms); respeta prefers-reduced-motion.
 */
export function MicroTrend({
  values,
  kind = "columns",
  accent = "var(--primary)",
  base = "var(--neutral-mark)",
  weekends,
  label,
  className,
}: {
  values: (number | null)[];
  kind?: "columns" | "line";
  accent?: string;
  base?: string;
  /** Buckets de fin de semana (más tenues). */
  weekends?: boolean[];
  /** Resumen accesible ("Radicados por día: máximo 64"). */
  label?: string;
  className?: string;
}) {
  const n = values.length;
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (n < 2 || !nums.length) return <div className={cn("h-8", className)} aria-hidden />;
  const max = Math.max(...nums, 0);
  const min = kind === "line" ? Math.min(...nums) : 0;
  const span = max - min || 1;
  const W = 100;
  const H = 32;
  const lastIdx = values.findLastIndex((v) => v !== null);

  if (kind === "columns") {
    const bw = W / n;
    const gap = n > 40 ? 0.15 : n > 16 ? 0.25 : 0.3;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className={cn("h-8 w-full overflow-visible", className)}>
        <g className="micro-grow">
          {values.map((v, i) => {
            if (v === null || !Number.isFinite(v)) return null;
            const h = Math.max(v > 0 ? 1.2 : 0, (v / (max || 1)) * (H - 1));
            return (
              <rect
                key={i}
                x={i * bw + (bw * gap) / 2}
                y={H - h}
                width={bw * (1 - gap)}
                height={h}
                rx={Math.min(1, (bw * (1 - gap)) / 2)}
                fill={i === lastIdx ? accent : base}
                opacity={i === lastIdx ? 1 : weekends?.[i] ? 0.45 : 0.85}
              />
            );
          })}
        </g>
        <line x1="0" x2={W} y1={H - 0.25} y2={H - 0.25} stroke="var(--hairline)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }

  // Línea con huecos en null
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - 2 - ((v - min) / span) * (H - 4);
  const segments: string[] = [];
  let cur = "";
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (cur) segments.push(cur);
      cur = "";
      return;
    }
    cur += `${cur ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
  });
  if (cur) segments.push(cur);
  const last = values[lastIdx] as number;
  const prevIdx = values.slice(0, lastIdx).findLastIndex((v) => v !== null);
  const tail = prevIdx >= 0 ? `M${x(prevIdx).toFixed(2)},${y(values[prevIdx] as number).toFixed(2)}L${x(lastIdx).toFixed(2)},${y(last).toFixed(2)}` : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className={cn("h-8 w-full overflow-visible", className)}>
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={base} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {tail && <path d={tail} fill="none" stroke={accent} strokeWidth="2.25" vectorEffect="non-scaling-stroke" strokeLinecap="round" />}
    </svg>
  );
}
