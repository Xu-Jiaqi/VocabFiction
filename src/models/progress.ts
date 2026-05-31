export interface ReadingProgress {
  work_id: string;
  current_ep: number;
  current_msg: number;   // 0-based, 0 = haven't tapped first message yet
  total_read_eps: number;
  status: 'reading' | 'finished';
  started_at: string | null;
  last_read_at: string | null;
}

export type ReadingStatus = 'reading' | 'finished';
