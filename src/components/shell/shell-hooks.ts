"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { DashboardMeta, ModuleMeta } from "@/config/dashboards";
import type { CatalogResponse } from "@/dashboards/dto";

/**
 * Catálogo del mes (misma clave que el Home: ["catalogo"], staleTime 5 min).
 * enabled=false solo se suscribe a la caché (no dispara la consulta).
 */
export function useCatalog(enabled: boolean) {
  return useQuery({
    queryKey: ["catalogo"],
    queryFn: async (): Promise<CatalogResponse> => {
      const res = await fetch("/api/catalogo", { cache: "no-store" });
      if (!res.ok) throw new Error("No fue posible cargar el catálogo");
      return res.json();
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

const noopSubscribe = () => () => {};

function detectMac(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? nav.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** "⌘K" en macOS/iOS, "Ctrl K" en el resto (en el servidor, "Ctrl K"). */
export function useShortcutLabel(): string {
  const mac = useSyncExternalStore(noopSubscribe, detectMac, () => false);
  return mac ? "⌘K" : "Ctrl K";
}

/** Reloj que avanza cada `every` ms (para "hace N min"). */
export function useNow(every = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(t);
  }, [every]);
  return now;
}

/** "Actualizado ahora" · "Actualizado hace 5 min" · "Actualizado hace 2 h". */
export function updatedLabel(updatedAt: number, now: number): string {
  const min = Math.max(0, Math.floor((now - updatedAt) / 60_000));
  if (min < 1) return "Actualizado ahora";
  if (min < 60) return `Actualizado hace ${min} min`;
  const h = Math.floor(min / 60);
  return `Actualizado hace ${h} h`;
}

/** Hora de pared (es-CO) para tooltips. */
export function clockLabel(ms: number): string {
  return new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", hour12: true }).format(ms);
}

/** Rótulo sin tildes, mayúsculas ni espacios extra, para comparar ("Tutelas" = "TUTELAS"). */
const bareLabel = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * El módulo se llama igual que su único tablero (Tutelas): la ruta "Tutelas / Tutelas" y el eyebrow
 * "TUTELAS" sobre el H1 "Tutelas" repetirían el nombre, así que el topbar deja un solo crumb y el
 * encabezado cambia el eyebrow por un rótulo de contexto.
 */
export function moduleEchoesDashboard(mod: Pick<ModuleMeta, "label" | "short">, meta: Pick<DashboardMeta, "short" | "heading">): boolean {
  return bareLabel(mod.short) === bareLabel(meta.short) || bareLabel(mod.label) === bareLabel(meta.heading);
}
