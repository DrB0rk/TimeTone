import { authenticateDevice, unauthorized } from "@/lib/device-api";
import { db, getEmployees, getSettings } from "@/lib/db";

export function GET(request: Request) {
  const device = authenticateDevice(request);
  if (!device) return unauthorized();
  const settings = getSettings();
  const open = new Set(
    (db.prepare("SELECT employee_id FROM time_entries WHERE clock_out IS NULL")
      .all() as { employee_id: string }[]).map((row) => row.employee_id),
  );
  return Response.json({
    protocolVersion: 1,
    serverTime: new Date().toISOString(),
    device: { id: device.id, name: device.name },
    settings: {
      companyName: settings.company_name,
      timezone: settings.timezone,
      roundingMinutes: Number(settings.rounding_minutes),
      roundingMode: settings.rounding_mode,
    },
    employees: getEmployees(false).map((employee) => ({
      id: employee.id,
      name: employee.name,
      codeDigest: employee.code_digest,
      clockedIn: open.has(employee.id),
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
