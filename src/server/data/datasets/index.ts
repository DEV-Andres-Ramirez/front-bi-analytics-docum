import "server-only";

import { entesControl } from "./entes-control";
import { entradasGenerales } from "./entradas-generales";
import { facturasEmitidas } from "./facturas-emitidas";
import { facturasRecibidas } from "./facturas-recibidas";
import { mlEntradas } from "./ml-entradas";
import { mlSalidas } from "./ml-salidas";
import { pqrd } from "./pqrd";
import { salidasGenerales } from "./salidas-generales";
import { smartM1 } from "./smart-m1";
import { smartM2 } from "./smart-m2";
import { smartM3 } from "./smart-m3";
import { tutelas } from "./tutelas";
import type { DatasetDef } from "./types";

export const DATASETS: Record<string, DatasetDef> = Object.fromEntries(
  [
    facturasRecibidas, facturasEmitidas, pqrd, entesControl, smartM1, smartM2, smartM3,
    tutelas, mlEntradas, mlSalidas, entradasGenerales, salidasGenerales,
  ].map((d) => [d.id, d]),
);

export type { DatasetDef };
