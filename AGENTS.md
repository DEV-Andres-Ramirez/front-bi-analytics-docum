<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Docum BI · Guía para agentes

Front-end de **13 tableros de seguimiento de flujos documentales** de **Positiva Compañía de Seguros** (SGDEA / "Docum"). Reemplaza los tableros de Looker Studio (Data Studio), que tenían mala UI y peor UX. Replica **todos** sus componentes de negocio con una interfaz moderna, animada, consistente y responsiva.

Lee este documento completo antes de tocar código. Todo el texto de la UI está en **español (Colombia)**.

---

## 1. Contexto de negocio

| Módulo | Tableros (slug) | Vista(s) fuente en BD |
|---|---|---|
| Facturación Electrónica | `facturas-recibidas` | `vw_reporte_datastudio_facturacion_factura_recibida` + `…_provider` |
| | `facturas-emitidas` | `vw_reporte_datastudio_facturacion_factura_manual` + `…_acquirer` |
| PQRD y Entes de Control | `pqrd` | `vw_reporte_datastudio_pqrd` (+ `…_pqrd_eficiencia`, ver §6) |
| | `entes-control` | `vw_reporte_datastudio_entes_control` |
| | `entes-control-eficiencia` | `vw_reporte_datastudio_entes_control` |
| SMART Supervisión (Superfinanciera) | `smart-momento-1` | `vw_reporte_datastudio_smart_momento1` |
| | `smart-momento-2` | `vw_reporte_datastudio_smart_momento2` |
| | `smart-momento-3` | `vw_reporte_datastudio_smart_momento3` |
| Tutelas | `tutelas` | `vw_reporte_datastudio_tutelas` |
| Medicina Laboral | `medicina-laboral-entradas` | `vw_reporte_datastudio_medicina_laboral_entradas` |
| | `medicina-laboral-salidas` | `vw_reporte_datastudio_medicina_laboral_salidas` |
| Correspondencia | `correspondencia-entradas` | `vw_reporte_datastudio_entradas_generales` |
| | `correspondencia-salidas` | `vw_reporte_datastudio_salidas_generales` |

- **Las vistas son de solo lectura.** Nunca ejecutar DDL/DML.
- `vw_Reporte_Entes_Control` tiene el mismo SQL que `vw_reporte_datastudio_entes_control`; se usa la segunda.
- `reporte_smart_momento1/2/3` son la base cruda de las vistas `vw_…smart_momento*`, que son las que se usan.
- Los enlaces a los tableros originales de Looker están en `top_secret/context/enlaces.md` (solo local).

### Terminología
- **Radicado**: documento registrado (`ENT…` entrada, `SAL…` salida).
- **SLA / tiempo por vencer**: días hábiles para responder.
- **Semáforo de riesgo**: 1 Cerrado a tiempo · 2 Abierto en término · 3 Abierto próximo a vencer · 4 Cerrado vencido · 5 Abierto vencido · 6 Sin clasificar.
- **Categoría SLA (`Aux_Categoria`)**: A tiempo / Preventiva / Por vencer / Vencido.
- **Momentos SMART**: M1 registro de la queja, M2 transmisión a la Superfinanciera, M3 gestión (GESTIÓN) y cierre (CIERRE).

---

## 2. Stack

| Pieza | Versión | Notas |
|---|---|---|
| Next.js | 16.3.6 | App Router, `src/`, Turbopack. **`middleware` ahora es `src/proxy.ts`.** `params`/`searchParams` son async. `PageProps`, `LayoutProps` y `RouteContext` son globales (se generan con `npx next typegen`). |
| React | 19.2 | `ViewTransition` de `react` sin configuración. Reglas del React Compiler activas en ESLint (no leer refs en render, no `setState` síncrono en efectos). |
| Tailwind CSS | v4 | Tokens en `src/app/globals.css` (`@theme inline`, `@custom-variant dark`, `@utility`). |
| Chart.js + react-chartjs-2 | 4.5 / 5.3 | Registro en `src/lib/charts/register.ts`. Plugins: `chartjs-plugin-datalabels` y `chartjs-chart-sankey`. |
| Mapbox GL | 3.x | Estilo del cliente `mapbox://styles/andres-ramirez/cmqkorkc6003101s46xcreztw`. |
| motion | 13 | Animaciones (`motion/react`). `MotionConfig reducedMotion="user"`. |
| TanStack Query | 5 | Caché de datos del cliente, con `placeholderData: keepPreviousData`. |
| jose | 6 | JWT de sesión (HS256). |
| mapshaper | dev | Solo lo usa `scripts/geo/build-geo.mjs`. |

