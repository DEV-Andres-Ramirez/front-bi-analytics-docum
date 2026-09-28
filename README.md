# Docum BI · Tableros de seguimiento de flujos (Positiva)

Front-end de los **13 tableros ejecutivos** de SGDEA / Docum para **Positiva Compañía de Seguros**: facturación electrónica, PQRD, entes de control, SMART Supervisión (momentos 1, 2 y 3), tutelas, medicina laboral y correspondencia.

Reemplaza los tableros de Looker Studio con una experiencia moderna y coherente:
- Home "Centro de mando documental": módulos con identidad de color, pulso del mes y salud de cada tablero;
- una visual protagonista por tablero (mapa de Colombia con panel de insights, series, matrices) y la forma de cada gráfica elegida por el tipo de dato;
- filas que siempre suman 12 con alturas iguales, leyendas y tooltips con una sola gramática, estados con ícono y etiqueta;
- filtros cruzados sincronizados con la URL (filtrar es resaltar) y KPIs con variación frente al periodo anterior (p.p. para porcentajes);
- tema claro y oscuro seleccionados por separado, diseño responsivo (escritorio, tablet y móvil) y exportación a CSV o PNG.

> Documentación técnica y de negocio completa (para desarrolladores y agentes): **[AGENTS.md](./AGENTS.md)**.
> Sistema de diseño (reglas visuales, componentes y layout de cada tablero): **[docs/ui-design-system.md](./docs/ui-design-system.md)**.

## Requisitos

- Node.js ≥ 20 (probado con 24)
- pnpm 12

## Puesta en marcha

```bash
pnpm install
cp .env.example .env.local      # completa los valores (ver tabla)
pnpm dev                         # http://localhost:3000
```

Ingresa con el token de acceso definido en `ACCESS_TOKEN`.

### Variables de entorno

| Variable | Descripción |
|---|---|
| `ACCESS_TOKEN` | Token único de acceso que se digita en `/login` (solo servidor). |
| `SESSION_SECRET` | Secreto de ≥ 32 caracteres para firmar la sesión (`openssl rand -base64 48`). |
| `SESSION_TTL_HOURS` | Duración de la sesión en horas (por defecto 8). |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Token público de Mapbox (`pk.…`). |
| `NEXT_PUBLIC_MAPBOX_STYLE` | Estilo del mapa en tema claro (`mapbox://styles/andres-ramirez/cmqkorkc6003101s46xcreztw`). |
| `NEXT_PUBLIC_MAPBOX_STYLE_DARK` | Estilo del mapa en tema oscuro (gemelo en Mapbox Studio). Vacío = `mapbox://styles/mapbox/dark-v11`. |
| `DATA_SOURCE` | `mock` (por defecto, datos sintéticos) o `postgres` (conexión real, pendiente). |
| `DB_*` | Credenciales de la BD para la fase 2 (solo en `.env.local`, nunca en el repo). |

## Scripts

| Comando | Uso |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Desarrollo, compilación y producción. |
| `pnpm lint` | ESLint. |
| `pnpm test` | Vitest: métricas de los 13 tableros intactas frente a la línea base, layout válido, registro semántico, formatos y motor. |
| `node scripts/mock/build-profiles.mjs` | Regenera los perfiles anonimizados de datos mock desde los CSV locales de `top_secret/db`. |
| `node scripts/geo/build-geo.mjs` | Simplifica los GeoJSON de `public/data`, genera contorno, máscara, puntos de etiqueta, `bounds.ts` y el catálogo DIVIPOLA. |
| `node scripts/geo/check-dictionary.mjs` | Mide el cruce del diccionario geográfico contra los CSV reales (100 % departamentos, 99,1 % municipios). |

## Datos

- **Hoy**: datos **sintéticos y anonimizados**. Se generan con semilla fija a partir de las distribuciones de las 19 vistas reales, sin nombres, documentos ni textos reales.
- **Fase 2**: conexión de solo lectura a las vistas `oro_tableros.vw_reporte_datastudio_*`.
  - El acceso a Cloud SQL se hace por un túnel IAP en `127.0.0.1:5432`. El procedimiento está en el runbook interno, fuera del repo.
  - El plan de implementación está en [`src/server/data/postgres/README.md`](./src/server/data/postgres/README.md).
  - Importante: el SQL de las vistas está escrito en dialecto BigQuery. Hay que confirmar la fuente definitiva antes de conectar.

## Estructura (resumen)

```
src/app            rutas (login, catálogo, tableros, API)
src/dashboards     contrato declarativo, layout (filas y validación) y specs de los 13 tableros
src/components     shell, home, dashboard, widgets (HTML, Chart.js y Mapbox), kit de gramática visual, ui
docs               sistema de diseño
src/server         auth, datos (provider, motor de agregación, datasets, mock)
src/lib            fechas, formatos, filtros, gráficas, diccionario geográfico
scripts            generación de perfiles mock y de geografía
public/data        GeoJSON de Colombia (originales + simplificados)
```

## Seguridad

- `top_secret/` (pantallazos, CSV reales, SQL y runbook con credenciales) está en `.gitignore` y **no se versiona**.
- `.env*` está ignorado, salvo `.env.example`.
- Las rutas `/api/*` responden 401 sin sesión. Las páginas redirigen a `/login`.
