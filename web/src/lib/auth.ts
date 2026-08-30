import { jwtVerify, SignJWT } from "jose";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, sha256 } from "@/lib/db";

const secret = new TextEncoder().encode(
  process.env.ADMIN_SECRET || "development-secret-change-me",
);
export const SESSION_COOKIE = "timekeep_session";

function passwordDigest() {
  return (db.prepare("SELECT value FROM settings WHERE key = 'admin_password_digest'").get() as { value: string } | undefined)?.value;
}

export function verifyAdminPassword(password: string) {
  const stored = passwordDigest();
  if (stored) return cryptoSafeEqual(sha256(password), stored);
  return cryptoSafeEqual(password, process.env.ADMIN_PASSWORD || "timekeep");
}

function cryptoSafeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function createSession() {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret);
}

export async function verifySession(token?: string) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export async function requireAuth() {
  const store = await cookies();
  if (!(await verifySession(store.get(SESSION_COOKIE)?.value))) {
    redirect("/login");
  }
}
