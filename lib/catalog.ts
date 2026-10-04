// Poster types and the fields the AI fills for each. Generated from prototype/index.html (TYPES);
// supabase/seed.sql seeds the same rows into public.categories.
import type { SlotSchema } from "./ai/types";

export type CategoryKey = "event" | "invite" | "announce" | "quote" | "birthday" | "service" | "thanks";
export type Category = { key: CategoryKey; label: string; description: string; schema: SlotSchema };

export const CATEGORIES: Category[] = [
  {
    "key": "event",
    "label": "Event flyer",
    "description": "Services, conferences, programmes.",
    "schema": {
      "fields": [
        {
          "key": "title",
          "label": "Event name",
          "required": true,
          "placeholder": "Youth Conference"
        },
        {
          "key": "date",
          "label": "Date",
          "required": true,
          "placeholder": "3 October"
        },
        {
          "key": "time",
          "label": "Time",
          "required": false,
          "placeholder": "4pm"
        },
        {
          "key": "venue",
          "label": "Venue",
          "required": false,
          "placeholder": "Main Auditorium"
        },
        {
          "key": "theme",
          "label": "Theme",
          "required": false,
          "placeholder": "Rise and Shine"
        },
        {
          "key": "speaker",
          "person": true,
          "label": "Ministering",
          "required": false,
          "placeholder": "Pastor Tolu Adeyemi",
          "hint": "Keep honorifics as written: Pastor, Evang., Chief, Alhaji, HRM."
        },
        {
          "key": "speaker_role",
          "label": "Their role line",
          "required": false,
          "placeholder": "Ministering",
          "hint": "Printed before the name. Only the words the brief uses, e.g. Guest speaker, Preacher, Special guest. Empty = “Ministering”."
        },
        {
          "key": "host",
          "person": true,
          "label": "Host",
          "required": false
        },
        {
          "key": "anchor",
          "person": true,
          "label": "Anchor",
          "required": false,
          "placeholder": "Bro. Femi Ade"
        },
        {
          "key": "cta",
          "label": "Closing line",
          "required": false,
          "placeholder": "Invite a friend"
        }
      ],
      "example": "Youth conference, 3 Oct, guest speaker Pastor Tolu Adeyemi, theme Rise and Shine, 4pm at the Main Auditorium"
    }
  },
  {
    "key": "invite",
    "label": "Invitation",
    "description": "“You're invited” for dinners, launches, special days.",
    "schema": {
      "fields": [
        {
          "key": "occasion",
          "label": "What's the occasion?",
          "required": true,
          "placeholder": "Choir Anniversary Dinner"
        },
        {
          "key": "date",
          "label": "Date",
          "required": true,
          "placeholder": "14 November"
        },
        {
          "key": "time",
          "label": "Time",
          "required": false,
          "placeholder": "6pm"
        },
        {
          "key": "venue",
          "label": "Venue",
          "required": false,
          "placeholder": "Fellowship Hall"
        },
        {
          "key": "host",
          "person": true,
          "label": "Hosted by",
          "required": false,
          "placeholder": "The Choir"
        },
        {
          "key": "dress",
          "label": "Dress code",
          "required": false,
          "placeholder": "All white"
        },
        {
          "key": "rsvp",
          "person": true,
          "label": "RSVP to",
          "required": false,
          "placeholder": "Sister Bola"
        }
      ],
      "example": "Choir anniversary dinner, 14 Nov, 6pm at the Fellowship Hall, dress code all white, RSVP Sister Bola"
    }
  },
  {
    "key": "announce",
    "label": "Announcement",
    "description": "Notices, “we've moved”, updates.",
    "schema": {
      "fields": [
        {
          "key": "headline",
          "label": "Headline",
          "required": true,
          "placeholder": "We've moved"
        },
        {
          "key": "message",
          "label": "Message",
          "required": true,
          "long": true,
          "placeholder": "From Sunday 5 October, all services hold at our new hall."
        },
        {
          "key": "date",
          "label": "Date",
          "required": false,
          "placeholder": "5 October"
        },
        {
          "key": "contact",
          "person": true,
          "label": "Contact",
          "required": false,
          "placeholder": "Church office"
        }
      ],
      "example": "We've moved, from Sunday 5 Oct all services hold at our new hall on Unity Road, contact the church office"
    }
  },
  {
    "key": "quote",
    "label": "Quote or scripture card",
    "description": "Verses, sermon quotes, thoughts.",
    "schema": {
      "fields": [
        {
          "key": "quote",
          "label": "Quote or verse",
          "required": true,
          "long": true,
          "placeholder": "Let your light so shine before men."
        },
        {
          "key": "reference",
          "person": true,
          "label": "Reference or speaker",
          "required": false,
          "placeholder": "Matthew 5:16"
        },
        {
          "key": "occasion",
          "label": "Small heading",
          "required": false,
          "placeholder": "Sunday thought"
        }
      ],
      "example": "\"Let your light so shine before men\" Matthew 5:16, Sunday thought"
    }
  },
  {
    "key": "birthday",
    "label": "Birthday or celebration",
    "description": "Birthdays, anniversaries, milestones.",
    "schema": {
      "fields": [
        {
          "key": "name",
          "person": true,
          "label": "Who's celebrating?",
          "required": true,
          "placeholder": "Mama Grace"
        },
        {
          "key": "milestone",
          "label": "Milestone",
          "required": false,
          "placeholder": "turns 70"
        },
        {
          "key": "date",
          "label": "Date",
          "required": false,
          "placeholder": "12 December"
        },
        {
          "key": "message",
          "label": "Message",
          "required": false,
          "long": true,
          "placeholder": "Join us to celebrate seventy years of grace."
        },
        {
          "key": "from",
          "label": "From",
          "required": false,
          "placeholder": "The family"
        }
      ],
      "example": "Mama Grace turns 70, 12 Dec, join us to celebrate seventy years of grace, from the family"
    }
  },
  {
    "key": "service",
    "label": "Service times",
    "description": "“See you Sunday”, weekly services.",
    "schema": {
      "fields": [
        {
          "key": "day",
          "label": "Day",
          "required": true,
          "placeholder": "Sunday"
        },
        {
          "key": "time",
          "label": "Time",
          "required": true,
          "placeholder": "10:30am"
        },
        {
          "key": "headline",
          "label": "Headline",
          "required": false,
          "placeholder": "Empty = “See you Sunday at 10:30am”"
        },
        {
          "key": "venue",
          "label": "Venue",
          "required": false,
          "placeholder": "Main Auditorium"
        },
        {
          "key": "tagline",
          "label": "Tagline",
          "required": false,
          "placeholder": "Come as you are"
        }
      ],
      "example": "See you Sunday, 10:30am at the Main Auditorium, tagline come as you are"
    }
  },
  {
    "key": "thanks",
    "label": "Thank-you",
    "description": "Appreciation after events and giving.",
    "schema": {
      "fields": [
        {
          "key": "for_what",
          "label": "Thank you for…",
          "required": true,
          "placeholder": "Harvest Thanksgiving 2026"
        },
        {
          "key": "headline",
          "label": "Headline",
          "required": false,
          "placeholder": "Empty = “Thank you”"
        },
        {
          "key": "items",
          "label": "Who or what to thank (one per line)",
          "required": false,
          "long": true,
          "placeholder": "Ushers\nChoir\nMedia team"
        },
        {
          "key": "from",
          "label": "From",
          "required": false,
          "placeholder": "The Pastorate"
        }
      ],
      "example": "Thank you for Harvest Thanksgiving 2026, ushers, choir, media team, from the Pastorate"
    }
  }
];

export function getCategory(key: string): Category | undefined {
  return CATEGORIES.find((c) => c.key === key);
}

/** A short name for a saved design, from its main field. */
export function briefTitle(categoryKey: string, fields: Record<string, string>): string {
  const f = fields ?? {};
  switch (categoryKey) {
    case "event": return f.title || "Event";
    case "invite": return f.occasion || "Invitation";
    case "announce": return f.headline || "Announcement";
    case "quote": return f.quote ? `“${f.quote.replace(/^["“]|["”]$/g, "")}”` : "Quote";
    case "birthday": return f.name ? `${f.name}${f.milestone ? " " + f.milestone : ""}` : "Celebration";
    case "service": return f.headline || [f.day, f.time].filter(Boolean).join(" · ") || "Service times";
    case "thanks": return f.for_what || f.headline || "Thank-you";
    default: return getCategory(categoryKey)?.label ?? "Design";
  }
}
