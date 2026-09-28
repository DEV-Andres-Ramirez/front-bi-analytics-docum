"use client";

import { useCallback, useSyncExternalStore } from "react";
import { applyTheme, readDomTheme, type Theme } from "@/lib/theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

/** Tema actual sincronizado con el atributo data-theme de <html>. */
export function useTheme() {
  const theme = useSyncExternalStore<Theme>(subscribe, readDomTheme, () => "light");
  const setTheme = useCallback((t: Theme) => applyTheme(t), []);
  const toggle = useCallback(() => applyTheme(readDomTheme() === "dark" ? "light" : "dark"), []);
  return { theme, setTheme, toggle };
}
