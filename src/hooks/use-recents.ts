"use client";

import { useCallback } from "react";
import { useLocalStorage } from "./use-local-storage";

const EMPTY: string[] = [];

export function useFavorites() {
  const [favorites, setFavorites] = useLocalStorage<string[]>("docum:favorites", EMPTY);
  const toggle = useCallback(
    (slug: string) => setFavorites((f) => (f.includes(slug) ? f.filter((s) => s !== slug) : [...f, slug])),
    [setFavorites],
  );
  return { favorites, toggle };
}

export function useRecents() {
  const [recents, setRecents] = useLocalStorage<string[]>("docum:recents", EMPTY);
  const push = useCallback((slug: string) => setRecents((r) => [slug, ...r.filter((s) => s !== slug)].slice(0, 6)), [setRecents]);
  return { recents, push };
}
