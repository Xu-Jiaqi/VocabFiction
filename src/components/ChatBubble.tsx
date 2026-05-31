import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/src/theme/colors';
import { ChatAvatar } from './ChatAvatar';
import { VocabText } from './VocabText';
import type { DialogueMessage } from '@/src/models/episode';

interface ChatBubbleProps {
  message: DialogueMessage;
  workId: string;
  fontScale: number;
  onWordTap?: (word: string, definition: string) => void;
}

export function ChatBubble({ message, workId, fontScale, onWordTap }: ChatBubbleProps) {
  const isLeft = message.side === 'left';

  return (
    <View style={[styles.row, isLeft ? styles.rowLeft : styles.rowRight]}>
      <View style={styles.content}>
        <View style={[styles.nameRow, isLeft ? styles.nameRowLeft : styles.nameRowRight]}>
          {isLeft && <ChatAvatar workId={workId} name={message.name} side="left" />}
          <Text style={[styles.name, { fontSize: 11 * fontScale }]}>{message.name}</Text>
          {!isLeft && <ChatAvatar workId={workId} name={message.name} side="right" />}
        </View>
        <View style={[styles.bubble, isLeft ? styles.bubbleLeft : styles.bubbleRight]}>
          <VocabText text={message.text} marks={message.marks} fontSize={15 * fontScale} onWordTap={onWordTap} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 4 },
  rowLeft: { alignItems: 'flex-start' },
  rowRight: { alignItems: 'flex-end' },
  content: { maxWidth: '80%' },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2, gap: 6 },
  nameRowLeft: { justifyContent: 'flex-start' },
  nameRowRight: { justifyContent: 'flex-end' },
  name: { lineHeight: 15, color: Colors.secondary },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  bubbleLeft: { backgroundColor: Colors.leftBubble, borderTopLeftRadius: 4 },
  bubbleRight: { backgroundColor: Colors.rightBubble, borderTopRightRadius: 4 },
});
