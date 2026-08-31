import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const tables = ["settings", "employees", "devices", "device_events", "time_entries", "time_entry_changes"] as const;

export async function GET() {
  await requireAuth();
  const data = Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT * FROM ${table}`).all()]));
  const payload = {
    format: "timetone-migration",
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: data,
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="timetone-migration-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
