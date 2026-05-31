import type { Episode } from '@/src/models/episode';

const builtinEpisodes: Record<string, Record<number, () => Episode>> = {
  makeine: {
    1: () => require('@/novels/败犬女主太多了！/makeine/ep01_a_quiet_afternoon.json'),
    2: () => require('@/novels/败犬女主太多了！/makeine/ep02_the_argument.json'),
    3: () => require('@/novels/败犬女主太多了！/makeine/ep03_the_glass.json'),
  },
};

export function loadEpisode(workId: string, epNum: number): Episode | null {
  const workEps = builtinEpisodes[workId];
  if (!workEps) return null;
  const loader = workEps[epNum];
  if (!loader) return null;
  return loader() as Episode;
}

import { PARA_CH01 } from './para-ch01';

/** Load plain text chapter for traditional reading mode. */
export function loadPlainText(workId: string, _chNum = 1): string | null {
  if (workId === 'makeine') return PARA_CH01;
  return null;
}

export function hasBuiltinEpisodes(workId: string): boolean {
  return workId in builtinEpisodes;
}

export function getBuiltinEpisodeCount(workId: string): number {
  const workEps = builtinEpisodes[workId];
  return workEps ? Object.keys(workEps).length : 0;
}
