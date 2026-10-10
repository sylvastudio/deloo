import type { Metadata, Viewport } from "next";
import { RegisterSW } from "@/components/register-sw";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deloo",
  description: "Camera, light and sound gear for your shoot, delivered across Lagos. Rent by the day, no deposit, pay with Paystack.",
  appleWebApp: { capable: true, title: "Deloo", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
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
