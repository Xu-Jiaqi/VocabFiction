import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Alert,
  TextInput,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Colors } from '@/src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getAllWordLists,
  updateWordListName,
  deleteWordList,
} from '@/src/db/word-lists';
import type { WordList } from '@/src/models/word-list';

export default function WordListManagementScreen() {
  const [wordLists, setWordLists] = useState<WordList[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const loadData = useCallback(() => {
    getAllWordLists()
      .then(setWordLists)
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const startRename = (wl: WordList) => {
    setEditingId(wl.id);
    setEditName(wl.name);
  };

  const commitRename = async () => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    try {
      await updateWordListName(editingId, trimmed);
    } catch (e) {
      console.warn('[WordLists] rename:', e);
    }
    setEditingId(null);
    loadData();
  };

  const handleDelete = (wl: WordList) => {
    Alert.alert('删除词表', `确定要删除 "${wl.name}" 吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteWordList(wl.id);
          } catch (e) {
            console.warn('[WordLists] delete:', e);
          }
          loadData();
        },
      },
    ]);
  };

  const fmtSource = (source: string) =>
    source === 'builtin' ? '内置' : '用户上传';

  const renderItem = ({ item: wl }: { item: WordList }) => {
    const isEditing = editingId === wl.id;

    return (
      <View style={styles.card}>
        <View style={styles.cardContent}>
          {isEditing ? (
            <TextInput
              style={styles.editInput}
              value={editName}
              onChangeText={setEditName}
              onSubmitEditing={commitRename}
              onBlur={commitRename}
              autoFocus
              selectTextOnFocus
              underlineColorAndroid="transparent"
            />
          ) : (
            <Text style={styles.cardName}>{wl.name}</Text>
          )}
          <Text style={styles.cardMeta}>
            {fmtSource(wl.source)}
            {' · '}
            {wl.text.split('\n').filter(Boolean).length} 词
          </Text>
        </View>

        <View style={styles.cardActions}>
          {isEditing ? (
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                pressed && { opacity: 0.6 },
              ]}
              onPress={commitRename}
            >
              <Text style={styles.actionText}>保存</Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                pressed && { opacity: 0.6 },
              ]}
              onPress={() => startRename(wl)}
            >
              <Text style={styles.actionText}>重命名</Text>
            </Pressable>
          )}
          {wl.source !== 'builtin' && (
            <Pressable
              style={({ pressed }) => [
                styles.actionBtn,
                pressed && { opacity: 0.6 },
              ]}
              onPress={() => handleDelete(wl)}
            >
              <Text style={styles.deleteText}>删除</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={wordLists}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyContent}>
            <Text style={styles.emptyText}>暂无词表</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.mainBg },
  list: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 80 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  cardContent: { flex: 1 },
  cardName: {
    fontSize: 15,
    color: Colors.bodyText,
  },
  cardMeta: {
    fontSize: 12,
    color: Colors.secondary,
    marginTop: 2,
  },
  editInput: {
    fontSize: 15,
    color: Colors.bodyText,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    paddingVertical: 4,
    marginBottom: 4,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 13,
    color: Colors.bodyText,
  },
  deleteText: {
    fontSize: 13,
    color: Colors.destructive,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.divider,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.secondary,
  },
});
