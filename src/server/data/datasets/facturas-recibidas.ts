import "server-only";

import { diaSemana, orNoReporta } from "../normalizers";
import type { Profile } from "../mock/generator";
import { fakeDigits, fakeHex, thirdPartyLabel } from "../mock/fake";
import profile from "../mock/profiles/facturas_recibidas.json";
import type { DatasetDef } from "./types";

export const facturasRecibidas: DatasetDef = {
  id: "facturas_recibidas",
  views: ["vw_reporte_datastudio_facturacion_factura_recibida", "vw_reporte_datastudio_facturacion_provider"],
  schema: {
    id: "text",
    ofe: "cat",
    proveedor: "cat",
    proveedor_nombre: "cat",
    prefijo: "cat",
    consecutivo: "text",
    Aux_Numero_Factura: "text",
    cufe: "text",
    fecha: "date",
    dia_semana: "cat",
    Solo_hora: "num",
    valor: "num",
    Hom_ultimo_Evento: "cat",
    status_formato: "cat",
  },
  mock: () => ({
    profile: profile as unknown as Profile,
    seed: 101,
    perDay: 52,
    derive(row, ctx) {
      const d = new Date(ctx.date);
      const consecutivo = fakeDigits(`fr-${ctx.index}`, 7).replace(/^0/, "1");
      row.id = String(28_100_000 + ctx.index);
      row.ofe = "860011153";
      row.consecutivo = consecutivo;
      row.Aux_Numero_Factura = `${row.prefijo ?? ""}${consecutivo}`;
      row.cufe = fakeHex(`cufe-${ctx.index}`, 96);
      row.fecha = ctx.date;
      row.dia_semana = diaSemana(ctx.date);
      row.Solo_hora = d.getUTCHours();
      row.proveedor_nombre = thirdPartyLabel(String(row.proveedor ?? ""));
    },
  }),
  normalize: (r) => ({
    ...r,
    prefijo: r.prefijo ? String(r.prefijo) : "Sin prefijo",
    Hom_ultimo_Evento: orNoReporta(r.Hom_ultimo_Evento),
  }),
};
