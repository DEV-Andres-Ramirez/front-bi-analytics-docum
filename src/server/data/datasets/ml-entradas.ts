import "server-only";

import { canal, estadoSalidaML, orNoReporta } from "../normalizers";
import type { Profile } from "../mock/generator";
import { addBusinessDays, radicado } from "../mock/generator";
import profile from "../mock/profiles/ml_entradas.json";
import type { DatasetDef } from "./types";

/** Estados del término que implican un plazo (los "No Reporta…" no tienen fecha de vencimiento). */
const CON_PLAZO = new Set(["En término", "Fuera de Término", "Vencido"]);
const DAY_MS = 86_400_000;
/** Estados del flujo que cierran el radicado (el sesgo "abierto" de los recientes los evita). */
const CERRADOS = ["Aprobado", "Reclasificación Aprobada", "Cerrado", "Eliminada", "Excluido", "Anulado"];
/** Estados en los que la entrada ya tiene respuesta: no se pueden vencer después. */
const RESPONDIDOS = new Set([...CERRADOS, "Por recibir correspondencia"]);
const dayOf = (ms: number) => Math.floor(ms / DAY_MS);

/**
 * El término debe cuadrar con la fecha máxima (que se muestra como día, así que el plazo corre hasta el
 * final de ese día): con el plazo vigente nada está "Vencido" ni "Fuera de Término" (respondido antes del
 * vencimiento = "En término"); con el plazo ya pasado, una entrada sin respuesta está "Vencido".
 * El perfil trae el término de un corte real, pero la fecha máxima de los registros recientes se deriva
 * del tiempo definido y el sesgo "abierto" los lleva a tuplas "Vencido": sin esto, radicados de hoy
 * aparecían vencidos con la fecha máxima en el futuro.
 */
function terminoCoherente(termino: string, fechaMax: number, estado: string, now: number): string {
  const vigente = dayOf(fechaMax) >= dayOf(now);
  if (vigente && (termino === "Vencido" || termino === "Fuera de Término")) return "En término";
  if (!vigente && termino === "En término" && !RESPONDIDOS.has(estado)) return "Vencido";
  return termino;
}

export const mlEntradas: DatasetDef = {
  id: "ml_entradas",
  views: ["vw_reporte_datastudio_medicina_laboral_entradas"],
  schema: {
    numero_radicado: "text",
    Fecha_de_radicacion: "date",
    fecha_max_respuesta: "date",
    fecha_aprobacion: "date",
    tiempo_por_vencer: "cat",
    canal_radicacion: "cat",
    estado: "cat",
    oficina_solicitud: "cat",
    proceso_asistente: "cat",
    subproceso: "cat",
    formato_tiempo: "cat",
    tiempo_definido: "cat",
    tipo_tramite: "cat",
    compromisos_proximos: "cat",
    tiempo_en_gestion: "num",
    prefijo: "cat",
    medio_envio: "cat",
    estado_salida: "cat",
    con_copia: "cat",
    tipo_solicitud: "cat",
    asignador_responsable: "cat",
    gestionador_responsable: "cat",
    responsable_aprobacion: "cat",
    revisor: "cat",
    radicador: "cat",
    genero_afectado: "cat",
    departamento_remitente: "cat",
    municipio_remitente: "cat",
    departamento_destinatario: "cat",
    municipio_destinatario: "cat",
    radicado_salida: "text",
  },
  geo: { dpto: "departamento_destinatario", mpio: "municipio_destinatario" },
  mock: () => ({
    profile: profile as unknown as Profile,
    seed: 909,
    perDay: 34,
    reweight: {
      tipo_tramite: { "Medicina laboral": 7113, "Comunicaciones ML": 3294 },
      tiempo_por_vencer: {
        "En término": 36.3, "No Reporta": 31.7, "Fuera de Término": 11.6, "No Reporta sin Fecha Vencimiento": 6.1, Vencido: 5,
      },
    },
    overrides: {
      tiempo_en_gestion: {
        "No Reporta": 31.7, "4": 12.3, "3": 11.2, "2": 7.1, "5": 6.5, "8": 6.2, "6": 5.8, "7": 5, "1": 4.6,
        "9": 3, "10": 2.5, "12": 2, "15": 1.2, "20": 0.9,
      },
    },
    openBias: {
      field: "estado",
      closed: CERRADOS,
      days: 18,
      strength: 0.6,
    },
    derive(row, ctx) {
      row.numero_radicado = radicado("ENT", ctx.date, 1_800_000 + ctx.index);
      row.Fecha_de_radicacion = ctx.date;
      const hasSalida = row.estado_salida && !/no reporta/i.test(String(row.estado_salida));
      row.radicado_salida = hasSalida ? radicado("SAL", ctx.date, 1_900_000 + ctx.index) : "";
      // Fecha máxima de respuesta: el perfil la trae como desfase, pero el generador descarta los desfases
      // que caen en el futuro (pensado para eventos como la aprobación). Un plazo sí puede estar en el futuro
      // (los "En término" recientes): se deriva del tiempo definido, en días hábiles o calendario. Determinista
      // (no consume el generador aleatorio), así que el resto de las filas no cambia.
      if (row.fecha_max_respuesta == null && CON_PLAZO.has(String(row.tiempo_por_vencer))) {
        const dias = Number(row.tiempo_definido);
        if (Number.isFinite(dias) && dias > 0) {
          row.fecha_max_respuesta = /calendario/i.test(String(row.formato_tiempo)) ? ctx.date + dias * DAY_MS : addBusinessDays(ctx.date, dias);
        }
      }
      // También determinista: solo corrige el término de las filas cuyo plazo contradice la fecha máxima.
      if (typeof row.fecha_max_respuesta === "number" && CON_PLAZO.has(String(row.tiempo_por_vencer))) {
        row.tiempo_por_vencer = terminoCoherente(String(row.tiempo_por_vencer), row.fecha_max_respuesta, String(row.estado), ctx.now);
      }
    },
  }),
  normalize: (r) => {
    const teg = Number(String(r.tiempo_en_gestion ?? "").match(/^-?\d+/)?.[0]);
    return {
      ...r,
      tiempo_por_vencer: orNoReporta(r.tiempo_por_vencer),
      canal_radicacion: canal(r.canal_radicacion),
      estado: orNoReporta(r.estado),
      proceso_asistente: orNoReporta(r.proceso_asistente),
      subproceso: orNoReporta(r.subproceso),
      formato_tiempo: orNoReporta(r.formato_tiempo),
      tiempo_definido: orNoReporta(r.tiempo_definido),
      tiempo_en_gestion: Number.isFinite(teg) ? teg : null,
      prefijo: orNoReporta(r.prefijo),
      medio_envio: orNoReporta(r.medio_envio),
      estado_salida: estadoSalidaML(r.estado_salida),
      tipo_solicitud: orNoReporta(r.tipo_solicitud),
      asignador_responsable: orNoReporta(r.asignador_responsable),
      gestionador_responsable: orNoReporta(r.gestionador_responsable),
      responsable_aprobacion: orNoReporta(r.responsable_aprobacion),
      revisor: orNoReporta(r.revisor),
      radicador: orNoReporta(r.radicador),
      genero_afectado: orNoReporta(r.genero_afectado),
      departamento_remitente: orNoReporta(r.departamento_remitente),
      municipio_remitente: orNoReporta(r.municipio_remitente),
      departamento_destinatario: orNoReporta(r.departamento_destinatario),
      municipio_destinatario: orNoReporta(r.municipio_destinatario),
    };
  },
};
