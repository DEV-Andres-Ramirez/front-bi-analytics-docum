"use client";

import { useCallback, useState } from "react";

/**
 * Mide un elemento con ResizeObserver. Se usa como ref callback (compatible con el
 * React Compiler: no lee refs en render ni hace setState síncrono en efectos).
 */
export function useElementSize<T extends HTMLElement = HTMLDivElement>() {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const ref = useCallback((el: T | null) => {
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setSize((s) => (s && Math.abs(s.width - r.width) < 1 && Math.abs(s.height - r.height) < 1 ? s : { width: r.width, height: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width: size?.width ?? 0, height: size?.height ?? 0, measured: size !== null };
}
