// Planner types. Pure TypeScript: no React Native, Expo or Supabase imports, so the planner runs
// on the device offline and in Node tests. Category and spec keys mirror `categories.spec_schema`
// in supabase/migrations/0007_rental_core.sql; changing a key there is a code change here too.

/** Every intake question can be answered "Not sure" (user-flows §2 rule 2). */
export type Unsure = 'unsure';
export type Maybe<T> = T | Unsure;

export type EventType =
  | 'service'
  | 'crusade'
  | 'conference'
  | 'wedding'
  | 'concert'
  | 'launch'
  | 'party'
  | 'other';
export type Venue = 'indoor' | 'covered' | 'open';
export type RoomSize = 'small' | 'hall' | 'auditorium';
export type StageAct = 'speakers' | 'band' | 'choir' | 'dj' | 'panel';
export type StreamMode = 'none' | 'record' | 'live';
export type Platform = 'youtube' | 'facebook' | 'instagram' | 'zoom' | 'other';
export type PowerSource = 'grid' | 'generator' | 'none';
export type Budget = 'options' | 'low' | 'mid' | 'high';
export type Level = 'good' | 'better' | 'best';

/** The intake answers (PRD §4.1). Stage is a set, stored as an array so drafts serialise to JSON. */
export interface Answers {
  eventType: Maybe<EventType>;
  venue: Maybe<Venue>;
  /** Only asked when indoor. Missing or unsure is guessed from the crowd. */
  roomSize?: Maybe<RoomSize>;
  /** Head count. The R3c bands map to a representative number via `crowdFromBand`. */
  crowd: Maybe<number>;
  stage: Maybe<StageAct[]>;
  stream: Maybe<StreamMode>;
  platform?: Maybe<Platform>;
  power: Maybe<PowerSource>;
  /** ISO 8601 with offset, e.g. 2026-11-14T16:00:00+01:00. */
  startsAt: Maybe<string>;
  endsAt: Maybe<string>;
  /** Lagos area, e.g. "Ikeja". */
  area: Maybe<string>;
  budget: Maybe<Budget>;
  /** Not a planning question (inventory decision 4); set when the renter's words ask for one. */
  technicianWanted?: Maybe<boolean>;
}

export type CrowdBand = 'lt100' | '100-300' | '300-1000' | '1000-3000' | '3000+';

export type CategoryKey =
  | 'speaker'
  | 'subwoofer'
  | 'monitor'
  | 'mic'
  | 'mixer'
  | 'led_wall'
  | 'projector'
  | 'projection_screen'
  | 'tv'
  | 'camera'
  | 'switcher'
  | 'streaming_kit'
  | 'light'
  | 'generator'
  | 'avr';

export type Group = 'sound' | 'screen' | 'camera' | 'light' | 'power';

export type MicKind = 'handheld' | 'lavalier' | 'headset' | 'instrument';
export type CameraKind = 'camcorder' | 'ptz' | 'cinema' | 'dslr';
export type LightKind = 'par' | 'wash' | 'moving_head' | 'follow_spot' | 'flood';

/**
 * What a line needs from an item. Every field is optional; an item matches when it meets all the
 * fields that are set. "min" fields are lower bounds, so a bigger or brighter item always qualifies.
 */
export interface SpecNeed {
  // speaker, subwoofer, monitor, light (spec key `watts`)
  minWatts?: number;
  // speaker, subwoofer (`size_in`)
  minSizeIn?: number;
  // speaker (`powered`)
  powered?: boolean;
  /** Line array box. Not yet a spec_schema key: read from specs.line_array or the item name. */
  lineArray?: boolean;
  // mic (`kind`, `wireless`), camera (`kind`), light (`kind`): any of these kinds
  kinds?: string[];
  wireless?: boolean;
  // mixer (`channels`, `digital`)
  minChannels?: number;
  digital?: boolean;
  // led_wall, projection_screen (`width_ft`, `height_ft`), led_wall (`outdoor`)
  minWidthFt?: number;
  minHeightFt?: number;
  outdoor?: boolean;
  // projector (`lumens`)
  minLumens?: number;
  // tv (`size_in`)
  minScreenIn?: number;
  // camera (`resolution`): '4k' needs 4k; '1080p' accepts 1080p or 4k
  resolution?: '1080p' | '4k';
  // switcher (`inputs`, `streams`)
  minInputs?: number;
  streams?: boolean;
  // streaming_kit (`bonded`)
  bonded?: boolean;
  // generator, avr (`kva`), generator (`silent`)
  minKva?: number;
  silent?: boolean;
}

/** One recommended line in a setup. */
export interface Line {
  /** Stable within a setup, e.g. 'sound.tops'. Used to swap and to log unmet demand. */
  key: string;
  category: CategoryKey;
  spec: SpecNeed;
  qty: number;
  /** Stable id of the rule that produced this line, for analytics and AI rewording. */
  reasonKey: string;
  /** Plain warm English with the actual numbers, shown under "Why?". */
  reason: string;
  /** Without it the event doesn't work. Removing it shows a warning (R8). */
  essential: boolean;
  group: Group;
  /** Estimated running draw per unit in watts, used for generator and AVR sizing. */
  drawWatts: number;
}

export interface Setup {
  level: Level;
  rulesVersion: string;
  lines: Line[];
  /** "We assumed…" sentences for every answer that was "Not sure" or missing. */
  assumptions: string[];
  /** Advice that isn't gear, e.g. "Your own generator should be at least 20 kVA". */
  notes: string[];
  /** Estimated load with headroom, in kVA (sum of draws × 1.25 ÷ 0.8 power factor). */
  loadKva: number;
  technicianWanted: boolean;
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
}

export interface MatchOptions {
  area?: Maybe<string>;
  days: number;
  /** Deloo Protection fee as a share of rental (PRD §4.7: 5–10%). Default 0.07. */
  protectionRate?: number;
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
}

/** PRD §4.3 order: same item elsewhere → equivalent item → different approach → nearby date. */
export type AlternativeKind = 'other_vendor' | 'equivalent' | 'different_approach' | 'nearby_date';

export interface Alternative {
  kind: AlternativeKind;
  /** One line for the swap sheet, e.g. "2 smaller speakers for each big one · a little less punch". */
  trade: string;
  offers: Offer[];
  /** Units this alternative supplies (may differ from the line qty, e.g. 2 small for 1 big). */
  units: number;
  /** Covers the whole need on its own. */
  complete: boolean;
  /** Rental difference vs the current choice for the same days; null when not priced (nearby date). */
  priceDeltaKobo: number | null;
}

export interface LineMatch {
  line: Line;
  offers: Offer[];
  unitsFound: number;
  status: Availability;
  alternatives: Alternative[];
  /** Any chosen listing is tier 3 or marked technician-required: the booking switch is on and locked. */
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
  /** Whether the swap sheet has something to offer instead. */
  hasAlternatives: boolean;
}

export interface Totals {
  rentalKobo: number;
  depositKobo: number;
  protectionKobo: number;
  /** rental + deposit + protection */
  totalKobo: number;
  /** e.g. "Includes a technician, required for the LED wall." null when none applies. */
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
