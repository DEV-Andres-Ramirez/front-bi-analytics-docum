import type { Metadata } from "next";
import { HomeView } from "@/components/home/home-view";
import { serverEnv } from "@/server/env";

export const metadata: Metadata = { title: "Inicio" };

export default function HomePage() {
  return <HomeView source={serverEnv.dataSource === "postgres" ? "db" : "mock"} />;
}
