import { NextResponse, type NextRequest } from "next/server";
import { SPECS } from "@/dashboards/specs";
import { parseFilters } from "@/lib/filters";
import { hasSession } from "@/server/auth/dal";
import { getProvider } from "@/server/data/provider";

export const dynamic = "force-dynamic";

/** Agregados de un tablero (KPIs, widgets y opciones de filtro) según los filtros de la URL. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/tableros/[slug]">) {
  if (!(await hasSession())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { slug } = await ctx.params;
  const spec = SPECS[slug];
  if (!spec) return NextResponse.json({ error: "Tablero no encontrado" }, { status: 404 });
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const data = await getProvider().dashboard(spec, filters);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error(`[api/tableros/${slug}]`, error);
    return NextResponse.json({ error: "No fue posible calcular el tablero." }, { status: 500 });
  }
}
