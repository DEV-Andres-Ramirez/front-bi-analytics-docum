import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SESSION_COOKIE, verifySessionToken } from "./jwt";

/** Data Access Layer: la verificación real de la sesión, cerca de los datos. */
export const getSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
});

/** Para layouts y páginas: redirige a /login si no hay sesión válida. */
export async function verifySession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Para route handlers: devuelve null en vez de redirigir (responden 401). */
export async function hasSession() {
  return (await getSession()) !== null;
}
