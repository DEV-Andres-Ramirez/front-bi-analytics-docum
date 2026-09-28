# Docum BI · Sistema de diseño de tableros (UI/UX v2)

> Fuente de verdad del rediseño. Nace de una auditoría con 185 capturas (claro/oscuro, 1440/1024/390 px) revisadas
> por 8 auditores, un arquitecto de diseño y un crítico de completitud. Resultado: 220 hallazgos (91 críticos o
> altos). Este documento fija las reglas; el código las implementa y `validateLayout` + vitest las vigilan.
>
> Regla de oro: **se cambia la forma, nunca la métrica**. `src/dashboards/baseline.json` congela ids y definiciones
> de KPIs, widgets y columnas; `src/dashboards/specs.test.ts` falla si algo se pierde o cambia.

## Contratos de implementación (código)

| Pieza | Archivo |
|---|---|
| Tipos del spec (RowDef, CellRef, KpiRowDef, Viz, VizOptions, SemanticFamily) | `src/dashboards/types.ts` |
| Viz efectiva por widget, formas horizontales, canvas, franja de leyenda | `src/dashboards/viz.ts` |
| Plantillas, tiers, presupuestos, `validateLayout`, `packRows` | `src/dashboards/layout.ts` |
| Tokens (estado corregido, módulos, ritmo) y sistema de filas `.dash-row` | `src/app/globals.css` |
| Registro semántico (familias explícitas, neutrales, orden, grupos) | `src/lib/charts/semantic.ts` |
| `displayLabel`, `titleCase`, `dayShort`, `initials` | `src/lib/labels.ts` |
| `describeDelta` (único cálculo de variación y tono), `formatDeltaPP`, `copUnit` | `src/lib/format.ts` |
| Contrato de visualización `VizProps` / `CompositeProps` | `src/components/widgets/types.ts` |
| Registro viz → componente, aviso de calidad automático (≥ 85 % neutral) | `src/components/widgets/widget-renderer.tsx` |
| Tarjeta v2 (header, franja de leyenda, cuerpo, menú ⋯, Ampliar, Ver datos, CSV, PNG) | `src/components/dashboard/widget-card.tsx` |
| Secciones y filas (SectionHeader, DashboardRow, StackCell, CompositeCard, pestañas) | `src/components/dashboard/section.tsx` |
| Gramática común: ChartLegend/ScaleLegend/SectionLegend, ChartTooltip, DeltaChip, MicroTrend, StatusIcon, QualityChip, VizSkeleton/VizEmpty, LegendSlot | `src/components/widgets/kit/*` |
| Medición de elementos compatible con el React Compiler | `src/hooks/use-element-size.ts` |

Reglas de código para toda visualización:
- Llena su contenedor (`.dash-body` mide el tier de la fila); los canvas usan `<div className="relative h-full">` y
  Chart.js con `maintainAspectRatio: false`. `height` (prop) es un PRESUPUESTO para decidir capacidad, no el alto del DOM.
- En móvil (`@container page < 600px`) las filas pasan a alto por contenido: los componentes HTML deben verse bien sin alto
  fijo; los canvas reciben alto propio por CSS (`[data-viz]`).
- Texto largo en HTML, nunca en el canvas. Etiquetas con `displayLabel`. Nada de `text-overflow` en etiquetas de
  rankings a 390 px: se envuelven.
- Leyendas y chips en `<LegendSlot>`; tooltips con `useChartTooltip` + `<ChartTooltip>`; leyenda nativa de Chart.js apagada.
- Filtro cruzado: `useDashboard().toggleValue(dimension, label)`; seleccionado en `filters.eq[dimension]`
  (el widget de origen conserva todas sus categorías: resaltar la selección, atenuar el resto a 0,45).
- Colores: `categoryColors` / `resolveStatus` / `TONE_VARS`; nunca hex sueltos. Texto siempre en tinta.
- React 19 + React Compiler: sin lecturas de refs en render, sin setState síncrono en efectos, sin componentes
  definidos dentro de otros, `useMemo` con dependencias completas.

## principles
- Jerarquía explícita en tres niveles. P1 (protagonista): exactamente una visual por tablero, en la sección 1 o 2, a 12 columnas (o en el lado ancho de un 8-4), tier L o XL, con la variante de tarjeta hero. Es el mapa en los 10 tableros con mapa, la serie en Facturas recibidas, la matriz día × hora en Facturas emitidas y la matriz de fases en Eficiencia. P2 (co-protagonista): como máximo una, normalmente la serie (12 M u 8 M). Todo lo demás es P3 (S/M). Hay un único KpiHero de 44 px por tablero, también en Eficiencia (Asignación).
- Una pregunta por sección. El H2 formula la pregunta que la sección responde y el eyebrow es la etiqueta corta de navegación. La tabla de detalle siempre es la última sección.
- La forma sigue al trabajo del dato y el color se elige al final. Árbol de decisión único:
- 2–3 categorías → CompositionBar split.
- 4–7 partes de un todo → CompositionBar legend.
- Estados → StatusStrip o StatusBoard.
- Etapas → PipelineSteps.
- ≤ 10 entidades de nombre corto → EntityTiles o CategoryTiles.
- Muchas partes con etiquetas cortas → Treemap.
- Nominales largas → RankingList.
- Personas → PeopleLeaderboard.
- Ordinales cortas → ColumnBars.
- Dos ordinales → HeatmapMatrix.
- Territorio → HeroMap.
- Tiempo → AreaTimeseries o MonthlyBarsDelta.
Las donas se retiran de los 13 tableros.
- Regla anti-monotonía (queja 2 del cliente). Las formas de barra horizontal (RankingList, PeopleLeaderboard, SplitRows y DrilldownBars) no superan el 40 % de las celdas de visualización de un tablero. Hay máximo 2 por sección y nunca dos secciones seguidas con más del 50 % de sus celdas en esas formas. Hoy casi la mitad de los 114 widgets son barras; tras el rediseño son 20 de 114 (17,5 %).
- El texto largo va en HTML, no en canvas. Chart.js queda solo para geometría continua u ordinal: series, columnas ordinales, histogramas, treemap y sankey. Las barras horizontales de Chart.js para categorías nominales desaparecen.
- Toda fila suma 12 y todas sus tarjetas miden lo mismo. Que el contenido quepa se garantiza con un presupuesto de alto por componente y tier, no por suerte. validateLayout comprueba la suma, la capacidad, la jerarquía y la anti-monotonía.
- El color siempre significa algo:
- Naranja Balú: marca e interacción.
- Color de módulo: solo chrome (shell, Home, paleta, encabezado del tablero); nunca dentro de un widget de tablero.
- Estado: escala fija, siempre con ícono y etiqueta.
- Categórica: identidad, en orden fijo.
- Rampa naranja: magnitud.
El texto siempre va en tinta.
- Una sola gramática en todo el aplicativo:
- la misma leyenda, bajo el título y a la izquierda;
- el mismo tooltip, con el valor primero;
- el mismo DeltaChip (p.p. para porcentajes);
- los mismos formatos (1 decimal en %, una sola unidad COP por gráfica);
- los mismos tokens por métrica (conteo = chart-1; COP y serie secundaria = chart-2; periodo anterior = gris).
- Lo neutral va al final, se ve y se mide. 'No reporta', 'Otros' y 'Sin …' van en gris, después de una hairline, sin rango y fuera del máximo de la escala. Entre 15 y 85 % neutral se muestra un chip de calidad de dato. Con 85 % o más, el widget se convierte en un aviso de calidad (DataQualityNotice) en lugar de una gráfica vacía.
- Filtrar es resaltar: el widget de origen conserva todas sus categorías y resalta la seleccionada. El color sigue a la entidad, nunca a su posición.
- Los hermanos se leen igual. Facturas R/E, PQRD/Entes/Eficiencia, SMART 1-2-3, Medicina Laboral E/S y Correspondencia E/S comparten esqueleto de secciones, plantillas, banda de KPIs y componentes por tipo de dimensión. Por ejemplo, 'canal' siempre es CompositionBar y su layout depende de la cardinalidad.
- Claro y oscuro son selecciones propias, incluido el mapa base. Todo texto cumple AA (4,5:1). Las marcas cumplen 3:1 o llevan etiqueta visible y 'Ver datos'.
- No se pierde ninguna métrica. Un test compara los ids de KPIs, widgets y columnas contra una línea base congelada; solo se permiten superconjuntos declarados. Una misma partición no se dibuja dos veces con la misma forma en pantalla: si la banda la resume como tasa, el widget la desagrega (volumen, subtipos o neutrales).
- Movimiento con propósito: entradas escalonadas, count-up y crecimiento de barras en 500 ms o menos. Al recargar se mantiene el render anterior al 60 %. Todo respeta prefers-reduced-motion.

## layoutSystem
1) CONTRATO EN EL SPEC (types.ts, retrocompatible)
- Los widgets siguen en section.widgets, así que el motor, los ids y run.ts no cambian.
- SectionDef gana:
  - rows?: RowDef[], donde RowDef = { template; tier: 'S'|'M'|'L'|'XL'|'auto'; cells: CellRef[] };
  - nav: eyebrow y etiqueta de SectionNav;
  - question: el H2;
  - legend: SectionLegend compartida.
- CellRef puede ser:
  - 'widgetId';
  - { stack: [a, b], ratio?: '1:1' | '3:2' };
  - { composite: 'heatmap-matrix' | 'phase-matrix'; widgets: string[]; title }.
- WidgetDef gana:
  - viz, semantic (familia explícita), labelKind y aliases;
  - visibleRows y listColumns;
  - maxItems: dominio esperado; solo lo usa la validación.
  - size pasa a opcional y solo lo usa el empaquetador de respaldo.
- DashboardSpec gana kpiLayout y unit ({ singular, plural }).

2) PLANTILLAS CERRADAS (siempre suman 12)
- Secciones: '12', '8-4', '4-8', '7-5', '5-7', '6-6', '4-4-4', '3-3-3-3', '6-3-3'.
- Banda de KPIs, además: '3-3-6', '3-6-3', '3-4-5'.
- Reglas:
  - Una celda sola solo puede ser '12'.
  - La P1 va en '12' o en el lado ancho de un 8-4.
  - Solo se emparejan widgets que caben en el mismo tier.
  - Dos widgets pequeños junto a uno alto: StackCell (ver 7) o fila propia. Nunca aire.

3) CONTENEDOR (ancho útil, no viewport)
- Los roots de DashboardView y HomeView son el contenedor 'page' (@container/page en Tailwind v4, container-type: inline-size).
- Columnas según el ancho del contenedor:
  - menos de 600 px → 1;
  - 600–839 px → 6;
  - 840 px o más → 12.
- El umbral de 12 columnas baja de 900 a 840 porque a 1024 con riel y barra de scroll clásica (15 px) el contenido mide ≈ 893 px.
- Padding lateral: 16 (móvil), 20 (tablet) y 32 (escritorio a partir de 1280 px de viewport).
- Sidebar en riel automático entre 1024 y 1279 px de viewport, salvo preferencia guardada.
- Ancho de diseño: 1076 px de contenido a 1440 con sidebar expandido. Columna = 71,3 px y gap = 20.

| Span | Ancho | Interno (−40) |
|---|---|---|
| 3 | 254 | 214 |
| 4 | 345 | 305 |
| 5 | 437 | 397 |
| 6 | 528 | 488 |
| 7 | 619 | 579 |
| 8 | 711 | 671 |
| 12 | 1076 | 1036 |

- A 6 columnas:
  - '12' → 6;
  - '6-6' → 3 | 3;
  - '4-4-4' → 3 | 3 y la tercera a 6;
  - '3-3-3-3' → 3 | 3 dos veces;
  - '6-3-3' → 6 y luego 3 | 3;
  - las asimétricas se apilan a 6, para no reducir la P1 a media anchura.
- Las reglas viven en globals.css con selectores [data-t] y [data-tier], sin depender del escaneo de clases de Tailwind.

4) TIERS (alto total de la tarjeta; todas las celdas de la fila lo comparten)
| Tier | Escritorio | Tablet |
|---|---|---|
| S | 280 | 280 |
| M | 380 | 360 |
| L | 480 | 460 |
| XL | 640 | 540 |
- Móvil: los componentes HTML miden según su contenido; los canvas tienen alto propio:
  - serie: 260;
  - columnas e histograma: 240;
  - treemap: 300;
  - sankey: 380;
  - mapa: 420 + panel debajo.
- 'auto' solo para tablas, pivotes y eficiencia: alto por contenido, máximo 640, scroll interno, cabecera y totales fijos.
- Se eliminan DEFAULT_HEIGHT, el minHeight de WidgetCard y el cálculo n×34+48 de bar-chart.

5) ANATOMÍA Y CUERPO ÚTIL
- Padding 20 (16 en móvil) → 40 de alto.
- Header: 44 + 12 de separación = 56.
- Franja de leyenda: 24 + 8 = 32. Se reserva en toda la fila si alguna celda la usa.
- Cuerpo = tier − 96 (−32 si hay franja):

| Tier | Cuerpo | Con franja |
|---|---|---|
| S | 184 | 152 |
| M | 284 | 252 |
| L | 384 | 352 |
| XL | 544 | 512 |

- Tablet: M 264, L 364, XL 444.

6) PRESUPUESTO POR COMPONENTE (ancho de diseño; validateLayout lo usa)
- RankingList:
  - filas: 40 (1 línea), 56 (2 líneas) o 32 (compacta, barra inline);
  - cabecera de concentración 40, fila fijada 44, pie 28;
  - filas por columna: S 3 (4 compactas), M 6 (7), L 8 (11), XL 12;
  - columnas: 1 si el interno es menor de 624; 2 a partir de 624 (span 8 o más, o span 6 en modo compacto); 3 a partir de 960 (span 12).
- PeopleLeaderboard:
  - filas: 44 (avatar 28) o 34 compacta (avatar 22);
  - callout 32, pie 28;
  - capacidad: M 5; L 8, o 10 compacta sin pie; XL 11.
- StatusStrip:
  - barra 24, cabecera de grupo 28, tile de 112×76 como mínimo, hueco 8;
  - tiles por línea = ⌊(interno + 8) / 120⌋;
  - alto = 24 + 28·(agrupado) + líneas·76 + (líneas − 1)·8;
  - vertical (span 4 o menos): 24 + n·64 + (n − 1)·8;
  - lista compacta: 40 + n·32.
- PipelineSteps: horizontal si el interno es de al menos n·150 (alto 120); si no, vertical con 24 + n·48.
- CompositionBar:
  - layout legend: 24 + ⌈n / cols⌉·24; cols = ⌊(interno + 16) / 248⌋ entre 1 y 3 (columnas de ≥ 232 px, como colRange del componente; el total va en la cabecera o la franja);
  - layout split: ≈ 120 en columnas si el interno es de al menos n·140; si no, en filas con n·32 + 24.
- Tiles:
  - CategoryTiles 2×2: tile de 136×104 como mínimo.
  - EntityTiles: tile de 180×112 como mínimo, 5 por línea a 12 columnas.
- FamilySplit: 96 + 20 + ⌈entradas / 2⌉·20.
- Chart.js (llenan el cuerpo), mínimos:
  - área 180;
  - columnas e histograma 160;
  - mensual 200 + 28 de fila Δ;
  - treemap 200;
  - sankey 320;
  - heatmap: filas·24.

7) LLENADO Y CELDAS ESPECIALES
- El canvas llena el 100 % del cuerpo.
- Rankings: muestran visibleRows = capacidad; el resto va a 'Ver N más' con scroll interno. Con más de 30 ítems, Dialog con búsqueda.
- Tiles y strips distribuyen con 1fr.
- StackCell: solo en L o XL. Cada subtarjeta mide (tier − 20) / 2, o sea cuerpo 134 en L y 214 en XL, sin franja de leyenda. Si su contenido no cabe, el widget va a una fila propia.
- CompositeCard: una tarjeta con varios resultados y un menú ⋯ con 'Ver datos' y 'CSV' por cada widget fuente.

8) RITMO (base 8)
| Elemento | Escritorio | Móvil |
|---|---|---|
| Entre secciones | 48 | 40 |
| Header de sección → primera fila | 16 | 16 |
| Gap de fila y de celda | 20 | 16 |
| Padding de tarjeta | 20 | 16 |
- Radio 20 y --content-max 1600 px, iguales en Home y tableros.

