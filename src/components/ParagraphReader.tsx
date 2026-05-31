import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Colors } from '@/src/theme/colors';
import { VocabText } from './VocabText';
import type { Message } from '@/src/models/episode';

interface ParagraphReaderProps {
  messages: Message[];
  workId: string;
  fontSize: number;
  onWordTap?: (word: string, definition: string) => void;
  onExpandWord?: (word: string) => void;
}

export function ParagraphReader({ messages, fontSize, onWordTap, onExpandWord }: ParagraphReaderProps) {
  const paragraphs = buildParagraphs(messages);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {paragraphs.map((para, i) => {
        if (para.type === 'narration') {
          return (
            <View key={i} style={styles.narrationBlock}>
              {para.parts.map((part, j) => (
                <VocabText
                  key={j}
                  text={part.text}
                  marks={part.marks}
                  fontSize={fontSize}
                  onWordTap={onWordTap}
                />
              ))}
            </View>
          );
        }

        return (
          <View key={i} style={styles.dialogueBlock}>
            <Text style={[styles.speaker, { fontSize: fontSize * 0.8 }]}>{para.speaker}</Text>
            {para.parts.map((part, j) => (
              <VocabText
                key={j}
                text={`"${part.text}"`}
                marks={part.marks}
                fontSize={fontSize}
                onWordTap={onWordTap}
              />
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

interface ParaPart { text: string; marks: any[] }

interface Paragraph {
  type: 'narration' | 'dialogue';
  speaker?: string;
  parts: ParaPart[];
}

function buildParagraphs(messages: Message[]): Paragraph[] {
  const result: Paragraph[] = [];
  let cur: Paragraph | null = null;

  for (const msg of messages) {
    if (msg.type === 'narration') {
      if (cur?.type === 'narration') {
        cur.parts.push({ text: msg.text, marks: msg.marks });
      } else {
        if (cur) result.push(cur);
        cur = { type: 'narration', parts: [{ text: msg.text, marks: msg.marks }] };
      }
    } else {
      if (cur?.type === 'dialogue' && cur.speaker === msg.name) {
        cur.parts.push({ text: msg.text, marks: msg.marks });
      } else {
        if (cur) result.push(cur);
        cur = { type: 'dialogue', speaker: msg.name, parts: [{ text: msg.text, marks: msg.marks }] };
      }
    }
  }
  if (cur) result.push(cur);
  return result;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 80 },
  narrationBlock: { marginBottom: 16, paddingLeft: 4 },
  dialogueBlock: { marginBottom: 16, paddingLeft: 4 },
  speaker: { color: Colors.secondary, marginBottom: 2, fontStyle: 'italic' },
});
