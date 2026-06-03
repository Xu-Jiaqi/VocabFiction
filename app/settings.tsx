import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSetting, setSetting } from '@/src/db/settings';
import type { FontSize, ReadingMode } from '@/src/models/setting';

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
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        {/* Font size */}
        <View style={styles.section}>
          <Text style={styles.label}>字体大小</Text>
          <View style={styles.segmentedControl}>
            {FONT_SIZES.map(({ key, label }) => (
              <Pressable
                key={key}
                style={({ pressed }) => [
                  styles.segment,
                  fontSize === key && styles.segmentActive,
                  pressed && { backgroundColor: Colors.pressedOverlay },
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
              </Pressable>
            ))}
          </View>
        </View>

        {/* Reading mode */}
        <View style={styles.section}>
          <Text style={styles.label}>阅读模式</Text>
          <View style={styles.segmentedControl}>
            <Pressable
              style={({ pressed }) => [
                styles.segment,
                readingMode === 'chat' && styles.segmentActive,
                pressed && { backgroundColor: Colors.pressedOverlay },
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
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.segment,
                readingMode === 'paragraph' && styles.segmentActive,
                pressed && { backgroundColor: Colors.pressedOverlay },
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
            </Pressable>
          </View>
        </View>

        <View style={styles.divider} />

        <Pressable
          style={({ pressed }) => [
            styles.linkRow,
            pressed && { backgroundColor: Colors.pressedOverlay },
          ]}
          onPress={() => router.push('/api-settings')}
        >
          <Text style={styles.linkText}>API 设置</Text>
          <Text style={styles.arrow}>→</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.linkRow,
            pressed && { backgroundColor: Colors.pressedOverlay },
          ]}
          onPress={() => router.push('/settings/word-lists')}
        >
          <Text style={styles.linkText}>词表管理</Text>
          <Text style={styles.arrow}>→</Text>
        </Pressable>

        <View style={styles.linkRow}>
          <Text style={styles.linkText}>关于 VocabFiction</Text>
        </View>
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
    paddingTop: 0,
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
    gap: 4,
  },
  // 段控：每个 segment 加内边距到 44pt 高
  segment: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
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
    paddingHorizontal: 8,
    marginHorizontal: -8,
    minHeight: 44,
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