9) SECCIONES Y ANCLAS
- <section id> + SectionHeader: eyebrow = nav, H2 = question, descripción de una línea como máximo y SectionLegend a la derecha.
- scroll-margin-top = --sticky-h + 16, donde --sticky-h = topbar (64) + alto medido de la FilterBar.
- SectionNav con scroll-spy y deep links (#territorio).

10) ORDEN CANÓNICO
KPIs → estado o cumplimiento (solo si el tablero tiene SLA o semáforo; alto S o M) → Territorio (P1, nunca comparte fila; S1 o S2) → Tendencia (P2) → Composición → Rankings y responsables → Cruces (pivotes, eficiencia, drill) → Detalle.

11) VALIDACIÓN
validateLayout(spec) corre en desarrollo (contorno rojo + console.error) y en vitest. Verifica:
- plantilla válida y celdas = segmentos;
- cada widget y cada KPI exactamente una vez (en rows o en kpiLayout), y que los ids sean un superconjunto de la línea base congelada;
- capacidad: altoRequerido(viz, maxItems, anchoInterno) ≤ cuerpo del tier. maxItems = topN (+1 si hay others), o el dominio del perfil, o lo declarado;
- una sola P1 por tablero;
- anti-monotonía: 40 % máximo, 2 por sección como máximo, sin dos secciones seguidas dominadas;
- capacidad de los KpiGroup.

QA visual (Chrome headless): 1440, 1280, 1024, 768 y 390 px; claro y oscuro; sidebar expandido y en riel. Verifica:
- que en cada .dash-row la suma de anchos sea igual a la fila y los altos sean iguales (±2 px);
- que no haya overflow ni ellipsis en rankings a 390 px;
- que la FilterBar no tenga scroll horizontal en escritorio;
- el encuadre del mapa (ver mapRedesign).

12) EMPAQUETADOR DE RESPALDO
Una sección sin rows se empaqueta por size y estira la última celda hasta 12, con aviso en desarrollo. Así se migra un tablero a la vez.

## colorSystem
A) ROLES
1. Naranja Balú (#DF7702; oscuro #F08A1C): marca e interacción. CTA, foco, chip activo, selección, acento del KpiHero y último tramo de la micro-tendencia.
2. Identidad de módulo: solo chrome. Sidebar, ModuleNav, secciones y tarjetas del Home, paleta de comandos y tile/eyebrow del encabezado del tablero. Nunca dentro de un widget de tablero; CategoryTiles tampoco lleva color de módulo.
   - Excepción documentada: MicroColumns del Home y de la paleta, donde la serie ES la identidad del tablero.
3. Estado: escala fija, siempre con ícono y etiqueta.
4. Categórica: identidad de entidades.
5. Rampa naranja: magnitud.
6. Texto siempre en tinta:
   - text, text-2 y muted (4,98:1) cumplen AA;
   - faint (#A2A2A2, 2,55:1) queda solo para íconos decorativos y placeholders;
   - cabeceras de grupo y eyebrows pasan a muted;
   - nuevo token --primary-text #A84D00 (4,9:1 sobre primary-soft-2) para ítem activo del nav, enlaces y eyebrows en naranja. Hoy primary-strong #C05800 sobre #FFEDD8 da 3,96:1 y no cumple AA.

B) IDENTIDAD DE MÓDULO
Reemplaza el naranja de PQRD, que chocaba con la marca. Validada con validate_palette.js (skill dataviz) en el orden del menú.

Claro (surface #FFFFFF): PASS.
- CVD peor adyacente 10,7 (Medicina ↔ Tutelas, deutan).
- Visión normal peor adyacente 17,0 (Tutelas ↔ SMART).
- Todas ≥ 3:1.

Oscuro (surface #161A21): PASS.
- CVD 8,2.
- Visión normal 16,0.
- Todas ≥ 3:1.

Todos los colores quedan a ΔE ≥ 20 del naranja Balú (PQRD, el más cercano, a ≈ 25).

| Módulo | Claro solid | ink | soft | Oscuro solid | ink | soft |
|---|---|---|---|---|---|---|
| Facturación (azul cobalto) | #2563C9 | #1B4EA6 | #E9F1FD | #4482EB | #9CC0F7 | #14223A |
| PQRD y Entes (turquesa) | #0E9487 | #0A6E64 | #E1F6F2 | #1CA193 | #78D6C8 | #0D2A26 |
| SMART (violeta) | #7B52D9 | #5A38B0 | #F0EBFC | #8E69EC | #C2B1F8 | #231C3C |
| Tutelas (frambuesa) | #AB2F80 | #8A1E64 | #FBE9F3 | #C34E97 | #F0A6CF | #34182A |
| Medicina Laboral (cerúleo) | #0B93BE | #086F91 | #E2F4FA | #24A0CC | #86CDEA | #0B2633 |
| Correspondencia (púrpura) | #892498 | #6C1A79 | #F6E8F8 | #9E49B7 | #DCAAEA | #2C1734 |

Contraste:
- ink sobre soft: al menos 5,0:1 en claro y 8,4:1 en oscuro.
- Tile: degradado de 145° de solid a solid-2 (claro: solid-2 = ink; oscuro: solid-2 = el solid claro), con ícono blanco a 3:1 o más.

Par no adyacente más cercano: PQRD ↔ Medicina, ΔE 8,7. Mitigación: nunca son vecinos en ninguna superficie ordenada y siempre van con ícono y nombre.

Mecanismo: [data-module] define --mod, --mod-2, --mod-ink y --mod-soft; --shadow-mod = 0 18px 40px -18px color-mix(--mod 45 %, transparent).

C) ESTADO (escala fija; no es paleta categórica)
| Tono | Claro | Oscuro |
|---|---|---|
| good | #0CA30C | #22B35A |
| info | #2C70D5 | #4D8FE6 |
| warning | #FAB219 | #FAB219 |
| serious | #EC835A | #EC835A |
| critical | #D03B3B | #D03B3B |
| neutral | #B4B8BF | #5B6370 |

Cambios:
- Critical oscuro pasa de #E55A5A a #D03B3B (3,63:1). La separación visión normal frente a serious sube de ΔE 9,1 a 15,7.
- Inks corregidos:
  - warning-ink #8F5000: 5,2:1 sobre warning-soft (el actual #9D590C da 4,45:1 y no cumple);
  - serious-ink #A8421B / #F5A27F con serious-soft #FBE6DC / #331D14: 5,0:1 y 7,8:1;
  - critical-ink #BD1C1C: 4,8:1.

Warning ↔ serious queda en ΔE 13,6 y bajo 3:1 sobre blanco, por diseño. Mitigación obligatoria:
- ícono + etiqueta: good CheckCircle2, info Clock, warning AlertTriangle, serious AlarmClock, critical AlertOctagon, neutral CircleDashed;
- 2 px de separación entre segmentos;
- agrupación en las tiras.

Los tonos de estado solo aparecen en componentes de estado o en series que SON estados (RADIAN, momento).

D) CATEGÓRICA (orden fijo; se mantiene)
naranja #DF7702 · azul #2A78D6 · aqua #1BAF7A · amarillo #EDA100 · magenta #E87BA4 · verde #008300 · violeta #4A3AA7 · rojo #E34948

Revalidada sobre las superficies reales:
- claro (#FFFFFF): CVD 9,1, visión normal 19,6;
- oscuro (#161A21): 8,4 y 19,3;
- en claro, aqua, amarillo y magenta quedan bajo 3:1, así que el alivio es obligatorio (etiqueta visible o 'Ver datos').

Reglas:
- Un widget categórico usa como máximo los slots 1–5 más neutral (verde y rojo imitan estados).
- Formas en las que se comparan todos los pares (mapa, small multiples): máximo 3 slots.
- Asignación estable por entidad: spec.order o useStableCategoryColors(slug:widgetId).

E) TOKENS POR MÉTRICA (iguales en los 13 tableros)
- Conteo: chart-1.
- Valor COP y serie secundaria (aprobados, SealMail): chart-2. Corrige el aqua de facturas emitidas.
- Periodo anterior: --chart-tick al 55 %, línea sólida de 1,5 px.
- Tramo parcial: punteado.
- Referencia: punteada en tinta.

F) FAMILIAS SEMÁNTICAS
Van explícitas por widget y columna (semantic: 'familia'). 'auto' deja de aplicarse: solo sugiere en desarrollo.

normalizeLabel: minúsculas, NFD sin tildes, colapsa espacios y quita SOLO prefijos ordinales de 1–2 dígitos ('1. ', '03. '). Los códigos RADIAN de 3 dígitos se conservan ('030. …').

Familias:
- semaforo:
  - 1 cerrado a tiempo → good
  - 2 abierto en término → info
  - 3 próximo a vencer → warning
  - 4 cerrado vencido → serious
  - 5 abierto vencido → critical
  - 6 sin clasificar, no reporta y sin cruce → neutral
- sla:
  - a tiempo → good
  - preventiva → warning
  - por vencer → serious
  - vencido → critical
  - sin categoría y no reporta → neutral
- cumplimiento:
  - en término → good
  - en trámite → info
  - fuera de término → serious
  - vencido → critical
  - no reporta → neutral
- flujo:
  - Finalizado → good: aprobado, reclasificación aprobada, cerrado, enviado, entrega exitosa, gestión terminada, publicación.
  - En curso → info: por asignar, en asignación, para gestión, en edición, por revisar, por aprobar, por recibir correspondencia, solicitud de reclasificación, solicitud cierre devolución.
  - Devuelto o rechazado → serious: revisión, gestión y aprobación rechazadas; devuelto.
  - Anulado → neutral: anulado, eliminada, excluido, cerrado sin gestión, duplicado.
  - Dentro de un grupo, opacidad escalonada 100/72/48 %.
  - Se permiten overrides por spec (correspondencia-entradas: En curso = PENDIENTES).
- momento:
  - gestión → info
  - cierre → good
- estado-queja:
  - cerrada → good
  - abierta → info
  - recibida → neutral
- notificacion:
  - acuse de recibo → good
  - el destinatario abrió → info
  - no fue posible la entrega → critical
  - no reporta → neutral, con la etiqueta 'Sin evento'
- guia:
  - entrega exitosa → good
  - enviado courier → info
  - por enviar (mensajería o courier) y por recibir en correspondencia → warning
  - devuelto → critical
  - envío anulado → neutral
  - no reporta → neutral, con la etiqueta 'Sin guía física'
- factura:
  - emitida → good
  - inconsistente → critical
- radian (ordinal de proceso):
  - 'sin evento radian' → warning, con la etiqueta 'Pendiente de acuse'
  - '030. acuse de recibo' → info
  - '032. …' → good
  - 033/034 → good
  - 031 → critical
- transmision:
  - transmitido → good
  - resto → warning
- alerta:
  - sí → critical
  - no → neutral
- binario:
  - sí → slot 1
  - no → neutral
- canal-envio:
  - Digital → slot 1
  - SealMail → slot 2
  - Sin canal → neutral
- fallo (familias para FamilySplit; por validar con jurídica):
  - Favorable: a favor, confirma a favor, revoca a favor, revoca sanción.
  - Desfavorable: en contra, confirma en contra, revoca en contra, sanción.
  - Trámite: informativo, cierre, requerimientos, oficios de trámite, decreta nulidad.
  - Sin dato: no reporta.

En desarrollo se avisa de cualquier etiqueta sin mapear dentro de su familia; el fallback es neutral.

G) SECUENCIAL
- Rampa naranja --seq-0…6. En oscuro es una selección propia ('más claro = más').
- Mapa: 5 clases por cuantiles, seq-2…6.
- Heatmaps y pivotes: escala raíz continua con ScaleLegend numérica.
- Nunca rampas sobre categorías nominales.

H) NEUTRALES Y CALIDAD DE DATO
- Categorías: No reporta, 'Otras N categorías', Sin clasificar, Sin categoría, Sin cruce, Sin canal, Sin responsable, No aplica.
- Van en --neutral-mark, al final y sin rango.
- 15–85 % neutral: chip warning-soft en la franja de leyenda.
- 85 % o más: DataQualityNotice.

I) TEXTURA
Opt-in solo en forced-colors, impresión o ajuste de accesibilidad. A 45° o 135°.

J) VALIDACIÓN OBLIGATORIA
Correr validate_palette.js sobre la categórica y la de módulos con --mode light --surface #FFFFFF y --mode dark --surface #161A21, más contrast() para cada token -ink y --primary-text.

## legendSystem
L1. UNA SOLA FAMILIA
- ChartLegend: series y categorías.
- ScaleLegend: magnitud.
- SectionLegend: codificación compartida por varias tarjetas.
- Legend-table: integrada en CompositionBar, StatusStrip y FamilySplit.
- En Chart.js, plugins.legend.display = false en todos los widgets. Esto elimina las claves invisibles de las series (pointBorderColor = superficie).

L2. POSICIÓN FIJA
- Siempre en la franja de 24 px bajo el header, alineada a la izquierda. La franja se reserva en toda la fila para que todas las gráficas empiecen a la misma altura.
- Los chips de calidad de dato van en la misma franja, a la derecha.
- Excepciones:
  - mapa: dentro del panel;
  - heatmaps y pivotes: bajo la grilla, a la izquierda;
  - StatusStrip vecino declarado como legendFrom (ciclo RADIAN).

L3. CUÁNDO APARECE
- Con 2 o más series, siempre.
- Con 1 serie, nunca: el título la nombra.
- En StatusStrip, PipelineSteps, CompositionBar y RankingList la leyenda es el propio componente (etiqueta + valor + %).

L4. MUESTRA CON LA FORMA DE LA MARCA
| Marca | Muestra |
|---|---|
| Barra, área o segmento | cuadro 10×10, radio 2 |
| Serie | línea 16×2 |
| Periodo anterior | línea gris sólida 16×1,5 |
| Tramo parcial | punteada |
| Mapa | punto de 8 px |
| Estado | ícono de 14 px en -ink + punto |
| Neutral | cuadro gris |

L5. TEXTO EN TINTA
- Etiqueta: 12 px, text-2.
- Valor: 12 px/600, text.
- %: muted.
- Nunca en el color de la serie.

L6. INTERACCIÓN
- Series: clic oculta la serie (setDatasetVisibility); Alt+clic la aísla.
- Categorías: clic llama toggleValue, con la pista 'Clic para filtrar'.
- Estados visuales: hover en surface-3; oculto con opacidad 0,4 y tachado; seleccionado en primary-soft con check.
- Accesibilidad: <ul role=list> con botones aria-pressed.

L7. ORDEN
- Igual al de las marcas.
- Ordinal o semántico: orden de proceso o de severidad.
- Nominal: valor descendente.
- Neutrales al final.
- Etiquetas vía displayLabel.

L8. ESCALAS (ScaleLegend)
- Clases con rangos reales ('1–5', '6–20', …).
- Muestra 'Sin registros'.
- Nota del método ('Clases por cuantiles' o 'Escala raíz').
- En oscuro: 'más claro = más'.
- Se prohíbe 'Escala logarítmica' sin números.

L9. CODIFICACIÓN COMPARTIDA
Una sola SectionLegend en el header de la sección (SMART 3: Gestión info · Cierre good, en tipo oración). Las tarjetas omiten la suya.

L10. ETIQUETAS DIRECTAS SIN COLISIÓN
- Una sola serie: marcador y etiqueta en el último valor, más el pico opcional.
- 2 series ('lines'): se rotulan ambas solo si los últimos puntos están separados 16 px o más en vertical; si no, solo la principal.
- Apiladas ('stacked'): sin etiquetas finales; los valores van en el tooltip y los totales en la leyenda.
- El periodo anterior nunca se rotula.

L11. TOOLTIP ÚNICO (ChartTooltip)
- El valor primero; la clave con la forma de la marca.
- Luego %, Δ frente al periodo anterior y la pista de filtro.
- El foco de teclado muestra lo mismo.

L12. CONVENCIONES UNA SOLA VEZ
- Cabecera de la banda de KPIs: 'Indicadores del 1 – 28 sept 2026 · comparado con 4 – 31 ago 2026'. Se toma de range.prevFrom/prevTo de la API (previousRange = periodo inmediatamente anterior de igual duración). Nunca '1 – 28 ago'.
- Ícono (?) con p.p. y colores de variación, y pie global de convenciones.
- Se eliminan los subtítulos del tipo 'la línea tenue…' y 'Doble clic…'.
## components

### RowGrid (DashboardRow, CellCard, StackCell y CompositeCard)
- reemplaza: SIZE_CLASS de widget-card.tsx, el grid auto-flow de section.tsx, DEFAULT_HEIGHT y minHeight de WidgetCard, y el alto n×34+48 de bar-chart.tsx
- cuándo: Todas las secciones de los 13 tableros. La banda de KPIs usa el mismo grid.
- spec: Estructura: <div class='dash-row' data-t='8-4' data-tier='M'> con una celda por segmento de la plantilla. CSS en globals.css:
- @container page para 1, 6 y 12 columnas (umbrales 600 y 840).
- --row-h por tier y tamaño del contenedor.
- CellCard lleva height:100 %.

