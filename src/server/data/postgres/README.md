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

## Contrato de datos v2 (rediseño UI/UX) y su SQL equivalente

El `MockProvider` ya implementa todo lo de esta sección en `src/server/data/engine/*` (con
pruebas en `engine/*.test.ts`). Un provider SQL debe devolver exactamente lo mismo. Los
ejemplos están en **SQL de BigQuery** (la fuente real, ver arriba); al final de cada punto se
indica el equivalente en PostgreSQL cuando cambia. `@from`, `@to`, `@prevFrom` y `@prevTo` son
fechas `YYYY-MM-DD` inclusivas (hora de pared de Bogotá).

### 1. Filtros omitidos por widget (`skipFields`) · "filtrar es resaltar"

`selectRows(table, filters, { skipFields })` aplica todos los filtros de la URL salvo los de
esos campos (eq, text y dates). Se usa en dos casos:

- **Opciones facetadas**: la lista de cada filtro `multi` se calcula sin su propio campo
  (`skipFields: [f.field]`).
- **Filtro cruzado**: cuando la dimensión de un widget tiene un filtro activo en
  `filters.eq`, el widget se calcula **sin** ese filtro para conservar todas sus categorías
  (el cliente resalta lo seleccionado y atenúa el resto). Aplica a `bar` (salvo
  `noCrossFilter`), `donut`, `bartable` (su primera columna) y `map` (`__dpto` y `__mpio`).
  Sin filtro activo en la dimensión no hay consulta extra; las filas omitidas se reutilizan
  entre widgets con la misma dimensión (`ownFilterFields` en `engine/run.ts`).

```sql
-- ?f.canal_de_radicacion=Web&f.tipologia=Queja → widget "canales" (dimensión canal_de_radicacion)
SELECT canal_de_radicacion AS label, COUNT(*) AS value
FROM `oro_tableros.vw_reporte_datastudio_pqrd`
WHERE fecha_de_radicado BETWEEN @from AND @to
  AND tipologia IN UNNEST(@tipologia)          -- los demás filtros SÍ aplican
  -- sin "AND canal_de_radicacion IN UNNEST(@canal)": es la dimensión del widget
GROUP BY label;

-- Mapa con ?f.__dpto=11: la coropleta se calcula sin el filtro geográfico (dpto y mpio).
-- __dpto/__mpio son los códigos DANE que resuelve src/lib/geo/diccionario.ts; en SQL se
-- obtienen con una tabla de cruce (nombre normalizado → código) cargada desde divipola.json.
```

### 2. Orden de categorías: neutrales al final (`orderLabels`, `neutralsLast`)

Lo neutral (`isNeutral` de `src/lib/charts/semantic.ts`: "No reporta", "Sin categoría",
"Sin responsable asignado", "N/A"…) va al final y "Otros" siempre de último. Excepción: una
etiqueta neutral declarada en el orden natural del spec (`sort: "natural"` + `order`, p. ej.
"6. Sin Clasificar" del semáforo) conserva su posición. El `topN` se elige **antes** de mover
los neutrales, así un "No reporta" grande no desaparece del top. Lo mismo aplica a filas de
`bartable` (por su primera celda), nodos de `drilldown` y filas/columnas de `pivot` sin orden
fijo. Se recomienda ordenar en TypeScript con las mismas funciones; en SQL sería:

```sql
ORDER BY
  label = 'Otros',                                            -- "Otros" de último
  (LOWER(label) IN ('', 'no reporta', 'sin categoría', 'sin clasificar', 'n/a', 'no aplica',
                    'sin responsable asignado', 'sin dato', 'sin definir')
   OR STARTS_WITH(LOWER(label), 'no reporta'))
    AND label NOT IN UNNEST(@orden_explicito),               -- neutrales al final
  value DESC
```

### 3. Resto fuera del top (`CategoryResult.rest`)

Cuando una barra tiene `topN` **sin** `others` y la medida es aditiva (`count` o `sum`), la
respuesta incluye `rest = { count, value }`: cuántas categorías quedaron fuera y cuánto suman
(para "Top 15 de 42 · 91 % del total"). Con `others` se sigue agregando la barra "Otros" (sin
`rest`); con medidas no aditivas (`avg`, `ratio`, `countDistinct`) no hay `rest`.

