import type { DialogueMessage, Message, NarrationMessage } from '@/src/models/episode';
import { chatJson, type ChatMessage } from './model-client';
import type { EpisodeSlot, RewriteResult, TargetWord, UsedTargetWord } from './types';

const SYSTEM_PROMPT = `You are an English light-novel writer. Your task is to rewrite a story segment into a vivid, engaging English light-novel format - a mix of narration and dialogue that reads naturally, like a novel excerpt.

WRITING GUIDELINES:
1. Narration - Use first-person narration ("I") in past tense. Describe actions, inner thoughts, and surroundings. Keep it natural and flowing.
2. Dialogue - Conversations should feel real. Each dialogue message must specify:
   - "side": "right" for the protagonist (main character, the "I" narrator)
   - "side": "left" for all other characters
   - "name": the speaker's name
3. Target words - You will be given target vocabulary words (with Chinese meanings). Incorporate as many of them as NATURALLY as possible. Do NOT force them. For each word you use, report both its item_id and exact surface form in target_words_used.
4. Surface forms welcome - You may use natural inflected forms (e.g. "consuming", "went", "ran").
5. Style - Keep the English accessible, vivid, and young-adult/light-novel like.
6. Length - Produce a complete scene with multiple message exchanges. Aim for 6-12 messages.

Output ONLY valid JSON:
{"messages":[{"type":"narration","text":"..."},{"type":"dialogue","side":"left","name":"...","text":"..."}],"target_words_used":[{"item_id":"...","surface":"..."}]}`;

type RewriteResponse = {
  messages?: Array<{
    type?: unknown;
    side?: unknown;
    name?: unknown;
    text?: unknown;
  }>;
  target_words_used?: Array<{ item_id?: unknown; surface?: unknown }>;
};

function buildUserPrompt(
  sourceText: string,
  targetWords: TargetWord[],
  previousContext: Array<Record<string, unknown>>,
  episodeType: 'main' | 'side',
): string {
  const lines: string[] = [];

  if (episodeType === 'side') {
    lines.push('## Episode Type: Side Episode (Bonus Story)');
    lines.push(
      'This is a side episode - a shorter, standalone bonus story. Focus on naturally integrating the target words.\n',
    );
  }

  if (previousContext.length > 0) {
    lines.push('## Previous Episode Context');
    for (let i = 0; i < previousContext.length; i++) {
      const msg = previousContext[i];
      let role = typeof msg.type === 'string' ? msg.type : 'unknown';
      if (typeof msg.side === 'string') {
        role += ` (${msg.side} - ${typeof msg.name === 'string' ? msg.name : '?'})`;
      }
      const text = typeof msg.text === 'string' ? msg.text : '';
      lines.push(`  [${i + 1}] [${role}] ${text.length > 200 ? `${text.slice(0, 200)}...` : text}`);
    }
    lines.push('');
  }

  lines.push('## Source Text to Rewrite');
  lines.push(sourceText);
  lines.push('');

  if (targetWords.length > 0) {
    lines.push('## Target Vocabulary Words');
    lines.push(
      'Integrate as many of the following words naturally into the story. For each word you use, report its item_id and exact surface form in target_words_used.',
    );
    for (const word of targetWords) {
      const label = word.is_new ? 'NEW' : 'REVIEW';
      lines.push(`  - item_id: ${word.item_id}, word: ${word.word} (${word.meaning}) [${label}]`);
    }
    lines.push('');
  }

  lines.push(
    'Output a JSON object with "messages" and "target_words_used". Do not include markdown.',
  );
  return lines.join('\n');
}

function buildMessages(episodeSlot: EpisodeSlot, chapterText: string): ChatMessage[] {
  const sourceText = episodeSlot.source_text || chapterText;
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: buildUserPrompt(
        sourceText,
        episodeSlot.target_words,
        episodeSlot.previous_context,
        episodeSlot.episode_type,
      ),
    },
  ];
}

function parseMessages(raw: RewriteResponse['messages']): Message[] {
  if (!Array.isArray(raw)) return [];

  const messages: Message[] = [];
  for (const [index, item] of raw.entries()) {
    if (item.type === 'narration' && typeof item.text === 'string') {
      const message: NarrationMessage = {
        type: 'narration',
        text: item.text,
        marks: [],
      };
      messages.push(message);
    } else if (
      item.type === 'dialogue'
      && (item.side === 'left' || item.side === 'right')
      && typeof item.name === 'string'
      && typeof item.text === 'string'
    ) {
      const message: DialogueMessage = {
        type: 'dialogue',
        side: item.side,
        name: item.name,
        text: item.text,
        marks: [],
      };
      messages.push(message);
    } else {
      throw new Error(`Invalid rewrite message at index ${index}`);
    }
  }
  return messages;
}

function normalizeUsedWords(
  raw: RewriteResponse['target_words_used'],
  targetWords: TargetWord[],
): UsedTargetWord[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error('target_words_used must be an array');

  const validIds = new Set(targetWords.map((word) => word.item_id));
  return raw
    .map((item, index): UsedTargetWord | null => {
      if (
        typeof item.item_id !== 'string'
        || typeof item.surface !== 'string'
        || !item.surface.trim()
      ) {
        throw new Error(`Invalid target_words_used entry at index ${index}`);
      }
      if (!validIds.has(item.item_id)) return null;
      return { item_id: item.item_id, surface: item.surface };
    })
    .filter((item): item is UsedTargetWord => Boolean(item));
}

export async function rewriteEpisode(
  episodeSlot: EpisodeSlot,
  chapterText: string,
): Promise<RewriteResult> {
  if (episodeSlot.episode_type !== 'side' && !chapterText.trim()) {
    throw new Error('chapter_text must not be empty for main episodes');
  }

  const response = await chatJson<RewriteResponse>(
    buildMessages(episodeSlot, chapterText),
    { maxTokens: 4096, timeoutMs: 180_000 },
  );

  const messages = parseMessages(response.messages);

  return {
    messages,
    target_words_used: normalizeUsedWords(response.target_words_used, episodeSlot.target_words),
  };
}
