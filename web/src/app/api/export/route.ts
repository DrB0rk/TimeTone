import { getEntries, getSettings } from "@/lib/db";
import { durationMinutes, roundDuration } from "@/lib/domain";

function csv(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function GET() {
  const settings = getSettings();
  const lines = [
    [
      "Employee",
      "Clock in",
      "Clock out",
      "Exact minutes",
      "Rounded minutes",
      "Source",
      "Note",
    ].map(csv).join(","),
  ];
  for (const entry of getEntries()) {
    const exact = durationMinutes(entry.clock_in, entry.clock_out);
    lines.push(
      [
        entry.employee_name,
        entry.clock_in,
        entry.clock_out || "",
        exact,
        roundDuration(
          exact,
          Number(settings.rounding_minutes),
          settings.rounding_mode,
        ),
        entry.source,
        entry.note || "",
      ].map(csv).join(","),
    );
  }
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="timekeep-${
        new Date().toISOString().slice(0, 10)
      }.csv"`,
    },
  });
}
