/** Category keys match public.categories (migration 0007). */
export const CATEGORY_META: Record<string, { label: string; plural: string; emoji: string; group: 'sound' | 'screen' | 'camera' | 'light' | 'power' }> = {
  speaker: { label: 'Speaker', plural: 'Speakers', emoji: '🔊', group: 'sound' },
  subwoofer: { label: 'Subwoofer', plural: 'Subwoofers', emoji: '🔈', group: 'sound' },
  monitor: { label: 'Stage monitor', plural: 'Monitors', emoji: '🎚️', group: 'sound' },
  mic: { label: 'Microphone', plural: 'Mics', emoji: '🎤', group: 'sound' },
  mixer: { label: 'Mixer', plural: 'Mixers', emoji: '🎛️', group: 'sound' },
  led_wall: { label: 'LED wall', plural: 'LED walls', emoji: '🖥️', group: 'screen' },
  projector: { label: 'Projector', plural: 'Projectors', emoji: '📽️', group: 'screen' },
  projection_screen: { label: 'Projection screen', plural: 'Screens', emoji: '⬜', group: 'screen' },
  tv: { label: 'TV screen', plural: 'TVs', emoji: '📺', group: 'screen' },
  camera: { label: 'Camera', plural: 'Cameras', emoji: '🎥', group: 'camera' },
  switcher: { label: 'Video switcher', plural: 'Switchers', emoji: '🔀', group: 'camera' },
  streaming_kit: { label: 'Streaming kit', plural: 'Streaming', emoji: '📡', group: 'camera' },
  light: { label: 'Light', plural: 'Lights', emoji: '💡', group: 'light' },
  generator: { label: 'Generator', plural: 'Generators', emoji: '⚡', group: 'power' },
  avr: { label: 'Stabiliser', plural: 'Stabilisers', emoji: '🔌', group: 'power' },
};

export const GROUPS = [
  { key: 'all', label: 'All' },
  { key: 'sound', label: 'Sound' },
  { key: 'screen', label: 'Screens' },
  { key: 'camera', label: 'Cameras & streaming' },
  { key: 'light', label: 'Lights' },
  { key: 'power', label: 'Power' },
] as const;

/** Strip the "(DEMO)" marker from demo catalogue names for display. */
export const displayName = (name: string) => name.replace(/\s*\(DEMO\)\s*$/, '');
