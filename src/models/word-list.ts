export const BUILTIN_WORD_LIST_ID = 'builtin-nju-ab';

export interface WordList {
  id: string;
  name: string;
  text: string;
  source: 'builtin' | 'user';
  created_at: string;
  updated_at: string;
}

export type WordListSource = 'builtin' | 'user';
