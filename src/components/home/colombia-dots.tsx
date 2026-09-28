import { cn } from "@/lib/cn";

/**
 * Silueta de Colombia (continental) en una malla hexagonal de puntos.
 * Se generó una sola vez desde public/data/geo/colombia-outline.json (paso 0,4°, 674 puntos);
 * es un único <path> de trazos de longitud 0 con remate redondo (un nodo en el DOM).
 * Decorativo: aria-hidden y sin eventos. El color sale de currentColor.
 */
const W = 64;
const H = 86.6;
const D = [
  "M35 1.73h0m2 0h0m2 0h0M34 3.46h0m2 0h0M31 5.2h0m2 0h0M26 6.93h0m2 0h0m2 0h0m2 0h0",
  "M19 8.66h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0M18 10.39h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M19 12.12h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0M18 13.86h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M17 15.59h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0M14 17.32h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M13 19.05h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M10 20.78h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M13 22.52h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M8 24.25h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M7 25.98h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M8 27.71h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M9 29.44h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M10 31.18h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m10 0h0",
  "M9 32.91h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M8 34.64h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M9 36.37h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M10 38.1h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M9 39.84h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M10 41.57h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M11 43.3h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M10 45.03h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M9 46.76h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M8 48.5h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M3 50.23h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M2 51.96h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M1 53.69h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M2 55.42h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m14 0h0",
  "M5 57.16h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M8 58.89h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M11 60.62h0m2 0h0m4 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M18 62.35h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M23 64.08h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M24 65.82h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M25 67.55h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M28 69.28h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M29 71.01h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0",
  "M30 72.74h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0m2 0h0M31 74.48h0m2 0h0m10 0h0m2 0h0m2 0h0M46 76.21h0",
  "M45 77.94h0M44 79.67h0m2 0h0M43 81.4h0m2 0h0",
].join("");

/** Ciudades principales (Bogotá, Medellín, Cali, Barranquilla, Bucaramanga) sobre la misma malla. */
const CITIES: [number, number][] = [
  [25, 39.84],
  [18, 31.18],
  [12, 45.03],
  [22, 6.93],
  [29, 25.98],
];

export function ColombiaDots({
  className,
  dot = 1.15,
  accentClassName,
}: {
  className?: string;
  /** Diámetro del punto (el paso de la malla es 2). */
  dot?: number;
  /** Si se indica, resalta las ciudades principales con esa clase de color (p. ej. "text-primary"). */
  accentClassName?: string;
}) {
  return (
    <svg
      viewBox={`-1 -1 ${W + 2} ${H + 2}`}
      aria-hidden
      focusable="false"
      className={cn("pointer-events-none select-none", className)}
      preserveAspectRatio="xMidYMid meet"
    >
      <path d={D} fill="none" stroke="currentColor" strokeWidth={dot} strokeLinecap="round" />
      {accentClassName && (
        <g className={accentClassName}>
          {CITIES.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={dot * 0.75} fill="currentColor" />
          ))}
        </g>
      )}
    </svg>
  );
}
