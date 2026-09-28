import "server-only";

import { diaSemana, orNoReporta } from "../normalizers";
import type { Profile } from "../mock/generator";
import { thirdPartyLabel } from "../mock/fake";
import profile from "../mock/profiles/facturas_emitidas.json";
import type { DatasetDef } from "./types";

export const facturasEmitidas: DatasetDef = {
  id: "facturas_emitidas",
  views: ["vw_reporte_datastudio_facturacion_factura_manual", "vw_reporte_datastudio_facturacion_acquirer"],
  schema: {
    id: "text",
    nit_oferente: "cat",
    nit_adquiriente: "cat",
    adquiriente_nombre: "cat",
    numero_factura: "text",
    AUX_Numero_Factura: "text",
    prefijo_factura: "cat",
    fecha_expedicion: "date",
    fecha_vencimiento: "date",
    forma_pago: "cat",
    medio_pago: "cat",
    valor_neto: "num",
    tipo_documento: "cat",
    estado: "cat",
    nro_resolucion: "cat",
    fecha_inicio: "cat",
    fecha_fin: "cat",
    consecutivo_inicial: "cat",
    consecutivo_final: "cat",
    dia_semana: "cat",
    Solo_Hora: "num",
    mensaje: "text",
  },
  mock: () => ({
    profile: profile as unknown as Profile,
    seed: 202,
    perDay: 15,
    start: "2026-02-01",
    overrides: { tipo_documento: { FC: 93, NC: 5.5, ND: 1.5 } },
    derive(row, ctx) {
      row.id = String(3000 + ctx.index);
      row.numero_factura = String(50_001 + ctx.index);
      row.AUX_Numero_Factura = `${row.prefijo_factura ?? ""}${row.numero_factura}`;
      row.fecha_expedicion = ctx.date;
      row.dia_semana = diaSemana(ctx.date);
      row.Solo_Hora = new Date(ctx.date).getUTCHours();
      const nit = String(row.nit_adquiriente ?? "");
      if (row.estado === "INCONSISTENTE") {
        row.adquiriente_nombre = "";
        row.mensaje = `Adquiriente [${nit}] no encontrado para el OFE 860011153`;
        if (ctx.rng() < 0.55) {
          const alt = ctx.rng() < 0.5;
          row.nro_resolucion = "99999999999999";
          row.fecha_inicio = alt ? "2026-06-12" : "2026-02-12";
          row.fecha_fin = alt ? "2036-06-12" : "2036-02-12";
          row.consecutivo_inicial = "1";
          row.consecutivo_final = "999999999";
          row.tipo_documento = "NC";
        }
      } else {
        row.adquiriente_nombre = thirdPartyLabel(nit);
        row.mensaje = "";
      }
    },
  }),
  normalize: (r) => ({
    ...r,
    prefijo_factura: r.prefijo_factura ? String(r.prefijo_factura) : "Sin prefijo",
    adquiriente_nombre: r.adquiriente_nombre ? String(r.adquiriente_nombre) : "Adquiriente no encontrado",
    nro_resolucion: orNoReporta(r.nro_resolucion),
    fecha_inicio: orNoReporta(r.fecha_inicio),
    fecha_fin: orNoReporta(r.fecha_fin),
    consecutivo_inicial: orNoReporta(r.consecutivo_inicial),
    consecutivo_final: orNoReporta(r.consecutivo_final),
    forma_pago: r.forma_pago === "1" ? "1 · Contado" : r.forma_pago === "2" ? "2 · Crédito" : orNoReporta(r.forma_pago),
    medio_pago: r.medio_pago === "42" ? "42 · Consignación bancaria" : orNoReporta(r.medio_pago),
  }),
};
