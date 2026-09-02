import fs from "node:fs/promises";
import path from "node:path";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  await requireAuth();
  const databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "timekeep.db");
  try {
    const status = JSON.parse(await fs.readFile(path.join(path.dirname(databasePath), "update-status.json"), "utf8")) as { status?: string; version?: string; message?: string };
    // A Docker compose rebuild removes the old container while the updater
    // process is still running, so its final write may never happen. Confirm
    // completion from the version baked into the new container instead.
    if (status.status === "restarting" && status.version) {
      try {
        const packageJson = JSON.parse(await fs.readFile(path.join(process.cwd(), "package.json"), "utf8")) as { version?: string };
        if (packageJson.version === status.version) return Response.json({ ...status, status: "complete", message: `TimeTone ${status.version} is ready` }, { headers: { "Cache-Control": "no-store" } });
      } catch { /* native layouts may not expose package.json */ }
    }
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "idle", message: "No update is running." }, { headers: { "Cache-Control": "no-store" } });
  }
}
