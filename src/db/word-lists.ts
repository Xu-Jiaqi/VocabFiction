import { getAppDb } from './init';
import type { WordList } from '@/src/models/word-list';

export async function getAllWordLists(): Promise<WordList[]> {
  const db = getAppDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM word_lists
     ORDER BY CASE source WHEN 'builtin' THEN 0 ELSE 1 END, updated_at DESC`,
  );
  return rows.map(mapRow);
}

export async function getWordList(id: string): Promise<WordList | null> {
  const db = getAppDb();
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM word_lists WHERE id = ?',
    [id],
  );
  return row ? mapRow(row) : null;
}

export async function insertWordList(
  wordList: Omit<WordList, 'created_at' | 'updated_at'>,
): Promise<void> {
  const db = getAppDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO word_lists (id, name, text, source)
     VALUES (?, ?, ?, ?)`,
    [wordList.id, wordList.name, wordList.text, wordList.source],
  );
}

export async function updateWordListName(
  id: string,
  name: string,
): Promise<void> {
  const db = getAppDb();
  await db.runAsync(
    `UPDATE word_lists SET name = ?, updated_at = datetime('now') WHERE id = ?`,
    [name, id],
  );
}

export async function deleteWordList(id: string): Promise<void> {
  const db = getAppDb();
  await db.runAsync('DELETE FROM word_lists WHERE id = ?', [id]);
}

function mapRow(row: any): WordList {
  return {
    id: row.id,
    name: row.name,
    text: row.text ?? '',
    source: row.source as WordList['source'],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
