import { NextResponse, type NextRequest } from "next/server";
import { SPECS } from "@/dashboards/specs";
import { DASHBOARD_BY_SLUG } from "@/config/dashboards";
import { parseFilters } from "@/lib/filters";
import { hasSession } from "@/server/auth/dal";
import { getProvider } from "@/server/data/provider";

export const dynamic = "force-dynamic";

/** Tabla de detalle paginada (JSON) o exportación completa (?format=csv). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/tableros/[slug]/detalle">) {
  if (!(await hasSession())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { slug } = await ctx.params;
  const spec = SPECS[slug];
  if (!spec) return NextResponse.json({ error: "Tablero no encontrado" }, { status: 404 });

  const sp = request.nextUrl.searchParams;
  const filters = parseFilters(sp);
  const sortParam = sp.get("sort");
  const [field, dir] = sortParam?.split(":") ?? [];
  const sort = field && spec.table.columns.some((c) => c.field === field) ? { field, dir: dir === "asc" ? ("asc" as const) : ("desc" as const) } : undefined;
  const q = sp.get("q") ?? undefined;

  try {
    const provider = getProvider();
    if (sp.get("format") === "csv") {
      const csv = await provider.csv(spec, filters, { sort, q });
      const name = `${DASHBOARD_BY_SLUG[slug]?.slug ?? slug}_${filters.from}_${filters.to}.csv`;
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    const page = Number(sp.get("page") ?? 1) || 1;
    const size = Number(sp.get("size") ?? 25) || 25;
    const data = await provider.detail(spec, filters, { page, size, sort, q });
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error(`[api/tableros/${slug}/detalle]`, error);
    return NextResponse.json({ error: "No fue posible consultar el detalle." }, { status: 500 });
  }
}
