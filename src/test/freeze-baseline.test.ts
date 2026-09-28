/**
 * Genera la línea base congelada de ids (KPIs, widgets y columnas) de los 13 tableros.
 * Solo corre con FREEZE_BASELINE=1; el archivo resultante se versiona y no se edita a mano.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { SPECS } from "@/dashboards/specs";
import { kpiSignature, widgetSignature } from "./signatures";

describe.runIf(process.env.FREEZE_BASELINE === "1")("línea base", () => {
  it("congela ids", () => {
    const out: Record<string, { kpis: string[]; widgets: string[]; columns: string[]; kpiSig: Record<string, string>; widgetSig: Record<string, string> }> = {};
    for (const [slug, spec] of Object.entries(SPECS)) {
      const widgets = spec.sections.flatMap((s) => s.widgets);
      out[slug] = {
        kpis: spec.kpis.map((k) => k.id),
        widgets: widgets.map((w) => w.id),
        columns: spec.table.columns.map((c) => c.field),
        kpiSig: Object.fromEntries(spec.kpis.map((k) => [k.id, kpiSignature(k)])),
        widgetSig: Object.fromEntries(widgets.map((w) => [w.id, widgetSignature(w)])),
      };
    }
    const file = fileURLToPath(new URL("../dashboards/baseline.json", import.meta.url));
    writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  });
});
