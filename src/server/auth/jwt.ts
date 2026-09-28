/**
 * Firma y verificación del JWT de sesión (HS256 con jose).
 * Sin "server-only" para poder usarse también desde src/proxy.ts.
 */
import { jwtVerify, SignJWT, type JWTPayload } from "jose";

export const SESSION_COOKIE = "docum_session";

export interface SessionPayload extends JWTPayload {
  sub: "docum";
  role: "viewer";
}

function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET no está definido o tiene menos de 32 caracteres (ver .env.example).");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(ttlHours: number): Promise<string> {
  return new SignJWT({ role: "viewer" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("docum")
    .setIssuedAt()
    .setExpirationTime(`${ttlHours}h`)
    .sign(getKey());
}

export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ["HS256"] });
    return payload.sub === "docum" ? (payload as SessionPayload) : null;
  } catch {
    return null;
  }
}
