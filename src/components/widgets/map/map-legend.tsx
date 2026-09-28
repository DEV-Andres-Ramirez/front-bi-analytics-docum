"use client";

import { Info, MapPin } from "lucide-react";
import { ScaleLegend } from "@/components/widgets/kit/chart-legend";
import { cn } from "@/lib/cn";
import type { ClassMethod } from "./classify";

export interface LegendClass {
  color: string;
  label: string;
}

/**
 * Leyenda del mapa (legendSystem L8): clases por cuantiles con rangos reales, muestra
 * "Sin registros", nota del método y, en oscuro, "más claro = más". Vive dentro del panel,
 * nunca sobre el lienzo (el logo y la atribución quedan libres).
 */
export function MapLegend({
  title,
  hideTitle = false,
  classes,
  method,
  dark,
  className,
}: {
  title: string;
  /** Panel apilado: el encabezado ya nombra la métrica; el título queda solo para lectores de pantalla. */
  hideTitle?: boolean;
  classes: LegendClass[];
  method: ClassMethod | null;
  dark: boolean;
  className?: string;
}) {
  // El método sale de la clasificación (classify.ts), no del número de clases
  const methodNote = classes.length > 1 ? (method === "quantile" ? "Clases por cuantiles" : method === "unique" ? "Una clase por valor" : null) : null;
  const hint = [methodNote, dark ? "más claro = más" : null].filter(Boolean).join(" · ");
  if (hideTitle)
    return (
      <div role="group" aria-label={`Leyenda: ${title}`} className={className}>
        <ScaleLegend classes={classes} noData noDataHatch={dark} note={hint || undefined} />
      </div>
    );
  return <ScaleLegend className={className} title={title} classes={classes} noData noDataHatch={dark} note={hint || undefined} />;
}

/** Notas del mapa: contexto (KPI de vizOptions.mapContextKpi o vizOptions.mapContext) y nota del widget (geografía, calidad). */
export function MapNotes({ note, context, className }: { note?: string; context?: string; className?: string }) {
  if (!note && !context) return null;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {context && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-text-2">
          <MapPin className="mt-px size-3.5 shrink-0 text-muted" aria-hidden />
          <span>{context}</span>
        </p>
      )}
      {note && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{note}</span>
        </p>
      )}
    </div>
  );
}
