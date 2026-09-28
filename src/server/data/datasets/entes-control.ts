import "server-only";

import { entesAuxCategoria, franjaHoraria, orNoReporta, tipoHorario } from "../normalizers";
import type { Profile } from "../mock/generator";
import { radicado } from "../mock/generator";
import profile from "../mock/profiles/entes_control.json";
import type { DatasetDef } from "./types";

export const entesControl: DatasetDef = {
  id: "entes_control",
  views: ["vw_reporte_datastudio_entes_control"],
  schema: {
    Numero_de_Radicado: "text",
    Estado: "cat",
    Tipo_de_Requerimiento: "cat",
    Canal_de_Radicacion: "cat",
    Aux_Categoria: "cat",
    ente_control: "cat",
    marca_tramite: "cat",
    Fecha_de_Radicacion: "date",
    Fecha_Maxima_de_Respuesta: "date",
    Fecha_de_Aprobacion: "date",
    Oficina_responsable_de_respuesta: "cat",
    Asignador_de_responsable: "cat",
    Gestionador_Responsable: "cat",
    Responsable_de_Aprobacion: "cat",
    Responsable_de_Revision: "cat",
    Tiempo_por_Vencer: "cat",
    num_dias_asignacion_gestionador: "num",
    num_dias_aprobacion: "num",
    dias_oficina_a_gestionador: "num",
    dias_gestion_a_aprobacion: "num",
    Sexo_afectado: "cat",
    Departamento_Remitente: "cat",
    Municipio_Remitente: "cat",
    tipo_horario_radicacion: "cat",
    franja_horaria: "cat",
    cumplimiento_sla: "cat",
    semaforo_riesgo: "cat",
    rango_ciclo: "cat",
  },
  geo: { dpto: "Departamento_Remitente", mpio: "Municipio_Remitente" },
  mock: () => ({
    profile: profile as unknown as Profile,
    seed: 404,
    perDay: 11,
    start: "2025-06-01",
    openBias: { field: "Estado", closed: ["Aprobado", "Reclasificación Aprobada"], days: 14, strength: 0.7 },
    derive(row, ctx) {
      row.Numero_de_Radicado = radicado("ENT", ctx.date, 1_400_000 + ctx.index);
      row.Fecha_de_Radicacion = ctx.date;
    },
  }),
  normalize: (r) => {
    const date = Number(r.Fecha_de_Radicacion);
    return {
      ...r,
      Estado: orNoReporta(r.Estado),
      Tipo_de_Requerimiento: orNoReporta(r.Tipo_de_Requerimiento),
      Aux_Categoria: entesAuxCategoria(r.Aux_Categoria),
      Tiempo_por_Vencer: orNoReporta(r.Tiempo_por_Vencer),
      Oficina_responsable_de_respuesta: orNoReporta(r.Oficina_responsable_de_respuesta),
      Asignador_de_responsable: orNoReporta(r.Asignador_de_responsable),
      Gestionador_Responsable: orNoReporta(r.Gestionador_Responsable),
      Responsable_de_Aprobacion: orNoReporta(r.Responsable_de_Aprobacion),
      Responsable_de_Revision: orNoReporta(r.Responsable_de_Revision),
      Sexo_afectado: orNoReporta(r.Sexo_afectado),
      tipo_horario_radicacion: tipoHorario(date),
      franja_horaria: franjaHoraria(new Date(date).getUTCHours()),
    };
  },
};