StackCell:
- grid-rows 1fr 1fr (o 3fr 2fr) con el mismo gap;
- solo en L o XL;
- cuerpo por subtarjeta: 134 en L y 214 en XL, sin franja de leyenda.

CompositeCard: un header y un menú ⋯ con 'Ver datos' y 'CSV' por cada widget fuente.

En desarrollo se dibuja un contorno rojo y se emite console.error cuando:
- la plantilla no coincide con las celdas;
- un id no existe;
- el contenido no cabe en el presupuesto del tier (tabla de layoutSystem §6).

Secciones sin rows: packRows().

Accesibilidad: el orden del DOM es el orden de lectura.

### WidgetCard v2
- reemplaza: WidgetCard actual (minHeight fijo y header de alto variable)
- cuándo: Todo widget de tablero.
- spec: Flex column con height 100 %.

1) Header (min-h 44):
- Título: 15 px/700, 1 línea; texto completo en title y tooltip. Se usan sustantivos cortos.
- Subtítulo: 12 px muted, 1 línea. Indica alcance, unidad o insight ('Top 15 de 42 · 91 % del total'), nunca instrucciones.
- A la derecha: headerExtra (Segmented Día/Semana/Mes, Cantidad/%, Mapa de árbol/Lista), badges Provisional y Año en curso, ícono de nota, spinner de refetch y menú ⋯.

2) Franja de leyenda de 24, reservada por fila.

3) Cuerpo flex-1, min-h-0.

4) Pie opcional mt-auto.

Padding 20/16 y radio 20.

Variante hero (solo P1): eyebrow 11 px/700 uppercase y --shadow-hero (un paso más profunda). Sin bordes de color.

Estados:
- primera carga: VizSkeleton del arquetipo;
- refetch: render previo al 60 %;
- vacío: EmptyState compacto;
- error: mensaje y 'Reintentar'.

Menú: Ampliar (Dialog de 95vw con el mismo componente), Ver datos (resultToTable), CSV y PNG (canvas, o html-to-image en widgets HTML; si falla se oculta).

Accesibilidad: article con aria-labelledby; los canvas llevan role=img y un aria-label con resumen ('Radicados por día: máximo 64 el 8 sept').

### SectionHeader + SectionNav
- reemplaza: El encabezado de sección actual y la navegación inexistente en páginas de 3.000 a 5.400 px
- cuándo: Todas las secciones y todos los tableros.
- spec: SectionHeader:
- eyebrow 11 px/700 muted con tracking .12em (section.nav, p. ej. 'TERRITORIO');
- H2 20 px/700 con la barra de marca (section.question);
- descripción de 1 línea como máximo;
- SectionLegend a la derecha;
- fade-up de 8 px, una sola vez.

SectionNav:
- En escritorio aparece en el topbar cuando el H1 sale de pantalla (sentinel + IntersectionObserver): pestañas con subrayado layoutId y scroll-spy con rootMargin −(sticky-h) 0 −60 % 0.
- Clic: scroll suave y history.replaceState('#id'). Un deep link al cargar hace scroll a la sección.
- En tablet y móvil, un botón 'Secciones' en la FilterBar abre un bottom sheet con la lista, 'Ir al detalle' y 'Volver arriba'.

### KpiBand (KpiHero, KpiGroup y KpiTile)
- reemplaza: La grilla fija de KpiCard (xl:grid-cols-4/5/6), con tarjetas clonadas y huecos (8 KPIs quedan 6+2 y 10 KPIs quedan 6+4)
- cuándo: Banda superior de los 13 tableros, declarada en spec.kpiLayout.
- spec: Ver kpiRedesign.

KpiHero:
- etiqueta de 14 px en 1 línea;
- cifra con font-size clamp(32px, 20cqi, 44px), peso 700 y CountUp;
- DeltaChip md + 'antes: 1.612';
- MicroTrend flex con mínimo de 32 px;
- barra superior de 3 px en --primary.

KpiGroup (una sola tarjeta):
- eyebrow;
- celdas horizontales separadas por hairlines: label short de 12,5 px, cifra de 26 px, DeltaChip sm y MicroTrend opcional de 24 px;
- variantes:
  - list;
  - proportion: barra de 8 px con los tonos de las partes; clic en un segmento filtra;
  - stepper: chevrons en orden de proceso; la fase más lenta lleva anillo --primary;
  - alerts: la peor variación desfavorable va en critical-soft;
  - pair;
  - embed: dibuja un widget de categoría como barra y conserva su menú 'Ver datos' y 'CSV'.

KpiTile:
- gauge: cifra de 36 px, medidor 0–100 % con marcador del periodo anterior, sin metas inventadas;
- status: borde izquierdo de 3 px en el tono y acción de filtro o ancla;
- compact: fila 2, 112 px.

Capacidad y fallback: ver kpiRedesign. En escritorio nunca hay lista vertical.

Las cifras de una fila comparten línea base.

### DeltaChip + MicroTrend
- reemplaza: El delta relativo en los KPIs de %, el '▲▼' gris del Home, las sparklines rojas y naranjas y la Sparkline que convierte null en 0
- cuándo: KPIs, tarjetas del Home, paleta y panel del mapa.
- spec: DeltaChip:
- Formato pct: diferencia en p.p. ('+1,3 p.p.'). Otros formatos: variación relativa.
- Casos neutrales:
  - |Δ| < 0,05 → '0,0' con ícono Minus;
  - sin anterior → 'Sin base';
  - conteo con anterior menor que 20 → tono neutral y tooltip 'Base pequeña'.
- Tono = dirección × polaridad: good-soft/good-ink, critical-soft/critical-ink o surface-3.
- Tooltip con el valor anterior y su rango.
- deltaTone vive en lib/format.ts y es el único punto de cálculo del tono.

MicroTrend (SVG):
- columnas para medidas aditivas; línea de 1,5 px para tasas y promedios;
- de-énfasis en --neutral-mark, con el último bucket en --primary (o --mod en el Home);
- fines de semana más tenues;
- null es un hueco, nunca 0;
- línea base hairline;
- role=img con resumen;
- scaleY de 500 ms, una sola vez.

### ChartLegend + SectionLegend + ScaleLegend + ChartTooltip
- reemplaza: La leyenda nativa de Chart.js arriba a la derecha (sin clave visible), la lista bajo la dona, la caja flotante del mapa, el 'Menos/Más' del pivote y los dos estilos de tooltip
- cuándo: Cualquier gráfica con 2 o más series o categorías codificadas por color, las escalas de magnitud y todos los tooltips.
- spec: ChartLegend:
- items {key, label, shape, color|tone, value?, share?, hidden?, selected?};
- mode 'series' | 'filter' | 'static';
- layout 'inline' | 'list' | 'grid';
- muestras y comportamiento según legendSystem L4–L7.
- SectionLegend es la misma pieza en layout inline dentro de SectionHeader.

ScaleLegend:
- props {title, stops | {min, max}, stepped, format, noData, note};
- barra de 8×160–200 px; clases de 24 px separadas 2 px, con límites en formatCompact;
- lee la rampa del tema activo.

ChartTooltip:
- Chart.js con tooltip.external, dibujado en un portal de React; los componentes HTML y el mapa usan <ChartTooltip anchor>;
- fondo #14171C (claro) o #242A34 (oscuro), radio 12, ancho máximo 280;
- valor de 14 px/700 primero; luego etiqueta, % y Δ;
- textContent o nodos React, nunca innerHTML.

### SemanticRegistry (src/lib/charts/semantic.ts, reescrito)
- reemplaza: Las 6 paletas por texto exacto y NEUTRAL_LABELS (Vencido en verde, 'No reporta' naranja en barras y gris en donas)
- cuándo: Toda gráfica, badge o tile de una dimensión con semántica de estado, y el tratamiento de neutrales.
- spec: API:
- normalizeLabel: solo quita prefijos ordinales de 1–2 dígitos.
- resolveStatus(label, family, overrides?) devuelve {tone, icon, order, group, display} o null.
- colorForLabel(theme, label, ctx): primero familia, luego neutral, luego slot estable.
- isNeutral(label).

La familia SIEMPRE es explícita en el spec: widget.semantic o column.semantic. No se infiere del nombre del campo, porque 'evento' coincide con RADIAN y con notificación, y 'estado' con fallo y guía. Hay overrides y groups por spec. En desarrollo avisa de las etiquetas sin mapear.

Tokens CSS:
- --status-{tone}, -soft e -ink con los valores corregidos;
- useChartTheme expone theme.status.

Tests con valores reales de los perfiles:
- ('030. Acuse de recibo', radian) → info
- ('Acuse de recibo', notificacion) → good
- ('Sin Evento Radian', radian) → warning
- ('5. Abierto Vencido', semaforo) → critical
- ('Fuera de Término', cumplimiento) → serious
- ('Solicitud de reclasificaciòn', flujo) → info
- ('No Reporta sin Fecha Vencimiento', cumplimiento) → neutral

### displayLabel, formatos y alias de datos
- reemplaza: Etiquetas en MAYÚSCULAS, prefijos '1. Lunes', '[NIT] Nombre' repetido, % con 2 decimales, 'M' y 'mil M' mezclados en un eje, '−0,0 %' y variantes de escritura sin unificar
- cuándo: Toda etiqueta visible y todo número; los alias se aplican en el motor.
- spec: displayLabel(raw, {kind: 'oficina' | 'persona' | 'proveedor' | 'ente' | 'generic'}) devuelve {short, full, secondary?}:
- tipo título es-CO, con de/del/y/la/las/los/el/en/a en minúscula;
- lista blanca de siglas: PQRD, ARL, JRC, ML, IA, NIT, DIAN, RADIAN, SLA, PCL, AT, EL, EPS, IPS, SFC, CUFE, D.C., S.A., S.A.S., LTDA;
- '[ 938376353 ] UNIÓN…' → nombre + 'NIT 938376353' en mono;
- '7. Domingo' → 'Dom';
- abrevia oficinas solo en contextos compactos, con el nombre completo en title;
- devuelve la sigla del ente.

Formatos:
- pct con 1 decimal (0 en ejes);
- días: '5,4 días' en KPIs y '5 d' en ejes;
- formatUnit(values, 'cop'): una unidad por gráfica;
- formatDeltaPP.

Alias en normalizers.ts (limpieza de datos, igual que WEB/Web; se documentan en AGENTS §6):
- Estado_del_fallo: 'Informativos' → 'Informativo';
- estado_salida (ML entradas): 'Por recibir correspondencia' → 'Por recibir en correspondencia'.

Las variantes de canal ya se unifican con canal() (Mail - AI, Mail-IA, WEB/Web) en pqrd, tutelas, smart-3, ML entradas y entradas generales; '' → 'No reporta' con orNoReporta. Las diferencias de mayúsculas se resuelven solo al mostrar.

### RankingList
- reemplaza: Barras horizontales de Chart.js para categorías nominales (etiquetas recortadas por el límite del 50 % del eje, amontonadas y en MAYÚSCULAS) y la bartable de adquirientes (barra colapsada a 0 px)
- cuándo: Nominales con más de 7 categorías o etiquetas de más de 14 caracteres: proveedores, adquirientes, oficinas, causales, productos, tipos de solicitud y juzgado remitente.
- spec: Datos: CategoryResult o BarTableResult de una columna. Sin cambios en el servidor.

Fila de 40 px:
- línea 1: rango (11 px muted), etiqueta de 13 px/500 en tinta, identificador secundario opcional en mono de 11 px, valor de 13 px/600 tabular y % de 12 px;
- línea 2: pista de 6 px con el relleno = valor / máximo no neutral, en --chart-1 o en el tono de la familia.

Variantes:
- 2 líneas (56);
- compacta (32, barra inline);
- fijada (44, en el tono soft de la familia del valor que filtra su CTA —'Adquiriente no encontrado' → critical, como el tile '% Inconsistentes'—; warning-soft si no hay familia; `pinned.tone` lo fija explícitamente);
- bullet secundario: columna propia de 56×4 con marcador de referencia (p. ej. '% entregadas' frente al KPI global).

Cabecera de concentración: barra top1 · top2 · resto + 'N concentran X %'.

Neutrales: después de una hairline, sin rango, fuera del máximo; 'Otros' se muestra como 'Otras N categorías'. Si la capacidad oculta filas con nombre, se suman a 'Otras N' (miembros en el tooltip) y su 'Ver N más' va en línea en esa fila, nunca en un pie después del agregado.

Pie: 'Top 15 de 42 · 91 % del total'.

Columnas: 1, 2 o 3 según layoutSystem §6, con numeración continua y escala común. 'Ver N más' abre scroll interno (Dialog con búsqueda si hay más de 30). En varias columnas las filas se alinean al pie de su fila de la grilla (barras a la misma altura); si el identificador secundario partiría filas, se omite en la fila y queda en el tooltip, el aria-label y el diálogo.

Interacción: la fila es un botón que llama toggleValue; seleccionada en primary-soft con borde de 2 px; el resto baja a 0,45.

Accesibilidad: <ol>, aria-pressed y aria-label completo.

En 390 px la etiqueta ocupa todo el ancho y nunca se recorta.

