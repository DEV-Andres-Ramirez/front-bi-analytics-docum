import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function EmptyState({ title, description, icon, className }: { title: string; description?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex h-full min-h-40 flex-col items-center justify-center gap-2 px-6 py-8 text-center", className)}>
      <span className="grid size-11 place-items-center rounded-2xl bg-surface-3 text-muted">{icon ?? <Inbox className="size-5" />}</span>
      <p className="text-sm font-semibold text-text-2">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
    </div>
  );
}

type Tone = "neutral" | "primary" | "good" | "warning" | "critical" | "info";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-3 text-text-2",
  primary: "bg-primary-soft-2 text-primary-strong",
  good: "bg-good-soft text-good-ink",
  warning: "bg-warning-soft text-warning-ink",
  critical: "bg-critical-soft text-critical-ink",
  info: "bg-info-soft text-info-ink",
};

export function Badge({ children, tone = "neutral", className, icon }: { children: ReactNode; tone?: Tone; className?: string; icon?: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", TONES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "sm",
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-border bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full font-semibold transition",
            size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-xs",
            value === o.value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
