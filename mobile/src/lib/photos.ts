import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

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
  // Both sides given: the web build treats a null side as 0 and throws.
  if (longest > 1280) ctx.resize({ width: Math.round((a.width * 1280) / longest), height: Math.round((a.height * 1280) / longest) });
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

/** The camera permission was refused; the screen offers "Open settings". */
export class CameraDenied extends Error {
  constructor() { super('Allow camera access so you can photograph the gear. Open settings, then tap Camera.'); }
}

export type Evidence = { uri: string; mediaType: 'photo' | 'video'; width?: number; height?: number; durationS?: number };

async function cameraAllowed() {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new CameraDenied();
}

/**
 * Handover evidence photo (PRD §5.8): camera only, longest side 1600 px, JPEG 0.7 (~250–400 KB).
 * Returns a file in the cache; the handover queue moves it somewhere durable.
 */
export async function shootEvidencePhoto(): Promise<Evidence | null> {
  await cameraAllowed();
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false, exif: false, cameraType: ImagePicker.CameraType.back });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  if (Platform.OS === 'web') {
    // Shrinking can fail on odd files; the original photo is still good evidence, just bigger.
    try { return await shrinkOnWeb(a.uri); } catch { return { uri: a.uri, mediaType: 'photo', width: a.width, height: a.height }; }
  }
  const ctx = ImageManipulator.manipulate(a.uri);
  if (Math.max(a.width, a.height) > MAX_SIDE) ctx.resize(a.width >= a.height ? { width: MAX_SIDE, height: null } : { width: null, height: MAX_SIDE });
  const saved = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  return { uri: saved.uri, mediaType: 'photo', width: saved.width, height: saved.height };
}

const MAX_SIDE = 1600;

/**
 * Web: shrink with the browser's own canvas scaling. expo-image-manipulator's web resize treats a null
 * side as 0 (so it threw on every photo) and resamples in JavaScript, which takes many seconds on a
 * phone for a 12 MP photo.
 */
function shrinkOnWeb(uri: string): Promise<Evidence> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const g = canvas.getContext('2d');
      if (!g) return reject(new Error('no canvas'));
      g.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('no blob'));
        resolve({ uri: URL.createObjectURL(blob), mediaType: 'photo', width: canvas.width, height: canvas.height });
      }, 'image/jpeg', 0.7);
    };
    img.onerror = () => reject(new Error('unreadable photo'));
    img.src = uri;
  });
}

/** A short power-on video (≤15 s, medium quality). On the web the length limit isn't enforced (file input). */
export async function shootEvidenceVideo(): Promise<Evidence | null> {
  await cameraAllowed();
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'], videoMaxDuration: 15, cameraType: ImagePicker.CameraType.back, videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium, quality: 0.5,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  // The browser's file input can't cap the length, so check it after capture (web duration is seconds).
  if (Platform.OS === 'web' && ((a.duration ?? 0) > 20 || (a.fileSize ?? 0) > 25 * 1024 * 1024)) {
    throw new Error('Keep it under 15 seconds. Record a shorter video that shows it powering on.');
  }
  return { uri: a.uri, mediaType: 'video', width: a.width, height: a.height, durationS: a.duration ? Math.round((Platform.OS === 'web' ? a.duration * 1000 : a.duration) / 100) / 10 : undefined };
}
