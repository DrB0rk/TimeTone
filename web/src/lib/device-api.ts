import { findDeviceByToken } from "@/lib/db";

export function authenticateDevice(request: Request) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  return findDeviceByToken(header.slice(7)) || null;
}

export function unauthorized() {
  return Response.json({ error: "Invalid device token" }, { status: 401 });
}
