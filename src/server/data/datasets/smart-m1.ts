import "server-only";

import { orNoReporta } from "../normalizers";
import type { Profile } from "../mock/generator";
import { radicado } from "../mock/generator";
import { fakeDigits } from "../mock/fake";
import profile from "../mock/profiles/smart_m1.json";
import type { DatasetDef } from "./types";

const SIN_CRUCE = "Sin cruce con PQRD";

export const smartM1: DatasetDef = {
  id: "smart_m1",
  views: ["vw_reporte_datastudio_smart_momento1"],
  schema: {
    radicado: "text",
    codigo_queja_reclamo: "text",
    fecha_registro_m1: "date",
    fecha_radicacion_gestor: "date",
    pqrd_estado: "cat",
    pqrd_nombre_tipo_solicitud: "cat",
    pqrd_semaforo_riesgo: "cat",
    nombre_tipo_persona: "cat",
    nombre_canal: "cat",
    nombre_producto: "cat",
    nombre_macro_motivo: "cat",
    nombre_anexos_queja_reclamo: "cat",
    nombre_tutela: "cat",
    nombre_ente_control: "cat",
    nombre_sexo: "cat",
    nombre_condicion_especial: "cat",
    departamento: "cat",
    municipio: "cat",
    nombre_departamento: "cat",
    nombre_municipio: "cat",
  },
  geo: { dpto: "departamento", mpio: "municipio" },
  mock: () => ({
    profile: profile as unknown as Profile,
    seed: 505,
    perDay: 6,
    derive(row, ctx) {
      row.radicado = radicado("ENT", ctx.date, 1_600_000 + ctx.index);
      row.codigo_queja_reclamo = `1423${fakeDigits(`m1-${ctx.index}`, 16)}`;
      row.fecha_registro_m1 = ctx.date;
    },
  }),
  normalize: (r) => ({
    ...r,
    pqrd_estado: r.pqrd_estado ? String(r.pqrd_estado) : SIN_CRUCE,
    pqrd_nombre_tipo_solicitud: r.pqrd_nombre_tipo_solicitud ? String(r.pqrd_nombre_tipo_solicitud) : SIN_CRUCE,
    pqrd_semaforo_riesgo: r.pqrd_semaforo_riesgo ? String(r.pqrd_semaforo_riesgo) : SIN_CRUCE,
    nombre_canal: orNoReporta(r.nombre_canal),
    nombre_macro_motivo: orNoReporta(r.nombre_macro_motivo),
    nombre_ente_control: orNoReporta(r.nombre_ente_control),
    nombre_sexo: orNoReporta(r.nombre_sexo),
    nombre_condicion_especial: orNoReporta(r.nombre_condicion_especial),
    nombre_departamento: orNoReporta(r.nombre_departamento),
    nombre_municipio: orNoReporta(r.nombre_municipio),
  }),
};
