import type { Message } from '@/src/models/episode';

export interface FsrsCardState {
  card_id: number;
  state: number;
  step?: number | null;
  stability?: number | null;
  difficulty?: number | null;
  due: string;
  last_review?: string | null;
}

export interface VocabularyItem {
  id: string;
  word: string;
  meaning: string;
  chapter_first_seen: number;
  history_window: number[];
  fsrs_card: FsrsCardState;
}

export interface UserVocabulary {
  user_id: string;
  vocabulary: VocabularyItem[];
}

export interface Chapter {
  chapter_id: number;
  title: string;
  raw_text: string;
  summary: string;
  characters: string[];
  world_setting: string;
  estimated_reading_time: number;
}

export interface ReadingProgressState {
  current_chapter: number;
  current_episode: number;
  chapter_offset: number;
  total_episodes_read: number;
}

export interface PendingWord {
  item_id: string;
  rejected_count: number;
}

export interface TargetWord {
  item_id: string;
  word: string;
  meaning: string;
  is_new: boolean;
  fsrs_card?: FsrsCardState | null;
}

export interface EpisodeSlot {
  episode_id: number;
  episode_type: 'main' | 'side';
  source_text?: string | null;
  previous_context: Array<Record<string, unknown>>;
  target_words: TargetWord[];
}

export interface ArcPlan {
  arc_id: string;
  pending_words: PendingWord[];
  episodes: EpisodeSlot[];
}

export interface UsedTargetWord {
  item_id: string;
  surface: string;
}

export interface RewriteResult {
  messages: Message[];
  target_words_used: UsedTargetWord[];
}

export interface WordLog {
  item_id: string;
  word?: string | null;
  meaning?: string | null;
  appeared: number;
  clicked: number;
}

export interface EpisodeReadingLog {
  episode_id: number;
  word_logs: WordLog[];
}
