import type { DashboardSpec } from "../types";
import { correspondenciaEntradas } from "./correspondencia-entradas";
import { correspondenciaSalidas } from "./correspondencia-salidas";
import { entesControl } from "./entes-control";
import { entesControlEficiencia } from "./entes-control-eficiencia";
import { facturasEmitidas } from "./facturas-emitidas";
import { facturasRecibidas } from "./facturas-recibidas";
import { medicinaLaboralEntradas } from "./medicina-laboral-entradas";
import { medicinaLaboralSalidas } from "./medicina-laboral-salidas";
import { pqrd } from "./pqrd";
import { smartMomento1 } from "./smart-momento-1";
import { smartMomento2 } from "./smart-momento-2";
import { smartMomento3 } from "./smart-momento-3";
import { tutelas } from "./tutelas";

export const SPECS: Record<string, DashboardSpec> = Object.fromEntries(
  [
    facturasRecibidas, facturasEmitidas, pqrd, entesControl, entesControlEficiencia,
    smartMomento1, smartMomento2, smartMomento3, tutelas, medicinaLaboralEntradas,
    medicinaLaboralSalidas, correspondenciaEntradas, correspondenciaSalidas,
  ].map((s) => [s.slug, s]),
);