Gestor de paquetes: **pnpm**. En `pnpm-workspace.yaml` los builds nativos están deshabilitados (`sharp`, `better-sqlite3`, etc.).

---

## 3. Comandos

```bash
pnpm dev                                  # http://localhost:3000
pnpm build && pnpm start                  # producción
pnpm lint                                 # ESLint (debe quedar en 0 problemas)
npx tsc --noEmit                          # tipos (tras `npx next typegen` si cambian rutas)
node scripts/mock/build-profiles.mjs      # regenera perfiles mock (requiere top_secret/db)
node scripts/geo/build-geo.mjs            # regenera geografía simplificada + catálogo DIVIPOLA
node scripts/geo/check-dictionary.mjs     # tasa de cruce del diccionario geo (requiere top_secret/db)
```

---

## 4. Estructura

```
src/
  proxy.ts                         chequeo optimista de sesión → /login (401 en /api)
  app/
    layout.tsx                     fuentes (Montserrat, Poppins), script de tema, <Providers>
    globals.css                    tokens Balú + tokens semánticos claro/oscuro + utilidades
    login/                         pantalla de acceso por token
    (app)/layout.tsx               verifySession() + <AppShell> (sidebar, topbar, ⌘K)
    (app)/page.tsx                 Home = catálogo de tableros
    (app)/tableros/[slug]/page.tsx vista de tablero (13 slugs estáticos)
    api/tableros/[slug]/route.ts           agregados del tablero (JSON)
    api/tableros/[slug]/detalle/route.ts   tabla paginada · ?format=csv exporta todo
    api/catalogo/route.ts                  cifra principal del mes por tablero (Home)
  config/dashboards.ts             metadatos: slug, título, módulo, ícono, descripción, vistas, KPI principal
  dashboards/
    types.ts                       CONTRATO declarativo: DashboardSpec, KpiDef, WidgetDef, Measure, Predicate
    dto.ts                         respuestas de la API (KpiResult, CategoryResult, MapResult, …)
    specs/*.ts                     un spec por tablero (+ helpers.ts, entes-common.ts)
  components/
    shell/                         AppShell, Sidebar, CommandPalette
    home/                          HomeView, DashboardCard
    dashboard/                     DashboardView, contexto/URL, filtros, KPI, secciones, widget-card, detail-table
    widgets/                       bar, donut, timeseries, monthly, pivot-heatmap, bar-table, sankey,
                                   drilldown, efficiency-table, choropleth-map, widget-renderer, result-table
    ui/                            popover, sheet, dialog, tooltip, count-up, sparkline, primitives, theme-toggle
    brand/logo.tsx                 logo oficial (color o monocromo con máscara CSS)
  lib/
    charts/                        register, theme (useChartTheme, categoryColors, seqColor), semantic
    geo/diccionario.ts             resolución BD → códigos DANE (DPTO/MPIOS) + divipola.json
    dates.ts format.ts filters.ts theme.ts cn.ts
  server/
    env.ts                         variables de entorno validadas
    auth/                          jwt.ts (jose), dal.ts (verifySession), actions.ts (login/logout), rate-limit.ts
    data/
      provider.ts                  DataProvider (mock hoy, BD después)
      table.ts                     tabla columnar en memoria
      normalizers.ts               limpieza (canales, "No reporta", categoría SLA de Entes, franja horaria…)
      engine/                      core (predicados y medidas), filter, aggregate, efficiency, run
      datasets/*.ts                un dataset canónico por vista (schema, geo, normalize, config mock)
      mock/                        generator.ts (semilla fija), fake.ts, load.ts, profiles/*.json
      postgres/README.md           plan de conexión a la BD real
scripts/
  mock/                            build-profiles.mjs, config.mjs, csv.mjs
  geo/                             build-geo.mjs, check-dictionary.mjs
public/
  data/colombia-*.geojson          GeoJSON originales (NO se modifican)
  data/geo/                        generados: departamentos.json + municipios/<DPTO>.json
  graphic_identity/                logo Positiva + tokens del sistema de diseño Balú
top_secret/                        SOLO LOCAL (en .gitignore): pantallazos, CSV reales, SQL, runbook
```

---

## 5. Arquitectura de datos

```
URL (?from&to&f.campo&t.campo&d.campo)
      │  useUrlFilters() — window.history.replaceState, sin ida y vuelta al servidor
      ▼
DashboardView ── TanStack Query ──► GET /api/tableros/[slug]?…
                                          │ hasSession() → SPECS[slug] → parseFilters()
                                          ▼
                                   getProvider().dashboard(spec, filters)
                                          │  MockProvider: loadMockTable(dataset) → engine/run.ts
                                          ▼
                                   DashboardResponse { kpis, widgets, options, range, geoNames }
                                          │
WidgetCard → WidgetRenderer → (BarChart | DonutChart | TimeseriesChart | … | ChoroplethMap)
```

