import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/server/auth/jwt";

/**
 * Chequeo optimista de sesión (Next 16: "proxy" reemplaza a "middleware").
 * La verificación definitiva ocurre en el DAL (src/server/auth/dal.ts).
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const isLogin = pathname === "/login";

  if (!session && !isLogin) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (session && isLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|graphic_identity/|data/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|geojson|txt)$).*)",
  ],
};
