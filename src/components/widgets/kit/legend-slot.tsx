"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useWidgetFrame } from "../frame-context";

/**
 * Coloca su contenido en la franja de leyenda de 24 px de la tarjeta (bajo el header).
 * side "start": leyendas (alineadas a la izquierda) · side "end": chips de calidad de dato.
 * Sin franja (diálogo ampliado, subtarjeta apilada) se dibuja en línea arriba del cuerpo.
 */
export function LegendSlot({ children, side = "start", className }: { children: ReactNode; side?: "start" | "end"; className?: string }) {
  const frame = useWidgetFrame();
  const el = side === "start" ? frame?.legendEl : frame?.chipsEl;
  if (el) return createPortal(children, el);
  return <div className={cn("mb-2 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1", side === "end" && "justify-end", className)}>{children}</div>;
}

/**
 * Controles del widget en el header de la tarjeta (a la izquierda del menú ⋯).
 * Sin header (diálogo ampliado) se dibujan en línea arriba del cuerpo, alineados a la derecha.
 */
export function HeaderSlot({ children }: { children: ReactNode }) {
  const frame = useWidgetFrame();
  if (frame?.headerEl) return createPortal(children, frame.headerEl);
  return <div className="mb-2 flex items-center justify-end gap-1.5">{children}</div>;
}
