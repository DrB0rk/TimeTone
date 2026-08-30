import crypto from "node:crypto";
import { z } from "zod";
import { authenticateDevice, unauthorized } from "@/lib/device-api";
import { db, sha256 } from "@/lib/db";

const schema = z.object({ code: z.string().regex(/^[ABCD]{4,8}$/) });

export async function POST(request: Request) {
  const device = authenticateDevice(request);
  if (!device) return unauthorized();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "invalid_code" }, { status: 400 });
  const employee = db.prepare("SELECT id, name FROM employees WHERE code_digest = ? AND active = 1")
    .get(sha256(parsed.data.code)) as { id: string; name: string } | undefined;
  if (!employee) return Response.json({ ok: false, error: "invalid_code" }, { status: 404 });
  const now = new Date().toISOString();
  const open = db.prepare("SELECT id FROM time_entries WHERE employee_id = ? AND clock_out IS NULL")
    .get(employee.id) as { id: string } | undefined;
  const clockedIn = !open;
  db.transaction(() => {
    db.prepare("INSERT INTO device_events VALUES (?, ?, ?, ?, ?, ?)")
      .run(crypto.randomUUID(), device.id, employee.id, clockedIn ? "CLOCK_IN" : "CLOCK_OUT", now, now);
    if (open) {
      db.prepare("UPDATE time_entries SET clock_out = ?, updated_at = ? WHERE id = ?").run(now, now, open.id);
    } else {
      db.prepare("INSERT INTO time_entries VALUES (?, ?, ?, NULL, 'device', NULL, ?, ?)").run(crypto.randomUUID(), employee.id, now, now, now);
    }
    db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(now, device.id);
  })();
  return Response.json({ ok: true, employeeName: employee.name, clockedIn, occurredAt: now });
}
