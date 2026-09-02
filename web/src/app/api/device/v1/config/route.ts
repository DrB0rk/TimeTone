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
      syncIntervalSeconds: device.sync_interval_seconds,
      fullSyncIntervalSeconds: device.full_sync_interval_seconds,
      screenOffTimeoutSeconds: device.screen_off_timeout_seconds,
      lowPowerTimeoutSeconds: device.low_power_timeout_seconds,
      terminalTheme: device.terminal_theme,
      duplicateWindowSeconds: Number(settings.duplicate_window_seconds),
    },
    firmwareUpdate: device.ota_version && device.ota_url ? {
      version: device.ota_version,
      url: device.ota_url,
    } : null,
    employees: getEmployees(false).map((employee) => ({
      id: employee.id,
      name: employee.name,
      clockedIn: open.has(employee.id),
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
