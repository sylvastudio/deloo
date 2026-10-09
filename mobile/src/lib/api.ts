import { supabase } from './supabase';

/**
 * Calls the web app's API routes (deloo.space/api/…) as the signed-in user.
 * In development EXPO_PUBLIC_API_URL points at the Next.js dev server on this network.
 */
const BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'https://deloo.space').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, body: unknown, timeoutMs = 30000): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ApiError(0, 'No connection. Check your data and try again.');
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, json.error ?? 'Something went wrong. Try again.');
  return json;
}
