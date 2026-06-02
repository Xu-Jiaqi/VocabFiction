import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  readDirectoryAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import type { Episode, Mark, Message, VocabItem } from '@/src/models/episode';

const ROOT_DIR = `${documentDirectory ?? ''}novels`;

export function makeUserWorkId(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `user-${base || 'work'}-${Date.now().toString(36)}`;
}

export function getUserWorkDir(workId: string): string {
  return `${ROOT_DIR}/${workId}`;
}

function padEp(epNum: number): string {
  return String(epNum).padStart(2, '0');
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

function parseWordList(wordListText: string): string[] {
  return Array.from(new Set(
    wordListText
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .filter(Boolean),
  ));
}

function makeMarks(text: string, targetWords: Set<string>, seen: Set<string>): Mark[] {
  const segments = text.split(/(\s+)/);
  const marks: Mark[] = [];
  let wordIdx = 0;

  for (const segment of segments) {
    if (!segment || /^\s+$/.test(segment)) continue;
    const normalized = segment.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');
    if (normalized && targetWords.has(normalized)) {
      marks.push({
        word: segment,
        index: wordIdx,
        definition: '待查',
        is_new: !seen.has(normalized),
      });
      seen.add(normalized);
    }
    wordIdx++;
  }

  return marks;
}

function makeEpisodeFromPlainText(title: string, novelText: string, wordListText: string): Episode {
  const targetWords = new Set(parseWordList(wordListText));
  const seen = new Set<string>();
  const chunks = novelText
    .split(/\n\s*\n|(?<=[.!?])\s+(?=[A-Z"'])/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 120);

  const messages: Message[] = chunks.map((text) => ({
    type: 'narration',
    text,
    marks: makeMarks(text, targetWords, seen),
  }));

  const vocab: VocabItem[] = Array.from(seen).map((word) => ({
    word,
    definition: '待查',
    is_new: true,
  }));

  return {
    meta: { ep: 1, title: title || 'Uploaded Work', kind: 'main' },
    messages,
    vocab,
  };
}

export async function saveUploadedWorkContent(params: {
  workId: string;
  title: string;
  novelText: string;
  wordListText: string;
}): Promise<void> {
  const workDir = getUserWorkDir(params.workId);
  const episodeDir = `${workDir}/episodes`;
  await makeDirectoryAsync(episodeDir, { intermediates: true });

  const episode = makeEpisodeFromPlainText(params.title, params.novelText, params.wordListText);
  await writeAsStringAsync(`${workDir}/plain.txt`, params.novelText);
  await writeAsStringAsync(`${workDir}/word_list.txt`, params.wordListText);
  await writeAsStringAsync(`${episodeDir}/ep01.json`, JSON.stringify(episode, null, 2));
}
