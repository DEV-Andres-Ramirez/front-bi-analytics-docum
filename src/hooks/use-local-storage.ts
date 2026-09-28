"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

const snapshots = new Map<string, { raw: string | null; value: unknown }>();

/** Preferencias del usuario en localStorage (tolerante a modo privado / storage bloqueado). */
export function useLocalStorage<T>(key: string, fallback: T) {
  const subscribe = useCallback((cb: () => void) => {
    listeners.add(cb);
    const onStorage = (e: StorageEvent) => e.key === key && cb();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(cb);
      window.removeEventListener("storage", onStorage);
    };
  }, [key]);

  const getSnapshot = useCallback(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      raw = null;
    }
    const cached = snapshots.get(key);
    if (cached && cached.raw === raw) return cached.value as T;
    const value = read(key, fallback);
    snapshots.set(key, { raw, value });
    return value;
  }, [key, fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, () => fallback);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const current = read(key, fallback);
      const v = typeof next === "function" ? (next as (p: T) => T)(current) : next;
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* storage no disponible: se ignora */
      }
      emit();
    },
    [key, fallback],
  );

  return [value, setValue] as const;
}
