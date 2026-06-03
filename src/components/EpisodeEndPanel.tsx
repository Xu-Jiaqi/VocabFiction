import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/src/theme/colors';
import type { VocabItem } from '@/src/models/episode';

interface EpisodeEndPanelProps {
  vocabCount: number;
  newWords: VocabItem[];
  reviewWords: VocabItem[];
  onExpandWord: (word: string) => void;
}

export function EpisodeEndPanel({
  vocabCount,
  newWords,
  reviewWords,
  onExpandWord,
}: EpisodeEndPanelProps) {
  return (
    <View style={styles.endPanel}>
      <Text style={styles.endTitle}>本集读完</Text>
      <Text style={styles.endSubtitle}>遇见 {vocabCount} 个词</Text>
      <View style={styles.endColumns}>
        <View style={styles.endColumn}>
          <Text style={styles.endColumnTitle}>新词</Text>
          {newWords.length > 0 ? (
            newWords.map((item, i) => (
              <Pressable
                key={`end-new-${item.word}-${i}`}
                style={({ pressed }) => [
                  styles.vocabRow,
                  pressed && { backgroundColor: Colors.pressedOverlay },
                ]}
                onPress={() => onExpandWord(item.word)}
              >
                <Text style={styles.vocabRowNew} numberOfLines={1}>
                  {item.word}
                  <Text style={styles.vocabRowDef}>
                    {'  '}
                    {item.definition}
                  </Text>
                </Text>
              </Pressable>
            ))
          ) : (
            <View style={styles.endPlaceholder}>
              <Text style={styles.endPlaceholderText}>本集无新词</Text>
            </View>
          )}
        </View>

        <View style={styles.endColumn}>
          <Text style={styles.endColumnTitle}>旧词</Text>
          {reviewWords.length > 0 ? (
            reviewWords.map((item, i) => (
              <Pressable
                key={`end-review-${item.word}-${i}`}
                style={({ pressed }) => [
                  styles.vocabRow,
                  pressed && { backgroundColor: Colors.pressedOverlay },
                ]}
                onPress={() => onExpandWord(item.word)}
              >
                <Text style={styles.vocabRowReview} numberOfLines={1}>
                  {item.word}
                </Text>
              </Pressable>
            ))
          ) : (
            <View style={styles.endPlaceholder}>
              <Text style={styles.endPlaceholderText}>本集无旧词</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  endPanel: {
    backgroundColor: Colors.panelBg,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginTop: 24,
    marginHorizontal: 12,
    marginBottom: 80,
  },
  endTitle: { fontSize: 14, color: Colors.secondary, marginBottom: 4 },
  endSubtitle: {
    fontSize: 18,
    color: Colors.bodyText,
    fontFamily: 'Georgia',
    marginBottom: 16,
  },
  endColumns: { flexDirection: 'row', gap: 12, marginTop: 12 },
  endColumn: { flex: 1 },
  endColumnTitle: { fontSize: 13, color: Colors.secondary, marginBottom: 8 },
  endPlaceholder: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: 8,
    borderStyle: 'dashed',
  },
  endPlaceholderText: { fontSize: 13, color: Colors.secondary },
  vocabRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    height: 44,
    justifyContent: 'center',
    borderRadius: 6,
    overflow: 'hidden',
  },
  vocabRowNew: {
    fontSize: 15,
    color: Colors.bodyText,
    fontFamily: 'Georgia',
  },
  vocabRowReview: {
    fontSize: 15,
    color: Colors.bodyText,
    fontWeight: '600',
    fontFamily: 'Georgia',
  },
  vocabRowDef: { fontSize: 13, color: Colors.definition, fontWeight: '400' },
});
