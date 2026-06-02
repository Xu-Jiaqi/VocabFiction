import type { ImageSourcePropType } from 'react-native';
import { copyAsync, makeDirectoryAsync, getInfoAsync, deleteAsync } from 'expo-file-system/legacy';

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
  gamers: () =>
    require('@/novels/GAMERS电玩咖！/characters/characters.json'),
};

/**
 * Static registry of built-in avatar images.
 */
const builtinAvatars: Record<string, Record<string, () => ImageSourcePropType>> = {
  makeine: {
    'Yanami.png': () => require('@/novels/败犬女主太多了！/characters/Yanami.png'),
    'Nukumizu.png': () => require('@/novels/败犬女主太多了！/characters/Nukumizu.png'),
    'Sousuke.png': () => require('@/novels/败犬女主太多了！/characters/Sousuke.png'),
  },
  gamers: {
    'Keita_Amano.png': () => require('@/novels/GAMERS电玩咖！/characters/Keita_Amano.png'),
    'Karen_Tendo.png': () => require('@/novels/GAMERS电玩咖！/characters/Karen_Tendo.png'),
    'Tasuku_Uehara.png': () => require('@/novels/GAMERS电玩咖！/characters/Tasuku_Uehara.png'),
    'Aguri_Sakurano.png': () => require('@/novels/GAMERS电玩咖！/characters/Aguri_Sakurano.png'),
  },
};

/**
 * Custom avatar filename overrides (per work, per character), separate from built-in data.
 */
const customFilenames: Record<string, Record<string, string>> = {};

function getCustomFilename(workId: string, characterName: string): string | null {
  return customFilenames[workId]?.[characterName] ?? null;
}

function setCustomFilename(workId: string, characterName: string, filename: string): void {
  if (!customFilenames[workId]) customFilenames[workId] = {};
  customFilenames[workId][characterName] = filename;
}

function clearCustomFilename(workId: string, characterName: string): void {
  if (customFilenames[workId]) {
    delete customFilenames[workId][characterName];
  }
}

// Use the legacy documentDirectory
let docDir: string | null = null;
function getDocDir(): string {
  if (docDir) return docDir;
  const { documentDirectory } = require('expo-file-system/legacy');
  docDir = documentDirectory;
  return docDir || '';
}

export function getCustomAvatarUri(workId: string, characterName: string): string {
  const filename = getCustomFilename(workId, characterName);
  if (!filename) return '';
  return `${getDocDir()}avatars/${workId}/${filename}`;
}

export async function checkCustomAvatarExists(uri: string): Promise<boolean> {
  if (!uri) return false;
  try {
    const info = await getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}

export async function deleteCustomAvatar(
  workId: string,
  characterName: string,
): Promise<void> {
  const uri = getCustomAvatarUri(workId, characterName);
  if (uri) {
    try { await deleteAsync(uri); } catch { /* doesn't exist */ }
  }
  clearCustomFilename(workId, characterName);
}

export async function saveCustomAvatar(
  workId: string,
  characterName: string,
  sourceUri: string,
): Promise<string | null> {
  const chars = loadCharacters(workId);
  if (!chars) return null;

  const ext = sourceUri.split('.').pop()?.toLowerCase() || 'png';
  const filename = `${characterName.replace(/\s+/g, '_')}.${ext}`;
  setCustomFilename(workId, characterName, filename);

  const dir = `${getDocDir()}avatars/${workId}/`;
  await makeDirectoryAsync(dir, { intermediates: true });

  const dest = `${dir}${filename}`;
  try { await deleteAsync(dest); } catch { /* doesn't exist yet */ }
  await copyAsync({ from: sourceUri, to: dest });

  return dest;
}

export function loadCharacters(workId: string): CharacterData | null {
  const loader = builtinCharacters[workId];
  if (!loader) return null;
  return loader();
}

export function getProtagonist(workId: string): string | null {
  const chars = loadCharacters(workId);
  return chars?.protagonist ?? null;
}

/**
 * Get the avatar image source for a character by name.
 * Built-in mapping is never mutated, so restoring custom avatar returns the original.
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
