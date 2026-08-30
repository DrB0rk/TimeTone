import { Save } from "lucide-react";
import { saveSettings } from "@/app/actions";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSettings } from "@/lib/db";

export default function SettingsPage() {
  const settings = getSettings();
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
