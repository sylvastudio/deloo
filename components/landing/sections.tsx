import { naira } from "@/lib/format";
import {
  APP_URL, CATEGORY_CHIP_LABELS, EXPLORE_URL, SHOOT_TYPES, WAITLIST_URL, categoryUrl, itemUrl, whatsappUrl,
} from "@/lib/landing/config";
import type { LandingData } from "@/lib/landing/data";
import { CtaPair } from "./chrome";
import { faqItems } from "./faq";
import s from "./landing.module.css";

export function Hero({ d }: { d: LandingData }) {
  return (
    <section className={`${s.wrap} ${s.hero}`} aria-labelledby="hero-title">
      <h1 id="hero-title" className={s.h1}>Camera, light and sound gear for your shoot, delivered across Lagos.</h1>
      <p className={s.sub}>
        Tell us what you&apos;re shooting and we&apos;ll suggest a kit, or pick gear yourself. Pay online, get it delivered or pick it up. No deposit.
      </p>
      <CtaPair className={s.heroCtas} />
      <p className={s.trust}>
        {d.minDayRateKobo != null && <><strong>From {naira(d.minDayRateKobo)} a day</strong> · </>}
        No deposit · Deloo Protection (damage cover) on every booking · Pay with Paystack
      </p>
    </section>
  );
}

