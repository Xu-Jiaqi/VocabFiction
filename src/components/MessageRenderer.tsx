import { memo } from 'react';
import { Narration } from './Narration';
import { ChatBubble } from './ChatBubble';
import type { Message } from '@/src/models/episode';

interface MessageRendererProps {
  message: Message;
  workId: string;
  fontScale: number;
  /**
   * 是否为新角色发言。Narration 忽略；ChatBubble 在切换时增加顶部间距。
   */
  isNewSpeaker?: boolean;
  onWordTap?: (word: string, definition: string) => void;
  onAvatarPress?: (characterName: string) => void;
  avatarVersion?: number;
}

function MessageRendererImpl({
  message,
  workId,
  fontScale,
  isNewSpeaker,
  onWordTap,
  onAvatarPress,
  avatarVersion,
}: MessageRendererProps) {
  if (message.type === 'narration') {
    return (
      <Narration
        text={message.text}
        marks={message.marks}
        fontScale={fontScale}
        onWordTap={onWordTap}
      />
    );
  }
  if (message.type === 'dialogue') {
    return (
      <ChatBubble
        message={message}
        workId={workId}
        fontScale={fontScale}
        isNewSpeaker={isNewSpeaker}
        onWordTap={onWordTap}
        onAvatarPress={onAvatarPress}
        avatarVersion={avatarVersion}
      />
    );
  }
  return null;
}

// React.memo: 避免父级 re-render 时重渲所有可见消息（100+ 时性能影响显著）
export const MessageRenderer = memo(MessageRendererImpl);
