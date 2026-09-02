import fs from "node:fs/promises";
import path from "node:path";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  await requireAuth();
  const databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "timekeep.db");
  try {
    const status = JSON.parse(await fs.readFile(path.join(path.dirname(databasePath), "update-status.json"), "utf8"));
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "idle", message: "No update is running." }, { headers: { "Cache-Control": "no-store" } });
  }
}
