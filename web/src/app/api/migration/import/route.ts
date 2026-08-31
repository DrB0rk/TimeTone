import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export const runtime = "nodejs";

const tables = ["settings", "employees", "devices", "device_events", "time_entries", "time_entry_changes"] as const;
const rowArrays = (value: unknown): value is Record<string, unknown>[] => Array.isArray(value) && value.every((row) => row !== null && typeof row === "object" && !Array.isArray(row));

export async function POST(request: Request) {
  await requireAuth();
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) redirect("/settings?migration=missing");
  if (file.size > 25 * 1024 * 1024) redirect("/settings?migration=large");

  let payload: { format?: unknown; version?: unknown; tables?: Record<string, unknown> };
  try { payload = JSON.parse(await file.text()) as typeof payload; } catch { redirect("/settings?migration=invalid"); }
  if (payload.format !== "timetone-migration" || payload.version !== 1 || !payload.tables || typeof payload.tables !== "object") {
    redirect("/settings?migration=unsupported");
  }
  if (tables.some((table) => !rowArrays(payload.tables?.[table]))) {
    redirect("/settings?migration=incomplete");
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
    console.error("TimeTone migration import failed", error);
    redirect("/settings?migration=failed");
  }
  for (const path of ["/", "/employees", "/devices", "/entries", "/events", "/reports", "/settings"]) revalidatePath(path);
  redirect("/settings?migration=imported");
}
