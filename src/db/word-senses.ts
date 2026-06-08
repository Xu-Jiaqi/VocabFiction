import { getWordSenseDb } from './init';

export interface WordSenseEntry {
  id: string;
  meaning: string;
}

export async function getWordSenses(word: string): Promise<WordSenseEntry[]> {
  const normalized = word.trim().toLowerCase();
  if (!normalized) return [];

  const db = getWordSenseDb();
  const rows = await db.getAllAsync<{
    sense_id: string;
    meaning: string;
  }>(
    `SELECT sense_id, meaning
     FROM word_senses
     WHERE word = ?
     ORDER BY sense_order ASC`,
    [normalized],
  );

  return rows.map((row) => ({
    id: row.sense_id,
    meaning: row.meaning,
  }));
}

export async function findMatchingWordSense(
  word: string,
  userMeaning: string,
): Promise<WordSenseEntry | null> {
  const meaning = userMeaning.trim();
  if (!meaning) return null;

  for (const sense of await getWordSenses(word)) {
    if (meaning.includes(sense.meaning) || sense.meaning.includes(meaning)) {
      return sense;
    }
  }
  return null;
}
