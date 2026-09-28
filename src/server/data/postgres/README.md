# Conexión a la base de datos real (pendiente)

Hoy el aplicativo corre con `DATA_SOURCE=mock` (datos sintéticos anonimizados).
Este documento resume cómo conectar la fuente real **sin tocar la UI**.

## Contrato

Implementar `DataProvider` (`src/server/data/provider.ts`) con las mismas tres
operaciones que el `MockProvider`:

| Operación | Entrada | Salida |
|---|---|---|
| `dashboard(spec, filters)` | `DashboardSpec` + `FiltersState` | `DashboardResponse` (KPIs, widgets, opciones de filtro) |
| `detail(spec, filters, query)` | + paginación, orden, búsqueda | `DetailResponse` |
| `csv(spec, filters, query)` | ídem | CSV `;` con BOM |

Cada spec es declarativo (medidas, predicados, dimensiones), así que se puede
compilar a SQL `GROUP BY` sobre la vista del dataset (`DatasetDef.views`).

## Opciones de implementación

1. **Agregación en SQL (recomendado para volúmenes grandes).** Traducir
   `Measure` / `Predicate` a expresiones SQL (`COUNT(*) FILTER (WHERE …)`,
   `AVG(…)`, `COUNT(DISTINCT …)`), los normalizadores de `normalizers.ts` a
   `CASE`, y la fecha principal a un `WHERE fecha BETWEEN $1 AND $2`.
2. **Híbrido.** Traer solo las columnas del `schema` del dataset para el rango
   (más el periodo anterior) y reutilizar el motor en memoria (`engine/*`)
   construyendo la `Table` con `TableBuilder`. Sirve para vistas de volumen bajo
   (Entes de Control, SMART).

## Hallazgos que condicionan la conexión

- `top_secret/db/db.sql` está escrito en **SQL de BigQuery**
  (`positiva-sgda-prd-416417.oro_tableros`), no PostgreSQL. Solo SMART M1/M2/M3 y
  Tutelas leen tablas `bronce_gcpprolinktic.public_*` (réplica de Postgres). Las
  demás dependen de tablas `oro_gcpprolinktic.tb_*` no definidas en el script y
  Facturación viene de `ms_facturacion_core`. **Confirmar con el equipo si el
  front leerá BigQuery (vistas `oro_tableros`) o Cloud SQL (Postgres vía túnel).**
- Formatos de fecha heterogéneos (ver `normalizers.ts` y AGENTS.md).
- Las vistas son de **solo lectura**: nunca ejecutar DDL/DML.
- Credenciales solo en `.env.local` (`DB_*`), nunca versionadas.
