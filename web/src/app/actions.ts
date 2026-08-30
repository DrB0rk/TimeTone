"use server";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSession, requireAuth, SESSION_COOKIE, verifyAdminPassword } from "@/lib/auth";
import { db, sha256 } from "@/lib/db";

const employeeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().or(z.literal("")),
  role: z.string().trim().max(80),
  code: z.string().regex(/^[ABCD]{4}$/),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});
const employeeUpdateSchema = employeeSchema.extend({
  id: z.string().min(1),
  code: z.string().regex(/^[ABCD]{4}$/).or(z.literal("")),
});

export async function login(formData: FormData) {
  const password = String(formData.get("password") || "");
  if (!verifyAdminPassword(password)) {
    redirect("/login?error=1");
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSession(), {
    httpOnly: true,
    sameSite: "lax",
    // Plain HTTP is useful for a trusted LAN install. Enable explicitly when
    // the service is served through HTTPS (see COOKIE_SECURE in .env.example).
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 43200,
  });
  redirect("/");
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function createEmployee(formData: FormData) {
  await requireAuth();
  const data = employeeSchema.parse(Object.fromEntries(formData));
  const now = new Date().toISOString();
  db.prepare("INSERT INTO employees VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)").run(
    crypto.randomUUID(),
    data.name,
    data.email || null,
    data.role || null,
    sha256(data.code),
    data.color,
    now,
    now,
  );
  revalidatePath("/employees");
  revalidatePath("/");
}

export async function toggleEmployee(formData: FormData) {
  await requireAuth();
  const id = String(formData.get("id"));
  db.prepare(
    "UPDATE employees SET active = CASE active WHEN 1 THEN 0 ELSE 1 END, updated_at = ? WHERE id = ?",
  ).run(new Date().toISOString(), id);
  revalidatePath("/employees");
}

export async function updateEmployee(formData: FormData) {
  await requireAuth();
  const data = employeeUpdateSchema.parse(Object.fromEntries(formData));
  const now = new Date().toISOString();
  if (data.code) {
    db.prepare("UPDATE employees SET name = ?, email = ?, role = ?, code_digest = ?, color = ?, updated_at = ? WHERE id = ?")
      .run(data.name, data.email || null, data.role || null, sha256(data.code), data.color, now, data.id);
  } else {
    db.prepare("UPDATE employees SET name = ?, email = ?, role = ?, color = ?, updated_at = ? WHERE id = ?")
      .run(data.name, data.email || null, data.role || null, data.color, now, data.id);
  }
  revalidatePath("/employees");
  revalidatePath("/");
}

export async function approveDevice(formData: FormData) {
  await requireAuth();
  const id = z.string().min(1).parse(formData.get("id"));
  db.prepare("UPDATE devices SET approved = 1 WHERE id = ?").run(id);
  revalidatePath("/devices");
  revalidatePath("/");
}

export async function rejectDevice(formData: FormData) {
  await requireAuth();
  const id = z.string().min(1).parse(formData.get("id"));
  db.prepare("DELETE FROM devices WHERE id = ? AND approved = 0").run(id);
  revalidatePath("/devices");
}

export async function saveSettings(formData: FormData) {
  await requireAuth();
  const values = {
    company_name: z.string().trim().min(2).max(80).parse(
      formData.get("company_name"),
    ),
    timezone: z.string().trim().min(3).max(80).parse(formData.get("timezone")),
    rounding_minutes: z.enum(["1", "5", "10", "15", "30"]).parse(
      formData.get("rounding_minutes"),
    ),
    rounding_mode: z.enum(["nearest", "up", "down"]).parse(
      formData.get("rounding_mode"),
    ),
  };
  const statement = db.prepare(
    "INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  db.transaction(() =>
    Object.entries(values).forEach(([key, value]) => statement.run(key, value))
  )();
  revalidatePath("/");
  revalidatePath("/settings");
}

export async function changePassword(formData: FormData) {
  await requireAuth();
  const current = String(formData.get("current_password") || "");
  const next = String(formData.get("new_password") || "");
  const confirmation = String(formData.get("confirm_password") || "");
  if (!verifyAdminPassword(current)) redirect("/settings?password=incorrect");
  if (next.length < 8 || next.length > 128 || next !== confirmation) {
    redirect("/settings?password=invalid");
  }
  db.prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run("admin_password_digest", sha256(next));
  redirect("/settings?password=changed");
}

export async function addManualEntry(formData: FormData) {
  await requireAuth();
  const employeeId = z.string().min(1).parse(formData.get("employee_id"));
  const clockIn = parseEntryDate(formData.get("clock_in"), "Clock-in");
  const clockOutValue = String(formData.get("clock_out") || "");
  const clockOut = clockOutValue
    ? parseEntryDate(clockOutValue, "Clock-out")
    : null;
  const note = z.string().max(200).parse(String(formData.get("note") || ""));
  if (clockOut && new Date(clockOut) <= new Date(clockIn)) {
    throw new Error("Clock-out must be after clock-in");
  }
  const now = new Date().toISOString();
  db.prepare("INSERT INTO time_entries VALUES (?, ?, ?, ?, 'manual', ?, ?, ?)")
    .run(
      crypto.randomUUID(),
      employeeId,
      clockIn,
      clockOut,
      note || null,
      now,
      now,
    );
  revalidatePath("/entries");
  revalidatePath("/");
}

export async function updateTimeEntry(formData: FormData) {
  await requireAuth();
  const id = z.string().min(1).parse(formData.get("id"));
  const employeeId = z.string().min(1).parse(formData.get("employee_id"));
  const clockIn = parseEntryDate(formData.get("clock_in"), "Clock-in");
  const clockOutValue = String(formData.get("clock_out") || "");
  const clockOut = clockOutValue
    ? parseEntryDate(clockOutValue, "Clock-out")
    : null;
  const note = z.string().max(200).parse(String(formData.get("note") || ""));

  if (!db.prepare("SELECT id FROM time_entries WHERE id = ?").get(id)) {
    throw new Error("Time entry not found");
  }
  if (!db.prepare("SELECT id FROM employees WHERE id = ?").get(employeeId)) {
    throw new Error("Employee not found");
  }
  if (clockOut && new Date(clockOut) <= new Date(clockIn)) {
    throw new Error("Clock-out must be after clock-in");
  }
  const otherOpen = db.prepare(
    "SELECT id FROM time_entries WHERE employee_id = ? AND clock_out IS NULL AND id != ?",
  ).get(employeeId, id);
  if (!clockOut && otherOpen) {
    throw new Error("This employee already has an open time entry");
  }

  db.prepare(
    "UPDATE time_entries SET employee_id = ?, clock_in = ?, clock_out = ?, note = ?, updated_at = ? WHERE id = ?",
  ).run(employeeId, clockIn, clockOut, note || null, new Date().toISOString(), id);
  revalidatePath("/entries");
  revalidatePath("/");
  revalidatePath("/reports");
}

function parseEntryDate(value: FormDataEntryValue | null, label: string) {
  const raw = z.string().min(1).parse(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is not valid`);
  return date.toISOString();
}
