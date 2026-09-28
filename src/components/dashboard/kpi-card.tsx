"use client";

import type { ChartData, ChartOptions, ScriptableContext } from "chart.js";
import { FlaskConical, Info, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import { CountUp } from "@/components/ui/count-up";
import { Skeleton } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import { areaGradient, tooltipOptions } from "@/components/widgets/chart-kit";
import type { KpiResult } from "@/dashboards/dto";
import type { KpiDef } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { registerCharts } from "@/lib/charts/register";
import { useChartTheme } from "@/lib/charts/theme";
import { formatRange } from "@/lib/dates";
import { formatDelta, formatValue } from "@/lib/format";

registerCharts();

function Spark({ values, color }: { values: (number | null)[]; color: string }) {
  const theme = useChartTheme();
  const data: ChartData<"line"> = useMemo(
    () => ({
      labels: values.map((_, i) => String(i + 1)),
      datasets: [
        {
          data: values,
          borderColor: color,
          borderWidth: 2,
          fill: true,
          backgroundColor: (ctx: ScriptableContext<"line">) => areaGradient(ctx.chart, color, 0.22),
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.35,
          cubicInterpolationMode: "monotone",
          spanGaps: true,
        },
      ],
    }),
    [values, color],
  );
  const options: ChartOptions<"line"> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 900 },
      scales: { x: { display: false }, y: { display: false, beginAtZero: true } },
      plugins: { legend: { display: false }, tooltip: { ...(tooltipOptions(theme) as object), enabled: false } },
      interaction: { intersect: false, mode: "index" },
      elements: { line: { capBezierPoints: true } },
    }),
    [theme],
  );
  return <Line data={data} options={options} aria-hidden />;
}

export function KpiCard({ def, result, loading, index, prevRange }: { def: KpiDef; result?: KpiResult; loading: boolean; index: number; prevRange?: { prevFrom: string; prevTo: string } }) {
  const theme = useChartTheme();
  const delta = result?.delta ?? null;
  const tone =
    delta === null || Math.abs(delta) < 0.0005 || def.polarity === "neutral"
      ? "neutral"
      : (delta > 0) === (def.polarity === "up-good")
        ? "good"
        : "bad";
  const DeltaIcon = delta === null || Math.abs(delta) < 0.0005 ? Minus : delta > 0 ? TrendingUp : TrendingDown;

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "card group relative flex min-w-0 flex-col overflow-hidden p-4 transition hover:border-primary/30",
        def.hero && "bg-[linear-gradient(160deg,var(--primary-soft)_0%,var(--surface)_55%)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-semibold leading-snug text-text-2">{def.label}</h3>
        <div className="flex shrink-0 items-center gap-1">
          {def.provisional && (
            <Tooltip content="Fórmula provisional: pendiente de validación con negocio." focusable>
              <FlaskConical className="size-3.5 text-warning-ink" />
            </Tooltip>
          )}
          <Tooltip content={<span><strong>¿Cómo se calcula?</strong><br />{def.hint}</span>} focusable>
            <Info className="size-4 text-faint transition group-hover:text-muted" />
          </Tooltip>
        </div>
      </div>

      {loading && !result ? (
        <>
          <Skeleton className="mt-3 h-8 w-28" />
          <Skeleton className="mt-2 h-4 w-20" />
        </>
      ) : (
        <>
          <p className={cn("mt-2 font-bold tracking-tight", def.hero ? "text-[32px] leading-9" : "text-[26px] leading-8")}>
            <CountUp value={result?.value ?? null} format={(n) => formatValue(n, def.format)} />
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
                tone === "good" && "bg-good-soft text-good-ink",
                tone === "bad" && "bg-critical-soft text-critical-ink",
                tone === "neutral" && "bg-surface-3 text-text-2",
              )}
            >
              <DeltaIcon className="size-3.5" />
              {delta === null ? "Sin base" : formatDelta(delta)}
            </span>
            {prevRange && (
              <Tooltip content={`Periodo anterior: ${formatRange(prevRange.prevFrom, prevRange.prevTo)} · ${formatValue(result?.previous ?? null, def.format)}`}>
                <span className="cursor-help text-muted">vs. periodo anterior</span>
              </Tooltip>
            )}
          </div>
        </>
      )}
      <div className="-mx-1 mt-3 h-11">{result && result.spark.length > 1 && <Spark values={result.spark} color={tone === "bad" ? theme.resolve("var(--critical)") : theme.primary} />}</div>
    </motion.article>
  );
}
