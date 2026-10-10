import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/signup", "/auth", "/offline", "/pay"];

/** The staff portal's own host. Its paths map onto app/admin: admin.deloo.space/bookings → /admin/bookings. */
const ADMIN_HOSTS = ["admin.deloo.space", "admin.localhost"];
/** Paths served as-is on the admin host (sign-in, auth callbacks, APIs, and /admin itself). */
const ADMIN_PASSTHROUGH = ["/admin", "/login", "/signup", "/auth", "/reset-password", "/welcome", "/offline", "/api", "/pay"];

const under = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(p + "/"));

/**
 * Refreshes the Supabase session cookie on every request and sends signed-out visitors to /login.
 * On the admin host, also rewrites /x to /admin/x.
 */
export async function proxy(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const path = request.nextUrl.pathname;
  const adminHost = ADMIN_HOSTS.includes(host);
  // Rewrite target on the admin host (null = serve the path unchanged).
  const rewriteTo = adminHost && !under(path, ADMIN_PASSTHROUGH) ? `/admin${path === "/" ? "" : path}` : null;

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
  // API routes answer 401 themselves; only pages redirect to sign-in.
  if (!data?.claims && !path.startsWith("/api/") && !under(path, PUBLIC)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // After sign-in, go back to where they were. On the admin host, /admin/x is served as-is.
    const back = rewriteTo ?? path;
    url.search = back === "/" ? "" : `?next=${encodeURIComponent(back)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Skip static files, the service worker and the manifest.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|.*\\.(?:png|jpg|svg|webp|ico)$).*)"],
};
