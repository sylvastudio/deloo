import { Footer, TopBar } from "@/components/landing/chrome";
import s from "@/components/landing/landing.module.css";
import { getLandingData } from "@/lib/landing/data";

export const revalidate = 3600;

/** Shell for the static legal pages linked from the landing footer. */
export default async function LegalLayout({ children }: LayoutProps<"/">) {
  const d = await getLandingData();
  return (
    <div className={s.page} lang="en-NG">
      <TopBar home={false} />
      <main className={`${s.wrap} ${s.legal}`}>{children}</main>
      <Footer supportWhatsapp={d.supportWhatsapp} area={d.pickupArea} />
    </div>
  );
}
