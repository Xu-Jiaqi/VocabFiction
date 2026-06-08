import { findMatchingWordSense, getWordSenses } from '@/src/db/word-senses';
import type { FsrsCardState, UserVocabulary, VocabularyItem } from './types';

function normalizeWord(raw: string): string {
  return raw.trim().toLowerCase();
}

function itemIdFor(word: string, index: number): string {
  const base = word.replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${base || 'word'}_${index}`;
}

function makeInitialFsrsCard(now = new Date()): FsrsCardState {
  return {
    card_id: now.getTime(),
    state: 1,
    step: null,
    stability: null,
    difficulty: null,
    due: now.toISOString(),
    last_review: null,
  };
}

function parseVocabularyLine(line: string): { word: string; meaning: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const explicit = trimmed.match(/^(.+?)(?:\t|,|，|:|：|\s+-\s+|\s+—\s+)(.+)$/);
  if (explicit) {
    return {
      word: explicit[1].trim(),
      meaning: explicit[2].trim(),
    };
  }

  const whitespace = trimmed.match(/^([A-Za-z][A-Za-z'-]*)\s+(.+)$/);
  if (whitespace) {
    return {
      word: whitespace[1].trim(),
      meaning: whitespace[2].trim(),
    };
  }

  return { word: trimmed, meaning: '' };
}

export function parseVocabularyText(text: string): Array<{ word: string; meaning: string }> {
  return text
    .split(/\r?\n/)
    .map(parseVocabularyLine)
    .filter((item): item is { word: string; meaning: string } => Boolean(item?.word));
}

async function createItemsForEntry(
  word: string,
  meaning: string,
  chapterFirstSeen: number,
  now: Date,
): Promise<VocabularyItem[]> {
  const normalized = normalizeWord(word);
  if (!normalized) return [];

  const userMeaning = meaning.trim();
  if (userMeaning) {
    const matched = await findMatchingWordSense(normalized, userMeaning);
    return [buildItem(
      matched?.id ?? itemIdFor(normalized, 1),
      normalized,
      matched?.meaning ?? userMeaning,
      chapterFirstSeen,
      now,
    )];
  }

  const senses = await getWordSenses(normalized);
  if (senses.length === 0) {
    return [buildItem(itemIdFor(normalized, 1), normalized, '', chapterFirstSeen, now)];
  }

  return senses.map((sense) => buildItem(
    sense.id,
    normalized,
    sense.meaning,
    chapterFirstSeen,
    now,
  ));
}

function buildItem(
  id: string,
  word: string,
  meaning: string,
  chapterFirstSeen: number,
  now: Date,
): VocabularyItem {
  return {
    id,
    word,
    meaning,
    chapter_first_seen: chapterFirstSeen,
    history_window: [0],
    fsrs_card: makeInitialFsrsCard(now),
  };
}

export async function preprocessVocabulary(
  text: string,
  userId = 'default',
  chapterFirstSeen = 1,
): Promise<UserVocabulary> {
  const now = new Date();
  const rawItems = parseVocabularyText(text);
  const seenIds = new Set<string>();
  const vocabulary: VocabularyItem[] = [];

  for (const raw of rawItems) {
    const items = await createItemsForEntry(
      raw.word,
      raw.meaning,
      chapterFirstSeen,
      now,
    );
    for (const item of items) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      vocabulary.push(item);
    }
  }

  return { user_id: userId, vocabulary };
}

export function getVocabIndex(userVocabulary: UserVocabulary): Record<string, VocabularyItem> {
  return Object.fromEntries(userVocabulary.vocabulary.map((item) => [item.id, item]));
}
