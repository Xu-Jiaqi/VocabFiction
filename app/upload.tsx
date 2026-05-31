import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
} from 'react-native';
import { Colors } from '@/src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { File } from 'expo-file-system';

export default function UploadScreen() {
  const [title, setTitle] = useState('');
  const [novelText, setNovelText] = useState('');
  const [novelFile, setNovelFile] = useState('');
  const [wordListText, setWordListText] = useState('');
  const [wordFile, setWordFile] = useState('');
  const [status, setStatus] = useState<'idle' | 'generating'>('idle');

  const canSubmit = novelText.trim().length > 0 && wordListText.trim().length > 0;

  const pickNovelFile = async () => {
    try {
      const result = await File.pickFileAsync({ mimeTypes: ['text/plain'] });
      if (result && !result.canceled) {
        const file = result as unknown as File;
        const text = await file.text();
        setNovelText(text);
        setNovelFile(file.name || '');
        if (!title) setTitle(file.name?.replace(/\.txt$/i, '') || '');
      }
    } catch (e) {
      console.warn('[Upload] Pick novel file:', e);
    }
  };

  const pickWordFile = async () => {
    try {
      const result = await File.pickFileAsync({ mimeTypes: ['text/plain'] });
      if (result && !result.canceled) {
        const file = result as unknown as File;
        const text = await file.text();
        setWordListText(text);
        setWordFile(file.name || '');
      }
    } catch (e) {
      console.warn('[Upload] Pick word file:', e);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    setStatus('generating');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Novel */}
        <View style={styles.sectionHeader}>
          <Text style={styles.label}>小说内容</Text>
          <TouchableOpacity onPress={pickNovelFile} style={styles.pickButton}>
            <Text style={styles.pickButtonText}>选择 .txt 文件</Text>
          </TouchableOpacity>
        </View>
        {novelFile ? <Text style={styles.fileHint}>{novelFile}</Text> : null}
        <View style={styles.uploadArea}>
          <TextInput
            style={styles.textArea}
            value={novelText}
            onChangeText={setNovelText}
            placeholder="或直接粘贴小说文字"
            placeholderTextColor={Colors.secondary}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
        </View>

        <Text style={[styles.label, { marginTop: 20 }]}>作品名称（选填）</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="输入名称，留空则自动提取"
          placeholderTextColor={Colors.secondary}
        />

        {/* Word list */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.label, { marginTop: 20, marginBottom: 0 }]}>词表</Text>
          <TouchableOpacity onPress={pickWordFile} style={styles.pickButton}>
            <Text style={styles.pickButtonText}>选择 .txt 文件</Text>
          </TouchableOpacity>
        </View>
        {wordFile ? <Text style={styles.fileHint}>{wordFile}</Text> : null}
        <View style={styles.uploadArea}>
          <TextInput
            style={styles.textAreaSmall}
            value={wordListText}
            onChangeText={setWordListText}
            placeholder="或直接粘贴词表，每行一个单词"
            placeholderTextColor={Colors.secondary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <TouchableOpacity
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || status === 'generating'}
        >
          <Text style={[styles.submitText, !canSubmit && styles.submitTextDisabled]}>
            {status === 'generating' ? '生成中...' : '开始生成 →'}
          </Text>
        </TouchableOpacity>

        {status === 'generating' && (
          <Text style={styles.statusHint}>作品正在处理中，返回书架查看进度</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.mainBg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 80 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 14, color: Colors.bodyText, marginBottom: 8 },
  pickButton: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, backgroundColor: Colors.leftBubble },
  pickButtonText: { fontSize: 13, color: Colors.bodyText },
  fileHint: { fontSize: 12, color: Colors.secondary, marginTop: 4, marginBottom: 4 },
  uploadArea: { borderWidth: 1, borderColor: Colors.divider, borderStyle: 'dashed', borderRadius: 8, padding: 12, backgroundColor: Colors.mainBg },
  textArea: { fontSize: 15, color: Colors.bodyText, minHeight: 100 },
  textAreaSmall: { fontSize: 15, color: Colors.bodyText, minHeight: 80 },
  input: { fontSize: 15, color: Colors.bodyText, borderBottomWidth: 1, borderBottomColor: Colors.divider, paddingVertical: 8 },
  submitButton: { marginTop: 32, paddingVertical: 12, alignItems: 'center' },
  submitButtonDisabled: { opacity: 0.4 },
  submitText: { fontSize: 15, color: Colors.bodyText },
  submitTextDisabled: { color: Colors.secondary },
  statusHint: { marginTop: 16, fontSize: 13, color: Colors.secondary, textAlign: 'center' },
});
