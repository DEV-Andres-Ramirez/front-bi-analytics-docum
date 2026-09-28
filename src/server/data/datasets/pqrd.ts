import "server-only";

import { canal, diaSemana, franjaHoraria, orNoReporta, sentence, tipoHorario } from "../normalizers";
import type { Profile } from "../mock/generator";
import { radicado } from "../mock/generator";
import profile from "../mock/profiles/pqrd.json";
import type { DatasetDef } from "./types";

export const pqrd: DatasetDef = {
  id: "pqrd",
  views: ["vw_reporte_datastudio_pqrd", "vw_reporte_datastudio_pqrd_eficiencia"],
  schema: {
    numero_de_radicado: "text",
    estado: "cat",
    tipologia_de_pqrd: "cat",
    detalle_del_tramite: "cat",
    canal_de_radicacion: "cat",
    acceso_informacion_publica: "cat",
    producto: "cat",
    nombre_tipo_solicitud: "cat",
    fecha_de_radicado: "date",
    fecha_maxima_de_respuesta: "date",
    fecha_de_cierre: "date",
    fecha_aprobacion: "date",
    oficina_responsable_de_respuesta: "cat",
    oficina_responsable_agrupada: "cat",
    gestionador_responsable: "cat",
    asignador_de_responsable: "cat",
    responsable_aprobacion: "cat",
    tiempo_por_vencer: "cat",
    num_dias_asignacion_gestionador: "num",
    num_dias_revision: "num",
    num_dias_aprobacion: "num",
    num_dias_gestion_total: "num",
    Aux_Categoria: "cat",
    cumplimiento_sla: "cat",
    dias_ciclo_total: "num",
    semaforo_riesgo: "cat",
    resultado_favorabilidad: "cat",
    favorabilidad_gestionador: "cat",
    rango_ciclo: "cat",
    tipo_horario_radicacion: "cat",
    franja_horaria: "cat",
    dia_semana_radicado: "cat",
    sexo: "cat",
    condicion_especial: "cat",
    departamento_del_remitente: "cat",
    municipio_del_remitente: "cat",
    observaciones: "text",
  },
  geo: { dpto: "departamento_del_remitente", mpio: "municipio_del_remitente" },
  mock: () => ({
    profile: profile as unknown as Profile,
    seed: 303,
    perDay: 42,
    openBias: { field: "estado", closed: ["Aprobado"], days: 18, strength: 0.8 },
    derive(row, ctx) {
      row.numero_de_radicado = radicado("ENT", ctx.date, 1_200_000 + ctx.index);
      row.fecha_de_radicado = ctx.date;
    },
  }),
  normalize: (r) => {
    const date = Number(r.fecha_de_radicado);
    return {
      ...r,
      estado: orNoReporta(r.estado),
      canal_de_radicacion: canal(r.canal_de_radicacion),
      producto: sentence(r.producto),
      favorabilidad_gestionador: sentence(r.favorabilidad_gestionador),
      nombre_tipo_solicitud: orNoReporta(r.nombre_tipo_solicitud),
      Aux_Categoria: r.Aux_Categoria ? String(r.Aux_Categoria) : "Sin categoría",
      tiempo_por_vencer: orNoReporta(r.tiempo_por_vencer),
      rango_ciclo: orNoReporta(r.rango_ciclo),
      tipo_horario_radicacion: tipoHorario(date),
      franja_horaria: franjaHoraria(new Date(date).getUTCHours()),
      dia_semana_radicado: diaSemana(date),
      sexo: orNoReporta(r.sexo),
      condicion_especial: orNoReporta(r.condicion_especial),
      gestionador_responsable: orNoReporta(r.gestionador_responsable),
      asignador_de_responsable: orNoReporta(r.asignador_de_responsable),
      responsable_aprobacion: orNoReporta(r.responsable_aprobacion),
    };
  },
};
