import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

export type Photo = { uri: string; base64: string; width: number; height: number };

/**
 * Take (or pick) a photo and shrink it for costly mobile data: longest side 1280 px, JPEG ~70%
 * (usually 150–300 KB). Returns null if the person cancels; throws a plain message if permission is refused.
 */
export async function takePhoto(source: 'camera' | 'library'): Promise<Photo | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Allow camera access in Settings to snap your gear, or choose a photo instead.');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const longest = Math.max(a.width, a.height);
  const ctx = ImageManipulator.manipulate(a.uri);
  if (longest > 1280) ctx.resize(a.width >= a.height ? { width: 1280, height: null } : { width: null, height: 1280 });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  return { uri: saved.uri, base64: saved.base64 ?? '', width: saved.width, height: saved.height };
}

/** Upload to the public `items` bucket under the vendor's folder (RLS: vendor members only). */
export async function uploadItemPhoto(vendorId: string, photo: Photo): Promise<string> {
  const bytes = Uint8Array.from(atob(photo.base64), (ch) => ch.charCodeAt(0));
  const path = `${vendorId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from('items').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error('The photo didn’t upload. Check your connection and try again.');
  return path;
}

export function itemPhotoUrl(path: string) {
  return supabase.storage.from('items').getPublicUrl(path).data.publicUrl;
}
