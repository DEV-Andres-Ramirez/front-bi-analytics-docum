import type { SemanticPalette } from "@/dashboards/types";

/**
 * Colores semánticos (estado): siempre acompañados de etiqueta en leyenda/tooltip.
 * Se referencian por variable CSS para respetar el tema.
 */
const NEUTRAL = "var(--neutral-mark)";

const MAPS: Record<SemanticPalette, Record<string, string>> = {
  semaforo: {
    "1. Cerrado a Tiempo": "var(--good)",
    "2. Abierto En Término": "var(--info)",
    "3. Abierto Próximo a Vencer": "var(--warning)",
    "4. Cerrado Vencido": "var(--serious)",
    "5. Abierto Vencido": "var(--critical)",
  },
  sla: {
    "A tiempo": "var(--good)",
    Preventiva: "var(--warning)",
    "Por vencer": "var(--serious)",
    Vencido: "var(--critical)",
  },
  momento: {
    "GESTIÓN": "var(--chart-1)",
    CIERRE: "var(--chart-2)",
  },
  cumplimiento: {
    "En término": "var(--good)",
    "Fuera de término": "var(--critical)",
    "En trámite": "var(--info)",
  },
  "estado-queja": {
    Abierta: "var(--chart-1)",
    Cerrada: "var(--chart-2)",
    Recibida: "var(--chart-3)",
  },
  "si-no": {
    Sí: "var(--chart-1)",
    No: NEUTRAL,
  },
};

export function semanticVar(palette: SemanticPalette, label: string): string | null {
  return MAPS[palette][label] ?? null;
}

export const NEUTRAL_LABELS = new Set(["Otros", "No reporta", "Sin categoría", "Sin cruce con PQRD", "6. Sin Clasificar", "Sin canal"]);
