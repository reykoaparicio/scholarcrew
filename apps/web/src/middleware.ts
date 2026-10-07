import { type NextRequest, NextResponse } from "next/server";
import { buildCsp } from "./server/csp";
import { SESSION_COOKIE_NAME, isProtectedPath } from "./server/protected";

export function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV !== "production" });
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  let response: NextResponse;
  if (isProtectedPath(pathname) && !req.cookies.get(SESSION_COOKIE_NAME)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    response = NextResponse.redirect(url);
  } else {
    response = NextResponse.next({ request: { headers } });
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
