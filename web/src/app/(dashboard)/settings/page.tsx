import { Clock3, KeyRound, Save, Settings2, SlidersHorizontal } from "lucide-react";
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
      <PageHeading eyebrow="Workspace controls" title="Settings" description="Keep attendance rules transparent, terminals responsive, and reporting consistent." />
      <form action={saveSettings} className="max-w-4xl space-y-6">
        <SettingsSection icon={Settings2} title="Workspace" description="How the workspace appears across reports and terminals.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Company name" name="company_name" defaultValue={settings.company_name} />
            <Field label="IANA timezone" name="timezone" defaultValue={settings.timezone} description="For example Europe/Amsterdam." />
          </div>
        </SettingsSection>

        <SettingsSection icon={Clock3} title="Time rules" description="Raw timestamps are preserved. These rules affect calculated, auditable work sessions.">
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField label="Rounding interval" name="rounding_minutes" value={settings.rounding_minutes} options={[["1", "No practical rounding"], ["5", "5 minutes"], ["10", "10 minutes"], ["15", "15 minutes"], ["30", "30 minutes"]]} />
            <SelectField label="Rounding direction" name="rounding_mode" value={settings.rounding_mode} options={[["nearest", "Nearest interval"], ["up", "Always up"], ["down", "Always down"]]} />
          </div>
        </SettingsSection>

        <SettingsSection icon={SlidersHorizontal} title="Automatic time management" description="Repair common swipe mistakes automatically; every intervention is recorded in the entry history.">
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField label="Short interruption handling" name="auto_merge_enabled" value={settings.auto_merge_enabled} options={[["true", "Merge into one shift"], ["false", "Keep sessions separate"]]} />
            <NumberField label="Merge gap window" name="auto_merge_minutes" defaultValue={settings.auto_merge_minutes} suffix="minutes" min={1} max={120} description="A clock-in in this window after clock-out reopens the prior shift." />
            <SelectField label="Open-shift safety close" name="auto_close_enabled" value={settings.auto_close_enabled} options={[["true", "Automatically close"], ["false", "Leave open for review"]]} />
            <NumberField label="Maximum shift length" name="max_shift_hours" defaultValue={settings.max_shift_hours} suffix="hours" min={1} max={24} description="Open shifts exceeding this limit are closed and logged." />
            <NumberField label="Duplicate scan protection" name="duplicate_window_seconds" defaultValue={settings.duplicate_window_seconds} suffix="seconds" min={0} max={120} description="Rapid repeat scans from the same terminal are ignored." />
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">Automatic changes appear with their reason in the Time entries audit trail. You can always edit a result manually.</div>
        </SettingsSection>

        <SettingsSection icon={SlidersHorizontal} title="Reports" description="Set the default time window for reporting. Terminal-specific options live on each device card.">
          <div className="grid gap-5 sm:grid-cols-3">
            <SelectField label="Default report window" name="default_report_window" value={settings.default_report_window} options={[["7", "7 days"], ["14", "14 days"], ["30", "30 days"], ["60", "2 months"], ["90", "90 days"], ["365", "12 months"]]} />
          </div>
        </SettingsSection>
        <Button type="submit" size="lg" className="bg-[#17211b] text-white hover:bg-[#26352c]"><Save className="size-4" />Save workspace settings</Button>
      </form>

      <SettingsSection icon={KeyRound} title="Admin password" description="Change the password used to sign in to this dashboard." className="mt-6 max-w-4xl">
        {password === "changed" && <Notice tone="success">Password updated.</Notice>}
        {password === "incorrect" && <Notice tone="error">Current password is not correct.</Notice>}
        {password === "invalid" && <Notice tone="error">Use a new password of 8–128 characters and enter it twice.</Notice>}
        <form action={changePassword} className="grid gap-4 sm:grid-cols-3">
          <Field label="Current password" name="current_password" type="password" autoComplete="current-password" />
          <Field label="New password" name="new_password" type="password" autoComplete="new-password" />
          <Field label="Confirm password" name="confirm_password" type="password" autoComplete="new-password" />
          <Button type="submit" variant="outline" className="sm:col-span-3 sm:w-fit"><KeyRound className="size-4" />Change password</Button>
        </form>
      </SettingsSection>
    </>
  );
}

function SettingsSection({ icon: Icon, title, description, className, children }: { icon: typeof Settings2; title: string; description: string; className?: string; children: React.ReactNode }) {
  return <section className={`rounded-2xl border border-black/6 bg-white p-5 shadow-sm shadow-black/[.02] md:p-6 ${className || ""}`}><div className="mb-6 flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef4e4] text-[#526b38]"><Icon className="size-5" /></span><div><h2 className="font-semibold">{title}</h2><p className="mt-1 max-w-2xl text-sm leading-5 text-black/50">{description}</p></div></div><div className="space-y-5">{children}</div></section>;
}

function Notice({ tone, children }: { tone: "success" | "error"; children: React.ReactNode }) {
  return <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{children}</p>;
}

function Field({ label, description, ...props }: React.ComponentProps<typeof Input> & { label: string; description?: string }) {
  return <div className="space-y-2"><Label htmlFor={props.name}>{label}</Label><Input id={props.name} className="h-10 bg-white" required {...props} />{description && <p className="text-xs text-black/40">{description}</p>}</div>;
}

function NumberField({ label, suffix, description, ...props }: React.ComponentProps<typeof Input> & { label: string; suffix: string; description?: string }) {
  return <div className="space-y-2"><Label htmlFor={props.name}>{label}</Label><div className="relative"><Input id={props.name} type="number" className="h-10 bg-white pr-20" required {...props} /><span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs text-black/40">{suffix}</span></div>{description && <p className="text-xs text-black/40">{description}</p>}</div>;
}

function SelectField({ label, name, value, options }: { label: string; name: string; value: string; options: string[][] }) {
  return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><select id={name} name={name} defaultValue={value} className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm">{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></div>;
}
