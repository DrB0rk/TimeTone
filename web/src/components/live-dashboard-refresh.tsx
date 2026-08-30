"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refreshes server-rendered dashboard data when a terminal changes it. */
export function LiveDashboardRefresh() {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource("/api/live-updates");
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      // Group a terminal event and its following heartbeat into one render.
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 350);
    };
    source.addEventListener("update", refresh);
    return () => {
      source.close();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [router]);

  return null;
}
