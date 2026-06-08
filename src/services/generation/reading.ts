import { loadWorkVocabulary, saveWorkVocabulary } from '@/src/services/user-content';
import { evaluateMastery } from './mastery';
import type { EpisodeReadingLog } from './types';

export async function completeLocalEpisode(
  workId: string,
  log: EpisodeReadingLog,
): Promise<{ updatedCount: number }> {
  const vocabulary = await loadWorkVocabulary(workId);
  if (!vocabulary) return { updatedCount: 0 };

  const result = evaluateMastery(log, vocabulary);
  await saveWorkVocabulary(workId, result.userVocabulary);
  return { updatedCount: result.updatedCount };
}
