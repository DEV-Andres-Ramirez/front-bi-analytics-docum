import type { Metadata } from "next";
import { LoginScreen } from "./login-screen";

export const metadata: Metadata = {
  title: "Ingresar",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  return <LoginScreen next={next} />;
}