```sql
WITH g AS (
  SELECT oficina AS label, COUNT(*) AS value
  FROM vista WHERE <filtros> GROUP BY label
), r AS (
  SELECT label, value, ROW_NUMBER() OVER (ORDER BY value DESC, label) AS rn FROM g
)
SELECT label, value FROM r WHERE rn <= @topN                       -- categorías visibles
UNION ALL
SELECT '__rest__' AS label, SUM(value) FROM r WHERE rn > @topN;   -- rest.value
-- rest.count = (SELECT COUNT(*) FROM r WHERE rn > @topN); total = SUM(value) de g
```

### 4. Pivotes estables (`rowOrder`, `stableRows`, `stableColumns`, `fillNumericColumns`)

- `rowOrder`: orden fijo del primer nivel (con dos niveles, el orden de los grupos). Lo que no
  está en la lista va después, por total descendente y con lo neutral al final.
- `stableRows` (requiere `rowOrder`, solo con un nivel de fila): cada etiqueta de `rowOrder`
  aparece aunque esté en 0.
- `stableColumns`: columnas presentes aunque estén en 0 (nunca las de `columnExclude`).
- `fillNumericColumns`: columnas numéricas (p. ej. horas) ordenadas numéricamente y con los
  huecos enteros del rango min–max rellenos en 0; lo no numérico ("No reporta") al final.

Ejemplo: widget `dia-hora` de facturas emitidas (`rows [dia_semana]`, `rowOrder: DIAS_ORDER`,
`stableRows`, `columns Solo_Hora`, `fillNumericColumns`):

```sql
WITH dias AS (
  SELECT dia, pos FROM UNNEST(['1. Lunes','2. Martes','3. Miércoles','4. Jueves',
                                '5. Viernes','6. Sábado','7. Domingo']) AS dia WITH OFFSET pos
), celdas AS (
  SELECT dia_semana AS dia, Solo_Hora AS hora, COUNT(*) AS n
  FROM `oro_tableros.vw_reporte_datastudio_facturacion_factura_manual`
  WHERE fecha_expedicion BETWEEN @from AND @to AND <filtros>
  GROUP BY dia, hora
), horas AS (
  SELECT hora FROM UNNEST(GENERATE_ARRAY((SELECT MIN(hora) FROM celdas),
                                         (SELECT MAX(hora) FROM celdas))) AS hora
)
SELECT d.dia, h.hora, COALESCE(c.n, 0) AS n
FROM dias d CROSS JOIN horas h
LEFT JOIN celdas c ON c.dia = d.dia AND c.hora = h.hora
ORDER BY d.pos, h.hora;
-- PostgreSQL: unnest(ARRAY[...]) WITH ORDINALITY y generate_series(min, max).
-- stableColumns: igual, con UNNEST(@stable_columns) unido (UNION DISTINCT) a las columnas presentes.
```

### 5. Nombre de la serie por defecto

Una `timeseries` sin `series` explícitas nombra su serie con `spec.unit.plural` con mayúscula
inicial ("Radicados", "Tutelas"); sin `unit`, "Registros". Es solo presentación (sin SQL).

### 6. Alias de datos (`normalizers.ts` → `ALIASES`)

Variantes de escritura de un mismo valor, tratadas igual que WEB/Web. La comparación es sin
distinguir mayúsculas y sobre el texto limpio (`cleanText`), después de `orNoReporta`.

| Dataset | Columna | Fuente | Canónico |
|---|---|---|---|
| `tutelas` | `Estado_del_fallo` | `Informativos` | `Informativo` |
| `ml_entradas` | `estado_salida` | `Por recibir correspondencia` | `Por recibir en correspondencia` |

