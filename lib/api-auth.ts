import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/**
 * For API routes called by the mobile app: it sends the user's Supabase access token as
 * `Authorization: Bearer …`. Returns a client that acts as that user (so RLS applies) and the user,
 * or a 401 Response to return as-is.
 */
export async function userFromBearer(request: Request): Promise<{ supabase: SupabaseClient; user: User } | Response> {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return Response.json({ error: "Sign in again." }, { status: 401 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "Sign in again." }, { status: 401 });
  return { supabase, user: data.user };
}
