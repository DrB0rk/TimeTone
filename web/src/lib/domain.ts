export type Employee = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  code_digest: string;
  active: number;
  color: string;
  created_at: string;
  updated_at: string;
};

export type TimeEntry = {
  id: string;
  employee_id: string;
  employee_name: string;
  clock_in: string;
  clock_out: string | null;
  source: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type TimeEntryChange = {
  id: string;
  entry_id: string | null;
  action: string;
  before_json: string | null;
  after_json: string | null;
  reason: string;
  created_at: string;
};

export type Device = {
  id: string;
  name: string;
  token_digest: string;
  last_seen_at: string | null;
  firmware_version: string | null;
  ip_address: string | null;
  pending_events: number;
  created_at: string;
  approved: number;
  sync_interval_seconds: number;
  screen_off_timeout_seconds: number;
  low_power_timeout_seconds: number;
  terminal_theme: string;
  ota_version: string | null;
  ota_url: string | null;
  ota_requested_at: string | null;
};

export type AppSettings = {
  company_name: string;
  timezone: string;
  rounding_minutes: string;
  rounding_mode: string;
  auto_merge_enabled: string;
  auto_merge_minutes: string;
  auto_close_enabled: string;
  max_shift_hours: string;
  duplicate_window_seconds: string;
  default_report_window: string;
  sync_interval_seconds: string;
  terminal_theme: string;
};

export function roundDuration(
  minutes: number,
  increment: number,
  mode: string,
) {
  if (!increment) return minutes;
  if (mode === "up") return Math.ceil(minutes / increment) * increment;
  if (mode === "down") return Math.floor(minutes / increment) * increment;
  return Math.round(minutes / increment) * increment;
}

export function durationMinutes(
  start: string,
  end: string | null,
  now = new Date(),
) {
  const finish = end ? new Date(end) : now;
  return Math.max(
    0,
    Math.round((finish.getTime() - new Date(start).getTime()) / 60000),
  );
}

export function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}
