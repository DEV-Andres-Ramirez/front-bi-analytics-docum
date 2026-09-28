import "server-only";

import { canal, orNoReporta, tiempoPorVencer } from "../normalizers";
import type { Profile } from "../mock/generator";
import { radicado } from "../mock/generator";
import { fakeDigits, fakeObservation } from "../mock/fake";
import profile from "../mock/profiles/smart_m3.json";
import type { DatasetDef } from "./types";

export const smartM3: DatasetDef = {
  id: "smart_m3",
  views: ["vw_reporte_datastudio_smart_momento3"],
  schema: {
    radicado: "text",
    codigo_queja_reclamo: "text",
    fecha_registro_m3: "date",
    fecha_aprobacion: "date",
    pqrd_estado: "cat",
    pqrd_tiempo_por_vencer: "cat",
    pqrd_canal_radicacion: "cat",
    pqrd_oficina_responsable: "cat",
    pqrd_tipologia: "cat",
    pqrd_nombre_tipo_solicitud: "cat",
    pqrd_semaforo_riesgo: "cat",
    pqrd_rango_ciclo: "cat",
    pqrd_resultado_favorabilidad: "cat",
    Alerta3: "cat",
    Aux_Categoria: "cat",
    momento: "cat",
    tramite_radicacion: "cat",
    nombre_canal: "cat",
    nombre_producto: "cat",
    nombre_motivo: "cat",
    nombre_estado_queja_reclamo: "cat",
    nombre_favorabilidad: "cat",
    nombre_sexo: "cat",
    nombre_condicion_especial: "cat",
    nombre_departamento: "cat",
    nombre_municipio: "cat",
    observaciones: "text",
  },
  geo: { dpto: "nombre_departamento", mpio: "nombre_municipio" },
  mock: () => ({
    profile: profile as unknown as Profile,
    seed: 707,
    perDay: 16,
    reweight: {
      Alerta3: { "1": 2, "": 98 },
      Aux_Categoria: { "A tiempo": 79, Preventiva: 7.4, "": 7.3, "Por vencer": 4.7, Vencido: 1.7 },
    },
    openBias: { field: "momento", closed: ["CIERRE"], days: 25, strength: 0.7 },
    derive(row, ctx) {
      row.radicado = radicado("ENT", ctx.date, 1_700_000 + ctx.index);
      row.codigo_queja_reclamo = `1423${fakeDigits(`m3-${ctx.index}`, 16)}`;
      row.fecha_registro_m3 = ctx.date;
      row.observaciones = fakeObservation(`m3-${ctx.index}`);
      if (row.momento === "GESTIÓN") row.fecha_aprobacion = null;
    },
  }),
  normalize: (r) => ({
    ...r,
    pqrd_estado: orNoReporta(r.pqrd_estado),
    pqrd_tiempo_por_vencer: tiempoPorVencer(r.pqrd_tiempo_por_vencer),
    pqrd_canal_radicacion: canal(r.pqrd_canal_radicacion),
    pqrd_oficina_responsable: orNoReporta(r.pqrd_oficina_responsable),
    pqrd_tipologia: orNoReporta(r.pqrd_tipologia),
    pqrd_nombre_tipo_solicitud: orNoReporta(r.pqrd_nombre_tipo_solicitud),
    pqrd_semaforo_riesgo: orNoReporta(r.pqrd_semaforo_riesgo),
    pqrd_rango_ciclo: orNoReporta(r.pqrd_rango_ciclo),
    pqrd_resultado_favorabilidad: orNoReporta(r.pqrd_resultado_favorabilidad),
    Alerta3: String(r.Alerta3) === "1" ? "Sí" : "No",
    Aux_Categoria: r.Aux_Categoria ? String(r.Aux_Categoria) : "Sin categoría",
    nombre_canal: orNoReporta(r.nombre_canal),
    nombre_motivo: orNoReporta(r.nombre_motivo),
    nombre_producto: orNoReporta(r.nombre_producto),
    nombre_favorabilidad: orNoReporta(r.nombre_favorabilidad),
    nombre_sexo: orNoReporta(r.nombre_sexo),
    nombre_condicion_especial: orNoReporta(r.nombre_condicion_especial),
  }),
};
