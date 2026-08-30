import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  AppSettings,
  Device,
  Employee,
  TimeEntry,
  TimeEntryChange,
} from "@/lib/domain";

const databasePath = process.env.DATABASE_PATH ||
  path.join(process.cwd(), "data", "timekeep.db");
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const globalDatabase = globalThis as unknown as {
  timekeepDb?: Database.Database;
};
export const db = globalDatabase.timekeepDb ?? new Database(databasePath);
if (process.env.NODE_ENV !== "production") globalDatabase.timekeepDb = db;

// Next.js evaluates route modules in parallel during a clean build. Allow one
// worker to finish first-time WAL/schema setup while the others wait.
db.pragma("busy_timeout = 10000");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    role TEXT,
    code_digest TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1,
    color TEXT NOT NULL DEFAULT '#5B8CFF',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    token_digest TEXT NOT NULL UNIQUE,
    last_seen_at TEXT,
    firmware_version TEXT,
    ip_address TEXT,
    pending_events INTEGER NOT NULL DEFAULT 0,
    sync_interval_seconds INTEGER NOT NULL DEFAULT 5,
    sleep_timeout_seconds INTEGER NOT NULL DEFAULT 120,
    screen_off_timeout_seconds INTEGER NOT NULL DEFAULT 30,
    low_power_timeout_seconds INTEGER NOT NULL DEFAULT 120,
    terminal_theme TEXT NOT NULL DEFAULT 'light',
    created_at TEXT NOT NULL,
    approved INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS device_events (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES devices(id),
    employee_id TEXT NOT NULL REFERENCES employees(id),
    event_type TEXT NOT NULL CHECK(event_type IN ('CLOCK_IN','CLOCK_OUT')),
    occurred_at TEXT NOT NULL,
    received_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    clock_in TEXT NOT NULL,
    clock_out TEXT,
    source TEXT NOT NULL DEFAULT 'device',
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS time_entry_changes (
    id TEXT PRIMARY KEY,
    entry_id TEXT,
    action TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_entries_employee_time ON time_entries(employee_id, clock_in);
  CREATE INDEX IF NOT EXISTS idx_entry_changes_time ON time_entry_changes(created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_entry ON time_entries(employee_id) WHERE clock_out IS NULL;
`);

try {
  db.exec("ALTER TABLE devices ADD COLUMN approved INTEGER NOT NULL DEFAULT 1");
} catch {
  // Existing databases already have the approval column.
}
for (const migration of [
  "ALTER TABLE devices ADD COLUMN sync_interval_seconds INTEGER NOT NULL DEFAULT 5",
  "ALTER TABLE devices ADD COLUMN sleep_timeout_seconds INTEGER NOT NULL DEFAULT 120",
  "ALTER TABLE devices ADD COLUMN terminal_theme TEXT NOT NULL DEFAULT 'light'",
  "ALTER TABLE devices ADD COLUMN screen_off_timeout_seconds INTEGER NOT NULL DEFAULT 30",
  "ALTER TABLE devices ADD COLUMN low_power_timeout_seconds INTEGER NOT NULL DEFAULT 120",
]) {
  try { db.exec(migration); } catch { /* column already exists */ }
}

const defaults = {
  company_name: "Studio North",
  timezone: "Europe/Amsterdam",
  rounding_minutes: "15",
  rounding_mode: "nearest",
  auto_merge_enabled: "true",
  auto_merge_minutes: "5",
  auto_close_enabled: "true",
  max_shift_hours: "14",
  duplicate_window_seconds: "15",
  default_report_window: "30",
  sync_interval_seconds: "5",
  terminal_theme: "light",
};

const insertSetting = db.prepare(
  "INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)",
);
Object.entries(defaults).forEach(([key, value]) =>
  insertSetting.run(key, value)
);

export function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function getSettings(): AppSettings {
  const values = Object.fromEntries(
    (db.prepare("SELECT key, value FROM settings").all() as {
      key: string;
      value: string;
    }[]).map(({ key, value }) => [key, value]),
  );
  return { ...defaults, ...values };
}

export function getEmployees(includeInactive = true) {
  const where = includeInactive ? "" : "WHERE active = 1";
  return db.prepare(
    `SELECT * FROM employees ${where} ORDER BY active DESC, name`,
  ).all() as Employee[];
}

export function getEntries(from?: string, to?: string) {
  runTimeMaintenance();
  const clauses: string[] = [];
  const values: string[] = [];
  if (from) {
    clauses.push("te.clock_in >= ?");
    values.push(from);
  }
  if (to) {
    clauses.push("te.clock_in < ?");
    values.push(to);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.prepare(`
    SELECT te.*, e.name AS employee_name
    FROM time_entries te JOIN employees e ON e.id = te.employee_id
    ${where} ORDER BY te.clock_in DESC
  `).all(...values) as TimeEntry[];
}

export function getFilteredEntries({
  from,
  to,
  employeeId,
  status,
  source,
  search,
}: {
  from?: string;
  to?: string;
  employeeId?: string;
  status?: "open" | "closed";
  source?: string;
  search?: string;
} = {}) {
  runTimeMaintenance();
  const clauses: string[] = [];
  const values: string[] = [];
  if (from) { clauses.push("te.clock_in >= ?"); values.push(from); }
  if (to) { clauses.push("te.clock_in < ?"); values.push(to); }
  if (employeeId) { clauses.push("te.employee_id = ?"); values.push(employeeId); }
  if (status === "open") clauses.push("te.clock_out IS NULL");
  if (status === "closed") clauses.push("te.clock_out IS NOT NULL");
  if (source) { clauses.push("te.source = ?"); values.push(source); }
  if (search) { clauses.push("(e.name LIKE ? OR COALESCE(te.note, '') LIKE ?)"); values.push(`%${search}%`, `%${search}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.prepare(`
    SELECT te.*, e.name AS employee_name
    FROM time_entries te JOIN employees e ON e.id = te.employee_id
    ${where} ORDER BY te.clock_in DESC
  `).all(...values) as TimeEntry[];
}

export function getEntryChanges(limit = 100) {
  return db.prepare(
    "SELECT * FROM time_entry_changes ORDER BY created_at DESC LIMIT ?",
  ).all(limit) as TimeEntryChange[];
}

function appendNote(existing: string | null, message: string) {
  return existing ? `${existing} · ${message}` : message;
}

function recordEntryChange(
  entryId: string | null,
  action: string,
  before: unknown,
  after: unknown,
  reason: string,
  createdAt = new Date().toISOString(),
) {
  db.prepare(
    "INSERT INTO time_entry_changes VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    crypto.randomUUID(),
    entryId,
    action,
    before == null ? null : JSON.stringify(before),
    after == null ? null : JSON.stringify(after),
    reason,
    createdAt,
  );
}

export const runTimeMaintenance = db.transaction((now = new Date()) => {
  const settings = getSettings();
  let merged = 0;
  let closed = 0;
  const nowIso = now.toISOString();

  if (settings.auto_close_enabled === "true") {
    const maximumMs = Number(settings.max_shift_hours) * 60 * 60 * 1000;
    const openEntries = db.prepare(
      "SELECT * FROM time_entries WHERE clock_out IS NULL ORDER BY clock_in",
    ).all() as TimeEntry[];
    for (const entry of openEntries) {
      const automaticOut = new Date(entry.clock_in).getTime() + maximumMs;
      if (!Number.isFinite(automaticOut) || automaticOut > now.getTime()) continue;
      const clockOut = new Date(automaticOut).toISOString();
      const note = appendNote(
        entry.note,
        `Automatically closed after ${settings.max_shift_hours} hours`,
      );
      const after = { ...entry, clock_out: clockOut, note, source: "automatic" };
      db.prepare(
        "UPDATE time_entries SET clock_out = ?, source = 'automatic', note = ?, updated_at = ? WHERE id = ?",
      ).run(clockOut, note, nowIso, entry.id);
      recordEntryChange(
        entry.id,
        "auto_close",
        entry,
        after,
        `Open shift exceeded ${settings.max_shift_hours} hours`,
        nowIso,
      );
      closed++;
    }
  }

  if (settings.auto_merge_enabled === "true") {
    const maximumGapMs = Number(settings.auto_merge_minutes) * 60 * 1000;
    const employeeIds = db.prepare(
      "SELECT DISTINCT employee_id FROM time_entries",
    ).all() as { employee_id: string }[];
    for (const { employee_id: employeeId } of employeeIds) {
      const entries = db.prepare(
        "SELECT * FROM time_entries WHERE employee_id = ? ORDER BY clock_in",
      ).all(employeeId) as TimeEntry[];
      let previous: TimeEntry | undefined;
      for (const current of entries) {
        if (!previous || !previous.clock_out) {
          previous = current;
          continue;
        }
        const gapMs = new Date(current.clock_in).getTime() -
          new Date(previous.clock_out).getTime();
        if (gapMs < 0 || gapMs > maximumGapMs) {
          previous = current;
          continue;
        }
        const gapMinutes = Math.max(0, Math.round(gapMs / 60000));
        const note = appendNote(
          previous.note,
          `Automatically merged ${gapMinutes} minute interruption`,
        );
        const after = {
          ...previous,
          clock_out: current.clock_out,
          note,
          source: "automatic",
        };
        db.prepare("DELETE FROM time_entries WHERE id = ?").run(current.id);
        db.prepare(
          "UPDATE time_entries SET clock_out = ?, source = 'automatic', note = ?, updated_at = ? WHERE id = ?",
        ).run(current.clock_out, note, nowIso, previous.id);
        recordEntryChange(
          previous.id,
          "auto_merge",
          { kept: previous, merged: current },
          after,
          `Gap of ${gapMinutes} minutes was within the ${settings.auto_merge_minutes}-minute window`,
          nowIso,
        );
        previous = after;
        merged++;
      }
    }
  }
  return { merged, closed };
});

export const processClockEvent = db.transaction((
  deviceId: string,
  employeeId: string,
  eventType: "CLOCK_IN" | "CLOCK_OUT",
  occurredAt: string,
  eventId = crypto.randomUUID(),
) => {
  if (db.prepare("SELECT 1 FROM device_events WHERE id = ?").get(eventId)) {
    const open = !!db.prepare(
      "SELECT 1 FROM time_entries WHERE employee_id = ? AND clock_out IS NULL",
    ).get(employeeId);
    return { status: "duplicate", clockedIn: open, merged: false };
  }
  const employee = db.prepare(
    "SELECT id FROM employees WHERE id = ? AND active = 1",
  ).get(employeeId);
  if (!employee) throw new Error("Unknown or inactive employee");
  const settings = getSettings();
  const receivedAt = new Date().toISOString();
  db.prepare("INSERT INTO device_events VALUES (?, ?, ?, ?, ?, ?)").run(
    eventId,
    deviceId,
    employeeId,
    eventType,
    occurredAt,
    receivedAt,
  );
  const open = db.prepare(
    "SELECT * FROM time_entries WHERE employee_id = ? AND clock_out IS NULL",
  ).get(employeeId) as TimeEntry | undefined;

  if (eventType === "CLOCK_OUT") {
    if (!open) return { status: "ignored", clockedIn: false, merged: false };
    const safeClockOut = new Date(occurredAt) > new Date(open.clock_in)
      ? occurredAt
      : receivedAt;
    db.prepare(
      "UPDATE time_entries SET clock_out = ?, updated_at = ? WHERE id = ?",
    ).run(safeClockOut, receivedAt, open.id);
    return { status: "accepted", clockedIn: false, merged: false };
  }

  if (open) return { status: "ignored", clockedIn: true, merged: false };
  if (settings.auto_merge_enabled === "true") {
    const latest = db.prepare(
      "SELECT * FROM time_entries WHERE employee_id = ? AND clock_out IS NOT NULL ORDER BY clock_out DESC LIMIT 1",
    ).get(employeeId) as TimeEntry | undefined;
    if (latest?.clock_out) {
      const gapMs = new Date(occurredAt).getTime() -
        new Date(latest.clock_out).getTime();
      const maximumGapMs = Number(settings.auto_merge_minutes) * 60 * 1000;
      if (gapMs >= 0 && gapMs <= maximumGapMs) {
        const gapMinutes = Math.max(0, Math.round(gapMs / 60000));
        const note = appendNote(
          latest.note,
          `Automatically merged ${gapMinutes} minute interruption`,
        );
        db.prepare(
          "UPDATE time_entries SET clock_out = NULL, source = 'automatic', note = ?, updated_at = ? WHERE id = ?",
        ).run(note, receivedAt, latest.id);
        recordEntryChange(
          latest.id,
          "auto_reopen",
          latest,
          { ...latest, clock_out: null, note, source: "automatic" },
          `Clock-in arrived ${gapMinutes} minutes after clock-out`,
          receivedAt,
        );
        return { status: "accepted", clockedIn: true, merged: true };
      }
    }
  }
  db.prepare(
    "INSERT INTO time_entries VALUES (?, ?, ?, NULL, 'device', NULL, ?, ?)",
  ).run(crypto.randomUUID(), employeeId, occurredAt, receivedAt, receivedAt);
  return { status: "accepted", clockedIn: true, merged: false };
});

export function getDevices() {
  return db.prepare("SELECT * FROM devices ORDER BY name").all() as Device[];
}

export function getDeviceEvents(filters: { deviceId?: string; employeeId?: string; type?: string; search?: string } = {}) {
  const where: string[] = [];
  const values: string[] = [];
  if (filters.deviceId) { where.push("e.device_id = ?"); values.push(filters.deviceId); }
  if (filters.employeeId) { where.push("e.employee_id = ?"); values.push(filters.employeeId); }
  if (filters.type === "CLOCK_IN" || filters.type === "CLOCK_OUT") { where.push("e.event_type = ?"); values.push(filters.type); }
  if (filters.search) { where.push("(employee.name LIKE ? OR device.name LIKE ? OR e.id LIKE ?)"); values.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return db.prepare(`SELECT e.*, employee.name AS employee_name, device.name AS device_name FROM device_events e JOIN employees employee ON employee.id = e.employee_id JOIN devices device ON device.id = e.device_id ${clause} ORDER BY e.occurred_at DESC LIMIT 1000`).all(...values) as Array<{ id: string; device_id: string; employee_id: string; event_type: "CLOCK_IN" | "CLOCK_OUT"; occurred_at: string; received_at: string; employee_name: string; device_name: string }>;
}

export function findDeviceByToken(token: string) {
  return db.prepare("SELECT * FROM devices WHERE token_digest = ? AND approved = 1").get(
    sha256(token),
  ) as Device | undefined;
}

export const ingestDeviceEvent = db.transaction(
  (
    deviceId: string,
    event: {
      id: string;
      employeeId: string;
      type: "CLOCK_IN" | "CLOCK_OUT";
      occurredAt: string;
    },
  ) => {
    return processClockEvent(
      deviceId,
      event.employeeId,
      event.type,
      event.occurredAt,
      event.id,
    ).status;
  },
);

export function logTimeEntryChange(
  entryId: string,
  action: "manual_create" | "manual_edit" | "manual_delete",
  before: unknown,
  after: unknown,
  reason: string,
) {
  recordEntryChange(entryId, action, before, after, reason);
}

export function seedDevelopmentData() {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT OR IGNORE INTO employees VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)",
  ).run(
    "emp-demo-alex",
    "Alex Morgan",
    "alex@example.com",
    "Founder",
    sha256("1234"),
    "#5B8CFF",
    now,
    now,
  );
  db.prepare(
    "INSERT OR IGNORE INTO devices (id, name, token_digest, last_seen_at, firmware_version, ip_address, pending_events, created_at, approved) VALUES (?, ?, ?, NULL, NULL, NULL, 0, ?, 1)",
  ).run(
    "cyd-main",
    "Front desk",
    sha256(process.env.DEV_DEVICE_TOKEN || "dev-device-token"),
    now,
  );
}

// Demo records are opt-in so a production/LAN instance always starts clean.
// Set SEED_DEMO_DATA=true only when explicitly building a development fixture.
if (process.env.SEED_DEMO_DATA === "true") seedDevelopmentData();