- **Spec declarativo** (`src/dashboards/specs/*.ts`): solo datos (sin funciones). Define filtros, KPIs (medida, formato, polaridad, pista "¿Cómo se calcula?", `provisional`), secciones y widgets, y la tabla de detalle. El cliente lo importa para pintar y el servidor para calcular.
- **Medidas** (`Measure`): `count`, `countDistinct`, `sum`, `avg`, `ratio` (proporción de filas), `ratioOf` (cociente de dos medidas). Aceptan `where: Predicate`.
- **KPIs**: valor del rango, valor del periodo anterior de igual duración, `delta` relativo y `spark` por día (semana o mes si el rango es largo). Un KPI puede usar otra fecha (`dateField`, p. ej. "Aprobados en el periodo").
- **Opciones de filtro facetadas**: cada filtro se calcula con todos los demás aplicados.
- **Cross-filtering**: un clic en una barra, porción, leyenda o territorio llama `toggleValue(campo, valor)`. Los campos geográficos son `__dpto` y `__mpio` (códigos DANE).
- **Tabla de detalle**: paginación, orden y búsqueda en el servidor; CSV con separador `;` y BOM (Excel es-CO).
- **Tipos de widget**: `bar` (vertical, horizontal, apilada, con métrica secundaria como etiqueta), `donut` (≤ 6 porciones + "Otros"), `timeseries` (granularidad día/semana/mes en cliente, periodo anterior, `splitBy`), `monthly` (barras mensuales con variación % como etiqueta, `scope: "ytd"`), `pivot` (heatmap con grupos), `bartable`, `map`, `sankey`, `drilldown` (jerarquía navegable), `histogram`, `efficiency` (ranking semanal de PQRD).

### Fechas
Todas las fechas se manejan como **milisegundos "de pared" de Bogotá** (UTC-5 fijo; los componentes UTC del `Date` son la hora local). Helpers en `src/lib/dates.ts`. El rango por defecto es el mes actual hasta hoy, como en los tableros originales.

### Formatos de las vistas (para la conexión real)
| Vista | Formato |
|---|---|
| PQRD | `dd/mm/yy HH:MM` (año de 2 dígitos), `No reporta` |
| Entes de control | `dd/mm/yyyy HH:MM`, `NO REPORTA` |
| Tutelas | `Fecha_de_radicacion` = `dd/mm/yyyy hh:mm AM/PM`; `fecharadicacion` en UTC |
| ML y entradas generales | ISO sin zona (`YYYY-MM-DDTHH:MM:SS`) |
| SMART y salidas generales | `YYYY-MM-DD HH:MM:SS.ffffff UTC` → restar 5 h |
| Facturación | fecha `YYYY-MM-DD` + hora `HH:MM:SS` |

---

## 6. Hallazgos de las vistas (documentados, no corregidos en BD)

- `db.sql` está escrito en **SQL de BigQuery** (`positiva-sgda-prd-416417.oro_tableros`), no PostgreSQL. Solo SMART y Tutelas leen `bronce_gcpprolinktic.public_*` (réplica de Postgres). Ver `src/server/data/postgres/README.md`.
- **Entes**: `Aux_Categoria` nunca mapea "En término" ni "5 Horas" (compara en minúsculas contra literales capitalizados). El front lo corrige al mostrar (`entesAuxCategoria`). `rango_ciclo` siempre es "Sin cerrar" y `dias_ciclo_total` siempre es NULL.
- **PQRD**: `Aux_Categoria` es NULL para "Fuera de término" y se muestra como "Sin categoría". `num_dias_revision` siempre es NULL, así que la fase "Revisión" de la eficiencia siempre es "Necesario validación manual".
- **SMART M1**: `pqrd_*` casi siempre vacío (el cruce con PQRD falla) y se muestra como "Sin cruce con PQRD". El macro motivo es 98 % "No Reporta".
- **SMART M3**: no filtra `momento = 3` y duplica filas por los joins. `nombre_tutela` usa 0 en lugar de 2 para "NO".
- **Facturas emitidas**: se duplican por el join con la tabla de errores. La resolución `99999999999999` es relleno.
- **Datos sucios que se normalizan** (`normalizers.ts`): WEB/Web, Mail - AI/Mail-IA, mayúsculas inconsistentes, `\xa0`, "reclasificaciòn", y vacío/null/N/A/NO REPORTA como "No reporta".
- **`vw_reporte_datastudio_pqrd_eficiencia`** no aparece en los pantallazos. Se ubicó en el tablero PQRD como "Eficiencia semanal por gerencia" y en mock se recalcula desde PQRD (`engine/efficiency.ts`).

