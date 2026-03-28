import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const isWA = host === "wa.on-notice.xyz" || host === "wa.localhost:3000";

  if (isWA) {
    const url = request.nextUrl.clone();
    // Rewrite /  → /wa, /foo → /wa/foo
    // Avoid double-prefixing if already under /wa
    if (!url.pathname.startsWith("/wa")) {
      url.pathname = "/wa" + url.pathname;
    }
    const response = NextResponse.rewrite(url, {
      request: { headers: new Headers({ ...Object.fromEntries(request.headers), "x-is-wa": "1" }) },
    });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on all paths except Next.js internals and static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
