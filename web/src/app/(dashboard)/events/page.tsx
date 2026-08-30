import { format } from "date-fns";
import { ScanLine, Search } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { getDeviceEvents, getDevices, getEmployees } from "@/lib/db";

type Query = { q?: string; device?: string; employee?: string; type?: string };

export default async function EventsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const events = getDeviceEvents({ search: query.q, deviceId: query.device, employeeId: query.employee, type: query.type });
  const devices = getDevices();
  const employees = getEmployees();
  return <>
    <PageHeading eyebrow="Raw terminal activity" title="Terminal events" description="Every submitted color-code scan is retained here, including scans that were later merged, ignored, or corrected in time entries." />
    <form className="mb-5 grid gap-3 rounded-2xl border border-black/6 bg-white p-4 shadow-sm shadow-black/[.02] md:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]">
      <label className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-black/35" /><input name="q" defaultValue={query.q} placeholder="Search employee, terminal, or event ID" className="h-9 w-full rounded-lg border border-black/10 bg-white pl-9 pr-3 text-sm" /></label>
      <select name="device" defaultValue={query.device || ""} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm"><option value="">All terminals</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select>
      <select name="employee" defaultValue={query.employee || ""} className="h-9 rounded-lg border border-black/10 bg-white px-3 text-sm"><option value="">All employees</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select>
      <div className="flex gap-2"><select name="type" defaultValue={query.type || ""} className="h-9 min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-3 text-sm"><option value="">All event types</option><option value="CLOCK_IN">Clock in</option><option value="CLOCK_OUT">Clock out</option></select><button className="h-9 rounded-lg bg-[#17211b] px-4 text-sm font-medium text-white">Filter</button></div>
    </form>
    <p className="mb-3 text-sm text-black/45">Showing {events.length} most recent terminal event{events.length === 1 ? "" : "s"}.</p>
    <div className="overflow-hidden rounded-2xl border border-black/6 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-black/6 bg-black/[.015] text-xs uppercase tracking-wider text-black/35"><tr><th className="px-5 py-3">Event</th><th className="px-5 py-3">Employee</th><th className="px-5 py-3">Terminal</th><th className="px-5 py-3">Terminal time</th><th className="px-5 py-3">Received</th><th className="px-5 py-3">Event ID</th></tr></thead><tbody className="divide-y divide-black/5">{events.map((event) => <tr key={event.id}><td className="px-5 py-4"><Badge className={event.event_type === "CLOCK_IN" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}>{event.event_type === "CLOCK_IN" ? "Clock in" : "Clock out"}</Badge></td><td className="px-5 py-4 font-medium">{event.employee_name}</td><td className="px-5 py-4 text-black/60">{event.device_name}</td><td className="px-5 py-4 text-black/60">{format(new Date(event.occurred_at), "d MMM yyyy, HH:mm:ss")}</td><td className="px-5 py-4 text-black/45">{format(new Date(event.received_at), "d MMM, HH:mm:ss")}</td><td className="px-5 py-4 font-mono text-xs text-black/35">{event.id}</td></tr>)}{events.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-black/40"><ScanLine className="mx-auto mb-3 size-6" />No terminal events match these filters.</td></tr>}</tbody></table></div></div>
  </>;
}
