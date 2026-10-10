import { naira } from "@/lib/format";
import {
  APP_URL, CATEGORY_CHIP_LABELS, EXPLORE_URL, SHOOT_TYPES, WAITLIST_URL, categoryUrl, itemUrl, whatsappUrl,
} from "@/lib/landing/config";
import type { LandingData } from "@/lib/landing/data";
import { CtaPair } from "./chrome";
import { faqItems } from "./faq";
import s from "./landing.module.css";

// Plain <img> throughout: Supabase already resizes, and next/image would need remotePatterns config.
/* eslint-disable @next/next/no-img-element */

export function Hero({ d }: { d: LandingData }) {
  const shot = d.featured.find((it) => it.photoLargeUrl);
  return (
    <section className={`${s.wrap} ${s.hero}`} aria-labelledby="hero-title">
      <div className={s.heroText}>
        <h1 id="hero-title" className={s.h1}>Camera, light and sound gear for your shoot, delivered across Lagos.</h1>
        <p className={s.sub}>
          Tell us what you&apos;re shooting and we&apos;ll suggest a kit, or pick gear yourself. Pay online, get it delivered or pick it up. No deposit.
        </p>
        <CtaPair className={s.heroCtas} />
        <p className={s.trust}>
          {d.minDayRateKobo != null && <><strong>From {naira(d.minDayRateKobo)} a day</strong> · </>}
          No deposit · Deloo Protection (damage cover) on every booking · Pay with Paystack
        </p>
      </div>
      {shot && (
        <figure className={s.heroShot}>
          <a href={itemUrl(shot.id)}>
            <img src={shot.photoLargeUrl!} alt={shot.name} width={800} height={600} fetchPriority="high" decoding="async" />
          </a>
          <figcaption>
            <a href={itemUrl(shot.id)}>{shot.name}</a>, {naira(shot.dayRateKobo)} a day
          </figcaption>
        </figure>
      )}
    </section>
  );
}

export function Featured({ d }: { d: LandingData }) {
  return (
    <section id="gear" className={s.section} aria-labelledby="gear-title">
      <div className={s.wrap}>
        <h2 id="gear-title" className={s.h2}>Some of our gear</h2>
        <p className={s.lead}>Day rates, before Deloo Protection and delivery. Everything here is Deloo&apos;s own stock.</p>
        {d.featured.length ? (
          <ul className={s.grid}>
            {d.featured.map((it) => (
              <li key={it.id}>
                <a className={s.item} href={itemUrl(it.id)}>
                  {it.photoUrl ? (
                    <img className={s.photo} src={it.photoUrl} alt="" width={400} height={300} loading="lazy" decoding="async" />
                  ) : (
                    <div className={s.photo} aria-hidden="true" />
                  )}
                  <span className={s.itemName}>{it.name}</span>
                  <span className={s.price}>{naira(it.dayRateKobo)} a day</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.lead}>Cameras, lenses, gimbals, lights and podcast mics, by the day. See today&apos;s prices in the app.</p>
        )}
        <a className={`${s.link} ${s.seeAll}`} href={EXPLORE_URL}>
          {d.itemCount ? `See all ${d.itemCount} items` : "See all gear"} →
        </a>
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
              <a className={s.chip} href={categoryUrl(c.key)}>
                {CATEGORY_CHIP_LABELS[c.key] ?? c.label} <span className={s.count}>{c.count}</span>
              </a>
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
      <div className={`${s.wrap} ${s.split}`}>
        <div>
          <h2 id="shoot-title" className={s.h2}>Not sure what you need? Describe your shoot.</h2>
          <p className={s.lead}>Type it like you&apos;d tell a friend. We&apos;ll suggest the camera, lenses, light and sound, with a reason for each.</p>
          <blockquote className={s.example}>
            <p>&ldquo;3-person podcast in Lekki on Saturday, two cameras&rdquo;</p>
          </blockquote>
          <a className={`${s.btn} ${s.accent}`} href={APP_URL}>Plan my shoot</a>
        </div>
        <div>
          <h3 className={s.h3}>Shoots we plan for</h3>
          <ul className={s.plainList}>
            {SHOOT_TYPES.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  ["Plan or pick", "Describe your shoot or browse the gear."],
  ["Choose your days", "See what's free on a calendar. Rent from tomorrow."],
  ["Pay", "Card or bank transfer on Paystack. You see the rental, Deloo Protection (damage cover) and delivery before you pay. No deposit."],
  ["Receive and return", "We deliver or you pick up. We both take photos of the gear at handover and return, so there are no arguments later."],
] as const;

export function HowItWorks() {
  return (
    <section id="how" className={s.section} aria-labelledby="how-title">
      <div className={s.wrap}>
        <h2 id="how-title" className={s.h2}>How renting works</h2>
        <ol className={s.steps}>
          {STEPS.map(([title, body]) => (
            <li key={title} className={s.row}>
              <h3 className={s.rowTitle}>{title}</h3>
              <p className={s.rowBody}>{body}</p>
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
        <dl className={s.rows}>
          <div className={s.row}>
            <dt className={s.rowTitle}>No deposit</dt>
            <dd className={s.rowBody}>You pay the rental, Protection and delivery. Nothing is held back, so there&apos;s nothing to wait for after your shoot.</dd>
          </div>
          <div className={s.row}>
            {/* TODO(founder): confirm the cap. Rates mirror private.item_protection_rate (0019). */}
            <dt className={s.rowTitle}>Deloo Protection (damage cover)</dt>
            <dd className={s.rowBody}>
              A share of the rental, depending on the gear: cameras 20%, lenses and lights 15%, audio and stands 10%. It covers accidental damage up to a limit, so one mistake won&apos;t cost you the full price of a camera.
            </dd>
          </div>
          <div className={s.row}>
            <dt className={s.rowTitle}>Handover photos</dt>
            <dd className={s.rowBody}>At delivery and return, you and our rider photograph each item. No arguments later about who did what.</dd>
          </div>
        </dl>

        <h3 className={s.h3} id="delivery">Delivery across Lagos</h3>
        {d.zones.length ? (
          <div className={s.tableWrap}>
            <table className={s.table} aria-labelledby="delivery">
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
      <div className={`${s.wrap} ${s.inline}`}>
        <div>
          <h2 id="owner-title" className={s.h3}>Own gear that sits idle?</h2>
          <p className={s.muted}>Soon you&apos;ll be able to rent it out through Deloo. Leave your WhatsApp number and we&apos;ll tell you first.</p>
        </div>
        <a className={`${s.btn} ${s.secondary}`} href={WAITLIST_URL}>Join the waitlist</a>
      </div>
    </section>
  );
}

export function WhatsAppBand({ d }: { d: LandingData }) {
  const wa = whatsappUrl(d.supportWhatsapp);
  return (
    <section className={s.contact} aria-labelledby="wa-title">
      <div className={`${s.wrap} ${s.inline}`}>
        <div>
          <h2 id="wa-title" className={s.h2}>Questions? Chat with us on WhatsApp.</h2>
          <p>We reply between 8am and 8pm.</p>
        </div>
        {wa && <a className={`${s.btn} ${s.accent}`} href={wa}>Chat on WhatsApp</a>}
      </div>
    </section>
  );
}
