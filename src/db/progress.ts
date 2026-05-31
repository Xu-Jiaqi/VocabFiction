import { getAppDb } from './init';
import type { ReadingProgress } from '@/src/models/progress';

export async function getProgress(workId: string): Promise<ReadingProgress | null> {
  const db = getAppDb();
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM reading_progress WHERE work_id = ?',
    [workId]
  );
  return row ? mapRow(row) : null;
}

export async function updateProgress(
  workId: string,
  updates: Partial<Pick<ReadingProgress, 'current_ep' | 'current_msg' | 'total_read_eps' | 'status'>>
): Promise<void> {
  const db = getAppDb();
  const existing = await getProgress(workId);

  const current: ReadingProgress = existing ?? {
    work_id: workId,
    current_ep: 1,
    current_msg: 0,
    total_read_eps: 0,
    status: 'reading',
    started_at: null,
    last_read_at: null,
  };

  const merged = { ...current, ...updates };

  if (existing) {
    await db.runAsync(
      `UPDATE reading_progress
       SET current_ep = ?, current_msg = ?, total_read_eps = ?, status = ?,
           last_read_at = datetime('now')
       WHERE work_id = ?`,
      [merged.current_ep, merged.current_msg, merged.total_read_eps, merged.status, workId]
    );
  } else {
    await db.runAsync(
      `INSERT INTO reading_progress (work_id, current_ep, current_msg, total_read_eps, status, started_at, last_read_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [workId, merged.current_ep, merged.current_msg, merged.total_read_eps, merged.status]
    );
  }
}

export async function markEpisodeComplete(workId: string, nextEp: number): Promise<void> {
  const existing = await getProgress(workId);
  const totalReadEps = (existing?.total_read_eps ?? 0) + 1;

  await updateProgress(workId, {
    current_ep: nextEp,
    current_msg: 0,
    total_read_eps: totalReadEps,
  });
}

export async function deleteProgress(workId: string): Promise<void> {
  const db = getAppDb();
  await db.runAsync('DELETE FROM reading_progress WHERE work_id = ?', [workId]);
}

function mapRow(row: any): ReadingProgress {
  return {
    work_id: row.work_id,
    current_ep: row.current_ep,
    current_msg: row.current_msg,
    total_read_eps: row.total_read_eps,
    status: row.status as ReadingProgress['status'],
    started_at: row.started_at ?? null,
    last_read_at: row.last_read_at ?? null,
  };
}
