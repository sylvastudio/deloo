"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

/**
 * Cloudflare Turnstile bot check for sign-up and sign-in. Supabase Auth verifies the token itself
 * (Authentication → Attack Protection). Renders nothing until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
 * Puts the token in a hidden "captcha" field; `resetSignal` changing (e.g. after a failed attempt) gets a fresh one.
 */
export function Turnstile({ resetSignal }: { resetSignal?: unknown }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const api = window.turnstile;
    if (!SITE_KEY || !box.current || widget.current || !(loaded || api)) return;
    widget.current = api!.render(box.current, {
      sitekey: SITE_KEY, theme: "auto", size: "flexible",
      callback: (t: string) => setToken(t), "expired-callback": () => setToken(""), "error-callback": () => setToken(""),
    });
    return () => { if (widget.current) window.turnstile?.remove(widget.current); widget.current = null; };
  }, [loaded]);

  // Tokens work once: after each attempt, ask for a new one (Turnstile calls back with it).
  useEffect(() => { if (widget.current) window.turnstile?.reset(widget.current); }, [resetSignal]);

  if (!SITE_KEY) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={() => setLoaded(true)} />
      <div ref={box} style={{ minHeight: 65 }} />
      <input type="hidden" name="captcha" value={token} />
    </>
  );
}
