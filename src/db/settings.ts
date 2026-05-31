import { getAppDb } from './init';
import { DEFAULT_SETTINGS } from '@/src/models/setting';

export async function getSetting(key: string): Promise<string | null> {
  const db = getAppDb();
  const row = await db.getFirstAsync<any>(
    'SELECT value FROM settings WHERE key = ?',
    [key]
  );
  return row?.value ?? DEFAULT_SETTINGS[key] ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getAppDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [key, value]
  );
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = getAppDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings'
  );
  const result: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}
