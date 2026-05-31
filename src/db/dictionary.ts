import { getEcdictDb } from './init';
import { extractLemma } from '@/src/services/lemma';

export interface DictionaryEntry {
  word: string;
  phonetic: string | null;
  translation: string | null;
  exchange: string | null;
}

/**
 * Generate possible base-form candidates by stripping common English suffixes.
 * Order: try most specific patterns first, validated against ECDICT later.
 */
function stemCandidates(word: string): string[] {
  const result: string[] = [];

  // -ies → -y (ladies → lady, carries → carry)
  if (word.endsWith('ies') && word.length > 4) {
    result.push(word.slice(0, -3) + 'y');
  }
  // -ies → -ie (dies → die)
  if (word.endsWith('ies') && word.length > 4) {
    result.push(word.slice(0, -1)); // just drop the s
  }

  // -es (watches → watch, passes → pass, goes → go)
  if (word.endsWith('es') && word.length > 4) {
    result.push(word.slice(0, -2));  // watches → watch
    result.push(word.slice(0, -1));  // watches → watche (less likely but cheap)
  }

  // -s (banks → bank, matters → matter)
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) {
    result.push(word.slice(0, -1));
  }

  // -ing → -e (making → make, writing → write)
  if (word.endsWith('ing') && word.length > 5) {
    result.push(word.slice(0, -3) + 'e');
    // -ing → `` (walking → walk)
    result.push(word.slice(0, -3));
    // Double consonant: running → run, sitting → sit
    if (word.length > 6) {
      const stem = word.slice(0, -4);
      const last = stem[stem.length - 1];
      if (last === stem[stem.length - 2]) {
        result.push(stem.slice(0, -1));
      }
    }
  }

  // -ed → `` (walked → walk, mattered → matter)
  if (word.endsWith('ed') && word.length > 4) {
    result.push(word.slice(0, -2));
    result.push(word.slice(0, -1));  // walked → walke (unlikely)
  }
  // -ed → just drop d (loved → love)
  if (word.endsWith('ed') && word.length > 4) {
    result.push(word.slice(0, -2) + 'e');
  }

  // Double consonant + ed: stopped → stop, dropped → drop
  if (word.endsWith('ed') && word.length > 5) {
    const stem = word.slice(0, -3);
    const last = stem[stem.length - 1];
    if (last === stem[stem.length - 2]) {
      result.push(stem.slice(0, -1));
    }
  }

  // -er → `` (bigger → big, smaller → small)
  if (word.endsWith('er') && word.length > 4) {
    const stem = word.slice(0, -2);
    result.push(stem);
    if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
      result.push(stem.slice(0, -1)); // bigger → big
    }
  }

  // -est → `` (biggest → big, smallest → small)
  if (word.endsWith('est') && word.length > 5) {
    const stem = word.slice(0, -3);
    result.push(stem);
    if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
      result.push(stem.slice(0, -1));
    }
  }

  return result;
}

export async function lookupWord(word: string): Promise<DictionaryEntry | null> {
  let db;
  try {
    db = getEcdictDb();
  } catch {
    console.warn('[Dict] ECDICT not available');
    return null;
  }

  // Normalize: lowercase, strip leading/trailing punctuation
  let normalized = word.toLowerCase().trim();
  normalized = normalized.replace(/^[“‘"(\[{\s]+|[”’”’)\]}\s,.!?:;]+$/g, '');

  // Possessive "'s"
  if (normalized.endsWith("'s") && normalized.length > 3) {
    normalized = normalized.slice(0, -2);
  }

  const tryLookup = async (term: string): Promise<DictionaryEntry | null> => {
    const row = await db.getFirstAsync<{
      word: string; phonetic: string | null;
      translation: string | null; exchange: string | null;
    }>('SELECT word, phonetic, translation, exchange FROM dict WHERE word = ?', [term]);

    if (!row) return null;

    const exchange = row.exchange ?? '';
    const lemma = extractLemma(exchange);

    // If inflected form, resolve to lemma for full entry
    if (lemma && lemma !== term) {
      const lemmaRow = await db.getFirstAsync<{
        word: string; phonetic: string | null;
        translation: string | null; exchange: string | null;
      }>('SELECT word, phonetic, translation, exchange FROM dict WHERE word = ?', [lemma]);

      if (lemmaRow) {
        console.log('[Dict]', normalized, '→ lemma:', lemma);
        return {
          word: lemma,
          phonetic: lemmaRow.phonetic ?? null,
          translation: lemmaRow.translation ?? null,
          exchange: lemmaRow.exchange ?? null,
        };
      }
      // Lemma not found — fall through to use current row
    }

    console.log('[Dict]', normalized, '→ found:', term);
    return {
      word: term,
      phonetic: row.phonetic ?? null,
      translation: row.translation ?? null,
      exchange: exchange || null,
    };
  };

  try {
    // 1. Direct lookup
    const direct = await tryLookup(normalized);
    if (direct) return direct;

    // 2. Stem candidates (suffix stripping)
    const stems = stemCandidates(normalized);
    for (const stem of stems) {
      const entry = await tryLookup(stem);
      if (entry) {
        // Return with the stem as word, but note the original
        return { ...entry, word: stem };
      }
    }

    console.log('[Dict] Not found:', normalized);
    return null;
  } catch (e) {
    console.error('[Dict] Query error:', e);
    return null;
  }
}

export async function getQuickDefinition(word: string): Promise<string | null> {
  const entry = await lookupWord(word);
  if (!entry?.translation) return null;
  const firstLine = entry.translation.split('\n')[0];
  return firstLine.replace(/^[a-z]+\.\s*/i, '').trim();
}

export function parseWordForms(exchange: string): {
  past: string | null;
  pastParticiple: string | null;
  presentParticiple: string | null;
  plural: string | null;
  thirdPerson: string | null;
} {
  const forms = {
    past: null as string | null,
    pastParticiple: null as string | null,
    presentParticiple: null as string | null,
    plural: null as string | null,
    thirdPerson: null as string | null,
  };
  if (!exchange) return forms;

  const parts = exchange.split('/');
  for (const part of parts) {
    const [type, ...formParts] = part.split(':');
    const form = formParts.join(':').replace(/^'+/, '').toLowerCase();
    switch (type) {
      case 'p': forms.past = form; break;
      case 'd': forms.pastParticiple = form; break;
      case 'i': forms.presentParticiple = form; break;
      case 's': forms.plural = form; break;
      case '3': forms.thirdPerson = form; break;
    }
  }
  return forms;
}
