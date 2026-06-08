import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/src/theme/colors';
import {
  deleteWork,
  getWork,
  updateWorkEpisodeCount,
  updateWorkTitle,
  updateWorkWordList,
} from '@/src/db/works';
import { getAllWordLists } from '@/src/db/word-lists';
import type { Work } from '@/src/models/work';
import type { WordList } from '@/src/models/word-list';
import { generateEpisodesInApp } from '@/src/services/generation/pipeline';
import {
  loadGenerationCheckpoint,
  type LocalGenerationCheckpoint,
} from '@/src/services/generation/checkpoint';
import {
  deleteUploadedWorkContent,
  loadUserPlainText,
  saveGeneratedEpisodes,
  saveWorkGenerationData,
} from '@/src/services/user-content';

export default function WorkManageScreen() {
  const router = useRouter();
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const [work, setWork] = useState<Work | null>(null);
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [checkpoint, setCheckpoint] = useState<LocalGenerationCheckpoint | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [selectedWordListId, setSelectedWordListId] = useState<string | null>(null);
  const [status, setStatus] = useState<
    'loading' | 'ready' | 'saving' | 'generating' | 'error'
  >('loading');
  const [errorText, setErrorText] = useState('');
  const [generationText, setGenerationText] = useState('');

  const loadData = useCallback(async () => {
    if (!workId) {
      setStatus('error');
      setErrorText('缺少作品 ID');
      return;
    }

    try {
      setStatus('loading');
      const [loadedWork, loadedWordLists, loadedCheckpoint] = await Promise.all([
        getWork(workId),
        getAllWordLists(),
        loadGenerationCheckpoint(workId),
      ]);

      if (!loadedWork) {
        setStatus('error');
        setErrorText('作品不存在');
        return;
      }

      setWork(loadedWork);
      setCheckpoint(loadedCheckpoint);
      setTitleDraft(loadedWork.title);
      setWordLists(loadedWordLists);
      setSelectedWordListId(loadedWork.word_list_id);
      setStatus('ready');
    } catch (e) {
      console.warn('[WorkManage] Load:', e);
      setStatus('error');
      setErrorText('加载失败');
    }
  }, [workId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentWordList = useMemo(
    () => wordLists.find((item) => item.id === selectedWordListId) ?? null,
    [selectedWordListId, wordLists],
  );

  const handleSelectWordList = async (wordListId: string) => {
    if (!work || status === 'saving' || wordListId === selectedWordListId) return;

    try {
      setStatus('saving');
      await updateWorkWordList(work.id, wordListId);
      setSelectedWordListId(wordListId);
      setWork({ ...work, word_list_id: wordListId });
      setStatus('ready');
    } catch (e) {
      console.warn('[WorkManage] Update word list:', e);
      setStatus('error');
      setErrorText('更换词表失败');
    }
  };

  const handleSaveTitle = async () => {
    if (!work || status === 'saving') return;

    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleDraft(work.title);
      return;
    }
    if (nextTitle === work.title) return;

    try {
      setStatus('saving');
      await updateWorkTitle(work.id, nextTitle);
      setWork({ ...work, title: nextTitle });
      setTitleDraft(nextTitle);
      setStatus('ready');
    } catch (e) {
      console.warn('[WorkManage] Update title:', e);
      setTitleDraft(work.title);
      setStatus('error');
      setErrorText('修改作品名称失败');
    }
  };

  const deleteUserWork = async () => {
    if (!work || work.source !== 'user') return;

    try {
      setStatus('saving');
      await deleteUploadedWorkContent(work.id);
      await deleteWork(work.id);
      router.replace('/');
    } catch (e) {
      console.warn('[WorkManage] Delete:', e);
      setStatus('error');
      setErrorText('删除失败');
    }
  };

  const checkpointText = useMemo(() => {
    if (!checkpoint) return '还没有生成进度';
    if (checkpoint.phase === 'COMPLETE') return '生成已完成';
    if (checkpoint.phase === 'FAILED') {
      return checkpoint.last_error
        ? `上次失败：${checkpoint.last_error}`
        : '上次生成失败';
    }
    if (checkpoint.total > 0) {
      return `${checkpoint.message}（${checkpoint.current}/${checkpoint.total}）`;
    }
    return checkpoint.message;
  }, [checkpoint]);

  const handleGenerateWork = async () => {
    if (!work || work.source !== 'user' || status === 'generating') return;

    const selectedWordList = wordLists.find((item) => item.id === selectedWordListId);
    if (!selectedWordList) {
      setStatus('error');
      setErrorText('请先绑定词表');
      return;
    }

    try {
      setStatus('generating');
      setErrorText('');
      setGenerationText('正在读取本地原文...');
      const [novelText, latestCheckpoint] = await Promise.all([
        loadUserPlainText(work.id),
        loadGenerationCheckpoint(work.id),
      ]);
      if (!novelText) {
        throw new Error('本地原文不存在，请重新上传小说');
      }

      const generated = await generateEpisodesInApp({
        workId: work.id,
        title: work.title,
        novelText,
        wordListText: selectedWordList.text,
        resumeFrom: latestCheckpoint,
        onStatus: (generationStatus) => {
          setGenerationText(generationStatus.message);
        },
      });

      setGenerationText('正在保存生成结果...');
      await saveGeneratedEpisodes(work.id, generated.episodes);
      await saveWorkGenerationData({
        workId: work.id,
        chapters: generated.chapters,
        arcPlan: generated.arcPlan,
        userVocabulary: generated.userVocabulary,
      });
      await updateWorkEpisodeCount(work.id, generated.episodes.length);
      setWork({ ...work, total_eps: generated.episodes.length });
      setCheckpoint(await loadGenerationCheckpoint(work.id));
      setStatus('ready');
      router.replace(`/reader/${work.id}`);
    } catch (error) {
      console.warn('[WorkManage] Generate:', error);
      setCheckpoint(work ? await loadGenerationCheckpoint(work.id) : null);
      setStatus('error');
      setErrorText((error as Error)?.message || '生成失败');
    }
  };

  const confirmDelete = () => {
    if (!work || work.source !== 'user') return;

    Alert.alert(
      '删除小说',
      `确定删除《${work.title}》吗？本地保存的原文也会被移除。`,
      [
        { text: '取消', style: 'cancel' },
        { text: '删除', style: 'destructive', onPress: deleteUserWork },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>管理作品</Text>

        {status === 'loading' && <Text style={styles.hint}>加载中...</Text>}
        {status === 'error' && <Text style={styles.errorText}>{errorText}</Text>}

        {work && (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>作品</Text>
              <TextInput
                style={styles.titleInput}
                value={titleDraft}
                onChangeText={setTitleDraft}
                onBlur={handleSaveTitle}
                onSubmitEditing={handleSaveTitle}
                editable={status !== 'saving'}
                placeholder="作品名称"
                placeholderTextColor={Colors.secondary}
                returnKeyType="done"
                underlineColorAndroid="transparent"
              />
              {work.title_en && <Text style={styles.subtitle}>{work.title_en}</Text>}
              <Text style={styles.meta}>
                {work.source === 'builtin' ? '内置小说' : '用户上传小说'}
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>绑定词表</Text>
              <Text style={styles.hint}>
                当前：{currentWordList?.name ?? '未绑定'}
              </Text>
              {wordLists.map((wordList) => {
                const selected = wordList.id === selectedWordListId;
                return (
                  <Pressable
                    key={wordList.id}
                    style={({ pressed }) => [
                      styles.wordListRow,
                      selected && styles.wordListRowSelected,
                      pressed && { backgroundColor: Colors.pressedOverlay },
                    ]}
                    onPress={() => handleSelectWordList(wordList.id)}
                    disabled={status === 'saving'}
                  >
                    <View style={styles.wordListTextWrap}>
                      <Text style={styles.wordListName}>{wordList.name}</Text>
                      <Text style={styles.wordListMeta}>
                        {wordList.source === 'builtin' ? '内置词表' : '用户词表'}
                      </Text>
                    </View>
                    <Text style={styles.check}>{selected ? '✓' : ''}</Text>
                  </Pressable>
                );
              })}
            </View>

            {work.source === 'user' && work.total_eps === 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>生成分集</Text>
                <Text style={styles.hint}>
                  {status === 'generating'
                    ? generationText || '正在生成...'
                    : checkpointText}
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.generateBtn,
                    status === 'generating' && styles.generateBtnDisabled,
                    pressed && status !== 'generating' && {
                      backgroundColor: Colors.pressedOverlay,
                    },
                  ]}
                  onPress={handleGenerateWork}
                  disabled={status === 'generating'}
                >
                  <Text style={styles.generateText}>
                    {status === 'generating' ? '生成中...' : '继续生成分集'}
                  </Text>
                </Pressable>
              </View>
            )}

            {work.source === 'user' && (
              <Pressable
                style={({ pressed }) => [
                  styles.deleteBtn,
                  pressed && { backgroundColor: Colors.pressedOverlay },
                ]}
                onPress={confirmDelete}
                disabled={status === 'saving'}
              >
                <Text style={styles.deleteText}>
                  {status === 'saving' ? '处理中...' : '删除小说'}
                </Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.mainBg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 80 },
  heading: {
    fontSize: 18,
    color: Colors.bodyText,
    fontFamily: 'Georgia',
    marginBottom: 16,
  },
  card: {
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
  },
  label: { fontSize: 12, color: Colors.secondary, marginBottom: 4 },
  titleInput: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    color: Colors.bodyText,
    fontFamily: 'Georgia',
    fontSize: 16,
    paddingHorizontal: 0,
    paddingVertical: 4,
  },
  subtitle: { fontSize: 13, color: Colors.secondary, marginTop: 2 },
  meta: { fontSize: 12, color: Colors.secondary, marginTop: 10 },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 14, color: Colors.bodyText, marginBottom: 6 },
  hint: { fontSize: 13, color: Colors.secondary, marginBottom: 12 },
  errorText: { fontSize: 13, color: Colors.destructive, marginBottom: 12 },
  wordListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 10,
  },
  wordListRowSelected: {
    borderColor: Colors.progressBar,
    backgroundColor: Colors.panelBg,
  },
  wordListTextWrap: { flex: 1 },
  wordListName: { fontSize: 14, color: Colors.bodyText },
  wordListMeta: { fontSize: 12, color: Colors.secondary, marginTop: 3 },
  check: { width: 24, textAlign: 'right', color: Colors.success, fontSize: 16 },
  generateBtn: {
    borderWidth: 1,
    borderColor: Colors.progressBar,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  generateBtnDisabled: { opacity: 0.45 },
  generateText: { fontSize: 15, color: Colors.bodyText },
  deleteBtn: {
    borderWidth: 1,
    borderColor: Colors.destructive,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteText: { fontSize: 15, color: Colors.destructive },
});
