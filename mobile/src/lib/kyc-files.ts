import { File } from 'expo-file-system';

/** The bytes of a local photo (native: a file:// uri from the camera or the image manipulator). */
export async function readPhoto(uri: string): Promise<Uint8Array | null> {
  const file = new File(uri);
  if (!file.exists) return null;
  return file.bytes();
}
