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
| chartjs-chart-treemap | 4.2 | Treemap (import dinámico, se registra dentro de `widgets/treemap.tsx`). |
| html-to-image | 1.11 | PNG de widgets HTML (rankings, tiras de estado…) desde el menú ⋯. |
| Mapbox GL | 3.x | Estilo del cliente `mapbox://styles/andres-ramirez/cmqkorkc6003101s46xcreztw` (claro) y `NEXT_PUBLIC_MAPBOX_STYLE_DARK` (oscuro; respaldo `mapbox/dark-v11`). |
| motion | 13 | Animaciones (`motion/react`). `MotionConfig reducedMotion="user"`. |
| TanStack Query | 5 | Caché de datos del cliente, con `placeholderData: keepPreviousData`. |
| jose | 6 | JWT de sesión (HS256). |
| mapshaper | dev | Solo lo usa `scripts/geo/build-geo.mjs`. |
| vitest | 5 (dev) | Tests de specs (métricas congeladas + layout), registro semántico, formatos y motor (`pnpm test`). |

Gestor de paquetes: **pnpm**. En `pnpm-workspace.yaml` los builds nativos están deshabilitados (`sharp`, `better-sqlite3`, etc.).

---

## 3. Comandos

```bash
pnpm dev                                  # http://localhost:3000
pnpm build && pnpm start                  # producción
pnpm lint                                 # ESLint (debe quedar en 0 problemas)
npx tsc --noEmit                          # tipos (tras `npx next typegen` si cambian rutas)
pnpm test                                 # vitest: métricas intactas, layout válido, semántica, formatos, motor
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
    globals.css                    tokens Balú + tokens semánticos claro/oscuro + identidad de módulo
                                   + sistema de filas (.dash-row / .dash-cell / .dash-card)
    login/                         pantalla de acceso por token (panel de módulos + tarjeta)
    (app)/layout.tsx               verifySession() + <AppShell> (sidebar, topbar, ⌘K)
    (app)/page.tsx                 Home = "Centro de mando documental"
    (app)/tableros/[slug]/page.tsx vista de tablero (13 slugs estáticos)
    api/tableros/[slug]/route.ts           agregados del tablero (JSON)
    api/tableros/[slug]/detalle/route.ts   tabla paginada · ?format=csv exporta todo
    api/catalogo/route.ts                  cifra titular + KPI de salud del mes por tablero (Home, paleta)
  config/dashboards.ts             módulos (label, summary) y tableros (heading, summary, headlineKpi,
                                   healthKpi, features, vistas, ícono)
  dashboards/
    types.ts                       CONTRATO: DashboardSpec, KpiDef, KpiRowDef, WidgetDef, Viz, VizOptions,
                                   SectionDef.rows (RowDef, CellRef), SemanticFamily
    dto.ts                         respuestas de la API (KpiResult, CategoryResult, MapResult, CatalogResponse…)
    viz.ts                         visualización efectiva por widget (resolveViz) y conjuntos de formas
    layout.ts                      plantillas, tiers, presupuestos de alto, validateLayout, packRows
    baseline.json                  línea base congelada de ids y definiciones (NO editar a mano)
    specs.test.ts                  red de seguridad: métricas intactas + layout válido
    specs/*.ts                     un spec por tablero (+ helpers.ts, entes-common.ts)
  components/
    shell/                         AppShell, Sidebar (riel automático), Topbar, SectionNav, CommandPalette
    home/                          HomeView, HomeHero, PulseSummary, ModuleNav, ModuleSection, DashboardCard…
    dashboard/                     DashboardView, DashboardHeader, filtros (priority+), KpiBand (kpi/*),
                                   section (filas), widget-card (tarjeta v2), detail-table
    widgets/                       una visualización por archivo (ranking-list, people-leaderboard,
                                   composition-bar, status-strip, status-board, pipeline-steps, category-tiles,
                                   entity-tiles, family-split, quality-notice, split-rows, drilldown-bars,
                                   area-timeseries, column-bars, monthly-bars, histogram, treemap,
                                   heatmap-matrix, phase-matrix, sankey-v2, pivot-v2, efficiency-matrix,
                                   resolution-table, map/*), widget-renderer (registro viz → componente),
                                   result-table ("Ver datos"/CSV), kit/* (gramática común)
    ui/                            popover, sheet, dialog, tooltip, count-up, primitives, theme-toggle
    brand/logo.tsx                 logo oficial (color o monocromo con máscara CSS)
  lib/
    charts/                        register, theme, semantic (registro de familias), resize-recovery
    geo/                           diccionario.ts + divipola.json + bounds.ts (generado)
    labels.ts                      displayLabel (tipo título es-CO, siglas, NIT), dayShort, initials
    dates.ts format.ts filters.ts theme.ts cn.ts
  server/                          (ver §5)
scripts/
  mock/                            build-profiles.mjs, config.mjs, csv.mjs
  geo/                             build-geo.mjs, check-dictionary.mjs
docs/ui-design-system.md           SISTEMA DE DISEÑO (fuente de verdad visual; ver §10)
public/
  data/colombia-*.geojson          GeoJSON originales (NO se modifican)
  data/geo/                        generados: departamentos.json, municipios/<DPTO>.json,
                                   colombia-outline.json, mask.json
  graphic_identity/                logo Positiva + tokens del sistema de diseño Balú
top_secret/                        SOLO LOCAL (en .gitignore): pantallazos, CSV reales, SQL, runbook
```

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
KpiBand (spec.kpiLayout) + DashboardSection → DashboardRow (plantilla + tier) → WidgetCard / CompositeCard
      → WidgetRenderer: effectiveViz(widget, result) → RankingList | StatusStrip | AreaTimeseries | … | HeroMap
