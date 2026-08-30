import { KeyRound, Save } from "lucide-react";
import { changePassword, saveSettings } from "@/app/actions";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSettings } from "@/lib/db";

export default async function SettingsPage(
  { searchParams }: { searchParams: Promise<{ password?: string }> },
) {
  const settings = getSettings();
  const { password } = await searchParams;
  return (
    <>
      <PageHeading
        eyebrow="Workspace"
        title="Settings"
        description="Company display name, local timezone, and the rounding policy used in summaries."
      />
      <form
        action={saveSettings}
        className="max-w-2xl rounded-2xl border border-black/6 bg-white p-6"
      >
        <div className="space-y-6">
          <Field
            label="Company name"
            name="company_name"
            defaultValue={settings.company_name}
          />
          <Field
            label="IANA timezone"
            name="timezone"
            defaultValue={settings.timezone}
            description="For example Europe/Amsterdam or America/New_York."
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              label="Rounding interval"
              name="rounding_minutes"
              value={settings.rounding_minutes}
              options={[
                ["1", "No practical rounding"],
                ["5", "5 minutes"],
                ["10", "10 minutes"],
                ["15", "15 minutes"],
                ["30", "30 minutes"],
              ]}
            />
            <SelectField
              label="Rounding direction"
              name="rounding_mode"
              value={settings.rounding_mode}
              options={[["nearest", "Nearest interval"], ["up", "Always up"], [
                "down",
                "Always down",
              ]]}
            />
          </div>
          <div className="rounded-xl bg-[#f5f6f2] p-4 text-xs leading-5 text-black/50">
            <strong className="text-black/70">Rounding policy:</strong>{" "}
            Raw clock-in and clock-out timestamps are always retained. Rounding
            is applied independently to each completed work session in reports.
          </div>
          <Button type="submit" className="bg-[#17211b]">
            <Save className="size-4" />Save settings
          </Button>
        </div>
      </form>
      <section className="mt-6 max-w-2xl rounded-2xl border border-black/6 bg-white p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#eef4e4] text-[#526b38]"><KeyRound className="size-5" /></span>
          <div><h2 className="font-semibold">Admin password</h2><p className="mt-1 text-sm text-black/50">Change the password used to sign in to this dashboard.</p></div>
        </div>
        {password === "changed" && <p className="mb-4 rounded-lg bg-[#e8f5e9] px-3 py-2 text-sm text-[#216e39]">Password updated.</p>}
        {password === "incorrect" && <p className="mb-4 rounded-lg bg-[#fff0ef] px-3 py-2 text-sm text-[#b42318]">Current password is not correct.</p>}
        {password === "invalid" && <p className="mb-4 rounded-lg bg-[#fff0ef] px-3 py-2 text-sm text-[#b42318]">Use a new password of 8–128 characters and enter it twice.</p>}
        <form action={changePassword} className="space-y-4">
          <Field label="Current password" name="current_password" type="password" autoComplete="current-password" />
          <Field label="New password" name="new_password" type="password" autoComplete="new-password" description="At least 8 characters." />
          <Field label="Confirm new password" name="confirm_password" type="password" autoComplete="new-password" />
          <Button type="submit" variant="outline"><KeyRound className="size-4" />Change password</Button>
        </form>
      </section>
    </>
  );
}
function Field(
  { label, description, ...props }: React.ComponentProps<typeof Input> & {
    label: string;
    description?: string;
  },
) {
  return (
    <div className="space-y-2">
      <Label htmlFor={props.name}>{label}</Label>
      <Input id={props.name} className="bg-white" required {...props} />
      {description && <p className="text-xs text-black/40">{description}</p>}
    </div>
  );
}
function SelectField(
  { label, name, value, options }: {
    label: string;
    name: string;
    value: string;
    options: string[][];
  },
) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        defaultValue={value}
        className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm"
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>{text}</option>
        ))}
      </select>
    </div>
  );
}
