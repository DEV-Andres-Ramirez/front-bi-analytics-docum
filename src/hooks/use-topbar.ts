"use client";

import { useSyncExternalStore } from "react";

/**
 * Estado compartido entre DashboardView (que lo publica) y el Topbar (que lo pinta):
 * secciones del tablero para SectionNav, visibilidad del H1 (crossfade del topbar),
 * hora de los datos ("Actualizado hace N min"), origen de los datos (badge "Datos de prueba"),
 * periodo activo y alto sticky real (topbar + FilterBar medida).
 *
 * Es un store externo mínimo (useSyncExternalStore): quien publica llama setTopbar()
 * desde efectos o callbacks, nunca durante el render.
 */
export interface TopbarSection {
  id: string;
  label: string;
}

export interface TopbarState {
  /** Tablero que publicó el estado (null en Home y demás rutas). */
  slug: string | null;
  sections: TopbarSection[];
  /** true cuando el H1 del tablero quedó bajo la zona sticky. */
  headerHidden: boolean;
  /** dataUpdatedAt de react-query (ms). 0 = sin dato. */
  updatedAt: number;
  source: "mock" | "db" | null;
  /** Periodo activo ("1 – 28 sept 2026"). El topbar no lo repite: el rango vive en la FilterBar. */
  period: string | null;
  /** Alto de la zona sticky (topbar + FilterBar) en px. */
  stickyH: number;
}

export const TOPBAR_H = 64;

const INITIAL: TopbarState = {
  slug: null,
  sections: [],
  headerHidden: false,
  updatedAt: 0,
  source: null,
  period: null,
  stickyH: TOPBAR_H,
};

let state: TopbarState = INITIAL;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function emit() {
  listeners.forEach((l) => l());
}

/** Aplica un parche (sin notificar si nada cambió). */
export function setTopbar(patch: Partial<TopbarState>) {
  const keys = Object.keys(patch) as (keyof TopbarState)[];
  if (keys.every((k) => Object.is(state[k], patch[k]))) return;
  state = { ...state, ...patch };
  emit();
}

/** Limpia el estado del tablero al desmontarlo (conserva el alto sticky, que maneja la FilterBar). */
export function clearTopbar(slug: string) {
  if (state.slug !== slug) return;
  state = { ...INITIAL, stickyH: state.stickyH };
  emit();
}

/** Lectura no reactiva (callbacks de scroll, IntersectionObserver). */
export function getTopbarState(): TopbarState {
  return state;
}

/** Suscripción con selector: devuelve primitivos o referencias estables. */
export function useTopbar<T>(select: (s: TopbarState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(state),
    () => select(INITIAL),
  );
}
