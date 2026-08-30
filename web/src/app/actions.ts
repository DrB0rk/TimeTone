"use server";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSession, requireAuth, SESSION_COOKIE } from "@/lib/auth";
import { db, sha256 } from "@/lib/db";

const employeeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().or(z.literal("")),
  role: z.string().trim().max(80),
  code: z.string().regex(/^\d{4,8}$/),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export async function login(formData: FormData) {
  const password = String(formData.get("password") || "");
  const expected = process.env.ADMIN_PASSWORD || "timekeep";
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
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

export async function addManualEntry(formData: FormData) {
  await requireAuth();
  const employeeId = z.string().min(1).parse(formData.get("employee_id"));
  const clockIn = new Date(z.string().min(1).parse(formData.get("clock_in")))
    .toISOString();
  const clockOutValue = String(formData.get("clock_out") || "");
  const clockOut = clockOutValue ? new Date(clockOutValue).toISOString() : null;
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
