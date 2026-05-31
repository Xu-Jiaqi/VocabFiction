export interface Work {
  id: string;
  title: string;
  title_en: string | null;
  author: string | null;
  total_eps: number;
  source: 'builtin' | 'user';
  created_at: string;
  updated_at: string;
}

export type WorkSource = 'builtin' | 'user';
