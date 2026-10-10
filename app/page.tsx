import type { Metadata } from "next";
import { Footer, TopBar } from "@/components/landing/chrome";
import { LandingJsonLd } from "@/components/landing/json-ld";
import s from "@/components/landing/landing.module.css";
import {
  Categories, Faq, Featured, Hero, HowItWorks, RentOut, ShootTypes, Trust, WhatsAppBand,
} from "@/components/landing/sections";
import { APP_URL, SITE_URL } from "@/lib/landing/config";
import { getLandingData } from "@/lib/landing/data";

/** Public catalogue changes (prices, stock) show within an hour; nobody's visit queries the DB. */
export const revalidate = 3600;

const TITLE = "Deloo: Camera, light and sound gear rental in Lagos";
const OG_IMAGE = { url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: "Deloo: camera, light and sound gear rental in Lagos" };
const DESCRIPTION =
  "Rent Sony FX3, lenses, gimbals, lights and podcast mics by the day in Lagos. Delivery across the Mainland and Island, refundable deposit, pay with Paystack.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", siteName: "Deloo", title: TITLE, description: DESCRIPTION, locale: "en_NG", images: [OG_IMAGE] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_IMAGE.url] },
};

/** deloo.space landing page (docs/ux-landing-and-web.md §1). Server-rendered, no client components. */
export default async function Landing() {
  const d = await getLandingData();
  return (
    <div className={s.page} lang="en-NG">
      <a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>
      <TopBar />
      <main id="main">
        <Hero d={d} />
        <div className={s.afterHero}>
          <Featured d={d} />
          <Categories d={d} />
          <ShootTypes />
          <HowItWorks />
          <Trust d={d} />
          <Faq d={d} />
          <RentOut />
          <WhatsAppBand d={d} />
          <div className={s.stickyBar}>
            <a className={`${s.btn} ${s.primary}`} href={APP_URL}>Rent now</a>
          </div>
        </div>
      </main>
      <Footer supportWhatsapp={d.supportWhatsapp} area={d.pickupArea} />
      <LandingJsonLd d={d} />
    </div>
  );
}