```

- **Spec declarativo** (`src/dashboards/specs/*.ts`): solo datos (sin funciones). Define filtros, KPIs (medida, formato, polaridad, pista "¿Cómo se calcula?", `provisional`), secciones y widgets, y la tabla de detalle. El cliente lo importa para pintar y el servidor para calcular.
- **Medidas** (`Measure`): `count`, `countDistinct`, `sum`, `avg`, `ratio` (proporción de filas), `ratioOf` (cociente de dos medidas). Aceptan `where: Predicate`.
- **KPIs**: valor del rango, valor del periodo anterior de igual duración, `delta` relativo y `spark` por día (semana o mes si el rango es largo). Un KPI puede usar otra fecha (`dateField`, p. ej. "Aprobados en el periodo").
- **Opciones de filtro facetadas**: cada filtro se calcula con todos los demás aplicados.
- **Cross-filtering**: un clic en una fila, tile, segmento, leyenda o territorio llama `toggleValue(campo, valor)` (`toggleValues` para celdas de matriz). Los campos geográficos son `__dpto` y `__mpio` (códigos DANE).
- **Filtrar es resaltar**: un `bar`/`donut`/`bartable` (1.ª columna)/`map` cuya dimensión está filtrada se calcula sin su propio filtro (`skipFields`) y conserva todas sus categorías; el cliente resalta lo seleccionado y atenúa el resto. Lo neutral ("No reporta", "Sin …") va al final y "Otros" de último. Con `topN` sin "Otros", `CategoryResult.rest` trae cuántas categorías y cuánto quedaron fuera ("Top 15 de 42 · 91 % del total").
- **Tabla de detalle**: paginación, orden y búsqueda en el servidor; CSV con separador `;` y BOM (Excel es-CO).
- **Tipos de widget (datos)**: `bar` (con `stackBy`, `secondary`, `topN`/`others`), `donut` (legado: los specs ya no la usan como forma), `timeseries` (`series`, `splitBy`, `compare`), `monthly` (`scope: "ytd"`), `pivot` (`rowOrder`, `stableRows`, `stableColumns`, `fillNumericColumns`), `bartable`, `map`, `sankey`, `drilldown`, `histogram`, `efficiency`. El TIPO define qué se calcula; la **forma** la define `viz` (§10).
- **Layout declarativo**: cada sección tiene `nav` (eyebrow), `question` (H2) y `rows: RowDef[]` con plantillas cerradas que suman 12 (`"12"`, `"8-4"`, `"4-8"`, `"7-5"`, `"5-7"`, `"6-6"`, `"4-4-4"`, `"3-3-3-3"`, `"6-3-3"`) y un `tier` de alto compartido (`S` 280 · `M` 380 · `L` 480 · `XL` 640 · `auto`). Celdas especiales: `{ stack }`, `{ composite: "heatmap-matrix" | "phase-matrix" }`, `{ tabs }`. La banda de KPIs se declara en `spec.kpiLayout` (héroe, grupos `list/proportion/stepper/alerts/pair` con `embed`/`gauges`, tiles `gauge/status/compact`). `validateLayout()` (dev + vitest) verifica sumas, cobertura, capacidad, P1 única y anti-monotonía.

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
- **Datos sucios que se normalizan** (`normalizers.ts`): WEB/Web, Mail - AI/Mail-IA, mayúsculas inconsistentes, `\xa0`, "reclasificaciòn", vacío/null/N/A/NO REPORTA como "No reporta" y alias (`ALIASES`): tutelas `Estado_del_fallo` "Informativos"→"Informativo"; ML entradas `estado_salida` "Por recibir correspondencia"→"Por recibir en correspondencia" (SQL equivalente en `src/server/data/postgres/README.md`).
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
- **`build-geo.mjs` genera además**: `public/data/geo/colombia-outline.json` (contorno disuelto), `public/data/geo/mask.json` (mundo menos Colombia), punto de etiqueta `l` por departamento (en `divipola.json`) y por municipio, y `src/lib/geo/bounds.ts` (MAINLAND, MAX_BOUNDS, ancla de Bogotá; generado, no editar).
- **`HeroMap`** (`src/components/widgets/map/*`), protagonista (P1) de los 10 tableros con mapa:
  - sección propia a 12 columnas y tier XL; lienzo + panel de insights lado a lado desde 800 px internos, apilado debajo;
  - cámara `fitBounds(MAINLAND)` con `maxBounds`, sin copias del mundo ni rotación; meta de encuadre ≥ 60 % del ancho y ≥ 90 % del alto (lo mide la QA);
  - máscara del mundo, brillo y contorno de Colombia, etiquetas del top 5 y del mapa base solo de CO;
  - 5 clases por cuantiles (rampa `--seq-2…6`), "Sin registros" en gris;
  - panel: título con la geografía explícita, cobertura de ubicación (banner si > 20 % sin ubicación), ranking top 10 sincronizado con el mapa, detalle con desglose y acciones "Filtrar tablero" / "Ver municipios", leyenda de clases;
  - clic selecciona (inmediato), **doble clic** baja a municipios, Esc limpia, recuadro de San Andrés, PNG compuesto;
  - tema oscuro con `NEXT_PUBLIC_MAPBOX_STYLE_DARK` (respaldo `mapbox://styles/mapbox/dark-v11`) y re-aplicación idempotente de capas tras `setStyle`;
  - `cooperativeGestures` (Ctrl + rueda) evita que el mapa atrape el scroll de la página.

---

## 9. Autenticación

- Token único en `ACCESS_TOKEN` (servidor). Login en `/login` con Server Action (`useActionState`).
- La comparación es de tiempo constante (SHA-256 + `timingSafeEqual`), con un límite de 5 intentos por minuto por IP.
- La sesión es un JWT HS256 (`SESSION_SECRET`) en la cookie `docum_session` (httpOnly, sameSite=lax, secure en producción, `SESSION_TTL_HOURS`).
- `src/proxy.ts` hace el chequeo optimista (redirige a `/login?next=…`; en `/api` responde 401).
- **La verificación real está en `verifySession()` / `hasSession()`** (`src/server/auth/dal.ts`). Todo route handler nuevo debe llamar `hasSession()`.

---

## 10. Sistema visual y UX

> Fuente de verdad: **[`docs/ui-design-system.md`](./docs/ui-design-system.md)** (principios, layout, color, leyendas, catálogo de componentes, mapa, Home, shell, KPIs y layout de cada tablero). Nació de una auditoría con 185 capturas y 220 hallazgos. Lo siguiente es el resumen operativo.

- **Identidad Balú** (`public/graphic_identity/tokens_balu/tokens.css`, importado en `globals.css`; no editar a mano). Primario `#DF7702` (logo `#FF7500`). Montserrat para texto y cifras, Poppins para botones.
- **Tokens** (`globals.css`, claro y oscuro seleccionados por separado; tema en `data-theme` de `<html>` sin flash):
  - superficies, tinta (`--text`, `--text-2`, `--muted` ≥ 4,5:1), `--primary-text` (naranja legible como texto, AA);
  - estado `--good/--info/--warning/--serious/--critical/--neutral-mark` con `-ink` y `-soft` (todos AA);
  - categórica `--chart-1..8` (orden fijo, validada: CVD ΔE 9,1 claro / 8,4 oscuro), secuencial `--seq-0..6`;
  - **identidad de módulo** `[data-module="<id>"]` → `--mod`, `--mod-2`, `--mod-ink`, `--mod-soft`, `--shadow-mod`, utilidad `mod-tile` (Facturación cobalto, PQRD y Entes turquesa, SMART violeta, Tutelas frambuesa, Medicina cerúleo, Correspondencia púrpura; validada CVD ≥ 8,2). **Solo chrome** (sidebar, Home, paleta, encabezado): nunca dentro de un widget.
- **Jerarquía**: una sola visual protagonista (P1, `hero: true`, tarjeta `card-hero`) por tablero (el mapa en los 10 con mapa; la serie en Facturas recibidas; la matriz día×hora en Facturas emitidas; la matriz de fases en Eficiencia) y un único KpiHero. Cada sección responde una pregunta (H2 = `question`, eyebrow = `nav`) en orden canónico: KPIs → cumplimiento → territorio → tendencia → composición → rankings/responsables → cruces → detalle.
- **La forma la elige el tipo de dato** (`viz`): 2–3 partes → `composition` split; 4–7 → `composition` legend; estados → `status-strip`/`status-board`; etapas → `pipeline`; ≤ 10 entidades → `entity-tiles`/`category-tiles`; muchas partes cortas → `treemap`; nominales largas → `ranking`; personas → `people`; ordinales → `column-bars`; dos ordinales → `heatmap`; territorio → `hero-map`; tiempo → `area`/`monthly-delta`. **Sin donas.** Barras horizontales ≤ 40 % de las celdas y ≤ 2 por sección. Texto largo en HTML, nunca en canvas.
- **Rejilla**: el contenedor es el área útil (`@container page`): 1 / 6 / 12 columnas con umbrales 600 y 840 px. Cada fila suma 12 y todas sus tarjetas miden lo mismo (tier). Ritmo: 48 px entre secciones, 20 de gap, 20 de padding, radio 20, contenido máx. 1600 px.
- **Semántica** (`src/lib/charts/semantic.ts`): familias EXPLÍCITAS por widget/columna (`semantic`): semaforo, sla, cumplimiento, flujo, momento, estado-queja, notificacion, guia, factura, radian, transmision, alerta, binario, canal-envio, fallo. Estado siempre con ícono + etiqueta. Neutrales en gris, al final, fuera de escala; 15–85 % neutral → chip de calidad; ≥ 85 % → `DataQualityNotice` automático.
- **Gramática única** (`components/widgets/kit/*`): `ChartLegend`/`ScaleLegend`/`SectionLegend` en la franja de 24 px bajo el título (`LegendSlot`), controles en el header (`HeaderSlot`), `ChartTooltip` (valor primero), `DeltaChip` (`describeDelta`: % en **p.p.**, "Sin base", "Base pequeña"), `MicroTrend` (null es hueco), `StatusIcon`, `QualityChip`, `VizSkeleton` por arquetipo y `VizEmpty` con "Quitar filtros". Etiquetas con `displayLabel` (tipo título es-CO, siglas, NIT aparte). % con 1 decimal; días como "5,4 días"; una sola unidad COP por gráfica (`copUnit`).
- **Tarjeta v2** (`widget-card.tsx`): header de 44 px (título y subtítulo en 1 línea; controles bajan a su línea en tarjetas < 460 px), franja de leyenda reservada por fila, cuerpo que llena el tier, menú ⋯ con Ampliar, Ver datos, CSV y PNG (canvas o `html-to-image`). Estados: skeleton; refetch al 60 %; vacío; error con reintento.
- **Movimiento**: `ViewTransition` (ícono y título del catálogo → encabezado del tablero), entradas escalonadas ≤ 500 ms, count-up en KPIs, indicador del sidebar con `layoutId`, montaje al entrar al viewport; todo respeta `prefers-reduced-motion`.
- **Shell**: sidebar expandido (284 px) o en riel (76 px; automático entre 1024 y 1279 px) y drawer en móvil; topbar con migas, SectionNav (scroll-spy) cuando el H1 sale de pantalla, "Actualizado hace N min", badge único "Datos de prueba", ThemeSwitch y ⌘K (paleta con recientes, módulos y acciones).
- **Home** ("Centro de mando documental"): saludo según la hora de Bogotá, buscador ("/"), accesos rápidos (favoritos y recientes), **Pulso del mes** (las 3 señales de salud que más empeoraron), navegación por módulo y secciones con su color, tarjetas con cifra del mes, variación, micro-columnas y KPI de salud (`/api/catalogo`).
- **Validación**: `pnpm test` congela métricas y valida layout; la QA visual usa Chrome headless (capturas 1440/1280/1024/768/390 en claro y oscuro, filas desparejas, textos recortados, scroll horizontal y encuadre del mapa).

---

## 11. Recetas

**Agregar un KPI**: en el spec, agrega un `KpiDef` con `measure`, `format`, `polarity`, `hint` y `short` (≤ 16 caracteres). Si la fórmula no está confirmada, márcala con `provisional: true`. Ubícalo en `spec.kpiLayout` (exactamente una vez).

**Agregar un widget**:
1. agrégalo a `section.widgets` con su tipo de datos (dimensión, medida…); si el campo no existe en el dataset, agrégalo en `datasets/<id>.ts` (`schema`, `normalize` y, si es mock, `derive`) y vuelve a generar el perfil si viene del CSV (`scripts/mock/config.mjs` → `keep`);
2. elige la forma con `viz` (árbol de §10) y, si aplica, `semantic`, `labelKind`, `vizOptions` y `maxItems`;
3. colócalo en una fila de `section.rows` con una plantilla que sume 12 y un tier donde quepa;
4. corre `pnpm test` (layout válido) y revisa claro/oscuro en 1440, 1024 y 390.

**Agregar un tablero**:
1. metadatos en `src/config/dashboards.ts` (`heading`, `summary`, `headlineKpi`, `healthKpi`, `features`);
2. spec en `src/dashboards/specs/<slug>.ts` (con `unit`, `kpiLayout` y secciones con `rows`) y registro en `specs/index.ts`;
3. si usa otra vista, crea el dataset en `src/server/data/datasets/` y regístralo en `datasets/index.ts`;
4. perfil mock en `scripts/mock/config.mjs`;
5. agrega el slug a la línea base (`FREEZE_BASELINE=1 npx vitest run src/test/freeze-baseline.test.ts` SOLO para tableros nuevos; nunca para "arreglar" un test de métricas);
6. corre `npx next typegen`, `npx tsc --noEmit`, `pnpm lint` y `pnpm test`.

**Nueva visualización**: agrega el nombre a `Viz` (`dashboards/types.ts`) y sus opciones a `VizOptions`; crea el componente en `components/widgets/` con `VizProps` (llena su contenedor; `height` es presupuesto; leyendas con `LegendSlot`; tooltips con `ChartTooltip`); regístralo en `widget-renderer.tsx`; si es horizontal, canvas o usa franja de leyenda, agrégalo al conjunto correspondiente de `dashboards/viz.ts`; si no trunca, agrega su presupuesto a `requiredHeight` en `dashboards/layout.ts`.

**Nuevo tipo de dato de widget**: define la interfaz en `dashboards/types.ts` y el resultado en `dto.ts`; agrega la agregación en `engine/aggregate.ts`, el `case` en `engine/run.ts`, la viz por defecto en `dashboards/viz.ts` y la conversión en `result-table.ts`.

**Conectar la BD real**: implementa `DataProvider` para `DATA_SOURCE=postgres` en `src/server/data/provider.ts` según `src/server/data/postgres/README.md`. Los specs, DTOs y componentes no cambian.

---

## 12. Seguridad y datos

- `top_secret/` **nunca** se versiona: tiene CSV con datos personales reales, pantallazos y un runbook con credenciales de producción. No copies su contenido al repo.
- `.env*` está ignorado (excepto `.env.example`). Las credenciales de BD van solo en `.env.local`.
- Si cambias `scripts/mock/config.mjs`, verifica que ninguna columna personal quede en `keep`.
- El token de Mapbox es público (`pk.`) y va en `NEXT_PUBLIC_MAPBOX_TOKEN`.
