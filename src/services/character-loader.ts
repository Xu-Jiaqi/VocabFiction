import type { ImageSourcePropType } from 'react-native';
import { Paths, File, Directory } from 'expo-file-system';

export interface CharacterData {
  protagonist: string;
  avatars: Record<string, string>; // name → filename
}

/**
 * Static registry of built-in character data.
 */
const builtinCharacters: Record<string, () => CharacterData> = {
  makeine: () =>
    require('@/novels/败犬女主太多了！/characters/characters.json'),
};

/**
 * Static registry of built-in avatar images.
 * Metro bundles these PNGs at build time.
 */
const builtinAvatars: Record<string, Record<string, () => ImageSourcePropType>> = {
  makeine: {
    'Yanami.png': () => require('@/novels/败犬女主太多了！/characters/Yanami.png'),
    'Nukumizu.png': () => require('@/novels/败犬女主太多了！/characters/Nukumizu.png'),
    'Sousuke.png': () => require('@/novels/败犬女主太多了！/characters/Sousuke.png'),
  },
};

/**
 * Directory where custom avatars are stored.
 */
function customAvatarDir(): Directory {
  return new Directory(Paths.document, 'avatars');
}

/**
 * Get the custom avatar URI for a character, or null if none.
 */
export function getCustomAvatarUri(workId: string, characterName: string): string {
  const chars = loadCharacters(workId);
  if (!chars) return '';
  const filename = chars.avatars[characterName];
  if (!filename) return '';
  const dir = customAvatarDir();
  return new Directory(dir, workId, filename).uri;
}

/**
 * Check if a custom avatar file exists.
 */
export async function checkCustomAvatarExists(uri: string): Promise<boolean> {
  try {
    const file = new File(uri);
    const info = await file.info();
    return info.exists;
  } catch {
    return false;
  }
}

/**
 * Save a custom avatar image for a character.
 * Copies the picked image to the avatars directory.
 */
export async function saveCustomAvatar(
  workId: string,
  characterName: string,
  sourceUri: string,
): Promise<string | null> {
  const chars = loadCharacters(workId);
  if (!chars) return null;

  const ext = sourceUri.split('.').pop()?.toLowerCase() || 'png';
  const filename = `${characterName.replace(/\s+/g, '_')}.${ext}`;

  // Update the mapping
  chars.avatars[characterName] = filename;

  const dir = new Directory(customAvatarDir(), workId);
  await dir.create();

  const dest = new File(dir, filename);
  const sourceFile = new File(sourceUri);
  await sourceFile.copy(dest);

  return dest.uri;
}

/**
 * Load character data (protagonist + avatar filename mapping) for a work.
 */
export function loadCharacters(workId: string): CharacterData | null {
  const loader = builtinCharacters[workId];
  if (!loader) return null;
  return loader();
}

/**
 * Get the protagonist's name for a work.
 */
export function getProtagonist(workId: string): string | null {
  const chars = loadCharacters(workId);
  return chars?.protagonist ?? null;
}

/**
 * Get the avatar image source for a character by name.
 * Returns the built-in source (custom avatars are resolved asynchronously).
 */
export function getAvatarSource(
  workId: string,
  characterName: string
): ImageSourcePropType | null {
  const chars = loadCharacters(workId);
  if (!chars) return null;

  const filename = chars.avatars[characterName];
  if (!filename) return null;

  const workAvatars = builtinAvatars[workId];
  if (workAvatars) {
    const loader = workAvatars[filename];
    if (loader) return loader();
  }

  return null;
}
