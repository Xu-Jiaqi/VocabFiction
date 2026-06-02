import type { Episode } from '@/src/models/episode';
import { loadUserEpisode, loadUserPlainText } from '@/src/services/user-content';

const builtinEpisodes: Record<string, Record<number, () => Episode>> = {
  makeine: {
    1: () => require('@/novels/败犬女主太多了！/makeine/ep01_a_quiet_afternoon.json'),
    2: () => require('@/novels/败犬女主太多了！/makeine/ep02_the_argument.json'),
    3: () => require('@/novels/败犬女主太多了！/makeine/ep03_the_glass.json'),
  },
  gamers: {
    1: () => require('@/novels/GAMERS电玩咖！/gamers/ep01_an_ordinary_gamer.json'),
    2: () => require('@/novels/GAMERS电玩咖！/gamers/ep02_the_girl_at_the_game_store.json'),
    3: () => require('@/novels/GAMERS电玩咖！/gamers/ep03_tomorrow_at_the_library.json'),
    4: () => require('@/novels/GAMERS电玩咖！/gamers/ep04_the_third_member.json'),
    5: () => require('@/novels/GAMERS电玩咖！/gamers/ep05_welcome_to_the_game_club.json'),
    6: () => require('@/novels/GAMERS电玩咖！/gamers/ep06_different_games.json'),
    7: () => require('@/novels/GAMERS电玩咖！/gamers/ep07_thanks_for_always_helping.json'),
  },
};

export function loadBuiltinEpisode(workId: string, epNum: number): Episode | null {
  const workEps = builtinEpisodes[workId];
  if (!workEps) return null;
  const loader = workEps[epNum];
  if (!loader) return null;
  return loader() as Episode;
}

export async function loadEpisode(workId: string, epNum: number): Promise<Episode | null> {
  return loadBuiltinEpisode(workId, epNum) ?? await loadUserEpisode(workId, epNum);
}

import { PARA_CH01 } from './para-ch01';

/** Load plain text chapter for traditional reading mode. */
export async function loadPlainText(workId: string, _chNum = 1): Promise<string | null> {
  if (workId === 'makeine') return PARA_CH01;
  return loadUserPlainText(workId);
}

export function hasBuiltinEpisodes(workId: string): boolean {
  return workId in builtinEpisodes;
}

export function getBuiltinEpisodeCount(workId: string): number {
  const workEps = builtinEpisodes[workId];
  return workEps ? Object.keys(workEps).length : 0;
}
