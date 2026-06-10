import type { Episode } from '@/src/models/episode';
import { planNextArc } from './arc-planner';
import { annotateMessages } from './annotator';
import { generationLog, textStats } from './debug-log';
import { formatEpisode } from './episode-formatter';
import { splitNovelChapters, extractChapterMetadata } from './novel-preprocessor';
import { scheduleVocabulary } from './scheduler';
import { rewriteBatch } from './story-rewriter';
import { preprocessVocabulary } from './vocabulary';
import type { ArcPlan, Chapter, ReadingProgressState, UserVocabulary } from './types';
import {
  saveGenerationCheckpoint,
  type LocalGenerationCheckpoint,
} from './checkpoint';

export type LocalGenerationPhase =
  | 'VOCABULARY'
  | 'CHAPTERS'
  | 'METADATA'
  | 'PLANNING'
  | 'SCHEDULING'
  | 'GENERATING'
  | 'ANNOTATING'
  | 'FORMATTING'
  | 'COMPLETE';

export interface LocalGenerationStatus {
  phase: LocalGenerationPhase;
  current: number;
  total: number;
  message: string;
}

export function formatLocalGenerationStatus(status: LocalGenerationStatus): string {
  if (status.total > 0) {
    return `${status.message}（${status.current}/${status.total}）`;
  }
  return status.message;
}

export interface LocalGenerationResult {
  chapters: Chapter[];
  userVocabulary: UserVocabulary;
  arcPlan: ArcPlan;
  episodes: Episode[];
}

function defaultProgress(): ReadingProgressState {
  return {
    current_chapter: 1,
    current_episode: 1,
    chapter_offset: 0,
    total_episodes_read: 0,
  };
}

function emit(
  onStatus: ((status: LocalGenerationStatus) => void) | undefined,
  status: LocalGenerationStatus,
) {
  onStatus?.(status);
}

function withElapsedSuffix(message: string, startedAt: number): string {
  const elapsedSeconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
  return `${message}（已等待 ${elapsedSeconds}s）`;
}