export function Featured({ d }: { d: LandingData }) {
  return (
    <section id="gear" className={s.section} aria-labelledby="gear-title">
      <div className={s.wrap}>
        <h2 id="gear-title" className={s.h2}>Popular this week</h2>
        {d.featured.length ? (
          <ul className={s.grid}>
            {d.featured.map((it) => (
              <li key={it.id}>
                <a className={s.card} href={itemUrl(it.id)}>
                  {it.photoUrl ? (
                    // Plain <img>: Supabase already resizes to 400w, and next/image would need remotePatterns config.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={s.photo} src={it.photoUrl} alt={it.name} width={400} height={300} loading="lazy" decoding="async" />
                  ) : (
                    <div className={s.photo} aria-hidden="true" />
                  )}
                  <div className={s.cardBody}>
                    <p className={s.cardName}>{it.name}</p>
                    <p className={s.price}>{naira(it.dayRateKobo)} / day</p>
                    {it.depositKobo > 0 && <p className={s.small}>Deposit {naira(it.depositKobo)}, refundable</p>}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.lead}>Cameras, lenses, gimbals, lights and podcast mics, by the day. See today&apos;s prices in the app.</p>
        )}
        <a className={`${s.link} ${s.seeAll}`} href={EXPLORE_URL}>
          {d.itemCount ? `See all ${d.itemCount} items →` : "See all gear →"}
        </a>
        <CtaPair />
      </div>
    </section>
  );
}

export function Categories({ d }: { d: LandingData }) {
  if (!d.categories.length) return null;
  // Spec order (cameras first); categories without a landing label go last, in DB order.
  const order = Object.keys(CATEGORY_CHIP_LABELS);
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  const cats = [...d.categories].sort((a, b) => rank(a.key) - rank(b.key));
  return (
    <section className={s.section} aria-labelledby="cat-title">
      <div className={s.wrap}>
        <h2 id="cat-title" className={s.h2}>What you can rent</h2>
        <ul className={s.chips}>
          {cats.map((c) => (
            <li key={c.key}>
              <a className={s.chip} href={categoryUrl(c.key)}>{CATEGORY_CHIP_LABELS[c.key] ?? c.label} ({c.count})</a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function ShootTypes() {
  return (
    <section className={s.section} aria-labelledby="shoot-title">
      <div className={s.wrap}>
        <h2 id="shoot-title" className={s.h2}>Not sure what you need? Describe your shoot.</h2>
        <p className={s.lead}>Type it like you&apos;d tell a friend. We&apos;ll suggest the camera, lenses, light and sound, with a reason for each.</p>
        <p className={s.bubble}>&ldquo;3-person podcast in Lekki on Saturday, two cameras&rdquo;</p>
        <ul className={s.tiles}>
          {SHOOT_TYPES.map((t) => <li key={t} className={s.tile}>{t}</li>)}
        </ul>
        <a className={`${s.btn} ${s.accent}`} href={APP_URL} style={{ marginTop: 16 }}>Plan my shoot</a>
      </div>
    </section>
  );
}

const STEPS = [
  ["Plan or pick", "Describe your shoot or browse the gear."],
  ["Choose your days", "See what's free on a calendar. Rent from tomorrow."],
  ["Pay securely", "Card or bank transfer on Paystack. You see the rental, Deloo Protection (damage cover) and delivery before you pay. No deposit."],
  ["Receive and return", "We deliver or you pick up. We both take photos of the gear at handover and return, so there are no arguments later."],
] as const;

export function HowItWorks() {
  return (
    <section id="how" className={s.section} aria-labelledby="how-title">
      <div className={s.wrap}>
        <h2 id="how-title" className={s.h2}>How renting works</h2>
        <ol className={s.steps}>
          {STEPS.map(([title, body], i) => (
            <li key={title} className={s.step}>
              <span className={s.stepNum} aria-hidden="true">{i + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
        <CtaPair />
      </div>
    </section>
  );
}

export function Trust({ d }: { d: LandingData }) {
  return (
    <section className={s.section} aria-labelledby="trust-title">
      <div className={s.wrap}>
        <h2 id="trust-title" className={s.h2}>Your money and our gear, both protected</h2>
        <div className={s.points}>
          <div className={s.point}>
            <h3>No deposit</h3>
            <p>You pay the rental, Protection and delivery. Nothing is held back, so there&apos;s nothing to wait for after your shoot.</p>
          </div>
          <div className={s.point}>
            {/* TODO(founder): confirm the cap. Rates mirror private.item_protection_rate (0019). */}
            <h3>Deloo Protection (damage cover)</h3>
            <p>For 10–20% of the rental, depending on the gear (cameras 20%, lenses and lights 15%, audio and stands 10%), accidental damage is covered up to a limit, so one mistake won&apos;t cost you the full price of a camera.</p>
          </div>
          <div className={s.point}>
            <h3>Handover photos</h3>
            <p>At delivery and return, you and our rider photograph each item. No arguments later about who did what.</p>
          </div>
        </div>

        <h3 className={s.zonesTitle}>Delivery across Lagos</h3>
        {d.zones.length ? (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th scope="col">Zone</th><th scope="col">Areas</th><th scope="col">Drop-off and collection</th></tr></thead>
              <tbody>
                {d.zones.map((z) => (
                  <tr key={z.name}><th scope="row">{z.name}</th><td>{z.areas.join(", ")}</td><td>{naira(z.priceKobo * 2)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={s.muted}>We deliver across Lagos. You see the price for your area before you pay.</p>
        )}
        <p className={s.small} style={{ marginTop: 12 }}>
          Pickup is free{d.pickupArea ? ` from ${d.pickupArea}` : ""}.
        </p>
      </div>
    </section>
  );
}

export function Faq({ d }: { d: LandingData }) {
  return (
    <section id="faq" className={s.section} aria-labelledby="faq-title">
      <div className={s.wrap}>
        <h2 id="faq-title" className={s.h2}>Questions people ask</h2>
        <div className={s.faq}>
          {faqItems(d).map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
        <CtaPair />
      </div>
    </section>
  );
}

export function RentOut() {
  return (
    <section className={s.section} aria-labelledby="owner-title">
      <div className={s.wrap}>
        <div className={s.band}>
          <h2 id="owner-title" className={s.h2}>Own gear that sits idle?</h2>
          <p>Soon you&apos;ll be able to rent it out through Deloo. Leave your WhatsApp number and we&apos;ll tell you first.</p>
          <a className={`${s.btn} ${s.secondary}`} href={WAITLIST_URL}>Join the waitlist</a>
        </div>
      </div>
    </section>
  );
}

export function WhatsAppBand({ d }: { d: LandingData }) {
  const wa = whatsappUrl(d.supportWhatsapp);
  return (
    <section className={s.section} aria-label="WhatsApp support">
      <div className={s.wrap}>
        <div className={s.band}>
          <p><strong>Questions? Chat with us on WhatsApp.</strong> We reply between 8am and 8pm.</p>
          {wa && <a className={`${s.btn} ${s.primary}`} href={wa}>Chat on WhatsApp</a>}
        </div>
      </div>
    </section>
  );
}
