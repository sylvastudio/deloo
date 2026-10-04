import * as Sentry from "@sentry/nextjs";
import { SENTRY_PRIVACY } from "@/lib/sentry-privacy";

/**
 * Server-side error tracking (Sentry). Off until NEXT_PUBLIC_SENTRY_DSN is set, so local dev and
 * deploys without a Sentry project behave exactly as before. No personal data is sent.
 */
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({ dsn, dataCollection: SENTRY_PRIVACY, tracesSampleRate: 0.1, environment: process.env.CONTEXT ?? process.env.NODE_ENV });
}

export const onRequestError = Sentry.captureRequestError;
