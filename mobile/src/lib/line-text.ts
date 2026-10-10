import { displayName } from './catalog';
import type { Line, Offer } from '@/planner/types';

const CATEGORY: Record<string, [string, string]> = {
  camera: ['camera', 'cameras'], lens: ['lens', 'lenses'], gimbal: ['gimbal', 'gimbals'], light: ['light', 'lights'],
  mic: ['mic', 'mics'], mixer: ['podcast mixer', 'podcast mixers'], headphones: ['pair of headphones', 'pairs of headphones'],
  grip: ['stand', 'stands'], backdrop: ['backdrop', 'backdrops'],
};

/** "2 × Sony ZV-E1" from what was chosen, or a description of the need when nothing was found. */
export function lineTitle(line: Line, chosen: Offer[]): string {
  if (chosen.length === 1) return `${chosen[0].units} × ${displayName(chosen[0].name)}`;
  if (chosen.length > 1) {
    const units = chosen.reduce((n, o) => n + o.units, 0);
    return `${units} × ${CATEGORY[line.category]?.[units === 1 ? 0 : 1] ?? line.category}`;
  }
  return `${line.qty} × ${needLabel(line)}`;
}

const KIND: Record<string, string> = {
  zoom: 'zoom', prime: 'prime', cob: 'key', mat: 'soft', panel: 'small', tube: 'tube', podcast: 'desk', lavalier: 'clip-on',
  c_stand: 'C-', backdrop_stand: 'backdrop', mic_stand: 'mic', paper: 'paper', cinema: 'cinema',
};

/** Plain description of what a line needs, e.g. "full-frame prime lens" or "wireless clip-on mics". */
export function needLabel(line: Line): string {
  const s = line.spec;
  const base = CATEGORY[line.category]?.[line.qty === 1 ? 0 : 1] ?? line.category;
  const bits: string[] = [];
  if (line.category === 'camera' && s.minGrade) bits.push(s.minGrade >= 4 ? 'cinema' : s.minGrade >= 3 ? 'full-frame' : '');
  if (line.category === 'lens' && s.fullFrame) bits.push('full-frame');
  if (s.battery) bits.push('battery');
  if (s.rgb) bits.push('colour');
  if (s.wireless) bits.push('wireless');
  if (s.usb) bits.push('USB');
  if (s.kinds?.length === 1) bits.push(KIND[s.kinds[0]] ?? '');
  const extra: string[] = [];
  if (s.minChannels && s.minChannels > 1) extra.push(`${s.minChannels}+ mic inputs`);
  if (s.minPayloadKg && s.minPayloadKg >= 3) extra.push('for heavier cameras');
  const label = [...bits.filter(Boolean), base].join(' ').replace('C- stand', 'C-stand');
  return label + (extra.length ? `, ${extra.join(', ')}` : '');
}

export function vendorsOf(chosen: Offer[]): string {
  return [...new Set(chosen.map((o) => displayName(o.vendorName)))].join(' + ');
}
