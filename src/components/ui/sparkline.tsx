import { useId } from "react";

/** Sparkline SVG liviano (tarjetas del catálogo). */
export function Sparkline({ values, className, stroke = "var(--primary)" }: { values: (number | null)[]; className?: string; stroke?: string }) {
  const id = useId();
  const pts = values.map((v) => v ?? 0);
  if (pts.length < 2) return <svg className={className} aria-hidden />;
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts, 0);
  const w = 120;
  const h = 36;
  const x = (i: number) => (i / (pts.length - 1)) * w;
  const y = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
