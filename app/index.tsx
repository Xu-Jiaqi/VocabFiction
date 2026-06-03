import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '@/src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAllWorks } from '@/src/db/works';
import { getAllWordLists } from '@/src/db/word-lists';
import type { Work } from '@/src/models/work';
import type { WordList } from '@/src/models/word-list';
import { ActionSheet } from '@/src/components/ActionSheet';
import type { ActionItem } from '@/src/components/ActionSheet';

interface WorkWithMeta {
  work: Work;
  wordListName: string;
}

export default function BookshelfScreen() {
  const router = useRouter();
  const [works, setWorks] = useState<WorkWithMeta[]>([]);
  const [sheetVisible, setSheetVisible] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [allWorks, wordLists] = await Promise.all([
        getAllWorks(),
        getAllWordLists(),
      ]);
      const wlMap = new Map(wordLists.map((wl: WordList) => [wl.id, wl.name]));
      const withMeta = allWorks.map((work) => ({
        work,
        wordListName: wlMap.get(work.word_list_id ?? '') ?? '',
      }));
      setWorks(withMeta);
    } catch (e) {
      console.error('[Bookshelf] Failed to load works:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const fabActions: ActionItem[] = [
    { text: '上传小说', onPress: () => router.push('/upload/novel') },
    { text: '上传词表', onPress: () => router.push('/upload/wordlist') },
  ];

  const renderWorkCard = ({ item }: { item: WorkWithMeta }) => {
    const { work, wordListName } = item;
    const isUserWork = work.source === 'user';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          if (!isUserWork) router.push(`/reader/${work.id}`);
        }}
        onLongPress={() => router.push(`/work/${work.id}/manage`)}
      >
        <View style={styles.cardContent}>
          <Text style={styles.workTitle}>{work.title}</Text>
          {wordListName ? (
            <Text style={styles.wordListName}>{wordListName}</Text>
          ) : null}
        </View>
        {!isUserWork && <Text style={styles.arrow}>›</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {works.length === 0 ? (
        <View style={styles.emptyContent}>
          <Text style={styles.emptyText}>选择一部作品开始阅读</Text>
          <TouchableOpacity onPress={() => router.push('/upload/novel')}>
            <Text style={styles.emptySubtext}>上传你的小说 →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={works}
          keyExtractor={(item) => item.work.id}
          renderItem={renderWorkCard}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* FAB always visible */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setSheetVisible(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <ActionSheet
        visible={sheetVisible}
        title="添加"
        actions={fabActions}
        onClose={() => setSheetVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 96,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
  },
  cardContent: {
    flex: 1,
  },
  workTitle: {
    fontSize: 15,
    color: Colors.bodyText,
    fontFamily: 'Georgia',
  },
  wordListName: {
    fontSize: 12,
    color: Colors.secondary,
    marginTop: 2,
  },
  arrow: {
    fontSize: 22,
    color: Colors.divider,
    marginLeft: 8,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.divider,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.bodyText,
    fontFamily: 'Georgia',
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.secondary,
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    left: '50%',
    transform: [{ translateX: -24 }],
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.leftBubble,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  fabText: {
    fontSize: 26,
    color: Colors.bodyText,
    lineHeight: 30,
    textAlign: 'center',
  },
});
