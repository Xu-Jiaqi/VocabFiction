import { View, StyleSheet } from 'react-native';
import { Colors } from '@/src/theme/colors';
import { VocabText } from './VocabText';
import type { Mark } from '@/src/models/episode';

interface NarrationProps {
  text: string;
  marks: Mark[];
  fontScale: number;
  onWordTap?: (word: string, definition: string) => void;
}

export function Narration({ text, marks, fontScale, onWordTap }: NarrationProps) {
  return (
    <View style={styles.container}>
      <View style={styles.bubble}>
        <VocabText
          text={text}
          marks={marks}
          fontSize={13 * fontScale}
          textColor={Colors.narration}
          onWordTap={onWordTap}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 24,
    maxWidth: '85%',
    alignSelf: 'center',
  },
  bubble: {
    backgroundColor: Colors.narrationBubble,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
  },
});
