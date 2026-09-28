import { AlarmClock, AlertOctagon, AlertTriangle, CheckCircle2, CircleDashed, Clock, type LucideIcon } from "lucide-react";
import type { StatusTone } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { TONE_VARS } from "@/lib/charts/semantic";

/** Ícono por tono de estado: el color nunca va solo (warning ↔ serious están cerca). */
export const TONE_ICON: Record<StatusTone, LucideIcon> = {
  good: CheckCircle2,
  info: Clock,
  warning: AlertTriangle,
  serious: AlarmClock,
  critical: AlertOctagon,
  neutral: CircleDashed,
};

export const TONE_LABEL: Record<StatusTone, string> = {
  good: "favorable",
  info: "en curso",
  warning: "advertencia",
  serious: "grave",
  critical: "crítico",
  neutral: "sin clasificar",
};

export function StatusIcon({ tone, className }: { tone: StatusTone; className?: string }) {
  const Icon = TONE_ICON[tone];
  return <Icon className={cn("size-3.5 shrink-0", className)} style={{ color: TONE_VARS[tone].ink }} aria-hidden strokeWidth={2.25} />;
}
