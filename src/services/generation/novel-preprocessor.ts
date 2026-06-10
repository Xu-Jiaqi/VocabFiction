import { chatJson } from './model-client';
import { generationLog, textStats } from './debug-log';
import { splitChaptersRegex } from './chapter-splitter';
import type { Chapter } from './types';

const MIN_CHAPTER_BODY_LENGTH = 100;
const MAX_SPLIT_LINES = 1_000;

const CHAPTER_SPLIT_SYSTEM_PROMPT = `You are a novel manuscript analyst. Your task is to identify chapter boundaries in a raw text.

The text may contain chapter headings like "Chapter 1", "CHAPTER ONE", "1. A New Beginning", "第一章", etc.
If no clear headings exist, identify natural chapter breaks based on scene changes, time jumps,
or major narrative shifts.

For each chapter you identify, provide:
- title: The chapter heading exactly as it appears in the text, or a short descriptive title if no heading exists
- start_line: The 0-based line number of the first line of the chapter, including its heading

Do NOT include the chapter body text in your response. Only return the title and start_line.
Output JSON only: {"chapters":[{"title":"...","start_line":0}]}.`;

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
  chapters?: Array<{ title?: unknown; start_line?: unknown }>;
};

type ChapterMetadataResponse = {
  title?: unknown;
  summary?: unknown;
  characters?: unknown;
  world_setting?: unknown;
  estimated_reading_time?: unknown;
};

async function splitChaptersByModel(rawText: string): Promise<Array<[string, string]>> {
  const lines = rawText.split('\n');
  const limitedLines = lines.slice(0, MAX_SPLIT_LINES);
  const limitedText = lines.length > MAX_SPLIT_LINES
    ? `${limitedLines.join('\n')}\n\n[Note: text was truncated at line 1000 for analysis.]`
    : limitedLines.join('\n');

  generationLog.debug('chapters.split.model.start', {
    rawText: textStats(rawText),
    limitedText: textStats(limitedText),
    maxSplitLines: MAX_SPLIT_LINES,
  });
  const result = await chatJson<ChapterSplitResponse>(
    [
      { role: 'system', content: CHAPTER_SPLIT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          'Identify chapter boundaries in the following text.',
          'The first line below is line 0, the next is line 1, etc.',
          '',
          limitedText,
        ].join('\n'),
      },
    ],
    { timeoutMs: 180_000, maxTokens: 100_000 },
  );

  if (!Array.isArray(result.chapters)) {
    generationLog.error('chapters.split.model.invalid', { result });
    throw new Error('chapters must be an array');
  }
  generationLog.debug('chapters.split.model.response', {
    boundaries: result.chapters.length,
    sample: result.chapters.slice(0, 10),
  });

  const boundaries = result.chapters
    .map((chapter, index) => {
      const title = typeof chapter.title === 'string' ? chapter.title.trim() : '';
      const startLine = typeof chapter.start_line === 'number'
        ? Math.floor(chapter.start_line)
        : Number.NaN;
      if (!title) throw new Error(`chapter ${index + 1} title is empty`);
      if (!Number.isFinite(startLine) || startLine < 0) {
        throw new Error(`chapter ${index + 1} start_line is invalid`);
      }
      return { title, startLine };
    })
    .sort((a, b) => a.startLine - b.startLine);

  const chapters: Array<[string, string]> = [];
  for (let i = 0; i < boundaries.length; i++) {
    const start = Math.max(0, Math.min(boundaries[i].startLine, lines.length));
    const nextStart = i + 1 < boundaries.length ? boundaries[i + 1].startLine : lines.length;
    const end = Math.max(start + 1, Math.min(nextStart, lines.length));
    const text = lines.slice(start, end).join('\n').trim();
    if (text.length >= MIN_CHAPTER_BODY_LENGTH) {
      chapters.push([boundaries[i].title, text]);
    }
  }

  if (!chapters.length) {
    generationLog.error('chapters.split.model.empty', {
      boundaries,
      rawText: textStats(rawText),
    });
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

export async function extractChapterMetadata(
  text: string,
  chapterIndex: number,
): Promise<Omit<Chapter, 'chapter_id' | 'raw_text'>> {
  try {
    generationLog.debug('chapters.metadata.start', {
      chapterIndex,
      input: textStats(text),
      rawTextChars: text.length,
    });
    const result = await chatJson<ChapterMetadataResponse>(
      [
        { role: 'system', content: METADATA_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Extract metadata for the following chapter:\n\n${text}`,
        },
      ],
      { timeoutMs: 900_000, maxTokens: 100_000 },
      // 改为 900s，等待 DeepSeek v4-pro 推理模型完成 reasoning 阶段
    );

    const metadata = validateMetadata(result, chapterIndex);
    generationLog.debug('chapters.metadata.done', {
      chapterIndex,
      metadata,
    });
    return metadata;
  } catch (e) {
    generationLog.warn('chapters.metadata.fallback', {
      chapterIndex,
      error: (e as Error).message,
      text: textStats(text),
    });
    return fallbackMetadata(chapterIndex, text);
  }
}

export async function splitNovelChapters(
  title: string,
  rawText: string,
): Promise<Array<[string, string]>> {
  const stripped = rawText.trim();
  if (!stripped) throw new Error('小说内容为空');

  let segments = splitChaptersRegex(stripped);
  if (segments) {
    generationLog.debug('chapters.split.regex.done', {
      segments: segments.length,
      sample: segments.slice(0, 5).map(([segmentTitle, segmentText]) => ({
        title: segmentTitle,
        chars: segmentText.length,
      })),
    });
  }
  if (!segments) {
    try {
      segments = await splitChaptersByModel(stripped);
    } catch (e) {
      generationLog.warn('chapters.split.fallback', {
        title,
        error: (e as Error).message,
        rawText: textStats(stripped),
      });
      segments = [[title || 'Chapter 1', stripped]];
    }
  }

  return segments;
}
