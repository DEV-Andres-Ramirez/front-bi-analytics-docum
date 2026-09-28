import type { ColumnDef, FilterDef, KpiDef } from "../types";
import { avg, count, is, SEMAFORO_ORDER, share } from "./helpers";

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

/**
 * KPIs compartidos por Entes de control y Eficiencia operativa (mismas definiciones).
 * `hero` marca el héroe de Entes; Eficiencia lo reasigna a "asignacion" en su propio spec.
 */
export const ENTES_KPIS: KpiDef[] = [
  { id: "radicados", label: "Radicados", short: "Radicados", measure: count(), format: "int", polarity: "neutral", hero: true, hint: "Requerimientos de entes de control radicados en el periodo." },
  { id: "aprobados", label: "% Aprobados", short: "% Aprobados", measure: share(is("Estado", "Aprobado", "Reclasificación Aprobada")), format: "pct", polarity: "up-good", hint: "Radicados en estado Aprobado o Reclasificación Aprobada sobre el total." },
  { id: "quejas", label: "% Quejas y reclamos", short: "% Quejas", measure: share(is("Tipo_de_Requerimiento", "Queja o reclamo")), format: "pct", polarity: "up-bad", hint: "Requerimientos de tipo “Queja o reclamo” sobre el total." },
  { id: "asignacion", label: "Asignación (promedio días)", short: "Asignación", measure: avg("num_dias_asignacion_gestionador"), format: "days", polarity: "up-bad", hint: "Promedio de días hasta asignar el gestionador." },
  { id: "fuera-horario", label: "% Radicado fuera de horario", short: "% Fuera horario", measure: share(is("tipo_horario_radicacion", "Fuera de horario", "Fin de semana")), format: "pct", polarity: "up-bad", hint: "Radicados fuera de la franja laboral (7:00–17:59) o en fin de semana." },
  { id: "reabiertos", label: "% Reabiertos", short: "% Reabiertos", measure: share(is("marca_tramite", "Reabierto")), format: "pct", polarity: "up-bad", hint: "Trámites marcados como reabiertos (el detalle del trámite contiene “REABIERT”)." },
];

/**
 * Orden base compartido con PQRD: identificación → estado y riesgo (badges a la vista, antes del scroll
 * horizontal) → tiempo → clasificación → responsables → fecha máxima.
 */
export const ENTES_TABLE_COLUMNS: ColumnDef[] = [
  { field: "Numero_de_Radicado", label: "Radicado", format: "mono" },
  { field: "Fecha_de_Radicacion", label: "Radicado el", format: "datetime" },
  { field: "Estado", label: "Estado", format: "badge", semantic: "flujo" },
  { field: "Aux_Categoria", label: "Categoría vencimiento", format: "badge", semantic: "sla" },
  { field: "Tiempo_por_Vencer", label: "Tiempo por vencer" },
  { field: "ente_control", label: "Ente de control", labelKind: "ente" },
  { field: "Tipo_de_Requerimiento", label: "Tipo" },
  { field: "Canal_de_Radicacion", label: "Canal" },
  { field: "Oficina_responsable_de_respuesta", label: "Oficina responsable", labelKind: "oficina" },
  { field: "Gestionador_Responsable", label: "Gestionador", labelKind: "persona" },
  { field: "Fecha_Maxima_de_Respuesta", label: "Fecha máxima", format: "date" },
  { field: "semaforo_riesgo", label: "Semáforo", format: "badge", semantic: "semaforo", visible: false },
  { field: "rango_ciclo", label: "Rango ciclo", visible: false },
];

/** Notas de calidad de la vista de entes (DataNotesPopover). */
export const ENTES_NOTES: string[] = ["La vista original no mapea “En término” a “A tiempo” en la categoría de vencimiento; aquí se corrige al mostrar."];

/**
 * Semáforo agrupado para StatusStrip (Abiertos | Cerrados). Lo comparten los hermanos PQRD y Entes.
 * "6. Sin Clasificar" es neutral: se fusiona en el tile "Sin clasificar".
 */
export const SEMAFORO_GROUPS: Record<string, string[]> = {
  Abiertos: [SEMAFORO_ORDER[1], SEMAFORO_ORDER[2], SEMAFORO_ORDER[4]],
  Cerrados: [SEMAFORO_ORDER[0], SEMAFORO_ORDER[3]],
};
