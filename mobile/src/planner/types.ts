// Planner types. Pure TypeScript: no React Native, Expo or Supabase imports, so the planner runs
// on the device offline and in Node tests. Category and spec keys mirror `categories.spec_schema`
// in supabase/migrations/0009_shoot_categories.sql; changing a key there is a code change here too.

/** Every intake question can be answered "Not sure" (user-flows §2 rule 2). */
export type Unsure = 'unsure';
export type Maybe<T> = T | Unsure;

export type ShootType =
  | 'podcast'
  | 'interview'
  | 'content'
  | 'music_video'
  | 'short_film'
  | 'photo'
  | 'event'
  | 'other';
export type Location = 'indoor' | 'outdoor' | 'both';
export type TimeOfDay = 'day' | 'night' | 'both';
/** How voices are recorded: desk mics (podcast style), clip-on wireless mics, or none (playback, stills). */
export type SoundMode = 'desk' | 'clip' | 'none';
export type Budget = 'options' | 'low' | 'mid' | 'high';
export type Level = 'good' | 'better' | 'best';

/** The intake answers. */
export interface Answers {
  shootType: Maybe<ShootType>;
  location: Maybe<Location>;
  timeOfDay: Maybe<TimeOfDay>;
  /** People on camera (and on mic). */
  people: Maybe<number>;
  /** Camera angles, i.e. cameras rolling at once. */
  angles: Maybe<number>;
  sound: Maybe<SoundMode>;
  /** Moving shots: walking, tracking, handheld. */
  movement: Maybe<boolean>;
  /** ISO 8601 with offset, e.g. 2026-11-14T08:00:00+01:00. */
  startsAt: Maybe<string>;
  endsAt: Maybe<string>;
  /** Lagos area, e.g. "Ikeja". */
  area: Maybe<string>;
  budget: Maybe<Budget>;
  /** A naira ceiling the renter named ("under 100k"), in kobo. Used by "Fit my budget" (planner/fit). */
  budgetKobo?: number;
  /** "deliver to Ajah" → 'delivery'; "I'll pick it up" → 'pickup'. Review pre-selects it. */
  delivery?: 'pickup' | 'delivery';
  /** Rental length the renter said without a start day ("2 days"); the calendar pre-fills it. */
  days?: number;
  /** Gear named in the words ("FX3", "24-70"); the planner prefers matching listings (match pinnedItems). */
  pinnedNames?: string[];
}

export type CategoryKey =
  | 'camera'
  | 'lens'
  | 'gimbal'
  | 'light'
  | 'mic'
  | 'mixer'
  | 'headphones'
  | 'grip'
  | 'backdrop';

export type Group = 'camera' | 'lens' | 'light' | 'audio' | 'grip';

/**
 * What a line needs from an item. Every field is optional; an item matches when it meets all the
 * fields that are set. "min" fields are lower bounds, so a better item always qualifies.
 */
export interface SpecNeed {
  /** Any of these `kind` values (camera, lens, light, mic, grip, backdrop). */
  kinds?: string[];
  /** camera, lens `grade`: 1 entry … 4 cinema. */
  minGrade?: number;
  /** camera, lens `full_frame`. */
  fullFrame?: boolean;
  /** light `rgb`, `battery`, `watts`. */
  rgb?: boolean;
  battery?: boolean;
  minWatts?: number;
  /** mic `wireless`, `persons`, `usb`. */
  wireless?: boolean;
  minPersons?: number;
  usb?: boolean;
  /** mixer `channels`, `records`. */
  minChannels?: number;
  records?: boolean;
  /** gimbal `payload_kg`. */
  minPayloadKg?: number;
}

/** One recommended line in a setup. */
export interface Line {
  /** Stable within a setup, e.g. 'camera.main'. Used to swap and to log unmet demand. */
  key: string;
  category: CategoryKey;
  spec: SpecNeed;
  qty: number;
  /** Stable id of the rule that produced this line, for analytics and AI rewording. */
  reasonKey: string;
  /** Plain warm English with the actual numbers, shown under "Why?". */
  reason: string;
  /** Without it the shoot doesn't work. Removing it shows a warning (R8). */
  essential: boolean;
  group: Group;
}

