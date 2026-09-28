import "server-only";

/** Variables de entorno del servidor, validadas en un solo lugar. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Revisa .env.local (ver .env.example).`);
  }
  return value;
}

export const serverEnv = {
  get accessToken() {
    return required("ACCESS_TOKEN");
  },
  get sessionTtlHours() {
    const n = Number(process.env.SESSION_TTL_HOURS ?? 8);
    return Number.isFinite(n) && n > 0 ? n : 8;
  },
  get dataSource(): "mock" | "postgres" {
    return process.env.DATA_SOURCE === "postgres" ? "postgres" : "mock";
  },
};
