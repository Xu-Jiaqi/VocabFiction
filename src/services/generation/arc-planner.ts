import type { ArcPlan, Chapter, EpisodeSlot, PendingWord, ReadingProgressState } from './types';

const DEFAULT_EPISODES_PER_ARC = 10;
const MAX_EPISODE_WORDS = 600;
const OVERLAP_WORDS = 100;
const SIDE_EP_REJECT_THRESHOLD = 3;
const SIDE_EP_TRIGGER_MIN_WORDS = 5;
const SIDE_EPISODE_POSITION = -1;

export interface ArcPlannerConfig {
  episodes_per_arc: number;
  max_episode_words: number;
  overlap_words: number;
  side_ep_reject_threshold: number;
  side_ep_trigger_min_words: number;
  side_episode_position: number;
}

function defaultConfig(config?: Partial<ArcPlannerConfig>): ArcPlannerConfig {
  return {
    episodes_per_arc: DEFAULT_EPISODES_PER_ARC,
    max_episode_words: MAX_EPISODE_WORDS,
    overlap_words: OVERLAP_WORDS,
    side_ep_reject_threshold: SIDE_EP_REJECT_THRESHOLD,
    side_ep_trigger_min_words: SIDE_EP_TRIGGER_MIN_WORDS,
    side_episode_position: SIDE_EPISODE_POSITION,
    ...config,
  };
}

function shouldAddSideEpisode(
  pendingWords: PendingWord[],
  config: ArcPlannerConfig,
): boolean {
  const qualifying = pendingWords.filter(
    (word) => word.rejected_count >= config.side_ep_reject_threshold,
  ).length;
  return qualifying >= config.side_ep_trigger_min_words;
}

function extractSourceText(
  chapters: Chapter[],
  startChapterId: number,
  startWordOffset: number,
  numWords: number,
): { text: string; endChapterId: number; endWordOffset: number } {
  const collected: string[] = [];
  let chapterIndex = startChapterId;
  let endChapterId = startChapterId;
  let endWordOffset = startWordOffset;

  while (collected.length < numWords) {
    const chapter = chapters.find((c) => c.chapter_id === chapterIndex);
    if (!chapter) break;

    const words = chapter.raw_text.split(/\s+/).filter(Boolean);
    const startIndex = chapterIndex === startChapterId ? startWordOffset : 0;
    const remainingNeeded = numWords - collected.length;
    const available = words.length - startIndex;

    if (available >= remainingNeeded) {
      collected.push(...words.slice(startIndex, startIndex + remainingNeeded));
      endChapterId = chapterIndex;
      endWordOffset = startIndex + remainingNeeded;
      return {
        text: collected.join(' '),
        endChapterId,
        endWordOffset,
      };
    }

    collected.push(...words.slice(startIndex));
    endChapterId = chapterIndex;
    endWordOffset = words.length;
    chapterIndex += 1;
  }

  return {
    text: collected.join(' '),
    endChapterId,
    endWordOffset,
  };
}

export function planNextArc(params: {
  arcId: string;
  progress: ReadingProgressState;
  chapters: Chapter[];
  prevArc?: ArcPlan | null;
  config?: Partial<ArcPlannerConfig>;
}): { arcPlan: ArcPlan; endChapterId: number; endWordOffset: number } {
  const config = defaultConfig(params.config);
  const { progress, chapters, prevArc } = params;

  if (chapters.length === 0) throw new Error('No chapters available');
  if (progress.chapter_offset < 0 || progress.chapter_offset > 1) {
    throw new Error(`chapter_offset must be in [0,1], got ${progress.chapter_offset}`);
  }

  const episodes: EpisodeSlot[] = [];
  const pendingWords = prevArc?.pending_words ?? [];
  const maxEpisodes = config.episodes_per_arc;
  const sideIndex = config.side_episode_position < 0
    ? maxEpisodes + config.side_episode_position
    : config.side_episode_position;

  let currentChapterId = progress.current_chapter;
  const startChapter = chapters.find((c) => c.chapter_id === currentChapterId);
  if (!startChapter) {
    return {
      arcPlan: { arc_id: params.arcId, pending_words: [], episodes: [] },
      endChapterId: currentChapterId,
      endWordOffset: 0,
    };
  }

  let wordPos = Math.floor(
    startChapter.raw_text.split(/\s+/).filter(Boolean).length * progress.chapter_offset,
  );
  const startEpisodeId = prevArc?.episodes.length
    ? prevArc.episodes[prevArc.episodes.length - 1].episode_id + 1
    : 1;

  const lastChapterId = Math.max(...chapters.map((chapter) => chapter.chapter_id));
  const lastChapter = chapters.find((chapter) => chapter.chapter_id === lastChapterId);
  const lastChapterWordCount = lastChapter?.raw_text.split(/\s+/).filter(Boolean).length ?? 0;

  let endChapterId = currentChapterId;
  let endWordOffset = wordPos;

  const addSide = (episodeId: number) => {
    episodes.push({
      episode_id: episodeId,
      episode_type: 'side',
      source_text: null,
      previous_context: [],
      target_words: [],
    });
  };

  for (let epIndex = 0; epIndex < maxEpisodes; epIndex++) {
    const episodeId = startEpisodeId + epIndex;

    if (epIndex === sideIndex && shouldAddSideEpisode(pendingWords, config)) {
      addSide(episodeId);
      endChapterId = currentChapterId;
      endWordOffset = wordPos;
      continue;
    }

    const extracted = extractSourceText(
      chapters,
      currentChapterId,
      wordPos,
      config.max_episode_words,
    );
    endChapterId = extracted.endChapterId;
    endWordOffset = extracted.endWordOffset;

    const sourceWordCount = extracted.text ? extracted.text.split(/\s+/).filter(Boolean).length : 0;
    if (sourceWordCount === 0) {
      if (shouldAddSideEpisode(pendingWords, config)
        && !episodes.some((episode) => episode.episode_type === 'side')) {
        addSide(episodeId);
      }
      break;
    }

    episodes.push({
      episode_id: episodeId,
      episode_type: 'main',
      source_text: extracted.text,
      previous_context: [],
      target_words: [],
    });

    const textExhausted = endChapterId === lastChapterId
      && endWordOffset >= lastChapterWordCount;
    if (textExhausted) {
      if (shouldAddSideEpisode(pendingWords, config)
        && !episodes.some((episode) => episode.episode_type === 'side')) {
        addSide(episodeId + 1);
      }
      break;
    }

    if (sourceWordCount >= config.overlap_words) {
      const nextStart = endWordOffset - config.overlap_words;
      if (nextStart < 0) {
        const prevChapterId = endChapterId > 1 ? endChapterId - 1 : 1;
        const prevChapter = chapters.find((chapter) => chapter.chapter_id === prevChapterId);
        if (prevChapter) {
          const prevWordCount = prevChapter.raw_text.split(/\s+/).filter(Boolean).length;
          wordPos = Math.max(0, prevWordCount + nextStart);
          currentChapterId = prevChapterId;
        } else {
          wordPos = 0;
          currentChapterId = endChapterId;
        }
      } else {
        wordPos = nextStart;
        currentChapterId = endChapterId;
      }
    } else {
      wordPos = endWordOffset;
      currentChapterId = endChapterId;
    }
  }

  return {
    arcPlan: {
      arc_id: params.arcId,
      pending_words: pendingWords,
      episodes,
    },
    endChapterId,
    endWordOffset,
  };
}
