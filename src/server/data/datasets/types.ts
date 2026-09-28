import "server-only";

import type { MockConfig, MockRow } from "../mock/generator";
import type { ColumnKind, RowValue } from "../table";

/**
 * Dataset canónico = una vista de la BD (o varias unidas) con columnas limpias.
 * Los nombres de columna conservan los de la vista para que la fase SQL mapee 1:1.
 */
export interface DatasetDef {
  id: string;
  /** Vista(s) fuente en `oro_tableros`. */
  views: string[];
  schema: Record<string, ColumnKind>;
  /** Columnas geográficas (nombre o código DANE) → se resuelven a __dpto / __mpio. */
  geo?: { dpto: string; mpio?: string };
  /** Configuración del generador sintético (MockProvider). */
  mock: () => MockConfig;
  /** Limpieza de una fila (mock o BD) hacia valores canónicos. */
  normalize: (row: MockRow) => Record<string, RowValue>;
}
