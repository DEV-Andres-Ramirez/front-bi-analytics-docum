"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { serverEnv } from "@/server/env";
import { SESSION_COOKIE, signSession } from "./jwt";
import { checkRateLimit, clearAttempts, registerFailure } from "./rate-limit";

export interface LoginState {
  error?: string;
  attempt?: number;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  // Solo rutas internas: evita redirecciones abiertas (//evil.com, https://…)
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/login") ? value : "/";
}

export async function login(prev: LoginState, formData: FormData): Promise<LoginState> {
  const attempt = (prev.attempt ?? 0) + 1;
  const token = String(formData.get("token") ?? "").trim();
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";

  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return { error: `Demasiados intentos. Intenta de nuevo en ${limit.retryInSeconds} s.`, attempt };
  }
  if (!token) {
    return { error: "Ingresa el token de acceso.", attempt };
  }

  const valid = timingSafeEqual(sha256(token), sha256(serverEnv.accessToken));
  if (!valid) {
    registerFailure(ip);
    return { error: "El token de acceso no es válido.", attempt };
  }

  clearAttempts(ip);
  const ttl = serverEnv.sessionTtlHours;
  const jwt = await signSession(ttl);
  (await cookies()).set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttl * 3600,
  });
  redirect(safeNext(formData.get("next")));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
