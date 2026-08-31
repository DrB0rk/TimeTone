import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

const tables = ["settings", "employees", "devices", "device_events", "time_entries", "time_entry_changes"] as const;
const rowArrays = (value: unknown): value is Record<string, unknown>[] => Array.isArray(value) && value.every((row) => row !== null && typeof row === "object" && !Array.isArray(row));

export async function POST(request: Request) {
  await requireAuth();
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a migration file." }, { status: 400 });
  if (file.size > 25 * 1024 * 1024) return Response.json({ error: "Migration file is too large (25 MB maximum)." }, { status: 400 });

  let payload: { format?: unknown; version?: unknown; tables?: Record<string, unknown> };
  try { payload = JSON.parse(await file.text()) as typeof payload; } catch { return Response.json({ error: "The migration file is not valid JSON." }, { status: 400 }); }
  if (payload.format !== "timetone-migration" || payload.version !== 1 || !payload.tables || typeof payload.tables !== "object") {
    return Response.json({ error: "This is not a compatible TimeTone migration file." }, { status: 400 });
  }
  if (tables.some((table) => !rowArrays(payload.tables?.[table]))) {
    return Response.json({ error: "The migration file is missing required data sections." }, { status: 400 });
  }

  try {
    db.transaction(() => {
      db.exec("DELETE FROM device_events; DELETE FROM time_entry_changes; DELETE FROM time_entries; DELETE FROM devices; DELETE FROM employees; DELETE FROM settings;");
      for (const table of tables) {
        const rows = payload.tables?.[table] as Record<string, unknown>[];
        for (const row of rows) {
          const columns = Object.keys(row);
          if (!columns.length) continue;
          const quoted = columns.map((column) => `"${column.replaceAll('"', '""')}"`).join(", ");
          const placeholders = columns.map(() => "?").join(", ");
          db.prepare(`INSERT INTO ${table} (${quoted}) VALUES (${placeholders})`).run(...columns.map((column) => row[column] ?? null));
        }
      }
    })();
  } catch (error) {
    return Response.json({ error: error instanceof Error ? `Import failed: ${error.message}` : "Import failed." }, { status: 400 });
  }
  for (const path of ["/", "/employees", "/devices", "/entries", "/events", "/reports", "/settings"]) revalidatePath(path);
  return Response.json({ ok: true });
}
