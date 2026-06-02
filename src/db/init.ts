import { File, Paths } from 'expo-file-system';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const ECDICT_DB = 'ecdict_mobile.db';
const APP_DB = 'vocabfiction.db';

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

export async function initDatabase(): Promise<{
  ecdict: SQLiteDatabase | null;
  app: SQLiteDatabase;
}> {
  const ready = await ensureEcdict();

  if (ready) {
    try {
      ecdictDb = await openDatabaseAsync(ECDICT_DB, undefined, Paths.document.uri);
      const tables = await ecdictDb.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table'"
      );
      console.log('[DB] Tables:', tables.map(t => t.name).join(', '));

      const test = await ecdictDb.getFirstAsync<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM dict'
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

  await appDb.execAsync(`
    CREATE TABLE IF NOT EXISTS works (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, title_en TEXT, author TEXT,
      total_eps INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'builtin',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reading_progress (
      work_id TEXT PRIMARY KEY, current_ep INTEGER NOT NULL DEFAULT 1,
      current_msg INTEGER NOT NULL DEFAULT 0, total_read_eps INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'reading', started_at TEXT, last_read_at TEXT,
      FOREIGN KEY (work_id) REFERENCES works(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  await appDb.execAsync(`
    INSERT OR IGNORE INTO settings (key, value) VALUES ('font_size', 'medium');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('reading_mode', 'chat');
    INSERT OR IGNORE INTO works (id, title, title_en, total_eps, source)
    VALUES ('makeine', '败犬女主太多了！', 'Too Many Losing Heroines!', 3, 'builtin');
    INSERT OR IGNORE INTO works (id, title, title_en, total_eps, source)
    VALUES ('gamers', 'GAMERS电玩咖！', 'Gamers!', 7, 'builtin');
    UPDATE works SET total_eps = 7 WHERE id = 'gamers';
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
