import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databasePath = path.join("/tmp", `timekeep-rules-${process.pid}.db`);
process.env.DATABASE_PATH = databasePath;

let dbModule: typeof import("./db");

beforeAll(async () => {
  dbModule = await import("./db");
  const now = "2026-08-30T08:00:00.000Z";
  dbModule.db.prepare("INSERT INTO employees VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)").run("employee-1", "Morgan", null, null, dbModule.sha256("ABCD"), "#000000", now, now);
  dbModule.db.prepare("INSERT INTO devices VALUES (?, ?, ?, NULL, NULL, NULL, 0, ?, 1)").run("device-1", "Test terminal", dbModule.sha256("device-token"), now);
  const set = dbModule.db.prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  set.run("auto_merge_enabled", "true");
  set.run("auto_merge_minutes", "5");
  set.run("auto_close_enabled", "true");
  set.run("max_shift_hours", "12");
});

afterAll(() => {
  dbModule?.db.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(`${databasePath}${suffix}`); } catch { /* already removed */ }
  }
});

describe("automatic time management", () => {
  it("reopens the prior shift when the next clock-in is inside the merge window", () => {
    const first = dbModule.processClockEvent("device-1", "employee-1", "CLOCK_IN", "2026-08-30T08:00:00.000Z", "event-in");
    expect(first.clockedIn).toBe(true);
    dbModule.processClockEvent("device-1", "employee-1", "CLOCK_OUT", "2026-08-30T10:00:00.000Z", "event-out");
    const merged = dbModule.processClockEvent("device-1", "employee-1", "CLOCK_IN", "2026-08-30T10:03:00.000Z", "event-reopen");
    expect(merged).toMatchObject({ clockedIn: true, merged: true });
    const entry = dbModule.db.prepare("SELECT clock_out, source, note FROM time_entries WHERE employee_id = ?").get("employee-1") as { clock_out: string | null; source: string; note: string };
    expect(entry.clock_out).toBeNull();
    expect(entry.source).toBe("automatic");
    expect(entry.note).toContain("3 minute interruption");
  });

  it("automatically closes an excessively old open shift and writes an audit record", () => {
    const result = dbModule.runTimeMaintenance(new Date("2026-08-31T00:30:00.000Z"));
    expect(result.closed).toBe(1);
    const entry = dbModule.db.prepare("SELECT clock_out FROM time_entries WHERE employee_id = ?").get("employee-1") as { clock_out: string };
    expect(entry.clock_out).toBe("2026-08-30T20:00:00.000Z");
    const changes = dbModule.getEntryChanges();
    expect(changes.some((change) => change.action === "auto_close")).toBe(true);
  });
});
