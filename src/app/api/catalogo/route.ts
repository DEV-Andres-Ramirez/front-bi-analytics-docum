import { NextResponse } from "next/server";
import { DASHBOARDS } from "@/config/dashboards";
import { SPECS } from "@/dashboards/specs";
import type { KpiResult } from "@/dashboards/dto";
import { defaultRange } from "@/lib/dates";
import { hasSession } from "@/server/auth/dal";
import { getProvider } from "@/server/data/provider";

export const dynamic = "force-dynamic";

export interface CatalogItem {
  slug: string;
  label: string;
  format: string;
  kpi: KpiResult | null;
}

/** Cifra titular del mes en curso de cada tablero (tarjetas del Home). */
export async function GET() {
  if (!(await hasSession())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const range = defaultRange();
  const provider = getProvider();
  const items: CatalogItem[] = [];
  for (const meta of DASHBOARDS) {
    const spec = SPECS[meta.slug];
    const kpiDef = spec.kpis.find((k) => k.id === meta.headlineKpi) ?? spec.kpis[0];
    const headlineSpec = { ...spec, kpis: [kpiDef], sections: [], filters: [] };
    try {
      const data = await provider.dashboard(headlineSpec, { ...range, eq: {}, text: {}, dates: {} });
      items.push({ slug: meta.slug, label: kpiDef.label, format: kpiDef.format, kpi: data.kpis[0] ?? null });
    } catch {
      items.push({ slug: meta.slug, label: kpiDef.label, format: kpiDef.format, kpi: null });
    }
  }
  return NextResponse.json({ range, items }, { headers: { "Cache-Control": "private, no-store" } });
}
