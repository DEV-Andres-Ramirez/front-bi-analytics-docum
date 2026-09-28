import { AppShell } from "@/components/shell/app-shell";
import { verifySession } from "@/server/auth/dal";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await verifySession();
  return <AppShell>{children}</AppShell>;
}
