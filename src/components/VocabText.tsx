import { Text, StyleSheet } from 'react-native';
import { Colors } from '@/src/theme/colors';
import type { Mark } from '@/src/models/episode';

interface VocabTextProps {
  text: string;
  marks: Mark[];
  fontSize?: number;
  onWordTap?: (word: string, definition: string) => void;
}

export function VocabText({ text, marks, fontSize = 15, onWordTap }: VocabTextProps) {
  const markMap = new Map<number, Mark>();
  for (const mark of marks) {
    markMap.set(mark.index, mark);
  }

  const segments = text.split(/(\s+)/);
  let wordIdx = 0;

  return (
    <Text style={[styles.container, { fontSize, lineHeight: fontSize * 1.8 }]}>
      {segments.map((segment, i) => {
        if (segment === '') return null;
        if (/^\s+$/.test(segment)) {
          return <Text key={i}>{segment}</Text>;
        }

        const idx = wordIdx;
        wordIdx++;
        const mark = markMap.get(idx);

        if (!mark) {
          return <Text key={i}>{segment}</Text>;
        }

        return (
          <Text key={i} onPress={() => onWordTap?.(segment, mark.definition)}>
            <Text style={mark.is_new ? styles.newWord : styles.reviewWord}>
              {segment}
            </Text>
            {mark.is_new && (
              <Text style={styles.def}>（{mark.definition}）</Text>
            )}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { lineHeight: 27 },
  newWord: { fontWeight: '700', color: Colors.bodyText },
  reviewWord: { fontWeight: '600', color: Colors.bodyText },
  def: { fontWeight: '400', color: Colors.definition },
});
