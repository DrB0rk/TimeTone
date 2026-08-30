import { startOfWeek, subWeeks } from "date-fns";
import { Download } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { durationMinutes, formatDuration, roundDuration } from "@/lib/domain";
import { getEmployees, getEntries, getSettings } from "@/lib/db";

export default function ReportsPage() {
  const settings = getSettings(),
    employees = getEmployees(),
    weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }),
    previousStart = subWeeks(weekStart, 1),
    entries = getEntries(previousStart.toISOString());
  const rows = employees.map((employee) => {
    const mine = entries.filter((entry) => entry.employee_id === employee.id);
    const current = mine.filter((entry) =>
      new Date(entry.clock_in) >= weekStart
    ).reduce(
      (sum, entry) =>
        sum +
        roundDuration(
          durationMinutes(entry.clock_in, entry.clock_out),
          Number(settings.rounding_minutes),
          settings.rounding_mode,
        ),
      0,
    );
    const previous = mine.filter((entry) =>
      new Date(entry.clock_in) < weekStart
    ).reduce(
      (sum, entry) =>
        sum +
        roundDuration(
          durationMinutes(entry.clock_in, entry.clock_out),
          Number(settings.rounding_minutes),
          settings.rounding_mode,
        ),
      0,
    );
    return { employee, current, previous };
  });
  const max = Math.max(2400, ...rows.map((row) => row.current));
  return (
    <>
      <PageHeading
        eyebrow="Weekly summary"
        title="Reports"
        description={`Sessions are rounded ${settings.rounding_mode} to ${settings.rounding_minutes}-minute intervals.`}
        action={
          <a href="/api/export">
            <Button variant="outline" className="bg-white">
              <Download className="size-4" />Export CSV
            </Button>
          </a>
        }
      />
      <div className="rounded-2xl border border-black/6 bg-white p-6">
        <div className="grid grid-cols-[minmax(140px,220px)_1fr_90px] gap-4 border-b border-black/6 pb-3 text-xs font-semibold uppercase tracking-wider text-black/35">
          <span>Employee</span>
          <span>This week</span>
          <span className="text-right">Total</span>
        </div>
        <div className="divide-y divide-black/5">
          {rows.map(({ employee, current, previous }) => (
            <div
              key={employee.id}
              className="grid grid-cols-[minmax(140px,220px)_1fr_90px] items-center gap-4 py-5"
            >
              <div>
                <p className="text-sm font-semibold">{employee.name}</p>
                <p className="text-xs text-black/40">
                  Last week {formatDuration(previous)}
                </p>
              </div>
              <div className="h-8 overflow-hidden rounded-lg bg-[#eef0eb]">
                <div
                  className="h-full min-w-1 rounded-lg bg-[#d8ff62]"
                  style={{ width: `${Math.min(100, current / max * 100)}%` }}
                />
              </div>
              <p className="text-right font-mono text-sm font-semibold">
                {formatDuration(current)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
