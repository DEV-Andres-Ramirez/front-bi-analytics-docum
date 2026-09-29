"use client";

import { cn } from "@/lib/cn";

/**
 * Micro-tendencia en SVG (KPIs, Home, paleta).
 * - columns para medidas aditivas; line (1,5 px) para tasas y promedios.
 * - De-énfasis en --neutral-mark con el último tramo en el acento; null es un hueco, nunca 0.
 * - En línea, los huecos internos se unen con un conector punteado (no inventa valores) y un punto aislado
 *   se ve como punto; si el último valor viene tras un hueco, el acento es un punto y no un tramo.
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
  const lastIdx = values.findLastIndex((v) => v !== null && Number.isFinite(v));

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

  // Línea: tramos continuos sólidos; los huecos internos (null) se unen con un conector punteado del color base,
  // así la línea se lee continua sin dibujar valores inventados. Los huecos del inicio y del final no se unen.
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => H - 2 - ((v - min) / span) * (H - 4);
  const pt = (i: number) => `${x(i).toFixed(2)},${y(values[i] as number).toFixed(2)}`;
  const runs: number[][] = [];
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) return;
    const run = runs.at(-1);
    if (run && run[run.length - 1] === i - 1) run.push(i);
    else runs.push([i]);
  });
  // Un punto aislado es un trazo de largo 0: con extremo redondo se dibuja como un punto (antes no se veía)
  const solid = runs.map((r) => (r.length === 1 ? `M${pt(r[0])}h0` : r.map((i, k) => `${k ? "L" : "M"}${pt(i)}`).join(""))).join("");
  const bridges = runs
    .slice(1)
    .map((r, k) => `M${pt(runs[k][runs[k].length - 1])}L${pt(r[0])}`)
    .join("");
  const prevIdx = values.slice(0, lastIdx).findLastIndex((v) => v !== null && Number.isFinite(v));
  // Último tramo en el acento solo si es contiguo; tras un hueco, el acento marca el último punto
  const tail = prevIdx === lastIdx - 1 ? `M${pt(prevIdx)}L${pt(lastIdx)}` : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className={cn("h-8 w-full overflow-visible", className)}>
      {bridges && (
        <path d={bridges} fill="none" stroke={base} strokeWidth="1.5" strokeDasharray="0 3.5" opacity={0.75} vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      )}
      <path d={solid} fill="none" stroke={base} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      {tail ? (
        <path d={tail} fill="none" stroke={accent} strokeWidth="2.25" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      ) : (
        <path d={`M${pt(lastIdx)}h0`} fill="none" stroke={accent} strokeWidth="3.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
      )}
    </svg>
  );
}
