import { format } from "date-fns";
import { Plus } from "lucide-react";
import { addManualEntry } from "@/app/actions";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { durationMinutes, formatDuration, roundDuration } from "@/lib/domain";
import { getEmployees, getEntries, getSettings } from "@/lib/db";

export default function EntriesPage() {
  const entries = getEntries(),
    employees = getEmployees(false),
    settings = getSettings();
  return (
    <>
      <PageHeading
        eyebrow="Audit trail"
        title="Time entries"
        description="Raw clock times stay intact. Rounded duration is calculated separately for transparent reporting."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="overflow-hidden rounded-2xl border border-black/6 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-black/6 bg-black/[.015] text-xs uppercase tracking-wider text-black/35">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">In</th>
                  <th className="px-5 py-3">Out</th>
                  <th className="px-5 py-3">Exact</th>
                  <th className="px-5 py-3">Rounded</th>
                  <th className="px-5 py-3">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {entries.map((entry) => {
                  const exact = durationMinutes(
                    entry.clock_in,
                    entry.clock_out,
                  );
                  return (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap px-5 py-4 font-medium">
                        {entry.employee_name}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-black/55">
                        {format(new Date(entry.clock_in), "d MMM, HH:mm")}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-black/55">
                        {entry.clock_out
                          ? format(new Date(entry.clock_out), "d MMM, HH:mm")
                          : (
                            <Badge className="bg-emerald-100 text-emerald-700">
                              Open
                            </Badge>
                          )}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs">
                        {formatDuration(exact)}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs font-semibold">
                        {formatDuration(
                          roundDuration(
                            exact,
                            Number(settings.rounding_minutes),
                            settings.rounding_mode,
                          ),
                        )}
                      </td>
                      <td className="px-5 py-4 capitalize text-black/40">
                        {entry.source}
                      </td>
                    </tr>
                  );
                })}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-black/40">
                      No entries recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="h-fit rounded-2xl bg-[#17211b] p-6 text-white">
          <div className="mb-5 grid size-10 place-items-center rounded-xl bg-[#d8ff62] text-[#17211b]">
            <Plus className="size-5" />
          </div>
          <h2 className="text-xl font-semibold">Manual entry</h2>
          <p className="mt-1 text-xs leading-5 text-white/45">
            For corrections, remote work, or a missed clock-in.
          </p>
          <form action={addManualEntry} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="employee_id">Employee</Label>
              <select
                id="employee_id"
                name="employee_id"
                className="h-10 w-full rounded-lg border border-white/15 bg-white/8 px-3 text-sm"
                required
              >
                {employees.map((employee) => (
                  <option
                    className="text-black"
                    key={employee.id}
                    value={employee.id}
                  >
                    {employee.name}
                  </option>
                ))}
              </select>
            </div>
            <DateField label="Clock in" name="clock_in" required />
            <DateField label="Clock out" name="clock_out" />
            <div className="space-y-2">
              <Label htmlFor="note">Note</Label>
              <Input
                id="note"
                name="note"
                placeholder="Reason for correction"
                className="border-white/15 bg-white/8 placeholder:text-white/25"
              />
            </div>
            <Button type="submit" className="w-full bg-[#d8ff62] text-[#17211b] hover:bg-[#c9ef58]">
              Save entry
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}
function DateField(
  { label, name, required }: {
    label: string;
    name: string;
    required?: boolean;
  },
) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type="datetime-local"
        required={required}
        className="border-white/15 bg-white/8 scheme-dark"
      />
    </div>
  );
}
