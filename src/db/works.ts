import { getAppDb } from './init';
import type { Work } from '@/src/models/work';

export async function getAllWorks(): Promise<Work[]> {
  const db = getAppDb();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM works ORDER BY updated_at DESC',
  );
  return rows.map(mapRow);
}

export async function getWork(id: string): Promise<Work | null> {
  const db = getAppDb();
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM works WHERE id = ?',
    [id],
  );
  return row ? mapRow(row) : null;
}

export async function insertWork(work: Omit<Work, 'created_at' | 'updated_at'>): Promise<void> {
  const db = getAppDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO works (id, title, title_en, author, total_eps, source, word_list_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      work.id,
      work.title,
      work.title_en,
      work.author,
      work.total_eps,
      work.source,
      work.word_list_id,
    ],
  );
}

export async function deleteWork(id: string): Promise<void> {
  const db = getAppDb();
  await db.runAsync('DELETE FROM reading_progress WHERE work_id = ?', [id]);
  await db.runAsync('DELETE FROM works WHERE id = ?', [id]);
}

export async function updateWorkUpdatedAt(id: string): Promise<void> {
  const db = getAppDb();
  await db.runAsync(
    "UPDATE works SET updated_at = datetime('now') WHERE id = ?",
    [id],
  );
}

export async function updateWorkWordList(
  id: string,
  wordListId: string | null,
): Promise<void> {
  const db = getAppDb();
  await db.runAsync(
    "UPDATE works SET word_list_id = ?, updated_at = datetime('now') WHERE id = ?",
    [wordListId, id],
  );
}

export async function updateWorkTitle(id: string, title: string): Promise<void> {
  const db = getAppDb();
  await db.runAsync(
    "UPDATE works SET title = ?, updated_at = datetime('now') WHERE id = ?",
    [title, id],
  );
}

function mapRow(row: any): Work {
  return {
    id: row.id,
    title: row.title,
    title_en: row.title_en ?? null,
    author: row.author ?? null,
    total_eps: row.total_eps,
    source: row.source as Work['source'],
    word_list_id: row.word_list_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
