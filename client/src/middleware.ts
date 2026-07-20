import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const accessCookieName = "marimail_access";

export function middleware(request: NextRequest) {
  const isAuthenticated = request.cookies.has(accessCookieName);

  if (request.nextUrl.pathname.startsWith("/dashboard") && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};