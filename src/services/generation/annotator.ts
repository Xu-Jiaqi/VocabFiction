import { getEcdictDb } from '@/src/db/init';
import { extractLemma } from '@/src/services/lemma';
import type { DialogueMessage, Mark, Message, NarrationMessage } from '@/src/models/episode';
import type { UserVocabulary } from './types';
import { getVocabIndex } from './vocabulary';

const SURFACE_PUNCTUATION = '.,!?;:"\'';

function stripSurface(raw: string): string {
  const escaped = SURFACE_PUNCTUATION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return raw.replace(new RegExp(`^[${escaped}]+|[${escaped}]+$`, 'g'), '');
}

function tokenizeSurface(text: string): Array<{ cleaned: string; index: number }> {
  return text.split(' ')
    .map((token, index) => ({ cleaned: stripSurface(token), index }))
    .filter((token) => token.cleaned.length > 0);
}

async function resolveLemma(word: string): Promise<string> {
  try {
    const db = getEcdictDb();
    const lookup = async (term: string): Promise<string | null> => {
      const row = await db.getFirstAsync<{ exchange: string | null }>(
        'SELECT exchange FROM dict WHERE word = ?',
        [term],
      );
      if (!row) return null;
      return extractLemma(row.exchange ?? '') ?? term;
    };

    const direct = await lookup(word);
    if (direct && direct !== word) return direct.toLowerCase();
    if (word !== word.toLowerCase()) {
      const lower = await lookup(word.toLowerCase());
      if (lower) return lower.toLowerCase();
    }
  } catch {
    // ECDICT is optional for surface-based matching.
  }

  return word.toLowerCase();
}

async function tokenizeAndLemmatize(text: string): Promise<Array<{
  cleaned: string;
  lemma: string;
  index: number;
}>> {
  const tokens = tokenizeSurface(text);
  const result = [];
  for (const token of tokens) {
    result.push({
      ...token,
      lemma: await resolveLemma(token.cleaned),
    });
  }
  return result;
}

function computeIsNew(
  itemId: string,
  lastReview: string | null | undefined,
  shownSet: Set<string>,
): boolean {
  if (shownSet.has(itemId)) return false;
  if (lastReview) return false;
  shownSet.add(itemId);
  return true;
}

export async function annotateMessages(
  messages: Message[],
  targetWords: Array<Record<string, unknown>>,
  userVocabulary: UserVocabulary,
  shownSet = new Set<string>(),
): Promise<Message[]> {
  const vocabIndex = getVocabIndex(userVocabulary);
  const annotated: Message[] = [];

  for (const message of messages) {
    const marks: Mark[] = [];
    const surfaceTokens = tokenizeSurface(message.text);
    let lemmaTokens: Awaited<ReturnType<typeof tokenizeAndLemmatize>> | null = null;

    for (const target of targetWords) {
      const itemId = typeof target.item_id === 'string' ? target.item_id : '';
      const item = vocabIndex[itemId];
      if (!item) continue;

      const targetSurface = typeof target.surface === 'string'
        ? stripSurface(target.surface).toLowerCase()
        : '';
      const targetLemma = typeof target.lemma === 'string'
        ? target.lemma
        : typeof target.word === 'string'
          ? target.word
          : item.word;

      const matching = targetSurface
        ? surfaceTokens
          .filter((token) => token.cleaned.toLowerCase() === targetSurface)
          .map((token) => ({ cleaned: token.cleaned, index: token.index }))
        : (lemmaTokens ??= await tokenizeAndLemmatize(message.text))
          .filter((token) => token.lemma.toLowerCase() === targetLemma.toLowerCase())
          .map((token) => ({ cleaned: token.cleaned, index: token.index }));

      let firstNew = true;
      for (const match of matching) {
        const isNew = firstNew
          ? computeIsNew(item.id, item.fsrs_card.last_review, shownSet)
          : false;
        if (isNew) firstNew = false;

        marks.push({
          item_id: item.id,
          word: match.cleaned,
          index: match.index,
          definition: item.meaning,
          is_new: isNew,
        });
      }
    }

    marks.sort((a, b) => a.index - b.index);
    if (message.type === 'narration') {
      const next: NarrationMessage = { ...message, marks };
      annotated.push(next);
    } else {
      const next: DialogueMessage = { ...message, marks };
      annotated.push(next);
    }
  }

  return annotated;
}
