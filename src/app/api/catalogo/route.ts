import { NextResponse } from "next/server";
import { DASHBOARDS, type DashboardMeta } from "@/config/dashboards";
import { SPECS } from "@/dashboards/specs";
import type { CatalogFigure, CatalogItem, CatalogResponse, FiltersState, KpiResult } from "@/dashboards/dto";
import type { DashboardSpec, KpiDef } from "@/dashboards/types";
import { defaultRange, previousRange } from "@/lib/dates";
import { hasSession } from "@/server/auth/dal";
import { getProvider, type DataProvider } from "@/server/data/provider";

export const dynamic = "force-dynamic";

function figure(def: KpiDef | undefined, result: KpiResult | undefined): CatalogFigure | null {
  if (!def || !result) return null;
  return {
    kpi: def.id,
    label: def.label,
    short: def.short,
    format: def.format,
    polarity: def.polarity,
    value: result.value,
    previous: result.previous,
    spark: result.spark,
  };
}

/** KPI titular (hero) y de salud de un tablero, en UNA sola llamada al provider. */
async function catalogItem(provider: DataProvider, meta: DashboardMeta, filters: FiltersState): Promise<CatalogItem> {
  const spec = SPECS[meta.slug];
  if (!spec) return { slug: meta.slug, hero: null, health: null };
  const heroDef = spec.kpis.find((k) => k.id === meta.headlineKpi) ?? spec.kpis[0];
  const healthDef = spec.kpis.find((k) => k.id === meta.healthKpi);
  const kpis = [heroDef, healthDef].filter((k, i, all): k is KpiDef => k !== undefined && all.findIndex((x) => x?.id === k.id) === i);
  const catalogSpec: DashboardSpec = { ...spec, kpis, sections: [], filters: [] };
  try {
    const data = await provider.dashboard(catalogSpec, filters);
    const byId = new Map(data.kpis.map((k) => [k.id, k]));
    return {
      slug: meta.slug,
      hero: figure(heroDef, heroDef ? byId.get(heroDef.id) : undefined),
      health: figure(healthDef, healthDef ? byId.get(healthDef.id) : undefined),
    };
  } catch (error) {
    console.error(`[api/catalogo] ${meta.slug}`, error);
    return { slug: meta.slug, hero: null, health: null };
  }
}

/** Cifra titular y de salud del mes en curso de cada tablero (Home, Pulso del mes y paleta ⌘K). */
export async function GET() {
  if (!(await hasSession())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { from, to } = defaultRange();
  const range = { from, to, ...previousRange(from, to) };
  const filters: FiltersState = { from, to, eq: {}, text: {}, dates: {} };
  const provider = getProvider();
  const items = await Promise.all(DASHBOARDS.map((meta) => catalogItem(provider, meta, filters)));
  const body: CatalogResponse = { range, updatedAt: new Date().toISOString(), source: provider.source, items };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