### PeopleLeaderboard
- reemplaza: Barras horizontales de gestionadores, revisores y aprobadores (nombres recortados, 'No reporta' como #1 en naranja)
- cuándo: Rankings de personas.
- spec: Extiende RankingList.

Fila regular de 44 px:
- avatar de 28 px con iniciales en tono neutro; anillo --primary y medalla solo en el top 3;
- nombre de 13 px/600 y, debajo, 'x % del total';
- valor de 15 px/700 y barra de 4 px.

Variante compacta de 34 px (avatar 22, nombre y valor en una línea, barra de 3 px).

Cabecera: 'Top 10 de 37 · concentran 68 %' en el subtítulo, sin alto extra.

'No reporta' sale del ranking:
- callout warning-soft de 32 px 'Sin gestionador asignado: 308 · 40,6 %' si supera el 15 %;
- si no, fila de pie neutra con UserX.

1, 2 o 3 columnas según el ancho.

### CompositionBar (layouts legend y split)
- reemplaza: Las 20 donas, ProportionBar y SplitComparison por separado, y las barras o columnas de pocas categorías
- cuándo: Toda parte de un todo con hasta 7 entradas visibles. Layout split con 2–3 categorías reales; legend con 4–7. Toda dimensión 'canal' usa este componente, para que los hermanos coincidan.
- spec: legend:
- total de 12 px en la cabecera de la tarjeta o en la franja de leyenda;
- barra 100 % de 14 px con 2 px entre segmentos y radio 7 en los extremos;
- % dentro del segmento solo si mide 56 px o más (color inkOn);
- debajo, legend-table (muestra, etiqueta, valor y %) con columnas de ≥ 232 px; se usa la menor cantidad de columnas que cabe en el alto medido y las filas crecen hasta 34 px (40 con ≤ 3 filas);
- más de 5 partes se pliegan en 'Otras N', con sus miembros listados en el tooltip y en 'Ver datos'.

split:
- 2–3 columnas con muestra, etiqueta, cifra de 32 px y %, más una barra de 8 px que las une;
- neutrales como nota al pie; los % se calculan sobre las partes con dato (total · N con dato);
- anatomías: columnas (≥ 140 px por parte), apilada (celda < 480 px con alto: fila 1fr por parte con barra propia) y filas (legend-table);
- variante estado × subtipo (EMITIDA/INCONSISTENTE con barra FC/NC/ND y glosario).

Color: familia semántica o slots 1–5 estables.

Interacción:
- hover resalta y atenúa el resto a 0,4;
- tooltip;
- clic filtra.

Chip de calidad si el neutral está entre el 15 y el 85 %.

### StatusStrip / StatusBoard
- reemplaza: Donas de semáforo, SLA y tiempo por vencer; barras de resultado de notificación y estados de guía; dona RADIAN; barras de estados de flujo
- cuándo: StatusStrip: dimensiones con familia semántica y hasta 7 valores. StatusBoard: estados de flujo con más de 7 valores.
- spec: StatusStrip:
- barra 100 % de 12 px en el orden de la familia;
- tiles (≥ 112 px) en flex-wrap, agrupados (Abiertos | Cerrados); la última línea se estira (sin huecos);
- cada tile: borde superior de 3 px en el tono, ícono de 16 px en -ink y etiqueta de 12,5 px sin prefijo; cifra de 24 px/700 y % juntos arriba, y barra de participación de 4 px al pie; en critical-soft si el tono es critical y el valor es mayor que 0;
- los neutrales se fusionan en un solo tile y forman el grupo 'Sin clasificar' (cabecera muted y separador discontinuo, o su propia línea con el ancho de un tile), con el desglose en el tooltip;
- con order declarado, los estados sin casos se muestran en 0 atenuados (los hermanos se leen igual);
- variantes: vertical (span 4 o menos; puede actuar como legendFrom de la gráfica vecina) y lista compacta con cabecera fuera de escala (guías: 'Sin guía física: 818 · 93,9 %').

StatusBoard:
- barra de ciclo de vida;
- columnas Finalizado, En curso, Devuelto y Anulado, consecutivas en el orden de la barra, con subtotal y filas de 28 px (punto, etiqueta, valor y mini barra);
- dentro de un grupo, opacidad escalonada 100/72/48 solo con ≤ 3 estados;
- override de grupos por spec.

Clic en tile o fila: toggleValue.

Accesibilidad: role=list y aria-label 'Abierto vencido: 71 (7,3 %), crítico'.

### PipelineSteps
- reemplaza: Barras de estados operativos (PQRD, Entes) y la dona de etapa procesal (Tutelas)
- cuándo: Estados o etapas con orden de proceso.
- spec: Orden: spec.order o el de la familia.

Horizontal (interno de al menos n·150; alto 120):
- chevrons de 64 px con etiqueta de 12,5 px que reserva 2 líneas (cifras en la misma línea base), cifra de 20 px/700, % y barra fina que mide la participación (el mismo % impreso, no el valor relativo al máximo);
- la etapa pendiente con más casos es una alerta de cuello de botella: relleno warning-soft, trazo --warning de 2 px y chip 'Mayor acumulación' en warning-soft/warning-ink con AlertTriangle (el naranja Balú queda para marca e interacción);
- la etapa final va en good-soft.

Vertical: pasos de 40 px unidos por un conector.

Rama secundaria con su propio conector (reclasificación en Entes). Estados fuera de flujo como chips (Duplicado, Aprobación rechazada, Cerrado).

Texto fijo: 'Etapa actual de cada radicado' (no es un embudo).

Clic filtra.

### CategoryTiles / EntityTiles
- reemplaza: Columnas de tipo de trámite con cola ilegible, y columnas de entes con 7 barras casi en cero
- cuándo: CategoryTiles: taxonomía de trámites de Correspondencia E/S. EntityTiles: entes de control.
- spec: CategoryTiles 2×2:
- top 3 + 'Otros trámites', que lista la cola con sus valores;
- cada tile: cifra de 24–28 px, % y barra de participación en slot 1;
- enlace neutro 'Ver tablero ↗' en muted, sin color ni ícono de módulo;
- el clic principal del tile filtra.

EntityTiles:
- 5 por línea a 12 columnas; tile de 180×112 como mínimo;
- monograma con la sigla (SNS, MT, RJ, FGN, SFC, DP, CGR, PGN) en tono neutro;
- nombre, cifra de 24 px, % y barra de escala común;
- grupo final 'No identificados' (Otros y Sin clasificar) en neutral;
- clic filtra ente_control.

### FamilySplit
- reemplaza: La barra de 'Estados de etapas procesales' (título engañoso, 10 de 16 estados, 'No reporta' en naranja)
- cuándo: Tutelas 'fallos', rebautizado 'Estado del fallo'.
- spec: Cabecera split de familias:
- Favorable (good) · Desfavorable (critical) · Trámite o informativo (info: categoría real, así "Sin dato" es el único gris; badges y tooltips usan el mismo tono), cada una con cifra de 28 px y %;
- 'Sin dato' en nota.

Barra 100 % de 8 px.

Legend-table agrupada por familia, en 2 columnas y filas de 20 px, con los 15 estados (tras el alias Informativo) y su valor.

Clic en un estado filtra Estado_del_fallo.

El mapeo de familias es un override del spec, por validar con jurídica.

### DataQualityNotice
- reemplaza: Gráficas de dimensiones casi vacías (macro motivo 97,8 % 'No reporta'; semáforo SMART 1 con 99,8 % 'Sin cruce')
- cuándo: Cuando lo neutral es el 85 % o más del widget.
- spec: Tarjeta en tier S:
- ícono AlertTriangle en warning-ink;
- cifra grande del neutral ('97,8 % sin macro motivo · 978 de 1.000');
- una línea de explicación, tomada de widget.note;
- mini lista de las 3 categorías reales principales con su valor, más 'Ver las N';
- variante status: mini StatusStrip de los registros con dato ('2 cruzan con PQRD').

Conserva el menú 'Ver datos' y 'CSV' con todas las categorías.

Si el neutral baja del 85 %, el widget vuelve solo a su visualización normal.

### SplitRows
- reemplaza: Barras apiladas de Chart.js con etiquetas encimadas
- cuándo: Una dimensión cruzada con 2–3 estados (SMART 3: estado y canal por momento).
- spec: Filas de 36 px, o 32 en compacta, con el estilo de RankingList y una barra apilada de 8 px:
- 2 px entre segmentos;
- tonos de la familia;
- total a la derecha.

Segmented 'Cantidad | %' en el header: en % cada fila se normaliza al 100 %.

Etiqueta dentro del segmento solo si mide 56 px o más.

Leyenda: la SectionLegend.

Clic:
- en la etiqueta: filtra la dimensión;
- en un segmento: filtra stackBy.

Datos: CategoryResult.stacks.

### AreaTimeseries (TimeseriesChart v2)
- reemplaza: Series con picos exagerados, ceros de fin de semana como 'peine', clave de leyenda invisible y la fila '28 días · agrupado por día'
- cuándo: Toda serie de tiempo. Es P1 en Facturas recibidas y P2 en el resto.
- spec: Modos:
- area: línea de 2 px en chart-1 y área al 12 % (18 % en oscuro → 0);
- lines: 2–4 series con tokens de métrica;
- stacked: área apilada en tonos de la familia;
- columns: automático si más del 60 % de los días valen 0; columnas diarias o semanales con el periodo anterior como columnas fantasma.

Granularidad inicial:
- día si el rango es de 31 días o menos y menos del 40 % de los días son ceros;
- mes si supera 240 días;
- semana en los demás casos;
- Segmented en el header.

Plugin weekendBands en surface-2, más el ítem de leyenda 'Fin de semana'.

Tramo parcial punteado con el rótulo 'parcial'.

Interpolación monotone con tensión 0,2 o menos.

Ejes: X con 8 ticks como máximo; Y con 4.

Etiquetas directas según L10.

Crosshair + ChartTooltip con todas las series, el valor anterior y el Δ.

Pie: 'Total 974 · Promedio 34/día · Pico 64 (8 sept)'.

El nombre de la serie sale de spec.unit ('Radicados', 'Facturas', 'Salidas'), no de 'Registros'.

### ColumnBars + MonthlyBarsDelta + Histogram v2
- reemplaza: Días de la semana en barras horizontales, columnas de 'Estados de guía' con ejes encimados, la dona ordinal de copias y las mensuales con Δ que choca y 'ene 2026feb 2026'
- cuándo: ColumnBars: ordinales cortas (días, copias). MonthlyBarsDelta: los 4 mensuales de facturación. Histogram: tiempo-gestion y tiempo-definido.
- spec: ColumnBars:
- maxBarThickness 24, radio 4 solo arriba y categoryPercentage 0,72;
- orden natural;
- preset semana: Lun…Dom, máximo pleno y resto al 55 %, banda sáb–dom;
- preset copia: 'Ppal' y '1'–'8', con título de eje 'N.º de copia';
- valor arriba si hay 12 columnas o menos;
- eje X de 11 px sin rotación, con maxChars = ancho de columna / 6,5 (si no alcanza, autoSkip).

MonthlyBarsDelta:
- color por token de métrica, maxBarThickness 32;
- meses 'ene…sep' (el año va en el badge);
- omite los meses iniciales en 0;
- mes en curso al 55 % con 'parcial';
- valor arriba con una sola unidad;
- fila HTML de chips de Δ bajo el eje, alineada por x, con color según la polaridad declarada;
- '—' en el primer mes.

Histogram:
- columnas contiguas en chart-1 al 85 %;
- eje con la unidad y la nota 'intervalos de distinto ancho';
- referencia punteada 'Promedio 5,4 d' desde un KPI (widget.reference.kpi) o 'Mediana ≈';
- chip neutral 'Sin dato: 230' en la franja;
- sin filtro cruzado.

### Treemap (chartjs-chart-treemap, import dinámico)
- reemplaza: Barras largas de muchas categorías cortas que son partes de un todo
- cuándo: SMART 2 'motivos' (15 con dato) y ML Salidas 'procesos' (11). Nunca para etiquetas de más de 40 caracteres.
- spec: Un solo tono secuencial por valor.

Los neutrales NO entran al árbol: van como chip 'No reporta 293 · 29 %' en la franja.

Máximo 12 tiles + 'Otras N'.

Etiqueta dentro del tile (nombre corto + valor, inkOn) solo si mide 80×36 o más. Hueco de 2 px entre tiles.

ChartTooltip con el nombre completo, valor y %. Clic filtra.

Segmented 'Mapa de árbol | Lista': la lista es una RankingList en 2 columnas con el mismo resultado.

PNG vía canvas.

Nueva dependencia: chartjs-chart-treemap, registrada en register.ts.

### HeatmapMatrix (composite y compacta)
- reemplaza: Las gráficas 'dias' (horizontal) y 'horas' (vertical) de facturas-emitidas, y 'queja-momento' apilada de SMART 3
- cuándo: Facturas emitidas (día × hora) y SMART 3 (estado de la queja × momento).
- spec: Grilla CSS:
- celdas con 2 px de separación y radio 3;
- color con escala raíz;
- valor dentro de la celda si mide 28 px o más; las celdas en 0 muestran '·'.

Composite día × hora:
- widget nuevo 'dia-hora' (PivotWidget viz matrix: rows dia_semana con rowOrder DIAS_ORDER y stableRows; columns Solo_Hora en rango continuo min–max ± 1 h);
- marginal derecho = widget 'dias' (conteo y %);
- marginal superior = widget 'horas' (conteo por hora);
- celdas ≈ 33×39 a 12 L;
- banda de 7 a 17 h;
- ScaleLegend.

Compacta 3×2:
- celdas de 120×60 con conteo y % por fila;
- tono de la familia momento con la intensidad según el valor.

Clic:
- en una celda: filtra ambas dimensiones;
- en un marginal: filtra su dimensión.

Móvil: scroll horizontal con la primera columna fija.

### PhaseMatrix + BottleneckCallouts (composite)
- reemplaza: Las 4 barras 'Oficinas con más días por fase', cada una con su propia escala, y la tarjeta 'Sin datos' de 380 px
- cuándo: Entes · Eficiencia, P1.
- spec: Matriz (2/3 del ancho):
- filas: la unión de las 6 oficinas con más días en cada fase, en filas compactas de 32 y ordenadas por su peor rango; con más de 10, scroll con cabecera fija;
- 4 columnas en el orden original;
- celda: días en 13 px/600, con color secuencial normalizado por columna;
- badge de rango 1–6;
- la fase más lenta de cada fila lleva contorno --primary;
- badge 'Provisional' con nota;
- una columna vacía se colapsa a 88 px con '—' y 'Sin datos en el periodo'.

Panel (1/3): 4 callouts de 90 px con la oficina más lenta, sus días en 28 px y '× N la mediana'.

Los widgets fase-* se calculan sin topN (superconjunto). 'Ver datos' y 'CSV' se mantienen por fase.

### PivotHeatmap v2 / RolePivot
- reemplaza: Pivotes con bloques saturados, columnas cortadas o que aparecen y desaparecen, rampa invertida en oscuro y 'No reporta' tratado como persona
- cuándo: Entes · Eficiencia (4 roles), SMART 3 (SLA) y Correspondencia entradas (oficina × estado).
- spec: Celdas:
- píldoras con 2 px de separación y radio 4;
- valor en color inkOn; las celdas en 0 muestran '·';
- rampa raíz única en ambos temas;
- ScaleLegend con el mínimo y el máximo reales.

Encabezados:
- hasta 2 líneas (máximo 120 px), nunca truncados;
- punto e ícono del tono si la columna es un estado.

Columnas:
- estables: stableColumns mantiene 'Vencido' visible aunque esté en 0;
- ordenadas por severidad o ciclo de vida, con cabecera de grupo en su tono.

Totales:
- Total con mini barra de 40×4;
- grupos plegables con subtotal;
- primera columna y totales fijos, con sombra al desplazar.

Personas con avatar de iniciales; 'Sin responsable asignado' en cursiva al final.

RolePivot:
- título fijo 'Carga por responsable';
- Segmented de rol visible en todos los anchos;
- StatusStrip resumen del rol activo.

### EfficiencyMatrix (EfficiencyTable v2)
- reemplaza: Tabla que desborda, empates '1,1,1,1' confusos, micro barras ilegibles y 'Necesario validación manual' repetido
- cuándo: PQRD 'eficiencia'.
- spec: Sin scroll horizontal a partir de 1036 px internos.

Rango: empates como '=1'; medalla solo si el top 3 es único. Gerencia vía displayLabel.

Celda por fase:
- punto del tono;
- 3 mini columnas de 10×28 coloreadas por cuartil (Q1 good-soft, Q2 surface-3, Q3 warning-soft, Q4 critical-soft); la semana actual sólida;
- valor actual en 13 px;
- el mensaje en tooltip.

Una sola leyenda Q1–Q4. La columna Revisión se colapsa en una nota cuando el 100 % es 'validación manual'.

Móvil: una tarjeta por gerencia, con las fases en 2×2.

### DrilldownBars v2 + Sankey v2
- reemplaza: Drill con la ruta completa como título y nombres truncados; sankey de 4 columnas con etiquetas encimadas
- cuándo: SMART 3 'drill' y 'sankey'.
- spec: Drilldown:
- título 'Exploración por oficina';
- stepper de chips ('Nivel 2 de 5 · Tipo de solicitud') y botón 'Subir';
- cuerpo SplitRows compacto (filas de 30; 36 + 11 filas = 366 caben en L);
- chevron en las filas con hijos;
- transición de 200 ms;
- se conserva noCrossFilter.

Sankey:
- tipologías por debajo del 2 % plegadas en 'Otras tipologías (N)', con el detalle en el tooltip;
- nodePadding = clamp(10, 28 − n, 18) y nodeWidth 10;
- etiquetas externas con el valor, en tinta;
- destino con la familia momento;
- enlaces al 35 % (70 % en hover);
- mínimo 5 columnas en tier L.

### ResolutionTable (BarTable v2)
- reemplaza: La bartable de resoluciones que recorta 'Valor neto' y muestra fechas ISO; además corrige el desborde de toda BarTable
- cuándo: Facturas emitidas 'resoluciones'.
- spec: table-layout fixed.

Columnas:
- Resolución (mono);
- Documento (chip FC/NC/ND);
- Estado (badge de la familia factura);
- Vigencia: '9 oct 2025 → 9 oct 2027' + línea de tiempo de 80×4 con marcador 'hoy';
- Rango: '50.001 – 100.000';
- Valor neto: barra de 80 px o más + cifra de 96 px, en columna fija a la derecha (nunca se recorta).

Las filas de relleno se agrupan al final bajo 'Sin resolución válida', con la nota visible. Pie con el total.

### HeroMap (MapCanvas, MapInsightPanel, MapLegend y SanAndresInset)
- reemplaza: ChoroplethMap (media fila, Colombia en ≈ 33 % del lienzo, leyenda sobre el logo, chips débiles, base clara en oscuro, clic con retardo de 240 ms)
- cuándo: Los 10 tableros con mapa, siempre como P1 en S1 o S2, a 12 columnas y tier XL.
- spec: Ver mapRedesign.

Archivos:
- widgets/map/hero-map.tsx, map-canvas.tsx, map-panel.tsx, map-legend.tsx, san-andres-inset.tsx y classify.ts;
- lib/geo/bounds.ts.

Props: MapWidget + layout 'hero' y MapResult (sin cambios).

Se conservan:
- el drill a municipios;
- el filtro __dpto/__mpio;
- el desglose widget.breakdown;
- la exportación PNG, ahora compuesta.

### DashboardHeader + DataNotesPopover + FilterBar priority+ + DetailTable v2
- reemplaza: Título de 2 líneas que repite el módulo, rango de fechas duplicado, banner azul de notas, 'Más filtros' cortado ('M', 'Más fil'), encabezado de tabla colapsado a 1024, columnas cortadas y badges grises
- cuándo: Encabezado, barra de filtros y tabla de los 13 tableros.
- spec: Header:
- tile de 56 px con el degradado del módulo (ViewTransition);
- eyebrow del módulo en --mod-ink;
- H1 corto de 30 px en 1 línea ('Eficiencia operativa', 'Entradas generales');
- descripción de 1 línea;
- a la derecha: 'N radicados en el periodo' (spec.unit), badge 'N vistas' y badge 'N notas de datos' que abre un popover con spec.notes;
- el rango de fechas solo aparece en la FilterBar.

FilterBar:
- [Rango] | primarios que caben (se miden con ResizeObserver mediante useSyncExternalStore) … [Más filtros (n), fijo fuera del scroller] [Limpiar];
- los que no caben pasan al cajón;
- rótulos cortos ('Ente', 'Tipo', 'Canal');
- móvil: botones 'Filtros' y 'Secciones', máscara de desvanecido y la barra se oculta al bajar.

DetailTable:
- encabezado con container query: la toolbar pasa debajo del título por debajo de 1100 px;
- primera columna fija y fundido cuando hay scroll;
- badges por familia;
- displayLabel en las celdas;
- el formato long pasa a ícono con popover;
- columnas vacías en la página: 'sin datos' y ancho mínimo.

### VizSkeleton + EmptyState compacto
- reemplaza: El skeleton genérico en bloque y el estado vacío de 380 px sin acción
- cuándo: Primera carga y resultados vacíos.
- spec: Skeleton por arquetipo, con el alto exacto de su tier:
- ranking: filas de ancho decreciente;
- serie: ola;
- strip: tiles;
- mapa: silueta de Colombia;
- KPI: bloques.

EmptyState dentro de la tarjeta:
- ícono de 32 px, título de 13 px y 'N filtros activos';
- botón 'Quitar filtros' (clearAll);
- widget.note si el vacío es por diseño.

### ModuleTokens (globals.css + config/dashboards.ts)
- reemplaza: El degradado #f39a33→#c05800 idéntico en las 13 tarjetas y los íconos duplicados de Facturación y Correspondencia
- cuándo: Home, sidebar, paleta, login y encabezado del tablero.
- spec: Tokens --mod-{fact|pqrd|smart|tut|med|corr}, cada uno con solid, -2, -ink y -soft, en claro y oscuro (valores validados en colorSystem B).

[data-module] define --mod*. Nuevos tokens: --shadow-mod, --content-max 1600px, --topbar-h 64px y --sticky-h.

Config:
- ModuleMeta gana tone y summary;
- DashboardMeta gana summary (≤ 60 caracteres), healthKpi y features[];
- las tags quedan solo para búsqueda.

Íconos: correspondencia-entradas = Mailbox; correspondencia-salidas = MailCheck.

headlineKpi de entes-control-eficiencia → 'asignacion'.

### Home (HomeHero, PulseSummary, QuickAccessRail, ModuleNav, ModuleSection, DashboardCard, MicroColumns y ColombiaDots)
- reemplaza: El hero de 390 px, los chips de módulo cortados, la grilla plana de 13 tarjetas iguales con una huérfana y las sparklines naranjas en diente de sierra
- cuándo: / (catálogo).
- spec: Ver homeRedesign.

### Shell (Sidebar v2, Topbar v2, ThemeSwitch, CommandPalette v2 y LoginScreen v2)
- reemplaza: Tagline partido, 3 buscadores visibles, grupos que no caben en 900 px, topbar redundante, toggle de tema ambiguo, paleta plana con ARIA incorrecto y login con cifras inventadas
- cuándo: Toda la aplicación.
- spec: Ver shellRedesign.

### Contrato de datos (motor y API)
- reemplaza: Filtro cruzado que colapsa el widget de origen, 'No reporta' como #1, topN que no cuadra con el total y catálogo sin salud
- cuándo: engine/run.ts, aggregate.ts, filter.ts, dto.ts, normalizers.ts y api/catalogo.
- spec: 1) skipField pasa a ser skipFields: string[]. Los widgets de categoría y de mapa se calculan sin su propia dimensión (o sin __dpto/__mpio), solo cuando esa dimensión tiene un filtro activo.

