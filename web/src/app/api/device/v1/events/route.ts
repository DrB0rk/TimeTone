import { z } from "zod";
import { authenticateDevice, unauthorized } from "@/lib/device-api";
import { db, ingestDeviceEvent } from "@/lib/db";
import { publishLiveUpdate } from "@/lib/live-updates";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  id: z.string().min(8).max(80),
  employeeId: z.string().min(1).max(80),
  type: z.enum(["CLOCK_IN", "CLOCK_OUT"]),
  occurredAt: z.string().datetime(),
});
const payloadSchema = z.object({
  events: z.array(eventSchema).max(100),
  pendingCount: z.number().int().min(0).optional(),
});

export async function POST(request: Request) {
  const device = authenticateDevice(request);
  if (!device) return unauthorized();
  const parsed = payloadSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({
      error: "Invalid payload",
      details: parsed.error.flatten(),
    }, { status: 400 });
  }
  const results = parsed.data.events.map((event) => {
    try {
      return { id: event.id, status: ingestDeviceEvent(device.id, event) };
    } catch (error) {
      return {
        id: event.id,
        status: "rejected",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });
  db.prepare(
    "UPDATE devices SET last_seen_at = ?, pending_events = ? WHERE id = ?",
  ).run(new Date().toISOString(), parsed.data.pendingCount ?? 0, device.id);
  if (parsed.data.events.length) publishLiveUpdate("clock");
  return Response.json({ results, serverTime: new Date().toISOString() });
}
