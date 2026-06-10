import type { DialogueMessage, Message, NarrationMessage } from '@/src/models/episode';
import { generationLog, textStats } from './debug-log';
import { chatJson, type ChatMessage } from './model-client';
import type { EpisodeSlot, RewriteResult, TargetWord, UsedTargetWord } from './types';

const SYSTEM_PROMPT = `You are an English light-novel writer. The user will provide novel text in any language. You MUST rewrite it into natural English light-novel prose.

WRITING GUIDELINES:
1. Language - Detect the input language automatically and rewrite the content ENTIRELY in English. Translate character names, place names, organizations, skills, item names, titles, and special terms into natural English equivalents whenever possible. If the source is already English, polish it rather than copying it verbatim.
2. Narration - Use first-person narration ("I") in past tense. Describe actions, inner thoughts, and surroundings. Keep it natural and immersive.
3. Dialogue - Conversations should feel realistic. Each dialogue message must specify:
   - "side": "right" for the protagonist (main character, the "I" narrator)
   - "side": "left" for all other characters
   - "name": the speaker's name in English
4. Target words - Incorporate as many target vocabulary words as NATURALLY as possible. Never force a word. For every used target word, report its item_id and exact surface form in target_words_used.
5. Surface forms welcome - You may use natural inflected forms (e.g. "consume" -> "consumed", "run" -> "ran").
6. Style - Use accessible English suitable for young-adult/light-novel readers. Show emotions through actions, expressions, and dialogue rather than abstract exposition.
7. Message granularity - Every message must contain only 1-2 sentences. Split long narration or speech into multiple consecutive messages.
8. Batch mode - Multiple episodes may be provided in one request. Treat each episode as a separate scene and maintain continuity between consecutive episodes when appropriate.

Preserve the original plot, events, and character relationships unless adaptation is required for natural English narration.
Output ONLY valid JSON. For a single episode:
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

type BatchEpisodeResponse = {
  episode_index?: unknown;
  messages?: RewriteResponse['messages'];
  target_words_used?: RewriteResponse['target_words_used'];
};

type BatchRewriteResponse = {
  episodes?: BatchEpisodeResponse[];
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
  lines.push('The following is novel text. Rewrite it in English:');
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

function buildBatchUserPrompt(episodeSlots: EpisodeSlot[], chapterTexts: string[]): string {
  const lines: string[] = [
    'You are given multiple episodes to rewrite in a single response.',
    `There are ${episodeSlots.length} episodes below. Generate ALL of them.`,
    'Maintain story continuity across consecutive episodes.',
    '',
  ];

  for (let i = 0; i < episodeSlots.length; i++) {
    const slot = episodeSlots[i];
    const sourceText = slot.source_text || chapterTexts[i] || '';
    lines.push(`--- Episode ${i + 1} of ${episodeSlots.length} ---`);

    if (slot.episode_type === 'side') {
      lines.push('## Episode Type: Side Episode (Bonus Story)');
      lines.push('Focus on naturally integrating target words while keeping this episode readable as a standalone scene.');
      lines.push('');
    }

    if (slot.previous_context.length > 0) {
      lines.push('## Previous Episode Context');
      lines.push('Use this for continuity: characters, setting, and recent events.');
      for (let j = 0; j < slot.previous_context.length; j++) {
        const msg = slot.previous_context[j];
        let role = typeof msg.type === 'string' ? msg.type : 'unknown';
        if (typeof msg.side === 'string') {
          role += ` (${msg.side} - ${typeof msg.name === 'string' ? msg.name : '?'})`;
        }
        const text = typeof msg.text === 'string' ? msg.text : '';
        lines.push(`  [${j + 1}] [${role}] ${text.length > 200 ? `${text.slice(0, 200)}...` : text}`);
      }
      lines.push('');
    }

    lines.push('## Source Text to Rewrite');
    lines.push('The following is novel text. Rewrite it in English:');
    lines.push(sourceText);
    lines.push('');

    if (slot.target_words.length > 0) {
      lines.push('## Target Vocabulary Words');
      lines.push('Integrate as many of the following words naturally into the story. For each word you use, report its item_id and exact surface form in target_words_used.');
      for (const word of slot.target_words) {
        const label = word.is_new ? 'NEW' : 'REVIEW';
        lines.push(`  - item_id: ${word.item_id}, word: ${word.word} (${word.meaning}) [${label}]`);
      }
      lines.push('');
    }
  }

  lines.push(
    'Output a JSON object with "episodes", a list of episode objects. Each episode object must have "episode_index" as the 0-based input index, "messages", and "target_words_used". Do not include markdown.',
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

  const messages = buildMessages(episodeSlot, chapterText);
  generationLog.debug('rewrite.single.start', {
    episodeId: episodeSlot.episode_id,
    episodeType: episodeSlot.episode_type,
    sourceText: textStats(episodeSlot.source_text || chapterText),
    targetWords: episodeSlot.target_words.length,
    previousContext: episodeSlot.previous_context.length,
    promptChars: messages.reduce((sum, message) => sum + message.content.length, 0),
  });

  const response = await chatJson<RewriteResponse>(
    messages,
    { timeoutMs: 900_000, maxTokens: 100_000 },
  );

  const parsedMessages = parseMessages(response.messages);
  const targetWordsUsed = normalizeUsedWords(response.target_words_used, episodeSlot.target_words);
  generationLog.debug('rewrite.single.done', {
    episodeId: episodeSlot.episode_id,
    messages: parsedMessages.length,
    targetWordsUsed: targetWordsUsed.length,
    outputChars: parsedMessages.reduce((sum, message) => sum + message.text.length, 0),
  });

  return {
    messages: parsedMessages,
    target_words_used: targetWordsUsed,
  };
}

export async function rewriteBatch(
  episodeSlots: EpisodeSlot[],
  chapterTexts: string[],
): Promise<RewriteResult[]> {
  if (episodeSlots.length !== chapterTexts.length) {
    throw new Error(`episodeSlots (${episodeSlots.length}) and chapterTexts (${chapterTexts.length}) must have the same length`);
  }

  for (let i = 0; i < episodeSlots.length; i++) {
    const sourceText = episodeSlots[i].source_text || chapterTexts[i] || '';
    if (episodeSlots[i].episode_type !== 'side' && !sourceText.trim()) {
      throw new Error(`chapter_text must not be empty for main episode at index ${i}`);
    }
  }

  const prompt = buildBatchUserPrompt(episodeSlots, chapterTexts);
  generationLog.debug('rewrite.batch.start', {
    episodes: episodeSlots.length,
    prompt: textStats(prompt),
    slots: episodeSlots.map((slot, index) => ({
      index,
      episodeId: slot.episode_id,
      episodeType: slot.episode_type,
      sourceTextChars: (slot.source_text || chapterTexts[index] || '').length,
      targetWords: slot.target_words.length,
      previousContext: slot.previous_context.length,
    })),
  });

  const response = await chatJson<BatchRewriteResponse>(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    { timeoutMs: 900_000, maxTokens: 100_000 },
  );

  if (!Array.isArray(response.episodes)) {
    generationLog.error('rewrite.batch.invalid_response', { response });
    throw new Error('episodes must be an array');
  }

  const byIndex = new Map<number, BatchEpisodeResponse>();
  for (const episode of response.episodes) {
    if (typeof episode.episode_index === 'number') {
      byIndex.set(Math.floor(episode.episode_index), episode);
    }
  }

  const missingIndexes: number[] = [];
  const results = episodeSlots.map((slot, index) => {
    const episode = byIndex.get(index);
    if (!episode) {
      missingIndexes.push(index);
      return { messages: [], target_words_used: [] };
    }

    return {
      messages: parseMessages(episode.messages),
      target_words_used: normalizeUsedWords(episode.target_words_used, slot.target_words),
    };
  });

  if (missingIndexes.length > 0) {
    generationLog.warn('rewrite.batch.missing_episodes', {
      expected: episodeSlots.length,
      received: response.episodes.length,
      missingIndexes,
      receivedIndexes: response.episodes.map((episode) => episode.episode_index),
    });
  }

  generationLog.debug('rewrite.batch.done', {
    expected: episodeSlots.length,
    received: response.episodes.length,
    results: results.map((result, index) => ({
      index,
      messages: result.messages.length,
      targetWordsUsed: result.target_words_used.length,
      outputChars: result.messages.reduce((sum, message) => sum + message.text.length, 0),
    })),
  });

  return results;
}