2) orderLabels deja los neutrales al final, salvo con orden natural.

3) CategoryResult.rest = {count, value} cuando hay topN sin others y la medida es aditiva.

4) PivotWidget gana rowOrder, stableRows y stableColumns.

5) La serie por defecto se nombra con spec.unit.

6) Widget nuevo dia-hora (facturas-emitidas).

7) Superconjuntos declarados:
- fase-* sin topN;
- ML entradas 'estados' sin topN (15 categorías);
- ML salidas 'copia' como barra ordinal con las 9 categorías (hoy la dona pliega Copia 5–8 en 'Otros');
- tutelas 'fallos' sin topN (15).

8) Alias en normalizers.

9) /api/catalogo devuelve {range (con prevFrom/prevTo), updatedAt, items [{slug, hero, health}]}, calculados en una sola llamada al provider.

10) resultToTable no cambia.

11) Documentar el SQL equivalente en postgres/README.
## mapRedesign
1) UBICACIÓN Y JERARQUÍA
- En los 10 tableros con mapa, el mapa es la P1: sección propia 'Territorio', 12 columnas, tier XL (640 px en escritorio), variante hero. Nunca comparte fila.
- Va en S1 en SMART 1, SMART 2, ML Salidas, Correspondencia Entradas y Correspondencia Salidas.
- Va en S2, después de una franja de cumplimiento de 560–760 px, en PQRD, Entes, SMART 3, Tutelas y ML Entradas.
- SMART 3 sube de la 5.ª a la 2.ª sección, con banner de cobertura.
- Queda en el primer o segundo pantallazo de 1440×900.

2) COMPOSICIÓN (@container/map)
- Con 800 px internos o más: grid-template-columns: minmax(0, 600px) minmax(380px, 1fr), gap 20.
  - A 1440 (interno 1036): lienzo 600 × 544 y panel 416.
  - A 1024 con riel: lienzo ≈ 470 y panel 380.
  - Por encima de 1600: lienzo fijo de 600 y panel en 2 columnas.
- Con menos de 800 px: lienzo de ancho completo (máximo 560, centrado), alto 480 en tablet o 420 en móvil a sangre; panel debajo (2 columnas en tablet); detalle en bottom sheet y municipios con botón.
- 'Ampliar': Dialog de 95vw × 90vh con el panel.

3) CÁMARA Y METAS DE ENCUADRE
- MAINLAND = [-79.1, -4.3, -66.8, 12.5]. En Mercator, ancho/alto ≈ 0,73.
- fitBounds con padding {top 20, right 16, bottom 12, left 16}.
- maxBounds [-85, -8, -61, 16].
- minZoom = cameraForBounds(MAINLAND).zoom − 0,25; maxZoom 10,5.
- renderWorldCopies: false; dragRotate y pitch desactivados; cooperativeGestures se mantiene.
- En resize se re-encuadra sin animación mientras el usuario no haya movido el mapa. Botón 'Restablecer vista'.
- Cálculo a 1440: el alto útil es 512 px, así que Colombia mide 372 × 512 = 62 % del ancho y 94 % del alto. A 1024 con riel: ≈ 79 % × 94 %.
- Metas de QA (corrigen la meta anterior, que era inalcanzable):
  - lado a lado: ≥ 60 % del ancho y ≥ 90 % del alto;
  - apilado: ≥ 85 % del alto.
  - Se miden con map.project(MAINLAND).

4) MAPA BASE POR TEMA
- Claro: el estilo del cliente (NEXT_PUBLIC_MAPBOX_STYLE).
- Oscuro: NEXT_PUBLIC_MAPBOX_STYLE_DARK, un gemelo en Studio (tierra #1A1F27, agua #10141A, etiquetas atenuadas). Respaldo: mapbox/dark-v11.
- Al cambiar de tema: setStyle y addLayers() idempotente en 'style.load', re-aplicando el feature-state.
- Etiquetas de lugares y países filtradas a iso_3166_1 == 'CO' (try/catch por capa). Sin POI ni vías.

5) CAPAS
Se insertan antes de la primera capa symbol del estilo, así las etiquetas quedan encima con halo. En orden:
1. mask-fill: mundo menos Colombia, en color de superficie al 82 % (claro) o 86 % (oscuro).
2. co-glow: línea --primary al 22 %, 8 px, blur 6.
3. dptos-fill y mpios-fill.
4. dptos-line: superficie, 0,8 px. Hover en tinta a 2 px; seleccionado en --primary-strong a 2,5 px.
5. co-outline: text-2 al 60 %.
6. value-labels: top 5 con nombre y valor en 12 px/700, halo de 1,5 px y symbol-sort-key = −valor. Bogotá se ancla en [-74.08, 4.65] (casco urbano).

6) COLOR
- 5 clases por cuantiles sobre los valores mayores que 0 (con 5 valores distintos o menos, una clase por valor), con seq-2…6 del tema.
- Valor 0: surface-3 con la muestra 'Sin registros'.
- En el nivel de municipios, los demás departamentos bajan al 25 %.
- El filtro cruzado resalta: se usan skipFields __dpto y __mpio.

7) PANEL DE INSIGHTS
Scroll interno, con alto máximo igual al del lienzo. De arriba abajo:
- (a) Título de la métrica con la geografía explícita ('Radicados por departamento del remitente', 'Territorio de la tutela', 'Destinatario') y migas 'Colombia › Antioquia'.
- (b) Resumen en 3 cifras:
  - con registros: 'N de 33 departamentos';
  - concentración del top 1;
  - ubicación válida con medidor: bueno ≥ 95 %, advertencia 80–95 %, crítico < 80 %.
  - Si más del 20 % no tiene ubicación, banner warning: 'El mapa representa el 26 % de las quejas (290 sin ubicación)'.
- (c) RankingList compacta con el top 10:
  - barras del color de su clase (une lista y mapa);
  - hover sincronizado en ambos sentidos;
  - clic selecciona y hace flyTo;
  - chevron 'Ver municipios';
  - 'Ver los 33'.
- (d) Detalle fijo al pie:
  - nombre, valor en 28 px, %, '#2 de 28';
  - CompositionBar del widget.breakdown (top 4 + resto);
  - acciones 'Filtrar tablero' (alterna __dpto/__mpio), 'Ver municipios' y 'Quitar selección'.
- (e) MapLegend (ScaleLegend escalonada) con 'Sin registros' y widget.note.
- Contexto adicional:
  - Correspondencia Salidas: 'Municipios cubiertos';
  - ML Salidas: nota 'destinatario, no remitente'.

8) RECUADRO DE SAN ANDRÉS
76×64 px abajo a la izquierda, con el polígono 88 en el color de su clase, rótulo y valor. Clic selecciona el código 88.

9) INTERACCIÓN
- Clic selecciona de inmediato (se elimina el temporizador de 240 ms).
- Doble clic: municipios, solo en escritorio.
- Esc limpia la selección.
- aria-live: 'Seleccionado: Antioquia, 73 radicados (8,4 %)'.
- El ranking es la ruta por teclado.
- Duración 0 con reduced-motion.

10) CONTROLES
- Zoom y 'Restablecer' arriba a la derecha.
- Logo y atribución compacta abajo a la derecha. Nada encima.

11) DATOS NUEVOS
scripts/geo/build-geo.mjs, con mapshaper:
- colombia-outline.json;
- mask.json;
- punto de etiqueta 'l' por departamento en divipola.json;
- src/lib/geo/bounds.ts.
Todo lo demás sale de MapResult, sin consultas nuevas.

12) EXPORTACIÓN Y ESTADOS
- PNG compuesto: título, lienzo, leyenda y top 5. preserveDrawingBuffer solo durante la exportación.
- Skeleton con la silueta de Colombia.
- Error con reintento.
- Sin token: el EmptyState actual.

## homeRedesign
CONCEPTO: 'Centro de mando documental'. El catálogo se organiza por módulos, cada uno con su color de identidad validado. Incluye un resumen ejecutivo y tarjetas que muestran la salud del indicador. Deja de ser una grilla plana de 13 tarjetas naranjas.

1) ESTRUCTURA (1440×900, contenido de 1076 px)
- Topbar de 64 px.
- HomeHero compacto (≈ 290 px), grid 7/5 con @container:
  - Izquierda:
    - fecha y periodo;
    - saludo de 32 px según la hora de Bogotá (nowBogotaHour), sin la frase naranja genérica;
    - una línea de contexto;
    - buscador de 44 px que filtra en sitio (atajo '/', Esc limpia, Enter abre el primero);
    - QuickAccessRail.
  - Derecha: PulseSummary.
  - Fondo: degradado de --bg-accent a --bg con ColombiaDots.
- ModuleNav sticky: 52 px, top 64.
- Seis ModuleSection en el orden de MODULES, separadas 40 px.
- Pie de convenciones.
- Sobre el pliegue se ven el pulso y dos módulos completos (5 tarjetas). Hoy se ven 3 tarjetas sin contexto.

2) COLOR CON SIGNIFICADO
Cada sección y cada tarjeta lleva data-module, con los tokens validados:
- Facturación: cobalto.
- PQRD y Entes: turquesa (ya no naranja, así que el chip activo y el foco naranjas vuelven a ser inequívocos).
- SMART: violeta.
- Tutelas: frambuesa.
- Medicina Laboral: cerúleo.
- Correspondencia: púrpura.

Uso del color de módulo:
- tile del ícono con degradado solid → solid-2;
- cabecera de sección en soft e ink;
- micro-columnas en --mod al 30 %, último día al 100 % y fines de semana en gris. Es la excepción documentada al 'solo chrome'.
- hover: barra superior de 3 px, borde al 35 % y --shadow-mod.

Verde y rojo solo en deltas con polaridad. El naranja solo para interacción.

3) DISTRIBUCIÓN SIN HUÉRFANAS (@container)
Grid de 12 con 840 px de contenedor o más, gap 16:
| Tableros en el módulo | Distribución | Módulos |
|---|---|---|
| 3 | 4/4/4 | PQRD y Entes, SMART |
| 2 | 6/6 | Facturación, Medicina, Correspondencia |
| 1 | tarjeta ancha de 12 | Tutelas |

- Entre 560 y 839 px: 2 columnas; la 3.ª tarjeta pasa a ancha.
- Menos de 560 px: DashboardRow de 72 px. El scroll móvil baja de ≈ 3.500 a ≈ 1.300 px.

4) DASHBOARDCARD (≈ 196 px)
- Fila 1:
  - tile de 40 px (ViewTransition dash-icon);
  - título corto del sidebar en 1 línea (dash-title);
  - summary de 60 caracteres o menos. Reemplaza la descripción cortada y el eyebrow que repetía el módulo.
- Fila 2:
  - etiqueta y cifra de 28 px con CountUp;
  - DeltaChip con polaridad;
  - MicroColumns de 132×40, con null como hueco.
- Fila 3, tras una hairline:
  - salud, p. ej. 'SLA 67,2 %' con su chip en p.p.;
  - íconos de capacidades con tooltip, en lugar de 'Mapa' repetido en 10 tarjetas.
- Estrella de favorito fuera del Link, con aria-live.
- Hover: translateY −2, título en --mod-ink y flecha junto al título.
- Variante ancha (Tutelas): micro-columnas de 112 px con ticks, promedio punteado y máximo anotado.
- Estados: skeleton; '—' con tooltip; si el catálogo falla, banner critical-soft con 'Reintentar'.

5) PULSESUMMARY ('Pulso del mes')
- Las 3 señales de salud con tono bad y mayor |Δ|, calculadas con deltaTone. Se excluyen la polaridad neutral y las bases pequeñas.
- Cada una es una fila-enlace de 44 px: punto del módulo, título corto + KPI, valor y chip critical.
- Barra 'mejoraron / empeoraron / estables' con los valores y 'vs. 4 – 31 ago' tomado de range.prevFrom/prevTo.
- Estado vacío en tono good.
- En móvil es colapsable.

6) MODULENAV Y QUICKACCESSRAIL
- ModuleNav:
  - chips de 34 px con punto del módulo, nombre corto y conteo;
  - scroll-spy y anclas (#pqrd);
  - con búsqueda, los conteos reflejan los resultados y los módulos en 0 bajan al 40 %;
  - máscara en los bordes cuando hay overflow.
- QuickAccessRail: un solo carril de hasta 6 chips (favoritos con estrella, luego recientes) con título corto sin truncar.

7) CONTRATO
/api/catalogo devuelve:
- range, con prevFrom/prevTo;
- updatedAt;
- items [{slug, hero, health}], en la misma llamada al provider.

En el cliente, staleTime de 5 min, reutilizado en la paleta.

