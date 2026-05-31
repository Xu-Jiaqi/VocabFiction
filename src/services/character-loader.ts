import type { ImageSourcePropType } from 'react-native';

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
 * Returns a React Native Image source, or null if no avatar.
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
  if (!workAvatars) return null;

  const loader = workAvatars[filename];
  if (!loader) return null;

  return loader();
}
