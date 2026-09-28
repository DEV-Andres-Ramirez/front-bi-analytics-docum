"use client";

import { useCallback, useState, type UIEvent } from "react";

/**
 * Bordes con contenido oculto de un contenedor con scroll (tablas de tier "auto").
 * Alimenta las sombras de la primera columna, los totales y la cabecera fijos.
 * Compatible con el React Compiler: se mide en un ref callback (ResizeObserver) y en onScroll.
 */
export interface ScrollEdges {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

const NONE: ScrollEdges = { left: false, right: false, top: false, bottom: false };

function readEdges(el: HTMLElement): ScrollEdges {
  return {
    left: el.scrollLeft > 1,
    right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    top: el.scrollTop > 1,
    bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
  };
}

const sameEdges = (a: ScrollEdges, b: ScrollEdges) => a.left === b.left && a.right === b.right && a.top === b.top && a.bottom === b.bottom;

export function useScrollEdges<T extends HTMLElement = HTMLDivElement>() {
  const [edges, setEdges] = useState<ScrollEdges>(NONE);
  const update = useCallback((el: HTMLElement) => {
    const next = readEdges(el);
    setEdges((s) => (sameEdges(s, next) ? s : next));
  }, []);
  const ref = useCallback(
    (el: T | null) => {
      if (!el) return;
      const ro = new ResizeObserver(() => update(el));
      ro.observe(el);
      for (const child of Array.from(el.children)) ro.observe(child);
      return () => ro.disconnect();
    },
    [update],
  );
  const onScroll = useCallback((e: UIEvent<HTMLElement>) => update(e.currentTarget), [update]);
  /** Atributos para el contenedor (grupo `sc`): data-l / data-r / data-t / data-b = "1" si hay contenido oculto. */
  const dataAttrs = {
    "data-l": edges.left ? "1" : undefined,
    "data-r": edges.right ? "1" : undefined,
    "data-t": edges.top ? "1" : undefined,
    "data-b": edges.bottom ? "1" : undefined,
  };
  return { ref, onScroll, edges, dataAttrs };
}

/**
 * Sombras de borde para las partes fijas (sticky) de una tabla con scroll, activadas por el grupo
 * `sc` (data-l/r/t/b del contenedor). Van en un pseudo-elemento que cubre TODO el ancho o alto de
 * la celda, así que celdas contiguas forman una banda continua. Una box-shadow con spread negativo
 * por celda deja "píldoras" separadas y huecos por donde asoma la fila de abajo.
 * Requisitos: la celda debe estar posicionada (sticky o relative) y no usar el mismo pseudo para
 * otra cosa. Cabecera y pie usan ::before; primera columna y totales usan ::after. El contenedor con
 * scroll lleva `isolate`: los z-index de las celdas fijas no compiten con la barra de filtros (z-30).
 */
/** Borde inferior de la cabecera fija (hay filas ocultas arriba). */
export const EDGE_T =
  "before:pointer-events-none before:absolute before:inset-x-0 before:top-full before:h-2 before:bg-linear-to-b before:from-black/12 before:to-transparent before:opacity-0 dark:before:from-black/45 group-data-[t=1]/sc:before:opacity-100";
/**
 * Borde superior del pie fijo (hay filas ocultas abajo): la fila que queda a medias se DESVANECE
 * hacia la superficie (28 px, como el final de una lista) en lugar de verse cortada en seco detrás
 * del Total; el borde del pie hace de línea. Cubre todo el ancho (celdas contiguas, spacing 0).
 */
export const EDGE_B =
  "before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-7 before:bg-linear-to-t before:from-surface before:via-surface/80 before:to-transparent before:opacity-0 group-data-[b=1]/sc:before:opacity-100";
/** Borde derecho de la primera columna fija (hay columnas ocultas a la izquierda). */
export const EDGE_L =
  "after:pointer-events-none after:absolute after:inset-y-0 after:left-full after:w-2.5 after:bg-linear-to-r after:from-black/12 after:to-transparent after:opacity-0 dark:after:from-black/45 group-data-[l=1]/sc:after:opacity-100";
/** Borde izquierdo de la columna de totales fija (hay columnas ocultas a la derecha): 24 px. */
export const EDGE_R =
  "after:pointer-events-none after:absolute after:inset-y-0 after:right-full after:w-6 after:bg-linear-to-l after:from-black/16 after:to-transparent after:opacity-0 dark:after:from-black/55 group-data-[r=1]/sc:after:opacity-100";

/** Normaliza para búsquedas: minúsculas y sin tildes. */
export function searchKey(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
