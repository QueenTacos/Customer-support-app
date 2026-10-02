import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_TOKEN_RE } from "@/lib/auth/constants";

/**
 * First gate: every route except /login needs a well-formed session cookie.
 * This is a fast optimistic check only — every page and Server Action then
 * verifies the session against the database (lib/auth/session.ts).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const hasCookie = !!token && SESSION_TOKEN_RE.test(token);

  if (pathname === "/login") return NextResponse.next();

  if (!hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/" && pathname !== "/dashboard") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|icon.svg).*)",
  ],
};
