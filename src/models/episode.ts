// Episode JSON format types (v3)

export interface Meta {
  ep: number;
  title: string;
  kind: 'main' | 'side';
}

export interface Mark {
  item_id?: string | null; // backend vocabulary item id for reading logs
  word: string;       // surface form as it appears in text
  index: number;      // 0-based word position (split by whitespace)
  definition: string; // Chinese definition
  is_new: boolean;    // first occurrence of this (word, definition) pair
}

export type MessageType = 'narration' | 'dialogue';

export interface NarrationMessage {
  type: 'narration';
  text: string;
  marks: Mark[];
}

export interface DialogueMessage {
  type: 'dialogue';
  side: 'left' | 'right';
  name: string;
  text: string;
  marks: Mark[];
}

export type Message = NarrationMessage | DialogueMessage;

export interface VocabItem {
  item_id?: string | null;
  word: string;
  definition: string;
  is_new: boolean;
}

export interface Episode {
  meta: Meta;
  messages: Message[];
  vocab: VocabItem[];
}
