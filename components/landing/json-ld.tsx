import { SITE_URL, itemUrl } from "@/lib/landing/config";
import type { LandingData } from "@/lib/landing/data";
import { faqItems } from "./faq";

/** Structured data (§1.4): Store, featured gear as an ItemList of Products, and the FAQ. */
export function LandingJsonLd({ d }: { d: LandingData }) {
  const store: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: "Deloo",
    url: SITE_URL,
    description: "Camera, light and sound gear rental in Lagos.",
    areaServed: { "@type": "City", name: "Lagos" },
    address: {
      "@type": "PostalAddress",
      ...(d.pickupArea ? { addressLocality: d.pickupArea } : {}),
      addressRegion: "Lagos",
      addressCountry: "NG",
    },
    openingHours: "Mo-Su 08:00-20:00",
    // TODO: add sameAs (Instagram) once the handle is confirmed.
  };
  if (d.supportWhatsapp) store.telephone = d.supportWhatsapp;

  const graph: Record<string, unknown>[] = [store];
  if (d.featured.length) {
    graph.push({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Popular gear",
      itemListElement: d.featured.map((it, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Product",
          name: it.name,
          url: itemUrl(it.id),
          ...(it.photoUrl ? { image: it.photoUrl } : {}),
          offers: {
            "@type": "Offer",
            priceCurrency: "NGN",
            price: (it.dayRateKobo / 100).toFixed(0),
            description: "Day rate",
            priceSpecification: { "@type": "UnitPriceSpecification", price: (it.dayRateKobo / 100).toFixed(0), priceCurrency: "NGN", unitText: "DAY" },
          },
        },
      })),
    });
  }
  graph.push({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems(d).map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  });

  // "<" escaped so DB text can't close the script tag.
  const json = JSON.stringify(graph).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
