import { AppShell } from "@/components/app-shell";
import { LiveDashboardRefresh } from "@/components/live-dashboard-refresh";
import { requireAuth } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import packageInfo from "../../../package.json";

export default async function DashboardLayout(
  { children }: { children: React.ReactNode },
) {
  await requireAuth();
  return (
    <AppShell companyName={getSettings().company_name} version={packageInfo.version}>
      <LiveDashboardRefresh />
      {children}
    </AppShell>
  );
}
