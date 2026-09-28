@AGENTS.md

## Resumen rápido para Claude

- Proyecto: **Docum BI** · 13 tableros de seguimiento de flujos documentales de Positiva (Next.js 16 + Chart.js + Mapbox). La guía completa está en `AGENTS.md`.
- Antes de escribir código de Next.js, consulta `node_modules/next/dist/docs/` (proxy en lugar de middleware, params async, `RouteContext`/`PageProps` globales).
- Los tableros se definen de forma **declarativa** en `src/dashboards/specs/*.ts`. El servidor los ejecuta con `src/server/data/engine/*` sobre un `DataProvider` (hoy mock).
- Datos actuales: **sintéticos y anonimizados** (`DATA_SOURCE=mock`). Nunca versiones nada de `top_secret/`.
- UI 100 % en español (es-CO). Formatos con `src/lib/format.ts` y fechas con `src/lib/dates.ts` (hora de pared de Bogotá).
- **Sistema visual**: `docs/ui-design-system.md` es la fuente de verdad. La forma de cada widget se declara con `viz` y el layout con `section.rows` (plantillas que suman 12 + tier de alto) y `spec.kpiLayout`. Una sola visual protagonista por tablero; color de módulo solo en el chrome; estados con ícono + etiqueta; neutrales al final en gris.
- **Nunca cambies una métrica al rediseñar**: `pnpm test` compara ids y definiciones contra `src/dashboards/baseline.json` y valida el layout (`validateLayout`).
- Antes de terminar un cambio corre `npx tsc --noEmit`, `pnpm lint` y `pnpm test` (deben quedar en 0 errores).
