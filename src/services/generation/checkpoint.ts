import {
  deleteAsync,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import type { Episode } from '@/src/models/episode';
import { getUserWorkDir } from '@/src/services/user-content';
import type { ArcPlan, Chapter, UserVocabulary } from './types';
import type { LocalGenerationPhase } from './pipeline';

const CHECKPOINT_FILE = 'generation-checkpoint.json';

export interface LocalGenerationCheckpoint {
  phase: LocalGenerationPhase | 'FAILED';
  current: number;
  total: number;
  message: string;
  updated_at: string;
  chapters?: Chapter[];
  userVocabulary?: UserVocabulary;
  arcPlan?: ArcPlan;
  arcPlanScheduled?: boolean;
  episodes?: Episode[];
  last_error?: string;
}

function checkpointUri(workId: string): string {
  return `${getUserWorkDir(workId)}/${CHECKPOINT_FILE}`;
}

export async function saveGenerationCheckpoint(
  workId: string,
  checkpoint: Omit<LocalGenerationCheckpoint, 'updated_at'>,
): Promise<void> {
  await makeDirectoryAsync(getUserWorkDir(workId), { intermediates: true });
  await writeAsStringAsync(
    checkpointUri(workId),
    JSON.stringify(
      {
        ...checkpoint,
        updated_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

export async function loadGenerationCheckpoint(
  workId: string,
): Promise<LocalGenerationCheckpoint | null> {
  const uri = checkpointUri(workId);
  const info = await getInfoAsync(uri);
  if (!info.exists) return null;
  try {
    return JSON.parse(await readAsStringAsync(uri)) as LocalGenerationCheckpoint;
  } catch (error) {
    console.warn('[GenerationCheckpoint] Read failed:', error);
    return null;
  }
}

export async function deleteGenerationCheckpoint(workId: string): Promise<void> {
  await deleteAsync(checkpointUri(workId), { idempotent: true });
}
