/** Launch city areas (PRD §8.1: Lagos). Used by onboarding, the planner and vendor coverage. */
export const LAGOS_AREAS = [
  "Ikeja", "Lekki", "Ajah", "Victoria Island", "Ikoyi", "Yaba", "Surulere", "Gbagada", "Maryland", "Ogba",
  "Magodo", "Ikorodu", "Festac", "Apapa", "Oshodi", "Agege", "Isolo", "Epe", "Badagry",
] as const;

export const VENDOR_TYPES = [
  ["company", "Rental company", "You rent out equipment as a business."],
  ["church", "Church or ministry", "Your church's gear is free on some days."],
  ["individual", "Individual owner", "Videographer, DJ, sound engineer, or anyone with gear."],
] as const;
