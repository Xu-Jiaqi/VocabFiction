import {
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  readDirectoryAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import type { Episode } from '@/src/models/episode';
import type { WordList } from '@/src/models/word-list';
import { BUILTIN_WORD_LIST_ID } from '@/src/models/word-list';
import { getWordList, insertWordList } from '@/src/db/word-lists';
import { decodeTextBytes } from './text-file';
import type {
  ArcPlan,
  Chapter,
  UserVocabulary,
} from '@/src/services/generation/types';

const ROOT_DIR = `${documentDirectory ?? ''}novels`;
const WORD_LIST_DIR = `${ROOT_DIR}/word-lists`;
const LATEST_WORD_LIST = `${WORD_LIST_DIR}/latest.txt`;
const LATEST_WORD_LIST_META = `${WORD_LIST_DIR}/latest.json`;

export interface UploadedWordList {
  id: string;
  name: string;
  text: string;
  source: 'builtin' | 'user';
  updated_at: string;
}

export function makeUserWorkId(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `user-${base || 'work'}-${Date.now().toString(36)}`;
}

function makeUserWordListId(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `wordlist-${base || 'list'}-${Date.now().toString(36)}`;
}

export function getUserWorkDir(workId: string): string {
  return `${ROOT_DIR}/${workId}`;
}

function padEp(epNum: number): string {
  return String(epNum).padStart(2, '0');
}

function toUploadedWordList(wordList: WordList): UploadedWordList {
  return {
    id: wordList.id,
    name: wordList.name,
    text: wordList.text,
    source: wordList.source,
    updated_at: wordList.updated_at,
  };
}

async function readJsonFile<T>(uri: string): Promise<T | null> {
  const info = await getInfoAsync(uri);
  if (!info.exists) return null;
  const raw = await readAsStringAsync(uri);
  return JSON.parse(raw) as T;
}

async function findEpisodeFile(workId: string, epNum: number): Promise<string | null> {
  const dir = `${getUserWorkDir(workId)}/episodes`;
  const info = await getInfoAsync(dir);
  if (!info.exists || !info.isDirectory) return null;

  const prefix = `ep${padEp(epNum)}`;
  const files = await readDirectoryAsync(dir);
  const file = files.find((name) => name.startsWith(prefix) && name.endsWith('.json'));
  return file ? `${dir}/${file}` : null;
}

export async function loadUserEpisode(workId: string, epNum: number): Promise<Episode | null> {
  const direct = `${getUserWorkDir(workId)}/episodes/ep${padEp(epNum)}.json`;
  const directEpisode = await readJsonFile<Episode>(direct);
  if (directEpisode) return directEpisode;

  const found = await findEpisodeFile(workId, epNum);
  return found ? readJsonFile<Episode>(found) : null;
}

export async function loadUserPlainText(workId: string): Promise<string | null> {
  const candidates = [
    `${getUserWorkDir(workId)}/plain.txt`,
    `${getUserWorkDir(workId)}/paras/para_ch01.txt`,
  ];

  for (const uri of candidates) {
    const info = await getInfoAsync(uri);
    if (info.exists) return readAsStringAsync(uri);
  }
  return null;
}

export async function saveUploadedWordList(params: {
  name: string;
  text: string;
}): Promise<UploadedWordList> {
  const name = params.name.trim() || 'Uploaded Word List';
  const text = params.text.trim();
  const id = makeUserWordListId(name);
  const updated_at = new Date().toISOString();

  await insertWordList({ id, name, text, source: 'user' });

  await makeDirectoryAsync(WORD_LIST_DIR, { intermediates: true });
  await writeAsStringAsync(LATEST_WORD_LIST, text);
  await writeAsStringAsync(
    LATEST_WORD_LIST_META,
    JSON.stringify({ id, name, updated_at }, null, 2),
  );

  return { id, name, text, source: 'user', updated_at };
}

export async function loadLatestWordList(): Promise<UploadedWordList | null> {
  const info = await getInfoAsync(LATEST_WORD_LIST);
  if (!info.exists) {
    const builtin = await getWordList(BUILTIN_WORD_LIST_ID);
    return builtin ? toUploadedWordList(builtin) : null;
  }

  const text = await readAsStringAsync(LATEST_WORD_LIST);
  const meta = await readJsonFile<{ id?: string; name?: string; updated_at?: string }>(
    LATEST_WORD_LIST_META,
  );

  if (meta?.id) {
    const existing = await getWordList(meta.id);
    if (existing) return toUploadedWordList(existing);
  }

  const name = meta?.name?.trim() || 'Uploaded Word List';
  const id = meta?.id ?? makeUserWordListId(name);
  const updated_at = meta?.updated_at ?? new Date().toISOString();

  await insertWordList({ id, name, text, source: 'user' });
  await writeAsStringAsync(
    LATEST_WORD_LIST_META,
    JSON.stringify({ id, name, updated_at }, null, 2),
  );

  return { id, name, text, source: 'user', updated_at };
}

export async function saveUploadedWorkContent(params: {
  workId: string;
  title: string;
  novelText: string;
  wordListId: string;
}): Promise<void> {
  const workDir = getUserWorkDir(params.workId);
  await makeDirectoryAsync(workDir, { intermediates: true });

  await writeAsStringAsync(`${workDir}/plain.txt`, params.novelText);
  await writeAsStringAsync(
    `${workDir}/meta.json`,
    JSON.stringify(
      {
        title: params.title,
        word_list_id: params.wordListId,
        saved_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

export async function saveGeneratedEpisodes(
  workId: string,
  episodes: Episode[],
): Promise<void> {
  const episodesDir = `${getUserWorkDir(workId)}/episodes`;
  await makeDirectoryAsync(episodesDir, { intermediates: true });

  await Promise.all(
    episodes.map((episode, index) => {
      const epNum = episode.meta.ep || index + 1;
      return writeAsStringAsync(
        `${episodesDir}/ep${padEp(epNum)}.json`,
        JSON.stringify(episode, null, 2),
      );
    }),
  );
}

export async function saveWorkGenerationData(params: {
  workId: string;
  chapters: Chapter[];
  arcPlan: ArcPlan;
  userVocabulary: UserVocabulary;
}): Promise<void> {
  const workDir = getUserWorkDir(params.workId);
  await makeDirectoryAsync(workDir, { intermediates: true });
  await Promise.all([
    writeAsStringAsync(
      `${workDir}/chapters.json`,
      JSON.stringify({ chapters: params.chapters }, null, 2),
    ),
    writeAsStringAsync(
      `${workDir}/arc-plan.json`,
      JSON.stringify(params.arcPlan, null, 2),
    ),
    writeAsStringAsync(
      `${workDir}/vocabulary.json`,
      JSON.stringify(params.userVocabulary, null, 2),
    ),
  ]);
}

export async function loadWorkVocabulary(workId: string): Promise<UserVocabulary | null> {
  return readJsonFile<UserVocabulary>(`${getUserWorkDir(workId)}/vocabulary.json`);
}

export async function saveWorkVocabulary(
  workId: string,
  userVocabulary: UserVocabulary,
): Promise<void> {
  const workDir = getUserWorkDir(workId);
  await makeDirectoryAsync(workDir, { intermediates: true });
  await writeAsStringAsync(
    `${workDir}/vocabulary.json`,
    JSON.stringify(userVocabulary, null, 2),
  );
}

export async function deleteUploadedWorkContent(workId: string): Promise<void> {
  await deleteAsync(getUserWorkDir(workId), { idempotent: true });
}

/**
 * Save uploaded novel content by reading the picked file, auto-detecting
 * its encoding (UTF-8 / UTF-16 / GBK / ASCII), decoding to UTF-8, and
 * writing the result to disk.  The decoded string never enters React
 * state — it goes directly from the decoder to the file-system write.
 */
export async function saveUploadedWorkContentFromFile(params: {
  workId: string;
  title: string;
  fileUri: string;
  wordListId: string;
}): Promise<string> {
  const workDir = getUserWorkDir(params.workId);
  await makeDirectoryAsync(workDir, { intermediates: true });

  // Read bytes → auto-detect encoding → decode → write UTF-8 to disk.
  // decodeTextBytes tries UTF-8 first; if the result looks garbled
  // (high U+FFFD ratio) it falls back to GBK automatically.
  const file = new File(params.fileUri);
  const bytes = await file.bytes();
  const utf8Content = decodeTextBytes(bytes);

  await writeAsStringAsync(`${workDir}/plain.txt`, utf8Content);
  await writeAsStringAsync(
    `${workDir}/meta.json`,
    JSON.stringify(
      {
        title: params.title,
        word_list_id: params.wordListId,
        saved_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  return utf8Content;
}