### Pendientes de negocio (fórmulas `provisional: true`, marcadas en la UI)
| Tablero | KPI / widget | Hipótesis implementada |
|---|---|---|
| Tutelas | Tasa de desacato | Tutelas en etapa "Desacato" / tutelas con "Fallo de primera instancia" |
| ML Entradas | Aprobados en el periodo | Conteo por `fecha_aprobacion` dentro del rango |
| ML Salidas | % Dentro de SLA | `DIAS_EN_APROBACION ≤ TIEMPO_DEFINIDO` |
| Correspondencia salidas | Devoluciones | `Estado_guia = 'DEVUELTO'` |
| Entes · Eficiencia | Gestión a aprobación / Oficina a gestionador | Reemplazan las gráficas "-RR" originales, que estaban rotas |

---

## 7. Datos mock (fase actual)

- `DATA_SOURCE=mock` (por defecto). Los datos son **sintéticos y anonimizados**.
- `scripts/mock/build-profiles.mjs` lee `top_secret/db/*.csv` (solo local) y escribe `src/server/data/mock/profiles/<dataset>.json`. Cada perfil contiene:
  - tuplas de columnas NO personales, que conservan correlaciones (estado↔semáforo↔SLA);
  - seudónimos determinísticos para funcionarios y NIT;
  - marginales independientes para datos sensibles (sexo, condición especial);
  - tuplas geográficas;
  - histogramas de día y hora.
- Nunca se guardan nombres reales, documentos, correos, teléfonos, direcciones ni textos libres.
- `mock/generator.ts` genera filas con semilla fija, desde 2025-01-01 hasta hoy, con estacionalidad y sesgo "abierto" para registros recientes. Cada dataset ajusta distribuciones con `reweight`, `overrides` y `namePools` para parecerse a los pantallazos.
- `mock/load.ts` construye la tabla columnar una vez por proceso (~1 s para todo) y resuelve `__dpto` y `__mpio` con el diccionario geográfico.

---

## 8. Geografía y mapas

- **Fuente**: `public/data/colombia-departamentos.geojson` (propiedad `DPTO`) y `colombia-municipios.geojson` (propiedad `MPIOS`). No se modifican.
- **`scripts/geo/build-geo.mjs`**:
  - corrige `¥`→`Ñ` y el código falso `88000`→`88564`;
  - simplifica preservando topología (mapshaper);
  - escribe `public/data/geo/departamentos.json` (~180 KB) y `municipios/<DPTO>.json` (~720 KB en total, carga perezosa);
  - escribe `src/lib/geo/divipola.json` con nombres oficiales, variantes y bbox.
- **Diccionario** `src/lib/geo/diccionario.ts`:
  - por código: `padStart` y el departamento se deriva del municipio;
  - por nombre: `norm()` + alias de departamento + alias de municipio acotados por departamento + nombre único nacional;
  - cruce contra los CSV reales: **100 % departamentos, 99,1 % municipios**. El resto son combinaciones inválidas de la fuente (p. ej. AMAZONAS/MEDELLÍN) y se agregan solo al departamento o como "sin ubicación válida".
- **`ChoroplethMap`**:
  - coropleta por departamento con rampa secuencial naranja;
  - hover con desglose (top 4 de una dimensión);
  - clic selecciona y abre un panel con "Filtrar tablero" y "Ver municipios";
  - **doble clic** hace zoom al departamento y colorea sus municipios; "Colombia" vuelve;
  - `cooperativeGestures` (Ctrl + rueda) evita que el mapa atrape el scroll de la página;
  - el contenedor usa `h-full` porque Mapbox fuerza `position: relative`.

---

## 9. Autenticación

- Token único en `ACCESS_TOKEN` (servidor). Login en `/login` con Server Action (`useActionState`).
- La comparación es de tiempo constante (SHA-256 + `timingSafeEqual`), con un límite de 5 intentos por minuto por IP.
- La sesión es un JWT HS256 (`SESSION_SECRET`) en la cookie `docum_session` (httpOnly, sameSite=lax, secure en producción, `SESSION_TTL_HOURS`).
- `src/proxy.ts` hace el chequeo optimista (redirige a `/login?next=…`; en `/api` responde 401).
- **La verificación real está en `verifySession()` / `hasSession()`** (`src/server/auth/dal.ts`). Todo route handler nuevo debe llamar `hasSession()`.

