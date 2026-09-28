import type { Metadata } from "next";
import { LoginScreen } from "./login-screen";

export const metadata: Metadata = {
  title: "Ingresar",
};

/** Solo rutas internas (la Server Action vuelve a validarlo con safeNext). */
function internalPath(value: string | string[] | undefined): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/login") ? value : "/";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  return <LoginScreen next={internalPath(sp.next)} />;
}
