import { AppShell } from "@/components/app-shell";
import { requireAuth } from "@/lib/auth";
import { getSettings } from "@/lib/db";

export default async function DashboardLayout(
  { children }: { children: React.ReactNode },
) {
  await requireAuth();
  return (
    <AppShell companyName={getSettings().company_name}>{children}</AppShell>
  );
}
