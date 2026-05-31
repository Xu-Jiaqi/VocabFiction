import { Narration } from './Narration';
import { ChatBubble } from './ChatBubble';
import type { Message } from '@/src/models/episode';

interface MessageRendererProps {
  message: Message;
  workId: string;
  fontScale: number;
  onWordTap?: (word: string, definition: string) => void;
  onExpandWord?: (word: string) => void;
}

export function MessageRenderer({ message, workId, fontScale, onWordTap, onExpandWord }: MessageRendererProps) {
  if (message.type === 'narration') {
    return <Narration text={message.text} marks={message.marks} fontScale={fontScale} onWordTap={onWordTap} />;
  }
  if (message.type === 'dialogue') {
    return <ChatBubble message={message} workId={workId} fontScale={fontScale} onWordTap={onWordTap} />;
  }
  return null;
}
