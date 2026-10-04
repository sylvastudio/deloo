// Poster content + the 9 style renderers, ported from prototype/index.html (CONTENT, STYLE RENDERERS).
// Content + context in, markup out. Every value is escaped; empty pieces are skipped.
// Pure string functions, so they run the same on the server and in the browser.
import { pickLogo, type LogoPick, type ResolvedLogo } from "./logos";

export type StyleKey = "badge" | "receipt" | "ticket" | "form" | "editorial" | "note" | "sticker" | "billboard" | "block";
export type SizeKey = "post" | "story" | "banner" | "a5";
/** Sizes map onto public.asset_size in the database. */
export type Size = { key: SizeKey; name: string; long: string; w: number; h: number; cls: string; asset: "ig_post" | "ig_story" | "x_banner" | "a5_handbill" };

export const SIZES: Size[] = [
  { key: "post", name: "Post", long: "Instagram post", w: 1080, h: 1080, cls: "sz-square", asset: "ig_post" },
  { key: "story", name: "Story", long: "Instagram story", w: 1080, h: 1920, cls: "sz-story", asset: "ig_story" },
  { key: "banner", name: "Banner", long: "X / LinkedIn banner", w: 1500, h: 500, cls: "sz-banner", asset: "x_banner" },
  { key: "a5", name: "A5 print", long: "A5 handbill, 148 × 210 mm at 150 dpi", w: 874, h: 1240, cls: "sz-a5", asset: "a5_handbill" },
];
export function getSize(key: string): Size { return SIZES.find((s) => s.key === key) ?? SIZES[0]; }

export const STYLES: Record<StyleKey, { name: string; desc: string }> = {
  badge: { name: "Badge", desc: "Title in a bold oval, date up top." },
  receipt: { name: "Receipt", desc: "Till receipt, dotted lines, script sign-off." },
  ticket: { name: "Ticket roll", desc: "A ticket printing out of a slot." },
  form: { name: "Form card", desc: "Tilted card with labelled tabs over giant type." },
  editorial: { name: "Editorial serif", desc: "Elegant serif on a colour panel." },
  note: { name: "Pinned note", desc: "Pinned note, bold caps with script." },
  sticker: { name: "Sticker title", desc: "Cut-out sticker title, script details." },
  billboard: { name: "Billboard", desc: "A short friendly line on a billboard." },
  block: { name: "Poster block", desc: "Huge headline, framed card, mono details." },
};
export const STYLE_ORDER: StyleKey[] = ["badge", "receipt", "ticket", "form", "editorial", "note", "sticker", "billboard", "block"];
export function isStyle(k: string): k is StyleKey { return k in STYLES; }

/** Styles that suit each poster type best, in order. */
export const RECOMMEND: Record<string, StyleKey[]> = {
  event: ["block", "badge", "ticket"], invite: ["ticket", "form", "sticker"], announce: ["block", "note", "billboard"],
  quote: ["editorial", "note", "badge"], birthday: ["form", "editorial", "sticker"], service: ["billboard", "note", "badge"], thanks: ["receipt", "editorial", "form"],
};

/** Fictional sample content for style previews. */
export const SAMPLES: Record<string, Record<string, string>> = {
  event: { title: "Youth Conference", date: "3 October", time: "4pm", venue: "Main Auditorium", theme: "Rise and Shine", speaker: "Pastor Tolu Adeyemi", cta: "Invite a friend" },
  invite: { occasion: "Choir Anniversary Dinner", date: "14 November", time: "6pm", venue: "Fellowship Hall", host: "The Choir", dress: "All white", rsvp: "Sister Bola" },
  announce: { headline: "We've moved", message: "From Sunday 5 October, all services hold at our new hall on Unity Road.", date: "5 October", contact: "Church office" },
  quote: { quote: "Let your light so shine before men.", reference: "Matthew 5:16", occasion: "Sunday thought" },
  birthday: { name: "Mama Grace", milestone: "turns 70", date: "12 December", message: "Join us to celebrate seventy years of grace.", from: "The family" },
  service: { day: "Sunday", time: "10:30am", venue: "Main Auditorium", tagline: "Come as you are" },
  thanks: { for_what: "Harvest Thanksgiving 2026", items: "Ushers\nChoir\nMedia team\nEveryone who gave", from: "The Pastorate" },
};

