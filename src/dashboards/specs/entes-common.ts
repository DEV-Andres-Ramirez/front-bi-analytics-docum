import type { FilterDef, KpiDef } from "../types";
import { avg, count, is, share } from "./helpers";

export const ENTES_FILTERS: FilterDef[] = [
  { field: "ente_control", label: "Ente de control", kind: "multi", primary: true },
  { field: "Tipo_de_Requerimiento", label: "Tipo de requerimiento", kind: "multi", primary: true },
  { field: "Canal_de_Radicacion", label: "Canal de radicación", kind: "multi", primary: true },
  { field: "Estado", label: "Estado", kind: "multi", primary: true },
  { field: "Oficina_responsable_de_respuesta", label: "Oficina responsable", kind: "multi" },
  { field: "semaforo_riesgo", label: "Semáforo de riesgo", kind: "multi" },
  { field: "Tiempo_por_Vencer", label: "Tiempo por vencer", kind: "multi" },
  { field: "Aux_Categoria", label: "Categoría de vencimiento", kind: "multi" },
  { field: "Asignador_de_responsable", label: "Asignador", kind: "multi" },
  { field: "Gestionador_Responsable", label: "Gestionador", kind: "multi" },
  { field: "Responsable_de_Revision", label: "Revisor", kind: "multi" },
  { field: "Responsable_de_Aprobacion", label: "Aprobador", kind: "multi" },
  { field: "Fecha_de_Aprobacion", label: "Fecha de aprobación", kind: "date" },
  { field: "Numero_de_Radicado", label: "Número de radicado", kind: "text" },
];

export const ENTES_KPIS: KpiDef[] = [
  { id: "radicados", label: "Radicados", measure: count(), format: "int", polarity: "neutral", hero: true, hint: "Requerimientos de entes de control radicados en el periodo." },
  { id: "aprobados", label: "% Aprobados", measure: share(is("Estado", "Aprobado", "Reclasificación Aprobada")), format: "pct", polarity: "up-good", hint: "Radicados en estado Aprobado o Reclasificación Aprobada sobre el total." },
  { id: "quejas", label: "% Quejas y reclamos", measure: share(is("Tipo_de_Requerimiento", "Queja o reclamo")), format: "pct", polarity: "up-bad", hint: "Requerimientos de tipo \"Queja o reclamo\" sobre el total." },
  { id: "asignacion", label: "Asignación (promedio días)", measure: avg("num_dias_asignacion_gestionador"), format: "days", polarity: "up-bad", hint: "Promedio de días hasta asignar el gestionador." },
  { id: "fuera-horario", label: "% Radicado fuera de horario", measure: share(is("tipo_horario_radicacion", "Fuera de horario", "Fin de semana")), format: "pct", polarity: "up-bad", hint: "Radicados fuera de la franja laboral (7:00–17:59) o en fin de semana." },
  { id: "reabiertos", label: "% Reabiertos", measure: share(is("marca_tramite", "Reabierto")), format: "pct", polarity: "up-bad", hint: "Trámites marcados como reabiertos (el detalle del trámite contiene \"REABIERT\")." },
];

export const ENTES_TABLE_COLUMNS = [
  { field: "Numero_de_Radicado", label: "Radicado", format: "mono" as const },
  { field: "Fecha_de_Radicacion", label: "Radicado el", format: "datetime" as const },
  { field: "Fecha_Maxima_de_Respuesta", label: "Fecha máxima", format: "date" as const },
  { field: "ente_control", label: "Ente de control" },
  { field: "Canal_de_Radicacion", label: "Canal" },
  { field: "Tipo_de_Requerimiento", label: "Tipo" },
  { field: "Estado", label: "Estado", format: "badge" as const },
  { field: "Oficina_responsable_de_respuesta", label: "Oficina responsable" },
  { field: "Gestionador_Responsable", label: "Gestionador" },
  { field: "Tiempo_por_Vencer", label: "Tiempo por vencer" },
  { field: "Aux_Categoria", label: "Categoría vencimiento", format: "badge" as const, semantic: "sla" as const },
  { field: "semaforo_riesgo", label: "Semáforo", format: "badge" as const, semantic: "semaforo" as const, visible: false },
  { field: "rango_ciclo", label: "Rango ciclo", visible: false },
];
