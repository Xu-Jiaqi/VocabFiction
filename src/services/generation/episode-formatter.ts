import type {
  DialogueMessage,
  Episode,
  Mark,
  Message,
  NarrationMessage,
  VocabItem,
} from '@/src/models/episode';

function deriveVocab(messages: Message[]): VocabItem[] {
  const seen = new Map<string, VocabItem>();

  for (const message of messages) {
    for (const mark of message.marks) {
      const key = mark.item_id
        ? `item_id:${mark.item_id}`
        : `surface:${mark.word.toLowerCase()}::${mark.definition}`;
      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, {
          item_id: mark.item_id,
          word: mark.word,
          definition: mark.definition,
          is_new: mark.is_new,
        });
      } else if (mark.is_new && !existing.is_new) {
        seen.set(key, { ...existing, is_new: true });
      }
    }
  }

  return Array.from(seen.values());
}

function normalizeMarks(marks: Mark[] | undefined): Mark[] {
  return (marks ?? [])
    .filter((mark) => Number.isInteger(mark.index) && mark.index >= 0)
    .map((mark) => ({
      item_id: mark.item_id ?? null,
      word: mark.word,
      index: mark.index,
      definition: mark.definition,
      is_new: Boolean(mark.is_new),
    }))
    .sort((a, b) => a.index - b.index);
}

function validateMessages(messages: Message[]): Message[] {
  return messages.map((message) => {
    if (message.type === 'narration') {
      const next: NarrationMessage = {
        type: 'narration',
        text: message.text,
        marks: normalizeMarks(message.marks),
      };
      return next;
    }

    const next: DialogueMessage = {
      type: 'dialogue',
      side: message.side,
      name: message.name,
      text: message.text,
      marks: normalizeMarks(message.marks),
    };
    return next;
  });
}

export function formatEpisode(params: {
  ep: number;
  title: string;
  kind: 'main' | 'side';
  messages: Message[];
  vocab?: VocabItem[];
}): Episode {
  const messages = validateMessages(params.messages);
  return {
    meta: {
      ep: params.ep,
      title: params.title,
      kind: params.kind,
    },
    messages,
    vocab: params.vocab ?? deriveVocab(messages),
  };
}
