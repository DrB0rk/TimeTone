import { getDeviceEvents, getFilteredEntries, getSettings } from "@/lib/db";
import { durationMinutes, roundDuration } from "@/lib/domain";

function csv(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

export function GET(request: Request) {
  const url = new URL(request.url);
  const settings = getSettings();
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const employeeId = url.searchParams.get("employee") || undefined;
  const status = url.searchParams.get("status") === "open" || url.searchParams.get("status") === "closed"
    ? url.searchParams.get("status") as "open" | "closed"
    : undefined;
  const source = url.searchParams.get("source") || undefined;
  const requested = url.searchParams.get("type");
  const exportType = requested === "summary" || requested === "daily" || requested === "events" ? requested : "entries";
  const entries = getFilteredEntries({ from, to, employeeId, status, source });
  const lines: string[] = [];

  if (exportType === "events") {
    lines.push(["Event ID", "Terminal", "Employee", "Type", "Terminal time", "Received time"].map(csv).join(","));
    for (const event of getDeviceEvents({ deviceId: url.searchParams.get("device") || undefined, employeeId })) lines.push([event.id, event.device_name, event.employee_name, event.event_type, event.occurred_at, event.received_at].map(csv).join(","));
  } else if (exportType === "daily") {
    lines.push(["Date", "Employee", "Sessions", "Exact minutes", "Rounded minutes", "Exact hours", "Rounded hours"].map(csv).join(","));
    const daily = new Map<string, { sessions: number; exact: number; rounded: number }>();
    for (const entry of entries) {
      const exact = durationMinutes(entry.clock_in, entry.clock_out), rounded = roundDuration(exact, Number(settings.rounding_minutes), settings.rounding_mode);
      const key = `${entry.clock_in.slice(0, 10)}|${entry.employee_name}`;
      const row = daily.get(key) || { sessions: 0, exact: 0, rounded: 0 };
      row.sessions++; row.exact += exact; row.rounded += rounded; daily.set(key, row);
    }
    for (const [key, row] of daily) { const [date, employee] = key.split("|"); lines.push([date, employee, row.sessions, row.exact, row.rounded, (row.exact / 60).toFixed(2), (row.rounded / 60).toFixed(2)].map(csv).join(",")); }
  } else if (exportType === "summary") {
    lines.push(["Employee", "Sessions", "Open sessions", "Exact minutes", "Rounded minutes", "Exact hours", "Rounded hours"].map(csv).join(","));
    const summary = new Map<string, { sessions: number; open: number; exact: number; rounded: number }>();
    for (const entry of entries) {
      const row = summary.get(entry.employee_name) || { sessions: 0, open: 0, exact: 0, rounded: 0 };
      const exact = durationMinutes(entry.clock_in, entry.clock_out);
      row.sessions++;
      row.open += entry.clock_out ? 0 : 1;
      row.exact += exact;
      row.rounded += roundDuration(exact, Number(settings.rounding_minutes), settings.rounding_mode);
      summary.set(entry.employee_name, row);
    }
    for (const [name, row] of summary) lines.push([name, row.sessions, row.open, row.exact, row.rounded, (row.exact / 60).toFixed(2), (row.rounded / 60).toFixed(2)].map(csv).join(","));
  } else {
    lines.push(["Employee", "Clock in", "Clock out", "Exact minutes", "Rounded minutes", "Exact hours", "Rounded hours", "Source", "Note", "Last updated"].map(csv).join(","));
    for (const entry of entries) {
      const exact = durationMinutes(entry.clock_in, entry.clock_out);
      const rounded = roundDuration(exact, Number(settings.rounding_minutes), settings.rounding_mode);
      lines.push([entry.employee_name, entry.clock_in, entry.clock_out || "", exact, rounded, (exact / 60).toFixed(2), (rounded / 60).toFixed(2), entry.source, entry.note || "", entry.updated_at].map(csv).join(","));
    }
  }
  const date = new Date().toISOString().slice(0, 10);
  return new Response(`\uFEFF${lines.join("\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="timekeep-${exportType}-${date}.csv"` } });
}
