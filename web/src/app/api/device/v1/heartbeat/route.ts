import { z } from "zod";
import { authenticateDevice, unauthorized } from "@/lib/device-api";
import { db } from "@/lib/db";

const schema = z.object({
  firmwareVersion: z.string().max(40),
  ipAddress: z.string().max(64).optional(),
  pendingEvents: z.number().int().min(0).max(10000),
});

export async function POST(request: Request) {
  const device = authenticateDevice(request);
  if (!device) return unauthorized();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }
  db.prepare(
    "UPDATE devices SET last_seen_at = ?, firmware_version = ?, ip_address = ?, pending_events = ? WHERE id = ?",
  ).run(
    new Date().toISOString(),
    parsed.data.firmwareVersion,
    parsed.data.ipAddress || null,
    parsed.data.pendingEvents,
    device.id,
  );
  return Response.json({ ok: true, serverTime: new Date().toISOString() });
}
