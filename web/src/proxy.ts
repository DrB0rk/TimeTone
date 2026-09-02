import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const authenticated = await verifySession(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (!authenticated && request.nextUrl.pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (authenticated && request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Public assets (SVG logo, fonts, styles, and browser bundles) must not be
    // redirected to /login; only application routes and protected APIs need
    // session enforcement.
    "/((?!api/device|api/health|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
