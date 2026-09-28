"use client";

import { cn } from "@/lib/cn";
import { SAN_ANDRES_RING } from "@/lib/geo/bounds";

const W = 76;
const H = 64;
const ISLAND_H = 34;

/** Silueta de la isla de San Andrés proyectada (equirectangular corregida por latitud) a un alto fijo. */
const ISLAND = (() => {
  const xs = SAN_ANDRES_RING.map((p) => p[0]);
  const ys = SAN_ANDRES_RING.map((p) => p[1]);
  const [w, e, s, n] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const scale = ISLAND_H / (n - s);
  const width = (e - w) * k * scale;
  const d = SAN_ANDRES_RING.map(([x, y], i) => `${i ? "L" : "M"}${((x - w) * k * scale).toFixed(1)},${((n - y) * scale).toFixed(1)}`).join("") + "Z";
  return { d, width: Math.max(8, Math.ceil(width)) };
})();

/**
 * Recuadro del archipiélago (mapRedesign 8): 76×64 abajo a la izquierda del lienzo, con el
 * polígono 88 en el color de su clase, rótulo y valor. Clic selecciona el código 88.
 */
export function SanAndresInset({
  color,
  value,
  selected,
  onSelect,
  onHover,
  label,
}: {
  color: string;
  /** Valor ya formateado ("3" o "Sin registros"). */
  value: string;
  selected: boolean;
  onSelect: () => void;
  onHover: (on: boolean) => void;
  /** Etiqueta accesible completa. */
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      style={{ width: W, height: H }}
      className={cn(
        "absolute bottom-3 left-3 z-10 flex flex-col rounded-lg border bg-surface/95 px-1.5 pb-1 pt-1 text-left shadow-card backdrop-blur transition",
        "hover:border-text-2/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        selected ? "border-primary-strong ring-1 ring-primary-strong" : "border-border",
      )}
    >
      <span className="block whitespace-nowrap text-[10px] font-semibold leading-3 text-text-2">San Andrés</span>
      <span className="mt-0.5 flex min-h-0 flex-1 items-end gap-1.5">
        <svg width={ISLAND.width} height={ISLAND_H} viewBox={`0 0 ${ISLAND.width} ${ISLAND_H}`} aria-hidden className="shrink-0 overflow-visible">
          <path d={ISLAND.d} fill={color} stroke={selected ? "var(--primary-strong)" : "var(--text-2)"} strokeOpacity={selected ? 1 : 0.6} strokeWidth={selected ? 1.5 : 0.8} strokeLinejoin="round" />
        </svg>
        <span className="tabular min-w-0 pb-0.5 text-[12px] font-bold leading-tight text-text">{value}</span>
      </span>
    </button>
  );
}
