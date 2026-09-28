"use client";

import { motion } from "motion/react";
import { useState } from "react";
import type { SectionDef } from "@/dashboards/types";
import { cn } from "@/lib/cn";
import { WidgetBody, WidgetCard } from "./widget-card";

function TabsSection({ section }: { section: SectionDef }) {
  const [active, setActive] = useState(section.widgets[0]?.id);
  const current = section.widgets.find((w) => w.id === active) ?? section.widgets[0];
  return (
    <WidgetCard
      widget={{ ...current, size: "full" }}
      headerExtra={
        <div role="tablist" aria-label={section.title} className="hidden shrink-0 rounded-full border border-border bg-surface-2 p-0.5 lg:inline-flex">
          {section.widgets.map((w) => (
            <button
              key={w.id}
              type="button"
              role="tab"
              aria-selected={w.id === current.id}
              onClick={() => setActive(w.id)}
              className={cn("relative rounded-full px-3 py-1.5 text-xs font-semibold transition", w.id === current.id ? "text-text" : "text-muted hover:text-text")}
            >
              {w.id === current.id && <motion.span layoutId={`tab-${section.id}`} className="absolute inset-0 rounded-full bg-surface shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              <span className="relative">{w.title}</span>
            </button>
          ))}
        </div>
      }
      key={current.id}
    />
  );
}

/** Pestañas móviles (el selector del encabezado solo cabe en escritorio). */
function MobileTabs({ section, onPick, active }: { section: SectionDef; onPick: (id: string) => void; active: string }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
      {section.widgets.map((w) => (
        <button key={w.id} type="button" onClick={() => onPick(w.id)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1", w.id === active ? "bg-primary text-white ring-primary" : "bg-surface text-text-2 ring-border")}>
          {w.title}
        </button>
      ))}
    </div>
  );
}

export function DashboardSection({ section, index }: { section: SectionDef; index: number }) {
  const [mobileActive, setMobileActive] = useState(section.widgets[0]?.id ?? "");
  return (
    <section aria-labelledby={`s-${section.id}`} className="scroll-mt-40">
      {section.title && (
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, delay: 0.02 * index }}
          className="mb-4 flex flex-col gap-1"
        >
          <h2 id={`s-${section.id}`} className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
            <span className="h-5 w-1.5 rounded-full bg-primary" aria-hidden />
            {section.title}
          </h2>
          {section.description && <p className="max-w-3xl pl-4 text-sm text-muted">{section.description}</p>}
        </motion.header>
      )}
      {section.tabs ? (
        <div className="space-y-3">
          <MobileTabs section={section} active={mobileActive} onPick={setMobileActive} />
          <div className="lg:hidden">
            {section.widgets
              .filter((w) => w.id === mobileActive)
              .map((w) => (
                <article key={w.id} className="card p-4">
                  <h3 className="mb-1 text-[15px] font-bold">{w.title}</h3>
                  {w.subtitle && <p className="mb-3 text-xs text-muted">{w.subtitle}</p>}
                  <WidgetBody widget={w} height={w.height ?? 380} />
                </article>
              ))}
          </div>
          <div className="hidden lg:block">
            <TabsSection section={section} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
          {section.widgets.map((w) => (
            <WidgetCard key={w.id} widget={w} />
          ))}
        </div>
      )}
    </section>
  );
}
