import {
  createEmptyCard,
  fsrs,
  Rating,
  type Card,
  type Grade,
} from 'ts-fsrs';
import type {
  EpisodeReadingLog,
  FsrsCardState,
  UserVocabulary,
  VocabularyItem,
  WordLog,
} from './types';

const HISTORY_WEIGHTS = [0.1, 0.1, 0.2, 0.2, 0.4];

function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toFsrsCard(card: FsrsCardState, now: Date): Card {
  if (card.stability == null || card.difficulty == null) {
    return createEmptyCard(now);
  }

  return {
    due: parseDate(card.due) ?? now,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: card.last_review ? 1 : 0,
    lapses: 0,
    learning_steps: card.step ?? 0,
    state: card.state as Card['state'],
    last_review: parseDate(card.last_review),
  };
}

function fromFsrsCard(card: Card, cardId: number): FsrsCardState {
  return {
    card_id: cardId,
    state: card.state,
    step: card.learning_steps,
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due.toISOString(),
    last_review: card.last_review?.toISOString() ?? null,
  };
}

function ratingFromHistory(historyWindow: number[]): Grade {
  const weighted = historyWindow.reduce(
    (sum, value, index) => sum + value * HISTORY_WEIGHTS[index],
    0,
  );
  const score = weighted / HISTORY_WEIGHTS.reduce((sum, value) => sum + value, 0);

  if (score >= 0.8) return Rating.Good as Grade;
  if (score >= 0.5) return Rating.Hard as Grade;
  return Rating.Again as Grade;
}

function forceNextDayIfNeeded(card: Card, now: Date): Card {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 0);
  if (card.due > endOfToday) return card;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return { ...card, due: tomorrow };
}

function processOne(
  wordLog: WordLog,
  item: VocabularyItem,
  now: Date,
): VocabularyItem {
  const newValue = wordLog.appeared > 0 && wordLog.clicked === 0 ? 1 : 0;
  const history = item.history_window.length >= 5
    ? item.history_window.slice(-4)
    : item.history_window;
  const nextHistory = [...history, newValue].slice(-5);
  while (nextHistory.length < 5) nextHistory.unshift(0);

  const scheduler = fsrs({ enable_fuzz: false });
  const card = toFsrsCard(item.fsrs_card, now);
  const rating = ratingFromHistory(nextHistory);
  const reviewed = scheduler.next(card, now, rating).card;
  const forced = forceNextDayIfNeeded(reviewed, now);

  return {
    ...item,
    history_window: nextHistory,
    fsrs_card: fromFsrsCard(forced, item.fsrs_card.card_id),
  };
}

export function evaluateMastery(
  episodeLog: EpisodeReadingLog,
  userVocabulary: UserVocabulary,
  now = new Date(),
): { userVocabulary: UserVocabulary; updatedCount: number } {
  const logByItemId = new Map(episodeLog.word_logs.map((log) => [log.item_id, log]));
  let updatedCount = 0;

  const vocabulary = userVocabulary.vocabulary.map((item) => {
    const log = logByItemId.get(item.id);
    if (!log) return item;
    updatedCount += 1;
    return processOne(log, item, now);
  });

  return {
    userVocabulary: {
      user_id: userVocabulary.user_id,
      vocabulary,
    },
    updatedCount,
  };
}
