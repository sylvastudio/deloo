"use client";
import { useState } from "react";

/** The booking ref with a copy button (for WhatsApp, Paystack searches, bank transfers). */
export function CopyRef({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="btn btn-quiet btn-sm mono" title="Copy the booking ref"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked (http, or permission): the ref is on screen to copy by hand.
        }
      }}>
      {value} <span className="muted" aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
