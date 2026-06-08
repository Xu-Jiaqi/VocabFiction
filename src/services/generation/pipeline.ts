import type { Episode } from '@/src/models/episode';
import { planNextArc } from './arc-planner';
import { annotateMessages } from './annotator';
import { formatEpisode } from './episode-formatter';
import { preprocessNovel } from './novel-preprocessor';
import { scheduleVocabulary } from './scheduler';
import { rewriteEpisode } from './story-rewriter';
import { preprocessVocabulary } from './vocabulary';
import type { ArcPlan, Chapter, ReadingProgressState, UserVocabulary } from './types';
import {
  saveGenerationCheckpoint,
  type LocalGenerationCheckpoint,
} from './checkpoint';

export type LocalGenerationPhase =
  | 'VOCABULARY'
  | 'CHAPTERS'
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

export async function generateEpisodesInApp(params: {
  workId?: string;
  title: string;
  novelText: string;
  wordListText: string;
  resumeFrom?: LocalGenerationCheckpoint | null;
  onStatus?: (status: LocalGenerationStatus) => void;
}): Promise<LocalGenerationResult> {
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

  const checkpoint = async (
    status: LocalGenerationStatus,
    lastError?: string,
  ) => {
    lastStatus = status;
    emit(params.onStatus, status);
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

    if (!chapters) {
      await checkpoint({
        phase: 'CHAPTERS',
        current: 0,
        total: 0,
        message: '正在切分小说章节...',
      });
      chapters = await preprocessNovel(params.title, params.novelText);
    }
    await checkpoint({
      phase: 'CHAPTERS',
      current: chapters.length,
      total: chapters.length,
      message: '章节切分完成',
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
    }
    await checkpoint({
      phase: 'SCHEDULING',
      current: arcPlan.episodes.length,
      total: arcPlan.episodes.length,
      message: '目标词调度完成',
    });

    for (let i = episodes.length; i < arcPlan.episodes.length; i++) {
      const slot = arcPlan.episodes[i];
      await checkpoint({
        phase: 'GENERATING',
        current: i + 1,
        total: arcPlan.episodes.length,
        message: `正在生成第 ${i + 1}/${arcPlan.episodes.length} 集...`,
      });

      const rewrite = await rewriteEpisode(slot, slot.source_text ?? '');
      const usedById = new Map(
        rewrite.target_words_used.map((used) => [used.item_id, used]),
      );
      const targetWordsUsed = slot.target_words
        .filter((word) => usedById.has(word.item_id))
        .map((word) => ({ ...word, ...usedById.get(word.item_id) }));

      await checkpoint({
        phase: 'ANNOTATING',
        current: i + 1,
        total: arcPlan.episodes.length,
        message: `正在标注第 ${i + 1}/${arcPlan.episodes.length} 集词汇...`,
      });
      const annotated = await annotateMessages(
        rewrite.messages,
        targetWordsUsed,
        userVocabulary,
        new Set<string>(),
      );

      await checkpoint({
        phase: 'FORMATTING',
        current: i + 1,
        total: arcPlan.episodes.length,
        message: `正在整理第 ${i + 1}/${arcPlan.episodes.length} 集...`,
      });
      episodes.push(formatEpisode({
        ep: slot.episode_id,
        title: `Episode ${slot.episode_id}`,
        kind: slot.episode_type,
        messages: annotated,
      }));
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

    return {
      chapters,
      userVocabulary,
      arcPlan,
      episodes,
    };
  } catch (error) {
    const message = (error as Error)?.message || '生成失败';
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
