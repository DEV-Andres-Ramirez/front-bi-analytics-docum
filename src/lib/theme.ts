export type Theme = "light" | "dark";

export const THEME_COOKIE = "docum-theme";

/**
 * Script inline que corre en <head> antes del primer pintado: aplica el tema
 * guardado en cookie o, si no hay, el del sistema operativo. Evita el "flash".
 * Ver node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
 */
export const themeInitScript = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var t=m?decodeURIComponent(m[1]):(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(t!=='dark'&&t!=='light')t='light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})()`;

export function readDomTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  const commit = () => {
    root.setAttribute("data-theme", theme);
    document.cookie = `${THEME_COOKIE}=${encodeURIComponent(theme)}; path=/; max-age=31536000; SameSite=Lax`;
  };
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (doc.startViewTransition && !reduce) doc.startViewTransition(commit);
  else commit();
}