```sql
CASE
  WHEN Estado_del_fallo IS NULL
    OR LOWER(TRIM(Estado_del_fallo)) IN ('', 'null', 'none', 'n/a', 'na', 'no reporta', 'no reporta sin fecha vencimiento', 'sin definir')
    THEN 'No reporta'
  WHEN LOWER(TRIM(Estado_del_fallo)) = 'informativos' THEN 'Informativo'
  ELSE TRIM(Estado_del_fallo)
END AS Estado_del_fallo,

CASE
  WHEN estado_salida IS NULL
    OR LOWER(TRIM(estado_salida)) IN ('', 'null', 'none', 'n/a', 'na', 'no reporta', 'no reporta sin fecha vencimiento', 'sin definir')
    THEN 'No reporta'
  WHEN LOWER(TRIM(estado_salida)) = 'por recibir correspondencia' THEN 'Por recibir en correspondencia'
  ELSE TRIM(estado_salida)
END AS estado_salida
```

(`estado` de entradas generales conserva "Por recibir correspondencia": el alias es solo de
`estado_salida` de Medicina Laboral entradas.)

**Plazo en días** (`diasPlazo`, Tutelas · `Tiempo_para_responder`): la fuente trae "2 dia(s)",
"0 dias"…; se muestra "1 día" / "N días" y, sin número, "No reporta".

```sql
CASE
  WHEN REGEXP_EXTRACT(Tiempo_para_responder, r'\d+') IS NULL THEN 'No reporta'
  WHEN CAST(REGEXP_EXTRACT(Tiempo_para_responder, r'\d+') AS INT64) = 1 THEN '1 día'
  ELSE CONCAT(CAST(CAST(REGEXP_EXTRACT(Tiempo_para_responder, r'\d+') AS INT64) AS STRING), ' días')
END AS Tiempo_para_responder
```

### 7. Catálogo del Home (`GET /api/catalogo`)

Devuelve `CatalogResponse` (`src/dashboards/dto.ts`):

```jsonc
{
  "range": { "from": "2026-09-01", "to": "2026-09-28", "prevFrom": "2026-08-04", "prevTo": "2026-08-31" },
  "updatedAt": "2026-09-28T13:45:45.528Z",
  "source": "mock",
  "items": [
    { "slug": "pqrd",
      "hero":   { "kpi": "radicados", "label": "…", "short": "…", "format": "int", "polarity": "neutral",
                  "value": 1016, "previous": 868, "spark": [/* un valor por día */] },
      "health": { "kpi": "sla", "format": "pct", "polarity": "up-good", "value": 0.67, "previous": 0.629, "spark": [] } }
  ]
}
```

- `range`: mes en curso hasta hoy y el periodo anterior de igual duración (`previousRange`).
- `hero` = `DashboardMeta.headlineKpi`; `health` = `DashboardMeta.healthKpi`
  (`src/config/dashboards.ts`). `null` si el KPI no existe o el cálculo falla.
- **Una sola llamada al provider por tablero**: `provider.dashboard({ ...spec, kpis: [hero, health],
  sections: [], filters: [] }, { from, to, eq: {}, text: {}, dates: {} })`. En SQL, una consulta por
  vista con agregación condicional sobre el rango actual y el anterior:

```sql
SELECT
  COUNTIF(fecha_de_radicado BETWEEN @from AND @to)                               AS hero_value,
  COUNTIF(fecha_de_radicado BETWEEN @prevFrom AND @prevTo)                       AS hero_previous,
  SAFE_DIVIDE(COUNTIF(fecha_de_radicado BETWEEN @from AND @to AND <cumple_sla>),
              COUNTIF(fecha_de_radicado BETWEEN @from AND @to))                  AS health_value,
  SAFE_DIVIDE(COUNTIF(fecha_de_radicado BETWEEN @prevFrom AND @prevTo AND <cumple_sla>),
              COUNTIF(fecha_de_radicado BETWEEN @prevFrom AND @prevTo))          AS health_previous
FROM `oro_tableros.vw_reporte_datastudio_pqrd`
WHERE fecha_de_radicado BETWEEN @prevFrom AND @to;
-- spark: la misma agregación con GROUP BY DATE(fecha_de_radicado) sobre [@from, @to]
-- (semanas si el rango supera 92 días, meses si supera 400: ver bucketSeries).
-- PostgreSQL: COUNT(*) FILTER (WHERE …) y NULLIF(…, 0) en lugar de COUNTIF/SAFE_DIVIDE.
```

Los KPIs con `dateField` alterno (p. ej. "Aprobados en el periodo") filtran el rango por esa
columna en su propia expresión condicional.
