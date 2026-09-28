import type { ValueFormat } from "@/dashboards/types";

/** Formato numérico es-CO: miles con ".", decimales con ",". */
const nf0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfUpTo1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const nfUpTo2 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

export const formatInt = (n: number) => nf0.format(n);

/** 12.925 → "12,9 mil" · 7.625.950.000 → "7,6 mil M" · 1.250.000 → "1,3 M" */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${nfUpTo2.format(n / 1e9)} mil M`;
  if (abs >= 1e6) return `${nfUpTo1.format(n / 1e6)} M`;
  if (abs >= 1e4) return `${nfUpTo1.format(n / 1e3)} mil`;
  return nfUpTo1.format(n);
}

export function formatCOP(n: number, compact = true): string {
  return compact ? `$ ${formatCompact(n)}` : `$ ${nf0.format(n)}`;
}

export function formatPct(ratio: number, digits = 1): string {
  return `${(digits === 2 ? nf2 : digits === 0 ? nf0 : nf1).format(ratio * 100)} %`;
}

export function formatValue(value: number | null | undefined, format: ValueFormat = "int", opts?: { compact?: boolean }): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  switch (format) {
    case "pct":
      return formatPct(value, 2);
    case "days":
      return `${nfUpTo2.format(value)} d`;
    case "decimal":
      return nfUpTo2.format(value);
    case "cop":
      return formatCOP(value, opts?.compact ?? true);
    case "compact":
      return formatCompact(value);
    case "int":
    default:
      return opts?.compact ? formatCompact(value) : nf0.format(Math.round(value));
  }
}

/** Valor corto para ejes y etiquetas de barras. */
export function formatAxis(value: number, format: ValueFormat = "int"): string {
  if (format === "pct") return `${nf0.format(value * 100)} %`;
  if (format === "cop") return `$ ${formatCompact(value)}`;
  if (format === "days") return `${nfUpTo1.format(value)} d`;
  return formatCompact(value);
}

/** +5,7 % / −30,6 % */
export function formatDelta(delta: number): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return `${sign}${nf1.format(Math.abs(delta) * 100)} %`;
}

export { nf1, nf2 };
