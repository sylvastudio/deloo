// Deloo's own stock, as in supabase/inventory_deloo.sql (naira here, kobo in the items).
import type { CatalogueItem, CategoryKey } from '../index';

type Row = [cat: CategoryKey, name: string, specs: Record<string, unknown>, rate: number, replacement: number, qty: number];

const ROWS: Row[] = [
  ['camera', 'Sony FX3 cinema camera', { kind: 'cinema', grade: 4, full_frame: true, resolution: '4k' }, 50000, 4900000, 1],
  ['camera', 'Sony ZV-E1', { kind: 'mirrorless', grade: 3, full_frame: true, resolution: '4k' }, 40000, 3600000, 2],
  ['camera', 'Sony FX30 cinema camera', { kind: 'cinema', grade: 2, full_frame: false, resolution: '4k' }, 35000, 2700000, 1],
  ['camera', 'Sony ZV-E10', { kind: 'mirrorless', grade: 1, full_frame: false, resolution: '4k' }, 20000, 1000000, 1],
  ['lens', 'Sony FE 24-70mm f/2.8 GM', { kind: 'zoom', aperture: 2.8, full_frame: true, grade: 3 }, 30000, 2850000, 1],
  ['lens', 'Sony FE 85mm f/1.8', { kind: 'prime', aperture: 1.8, full_frame: true, grade: 2 }, 17000, 1000000, 1],
  ['lens', 'Sony FE 35mm f/1.8', { kind: 'prime', aperture: 1.8, full_frame: true, grade: 2 }, 17000, 900000, 1],
  ['lens', 'Sony FE 50mm f/1.8', { kind: 'prime', aperture: 1.8, full_frame: true, grade: 1 }, 10000, 400000, 1],
  ['lens', 'Sigma 16mm f/1.4 DC DN', { kind: 'prime', aperture: 1.4, full_frame: false, grade: 2 }, 15000, 800000, 1],
  ['gimbal', 'DJI RS 5 gimbal', { payload_kg: 3 }, 45000, 950000, 1],
  ['gimbal', 'DJI RS 3 Mini gimbal', { payload_kg: 2 }, 25000, 600000, 1],
  ['light', 'Amaran F22c 2×2 ft LED mat', { kind: 'mat', watts: 200, rgb: true, battery: true }, 25000, 1425000, 1],
  ['light', 'Amaran COB 200x S', { kind: 'cob', watts: 200, rgb: false, battery: false }, 25000, 635000, 2],
  ['light', 'Godox SL100W LED light', { kind: 'cob', watts: 100, rgb: false, battery: false }, 15000, 440000, 1],
  ['light', 'Aputure MC Pro RGB panel', { kind: 'panel', watts: 8, rgb: true, battery: true }, 10000, 315000, 1],
  ['light', 'Nanlite PavoTube 6C', { kind: 'tube', watts: 7, rgb: true, battery: true }, 8000, 140000, 1],
  ['mixer', 'RODECaster Pro II', { channels: 4, digital: true, records: true }, 45000, 1200000, 1],
  ['mic', 'RODE PodMic USB', { kind: 'podcast', wireless: false, persons: 1, usb: true }, 25000, 350000, 1],
  ['mic', 'RODE PodMic with stand and cable', { kind: 'podcast', wireless: false, persons: 1, usb: false }, 20000, 400000, 1],
  ['mic', 'RODE Wireless PRO', { kind: 'lavalier', wireless: true, persons: 2 }, 15000, 690000, 1],
  ['mic', 'RODE Wireless GO II', { kind: 'lavalier', wireless: true, persons: 2 }, 10000, 350000, 1],
  ['headphones', 'Audio-Technica studio headphones', {}, 5000, 185000, 1],
  ['grip', 'Adjustable mic stand', { kind: 'mic_stand' }, 2000, 35000, 1],
  ['grip', 'C-stand kit (10.75 ft)', { kind: 'c_stand' }, 5000, 270000, 1],
  ['grip', 'Backdrop support kit (12.9 ft wide)', { kind: 'backdrop_stand' }, 5000, 315000, 1],
  ['backdrop', 'Paper backdrop', { kind: 'paper' }, 10000, 25000, 1],
];

const tier = (kobo: number): 1 | 2 | 3 => (kobo < 50_000_000 ? 1 : kobo < 300_000_000 ? 2 : 3);

/** The catalogue with every unit free; pass `busy` (item name → units taken) to book some out. */
export function stock(busy: Record<string, number> = {}): CatalogueItem[] {
  return ROWS.map(([category, name, specs, rate, replacement, qty], i) => ({
    id: `item-${String(i).padStart(2, '0')}`,
    vendorId: 'deloo',
    vendorName: 'Deloo',
    vendorAreas: ['Ikeja', 'Lekki', 'Yaba'],
    vendorApproved: true,
    category,
    name,
    specs,
    dayRateKobo: rate * 100,
    depositKobo: Math.max(1_000_000, Math.ceil((replacement * 0.1) / 5000) * 5000 * 100),
    technicianRequired: false,
    riskTier: tier(replacement * 100),
    freeUnits: Math.max(0, qty - (busy[name] ?? 0)),
    totalUnits: qty,
  }));
}
