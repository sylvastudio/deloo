/** Fixed links and constants for the public landing page (docs/ux-landing-and-web.md §1). */

export const SITE_URL = "https://deloo.space";
export const APP_URL = "https://app.deloo.space";
export const EXPLORE_URL = `${APP_URL}/explore`;
export const WAITLIST_URL = `${APP_URL}/coming-soon`;

// TODO: set to the real APK download (spec placeholder: https://deloo.space/download/deloo.apk) once it's hosted.
export const APK_URL = "#android";
/** APK size for the line under the download button. null hides the size until we know it. */
export const APK_SIZE_MB: number | null = null;

export const itemUrl = (id: string) => `${APP_URL}/item/${encodeURIComponent(id)}`;
export const categoryUrl = (key: string) => `${EXPLORE_URL}?category=${encodeURIComponent(key)}`;

/** Prefilled WhatsApp chat. `phone` is support_whatsapp from app_settings, in any common format. */
export function whatsappUrl(phone: string, text = "Hi Deloo, I'd like to rent gear") {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `234${digits.slice(1)}`;
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

/** Plural chip labels for the landing page; anything not listed falls back to the DB label. */
export const CATEGORY_CHIP_LABELS: Record<string, string> = {
  camera: "Cameras",
  lens: "Lenses",
  gimbal: "Gimbals",
  light: "Lights",
  mic: "Mics",
  mixer: "Podcast mixer",
  headphones: "Headphones",
  grip: "Stands and grip",
  backdrop: "Backdrops",
};

/** Matches ShootType in mobile/src/planner/types.ts (the planner's first question). */
export const SHOOT_TYPES = [
  "Podcast",
  "Music video",
  "Short film or skit",
  "Interview",
  "Photo shoot",
  "Event coverage (weddings, church services, conferences)",
  "YouTube, TikTok and reels",
] as const;