Mapeo de salud (solo KPIs existentes):
| Tablero | healthKpi |
|---|---|
| pqrd | sla |
| entes-control | aprobados |
| entes-control-eficiencia | reabiertos (hero pasa a asignacion; ya no repite el 244 de Entes) |
| smart-momento-1 | cruce |
| smart-momento-2 | transmitido |
| smart-momento-3 | vencidos |
| tutelas | en-termino |
| medicina-laboral-entradas | vencidos |
| medicina-laboral-salidas | entregadas |
| correspondencia-entradas | pendientes |
| correspondencia-salidas | digital |
| facturas-emitidas | inconsistentes |
| facturas-recibidas | valor (neutral, no entra al pulso) |

8) ACCESIBILIDAD Y MOVIMIENTO
- Cabeceras en muted (AA).
- Foco visible.
- Atajos '/', ⌘K o Ctrl K según la plataforma, flechas y Esc.
- Secciones con aria-labelledby.
- Entrada escalonada con whileInView (tope de 240 ms) y reduced-motion.

9) FASE 2 (OPCIONAL)
Vista 'Tabla' ejecutiva ordenable.

## shellRedesign
1) SIDEBAR (284 px; riel de 76 px)
- Riel automático entre 1024 y 1279 px de viewport, salvo preferencia (docum:sidebar-pref).
- Lockup de 64 px alineado con la línea del topbar: logo Positiva de 28 px | divisor | 'Docum BI' 12 px/700. Se quitan el tagline de 2 líneas y el buscador duplicado.
- 'Inicio' como primer ítem.
- Grupos:
  - cabecera de 28 px con punto de 6 px en --mod, nombre corto en muted (AA) y conteo;
  - chevron en hover o si el grupo está cerrado;
  - guía vertical de 1 px.
- Ítems de 34 px.
- Activo: fondo primary-soft-2, texto en --primary-text #A84D00 (4,9:1) e indicador izquierdo de 3×18 px con layoutId.
- El grupo de la ruta activa se abre solo; los cerrados se guardan en docum:nav-closed.
- Pie: 'Salir' (ghost; hover critical-soft) y 'Contraer'.
- Presupuesto vertical ≈ 824 px: cabe en 900.
- Riel: ítems de 44 px, separador por módulo con su punto y tooltip 'Momento 3 · Gestión y cierre — SMART'.

2) TOPBAR (64 px, sticky, con blur)
- Izquierda:
  - Home: 'Inicio'.
  - Tablero: punto del módulo + módulo / título corto.
  - Cuando el H1 sale de pantalla (TopbarContext): crossfade a tile de 28 px + título + chip del periodo, y aparece SectionNav.
- Derecha:
  - barra de comandos: 280 px en xl, o solo ícono cuando SectionNav está visible; kbd '⌘K' o 'Ctrl K' según la plataforma, en font-sans;
  - 'Actualizado hace N min' (dataUpdatedAt), oculto por debajo de 1100 px;
  - badge 'Datos de prueba' (FlaskConical, warning): único lugar global;
  - modo presentación;
  - ThemeSwitch.
- Móvil: menú + isotipo + 'Docum BI' + buscar + tema.

3) THEMESWITCH
- radiogroup Sol/Luna con thumb deslizante y flechas del teclado.
- Siempre en el topbar; deja de cambiar de lugar.
- Muestra la opción, no el estado.

4) COMMANDPALETTE v2
- Sin consulta: grupos Recientes (4), módulos (con punto de color) y Acciones (Inicio, Cambiar tema, Modo presentación, Cerrar sesión).
- Con consulta: relevancia (empieza con > contiene) y <mark> en las coincidencias.
- Opción de 48 px: tile (soft si está inactiva; degradado si está activa), título + módulo, cifra y delta desde la caché ['catalogo'].
- Accesibilidad: combobox con aria-activedescendant; li role=option sin button anidado.
- Pie: '↑↓ Navegar · ↵ Abrir · Esc Cerrar'.
- Se reinicia al abrir.

5) ENCABEZADO DEL TABLERO
- Tile de 56 px con el degradado del módulo, que mantiene la continuidad con la tarjeta del Home.
- H1 corto en 1 línea.
- Descripción de 1 línea.
- Metadatos: 'N radicados en el periodo · 2 vistas · 1 nota de datos'. DataNotesPopover reemplaza el banner azul.
- El rango de fechas aparece solo en la FilterBar.

6) PIE GLOBAL DE CONVENCIONES
'Variación vs. periodo anterior de igual duración · p.p. = puntos porcentuales · verde y rojo según si subir es bueno · Fuente: vistas SGDEA (datos de prueba)'.

7) LOGIN v2
- Escritorio, grid 1.1fr/1fr:
  - panel naranja con ColombiaDots en blanco al 12 %;
  - mosaico 2×3 de módulos: círculo blanco con el ícono en su ink, nombre y 'n tableros', sin cifras inventadas;
  - tarjeta con el lockup 'Docum BI' (el logo aparece una sola vez), aviso de Bloq Mayús, error con role=alert y ayuda para obtener el token (copy por validar).
- Móvil: banda de 168 px con la tarjeta superpuesta (-mt-10).
- Los módulos se toman de MODULES.
- Recapturar sin cookie para la QA.

8) HIGIENE DE DEMO
- next.config.ts con devIndicators: false. El 'N' que tapaba 'Salir' es el indicador de desarrollo de Next, no un bug del footer.
- Íconos Mailbox y MailCheck.
- --content-max único.

## kpiRedesign
OBJETIVO
Una banda por tablero con UN héroe y grupos con sentido, sin huecos, cifras alineadas y la comparación explicada una sola vez.

1) CABECERA DE LA BANDA
'Indicadores del 1 – 28 sept 2026 · comparado con 4 – 31 ago 2026'. Se toma de range y de range.prevFrom/prevTo de la API (previousRange: periodo inmediatamente anterior de igual duración). Es el mismo rango que usan los tooltips de DeltaChip y el Home. El ícono (?) explica p.p. y colores. Se elimina 'vs. periodo anterior' de cada tarjeta.

2) ALTOS Y ANATOMÍA (escritorio)
- Fila principal de 184 px:
  - KpiHero: 40 padding + 20 etiqueta + 6 + 44 cifra + 8 + 22 delta + 12 + micro-tendencia flex (mín. 32).
  - Celda de grupo: 26 eyebrow + 76 métrica (16 etiqueta + 4 + 30 cifra + 6 + 20 chip) + 32 micro opcional + 40 padding = 174.
  - Grupo proportion: 26 + 76 + 10 + 8 de barra (+16 de secundaria) ≤ 176.
- Fila secundaria compacta de 112 px: etiqueta de 16 + cifra de 22–24 px con el chip inline.
- Fallback cuando el contenedor queda entre 840 y 1075 px: un grupo que no cabe pasa a 2 filas (2×2, sin micro-tendencias) y la banda sube a 232. El héroe estira su micro-tendencia.
- Tablet: héroe 6 + grupo 6 (2×2, 232).
- Móvil: héroe a ancho completo y grupos en 2 columnas por contenido. 8 KPIs pasan de ≈ 900 a ≈ 520 px.

3) CAPACIDAD (sin lista vertical en escritorio)
- Ancho mínimo por métrica: 112 px para pct, días o int de 6 caracteres o menos; 150 px para COP.
- Métricas por span, al ancho de diseño:
| Span | Métricas |
|---|---|
| 3 | 1 (usar KpiTile) |
| 4 | 2 |
| 5 | 3 |
| 6 | 4 cortas |
| 7–9 | 4 (máximo por grupo) |
- validateLayout verifica la suma de anchos mínimos + divisores + chevrons (12 px en stepper).

4) KpiDef.short OBLIGATORIO en toda celda de grupo, en 1 línea y con 16 caracteres o menos:
| Tablero | Etiquetas cortas |
|---|---|
| Facturas recibidas | 'Valor total', 'Valor promedio', 'Proveedores' |
| Facturas emitidas | 'Valor neto', 'Adquirientes' |
| PQRD | 'Asignación', 'Gestión', 'Aprobación', 'Ciclo total' |
| Entes y Eficiencia | 'Radicados', '% Quejas', 'Asignación', '% Fuera horario', '% Reabiertos' |
| SMART 1 | '% Con tutela', '% Cruce PQRD', 'Departamentos' |
| SMART 2 | '% Transmitido', '% Con anexos', '% P. jurídica' |
| SMART 3 | 'Cierre', 'Gestión', 'Por vencer', 'Vencidos', 'Casos alerta' |
| Tutelas | 'En término', 'Fuera de término', 'En trámite' |
| ML Entradas | 'Aprobados', '% Vencidos', 'Días en gestión' |
| ML Salidas | 'Entregadas', 'Abiertas', 'Fallidas', '% Digital', 'Guías pendientes', 'Días aprobación', '% En SLA' |
| Corr. Entradas | 'Aprobados', '% Aprobados', 'Pendientes' |
| Corr. Salidas | '% Aprobado', '% Enviado', 'Devoluciones', '% Digital', '% SealMail', '% Con correo', 'Radicados únicos', 'Municipios', 'Folios' |
El KpiHero y los KpiTile usan la etiqueta larga (cabe en 214 px).

5) REGLAS
- Exactamente un KpiHero de 44 px, con clamp(32px, 20cqi, 44px).
- Grupos por tema, con 4 métricas como máximo.
- KpiTile solo cuando el KPI merece medidor o acción.
- Máximo 2 filas; cada fila suma 12.
- Deltas:
  - pct en p.p.;
  - '0,0' cuando la variación es despreciable;
  - 'Base pequeña' si el valor anterior es menor que 20 en conteos;
  - 'Sin base' cuando no hay valor anterior.
- Micro-tendencias en de-énfasis con el último tramo en --primary; null como hueco.
- % con 1 decimal; días como '5,4 días'.
- Badge 'Provisional' visible, con la fórmula en el tooltip.
- Todas las cifras comparten línea base.

6) BANDAS POR TABLERO (verificadas con la capacidad)
- facturas-recibidas, 4-8: [héroe facturas] [grupo 'Valor y proveedores': valor · ticket · proveedores (150 + 150 + 112 ≤ 671)].
- facturas-emitidas, 4-4-4: [héroe facturas] [grupo valor · adquirientes (150 + 112 ≤ 305)] [tile status inconsistentes: medidor de tasa, p.p. up-bad, CTA 'Ver inconsistentes'].
- pqrd, 3-3-6: [héroe radicados] [tile gauge sla con el marcador del periodo anterior] [stepper 'Días promedio por fase': Asignación → Gestión → Aprobación | Ciclo total (4 × 112 + 36 = 484 ≤ 488); fallback 2×2].
- entes-control, 3-3-6: [héroe radicados] [gauge aprobados] [alerts 'Señales de alerta': % Quejas · Asignación · % Fuera horario · % Reabiertos].
- entes-control-eficiencia, 3-3-6: [héroe asignación] [gauge aprobados] [grupo 'Contexto': Radicados · % Quejas · % Fuera horario · % Reabiertos]. Mismo esqueleto que Entes, con el héroe propio; reemplaza el '2-2-2-2-2-2' sin héroe.
- smart-momento-1, 4-8: [héroe radicados] [% Con tutela · % Cruce PQRD con medidor de cobertura · Departamentos].
- smart-momento-2, 4-8: [héroe total] [% Transmitido con medidor 0–100 · % Con anexos · % P. jurídica].
- smart-momento-3, 3-4-5: [héroe total] [grupo 'Avance': Cierre · Gestión + embed del widget momento como barra Gestión info / Cierre good (160 ≤ 184)] [alerts 'Riesgo': Por vencer serious · Vencidos critical · Casos alerta critical (3 × 112 ≤ 397)]. Reemplaza el 4-3-5 que desbordaba.
- tutelas, 3-6-3: [héroe tutelas] [proportion 'Cumplimiento de términos': En término good · Fuera de término serious · En trámite info (% y '398 tutelas' secundaria; 176 ≤ 184)] [tile desacato provisional].
- medicina-laboral-entradas, 4-8: [héroe radicados] [Aprobados (Provisional) · % Vencidos · Días en gestión].
- medicina-laboral-salidas:
  - fila 1, 4-8: [héroe total] [proportion 'Resultado de notificación · % de notificables': Entregadas · Abiertas · Fallidas];
  - fila 2, 6-6 de 112: [grupo 'Envío': % Digital · Guías pendientes] [grupo 'Aprobación': Días aprobación · % En SLA].
