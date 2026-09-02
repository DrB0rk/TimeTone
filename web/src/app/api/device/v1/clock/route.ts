import { z } from "zod";
import { authenticateDevice, unauthorized } from "@/lib/device-api";
import {
  db,
  getSettings,
  processClockEvent,
  runTimeMaintenance,
  sha256,
} from "@/lib/db";
import { publishLiveUpdate } from "@/lib/live-updates";

export const dynamic = "force-dynamic";

const schema = z.object({ code: z.string().regex(/^[ABCD]{4}$/) });

export async function POST(request: Request) {
  const device = authenticateDevice(request);
  if (!device) return unauthorized();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "invalid_code" }, { status: 400 });
  const employee = db.prepare("SELECT id, name FROM employees WHERE code_digest = ? AND active = 1")
    .get(sha256(parsed.data.code)) as { id: string; name: string } | undefined;
  if (!employee) return Response.json({ ok: false, error: "invalid_code" }, { status: 404 });
  const now = new Date().toISOString();
  runTimeMaintenance(new Date(now));
  const open = db.prepare("SELECT id FROM time_entries WHERE employee_id = ? AND clock_out IS NULL")
    .get(employee.id) as { id: string } | undefined;
  const settings = getSettings();
  const recent = db.prepare(
    "SELECT event_type, occurred_at FROM device_events WHERE device_id = ? AND employee_id = ? ORDER BY received_at DESC LIMIT 1",
  ).get(device.id, employee.id) as {
    event_type: "CLOCK_IN" | "CLOCK_OUT";
    occurred_at: string;
  } | undefined;
  const duplicateWindowMs = Number(settings.duplicate_window_seconds) * 1000;
  if (recent && new Date(now).getTime() - new Date(recent.occurred_at).getTime() <= duplicateWindowMs) {
    db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(now, device.id);
    return Response.json({
      ok: true,
      employeeName: employee.name,
      clockedIn: !!open,
      occurredAt: now,
      ignored: true,
      message: `Duplicate scan ignored (${settings.duplicate_window_seconds}s protection)`,
    });
  }
  const result = processClockEvent(
    device.id,
    employee.id,
    open ? "CLOCK_OUT" : "CLOCK_IN",
    now,
  );
  db.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?").run(now, device.id);
  publishLiveUpdate("clock");
  return Response.json({
    ok: true,
    employeeName: employee.name,
    clockedIn: result.clockedIn,
    occurredAt: now,
    merged: result.merged,
    ignored: result.status === "ignored",
  });
}
