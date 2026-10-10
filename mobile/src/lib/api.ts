import { supabase } from './supabase';

/**
 * Calls the web app's API routes (deloo.space/api/…) as the signed-in user.
 * In development EXPO_PUBLIC_API_URL points at the Next.js dev server on this network.
 */
const BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'https://deloo.space').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function call<T>(method: 'GET' | 'POST', path: string, body: unknown, timeoutMs: number): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ApiError(0, 'No connection. Check your data and try again.');
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, json.error ?? 'Something went wrong. Try again.');
  return json;
}

export function api<T>(path: string, body: unknown, timeoutMs = 30000): Promise<T> {
  return call<T>('POST', path, body, timeoutMs);
}

export function apiGet<T>(path: string, timeoutMs = 30000): Promise<T> {
  return call<T>('GET', path, undefined, timeoutMs);
}
