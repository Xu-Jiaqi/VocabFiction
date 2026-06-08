import { chatJson } from './model-client';
import type { Chapter } from './types';

const MIN_CHAPTER_BODY_LENGTH = 100;
const MAX_SPLIT_CHARS = 30_000;
const MAX_METADATA_CHARS = 8_000;

const CHAPTER_HEADING_PATTERNS: RegExp[] = [
  /^Chapter\s+\d+/gim,
  /^CHAPTER\s+\w+/gm,
  /^\d+\.\s+\S/gm,
  /^第[一二三四五六七八九十百千\d]+\s*章/gm,
];

const CHAPTER_SPLIT_SYSTEM_PROMPT = `You are a novel manuscript analyst. Your task is to split a raw text into chapters.

The text may contain chapter headings like "Chapter 1", "CHAPTER ONE", "1. A New Beginning", etc.
If no clear headings exist, identify natural chapter breaks based on scene changes, time jumps,
or major narrative shifts.

For each chapter you identify, provide:
- title: A short, descriptive title (3-10 words) that captures the chapter's essence
- text: The full chapter body text, starting from the chapter beginning (including any heading found)

Do NOT summarize or rewrite the text. Keep the original wording exactly as provided.
Output JSON only: {"chapters":[{"title":"...","text":"..."}]}.`;

const METADATA_SYSTEM_PROMPT = `You are a literary analyst specializing in novel analysis. Your task is to extract structured metadata from a chapter of a novel.

For the provided chapter text, extract:
- title: A concise, descriptive chapter title (3-10 words) that captures the chapter's essence
- summary: A 2-4 sentence summary of what happens in this chapter. Write in a narrative style
- characters: A list of named characters who appear or are mentioned in this chapter. Include only proper names
- world_setting: A brief description of the primary setting/location where this chapter takes place (3-12 words)
- estimated_reading_time: An estimate of reading time in minutes (integer). Assume average reading speed of 250 words per minute

Be specific and accurate. Only list characters that are explicitly named in the text.
Output JSON only.`;

type ChapterSplitResponse = {
  chapters?: Array<{ title?: unknown; text?: unknown }>;
};

type ChapterMetadataResponse = {
  title?: unknown;
  summary?: unknown;
  characters?: unknown;
  world_setting?: unknown;
  estimated_reading_time?: unknown;
};

function splitByPattern(text: string, pattern: RegExp): Array<[string, string]> | null {
  pattern.lastIndex = 0;
  const matches = Array.from(text.matchAll(pattern));
  if (matches.length < 2) return null;

  const chapters: Array<[string, string]> = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = match.index ?? 0;
    const end = i + 1 < matches.length ? matches[i + 1].index ?? text.length : text.length;
    const segment = text.slice(start, end);
    const headingEnd = segment.indexOf('\n');
    const heading = headingEnd === -1 ? segment.trim() : segment.slice(0, headingEnd).trim();
    const body = headingEnd === -1 ? '' : segment.slice(headingEnd).trim();

    if (body.length >= MIN_CHAPTER_BODY_LENGTH) {
      chapters.push([heading, body]);
    }
  }

  return chapters.length >= 2 ? chapters : null;
}

export function splitChaptersRegex(rawText: string): Array<[string, string]> | null {
  for (const pattern of CHAPTER_HEADING_PATTERNS) {
    const chapters = splitByPattern(rawText, pattern);
    if (chapters) return chapters;
  }
  return null;
}

async function splitChaptersByModel(rawText: string): Promise<Array<[string, string]>> {
  const truncated = rawText.length > MAX_SPLIT_CHARS
    ? `${rawText.slice(0, MAX_SPLIT_CHARS)}\n\n[Note: text was truncated to 30,000 characters for analysis.]`
    : rawText;

  const result = await chatJson<ChapterSplitResponse>(
    [
      { role: 'system', content: CHAPTER_SPLIT_SYSTEM_PROMPT },
      { role: 'user', content: `Split the following novel text into chapters:\n\n${truncated}` },
    ],
    { maxTokens: 8192, timeoutMs: 180_000 },
  );

  if (!Array.isArray(result.chapters)) {
    throw new Error('chapters must be an array');
  }

  const chapters = result.chapters
    .map((chapter, index): [string, string] => {
      const title = typeof chapter.title === 'string' ? chapter.title.trim() : '';
      const text = typeof chapter.text === 'string' ? chapter.text.trim() : '';
      if (!title) throw new Error(`chapter ${index + 1} title is empty`);
      if (text.length < MIN_CHAPTER_BODY_LENGTH) {
        throw new Error(`chapter ${index + 1} text is too short`);
      }
      return [title, text];
    });

  if (!chapters.length) {
    throw new Error('模型没有返回有效章节');
  }

  return chapters;
}

