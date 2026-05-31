import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { Colors } from '@/src/theme/colors';
import { lookupWord, parseWordForms } from '@/src/db/dictionary';
import type { DictionaryEntry } from '@/src/db/dictionary';

interface DictionaryPanelProps {
  word: string;
  onClose: () => void;
}

export function DictionaryPanel({ word, onClose }: DictionaryPanelProps) {
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    lookupWord(word).then(setEntry).catch(e => setError(e.message ?? 'Lookup failed')).finally(() => setLoading(false));
  }, [word]);

  const forms = entry?.exchange ? parseWordForms(entry.exchange) : null;

  return (
    <View style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={Colors.secondary} style={styles.loader} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : entry ? (
        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.entryWord}>{entry.word}</Text>
          {entry.phonetic && <Text style={styles.phonetic}>{entry.phonetic}</Text>}
          {entry.translation && (
            <View style={styles.translations}>
              {entry.translation.split('\n').map((line, i) => (
                <Text key={i} style={styles.translationLine}>{line.replace(/^[a-z]+\.\s*/i, '').trim()}</Text>
              ))}
            </View>
          )}
          {forms && (forms.past || forms.pastParticiple || forms.presentParticiple || forms.plural) ? (
            <View style={styles.formsSection}>
              <Text style={styles.formsLabel}>词形变化</Text>
              <View style={styles.formsRow}>
                {forms.past && <Text style={styles.formItem}>过去式: {forms.past}</Text>}
                {forms.pastParticiple && <Text style={styles.formItem}>过去分词: {forms.pastParticiple}</Text>}
                {forms.presentParticiple && <Text style={styles.formItem}>进行时: {forms.presentParticiple}</Text>}
                {forms.plural && <Text style={styles.formItem}>复数: {forms.plural}</Text>}
                {forms.thirdPerson && <Text style={styles.formItem}>三单: {forms.thirdPerson}</Text>}
              </View>
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <Text style={styles.notFoundText}>词典中暂无此词</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: Colors.panelBg,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    maxHeight: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  closeBtn: { fontSize: 16, color: Colors.secondary, padding: 4 },
  loader: { paddingVertical: 16 },
  scrollContent: { flexGrow: 0 },
  entryWord: { fontSize: 18, fontWeight: '700', color: Colors.bodyText, marginBottom: 2 },
  phonetic: { fontSize: 13, color: Colors.secondary, marginBottom: 10 },
  translations: { marginBottom: 10 },
  translationLine: { fontSize: 14, lineHeight: 22, color: Colors.bodyText },
  formsSection: { borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: 10 },
  formsLabel: { fontSize: 12, color: Colors.secondary, marginBottom: 6 },
  formsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  formItem: { fontSize: 13, color: Colors.bodyText },
  errorText: { fontSize: 14, color: Colors.secondary, textAlign: 'center', paddingVertical: 16 },
  notFoundText: { fontSize: 14, color: Colors.secondary, textAlign: 'center', paddingVertical: 16 },
});
