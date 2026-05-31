import { ScrollView, Text, StyleSheet } from 'react-native';
import { Colors } from '@/src/theme/colors';

interface PlainTextReaderProps {
  text: string;
  fontSize: number;
}

/** Simple plain text reader — renders full text with paragraph breaks. */
export function PlainTextReader({ text, fontSize }: PlainTextReaderProps) {
  const paragraphs = text.split(/\n\n+/);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {paragraphs.map((para, i) => {
        const trimmed = para.trim();
        if (!trimmed) return null;
        return (
          <Text
            key={i}
            style={[
              styles.paragraph,
              { fontSize, lineHeight: fontSize * 1.8 },
            ]}
          >
            {trimmed}
          </Text>
        );
      })}
      <Text style={[styles.endMark, { fontSize: fontSize * 0.8 }]}>
        — End —
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 80 },
  paragraph: {
    color: Colors.bodyText,
    marginBottom: 16,
    textAlign: 'justify',
  },
  endMark: {
    color: Colors.secondary,
    textAlign: 'center',
    marginTop: 32,
  },
});
