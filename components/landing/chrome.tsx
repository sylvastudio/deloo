import Link from "next/link";
import { APK_SIZE_MB, APK_URL, APP_URL, whatsappUrl } from "@/lib/landing/config";
import s from "./landing.module.css";

/** Every CTA pair: "Rent on the web" (primary) + "Get the Android app" (secondary) with the install note. */
export function CtaPair({ className }: { className?: string }) {
  return (
    <div className={`${s.ctaPair} ${className ?? ""}`}>
      <a className={`${s.btn} ${s.primary}`} href={APP_URL}>Rent on the web</a>
      <div className={s.apk}>
        <a className={`${s.btn} ${s.secondary}`} href={APK_URL}>Get the Android app</a>
        <p className={s.apkNote}>
          Android 8+{APK_SIZE_MB ? ` · about ${APK_SIZE_MB} MB` : ""} · your phone will ask to allow installs from this browser
        </p>
      </div>
    </div>
  );
}

export function TopBar({ home = true }: { home?: boolean }) {
  const at = (hash: string) => (home ? hash : `/${hash}`);
  return (
    <header className={s.top}>
      <div className={`${s.wrap} ${s.topInner}`}>
        <Link href="/" className={s.wordmark} aria-label="Deloo home">deloo<span>.</span></Link>
        <nav className={s.nav} aria-label="Main">
          <a href={at("#gear")}>Gear</a>
          <a href={at("#how")}>How it works</a>
          <a href={at("#faq")}>FAQ</a>
        </nav>
        <a className={`${s.btn} ${s.primary} ${s.topCta}`} href={APP_URL}>Rent now</a>
      </div>
    </header>
  );
}

export function Footer({ supportWhatsapp, area }: { supportWhatsapp: string; area: string }) {
  const wa = whatsappUrl(supportWhatsapp);
  return (
    <footer className={s.footer} id="contact">
      <div className={s.wrap}>
        <div className={s.footCols}>
          <div>
            <Link href="/" className={s.wordmark}>deloo<span>.</span></Link>
            <p className={s.muted}>Gear rental for creators in Lagos</p>
          </div>
          <div>
            <h3>Policies</h3>
            <ul>
              <li><Link href="/terms">Terms of rental</Link></li>
              <li><Link href="/privacy">Privacy</Link></li>
              <li><Link href="/terms#cancellation">Cancellation and refunds</Link></li>
              <li><Link href="/terms#protection">Deloo Protection</Link></li>
            </ul>
          </div>
          <div>
            <h3>Contact and apps</h3>
            <ul>
              {wa && <li><a href={wa}>WhatsApp</a></li>}
              {supportWhatsapp && <li><a href={`tel:${supportWhatsapp.replace(/[^\d+]/g, "")}`}>Call {supportWhatsapp}</a></li>}
              <li><a href={APP_URL}>Rent on the web</a></li>
              <li><a href={APK_URL}>Android app</a></li>
            </ul>
          </div>
        </div>
        <div className={s.footBottom}>
          <span>© 2026 Deloo · {area ? `${area}, ` : ""}Lagos, Nigeria</span>
          <a href="/login">Staff sign-in</a>
        </div>
      </div>
    </footer>
  );
}
