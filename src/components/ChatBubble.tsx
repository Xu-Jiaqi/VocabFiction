import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/src/theme/colors';
import { ChatAvatar } from './ChatAvatar';
import { VocabText } from './VocabText';
import type { DialogueMessage, Mark } from '@/src/models/episode';

interface ChatBubbleProps {
  message: DialogueMessage;
  workId: string;
  fontScale: number;
  /**
   * 是否为新角色发言。规范：消息之间 8px，角色切换时额外 8px（总 12px）。
   * 父级（reader）通过比较相邻消息的 name/side 计算后传入。
   */
  isNewSpeaker?: boolean;
  onWordTap?: (word: string, definition: string, mark?: Mark) => void;
  onAvatarPress?: (characterName: string) => void;
  avatarVersion?: number;
}

export const ChatBubble = ({
  message,
  workId,
  fontScale,
  isNewSpeaker = false,
  onWordTap,
  onAvatarPress,
  avatarVersion,
}: ChatBubbleProps) => {
  const isLeft = message.side === 'left';

  return (
    <View
      style={[
        styles.row,
        isLeft ? styles.rowLeft : styles.rowRight,
        isNewSpeaker && styles.rowNewSpeaker,
      ]}
    >
      <View style={styles.content}>
        <View
          style={[
            styles.nameRow,
            isLeft ? styles.nameRowLeft : styles.nameRowRight,
          ]}
        >
          {isLeft && (
            <ChatAvatar
              workId={workId}
              name={message.name}
              side="left"
              onPress={onAvatarPress ? () => onAvatarPress(message.name) : undefined}
              avatarVersion={avatarVersion}
            />
          )}
          <Text style={[styles.name, { fontSize: 11 * fontScale }]}>
            {message.name}
          </Text>
          {!isLeft && (
            <ChatAvatar
              workId={workId}
              name={message.name}
              side="right"
              onPress={onAvatarPress ? () => onAvatarPress(message.name) : undefined}
              avatarVersion={avatarVersion}
            />
          )}
        </View>
        <View
          style={[
            styles.bubble,
            isLeft ? styles.bubbleLeft : styles.bubbleRight,
          ]}
        >
          <VocabText
            text={message.text}
            marks={message.marks}
            fontSize={15 * fontScale}
            onWordTap={onWordTap}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 4 },
  rowLeft: { alignItems: 'flex-start' },
  rowRight: { alignItems: 'flex-end' },
  // 角色切换时在 4px 基础之上额外加 8px，使总间距 = 12px
  rowNewSpeaker: { paddingTop: 12 },
  // 规范：右气泡最大宽度 75%（之前 80%）
  content: { maxWidth: '75%' },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2, gap: 6 },
  nameRowLeft: { justifyContent: 'flex-start' },
  nameRowRight: { justifyContent: 'flex-end' },
  name: { lineHeight: 15, color: Colors.secondary },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  bubbleLeft: { backgroundColor: Colors.leftBubble, borderTopLeftRadius: 4 },
  bubbleRight: { backgroundColor: Colors.rightBubble, borderTopRightRadius: 4 },
});
