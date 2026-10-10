import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * deloo.space is the public landing page plus the APIs the renter app calls; the renter app itself is
 * a separate site (app.deloo.space, the Expo web build). Only the staff portal needs a session here.
 */
const PROTECTED = ["/admin", "/welcome"];

/** The staff portal's own host. Its paths map onto app/admin: admin.deloo.space/bookings → /admin/bookings. */
const ADMIN_HOSTS = ["admin.deloo.space", "admin.localhost"];
/** Paths served as-is on the admin host (sign-in, auth callbacks, APIs, and /admin itself). */
const ADMIN_PASSTHROUGH = ["/admin", "/login", "/auth", "/reset-password", "/welcome", "/offline", "/api", "/pay"];

/** The old event-planning web pages moved into the renter app. Main host only (admin has its own /bookings). */
const MOVED_TO_APP = ["/plan", "/bookings", "/gear", "/account", "/onboarding", "/signup"];
const APP_URL = "https://app.deloo.space";

/** Browser origins allowed to call /api/* (the web renter app; Expo's dev server). Extra ones: CORS_ORIGINS="a,b". */
const API_ORIGINS = ["https://app.deloo.space", "http://localhost:8081", ...(process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)];

const under = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(p + "/"));

function cors(response: NextResponse, origin: string | null) {
  if (origin && API_ORIGINS.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.headers.set("Access-Control-Max-Age", "86400");
  }
  return response;
}

/**
 * Refreshes the Supabase session cookie, sends signed-out visitors of the staff pages to /login, and on
 * the admin host rewrites /x to /admin/x. API calls from the renter web app get CORS headers (they
 * authenticate with a Bearer token, not cookies).
 */
export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const path = request.nextUrl.pathname;

  if (path.startsWith("/api/")) {
    const origin = request.headers.get("origin");
    if (request.method === "OPTIONS") return cors(new NextResponse(null, { status: 204 }), origin);
    return cors(NextResponse.next({ request }), origin);
  }

  const adminHost = ADMIN_HOSTS.includes(host);
  if (!adminHost && under(path, MOVED_TO_APP)) return NextResponse.redirect(APP_URL);
  // Rewrite target on the admin host (null = serve the path unchanged).
  const rewriteTo = adminHost && !under(path, ADMIN_PASSTHROUGH) ? `/admin${path === "/" ? "" : path}` : null;
  const target = rewriteTo ?? path;

  // Public pages (the landing page, /pay/return, sign-in) need no session work at all.
  if (!under(target, PROTECTED) && !under(target, ["/login", "/auth", "/reset-password"])) {
    return rewriteTo ? NextResponse.rewrite(new URL(rewriteTo, request.url), { request }) : NextResponse.next({ request });
  }

  // Build the pass-through response; the cookie refresh below may rebuild it with new cookies.
  const pass = () => {
    if (!rewriteTo) return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = rewriteTo;
    return NextResponse.rewrite(url, { request });
  };

  let response = pass();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = pass();
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims && under(target, PROTECTED)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // After sign-in, go back to where they were. On the admin host, /admin/x is served as-is.
    url.search = `?next=${encodeURIComponent(target)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Skip static files, the service worker and the manifest.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\\.(?:png|jpg|svg|webp|ico)$).*)"],
};
