import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/components/register-sw";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deloo",
  description: "Camera, light and sound gear for your shoot, delivered across Lagos. Rent by the day, no deposit, pay with Paystack.",
  appleWebApp: { capable: true, title: "Deloo", statusBarStyle: "default" },
  // ?v= busts browser favicon caches (they ignore normal reloads); bump it when the icon changes.
  icons: {
    icon: [{ url: "/favicon.ico?v=2", sizes: "48x48" }, { url: "/icons/icon-192.png?v=2", type: "image/png", sizes: "192x192" }],
    apple: "/icons/apple-touch-icon.png?v=2",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0F6B73" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1215" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-NG" className={fontVariables}>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
