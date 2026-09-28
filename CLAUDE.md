@AGENTS.md

## Resumen rápido para Claude

- Proyecto: **Docum BI** · 13 tableros de seguimiento de flujos documentales de Positiva (Next.js 16 + Chart.js + Mapbox). La guía completa está en `AGENTS.md`.
- Antes de escribir código de Next.js, consulta `node_modules/next/dist/docs/` (proxy en lugar de middleware, params async, `RouteContext`/`PageProps` globales).
- Los tableros se definen de forma **declarativa** en `src/dashboards/specs/*.ts`. El servidor los ejecuta con `src/server/data/engine/*` sobre un `DataProvider` (hoy mock).
- Datos actuales: **sintéticos y anonimizados** (`DATA_SOURCE=mock`). Nunca versiones nada de `top_secret/`.
- UI 100 % en español (es-CO). Formatos con `src/lib/format.ts` y fechas con `src/lib/dates.ts` (hora de pared de Bogotá).
- Antes de terminar un cambio corre `npx tsc --noEmit` y `pnpm lint` (deben quedar en 0).