---

## 10. Sistema visual y UX

- **Identidad Balú** (`public/graphic_identity/tokens_balu/tokens.css`, importado en `globals.css`; no editar a mano).
  - Primario `#DF7702` (logo `#FF7500`).
  - Montserrat para texto y cifras, Poppins para botones.
- **Tokens semánticos** (`--bg`, `--surface*`, `--text*`, `--primary*`, `--good/--warning/--critical/--info`, `--chart-1..8`, `--seq-0..6`):
  - hay versión clara y oscura (seleccionadas, no invertidas);
  - el tema vive en `data-theme` de `<html>` (cookie `docum-theme` o preferencia del sistema) y se aplica con un script inline sin flash.
- **Paleta categórica validada** con el validador de daltonismo (ΔE adyacente 9,1 claro / 8,4 oscuro):
  - orden fijo: naranja, azul, aqua, amarillo, magenta, verde, violeta, rojo;
  - "Otros" y "No reporta" van en gris;
  - nunca se recicla; más de 8 series se agrupan en "Otros".
- **Colores semánticos** (`src/lib/charts/semantic.ts`) para semáforo, SLA, momento, cumplimiento y sí/no. Siempre van con etiqueta: el color nunca es el único canal.
- **Reglas de gráficas**:
  - nunca doble eje (la variación mensual va como etiqueta);
  - barras de ≤ 24 px con esquina de 4 px;
  - líneas de 2 px con `monotone` (no bajan de 0);
  - grilla en hairline;
  - toda gráfica tiene "Ver datos" (tabla), CSV, PNG y "Ampliar".
- **Estados**: skeleton en la primera carga; en refetch se mantiene el dato anterior al 60 % de opacidad. Estado vacío explicativo.
- **Movimiento**:
  - `ViewTransition` transforma el ícono y el título de la tarjeta del catálogo en el encabezado del tablero;
  - entradas escalonadas, count-up en KPIs, indicador activo del sidebar con `layoutId`;
  - las gráficas se montan al entrar al viewport;
  - todo respeta `prefers-reduced-motion`.
- **Responsivo**:
  - sidebar expandido o en riel (≥ 1024 px) y drawer en móvil;
  - grid de widgets de 12 columnas (xl), 6 (md) y 1 (móvil);
  - tablas con primera columna fija en escritorio y tarjetas en móvil.
- **Home**: catálogo con búsqueda, chips por módulo, favoritos y recientes (localStorage), y la cifra del mes por tablero (`/api/catalogo`).

---

## 11. Recetas

**Agregar un KPI**: en el spec, agrega un `KpiDef` con `measure`, `format`, `polarity` y `hint`. Si la fórmula no está confirmada, márcala con `provisional: true`.

**Agregar un widget**: agrégalo a una sección del spec. Si el campo no existe en el dataset, agrégalo en `datasets/<id>.ts` (`schema`, `normalize` y, si es mock, `derive`). Luego vuelve a generar el perfil si viene del CSV (`scripts/mock/config.mjs` → `keep`).

**Agregar un tablero**:
1. metadatos en `src/config/dashboards.ts`;
2. spec en `src/dashboards/specs/<slug>.ts` y registro en `specs/index.ts`;
3. si usa otra vista, crea el dataset en `src/server/data/datasets/` y regístralo en `datasets/index.ts`;
4. perfil mock en `scripts/mock/config.mjs`;
5. corre `npx next typegen`, `npx tsc --noEmit` y `pnpm lint`.

**Nuevo tipo de widget**: define la interfaz en `dashboards/types.ts` y el resultado en `dto.ts`. Luego agrega la agregación en `engine/aggregate.ts`, el `case` en `engine/run.ts`, el componente en `components/widgets/`, el `case` en `widget-renderer.tsx` y la conversión en `result-table.ts`.

**Conectar la BD real**: implementa `DataProvider` para `DATA_SOURCE=postgres` en `src/server/data/provider.ts` según `src/server/data/postgres/README.md`. Los specs, DTOs y componentes no cambian.

---

## 12. Seguridad y datos

- `top_secret/` **nunca** se versiona: tiene CSV con datos personales reales, pantallazos y un runbook con credenciales de producción. No copies su contenido al repo.
- `.env*` está ignorado (excepto `.env.example`). Las credenciales de BD van solo en `.env.local`.
- Si cambias `scripts/mock/config.mjs`, verifica que ninguna columna personal quede en `keep`.
- El token de Mapbox es público (`pk.`) y va en `NEXT_PUBLIC_MAPBOX_TOKEN`.