type Detail = { label: string; value: string };
export type Content = { kicker: string; headline: string; subhead: string; details: Detail[]; people: { role: string; name: string }[]; body: string; signoff: string; isQuote: boolean };
export type PosterContext = {
  org: string;
  /** The kit's approved logo versions, ready to draw. The picker chooses one per style and size. */
  logos: ResolvedLogo[];
  /** A version the volunteer chose instead of the automatic pick. */
  logoOverride?: string | null;
};
type DrawContext = PosterContext & { pick: LogoPick | null };

function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/** Turns a type's fields into one shape every style can draw. */
export function toContent(type: string, f: Record<string, string | undefined>): Content {
  const c: Content = { kicker: "", headline: "", subhead: "", details: [], people: [], body: "", signoff: "", isQuote: false };
  const det = (label: string, v?: string) => { if (v) c.details.push({ label, value: v }); };
  if (type === "event") {
    c.headline = f.title || ""; c.subhead = f.theme ? "Theme: " + f.theme : "";
    det("Date", f.date); det("Time", f.time); det("Venue", f.venue);
    if (f.speaker) c.people.push({ role: "Ministering", name: f.speaker });
    if (f.host) c.people.push({ role: "Host", name: f.host });
    c.signoff = f.cta || "";
  } else if (type === "invite") {
    c.kicker = "You're invited"; c.headline = f.occasion || ""; c.subhead = f.host ? "Hosted by " + f.host : "";
    det("Date", f.date); det("Time", f.time); det("Venue", f.venue); det("Dress code", f.dress);
    c.signoff = f.rsvp ? "RSVP " + f.rsvp : "";
  } else if (type === "announce") {
    c.kicker = "Announcement"; c.headline = f.headline || ""; c.body = f.message || "";
    det("Date", f.date); det("Contact", f.contact);
  } else if (type === "quote") {
    c.kicker = f.occasion || ""; c.headline = f.quote ? "“" + f.quote.replace(/^["“]|["”]$/g, "") + "”" : ""; c.signoff = f.reference || ""; c.isQuote = true;
  } else if (type === "birthday") {
    c.kicker = f.milestone ? cap(f.milestone) : "Happy birthday"; c.headline = f.name || "";
    det("Date", f.date); c.body = f.message || ""; c.signoff = f.from ? "— " + f.from : "";
  } else if (type === "service") {
    c.headline = f.headline || ("See you " + (f.day || "") + (f.time ? " at " + f.time : "")).replace(/\s+/g, " ").trim();
    det("Venue", f.venue); c.signoff = f.tagline || "";
  } else if (type === "thanks") {
    c.headline = f.headline || "Thank you"; c.subhead = f.for_what || "";
    (f.items || "").split(/\n+/).map((s) => s.trim()).filter(Boolean).forEach((s) => {
      const m = s.split(/\s+[—–-]\s+|:\s+/);
      c.details.push(m.length > 1 ? { label: m[0], value: m.slice(1).join(" ") } : { label: "", value: s });
    });
    c.signoff = f.from ? "— " + f.from : "";
  }
  return c;
}

const D = (c: Content, label: string) => c.details.find((x) => x.label === label)?.value ?? "";
const others = (c: Content, skip: string[]) => c.details.filter((d) => !skip.includes(d.label));
const dText = (d: Detail) => (d.label ? d.label + ": " : "") + d.value;

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
}
/** The picked logo at its fitted size (inline size wins over the slot's CSS height), on a plate if it needs one. */
const logo = (ctx: DrawContext) => {
  const p = ctx.pick;
  if (!p) return '<span class="logo-text">' + esc(ctx.org) + "</span>";
  const img = '<img class="logo-img" src="' + esc(p.logo.src) + '" alt="" style="height:' + p.hCq.toFixed(2) + 'cqmin;width:' + p.wCq.toFixed(2) + 'cqmin">';
  return p.plate ? '<span class="logo-plate" style="--plate:var(' + p.plate + ')">' + img + '</span>' : img;
};
/** Styles that print the org name beside the logo skip it when the chosen logo already shows the name. */
const orgBeside = (ctx: DrawContext) => (ctx.pick?.logo.includesName ? "" : '<span>' + esc(ctx.org) + '</span>');
const when = (c: Content) => [D(c, "Date"), D(c, "Time")].filter(Boolean).join(" · ");
const namesLine = (c: Content) => c.people.map((p) => p.name).join(" · ");
const rolesLine = (c: Content) => c.people.map((p) => p.role + ": " + p.name).join("  ·  ");
const lines = (arr: string[]) => arr.filter(Boolean).map(esc).join("<br>");

