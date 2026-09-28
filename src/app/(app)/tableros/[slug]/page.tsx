import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { DASHBOARD_BY_SLUG, DASHBOARDS } from "@/config/dashboards";

export function generateStaticParams() {
  return DASHBOARDS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: PageProps<"/tableros/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const meta = DASHBOARD_BY_SLUG[slug];
  return { title: meta?.title ?? "Tablero" };
}

export default async function TableroPage({ params }: PageProps<"/tableros/[slug]">) {
  const { slug } = await params;
  if (!DASHBOARD_BY_SLUG[slug]) notFound();
  return (
    <Suspense>
      <DashboardView slug={slug} />
    </Suspense>
  );
}
