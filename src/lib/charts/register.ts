"use client";

import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Flow, SankeyController } from "chartjs-chart-sankey";
import { RESIZE_RECOVERY } from "./resize-recovery";

/** Registro único de Chart.js (solo lo que usamos, para un bundle liviano). */
let registered = false;
export function registerCharts() {
  if (registered) return;
  Chart.register(
    ArcElement, BarController, BarElement, CategoryScale, DoughnutController, Filler, Legend,
    LinearScale, LineController, LineElement, PointElement, Tooltip, SankeyController, Flow,
    // Recupera lienzos que quedaron en 0 px tras un reflujo de la página
    RESIZE_RECOVERY,
  );
  // El canvas no resuelve variables CSS: se usa la familia real generada por next/font
  Chart.defaults.font.family =
    typeof document !== "undefined" ? getComputedStyle(document.body).fontFamily : "Montserrat, ui-sans-serif, system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.plugins.legend.display = false;
  // set() fusiona con los descriptores internos (asignar el objeto rompe las animaciones)
  Chart.defaults.set("animation", { duration: 700, easing: "easeOutQuart" });
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.responsive = true;
  registered = true;
}
