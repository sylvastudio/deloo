export type CatalogGroup = 'camera' | 'lens' | 'light' | 'audio' | 'grip';

/** Category keys match public.categories (migrations 0007, 0009). */
export const CATEGORY_META: Record<string, { label: string; plural: string; emoji: string; group: CatalogGroup }> = {
  camera: { label: 'Camera', plural: 'Cameras', emoji: '🎥', group: 'camera' },
  lens: { label: 'Lens', plural: 'Lenses', emoji: '🔭', group: 'lens' },
  light: { label: 'Light', plural: 'Lights', emoji: '💡', group: 'light' },
  mic: { label: 'Microphone', plural: 'Mics', emoji: '🎤', group: 'audio' },
  mixer: { label: 'Podcast mixer', plural: 'Mixers', emoji: '🎛️', group: 'audio' },
  headphones: { label: 'Headphones', plural: 'Headphones', emoji: '🎧', group: 'audio' },
  gimbal: { label: 'Gimbal', plural: 'Gimbals', emoji: '🌀', group: 'grip' },
  grip: { label: 'Stand', plural: 'Stands', emoji: '📐', group: 'grip' },
  backdrop: { label: 'Backdrop', plural: 'Backdrops', emoji: '🖼️', group: 'grip' },
};

export const GROUPS = [
  { key: 'all', label: 'All' },
  { key: 'camera', label: 'Cameras' },
  { key: 'lens', label: 'Lenses' },
  { key: 'light', label: 'Lighting' },
  { key: 'audio', label: 'Audio' },
  { key: 'grip', label: 'Grip' },
] as const;

/** Strip the "(DEMO)" marker from demo catalogue names for display. */
export const displayName = (name: string) => name.replace(/\s*\(DEMO\)\s*$/, '');
