"use client";

import type { Chart, Plugin } from "chart.js";

const retries = new WeakMap<Chart, number>();

/**
 * Plugin de Chart.js: si el contenedor mide 0 un instante (reflujo de toda la página), Chart.js deja el
 * lienzo en 0 px y no siempre recibe el siguiente ResizeObserver. Se reintenta hasta recuperar el ancho.
 */
export const RESIZE_RECOVERY: Plugin = {
  id: "documResizeRecovery",
  resize(chart, args) {
    if (args.size.width > 0 || retries.has(chart)) return;
    let tries = 0;
    // Primer intento en el siguiente cuadro; luego cada 100 ms (máximo ~3 s)
    const check = () => {
      retries.delete(chart);
      const parent = chart.canvas?.parentElement;
      if (!parent || !chart.canvas.isConnected || chart.width > 0) return;
      if (parent.clientWidth > 0) chart.resize();
      else if (tries++ < 30) retries.set(chart, window.setTimeout(check, 100));
    };
    retries.set(chart, window.requestAnimationFrame(check));
  },
  afterDestroy(chart) {
    const t = retries.get(chart);
    if (t) {
      window.cancelAnimationFrame(t);
      window.clearTimeout(t);
    }
    retries.delete(chart);
  },
};
