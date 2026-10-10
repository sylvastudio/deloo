import { Linking, Share } from 'react-native';

/**
 * Sharing text. Native: the WhatsApp app if installed, else the system share sheet.
 * The web build uses share.web.ts (wa.me link, Web Share API, clipboard).
 */
export type ShareResult = 'shared' | 'copied' | 'failed';

export async function shareOnWhatsApp(text: string): Promise<ShareResult> {
  const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
  if (await Linking.canOpenURL(url).catch(() => false)) {
    return Linking.openURL(url).then(() => 'shared' as const, () => 'failed' as const);
  }
  return shareText(text);
}

export function shareText(text: string): Promise<ShareResult> {
  return Share.share({ message: text }).then(() => 'shared' as const, () => 'failed' as const);
}