const RENDER: Record<StyleKey, (c: Content, ctx: DrawContext) => string> = {
  badge: (c, ctx) =>
    '<div class="box">' +
      '<div class="b-row"><span>' + esc(c.kicker || ctx.org) + '</span><span>' + esc(D(c, "Time")) + '</span></div>' +
      (D(c, "Date") ? '<div class="b-date">' + esc(D(c, "Date")) + '</div>' : '') +
      '<div class="b-oval box"><h1 class="hl">' + esc(c.headline) + '</h1></div>' +
      (c.subhead ? '<div class="b-sub">' + esc(c.subhead) + '</div>' : '') +
      (c.people.length ? '<div class="b-with">' + esc(c.people.length === 1 ? c.people[0].role : "With") + '</div><div class="b-names">' + esc(namesLine(c)) + '</div>' : '') +
      (c.body ? '<p class="b-body">' + esc(c.body) + '</p>' : '') +
      others(c, ["Date", "Time", "Venue"]).map((d) => '<div class="b-sub">' + esc(dText(d)) + '</div>').join("") +
      '<div class="b-row foot"><span>' + esc(D(c, "Venue")) + '</span><span>' + esc(c.signoff || (c.kicker ? ctx.org : "")) + '</span></div>' +
    '</div>',
  receipt: (c, ctx) => {
    const rows = c.details.map((d) => '<div class="r-row"><span>' + esc(d.label || "•") + '</span><i></i><span class="v">' + esc(d.value) + '</span></div>')
      .concat(c.people.map((p) => '<div class="r-row"><span>' + esc(p.role) + '</span><i></i><span class="v">' + esc(p.name) + '</span></div>')).join("");
    return '<div class="stage"><div class="r-paper box">' +
      '<div class="r-a">' +
        '<div class="r-top"><span class="k">' + esc(c.kicker || "Receipt") + '</span><span>' + esc(D(c, "Date")) + '</span></div>' +
        '<div class="r-logo">' + logo(ctx) + '</div>' +
        '<h1 class="hl">' + esc(c.headline) + '</h1>' +
        (c.subhead ? '<p class="r-sub">/' + esc(c.subhead) + '/</p>' : '') +
      '</div>' +
      '<div class="r-b">' +
        '<div class="r-rule"></div>' + rows + (c.body ? '<p class="r-body">' + esc(c.body) + '</p>' : '') + (rows || c.body ? '<div class="r-rule"></div>' : '') +
        '<div class="r-bar"></div>' +
        (c.signoff ? '<p class="r-sign">' + esc(c.signoff) + '</p>' : '') +
        '<div class="r-foot"><span>' + esc(ctx.org) + '</span><span>' + esc(D(c, "Contact")) + '</span></div>' +
      '</div>' +
    '</div></div>';
  },
  ticket: (c, ctx) => {
    const big = c.kicker || c.headline, block = c.kicker ? c.headline : "", line = rolesLine(c) || c.body;
    return '<div class="box">' +
      '<h1 class="t-big hl">' + esc(big) + '</h1>' +
      '<div class="t-slot"><i></i></div>' +
      '<div class="t-paper box">' +
        (c.subhead ? '<p class="t-kick">' + esc(c.subhead) + '</p>' : '') +
        (block ? '<div class="t-block hl">' + esc(block) + '</div>' : '') +
        '<div class="t-rule"></div>' +
        (line ? '<p class="t-line">' + esc(line) + '</p>' : '') +
        (when(c) ? '<p class="t-date">' + esc(when(c)) + '</p>' : '') +
        others(c, ["Date", "Time"]).map((d) => '<p class="t-date">' + esc(dText(d)) + '</p>').join("") +
        '<div class="t-bar"></div>' +
        (c.signoff ? '<p class="t-sign">' + esc(c.signoff) + '</p>' : '') +
      '</div>' +
      '<div class="t-org">' + (ctx.pick ? logo(ctx) : '') + orgBeside(ctx) + '</div>' +
    '</div>';
  },
  form: (c, ctx) => {
    const src = c.isQuote ? (c.kicker || "") : c.headline;
    const words = src.replace(/[“”"]/g, "").split(/\s+/).filter(Boolean);
    const w1 = words[0] || "", w2 = words.length > 1 ? words.slice(1).join(" ") : "";
    const intro = c.isQuote ? c.headline : [c.kicker, c.headline].filter(Boolean).join(" — ");
    const fields = c.details.map((d, i) => '<div class="f-field' + (i === 0 ? ' first' : '') + '">' + (d.label ? '<span class="f-tab">' + esc(d.label) + '</span>' : '') + '<div class="f-val">' + esc(d.value) + '</div></div>')
      .concat(c.people.map((p) => '<div class="f-field"><span class="f-tab">' + esc(p.role) + '</span><div class="f-val">' + esc(p.name) + '</div></div>')).join("");
    const script1 = c.isQuote ? "" : (c.kicker || "");
    const script2 = c.isQuote ? c.signoff : c.signoff.replace(/^—\s*/, "");
    return (w1 ? '<div class="f-giant f-top" data-giant="' + esc(w1) + '">' + esc(w1) + '</div>' : '') +
      (w2 ? '<div class="f-giant f-bot" data-giant="' + esc(w2) + '">' + esc(w2) + '</div>' : '') +
      (script1 ? '<div class="f-script f-s1">' + esc(script1) + '</div>' : '') +
      '<div class="f-card box">' +
        '<p class="f-intro hl">' + esc(intro) + '</p>' +
        (c.subhead ? '<p class="f-subline">' + esc(c.subhead) + '</p>' : '') +
        fields +
        (c.body ? '<p class="f-body">' + esc(c.body) + '</p>' : '') +
        (c.signoff && script2.length >= 22 ? '<p class="f-foot">' + esc(c.signoff) + '</p>' : '<p class="f-foot"></p>') +
      '</div>' +
      (script2 && script2.length < 22 ? '<div class="f-script f-s2">' + esc(script2) + '</div>' : '') +
      '<div class="f-logo">' + logo(ctx) + '</div>';
  },
  editorial: (c, ctx) => {
    const meta = others(c, ["Date"]).map((d) => d.value);
    return '<div class="e-frame"><div class="e-panel box">' +
      '<div class="e-a">' +
        (c.kicker ? '<p class="e-kick">' + esc(c.kicker) + '</p>' : '') +
        '<h1 class="hl">' + esc(c.headline) + '</h1>' +
        (c.subhead ? '<p class="e-sub">' + esc(c.subhead) + '</p>' : '') +
      '</div>' +
      '<div class="e-b">' +
        (c.body ? '<p class="e-body">' + esc(c.body) + '</p>' : '') +
        (c.people.length ? '<p class="e-body">' + esc(rolesLine(c)) + '</p>' : '') +
        (D(c, "Date") ? '<p class="e-date">' + esc(D(c, "Date")) + '</p>' : '') +
        (meta.length ? '<p class="e-meta">' + esc(meta.join(" · ")) + '</p>' : '') +
        (c.signoff ? '<p class="e-meta">' + esc(c.signoff) + '</p>' : '') +
      '</div>' +
    '</div></div>' +
    '<div class="e-org">' + (ctx.pick ? logo(ctx) : '') + orgBeside(ctx) + '</div>';
  },
  note: (c, ctx) => {
    const words = c.headline.split(/\s+/).filter(Boolean);
    const head = c.isQuote || words.length < 2
      ? '<b>' + esc(c.headline) + '</b>'
      : '<b>' + esc(words.slice(0, -1).join(" ")) + '</b> <em>' + esc(words[words.length - 1].toLowerCase()) + '</em>';
    return '<div class="n-stage"><div class="n-wrap">' +
      '<div class="n-pin"><i class="h"></i><i class="n"></i></div>' +
      '<div class="n-note box">' +
        '<div class="n-a">' +
          '<h1 class="hl">' + head + '</h1>' +
          (c.kicker && !c.isQuote ? '<p class="n-kick">' + esc(c.kicker) + '</p>' : '') +
          (c.subhead ? '<p class="n-kick">' + esc(c.subhead) + '</p>' : '') +
          (c.body ? '<p class="n-body">' + esc(c.body) + '</p>' : '') +
        '</div>' +
        '<div class="n-b">' +
          '<div class="n-details">' +
            c.details.map((d) => '<p>' + esc(dText(d)) + '</p>').join("") +
            c.people.map((p) => '<p>' + esc(p.role + ": " + p.name) + '</p>').join("") +
          '</div>' +
          (c.signoff || (c.isQuote && c.kicker) ? '<p class="n-sign">' + esc(c.signoff || c.kicker) + '</p>' : '') +
        '</div>' +
      '</div>' +
    '</div></div>' +
    '<div class="n-logo">' + logo(ctx) + '</div>';
  },
  sticker: (c, ctx) => {
    const withLine = c.people.length ? "with " + namesLine(c) : c.subhead;
    const left = [D(c, "Date"), D(c, "Venue") ? "at " + D(c, "Venue") : ""];
    const right = [D(c, "Time")].concat(others(c, ["Date", "Venue", "Time"]).map((d) => d.value));
    return '<div class="box">' +
      '<div class="s-top">' + logo(ctx) + '<span>' + esc(c.signoff) + '</span></div>' +
      '<p class="s-kick">' + esc(c.kicker) + '</p>' +
      '<h1 class="hl"><span>' + esc(c.headline) + '</span></h1>' +
      (withLine ? '<p class="s-with"><span>' + esc(withLine) + '</span></p>' : '') +
      '<div class="s-details"><p>' + lines(left) + '</p><p class="r">' + lines(right) + '</p></div>' +
      (c.body ? '<p class="s-body">' + esc(c.body) + '</p>' : '') +
    '</div>';
  },
  billboard: (c, ctx) => {
    const details = [c.subhead, D(c, "Date"), D(c, "Time"), D(c, "Venue")].concat(others(c, ["Date", "Time", "Venue"]).map(dText))
      .concat(c.people.map((p) => p.role + ": " + p.name)).filter(Boolean);
    return '<div class="bb-rail"></div><div class="bb-post"></div><div class="bb-feet"></div>' +
      '<div class="bb-board box">' +
        '<svg class="bb-star" viewBox="0 0 40 40" aria-hidden="true"><g stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M20 3v34M3 20h34M8 8l24 24M32 8L8 32"/></g></svg>' +
        (c.signoff || c.kicker ? '<p class="bb-hand">' + esc(c.signoff || c.kicker) + '</p>' : '') +
        '<h1 class="hl">' + esc(c.headline) + '</h1>' +
        (c.body ? '<p class="bb-details">' + esc(c.body) + '</p>' : '') +
        (details.length ? '<p class="bb-details">' + esc(details.join("  ·  ")) + '</p>' : '') +
      '</div>' +
      '<div class="bb-logo">' + logo(ctx) + '</div>';
  },
  block: (c, ctx) => {
    const left = [D(c, "Venue"), D(c, "Contact")].concat(others(c, ["Date", "Time", "Venue", "Contact"]).map(dText));
    const right = [D(c, "Date"), D(c, "Time")];
    const block = [c.subhead, c.body].filter(Boolean).join(" — ") || c.kicker;
    const topLabel = c.kicker && block !== c.kicker ? c.kicker : ctx.org;
    return '<div class="pb-frame"><div class="pb-card box">' +
      '<div class="pb-top"><span>' + esc(topLabel) + '<span class="arrow">→</span></span>' + logo(ctx) + '</div>' +
      '<div class="pb-head"><h1 class="hl">' + esc(c.headline) + '</h1>' + (c.people.length ? '<div class="pb-oval">' + esc(rolesLine(c)) + '</div>' : '') + '</div>' +
      '<div class="pb-block">' + (block ? '[ ' + esc(block) + ' ]' : '') + '</div>' +
      '<div class="pb-foot"><div>' + lines(left) + '</div><div class="r">' + lines(right.concat([c.signoff])) + '</div></div>' +
    '</div></div>';
  },
};

/** Inner markup of a poster: the .tpl element with the style's layout. */
export function posterMarkup(style: StyleKey, size: Size, content: Content, ctx: PosterContext, grain: boolean, vars: Record<string, string>): string {
  const draw: DrawContext = { ...ctx, pick: pickLogo(ctx.logos, style, size.key, vars, ctx.logoOverride) };
  return '<div class="tpl st-' + style + ' ' + size.cls + (content.isQuote ? ' is-quote' : '') + '">' + RENDER[style](content, draw) + (grain ? '<div class="grain"></div>' : '') + '</div>';
}
