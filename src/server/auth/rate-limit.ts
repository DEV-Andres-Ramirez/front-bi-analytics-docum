import "server-only";

/**
 * Límite simple de intentos de login por IP (en memoria del proceso).
 * Suficiente para un único token compartido; si se despliega en varias
 * instancias conviene moverlo a un almacén compartido.
 */
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

const store = globalThis as unknown as { __doclimit?: Map<string, { count: number; resetAt: number }> };
const attempts = (store.__doclimit ??= new Map());

export function checkRateLimit(key: string): { allowed: boolean; retryInSeconds: number } {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) return { allowed: true, retryInSeconds: 0 };
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryInSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryInSeconds: 0 };
}

export function registerFailure(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
}

export function clearAttempts(key: string) {
  attempts.delete(key);
}
