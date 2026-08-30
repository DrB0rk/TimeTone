import { eachDayOfInterval, endOfDay, format, startOfDay, subDays } from "date-fns";
import { BarChart3, Download, FileSpreadsheet, SlidersHorizontal } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { durationMinutes, formatDuration, roundDuration } from "@/lib/domain";
import { getEmployees, getFilteredEntries, getSettings } from "@/lib/db";

type Query = { window?: string; from?: string; to?: string; employee?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const settings = getSettings();
  const employees = getEmployees();
  const windowDays = Math.max(1, Math.min(365, Number(query.window || settings.default_report_window)));
  const end = query.to ? endOfDay(new Date(query.to)) : new Date();
  const start = query.from ? startOfDay(new Date(query.from)) : startOfDay(subDays(end, windowDays - 1));
  const employeeId = query.employee || undefined;
  const entries = getFilteredEntries({ from: start.toISOString(), to: new Date(end.getTime() + 1).toISOString(), employeeId });
  const totals = new Map<string, number>();
  const daily = new Map<string, number>();
  for (const entry of entries) {
    const minutes = roundDuration(durationMinutes(entry.clock_in, entry.clock_out), Number(settings.rounding_minutes), settings.rounding_mode);
    totals.set(entry.employee_name, (totals.get(entry.employee_name) || 0) + minutes);
    const day = format(new Date(entry.clock_in), "yyyy-MM-dd");
    daily.set(day, (daily.get(day) || 0) + minutes);
  }
  const days = eachDayOfInterval({ start, end });
  const activity = days.map((day) => ({ day, minutes: daily.get(format(day, "yyyy-MM-dd")) || 0 }));
  const rows = employees.filter((employee) => !employeeId || employee.id === employeeId).map((employee) => ({ employee, minutes: totals.get(employee.name) || 0 })).sort((a, b) => b.minutes - a.minutes);
  const totalMinutes = [...totals.values()].reduce((sum, value) => sum + value, 0);
  const maxDaily = Math.max(60, ...activity.map((item) => item.minutes));
  const maxEmployee = Math.max(60, ...rows.map((item) => item.minutes));
  const queryString = new URLSearchParams({ from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd"), ...(employeeId ? { employee: employeeId } : {}) }).toString();

  return <>
    <PageHeading eyebrow={`${format(start, "d MMM")} - ${format(end, "d MMM yyyy")}`} title="Reports" description={`Rounded ${settings.rounding_mode} to ${settings.rounding_minutes}-minute intervals. Use the date window to explore any period.`} action={<div className="flex gap-2"><a href={`/api/export?type=entries&${queryString}`}><Button variant="outline" className="bg-white"><Download className="size-4" />Entries CSV</Button></a><a href={`/api/export?type=summary&${queryString}`}><Button className="bg-[#17211b]"><FileSpreadsheet className="size-4" />Summary CSV</Button></a></div>} />
    <form className="mb-6 grid gap-3 rounded-2xl border border-black/6 bg-white p-4 shadow-sm shadow-black/[.02] md:grid-cols-[auto_auto_auto_1fr_auto]">
      <span className="grid size-9 place-items-center rounded-lg bg-[#eef4e4] text-[#526b38]"><SlidersHorizontal className="size-4" /></span>
      <select name="window" defaultValue={String(windowDays)} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm"><option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select>
      <select name="employee" defaultValue={employeeId || ""} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm"><option value="">All employees</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select>
      <div className="flex gap-2"><input aria-label="From date" name="from" type="date" defaultValue={query.from} className="h-9 min-w-0 rounded-lg border border-black/10 px-2 text-sm" /><input aria-label="To date" name="to" type="date" defaultValue={query.to} className="h-9 min-w-0 rounded-lg border border-black/10 px-2 text-sm" /></div>
      <Button type="submit" variant="outline">Apply window</Button>
    </form>
    <section className="grid gap-4 md:grid-cols-3"><Metric label="Rounded time" value={formatDuration(totalMinutes)} detail={`${entries.length} session${entries.length === 1 ? "" : "s"}`} /><Metric label="Average per day" value={formatDuration(Math.round(totalMinutes / Math.max(1, activity.length)))} detail="Across selected calendar days" /><Metric label="People with time" value={String(rows.filter((row) => row.minutes > 0).length)} detail={`of ${rows.length} in the selected view`} /></section>
    <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
      <div className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm shadow-black/[.02]"><div className="flex items-start justify-between"><div><h2 className="font-semibold">Daily attendance</h2><p className="mt-1 text-sm text-black/45">Rounded team hours by day.</p></div><BarChart3 className="size-5 text-black/35" /></div><div className="mt-8 flex h-52 items-end gap-1.5">{activity.map(({ day, minutes }) => <div key={day.toISOString()} className="group flex h-full min-w-0 flex-1 items-end"><div title={`${format(day, "EEE d MMM")}: ${formatDuration(minutes)}`} className="w-full rounded-t-md bg-[#d8ff62] transition-all duration-300 group-hover:bg-[#b9df45]" style={{ height: `${Math.max(minutes ? 4 : 1, minutes / maxDaily * 100)}%` }} /></div>)}</div><div className="mt-3 flex justify-between text-[10px] text-black/40"><span>{format(start, "d MMM")}</span><span>{format(end, "d MMM")}</span></div></div>
      <div className="rounded-2xl bg-[#17211b] p-5 text-white"><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#d8ff62]">At a glance</p><h2 className="mt-2 text-xl font-semibold">Team distribution</h2><div className="mt-6 space-y-4">{rows.slice(0, 6).map(({ employee, minutes }) => <div key={employee.id}><div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="truncate">{employee.name}</span><span className="font-mono text-xs text-white/65">{formatDuration(minutes)}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#d8ff62] transition-all duration-500" style={{ width: `${minutes / maxEmployee * 100}%` }} /></div></div>)}{rows.length === 0 && <p className="text-sm text-white/45">No employees match this view.</p>}</div></div>
    </section>
    <section className="mt-6 rounded-2xl border border-black/6 bg-white p-5"><div className="mb-4"><h2 className="font-semibold">Employee totals</h2><p className="mt-1 text-sm text-black/45">Click a filter above to focus on one person or a custom date range.</p></div><div className="space-y-3">{rows.map(({ employee, minutes }) => <div key={employee.id} className="grid grid-cols-[minmax(100px,220px)_1fr_auto] items-center gap-4"><span className="truncate text-sm font-medium">{employee.name}</span><div className="h-3 overflow-hidden rounded-full bg-[#eef0eb]"><div className="h-full rounded-full bg-[#17211b] transition-all duration-500" style={{ width: `${minutes / maxEmployee * 100}%` }} /></div><span className="font-mono text-sm font-semibold">{formatDuration(minutes)}</span></div>)}</div></section>
  </>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm shadow-black/[.02]"><p className="text-xs font-semibold uppercase tracking-[.14em] text-black/40">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-black/45">{detail}</p></div>; }
