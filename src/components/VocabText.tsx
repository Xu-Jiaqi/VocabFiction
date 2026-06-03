import { Text, StyleSheet, type TextStyle } from 'react-native';
import { Colors } from '@/src/theme/colors';
import type { Mark } from '@/src/models/episode';

interface VocabTextProps {
  text: string;
  marks: Mark[];
  fontSize?: number;
  textColor?: string;
  onWordTap?: (word: string, definition: string) => void;
}

/**
 * 将纯文本按词拆分，渲染时高亮标记词（首次出现带释义，复习仅加粗）。
 * 释义字号比正文小一档（fontSize - 2），保持"加粗是唯一视觉差异"的克制。
 */
export function VocabText({
  text,
  marks,
  fontSize = 15,
  textColor = Colors.bodyText,
  onWordTap,
}: VocabTextProps) {
  const markMap = new Map<number, Mark>();
  for (const mark of marks) {
    markMap.set(mark.index, mark);
  }

  const segments = text.split(/(\s+)/);
  let wordIdx = 0;

  return (
    <Text style={[styles.container, { color: textColor, fontSize, lineHeight: fontSize * 1.8 }]}>
      {segments.map((segment, i) => {
        if (segment === '') return null;
        if (/^\s+$/.test(segment)) {
          return <Text key={`s-${i}`}>{segment}</Text>;
        }

        const idx = wordIdx;
        wordIdx++;
        const mark = markMap.get(idx);

        if (!mark) {
          return <Text key={`p-${i}`}>{segment}</Text>;
        }

        // 释义比正文小一档（13px 基准），保持克制
        const defStyle: TextStyle = {
          fontSize: Math.max(11, fontSize - 2),
          color: Colors.definition,
          fontWeight: '400',
        };

        return (
          <Text key={`w-${i}`}>
            <Text
              onPress={() => onWordTap?.(segment, mark.definition)}
            >
              <Text style={mark.is_new ? styles.newWord : styles.reviewWord}>
                {segment}
              </Text>
            </Text>
            {mark.is_new && <Text style={defStyle}>（{mark.definition}）</Text>}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { lineHeight: 27 },
  newWord: { fontWeight: '700' },
  reviewWord: { fontWeight: '600' },
});
