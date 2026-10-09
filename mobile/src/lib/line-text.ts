import { displayName } from './catalog';
import type { Line, Offer } from '@/planner/types';

const CATEGORY: Record<string, [string, string]> = {
  speaker: ['speaker', 'speakers'], subwoofer: ['subwoofer', 'subwoofers'], monitor: ['stage monitor', 'stage monitors'],
  mic: ['microphone', 'microphones'], mixer: ['mixer', 'mixers'], led_wall: ['LED wall', 'LED walls'], projector: ['projector', 'projectors'],
  projection_screen: ['projection screen', 'projection screens'], tv: ['TV screen', 'TV screens'], camera: ['camera', 'cameras'],
  switcher: ['video switcher', 'video switchers'], streaming_kit: ['streaming kit', 'streaming kits'], light: ['light', 'lights'],
  generator: ['generator', 'generators'], avr: ['stabiliser', 'stabilisers'],
};

/** "6 × 15" powered speaker" from what was chosen, or a description of the need when nothing was found. */
export function lineTitle(line: Line, chosen: Offer[]): string {
  if (chosen.length === 1) return `${chosen[0].units} × ${displayName(chosen[0].name)}`;
  if (chosen.length > 1) {
    const units = chosen.reduce((n, o) => n + o.units, 0);
    return `${units} × ${CATEGORY[line.category]?.[units === 1 ? 0 : 1] ?? line.category}`;
  }
  return `${line.qty} × ${needLabel(line)}`;
}

/** Plain description of what a line needs, e.g. "outdoor LED wall, at least 12×8 ft". */
export function needLabel(line: Line): string {
  const s = line.spec;
  const base = CATEGORY[line.category]?.[line.qty === 1 ? 0 : 1] ?? line.category;
  const bits: string[] = [];
  if (s.outdoor) bits.push('outdoor');
  if (s.wireless) bits.push('wireless');
  if (s.lineArray) return 'line array boxes';
  const extra: string[] = [];
  if (s.minWidthFt && s.minHeightFt) extra.push(`at least ${s.minWidthFt}×${s.minHeightFt} ft`);
  if (s.minLumens) extra.push(`${s.minLumens.toLocaleString('en-NG')}+ lumens`);
  if (s.minKva) extra.push(`${s.minKva} kVA+`);
  if (s.minChannels) extra.push(`${s.minChannels}+ channels`);
  if (s.minSizeIn && line.category !== 'tv') extra.push(`${s.minSizeIn}"+`);
  if (s.minScreenIn) extra.push(`${s.minScreenIn}"+`);
  return [bits.join(' '), base].filter(Boolean).join(' ') + (extra.length ? `, ${extra.join(', ')}` : '');
}

export function vendorsOf(chosen: Offer[]): string {
  return [...new Set(chosen.map((o) => displayName(o.vendorName)))].join(' + ');
}
