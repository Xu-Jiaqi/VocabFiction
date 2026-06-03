import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
} from 'react-native';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { Colors } from '@/src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveUploadedWordList } from '@/src/services/user-content';
import { decodePickedTextFile } from '@/src/services/text-file';

export default function WordListUploadScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const wordCount = lines.length;
  const canSubmit = wordCount > 0 && status !== 'saving';

  const pickFile = async () => {
    try {
      const result = await File.pickFileAsync({ mimeTypes: ['text/plain'] });
      if (!result.canceled && result.result) {
        const file = result.result;
        const content = await decodePickedTextFile(file);
        setText(content);
        setFileName(file.name || '');
        if (!name) {
          setName(file.name?.replace(/\.txt$/i, '') || '');
        }
      }
    } catch (e) {
      console.warn('[WordListUpload] Pick file:', e);
      setStatus('error');
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setStatus('saving');
    try {
      await saveUploadedWordList({
        name,
        text,
      });
      router.back();
    } catch (e) {
      console.warn('[WordListUpload] Save word list:', e);
      setStatus('error');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.hint}>
          每行一个单词，之后上传小说时会自动使用当前词表
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.fileBtn,
            pressed && { backgroundColor: Colors.pressedOverlay },
          ]}
          onPress={pickFile}
        >
          <Text style={styles.fileBtnText}>
            {fileName ? fileName : '选择 .txt 词表文件'}
          </Text>
        </Pressable>

        <Text style={styles.label}>词表名称（选填）</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="如：四级核心词、NJU AB类"
          placeholderTextColor={Colors.secondary}
        />

        <Text style={styles.label}>词表内容</Text>
        <View style={styles.textAreaWrap}>
          <TextInput
            style={styles.textArea}
            value={text}
            onChangeText={setText}
            placeholder={'或直接粘贴单词\napple\nbook\ncat'}
            placeholderTextColor={Colors.secondary}
            multiline
            numberOfLines={10}
            textAlignVertical="top"
          />
        </View>
        {text.length > 0 && (
          <Text style={styles.charCount}>{wordCount} 个单词</Text>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.submitBtn,
            !canSubmit && styles.submitBtnDisabled,
            pressed && canSubmit && { opacity: 0.7 },
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          <Text
            style={[
              styles.submitText,
              !canSubmit && styles.submitTextDisabled,
            ]}
          >
            {status === 'saving' ? '保存中...' : '保存词表 →'}
          </Text>
        </Pressable>

        {status === 'error' && (
          <Text style={styles.statusHint}>保存失败，请检查文件后重试</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.mainBg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 80 },
  hint: { fontSize: 13, color: Colors.secondary, marginBottom: 20 },
  fileBtn: {
    borderWidth: 1,
    borderColor: Colors.divider,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 28,
    alignItems: 'center',
    marginBottom: 24,
  },
  fileBtnText: { fontSize: 14, color: Colors.bodyText },
  label: { fontSize: 13, color: Colors.secondary, marginBottom: 8, marginTop: 12 },
  input: {
    fontSize: 15,
    color: Colors.bodyText,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    paddingVertical: 8,
    marginBottom: 12,
  },
  textAreaWrap: {
    borderWidth: 1,
    borderColor: Colors.divider,
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 12,
  },
  textArea: { fontSize: 15, color: Colors.bodyText, minHeight: 180 },
  charCount: { fontSize: 12, color: Colors.secondary, marginTop: 6, textAlign: 'right' },
  submitBtn: { marginTop: 32, paddingVertical: 14, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { fontSize: 15, color: Colors.bodyText },
  submitTextDisabled: { color: Colors.secondary },
  statusHint: { marginTop: 16, fontSize: 13, color: Colors.secondary, textAlign: 'center' },
});
