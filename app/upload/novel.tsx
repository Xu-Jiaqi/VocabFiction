import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  FlatList,
} from 'react-native';
import { File } from 'expo-file-system';
import { useFocusEffect, useRouter } from 'expo-router';
import { Colors } from '@/src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { insertWork, updateWorkEpisodeCount } from '@/src/db/works';
import { getAllWordLists } from '@/src/db/word-lists';
import type { WordList } from '@/src/models/word-list';
import { generateEpisodesInApp } from '@/src/services/generation/pipeline';
import {
  loadLatestWordList,
  makeUserWorkId,
  saveGeneratedEpisodes,
  saveWorkGenerationData,
  saveUploadedWorkContentFromFile,
  type UploadedWordList,
} from '@/src/services/user-content';

type UploadStatus =
  | 'idle'
  | 'saving'
  | 'generating'
  | 'persisting'
  | 'error';

export default function NovelUploadScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [fileName, setFileName] = useState('');
  const [wordList, setWordList] = useState<UploadedWordList | null>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [errorText, setErrorText] = useState('');
  const [progressText, setProgressText] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [allWordLists, setAllWordLists] = useState<WordList[]>([]);
  const [showWordListPicker, setShowWordListPicker] = useState(false);

  // Store picked file URI (native file, never decoded into a JS string).
  const fileUriRef = useRef('');

  const isBusy = status === 'saving'
    || status === 'generating'
    || status === 'persisting';
  const canSubmit = fileSize > 0 && !isBusy;

  const refreshWordList = useCallback(async () => {
    try {
      setWordList(await loadLatestWordList());
    } catch (e) {
      console.warn('[NovelUpload] Load word list:', e);
      setWordList(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshWordList();
      getAllWordLists()
        .then(setAllWordLists)
        .catch(() => {});
    }, [refreshWordList]),
  );

  const pickFile = async () => {
    try {
      const result = await File.pickFileAsync({ mimeTypes: ['text/plain'] });
      if (!result.canceled && result.result) {
        const file = result.result;
        // No decoding — just keep the native file URI.
        fileUriRef.current = file.uri;
        setFileSize(file.size ?? 0);
        setFileName(file.name || '');
        if (!title) {
          setTitle(file.name?.replace(/\.txt$/i, '') || '');
        }
      }
    } catch (e) {
      console.warn('[NovelUpload] Pick file:', e);
      setStatus('error');
      setErrorText('读取文件失败，请确认文件是 .txt 文本');
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setStatus('saving');
    setErrorText('');
    setProgressText('正在保存原文...');
    let newWorkId = '';

    try {
      const currentWordList = wordList ?? await loadLatestWordList();
      if (!currentWordList) {
        setStatus('error');
        setProgressText('');
        setErrorText('请先上传词表，再上传小说');
        return;
      }

      const fileTitle = fileName.endsWith('.txt') ? fileName.slice(0, -4) : fileName;
      const workTitle = title.trim() || fileTitle || 'Untitled Work';
      newWorkId = makeUserWorkId(workTitle);

      const novelText = await saveUploadedWorkContentFromFile({
        workId: newWorkId,
        title: workTitle,
        fileUri: fileUriRef.current,
        wordListId: currentWordList.id,
      });

      await insertWork({
        id: newWorkId,
        title: workTitle,
        title_en: null,
        author: null,
        total_eps: 0,
        source: 'user',
        word_list_id: currentWordList.id,
      });

      setStatus('generating');
      setProgressText('正在进入 App 内生成流程...');
      const generated = await generateEpisodesInApp({
        workId: newWorkId,
        title: workTitle,
        novelText,
        wordListText: currentWordList.text,
        onStatus: (generationStatus) => {
          setProgressText(generationStatus.message);
        },
      });

      setStatus('persisting');
      setProgressText('正在保存生成结果...');
      await saveGeneratedEpisodes(newWorkId, generated.episodes);
      await saveWorkGenerationData({
        workId: newWorkId,
        chapters: generated.chapters,
        arcPlan: generated.arcPlan,
        userVocabulary: generated.userVocabulary,
      });

      await updateWorkEpisodeCount(newWorkId, generated.episodes.length);

      router.replace(`/reader/${newWorkId}`);
    } catch (e) {
      console.warn('[NovelUpload] Save uploaded work:', e);
      setStatus('error');
      setProgressText('');
      const reason = (e as Error)?.message || '保存失败，请稍后重试';
      setErrorText(
        newWorkId
          ? `${reason}。本地原文和生成进度已保留在书架，可进入作品管理页继续生成。`
          : reason,
      );
    }
  };

  const handleSelectWordList = (wl: WordList) => {
    setWordList({
      id: wl.id,
      name: wl.name,
      text: wl.text,
      source: wl.source,
      updated_at: wl.updated_at,
    });
    setShowWordListPicker(false);
  };

  const wordCount = wordList?.text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean).length ?? 0;

  const fmtSize = (bytes: number): string => {
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.hint}>
          支持 .txt 文件，上传后会在 App 内生成分集内容并保存到书架
        </Text>

        <View style={styles.wordListBox}>
          <View style={styles.wordListTextWrap}>
            <Text style={styles.wordListLabel}>当前词表</Text>
            <Text style={styles.wordListValue} numberOfLines={1}>
              {wordList ? `${wordList.name}（${wordCount} 词）` : '未上传词表'}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.wordListBtn,
              pressed && { backgroundColor: Colors.pressedOverlay },
            ]}
            onPress={() => setShowWordListPicker(true)}
          >
            <Text style={styles.wordListBtnText}>更换</Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.fileBtn,
            pressed && { backgroundColor: Colors.pressedOverlay },
          ]}
          onPress={pickFile}
        >
          <Text style={styles.fileBtnText}>
            {fileName ? fileName : '选择 .txt 文件'}
          </Text>
        </Pressable>

        <Text style={styles.label}>作品名称（选填）</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="输入作品名称，留空则自动提取"
          placeholderTextColor={Colors.secondary}
        />

        <Text style={styles.label}>小说内容</Text>
        <View style={styles.fileInfoBox}>
          <Text style={styles.fileInfoText}>
            {fileName
              ? `${fileName}（${fmtSize(fileSize)}）`
              : '未选择文件'}
          </Text>
        </View>

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
            {status === 'saving'
              ? '保存中...'
              : status === 'generating'
                ? '生成中...'
                : status === 'persisting'
                  ? '保存中...'
                  : '生成并加入书架 →'}
          </Text>
        </Pressable>

        {progressText.length > 0 && status !== 'error' && (
          <Text style={styles.statusHint}>{progressText}</Text>
        )}

        {status === 'error' && errorText.length > 0 && (
          <Text style={styles.statusHint}>{errorText}</Text>
        )}
      </ScrollView>

      <Modal
        visible={showWordListPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWordListPicker(false)}
      >
        <Pressable
          style={styles.pickerOverlay}
          onPress={() => setShowWordListPicker(false)}
        >
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>选择词表</Text>
            <FlatList
              data={allWordLists}
              keyExtractor={(item) => item.id}
              renderItem={({ item: wl }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.pickerItem,
                    wl.id === wordList?.id && styles.pickerItemActive,
                    pressed && { backgroundColor: Colors.pressedOverlay },
                  ]}
                  onPress={() => handleSelectWordList(wl)}
                >
                  <Text style={styles.pickerItemName}>{wl.name}</Text>
                  <Text style={styles.pickerItemMeta}>
                    {wl.source === 'builtin' ? '内置' : '用户上传'} ·{' '}
                    {wl.text.split('\n').filter(Boolean).length} 词
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.mainBg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 80 },
  hint: { fontSize: 13, color: Colors.secondary, marginBottom: 16 },
  wordListBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
  },
  wordListTextWrap: { flex: 1 },
  wordListLabel: { fontSize: 12, color: Colors.secondary, marginBottom: 2 },
  wordListValue: { fontSize: 14, color: Colors.bodyText },
  wordListBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  wordListBtnText: { fontSize: 13, color: Colors.bodyText },
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
  fileInfoBox: {
    borderWidth: 1,
    borderColor: Colors.divider,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  fileInfoText: { fontSize: 14, color: Colors.bodyText },
  submitBtn: { marginTop: 32, paddingVertical: 14, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { fontSize: 15, color: Colors.bodyText },
  submitTextDisabled: { color: Colors.secondary },
  statusHint: { marginTop: 16, fontSize: 13, color: Colors.secondary, textAlign: 'center' },
  pickerOverlay: {
    flex: 1,
    backgroundColor: Colors.scrim,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  pickerCard: {
    backgroundColor: Colors.mainBg,
    borderRadius: 16,
    paddingVertical: 16,
    maxHeight: '70%',
  },
  pickerTitle: {
    fontSize: 16,
    color: Colors.bodyText,
    fontFamily: 'Georgia',
    textAlign: 'center',
    marginBottom: 12,
  },
  pickerItem: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  pickerItemActive: {
    backgroundColor: Colors.leftBubble,
  },
  pickerItemName: {
    fontSize: 15,
    color: Colors.bodyText,
  },
  pickerItemMeta: {
    fontSize: 12,
    color: Colors.secondary,
    marginTop: 2,
  },
});
