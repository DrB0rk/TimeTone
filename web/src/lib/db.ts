import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AppSettings, Device, Employee, TimeEntry } from "@/lib/domain";

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
  CREATE INDEX IF NOT EXISTS idx_entries_employee_time ON time_entries(employee_id, clock_in);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_entry ON time_entries(employee_id) WHERE clock_out IS NULL;
`);

try {
  db.exec("ALTER TABLE devices ADD COLUMN approved INTEGER NOT NULL DEFAULT 1");
} catch {
  // Existing databases already have the approval column.
}

const defaults = {
  company_name: "Studio North",
  timezone: "Europe/Amsterdam",
  rounding_minutes: "15",
  rounding_mode: "nearest",
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

export function getDevices() {
  return db.prepare("SELECT * FROM devices ORDER BY name").all() as Device[];
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
    if (db.prepare("SELECT 1 FROM device_events WHERE id = ?").get(event.id)) {
      return "duplicate";
    }
    const employee = db.prepare(
      "SELECT id FROM employees WHERE id = ? AND active = 1",
    ).get(event.employeeId);
    if (!employee) throw new Error("Unknown or inactive employee");
    const now = new Date().toISOString();
    db.prepare("INSERT INTO device_events VALUES (?, ?, ?, ?, ?, ?)").run(
      event.id,
      deviceId,
      event.employeeId,
      event.type,
      event.occurredAt,
      now,
    );
    const open = db.prepare(
      "SELECT id, clock_in FROM time_entries WHERE employee_id = ? AND clock_out IS NULL",
    ).get(event.employeeId) as { id: string; clock_in: string } | undefined;
    if (event.type === "CLOCK_IN" && !open) {
      db.prepare(
        "INSERT INTO time_entries VALUES (?, ?, ?, NULL, 'device', NULL, ?, ?)",
      ).run(crypto.randomUUID(), event.employeeId, event.occurredAt, now, now);
    } else if (event.type === "CLOCK_OUT" && open) {
      const clockOut = new Date(event.occurredAt) > new Date(open.clock_in)
        ? event.occurredAt
        : now;
      db.prepare(
        "UPDATE time_entries SET clock_out = ?, updated_at = ? WHERE id = ?",
      ).run(clockOut, now, open.id);
    }
    return "accepted";
  },
);

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
