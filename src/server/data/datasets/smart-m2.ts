import "server-only";

import { orNoReporta } from "../normalizers";
import type { Profile } from "../mock/generator";
import { fakeDigits } from "../mock/fake";
import profile from "../mock/profiles/smart_m2.json";
import type { DatasetDef } from "./types";

export const smartM2: DatasetDef = {
  id: "smart_m2",
  views: ["vw_reporte_datastudio_smart_momento2"],
  schema: {
    codigo_queja_reclamo: "text",
    fecha_registro_m2: "date",
    fecha_radicacion_gestor: "date",
    caso_trasmitido_superfinanciera: "cat",
    nombre_canal: "cat",
    nombre_producto: "cat",
    nombre_motivo: "cat",
    nombre_tipo_persona: "cat",
    nombre_punto_recepcion: "cat",
    nombre_anexos_queja_reclamo: "cat",
    nombre_ente_control: "cat",
    departamento: "cat",
    municipio: "cat",
    nombre_departamento: "cat",
    nombre_municipio: "cat",
  },
  geo: { dpto: "departamento", mpio: "municipio" },
  mock: () => ({
    profile: profile as unknown as Profile,
    seed: 606,
    perDay: 10,
    derive(row, ctx) {
      row.codigo_queja_reclamo = `1423ENT-${new Date(ctx.date).getUTCFullYear()}${fakeDigits(`m2-${ctx.index}`, 10)}`;
      row.fecha_registro_m2 = ctx.date;
    },
  }),
  normalize: (r) => ({
    ...r,
    nombre_motivo: orNoReporta(r.nombre_motivo),
    nombre_producto: orNoReporta(r.nombre_producto),
    nombre_ente_control: orNoReporta(r.nombre_ente_control),
    nombre_departamento: orNoReporta(r.nombre_departamento),
    nombre_municipio: orNoReporta(r.nombre_municipio),
  }),
};