export interface Setup {
  level: Level;
  rulesVersion: string;
  lines: Line[];
  /** "We assumed…" sentences for every answer that was "Not sure" or missing. */
  assumptions: string[];
  /** Advice that isn't gear, e.g. "Bring your own V-mount batteries". */
  notes: string[];
}

/** One catalogue listing with its free units for the booking's dates (computed by the server). */
export interface CatalogueItem {
  id: string;
  vendorId: string;
  vendorName: string;
  vendorAreas: string[];
  vendorApproved: boolean;
  category: CategoryKey;
  name: string;
  specs: Record<string, unknown>;
  dayRateKobo: number;
  depositKobo: number;
  technicianRequired: boolean;
  riskTier: 1 | 2 | 3;
  freeUnits: number;
  totalUnits: number;
  /** First listing photo (a path in the public `items` bucket), when it has one. */
  photo?: string;
}

export interface MatchOptions {
  area?: Maybe<string>;
  days: number;
  /** A flat Protection rate for every item (tests). Default: by gear, see planner/protection.ts. */
  protectionRate?: number;
  /** Gear the renter named (Answers.pinnedNames): a matching free listing fills its category's line first. */
  pinned?: string[];
}

export type Availability = 'available' | 'limited' | 'unavailable';

/** Some units of one listing. */
export interface Offer {
  itemId: string;
  vendorId: string;
  vendorName: string;
  name: string;
  category: CategoryKey;
  units: number;
  dayRateKobo: number;
  /** dayRate × units × days */
  rentalKobo: number;
  /** deposit × units (once, not per day) */
  depositKobo: number;
  servesArea: boolean;
  technicianRequired: boolean;
  riskTier: 1 | 2 | 3;
  photo?: string;
}

/** PRD §4.3 order: same item elsewhere → equivalent item → different approach → nearby date. */
export type AlternativeKind = 'other_vendor' | 'equivalent' | 'different_approach' | 'nearby_date';

export interface Alternative {
  kind: AlternativeKind;
  /** One line for the swap sheet, e.g. "A prime instead · walk closer instead of zooming". */
  trade: string;
  offers: Offer[];
  /** Units this alternative supplies. */
  units: number;
  /** Covers the whole need on its own. */
  complete: boolean;
  /** Rental difference vs the current choice for the same days; null when not priced (nearby date). */
  priceDeltaKobo: number | null;
  /** Other stock in the category: true when it meets the plan's spec, false when it's a trade-off. */
  fits?: boolean;
  /**
   * nearby_date only: the stocked listings that would fill the whole line on a day they're free
   * (ignoring these dates), so the app can ask the server which nearby days are free.
   */
  wants?: { itemId: string; units: number }[];
}

/**
 * Why a line is short: we don't stock anything that fits ('not_stocked'), or we do but it's booked
 * on these dates ('booked').
 */
export type ShortReason = 'not_stocked' | 'booked';

export interface LineMatch {
  line: Line;
  offers: Offer[];
  unitsFound: number;
  status: Availability;
  /** Set when unitsFound < qty. */
  shortReason?: ShortReason;
  alternatives: Alternative[];
  /** A chosen listing is marked technician-required. */
  technicianRequired: boolean;
  rentalKobo: number;
  depositKobo: number;
}

/** A shortfall to record in `unmet_demand` (PRD §4.3) so Ops can source it. */
export interface Unmet {
  lineKey: string;
  category: CategoryKey;
  spec: SpecNeed;
  qty: number;
  area: string;
  reason: ShortReason;
  /** Whether the swap sheet has something to offer instead. */
  hasAlternatives: boolean;
}

export interface Totals {
  rentalKobo: number;
  depositKobo: number;
  protectionKobo: number;
  /** rental + deposit + protection */
  totalKobo: number;
  /** e.g. "Includes a technician, required for the camera." null when none applies. */
  technicianNote: string | null;
}

export interface SetupMatch {
  level: Level;
  days: number;
  lines: LineMatch[];
  totals: Totals;
  unmet: Unmet[];
  /** Overall: unavailable if any essential line is unavailable, limited if any line is not fully available. */
  status: Availability;
}
