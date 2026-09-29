import type { Measure, Predicate } from "../types";

/** Atajos para escribir specs legibles. */
export const count = (where?: Predicate): Measure => ({ kind: "count", where });
export const is = (field: string, ...values: string[]): Predicate => ({ field, in: values });
export const isNot = (field: string, ...values: string[]): Predicate => ({ field, notIn: values });
export const share = (num: Predicate, den?: Predicate): Measure => ({ kind: "ratio", num, den });
export const avg = (field: string, where?: Predicate): Measure => ({ kind: "avg", field, where });
export const sum = (field: string, where?: Predicate): Measure => ({ kind: "sum", field, where });
export const distinct = (field: string, where?: Predicate): Measure => ({ kind: "countDistinct", field, where });

export const SEMAFORO_ORDER = [
  "1. Cerrado a Tiempo",
  "2. Abierto En Término",
  "3. Abierto Próximo a Vencer",
  "4. Cerrado Vencido",
  "5. Abierto Vencido",
  "6. Sin Clasificar",
];
/**
 * Etiquetas del semáforo dentro de los grupos Abiertos | Cerrados de StatusStrip: el prefijo "Abierto"/"Cerrado"
 * sobra (lo dice el grupo) y hacía envolver las tiles a 1024 px. Solo presentación (vizOptions.overrides).
 */
export const SEMAFORO_TILE_LABELS: Record<string, { label: string }> = {
  "1. Cerrado a Tiempo": { label: "A tiempo" },
  "2. Abierto En Término": { label: "En término" },
  "3. Abierto Próximo a Vencer": { label: "Próximo a vencer" },
  "4. Cerrado Vencido": { label: "Vencido" },
  "5. Abierto Vencido": { label: "Vencido" },
};
export const SLA_ORDER = ["A tiempo", "Preventiva", "Por vencer", "Vencido", "Sin categoría", "No reporta"];
export const DIAS_ORDER = ["1. Lunes", "2. Martes", "3. Miércoles", "4. Jueves", "5. Viernes", "6. Sábado", "7. Domingo"];
/**
 * Medio de envío (ML salidas y Correspondencia entradas): el color sigue al medio en los dos tableros
 * (CompositionBar pinta los slots en el orden del spec): certificado chart-1, correo electrónico chart-2,
 * mensajero chart-3 y courier chart-4, igual que el desglose del mapa de ML salidas. Sin topN, solo cambia
 * el orden de las mismas categorías; "No reporta" sigue al final.
 */
export const MEDIO_ENVIO_ORDER = ["Correo electrónico certificado", "Correo electrónico", "Mensajero", "Courier"];