export async function generateEpisodesInApp(params: {
  workId?: string;
  title: string;
  novelText: string;
  wordListText: string;
  resumeFrom?: LocalGenerationCheckpoint | null;
  onStatus?: (status: LocalGenerationStatus) => void;
}): Promise<LocalGenerationResult> {
  const runId = `gen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  generationLog.debug('pipeline.start', {
    runId,
    workId: params.workId,
    title: params.title,
    novelText: textStats(params.novelText),
    wordListText: textStats(params.wordListText),
    resume: params.resumeFrom
      ? {
        phase: params.resumeFrom.phase,
        current: params.resumeFrom.current,
        total: params.resumeFrom.total,
        chapters: params.resumeFrom.chapters?.length ?? 0,
        vocabulary: params.resumeFrom.userVocabulary?.vocabulary.length ?? 0,
        arcEpisodes: params.resumeFrom.arcPlan?.episodes.length ?? 0,
        savedEpisodes: params.resumeFrom.episodes?.length ?? 0,
      }
      : null,
  });
  let userVocabulary = params.resumeFrom?.userVocabulary;
  let chapters = params.resumeFrom?.chapters;
  let arcPlan = params.resumeFrom?.arcPlan;
  let arcPlanScheduled = params.resumeFrom?.arcPlanScheduled ?? false;
  const episodes: Episode[] = [...(params.resumeFrom?.episodes ?? [])];
  let lastStatus: LocalGenerationStatus = {
    phase: 'VOCABULARY',
    current: 0,
    total: 0,
    message: '正在处理词表...',
  };

  const report = (status: LocalGenerationStatus) => {
    lastStatus = status;
    emit(params.onStatus, status);
  };

  const checkpoint = async (
    status: LocalGenerationStatus,
    lastError?: string,
  ) => {
    report(status);
    if (!params.workId) return;
    await saveGenerationCheckpoint(params.workId, {
      ...status,
      chapters,
      userVocabulary,
      arcPlan,
      arcPlanScheduled,
      episodes,
      last_error: lastError,
    });
  };

  try {
    if (!userVocabulary) {
      await checkpoint({
        phase: 'VOCABULARY',
        current: 0,
        total: 0,
        message: '正在处理词表...',
      });
      userVocabulary = await preprocessVocabulary(params.wordListText);
      generationLog.debug('pipeline.vocabulary.done', {
        runId,
        items: userVocabulary.vocabulary.length,
        sample: userVocabulary.vocabulary.slice(0, 10).map((item) => ({
          id: item.id,
          word: item.word,
          meaning: item.meaning,
        })),
      });
    }
    if (userVocabulary.vocabulary.length === 0) {
      throw new Error('词表为空，无法生成分集');
    }
    await checkpoint({
      phase: 'VOCABULARY',
      current: userVocabulary.vocabulary.length,
      total: userVocabulary.vocabulary.length,
      message: '词表处理完成',
    });

    let segments: Array<[string, string]> = [];
    if (!chapters) {
      await checkpoint({
        phase: 'CHAPTERS',
        current: 0,
        total: 0,
        message: '正在切分小说章节...',
      });
      segments = await splitNovelChapters(params.title, params.novelText);
      generationLog.debug('pipeline.chapters.done', {
        runId,
        segments: segments.length,
        sample: segments.slice(0, 5).map(([t, text]) => ({
          title: t,
          chars: text.length,
        })),
      });
      await checkpoint({
        phase: 'CHAPTERS',
        current: segments.length,
        total: segments.length,
        message: `章节切分完成（${segments.length} 章）`,
      });

      // Metadata extraction — concurrent with progress
      let metadataDone = 0;
      const totalChapters = segments.length;
      const startedAt = Date.now();
      const pulse = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        report({
          phase: 'METADATA',
          current: metadataDone,
          total: totalChapters,
          message: `正在提取第 ${metadataDone}/${totalChapters} 章元数据...（${elapsed}s）`,
        });
      }, 2000);

      let metadatas: Array<Omit<Chapter, 'chapter_id' | 'raw_text'>>;
      try {
        metadatas = await Promise.all(
          segments.map(async ([, text], i) => {
            const result = await extractChapterMetadata(text, i + 1);
            metadataDone++;
            return result;
          }),
        );
      } finally {
        clearInterval(pulse);
      }

      chapters = segments.map(([titleHint, text], i) => {
        const metadata = metadatas[i];
        return {
          chapter_id: i + 1,
          title: metadata.title || titleHint || `Chapter ${i + 1}`,
          raw_text: text,
          summary: metadata.summary,
          characters: metadata.characters,
          world_setting: metadata.world_setting,
          estimated_reading_time: metadata.estimated_reading_time,
        };
      });

      generationLog.debug('pipeline.metadata.done', {
        runId,
        chapters: chapters.length,
        sample: chapters.slice(0, 5).map((chapter) => ({
          chapter_id: chapter.chapter_id,
          title: chapter.title,
          rawTextChars: chapter.raw_text.length,
          characters: chapter.characters,
        })),
      });
    }
    await checkpoint({
      phase: 'METADATA',
      current: chapters.length,
      total: chapters.length,
      message: '元数据提取完成',
    });

    if (!arcPlan) {
      await checkpoint({
        phase: 'PLANNING',
        current: 0,
        total: 0,
        message: '正在规划分集...',
      });
      const planned = planNextArc({
        arcId: `arc_${Date.now().toString(36)}`,
        progress: defaultProgress(),
        chapters,
        prevArc: null,
      });
      arcPlan = planned.arcPlan;
      arcPlanScheduled = false;
      generationLog.debug('pipeline.planning.done', {
        runId,
        pendingWords: arcPlan.pending_words.length,
        episodes: arcPlan.episodes.map((episode) => ({
          episode_id: episode.episode_id,
          episode_type: episode.episode_type,
          sourceTextChars: episode.source_text?.length ?? 0,
          previousContext: episode.previous_context.length,
        })),
      });
    }
    if (arcPlan.episodes.length === 0) {
      throw new Error('小说文本太短或无法规划分集');
    }
    await checkpoint({
      phase: 'PLANNING',
      current: arcPlan.episodes.length,
      total: arcPlan.episodes.length,
      message: '分集规划完成',
    });

    if (!arcPlanScheduled) {
      await checkpoint({
        phase: 'SCHEDULING',
        current: 0,
        total: arcPlan.episodes.length,
        message: '正在调度目标词...',
      });
      arcPlan = await scheduleVocabulary(arcPlan, userVocabulary);
      arcPlanScheduled = true;
      generationLog.debug('pipeline.scheduling.done', {
        runId,
        episodes: arcPlan.episodes.map((episode) => ({
          episode_id: episode.episode_id,
          episode_type: episode.episode_type,
          targetWords: episode.target_words.length,
          newWords: episode.target_words.filter((word) => word.is_new).length,
          reviewWords: episode.target_words.filter((word) => !word.is_new).length,
        })),
      });
    }
    await checkpoint({
      phase: 'SCHEDULING',
      current: arcPlan.episodes.length,
      total: arcPlan.episodes.length,
      message: '目标词调度完成',
    });

    const remainingSlots = arcPlan.episodes.slice(episodes.length);
    let rewriteResults: Awaited<ReturnType<typeof rewriteBatch>> = [];
    if (remainingSlots.length > 0) {
      const generatingStartedAt = Date.now();
      const generatingStatus: LocalGenerationStatus = {
        phase: 'GENERATING',
        current: episodes.length,
        total: arcPlan.episodes.length,
        message: `正在批量生成剩余 ${remainingSlots.length} 集...`,
      };
      await checkpoint({
        ...generatingStatus,
        message: withElapsedSuffix(generatingStatus.message, generatingStartedAt),
      });
      generationLog.debug('pipeline.generating.start', {
        runId,
        remaining: remainingSlots.length,
        total: arcPlan.episodes.length,
        slots: remainingSlots.map((slot) => ({
          episode_id: slot.episode_id,
          episode_type: slot.episode_type,
          sourceTextChars: slot.source_text?.length ?? 0,
          targetWords: slot.target_words.length,
          previousContext: slot.previous_context.length,
        })),
      });

      const pulse = setInterval(() => {
        report({
          ...generatingStatus,
          message: withElapsedSuffix(generatingStatus.message, generatingStartedAt),
        });
      }, 5_000);

      try {
        rewriteResults = await rewriteBatch(
          remainingSlots,
          remainingSlots.map((slot) => slot.source_text ?? ''),
        );
      } finally {
        clearInterval(pulse);
      }
      generationLog.debug('pipeline.generating.done', {
        runId,
        results: rewriteResults.map((result, index) => ({
          index,
          messages: result.messages.length,
          targetWordsUsed: result.target_words_used.length,
          messageChars: result.messages.reduce((sum, message) => sum + message.text.length, 0),
        })),
      });

      await checkpoint({
        phase: 'GENERATING',
        current: arcPlan.episodes.length,
        total: arcPlan.episodes.length,
        message: '批量生成完成',
      });
    }

    for (let offset = 0; offset < remainingSlots.length; offset++) {
      const slot = remainingSlots[offset];
      const rewrite = rewriteResults[offset];
      const absoluteIndex = episodes.length;
      generationLog.debug('pipeline.annotating.start', {
        runId,
        episode_id: slot.episode_id,
        messageCount: rewrite.messages.length,
        targetWords: slot.target_words.length,
        targetWordsReported: rewrite.target_words_used.length,
      });
      const usedById = new Map(
        rewrite.target_words_used.map((used) => [used.item_id, used]),
      );
      const targetWordsUsed = slot.target_words
        .map((word) => ({ ...word, ...usedById.get(word.item_id) }));

      await checkpoint({
        phase: 'ANNOTATING',
        current: absoluteIndex + 1,
        total: arcPlan.episodes.length,
        message: `正在标注第 ${absoluteIndex + 1}/${arcPlan.episodes.length} 集词汇...`,
      });
      const annotated = await annotateMessages(
        rewrite.messages,
        targetWordsUsed,
        userVocabulary,
        new Set<string>(),
      );
      generationLog.debug('pipeline.annotating.done', {
        runId,
        episode_id: slot.episode_id,
        marks: annotated.reduce((sum, message) => sum + message.marks.length, 0),
        messagesWithMarks: annotated.filter((message) => message.marks.length > 0).length,
      });

      await checkpoint({
        phase: 'FORMATTING',
        current: absoluteIndex + 1,
        total: arcPlan.episodes.length,
        message: `正在整理第 ${absoluteIndex + 1}/${arcPlan.episodes.length} 集...`,
      });
      episodes.push(formatEpisode({
        ep: slot.episode_id,
        title: `Episode ${slot.episode_id}`,
        kind: slot.episode_type,
        messages: annotated,
      }));
      generationLog.debug('pipeline.formatting.done', {
        runId,
        episode_id: slot.episode_id,
        savedEpisodes: episodes.length,
        vocab: episodes[episodes.length - 1]?.vocab.length ?? 0,
      });
      await checkpoint({
        phase: 'FORMATTING',
        current: episodes.length,
        total: arcPlan.episodes.length,
        message: `已完成第 ${episodes.length}/${arcPlan.episodes.length} 集`,
      });
    }

    await checkpoint({
      phase: 'COMPLETE',
      current: episodes.length,
      total: episodes.length,
      message: '生成完成',
    });
    generationLog.debug('pipeline.complete', {
      runId,
      chapters: chapters.length,
      vocabulary: userVocabulary.vocabulary.length,
      episodes: episodes.length,
    });

    return {
      chapters,
      userVocabulary,
      arcPlan,
      episodes,
    };
  } catch (error) {
    const message = (error as Error)?.message || '生成失败';
    generationLog.error('pipeline.failed', {
      runId,
      message,
      phase: lastStatus.phase,
      current: lastStatus.current,
      total: lastStatus.total,
      chapters: chapters?.length ?? 0,
      vocabulary: userVocabulary?.vocabulary.length ?? 0,
      arcEpisodes: arcPlan?.episodes.length ?? 0,
      savedEpisodes: episodes.length,
    });
    if (params.workId) {
      await saveGenerationCheckpoint(params.workId, {
        ...lastStatus,
        phase: 'FAILED',
        message,
        chapters,
        userVocabulary,
        arcPlan,
        arcPlanScheduled,
        episodes,
        last_error: message,
      });
    }
    throw error;
  }
}
