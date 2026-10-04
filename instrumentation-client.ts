import * as Sentry from "@sentry/nextjs";
import { SENTRY_PRIVACY } from "@/lib/sentry-privacy";

// Browser error tracking (Sentry). Off until NEXT_PUBLIC_SENTRY_DSN is set. No personal data, no session replay.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) Sentry.init({ dsn, dataCollection: SENTRY_PRIVACY, tracesSampleRate: 0.1 });

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