function fallbackMetadata(chapterIndex: number, text: string): Omit<Chapter, 'chapter_id' | 'raw_text'> {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return {
    title: `Chapter ${chapterIndex}`,
    summary: `Chapter ${chapterIndex} (${wordCount} words).`,
    characters: [],
    world_setting: 'Unknown',
    estimated_reading_time: Math.max(1, Math.round(wordCount / 250)),
  };
}

function validateMetadata(
  result: ChapterMetadataResponse,
  chapterIndex: number,
): Omit<Chapter, 'chapter_id' | 'raw_text'> {
  if (typeof result.title !== 'string' || result.title.length < 1 || result.title.length > 120) {
    throw new Error(`chapter ${chapterIndex} title is invalid`);
  }
  if (
    typeof result.summary !== 'string'
    || result.summary.length < 20
    || result.summary.length > 500
  ) {
    throw new Error(`chapter ${chapterIndex} summary is invalid`);
  }
  if (!Array.isArray(result.characters) || !result.characters.every((c) => typeof c === 'string')) {
    throw new Error(`chapter ${chapterIndex} characters are invalid`);
  }
  if (
    typeof result.world_setting !== 'string'
    || result.world_setting.length < 3
    || result.world_setting.length > 200
  ) {
    throw new Error(`chapter ${chapterIndex} world_setting is invalid`);
  }
  if (
    typeof result.estimated_reading_time !== 'number'
    || result.estimated_reading_time < 1
    || result.estimated_reading_time > 120
  ) {
    throw new Error(`chapter ${chapterIndex} estimated_reading_time is invalid`);
  }

  return {
    title: result.title,
    summary: result.summary,
    characters: result.characters,
    world_setting: result.world_setting,
    estimated_reading_time: Math.round(result.estimated_reading_time),
  };
}

async function extractMetadata(
  text: string,
  chapterIndex: number,
): Promise<Omit<Chapter, 'chapter_id' | 'raw_text'>> {
  try {
    const result = await chatJson<ChapterMetadataResponse>(
      [
        { role: 'system', content: METADATA_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Extract metadata for the following chapter:\n\n${text.slice(0, MAX_METADATA_CHARS)}`,
        },
      ],
      { maxTokens: 1024, timeoutMs: 90_000 },
    );

    return validateMetadata(result, chapterIndex);
  } catch (e) {
    console.warn('[LocalGeneration] Metadata fallback:', e);
    return fallbackMetadata(chapterIndex, text);
  }
}

export async function preprocessNovel(title: string, rawText: string): Promise<Chapter[]> {
  const stripped = rawText.trim();
  if (!stripped) throw new Error('小说内容为空');

  let segments = splitChaptersRegex(stripped);
  if (!segments) {
    try {
      segments = await splitChaptersByModel(stripped);
    } catch (e) {
      console.warn('[LocalGeneration] Chapter split fallback:', e);
      segments = [[title || 'Chapter 1', stripped]];
    }
  }

  const chapters: Chapter[] = [];
  for (let i = 0; i < segments.length; i++) {
    const [titleHint, text] = segments[i];
    const metadata = await extractMetadata(text, i + 1);
    chapters.push({
      chapter_id: i + 1,
      title: metadata.title || titleHint || `Chapter ${i + 1}`,
      raw_text: text,
      summary: metadata.summary,
      characters: metadata.characters,
      world_setting: metadata.world_setting,
      estimated_reading_time: metadata.estimated_reading_time,
    });
  }

  return chapters;
}
