import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSetting, setSetting } from '@/src/db/settings';

type FontSize = 'small' | 'medium' | 'large';
type ReadingMode = 'chat' | 'paragraph';

const FONT_SIZES: { key: FontSize; label: string }[] = [
  { key: 'small', label: '小' },
  { key: 'medium', label: '中' },
  { key: 'large', label: '大' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const [fontSize, setFontSize] = useState<FontSize>('medium');
  const [readingMode, setReadingMode] = useState<ReadingMode>('chat');

  useEffect(() => {
    (async () => {
      const fs = await getSetting('font_size');
      const rm = await getSetting('reading_mode');
      if (fs) setFontSize(fs as FontSize);
      if (rm) setReadingMode(rm as ReadingMode);
    })();
  }, []);

  const handleFontSize = async (size: FontSize) => {
    setFontSize(size);
    await setSetting('font_size', size);
  };

  const handleReadingMode = async (mode: ReadingMode) => {
    setReadingMode(mode);
    await setSetting('reading_mode', mode);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>设置</Text>

        {/* Font size */}
        <View style={styles.section}>
          <Text style={styles.label}>字体大小</Text>
          <View style={styles.segmentedControl}>
            {FONT_SIZES.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.segment,
                  fontSize === key && styles.segmentActive,
                ]}
                onPress={() => handleFontSize(key)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    fontSize === key && styles.segmentTextActive,
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Reading mode */}
        <View style={styles.section}>
          <Text style={styles.label}>阅读模式</Text>
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[
                styles.segment,
                readingMode === 'chat' && styles.segmentActive,
              ]}
              onPress={() => handleReadingMode('chat')}
            >
              <Text
                style={[
                  styles.segmentText,
                  readingMode === 'chat' && styles.segmentTextActive,
                ]}
              >
                对话体
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segment,
                readingMode === 'paragraph' && styles.segmentActive,
              ]}
              onPress={() => handleReadingMode('paragraph')}
            >
              <Text
                style={[
                  styles.segmentText,
                  readingMode === 'paragraph' && styles.segmentTextActive,
                ]}
              >
                传统
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => router.push('/api-settings')}
        >
          <Text style={styles.linkText}>API 设置</Text>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow}>
          <Text style={styles.linkText}>关于 VocabFiction</Text>
          <Text style={styles.arrow}>→</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  title: {
    fontSize: 20,
    color: Colors.bodyText,
    fontWeight: '400',
    marginBottom: 32,
  },
  section: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  label: {
    fontSize: 15,
    color: Colors.bodyText,
  },
  segmentedControl: {
    flexDirection: 'row',
  },
  segment: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: Colors.leftBubble,
  },
  segmentText: {
    fontSize: 14,
    color: Colors.secondary,
  },
  segmentTextActive: {
    color: Colors.bodyText,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: 8,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  linkText: {
    fontSize: 15,
    color: Colors.bodyText,
  },
  arrow: {
    fontSize: 15,
    color: Colors.secondary,
  },
});
