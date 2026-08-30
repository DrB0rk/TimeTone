import { Activity, ArrowUpRight, Clock3, Cpu, Sparkles, Users } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { PageHeading } from "@/components/page-heading";
import { StatCard } from "@/components/stat-card";
import { durationMinutes, formatDuration, roundDuration } from "@/lib/domain";
import { getDevices, getEmployees, getEntries, getSettings } from "@/lib/db";
import { OfficePresenceCanvas } from "@/components/office-presence-canvas";

export default function OverviewPage() {
  const settings = getSettings(),
    employees = getEmployees(false),
    entries = getEntries(),
    devices = getDevices();
  const open = entries.filter((entry) => !entry.clock_out),
    now = new Date(),
    startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = entries.filter((entry) =>
    new Date(entry.clock_in) >= startOfToday
  );
  const exactToday = today.reduce(
    (total, entry) => total + durationMinutes(entry.clock_in, entry.clock_out),
    0,
  );
  const roundedToday = today.reduce(
    (total, entry) =>
      total +
      roundDuration(
        durationMinutes(entry.clock_in, entry.clock_out),
        Number(settings.rounding_minutes),
        settings.rounding_mode,
      ),
    0,
  );
  const onlineDevices = devices.filter((device) =>
    device.last_seen_at &&
    now.getTime() - new Date(device.last_seen_at).getTime() < 300000
  ).length;
  return (
    <>
      <PageHeading
        eyebrow={format(now, "EEEE, d MMMM")}
        title="Good day. Here’s the pulse."
        description="Live attendance and the numbers that matter, without the spreadsheet work."
      />
      <section className="animate-rise-in overflow-hidden rounded-3xl bg-[#17211b] p-6 text-white md:p-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><p className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1 text-xs font-medium text-[#d8ff62]"><Sparkles className="size-3.5" />Live office pulse</p><h2 className="mt-4 text-3xl font-semibold tracking-tight">{open.length ? `${open.length} people are building today.` : "Ready for the next check-in."}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-white/55">Attendance is live from your connected terminals. Raw activity and rounded reporting stay separately auditable.</p></div><a href="/events" className="inline-flex items-center gap-2 text-sm font-medium text-[#d8ff62] transition hover:translate-x-1">Open terminal event feed <ArrowUpRight className="size-4" /></a></div>
      </section>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Currently in"
          value={String(open.length)}
          detail={`of ${employees.length} active employees`}
          icon={Users}
          accent
        />
        <StatCard
          label="Today, rounded"
          value={formatDuration(roundedToday)}
          detail={`${formatDuration(exactToday)} exact time`}
          icon={Clock3}
        />
        <StatCard
          label="Device status"
          value={`${onlineDevices}/${devices.length}`}
          detail={onlineDevices === devices.length
            ? "All terminals online"
            : "A terminal needs attention"}
          icon={Cpu}
        />
        <StatCard
          label="Unsynced events"
          value={String(devices.reduce((sum, d) => sum + d.pending_events, 0))}
          detail="Across all terminals"
          icon={Activity}
        />
      </section>
      <section className="mt-8 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <div className="animate-rise-in overflow-hidden rounded-2xl border border-black/6 bg-white shadow-sm shadow-black/[.025]" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between border-b border-black/6 p-5">
            <div>
              <h2 className="font-semibold">Latest activity</h2>
              <p className="mt-1 text-xs text-black/45">
                Most recent clock-ins and clock-outs
              </p>
            </div>
            <a
              href="/entries"
              className="text-sm font-medium text-black/55 hover:text-black"
            >
              View all →
            </a>
          </div>
          <div className="divide-y divide-black/5">
            {entries.slice(0, 7).map((entry) => (
              <div key={entry.id} className="flex items-center gap-4 p-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[#eef0eb] text-sm font-semibold">
                  {entry.employee_name.split(" ").map((n) =>
                    n[0]
                  ).join("").slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {entry.employee_name}
                  </p>
                  <p className="mt-0.5 text-xs text-black/45">
                    Clocked in {format(new Date(entry.clock_in), "EEE HH:mm")}
                  </p>
                </div>
                {entry.clock_out
                  ? (
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {formatDuration(
                          roundDuration(
                            durationMinutes(entry.clock_in, entry.clock_out),
                            Number(settings.rounding_minutes),
                            settings.rounding_mode,
                          ),
                        )}
                      </p>
                      <p className="text-xs text-black/40">rounded</p>
                    </div>
                  )
                  : (
                    <Badge className="bg-emerald-100 text-emerald-700">
                      Working
                    </Badge>
                  )}
              </div>
            ))}
            {entries.length === 0 && (
              <p className="p-10 text-center text-sm text-black/40">
                No time activity yet. Use code 1234 on the terminal demo.
              </p>
            )}
          </div>
        </div>
        <div className="animate-rise-in rounded-2xl bg-[#17211b] p-6 text-white" style={{ animationDelay: "140ms" }}>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#d8ff62]">
            Who’s here
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            {open.length
              ? `${open.length} teammate${open.length === 1 ? "" : "s"} in`
              : "The office is quiet"}
          </h2>
          <OfficePresenceCanvas people={open.map((entry) => ({ id: entry.id, name: entry.employee_name, color: "#d8ff62", since: entry.clock_in }))} />
          <div className="mt-5 space-y-3">
            {open.map((entry, index) => (
              <div
                key={entry.id}
                className="animate-rise-in flex items-center gap-3 rounded-xl bg-white/7 p-3 transition duration-300 hover:-translate-y-0.5 hover:bg-white/10"
                style={{ animationDelay: `${index * 90 + 180}ms` }}
              >
                <span className="animate-presence size-2 rounded-full bg-[#d8ff62]" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{entry.employee_name}</p>
                  <p className="text-xs text-white/45">
                    Since {format(new Date(entry.clock_in), "HH:mm")}
                  </p>
                </div>
                <p className="font-mono text-xs text-white/55">
                  {formatDuration(durationMinutes(entry.clock_in, null))}
                </p>
              </div>
            ))}
            {open.length === 0 && (
              <p className="text-sm leading-6 text-white/45">
                When someone clocks in at the CYD terminal, they’ll appear here
                immediately after sync.
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