- correspondencia-entradas, 4-8: [héroe radicados] [grupo 'Aprobación y pendientes': Aprobados · % Aprobados con medidor · Pendientes con acento warning y enlace 'Ver estados' → #gestion].
- correspondencia-salidas:
  - fila 1, 4-8: [héroe total] [grupo 'Estado': % Aprobado · % Enviado · Devoluciones (Provisional; rojo solo con base ≥ 20)];
  - fila 2, 6-6 de 112: [grupo 'Canal': % Digital · % SealMail · % Con correo] [grupo 'Cobertura': Radicados únicos · Municipios · Folios].
  - Reemplaza el 3-3-3-3 a 200 px que desbordaba. Los hermanos E/S comparten la primera fila 4-8; la segunda existe solo porque Salidas tiene 10 KPIs.
## dashboards

### facturas-recibidas
- hero: P1: serie (AreaTimeseries) en 8-4 L, junto al ritmo semanal que explica sus picos. KpiHero: facturas.
- layout: KPIs 4-8 (ver kpiRedesign).

S1 VOLUMEN — ¿Cómo llega el volumen del periodo?
Fila 8-4 L, con franja de leyenda:
- serie → AreaTimeseries, P1: serie 'Facturas' con periodo anterior, fines de semana, parcial punteado y Día/Semana/Mes en el header.
- dias → ColumnBars preset semana: Lun…Dom, máximo pleno, banda sáb–dom; clic filtra dia_semana.

S2 AÑO EN CURSO — ¿Cómo va el año en cantidad y valor?
Fila 6-6 M:
- mensual-cantidad → MonthlyBarsDelta, chart-1.
- mensual-valor → MonthlyBarsDelta, chart-2 COP (antes colorSlot 2), con una sola unidad.

S3 CICLO RADIAN — ¿En qué etapa de aceptación están?
Fila 4-8 M, sin franja porque el strip es la leyenda de la gráfica vecina:
- eventos → StatusStrip vertical, familia radian: Pendiente de acuse (warning) → 030 Acuse (info) → 032 Recibo del bien (good). Alto 24 + 3·64 + 16 = 232 ≤ 284.
- eventos-serie → AreaTimeseries stacked, con los mismos tonos y el mismo orden (legendFrom = eventos).

S4 PROVEEDORES — ¿Qué tan concentrada está la facturación?
Fila 12 M:
- top-proveedores → RankingList en 2 columnas (5 | 5) con cabecera de concentración ('2 proveedores concentran el 66 %'). Alto 40 + 200 = 240 ≤ 284. labelKind proveedor: nombre + NIT en mono.

DETALLE: DetailTable v2, sin [NIT], badge radian antes de Valor y día 'Dom'.

Formas: 1 de 7 horizontal (14 %).
- coverage: KPIs 4/4: facturas (héroe); valor, ticket y proveedores (grupo), con las mismas medidas, polaridad y hint.

Widgets 7/7:
- S1: serie, dias;
- S2: mensual-cantidad, mensual-valor;
- S3: eventos, eventos-serie;
- S4: top-proveedores.

Se conservan scope ytd, splitTopN 4, topN 10 y compare. Único derivado nuevo: la concentración. Tabla completa.

### facturas-emitidas
- hero: P1: matriz 'Facturas por día y hora' (HeatmapMatrix con marginales) a 12 L. KpiHero: facturas. La calidad se ve desde la banda como KpiTile de estado.
- layout: KPIs 4-4-4. El tile de inconsistentes muestra la TASA; el volumen por tipo va en S3 (regla de duplicación).

S1 RITMO — ¿Cuándo emite la operación?
Fila 12 L:
- composite HeatmapMatrix [dia-hora (nuevo), dias, horas]. Celdas ≈ 33×39, horas en rango continuo con datos, banda 7–17 h, ScaleLegend raíz. El marginal derecho de 'dias' muestra conteo y % (el widget no mide COP).

S2 AÑO EN CURSO
Fila 6-6 M:
- mensual-cantidad → chart-1.
- mensual-valor → chart-2 (antes aqua slot 3). Se omite enero en 0 y con eso el '+428 %'.

S3 CALIDAD — ¿Qué parte es inconsistente y a quién facturamos?
Fila 4-8 L:
- estado-tipo → CompositionBar split estado × tipo: EMITIDA good / INCONSISTENTE critical, con barra FC/NC/ND y glosario.
- top-adquirientes → RankingList: fila fijada 'Adquiriente no encontrado' (warning, CTA 'Ver inconsistentes'), 7 visibles y 'Ver los 60'. Alto 44 + 280 + 28 = 352 ≤ 384.

S4 RESOLUCIONES — ¿Con qué resoluciones se factura?
Fila 12 auto:
- resoluciones → ResolutionTable.

DETALLE: badge de la familia factura; mensaje como ícono con popover; sin [NIT].

Formas: 1 de 8 horizontal.
- coverage: KPIs 4/4: facturas (héroe); valor y adquirientes (grupo); inconsistentes (tile, misma medida share y up-bad).

Widgets 7/7 + 1 nuevo:
- dias y horas: marginales con sus mismos totales, cada uno con su propio 'Ver datos' y CSV;
- mensual-cantidad y mensual-valor;
- estado-tipo: todas las combinaciones estado × tipo;
- top-adquirientes: topN 60 conservado;
- resoluciones: las 7 dimensiones y el valor neto;
- nuevo: dia-hora (cruce aditivo).

Tabla completa.

### pqrd
- hero: P1: HeroMap 'Radicados por departamento del remitente' en S2 (12 XL). KpiHero: radicados, con el % SLA como gauge al lado.
- layout: KPIs 3-3-6 (stepper de fases).

S1 CUMPLIMIENTO — ¿Respondemos a tiempo y dónde se acumulan los casos?
Fila 7-5 M:
- semaforo → StatusStrip agrupado (Abiertos 3 | Cerrados 2; etiquetas sin prefijo). Alto 240 ≤ 284.
- estados → PipelineSteps vertical 'Estado del flujo': Por asignar → Para gestión → En edición → Por aprobar → Aprobado. Alto 24 + 5·48 = 264 ≤ 284.

S2 TERRITORIO (P1)
Fila 12 XL:
- mapa → HeroMap con desglose por canal.

S3 TENDENCIA — ¿Cómo evoluciona y por dónde llega?
- Fila 12 M: serie → AreaTimeseries (P2), serie 'Radicados'.
- Fila 6-6 S: tipologia | canales ('Canal de radicación') → CompositionBar legend (5 partes, 2 columnas). Alto 122 ≤ 184.

S4 OFICINAS — ¿Qué oficina responde?
Fila 12 L:
- oficinas → RankingList en 2 columnas (8 | 7), 'Top 15 de 42 · X %'. Alto 348 ≤ 384.

S5 EFICIENCIA — ¿Qué gerencias son ágiles semana a semana?
Fila 12 auto:
- eficiencia → EfficiencyMatrix.

Formas: 1 de 8 horizontal.
- coverage: KPIs 6/6: radicados (héroe); sla (gauge); asignacion, gestion, aprobacion y ciclo (stepper), con los mismos valores, deltas e indicaciones.

Widgets 8/8:
- S1: semaforo, estados;
- S2: mapa;
- S3: serie, tipologia, canales;
- S4: oficinas;
- S5: eficiencia.

Tabla intacta.

### entes-control
- hero: P1: HeroMap en S2 con desglose por ente. Es el mismo esqueleto que PQRD. KpiHero: radicados.
- layout: KPIs 3-3-6 (alerts).

S1 CUMPLIMIENTO — ¿Respondemos a tiempo y en qué etapa está cada requerimiento?
Fila 7-5 M (igual que PQRD):
- semaforo → StatusStrip agrupado. Alto 240 ≤ 284.
- estado → PipelineSteps vertical 'Estado del flujo' con las 8 categorías (maxItems 8): 4 pasos Por asignar → Para gestión → En edición → Aprobado; rama 'Reclasificación: Solicitud → Aprobada' y salidas Aprobación rechazada y Cerrado como chips; modo denso si el pie no cabe. Alto 24 + 4·48 + 32 = 248 ≤ 284.

S2 TERRITORIO (P1)
Fila 12 XL:
- mapa → HeroMap con desglose por ente y '16 sin ubicación'.

S3 TENDENCIA — ¿Cómo evoluciona y qué tipo de requerimiento llega?
- Fila 12 M: serie → AreaTimeseries (P2).
- Fila 6-6 S: tipo | canal → CompositionBar split (3 categorías cada uno).

S4 ENTES Y OFICINAS — ¿Quién nos requiere y quién responde?
- Fila 12 M: entes → EntityTiles 5×2 con siglas; 'No identificados' (Otros y Sin clasificar) al final en neutral. Alto 232 ≤ 284.
- Fila 12 M: oficinas → RankingList en 2 columnas (6 | 6: top 11 + 'Otras N oficinas', porque el slot de Otros cuenta dentro del topN 12). Alto 40 + 6·40 = 280 ≤ 284.

DETALLE: la nota de spec.notes pasa a DataNotesPopover.

Formas: 1 de 8 horizontal.
- coverage: KPIs 6/6: radicados (héroe); aprobados (gauge); quejas, asignacion, fuera-horario y reabiertos (alerts).

Widgets 8/8:
- S1: semaforo, estado (8 categorías);
- S2: mapa;
- S3: serie, tipo, canal;
- S4: entes (los 10), oficinas (Top 12 + Otros).

Nota conservada. Tabla intacta.

### entes-control-eficiencia
- hero: P1: PhaseMatrix 'Cuellos de botella por fase' a 12 L. KpiHero: asignación (coincide con el nuevo headline del Home).
- layout: KPIs 3-3-6.

S1 CUELLOS DE BOTELLA — ¿Qué fase y qué oficina frenan el flujo?
Fila 12 L:
- composite PhaseMatrix [fase-asignacion, fase-gestion, fase-oficina, fase-aprobacion]: 2/3 de matriz con filas de 32 (10 filas + cabecera = 352 ≤ 384; con más, scroll) y 1/3 de BottleneckCallouts (4 × 90 px).

S2 CARGA POR RESPONSABLE — ¿Quién tiene casos que requieren atención?
Fila 12 auto:
- pivot-asignador, pivot-gestionador, pivot-revisor y pivot-aprobador → RolePivot: Segmented de rol, tira resumen, columnas SLA estables (Vencido → Por vencer → Preventiva → No reporta), escala raíz y 'Sin responsable asignado' al final.

Header: H1 'Eficiencia operativa'.

Formas: 0 horizontales.
- coverage: KPIs 6/6. Son las mismas definiciones de entes-common; solo cambia hero en el kpiLayout.

Widgets 8/8:
- S1: fase-asignacion, fase-gestion, fase-oficina, fase-aprobacion. Se calculan sin topN (superconjunto declarado: 'Ver datos' y CSV pasan a traer todas las oficinas; la vista marca el top 6 con su rango). Se conservan las notas y la marca Provisional.
- S2: los 4 pivotes, con las mismas filas oficina › persona, la exclusión de 'A tiempo' y los totales.

Tabla intacta.

### smart-momento-1
- hero: P1: HeroMap 'Quejas por ubicación del consumidor' en S1. KpiHero: radicados.
- layout: KPIs 4-8.

S1 TERRITORIO (P1)
Fila 12 XL:
- mapa → HeroMap con desglose por canal.

S2 TENDENCIA
Fila 12 M:
- serie → AreaTimeseries (P2), serie 'Quejas'.

S3 PERFIL — ¿Qué producto, canal y género caracterizan las quejas?
- Fila 12 M: productos → RankingList en 2 columnas (5 | 4, incluye 'Otras 7 categorías'). Alto 228 ≤ 284. 'Otros productos de seguros' es una categoría real, no neutral.
- Fila 6-6 S: canales → CompositionBar legend (6) | genero → CompositionBar split (Masculino / Femenino; 'No aplica' y 'No reporta' en nota).

S4 CALIDAD DEL DATO Y RIESGO
Fila 6-6 S:
- macro-motivos → DataQualityNotice ('97,8 % sin macro motivo', top 3 reales y 'Ver los 13').
- semaforo → DataQualityNotice variante status ('2 de 1.000 cruzan con PQRD', con mini strip).

Formas: 1 de 7 horizontal.
- coverage: KPIs 4/4: radicados (héroe); tutela, cruce y departamentos (grupo).

Widgets 7/7:
- S1: mapa;
- S2: serie;
- S3: productos, canales, genero;
- S4: macro-motivos, semaforo. Conservan menú, 'Ver datos' y CSV con todas sus categorías.

Tabla intacta.

### smart-momento-2
- hero: P1: HeroMap en S1 con desglose por motivo. KpiHero: total.
- layout: KPIs 4-8.

S1 TERRITORIO (P1)
Fila 12 XL:
- mapa → HeroMap, '17 sin ubicación · 6,6 %'.

S2 TENDENCIA
Fila 12 M:
- serie → AreaTimeseries (P2). Deja de estar comprimida en 4 columnas.

S3 MOTIVOS — ¿Por qué se quejan?
Fila 12 L:
- motivos → Treemap de los 15 motivos con dato; chip 'No reporta 293 · 29 %' fuera del árbol. Segmented 'Mapa de árbol | Lista': la lista es una RankingList en 2 columnas (8 | 8, 348 ≤ 384).

S4 RECEPCIÓN — ¿Cómo llega la queja?
- Fila 6-6 S: producto → CompositionBar legend (8 = 5 + Otras + No reporta; 146 ≤ 184) | punto → CompositionBar legend (4).
- Fila 6-6 S: persona → CompositionBar split (Natural / Jurídica) | canal → CompositionBar legend ('Resto / otras' 98,9 % + 4).

Se elimina la fila huérfana de 'Producto'.

Formas: 0 horizontales (la Lista es opcional).
- coverage: KPIs 4/4: total (héroe); transmitido, anexos y juridica (grupo).

Widgets 7/7:
- S1: mapa;
- S2: serie;
- S3: motivos (las 16 categorías: 15 en el árbol y No reporta en el chip, todas en 'Ver datos' y CSV);
- S4: producto, punto, persona, canal.

Tabla intacta.

### smart-momento-3
- hero: P1: HeroMap en S2 (sube de la 5.ª sección), con banner de cobertura del 26 %. Las tiras de vencimiento de S1 son el titular analítico. KpiHero: total.
- layout: KPIs 3-4-5.

S1 VENCIMIENTO — ¿Cómo está el término de las quejas?
Fila 6-6 M:
- sla → StatusStrip (5 en 2 líneas; 184 ≤ 284).
- semaforo → StatusStrip agrupado: Abiertos 3 / Cerrados 2 / 'Sin clasificar' (fusiona '6. Sin Clasificar' y 'No reporta', con el desglose en el tooltip). Alto 240 ≤ 284. Etiquetas sin '1.'–'6.'.

S2 TERRITORIO (P1)
Fila 12 XL:
- mapa → HeroMap con el banner 'El mapa representa el 26 % de las quejas (290 sin ubicación)' y desglose por canal.

S3 TENDENCIA — ¿Cómo evoluciona el ingreso de quejas al momento 3?
Fila 12 M:
- serie → AreaTimeseries (P2).

S4 PENDIENTE — ¿Dónde se acumula la gestión?
SectionLegend: Gestión info · Cierre good. Fila 4-4-4 M:
- estado-momento → SplitRows (6 × 36 = 216).
- canal-momento → SplitRows compacta (7 × 32 = 224).
- queja-momento → HeatmapMatrix compacta 3 × 2 (estado de la queja × momento).

S5 EXPLORACIÓN — ¿Qué oficinas y tipologías lo explican?
Fila 7-5 L:
- drill → DrilldownBars v2 (366 ≤ 384).
- sankey → Sankey v2.

S6 SLA — ¿En qué estados, oficinas y tipos de solicitud se concentra el riesgo?
Fila 12 auto:
- pivot-estado, pivot-oficina y pivot-tipo → PivotHeatmap v2 en pestañas.

DETALLE: Alerta con familia alerta; Estado y Semáforo (badges) justo después del radicado, a la vista sin desplazar.

Formas: 3 de 13 horizontales (23 %).
- coverage: KPIs 6/6: total (héroe); cierre y gestion (Avance); por-vencer, vencidos y alertas (Riesgo).

Widgets 13/13:
- momento: embebido en Avance, con su menú, 'Ver datos' y CSV;
- S1: sla, semaforo;
- S2: mapa;
- S3: serie;
- S4: estado-momento, canal-momento, queja-momento;
- S5: drill (5 niveles), sankey;
- S6: pivot-estado, pivot-oficina, pivot-tipo.

Tabla intacta.

### tutelas
- hero: P1: HeroMap 'Territorio de la tutela' en S2, con desglose por etapa. En la banda, el grupo 'Cumplimiento de términos'. El juzgado remitente sale de la sección de territorio para no poner dos rankings de departamentos seguidos.
- layout: KPIs 3-6-3.

S1 ETAPA Y ESTADO — ¿En qué punto del proceso están?
- Fila 12 S: etapas → PipelineSteps: Avoco → Oficios → Fallo 1.ª instancia → Fallo 2.ª instancia (alias cortos en vizOptions.overrides) → Desacato (critical); chip Duplicado; nota No reporta.
- Fila 4-4-4 S:
  - estado → CompositionBar legend, familia flujo (5; 170 ≤ 184);
  - canal → split (Mail · Mail IA · Ventanilla);
  - dependencia → split (Gerencia médica · Gerencia de indemnizaciones · Ambas; No reporta en nota).

S2 TERRITORIO DE LA TUTELA (P1)
Fila 12 XL:
- mapa → HeroMap.

S3 TENDENCIA
Fila 12 M:
- serie → AreaTimeseries (P2), serie 'Tutelas'.

S4 FALLOS, CAUSALES Y JUZGADOS — ¿Cómo se falla, por qué y desde dónde nos demandan?
- Fila 12 L: causales → RankingList en 2 columnas (5 | 5, filas de 2 líneas; 308 ≤ 384). Ya no quedan dos causales con el mismo texto truncado.
- Fila 6-6 M:
  - fallos → FamilySplit 'Estado del fallo' (Favorable · Desfavorable · Trámite + Sin dato; 15 estados agrupados; 276 ≤ 284);
  - departamentos → RankingList compacta en 2 columnas (6 | 5; 220 ≤ 284), con título 'Juzgado remitente · departamento' y subtítulo 'Geografía del juzgado, distinta al mapa'.

S5 RESPONSABLES
Fila 12 M:
- gestionadores → PeopleLeaderboard compacta en 3 columnas (7 | 7 | 6; 7·34 = 238 ≤ 284), con chip 'concentra 30 %' en el #1.

DETALLE: encabezado con container query (arregla el colapso a 1024).

Formas: 3 de 10 horizontales (30 %).
- coverage: KPIs 6/6: tutelas (héroe); en-termino, fuera-termino, pct-tramite y en-tramite (grupo; en-tramite como cifra secundaria); desacato (tile provisional).

Widgets 10/10:
- S1: etapas, estado, canal, dependencia;
- S2: mapa;
- S3: serie;
- S4: causales, fallos, departamentos;
- S5: gestionadores (top 20).

fallos pasa a no tener topN: 15 estados, superconjunto del top 10, con el alias Informativo(s) documentado.

Tabla intacta.

### medicina-laboral-entradas
- hero: P1: HeroMap de destinatarios en S2, después de la fila de oportunidad, donde Vencido ya no sale en verde. KpiHero: radicados. Responsables pasa al final.
- layout: KPIs 4-8.

S1 OPORTUNIDAD — ¿Respondemos a tiempo?
Fila 5-7 M:
- tiempo-vencer → StatusStrip, familia cumplimiento: En término good · Fuera de término serious · Vencido critical · No reporta neutral. Chip '38 % sin dato'. Alto 184 ≤ 284.
- tiempo-gestion → Histogram v2 con 'Promedio 5,4 d' tomado del KPI y chip 'Sin dato: 230'.

S2 TERRITORIO (P1)
Fila 12 XL:
- mapa → HeroMap con desglose por tipo de trámite y '164 sin ubicación (21,6 %)' en warning.

S3 FLUJO DE ENTRADA
- Fila 8-4 M:
  - serie → AreaTimeseries lines (P2): Radicados como área chart-1 y Aprobados como línea chart-2;
  - tipo-tramite → CompositionBar split vertical.
- Fila 6-6 S:
  - canal → CompositionBar legend (5);
  - oficinas → CompositionBar legend (6; 'Grupo Centro de Excelencia 6').

S4 SOLICITUDES Y ESTADOS
Fila 6-6 L:
- tipo-solicitud → RankingList: 7 reales + fila neutral 'Sin tipo de solicitud' + chip. Alto 352 ≤ 384.
- estados → StatusBoard: 15 estados en 4 familias con subtotales (260 ≤ 384).

S5 RESPONSABLES
Fila 6-6 L:
- gestionadores | revisores → PeopleLeaderboard compacta: callout 'Sin gestionador asignado: N · %' + 10 × 34 = 372 ≤ 384.

Se eliminan los canalones de 2 y 6 columnas.

Formas: 3 de 11 horizontales (27 %).
- coverage: KPIs 4/4: radicados (héroe); aprobados, vencidos y tiempo-gestion (grupo). tiempo-gestion es además la referencia del histograma.

Widgets 11/11:
- S1: tiempo-vencer, tiempo-gestion;
- S2: mapa;
- S3: serie, tipo-tramite, canal, oficinas;
- S4: tipo-solicitud, estados;
- S5: gestionadores, revisores.

estados pasa a no tener topN: las 15 categorías, superconjunto del top 12 + Otros.

Tabla intacta.

### medicina-laboral-salidas
- hero: P1: HeroMap del destinatario en S1. En la banda, el grupo 'Resultado de notificación' acompaña al héroe 'total'.
- layout: KPIs: fila 1 4-8 + fila 2 6-6 compacta (sin la segunda fila de 4 huecos).

S1 DESTINO (P1)
Fila 12 XL:
- mapa → HeroMap con desglose por forma de envío, nota de geografía del destinatario y '6 sin ubicación'.

S2 NOTIFICACIÓN — ¿Qué pasó con cada envío?
La banda muestra tasas sobre notificables; el widget, volumen con 'Sin evento'.
- Fila 6-6 S:
  - resultado → StatusStrip, familia notificación, con las etiquetas de la banda: Entregada · Abierta · Fallida (4 en 1 línea; 100 ≤ 184);
  - medio → CompositionBar legend (5).
- Fila 4-4-4 M:
  - guias → StatusStrip lista compacta con la cabecera 'Sin guía física (envío electrónico): 818 · 93,9 %' fuera de escala y los 5 estados reales (200 ≤ 284);
  - copia → ColumnBars ordinal con 9 columnas (Ppal, 1–8);
  - tramite → CompositionBar split (Medicina laboral · Comunicaciones ML).

S3 OFICINAS — ¿Qué oficinas envían más y cuáles notifican mejor?
Fila 12 M:
- oficinas → RankingList en 2 columnas (4 | 4) con bullet '% entregadas' y marcador en el valor global del KPI. Alto 216 ≤ 284.

S4 RITMO — ¿Cómo se aprueban las salidas y con qué plazo?
Fila 8-4 M:
- serie → AreaTimeseries (P2), subtítulo 'Por fecha de aprobación', vizOptions.mode 'auto': área con datos diarios; pasa a columns solo si > 60 % de los días están en 0.
- tiempo-definido → Histogram v2 con 'Sin dato: 253' (chip de calidad si pasa del 15 %).

S5 RESPONSABLES — ¿Quién gestiona las salidas y en qué procesos?
- Fila 6-6 L: gestionadores | revisores → PeopleLeaderboard compacta (340 ≤ 384).
- Fila 12 M: procesos → Treemap con alternancia Lista (11 procesos con etiquetas cortas).

Formas: 3 de 12 horizontales (25 %).
- coverage: KPIs 8/8: total (héroe); entregadas, abiertas y fallidas (Notificación); digital y guias (Envío); aprobacion y sla (Aprobación).

Widgets 12/12:
- S1: mapa;
- S2: resultado, medio, guias, copia, tramite;
- S3: oficinas, con su métrica secundaria;
- S4: serie, tiempo-definido;
- S5: gestionadores, revisores, procesos.

copia pasa de dona a barra ordinal con las 9 categorías: superconjunto, porque hoy la dona pliega Copia 5–8 en 'Otros'. tramite tiene 2 valores efectivos por el override del dataset; verificar con la BD real.

Tabla intacta.

### correspondencia-entradas
- hero: P1: HeroMap del remitente en S1, con etiquetas por encima del relleno. P2: serie de radicados. KpiHero: radicados.
- layout: KPIs 4-8 (misma primera fila que Salidas).

S1 TERRITORIO DEL REMITENTE (P1)
Fila 12 XL:
- mapa → HeroMap con desglose por tipo de trámite.

S2 ENTRADA Y TRÁMITE — ¿Cuánto entró y de qué tipo?
Fila 8-4 M:
- serie → AreaTimeseries (P2).
- tipo-tramite → CategoryTiles 2×2 (PQRD, Medicina laboral, Tutela + 'Otros trámites' con 4). Tiles de 148×122, con enlace neutro 'Ver tablero ↗' y sin color de módulo.

S3 CANAL Y MEDIO
Fila 6-6 S:
- canal → CompositionBar legend (8 → 5 + 'Otras 2' + No reporta; 146 ≤ 184). Reemplaza la dona.
- medio → CompositionBar legend (5) con el chip '37 % sin medio reportado'.

S4 GESTIÓN (#gestion) — ¿En qué estado está y qué oficina la tiene?
- Fila 12 M: estados → StatusBoard con 14 estados. En curso = PENDIENTES, así el subtotal coincide con el KPI (260 ≤ 284).
- Fila 12 L: oficinas → RankingList en 3 columnas (7 | 7 | 7; 308 ≤ 384).
- Fila 12 auto: pivot → PivotHeatmap v2 con 14 columnas agrupadas por ciclo de vida.

Formas: 1 de 8 horizontal.
- coverage: KPIs 4/4: radicados (héroe); aprobados, pct-aprobados y pendientes (grupo; pendientes con acento warning y ancla).

Widgets 8/8:
- S1: mapa;
- S2: serie, tipo-tramite (las 7 categorías);
- S3: canal, medio;
- S4: estados (Top 15 + otros), oficinas (Top 20 + Otros), pivot.

Se elimina la fila 6+4+4 = 14. Tabla intacta.

### correspondencia-salidas
- hero: P1: HeroMap del destinatario en S1, con 'Municipios cubiertos' como contexto. Mismo esqueleto que Entradas. KpiHero: total.
- layout: KPIs: fila 1 4-8 + fila 2 6-6 compacta. Reemplaza el 3-3-3-3 que desbordaba.

S1 DESTINO (P1)
Fila 12 XL:
- mapa → HeroMap con desglose por trámite y '48 sin ubicación (5,7 %)'.

S2 SALIDAS Y TRÁMITE
Fila 8-4 M:
- serie → AreaTimeseries (P2), serie 'Salidas'.
- tramite → CategoryTiles 2×2, igual que Entradas.

S3 CANAL Y SEALMAIL — ¿Qué tan digital es el envío?
Fila 4-8 M:
- canal → CompositionBar split, familia canal-envio: Correo simple (chart-1) · SealMail (chart-2) · Sin canal (neutral).
- sealmail → AreaTimeseries en chart-2, el mismo color de su segmento, con periodo anterior.

S4 ESTADO, ANEXOS Y APROBADORES
- Fila 6-6 S:
  - estado → CompositionBar legend, familia flujo (6);
  - anexos → CompositionBar split: Con anexos chart-1 · Sin anexos neutral; No reporta en nota.
- Fila 12 M: aprobadores → PeopleLeaderboard en 2 columnas (5 | 5) + 'Sin aprobador: 24'. Alto 248 ≤ 284.

Formas: 1 de 8 horizontal.
- coverage: KPIs 10/10: total (héroe); aprobado, enviado y devoluciones (Estado); digital, sealmail y con-correo (Canal); unicos, municipios y folios (Cobertura; folios conserva la exclusión de valores ≥ 9.999). municipios se repite como contexto en el panel del mapa (vizOptions.mapContextKpi: '93 municipios cubiertos', también en el panel de escritorio).

Widgets 8/8:
- S1: mapa;
- S2: serie, tramite;
- S3: canal, sealmail;
- S4: estado, anexos, aprobadores (top 10).

Tabla intacta, más la columna Copia (explica los radicados repetidos).

## implementationOrder
- F0 · Correcciones inmediatas (1–2 días, visibles en la próxima demo):
- devIndicators: false;
- desactivar las leyendas de Chart.js y poner un ChartLegend mínimo en las series;
- NEUTRAL_LABELS también en barras, con los neutrales al final;
- skipFields en el filtro cruzado;
- % con 1 decimal y deltas de % en p.p.;
- cabecera 'comparado con {prevFrom – prevTo}';
- leyenda del mapa separada del logo;
- BarTable con table-layout fixed;
- --primary-text y los inks de warning y serious (AA);
- kbd del topbar en font-sans;
- íconos Mailbox y MailCheck.
- F1 · Tokens y fundamentos:
- globals.css: módulos validados, estado corregido, ritmo, --content-max, --sticky-h y reglas [data-t]/[data-tier] con umbrales de 600 y 840;
- SemanticRegistry con familias explícitas y tests con etiquetas reales;
- displayLabel, formatos y alias en normalizers (documentados en AGENTS §6);
- deltaTone compartido;
- useStableCategoryColors;
- DashboardSpec.unit;
- correr validate_palette en ambos modos.
- F2 · Contrato y red de seguridad (antes de tocar cualquier tablero):
- congelar la línea base de ids de KPIs, widgets y columnas de los 13 specs;
- types.ts: RowDef, CellRef, KpiLayout, viz, semantic, maxItems, short, reference, rowOrder, stableRows y stableColumns;
- agregar vitest;
- validateLayout con suma, cobertura, capacidad según la tabla de presupuestos, P1 única, anti-monotonía y capacidad de los KpiGroup.
- F3 · Sistema de filas:
- contenedor page;
- DashboardRow, CellCard, StackCell y CompositeCard;
- tiers;
- WidgetCard v2 (con html-to-image para PNG de widgets HTML);
- SectionHeader;
- packRows;
- sidebar en riel automático.
- F4 · Gramática común:
- ChartLegend, SectionLegend y ScaleLegend;
- ChartTooltip;
- DeltaChip y MicroTrend;
- plugin weekendBands;
- VizSkeleton y EmptyState.
- F5 · Banda de KPIs:
- KpiHero, KpiGroup (list, proportion, stepper, alerts, pair y embed) y KpiTile;
- fallback 2×2;
- KpiDef.short;
- kpiLayout de los 13 tableros.
Primer entregable visible: bandas sin huecos.
- F6 · PILOTO VISUAL con el cliente, antes de migrar el resto:
- componentes mínimos: CompositionBar, RankingList, PeopleLeaderboard, StatusStrip, Histogram v2 y HeroMap v1 (cámara, máscara, clases, panel y estilo oscuro);
- migrar ML Entradas (el caso que citó el cliente) y PQRD (HeroMap), más el Home con módulos;
- capturas antes/después a 1440, 1024 y 390, en claro y oscuro;
- sesión de validación. Los ajustes vuelven a los tokens y a las reglas, no a parches por tablero.
- F7 · Componentes restantes y motor:
- StatusBoard, PipelineSteps, CategoryTiles, EntityTiles, FamilySplit, DataQualityNotice, SplitRows, Treemap (dependencia chartjs-chart-treemap, import dinámico), ColumnBars, MonthlyBarsDelta, HeatmapMatrix, PhaseMatrix, PivotHeatmap v2/RolePivot, EfficiencyMatrix, Drilldown v2, Sankey v2 y ResolutionTable;
- motor: neutrales al final, rest, rowOrder/stableRows/stableColumns, dia-hora y los superconjuntos declarados (fase-*, estados de ML, fallos y copia).
- F8 · HeroMap completo:
- build-geo: contorno, máscara, puntos de etiqueta y bounds.ts;
- estilo oscuro gemelo en Studio;
- etiquetas del top 5;
- recuadro de San Andrés;
- exportación compuesta;
- bottom sheet en móvil;
- métrica de encuadre en la QA.
- F9 · Migración de specs por familias, con QA visual por par y el test de cobertura en verde:
1. Medicina Laboral Salidas;
2. Entes + Eficiencia;
3. Correspondencia E/S;
4. SMART 1-2-3;
5. Tutelas;
6. Facturas R/E.
- F10 · Encabezado y navegación:
- DashboardHeader y DataNotesPopover;
- SectionNav;
- FilterBar priority+;
- DetailTable v2.
- F11 · Shell (en paralelo desde F7):
- ModuleTokens en config (tone, summary, healthKpi, features);
- Sidebar v2 y Topbar v2;
- ThemeSwitch;
- CommandPalette v2.
- F12 · Home y login:
- contrato /api/catalogo (hero, salud y prevRange);
- HomeHero, PulseSummary y QuickAccessRail;
- ModuleNav y ModuleSection;
- DashboardCard (estándar, ancha y fila), MicroColumns y ColombiaDots;
- LoginScreen v2, recapturado sin cookie.
- F13 · QA final:
- script headless a 1440, 1280, 1024, 768 y 390, en claro y oscuro, con sidebar expandido y en riel: filas, altos, overflow, etiquetas y encuadre del mapa (≥ 60 %/90 % lado a lado; ≥ 85 % apilado);
- validate_palette y contraste AA;
- teclado y lector de pantalla;
- reduced-motion;
- tsc y lint en 0;
- checklist de demo con capturas antes/después.

## risks
- Alcance grande: ≈ 40 componentes y 13 specs. Mitigación:
- piloto con el cliente (F6) antes de migrar el resto;
- empaquetador de respaldo;
- test de inventario contra la línea base;
- QA por par de tableros;
- F0 y F5 ya cambian la percepción por sí solas.
- El filtro cruzado con skipFields cambia el comportamiento: el widget de origen muestra todas sus categorías con la seleccionada resaltada. Es la convención de Looker y Power BI, pero hay que comunicarla en la demo. El cómputo extra solo corre cuando esa dimensión tiene un filtro.
- Los altos fijos por fila pueden no alcanzar con datos reales (más categorías o etiquetas más largas). Mitigación:
- presupuesto por componente con maxItems en validateLayout;
- 'Ver N más' con scroll interno;
- line-clamp con tooltip;
- tier 'auto' en las tablas;
- la QA mide overflow y desigualdad de alturas.
- Registro semántico: con familias explícitas desaparecen las colisiones 'evento' y 'estado'. Aun así, pueden llegar estados nuevos o variantes. Mitigación: normalización, overrides, aviso en desarrollo, fallback neutral y verificación local con los CSV reales de top_secret, sin versionarlos.
- Superconjuntos declarados que cambian lo que exportan 'Ver datos' y el CSV:
- fase-* pasa a todas las oficinas;
- estados de ML entradas pasa de 12 + Otros a 15;
- fallos de Tutelas pasa de 10 a 15;
- copia de ML salidas pasa de 5 + Otros a 9.
No se pierde información, pero hay que comunicarlo al cliente igual que los decimales y los p.p.
- Alias en el motor (Informativo/Informativos; Por recibir [en] correspondencia): cambian los conteos por categoría y los valores de filtro guardados en URLs. Hay que documentarlos en AGENTS §6 y replicarlos en SQL.
- Mapbox:
- el estilo oscuro requiere crear el gemelo en Studio, en la cuenta del cliente (respaldo dark-v11);
- setStyle obliga a re-agregar las capas y el feature-state;
- el filtro de etiquetas depende de place_label y country_label (try/catch por capa);
- validar el rendimiento de la máscara mundial en portátiles de oficina y en móvil.
- Nuevas dependencias: chartjs-chart-treemap (import dinámico) y html-to-image. Si la exportación PNG de widgets HTML falla, se oculta esa opción y se mantienen 'Ver datos' y CSV.
- Colores cercanos:
- warning ↔ serious (ΔE 13,6) es inherente a la escala de estado;
- PQRD ↔ Medicina (ΔE 8,7) no son vecinos en ninguna superficie;
- Facturación comparte familia con info.
Mitigación obligatoria: ícono + etiqueta, agrupación en las tiras y color de módulo solo en el chrome. Revalidar con el script si cambian las superficies.
- container-type en el root aplica contención. Los overlays fixed deben ir en Portal (ya existe) y hay que verificar el sticky de la FilterBar y de SectionNav en Safari y Chrome. Los hooks con ResizeObserver deben usar useSyncExternalStore o callbacks para cumplir el React Compiler.
- Los cambios del motor (rest, rowOrder, stableRows/stableColumns, dia-hora, superconjuntos, alias y catálogo con salud) deben tener su SQL equivalente en el futuro DataProvider de Postgres, documentado en postgres/README.
- Decisiones de negocio por validar con Positiva:
- 'Sin evento RADIAN' como warning y el orden 030/032;
- las familias de Estado del fallo;
- 'Fuera de término' como serious en todos los tableros;
- la geografía de Tutelas (territorio de la tutela frente a juzgado remitente);
- 'Otros' de entes como 'No identificados';
- el headline de Eficiencia = asignación;
- las fórmulas provisionales existentes;
- el TRAMITE de ML Salidas (2 valores por override).
- Rendimiento: más componentes HTML y el mapa con máscara. Mitigación: montaje al entrar al viewport, mapa diferido, MicroTrend en SVG y rankings de hasta 60 filas sin virtualizar.
- Las capturas de /login mostraban el Home por la cookie activa. El login rediseñado debe validarse sin sesión antes de la demo.