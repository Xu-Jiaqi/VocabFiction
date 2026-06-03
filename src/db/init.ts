import { File, Paths } from 'expo-file-system';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { BUILTIN_WORD_LIST_ID } from '@/src/models/word-list';

const ECDICT_DB = 'ecdict_mobile.db';
const APP_DB = 'vocabfiction.db';
const BUILTIN_WORD_LIST_NAME = 'NJU词汇表AB类汇总';

let ecdictDb: SQLiteDatabase | null = null;
let appDb: SQLiteDatabase | null = null;

async function ensureEcdict(): Promise<boolean> {
  const destFile = new File(Paths.document, ECDICT_DB);

  if (destFile.exists && destFile.size && destFile.size > 30_000_000) {
    console.log('[DB] Already exists:', destFile.size);
    return true;
  }

  if (destFile.exists) {
    console.log('[DB] Removing stale:', destFile.size);
    destFile.delete();
  }

  try {
    // Use Asset.fromModule — the official Expo way to load bundled assets
    const { Asset } = require('expo-asset');
    const mod = require('../../assets/ecdict_mobile.db');
    console.log('[DB] Module type:', typeof mod, 'keys:', Object.keys(mod || {}));

    const asset = Asset.fromModule(mod);
    console.log('[DB] Asset name:', asset.name, 'type:', asset.type, 'hash:', asset.hash);

    await asset.downloadAsync();
    console.log('[DB] localUri after download:', asset.localUri);

    if (!asset.localUri) {
      console.error('[DB] No localUri');
      return false;
    }

    // Read bytes from downloaded asset
    const src = new File(asset.localUri);
    console.log('[DB] Src exists:', src.exists, 'size:', src.size);

    if (!src.exists || src.size === 0) {
      console.error('[DB] Source empty or missing');
      return false;
    }

    // Read full bytes and verify SQLite header
    const data = src.bytesSync();
    const header = String.fromCharCode(...Array.from(data.slice(0, 16)));
    console.log('[DB] Header:', header.trim());

    if (!header.startsWith('SQLite format 3')) {
      console.error('[DB] Not a valid SQLite file! Header:', header);
      return false;
    }

    // Write to destination
    destFile.create();
    destFile.write(data);
    console.log('[DB] Written, dest size:', destFile.size);

    return destFile.exists && destFile.size > 30_000_000;
  } catch (e) {
    console.error('[DB] ensureEcdict error:', (e as Error)?.message ?? String(e));
    return false;
  }
}

async function ensureColumn(
  db: SQLiteDatabase,
  table: string,
  column: string,
  columnSql: string,
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${columnSql};`);
  }
}

export async function initDatabase(): Promise<{
  ecdict: SQLiteDatabase | null;
  app: SQLiteDatabase;
}> {
  const ready = await ensureEcdict();

  if (ready) {
    try {
      ecdictDb = await openDatabaseAsync(ECDICT_DB, undefined, Paths.document.uri);
      const tables = await ecdictDb.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table'",
      );
      console.log('[DB] Tables:', tables.map(t => t.name).join(', '));

      const test = await ecdictDb.getFirstAsync<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM dict',
      );
      console.log(`[DB] Entries: ${test?.cnt ?? 0}`);
    } catch (e) {
      console.error('[DB] Open/query:', (e as Error)?.message ?? String(e));
      ecdictDb = null;
    }
  }

  // App DB
  appDb = await openDatabaseAsync(APP_DB, undefined, Paths.document.uri);
  await appDb.execAsync('PRAGMA journal_mode = WAL;');
  await appDb.execAsync('PRAGMA foreign_keys = ON;');

  await appDb.execAsync(`
    CREATE TABLE IF NOT EXISTS word_lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS works (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, title_en TEXT, author TEXT,
      total_eps INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'builtin',
      word_list_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (word_list_id) REFERENCES word_lists(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS reading_progress (
      work_id TEXT PRIMARY KEY, current_ep INTEGER NOT NULL DEFAULT 1,
      current_msg INTEGER NOT NULL DEFAULT 0, total_read_eps INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'reading', started_at TEXT, last_read_at TEXT,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  await ensureColumn(appDb, 'works', 'word_list_id', 'word_list_id TEXT');

  await appDb.runAsync(
    `INSERT OR IGNORE INTO word_lists (id, name, text, source)
     VALUES (?, ?, '', 'builtin')`,
    [BUILTIN_WORD_LIST_ID, BUILTIN_WORD_LIST_NAME],
  );

  // Load built-in word list text from bundled asset (16 KB text file).
  try {
    const { Asset } = require('expo-asset');
    const mod = require('../../assets/NJU词汇表AB类汇总.txt');
    const asset = Asset.fromModule(mod);
    await asset.downloadAsync();
    if (asset.localUri) {
      const text = await new File(asset.localUri).text();
      await appDb.runAsync(
        'UPDATE word_lists SET text = ? WHERE id = ?',
        [text, BUILTIN_WORD_LIST_ID],
      );
    }
  } catch (e) {
    console.warn('[DB] Failed to load built-in word list text:', e);
  }

  await appDb.execAsync(`
    INSERT OR IGNORE INTO settings (key, value) VALUES ('font_size', 'medium');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('reading_mode', 'chat');
    INSERT OR IGNORE INTO works (id, title, title_en, total_eps, source, word_list_id)
    VALUES ('makeine', '败犬女主太多了！', 'Too Many Losing Heroines!', 3, 'builtin', '${BUILTIN_WORD_LIST_ID}');
    INSERT OR IGNORE INTO works (id, title, title_en, total_eps, source, word_list_id)
    VALUES ('gamers', 'GAMERS电玩咖！', 'Gamers!', 7, 'builtin', '${BUILTIN_WORD_LIST_ID}');
    UPDATE works SET total_eps = 7 WHERE id = 'gamers';
    UPDATE works SET word_list_id = '${BUILTIN_WORD_LIST_ID}'
    WHERE source = 'builtin' AND (word_list_id IS NULL OR word_list_id = '');
  `);

  console.log('[DB] App ready');
  return { ecdict: ecdictDb, app: appDb! };
}

export function getEcdictDb(): SQLiteDatabase {
  if (!ecdictDb) throw new Error('ECDICT not available');
  return ecdictDb;
}

export function getAppDb(): SQLiteDatabase {
  if (!appDb) throw new Error('App DB not initialized');
  return appDb;
}
