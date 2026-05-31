import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '@/src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getAllWorks } from '@/src/db/works';
import { getProgress } from '@/src/db/progress';
import type { Work } from '@/src/models/work';
import type { ReadingProgress } from '@/src/models/progress';
import { useCallback } from 'react';

interface WorkWithProgress {
  work: Work;
  progress: ReadingProgress | null;
}

export default function BookshelfScreen() {
  const router = useRouter();
  const [works, setWorks] = useState<WorkWithProgress[]>([]);

  const loadData = useCallback(async () => {
    try {
      const allWorks = await getAllWorks();
      const withProgress = await Promise.all(
        allWorks.map(async (work) => ({
          work,
          progress: await getProgress(work.id),
        }))
      );
      setWorks(withProgress);
    } catch (e) {
      console.error('[Bookshelf] Failed to load works:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const renderWorkCard = ({ item }: { item: WorkWithProgress }) => {
    const { work, progress } = item;
    const currentEp = progress?.current_ep ?? 1;
    const readEps = progress?.total_read_eps ?? 0;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/reader/${work.id}`)}
      >
        <View style={styles.cardContent}>
          <Text style={styles.workTitle}>{work.title}</Text>
          {work.title_en && (
            <Text style={styles.workTitleEn}>{work.title_en}</Text>
          )}
          <Text style={styles.workMeta}>
            {readEps > 0
              ? `已读 Ep.${readEps} / 共 ${work.total_eps} 集`
              : `共 ${work.total_eps} 集`}
          </Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {works.length === 0 ? (
        <View style={styles.emptyContent}>
          <Text style={styles.emptyText}>选择一部作品开始阅读</Text>
          <TouchableOpacity onPress={() => router.push('/upload')}>
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
        onPress={() => router.push('/upload')}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
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
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  cardContent: {
    flex: 1,
  },
  workTitle: {
    fontSize: 15,
    color: Colors.bodyText,
    fontFamily: 'Georgia',
  },
  workTitleEn: {
    fontSize: 13,
    color: Colors.secondary,
    marginTop: 2,
  },
  workMeta: {
    fontSize: 12,
    color: Colors.secondary,
    marginTop: 4,
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
    alignSelf: 'center',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.leftBubble,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
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
