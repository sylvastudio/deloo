import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Lets phones on the same Wi-Fi load the dev server (npm run dev -- -H 0.0.0.0).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  // Version skew: Netlify sets DEPLOY_ID for each deploy. With it, a page left open across a deploy
  // reloads on its next navigation instead of calling Server Actions the new build doesn't have.
  deploymentId: process.env.DEPLOY_ID || undefined,
  // Baseline security headers. (A full Content-Security-Policy needs care with Supabase, Turnstile and Google Fonts; later.)
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // Camera: staff photograph gear at handover from the admin portal.
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
      ],
    }];
  },
};

// Source maps upload only when SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT are set (e.g. in Netlify).
export default withSentryConfig(nextConfig, { silent: true, telemetry: false });
