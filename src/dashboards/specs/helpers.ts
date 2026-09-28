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
export const SLA_ORDER = ["A tiempo", "Preventiva", "Por vencer", "Vencido", "Sin categoría", "No reporta"];
export const DIAS_ORDER = ["1. Lunes", "2. Martes", "3. Miércoles", "4. Jueves", "5. Viernes", "6. Sábado", "7. Domingo"];
