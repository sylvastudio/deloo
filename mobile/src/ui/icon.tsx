import { SymbolView } from 'expo-symbols';

import { useColors } from '@/theme/use-colors';

/**
 * One name per concept, mapped to SF Symbols (iOS) and Material Symbols (Android).
 * Add new icons here rather than passing raw symbol names around the app.
 */
const ICONS = {
  back: { ios: 'chevron.left', android: 'arrow_back' },
  close: { ios: 'xmark', android: 'close' },
  chevron: { ios: 'chevron.right', android: 'chevron_right' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left' },
  mic: { ios: 'mic.fill', android: 'mic' },
  send: { ios: 'arrow.up', android: 'arrow_upward' },
  check: { ios: 'checkmark', android: 'check' },
  info: { ios: 'info.circle', android: 'info' },
  swap: { ios: 'arrow.left.arrow.right', android: 'swap_horiz' },
  share: { ios: 'square.and.arrow.up', android: 'share' },
  whatsapp: { ios: 'bubble.left.and.bubble.right.fill', android: 'chat' },
  calendar: { ios: 'calendar', android: 'calendar_month' },
  pin: { ios: 'mappin.and.ellipse', android: 'location_on' },
  people: { ios: 'person.3.fill', android: 'groups' },
  edit: { ios: 'pencil', android: 'edit' },
  plus: { ios: 'plus', android: 'add' },
  minus: { ios: 'minus', android: 'remove' },
  camera: { ios: 'camera.fill', android: 'photo_camera' },
  shield: { ios: 'checkmark.shield.fill', android: 'verified_user' },
  bolt: { ios: 'bolt.fill', android: 'bolt' },
  wrench: { ios: 'wrench.and.screwdriver.fill', android: 'construction' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning' },
  clock: { ios: 'clock', android: 'schedule' },
  star: { ios: 'star.fill', android: 'star' },
  truck: { ios: 'truck.box.fill', android: 'local_shipping' },
  phone: { ios: 'phone.fill', android: 'call' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome' },
  // Tab bar (web build; native tabs name their own symbols)
  search: { ios: 'magnifyingglass', android: 'search' },
  person: { ios: 'person.crop.circle', android: 'account_circle' },
  today: { ios: 'sun.max', android: 'today' },
  money: { ios: 'banknote', android: 'payments' },
  // Gear categories (keys match public.categories)
  speaker: { ios: 'hifispeaker.fill', android: 'speaker' },
  subwoofer: { ios: 'hifispeaker.2.fill', android: 'speaker_group' },
  monitor: { ios: 'speaker.wave.2.fill', android: 'volume_up' },
  mic_cat: { ios: 'music.mic', android: 'mic_external_on' },
  mixer: { ios: 'slider.vertical.3', android: 'tune' },
  led_wall: { ios: 'tv.fill', android: 'tv' },
  projector: { ios: 'videoprojector.fill', android: 'videocam' },
  projection_screen: { ios: 'rectangle.inset.filled', android: 'crop_landscape' },
  tv: { ios: 'tv', android: 'tv_gen' },
  camera_cat: { ios: 'video.fill', android: 'videocam' },
  switcher: { ios: 'square.grid.2x2.fill', android: 'grid_view' },
  streaming_kit: { ios: 'antenna.radiowaves.left.and.right', android: 'cell_tower' },
  light: { ios: 'lightbulb.fill', android: 'lightbulb' },
  generator: { ios: 'bolt.circle.fill', android: 'electric_bolt' },
  avr: { ios: 'powerplug.fill', android: 'power' },
  lens: { ios: 'camera.aperture', android: 'camera' },
  gimbal: { ios: 'gyroscope', android: 'sports_esports' },
  headphones: { ios: 'headphones', android: 'headphones' },
  grip: { ios: 'line.3.crossed.swirl.circle', android: 'height' },
  backdrop: { ios: 'photo.artframe', android: 'wallpaper' },
} as const;

export type IconName = keyof typeof ICONS;

/** Category key → icon (mic and camera share names with UI icons, so they're suffixed). */
export function categoryIcon(category: string): IconName {
  if (category === 'mic') return 'mic_cat';
  if (category === 'camera') return 'camera_cat';
  return (category in ICONS ? category : 'sparkles') as IconName;
}

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const c = useColors();
  const n = ICONS[name];
  return <SymbolView name={{ ios: n.ios, android: n.android, web: n.android }} size={size} tintColor={color ?? c.ink} />;
}
