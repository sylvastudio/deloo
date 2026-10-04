import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Lets phones on the same Wi-Fi load the dev server (npm run dev -- -H 0.0.0.0).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  // Baseline security headers. (A full Content-Security-Policy needs care with Supabase, Turnstile and Google Fonts; later.)
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ],
    }];
  },
};

// Source maps upload only when SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT are set (e.g. in Netlify).
export default withSentryConfig(nextConfig, { silent: true, telemetry: false });
