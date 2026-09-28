"use client";

import { createContext, useContext, useEffect } from "react";

export type Exporter = () => string | null | Promise<string | null>;

export interface FrameCtx {
  expanded: boolean;
  setExporter: (fn: Exporter | null) => void;
  /** Nodo de la franja de leyenda (izquierda) bajo el header; null → la leyenda va en línea. */
  legendEl: HTMLElement | null;
  /** Nodo de la franja para chips (derecha): calidad de dato, "Sin dato: N". */
  chipsEl: HTMLElement | null;
  /** Nodo de controles en el header (Segmented Día/Semana/Mes, Mapa de árbol | Lista, Cantidad | %). */
  headerEl: HTMLElement | null;
}

export const WidgetFrameContext = createContext<FrameCtx | null>(null);

export function useWidgetFrame() {
  return useContext(WidgetFrameContext);
}

/** Registra cómo exportar el widget a PNG (canvas de Chart.js, Mapbox compuesto…). */
export function useExporter(getDataUrl: Exporter) {
  const frame = useContext(WidgetFrameContext);
  useEffect(() => {
    frame?.setExporter(getDataUrl);
    return () => frame?.setExporter(null);
  }, [frame, getDataUrl]);
}
