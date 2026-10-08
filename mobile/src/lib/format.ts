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
