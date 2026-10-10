/** Money is stored in kobo (PRD §6). Shown as ₦25,000 or, compact, ₦25k. */
export function naira(kobo: number, compact = false) {
  const n = kobo / 100;
  if (compact && n >= 1000) {
    const k = n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}m` : `${+(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`;
    return `₦${k}`;
  }
  return `₦${Math.round(n).toLocaleString('en-NG')}`;
}

export const LAGOS_AREAS = [
  'Ikeja', 'Lekki', 'Ajah', 'Victoria Island', 'Ikoyi', 'Yaba', 'Surulere', 'Gbagada', 'Maryland', 'Ogba',
  'Magodo', 'Ikorodu', 'Festac', 'Apapa', 'Oshodi', 'Agege', 'Isolo', 'Epe', 'Badagry',
] as const;

// Every date shown is Lagos time. Day strings (YYYY-MM-DD) are calendar days, so they're formatted in
// UTC to stay on the same date; instants (timestamps) are formatted in Africa/Lagos.
const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const DAY_SHORT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const TIME = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' });
const DATE_LAGOS = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });

/** "Tue 14 Oct" for a YYYY-MM-DD day. */
export const dayLabel = (ymd: string) => DAY.format(new Date(`${ymd}T00:00:00Z`));

/** "14–16 Oct", "30 Oct – 2 Nov" or "Tue 14 Oct" for a single day. */
export function rangeLabel(first: string, last: string) {
  if (first === last) return dayLabel(first);
  const a = DAY_SHORT.format(new Date(`${first}T00:00:00Z`)), b = DAY_SHORT.format(new Date(`${last}T00:00:00Z`));
  return first.slice(0, 7) === last.slice(0, 7) ? `${a.split(' ')[0]}–${b}` : `${a} – ${b}`;
}

/** "2:05 pm" in Lagos. */
export const lagosTime = (iso: string) => TIME.format(new Date(iso)).toLowerCase();
/** "14 Oct, 2:05 pm" in Lagos. */
export const lagosWhen = (iso: string) => `${DATE_LAGOS.format(new Date(iso))}, ${lagosTime(iso)}`;

/** "3 days" / "1 day". */
export const daysText = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** A WhatsApp chat link that works with or without the app installed. */
export function whatsappUrl(number: string, text: string) {
  const digits = number.replace(/\D/g, '').replace(/^0/, '234');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
