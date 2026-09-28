"use client";

import { createContext, useContext, useEffect } from "react";

export interface FrameCtx {
  expanded: boolean;
  setExporter: (fn: (() => string | null) | null) => void;
}

export const WidgetFrameContext = createContext<FrameCtx | null>(null);

export function useWidgetFrame() {
  return useContext(WidgetFrameContext);
}

/** Registra cómo exportar el widget a PNG (canvas de Chart.js o de Mapbox). */
export function useExporter(getDataUrl: () => string | null) {
  const frame = useContext(WidgetFrameContext);
  useEffect(() => {
    frame?.setExporter(getDataUrl);
    return () => frame?.setExporter(null);
  }, [frame, getDataUrl]);
}
