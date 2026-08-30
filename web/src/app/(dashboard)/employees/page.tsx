import { Pencil, UserPlus } from "lucide-react";
import { createEmployee, toggleEmployee, updateEmployee } from "@/app/actions";
import { ColorCodeInput } from "@/components/color-code-input";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getEmployees, getEntries } from "@/lib/db";

export default function EmployeesPage() {
  const employees = getEmployees(),
    openIds = new Set(
      getEntries().filter((entry) => !entry.clock_out).map((entry) =>
        entry.employee_id
      ),
    );
  return (
    <>
      <PageHeading
        eyebrow="Team directory"
        title="Employees"
        description="Manage who can use the clock. Each person gets a private sequence of four colors."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="overflow-hidden rounded-2xl border border-black/6 bg-white">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-black/6 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-black/35">
            <span>Employee</span>
            <span>Status</span>
            <span>Access</span>
          </div>
          <div className="divide-y divide-black/5">
            {employees.map((employee) => (
              <div
                key={employee.id}
                className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: employee.color }}
                  >
                    {employee.name.split(" ").map((n) => n[0]).join("").slice(
                      0,
                      2,
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {employee.name}
                    </p>
                    <p className="truncate text-xs text-black/40">
                      {employee.role || employee.email || "Team member"}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={openIds.has(employee.id)
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-black/5 text-black/45"}
                >
                  {openIds.has(employee.id) ? "Clocked in" : "Away"}
                </Badge>
                <div className="flex items-center gap-1">
                    <details className="relative">
                      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-black/55 hover:bg-black/5"><Pencil className="size-3.5" />Edit</summary>
                      <div className="absolute right-0 z-10 mt-2 w-80 rounded-xl border border-black/10 bg-white p-4 shadow-xl">
                        <form action={updateEmployee} className="space-y-3">
                          <input type="hidden" name="id" value={employee.id} />
                          <Field label="Full name" name="name" defaultValue={employee.name} required />
                          <Field label="Email" name="email" type="email" defaultValue={employee.email || ""} />
                          <Field label="Role" name="role" defaultValue={employee.role || ""} />
                          <div className="space-y-1"><Label>New color passcode</Label><ColorCodeInput name="code" /><p className="text-[11px] text-black/40">Leave blank to keep the current sequence.</p></div>
                          <div className="space-y-1"><Label htmlFor={`color-${employee.id}`}>Badge colour</Label><Input id={`color-${employee.id}`} name="color" type="color" defaultValue={employee.color} className="h-9 bg-white p-1" /></div>
                          <Button type="submit" size="sm" className="w-full bg-[#17211b]">Save changes</Button>
                        </form>
                      </div>
                    </details>
                    <form action={toggleEmployee}>
                      <input type="hidden" name="id" value={employee.id} />
                      <Button type="submit" size="sm" variant="ghost" className="text-xs">{employee.active ? "Disable" : "Enable"}</Button>
                    </form>
                  </div>
              </div>
            ))}
          </div>
        </div>
        <Card className="employee-add-card h-fit border-black/6 bg-white shadow-none dark:border-white/10 dark:bg-[#1b261f]">
          <CardHeader>
            <div className="mb-2 grid size-10 place-items-center rounded-xl bg-[#d8ff62]">
              <UserPlus className="size-5" />
            </div>
            <CardTitle>Add employee</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createEmployee} className="space-y-4">
              <Field
                label="Full name"
                name="name"
                placeholder="Sam de Vries"
                required
              />
              <Field
                label="Email"
                name="email"
                type="email"
                placeholder="sam@company.com"
              />
              <Field label="Role" name="role" placeholder="Product designer" />
              <div className="space-y-2">
                <Label>Color passcode (4 keys)</Label>
                <ColorCodeInput name="code" />
                <p className="text-xs text-black/40">Choose a sequence employees can remember. It is stored securely and never shown again.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="color">Badge colour</Label>
                <Input
                  id="color"
                  name="color"
                  type="color"
                  defaultValue="#5B8CFF"
                  className="h-10 bg-white p-1"
                />
              </div>
              <Button type="submit" className="w-full bg-[#17211b] text-white dark:!text-white">Create employee</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Field(props: React.ComponentProps<typeof Input> & { label: string }) {
  const { label, ...input } = props;
  return (
    <div className="space-y-2">
      <Label htmlFor={input.name}>{label}</Label>
      <Input id={input.name} className="bg-white" {...input} />
    </div>
  );
}
