"use client";

import { Info, MapPin } from "lucide-react";
import { ScaleLegend } from "@/components/widgets/kit/chart-legend";
import { cn } from "@/lib/cn";

export interface LegendClass {
  color: string;
  label: string;
}

/**
 * Leyenda del mapa (legendSystem L8): clases por cuantiles con rangos reales, muestra
 * "Sin registros", nota del método y, en oscuro, "más claro = más". Vive dentro del panel,
 * nunca sobre el lienzo (el logo y la atribución quedan libres).
 */
export function MapLegend({ title, classes, dark, className }: { title: string; classes: LegendClass[]; dark: boolean; className?: string }) {
  const method = classes.length >= 5 ? "Clases por cuantiles" : classes.length > 1 ? "Una clase por valor" : null;
  const hint = [method, dark ? "más claro = más" : null].filter(Boolean).join(" · ");
  return <ScaleLegend className={className} title={title} classes={classes} noData note={hint || undefined} />;
}

/** Notas del mapa: contexto (vizOptions.mapContext) y nota del widget (geografía, calidad). */
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
