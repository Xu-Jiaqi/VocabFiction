import { getProgress, updateProgress } from '@/src/db/progress';

export async function saveMessageProgress(
  workId: string,
  currentEp: number,
  currentMsg: number,
): Promise<void> {
  await updateProgress(workId, { current_ep: currentEp, current_msg: currentMsg });
}

export async function markEpisodeRead(
  workId: string,
  currentEp: number,
  currentMsg: number,
  totalEps: number,
): Promise<void> {
  const existing = await getProgress(workId);
  const totalReadEps = Math.max(existing?.total_read_eps ?? 0, currentEp);
  const status = currentEp >= totalEps ? 'finished' : 'reading';

  await updateProgress(workId, {
    current_ep: currentEp,
    current_msg: currentMsg,
    total_read_eps: totalReadEps,
    status,
  });
}

export async function moveToEpisode(
  workId: string,
  nextEp: number,
  totalEps: number,
): Promise<void> {
  const existing = await getProgress(workId);
  const status = nextEp >= totalEps && existing?.status === 'finished'
    ? 'finished'
    : 'reading';

  await updateProgress(workId, {
    current_ep: nextEp,
    current_msg: 0,
    total_read_eps: existing?.total_read_eps ?? 0,
    status,
  });
}
