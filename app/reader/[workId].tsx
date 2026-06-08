import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  AccessibilityInfo,
  BackHandler,
  useWindowDimensions,
  type ListRenderItemInfo,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
  cancelAnimation,
} from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadEpisode } from '@/src/services/episode-loader';
import { updateProgress } from '@/src/db/progress';
import { getWork } from '@/src/db/works';
import { getSetting } from '@/src/db/settings';
import { FONT_SCALES } from '@/src/models/setting';
import type { FontSize, ReadingMode } from '@/src/models/setting';
import { MessageRenderer } from '@/src/components/MessageRenderer';
import { AnimatedMessage } from '@/src/components/AnimatedMessage';
import { DictionaryPanel } from '@/src/components/DictionaryPanel';
import { ActionSheet } from '@/src/components/ActionSheet';
import type { ActionItem } from '@/src/components/ActionSheet';
import { PlainTextReader } from '@/src/components/PlainTextReader';
import { EpisodeEndPanel } from '@/src/components/EpisodeEndPanel';
import { EpisodeSidebar, SIDEBAR_WIDTH } from '@/src/components/EpisodeSidebar';
import { loadPlainText } from '@/src/services/episode-loader';
import { completeLocalEpisode } from '@/src/services/generation/reading';
import type { EpisodeReadingLog } from '@/src/services/generation/types';
import {
  saveCustomAvatar,
  deleteCustomAvatar,
  getCustomAvatarUri,
  checkCustomAvatarExists,
} from '@/src/services/character-loader';
import * as ImagePicker from 'expo-image-picker';
import type { Episode, Mark, Message } from '@/src/models/episode';
import type { Work } from '@/src/models/work';

const TOP_BAR_OFFSET = 48;
const SWIPE_THRESHOLD = 6;
const TAP_THRESHOLD = 5;
// 在 prefers-reduced-motion 开启时使用的最短动效时长（接近"瞬时"）
const REDUCED_MOTION_DURATION = 80;
const ANIM_DURATION = {
  screen: 250,
  dict: 250,
  sidebar: 220,
  bars: 200,
  barsFast: 150,
  message: 300,
};

function getDuration(nominal: number, reduceMotion: boolean) {
  return reduceMotion ? REDUCED_MOTION_DURATION : nominal;
}

function buildEpisodeReadingLog(
  episode: Episode,
  clickedCounts: Record<string, number>,
): EpisodeReadingLog {
  const byItemId = new Map<string, EpisodeReadingLog['word_logs'][number]>();

  for (const message of episode.messages) {
    for (const mark of message.marks) {
      if (!mark.item_id) continue;

      const item = byItemId.get(mark.item_id) ?? {
        item_id: mark.item_id,
        word: mark.word,
        meaning: mark.definition,
        appeared: 0,
        clicked: 0,
      };
      item.appeared += 1;
      item.clicked = Math.min(clickedCounts[mark.item_id] ?? 0, item.appeared);
      byItemId.set(mark.item_id, item);
    }
  }

  return {
    episode_id: episode.meta.ep,
    word_logs: Array.from(byItemId.values()),
  };
}

export default function ReaderScreen() {
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const [work, setWork] = useState<Work | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [currentEp, setCurrentEp] = useState(1);
  const [currentMsg, setCurrentMsg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [episodeDone, setEpisodeDone] = useState(false);
  const [revealSpacer, setRevealSpacer] = useState(0);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const [avatarActions, setAvatarActions] = useState<ActionItem[]>([]);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Dictionary panel at top
  const [dictWord, setDictWord] = useState<string | null>(null);
  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [barsActive, setBarsActive] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [readingMode, setReadingMode] = useState<ReadingMode>('chat');
  const [plainText, setPlainText] = useState<string | null>(null);
  const [episodeTitles, setEpisodeTitles] = useState<Record<number, string>>({});

  // Reanimated 共享值
  const dictAnim = useSharedValue(0);
  const sidebarAnim = useSharedValue(0);
  const overlayAnim = useSharedValue(0);
  const barsOpacity = useSharedValue(0);
  const screenAnim = useSharedValue(screenWidth);

  const flatListRef = useRef<FlatList<Message>>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const wordWasTapped = useRef(false);
  const didScroll = useRef(false);
  const scrollOffset = useRef(0);
  const avatarCharRef = useRef('');
  const contentHeight = useRef(0);
  const layoutHeight = useRef(0);
  const bottomBarsShown = useRef(false);
  const isRevealing = useRef(false);
  const pendingRevealScroll = useRef(0);
  const barsAnimTarget = useRef<0 | 1>(0);
  const barsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitialScrolled = useRef(false);
  const lastScrollY = useRef(0);
  const clickedCountsRef = useRef<Record<string, number>>({});
  const submittedEpisodeLogs = useRef(new Set<string>());

  // 监听系统动效降级偏好
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false));
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => sub.remove();
  }, []);

  // 屏幕进入：从右滑入 250ms
  useEffect(() => {
    screenAnim.value = reduceMotion ? 0 : screenWidth;
    if (!reduceMotion) {
      screenAnim.value = withTiming(0, {
        duration: ANIM_DURATION.screen,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [reduceMotion, screenAnim, screenWidth]);

  // 词典面板：滑入/滑出
  const showDictPanel = useCallback(
    (word: string) => {
      setDictWord(word);
      dictAnim.value = withTiming(1, {
        duration: getDuration(ANIM_DURATION.dict, reduceMotion),
        easing: Easing.out(Easing.cubic),
      });
    },
    [dictAnim, reduceMotion],
  );

  const hideDictPanel = useCallback(() => {
    dictAnim.value = withTiming(
      0,
      {
        duration: getDuration(ANIM_DURATION.dict - 50, reduceMotion),
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished) runOnJS(setDictWord)(null);
      },
    );
  }, [dictAnim, reduceMotion]);

  // 顶/底栏的显示/隐藏
  const showBars = useCallback(() => {
    if (barsAnimTarget.current === 1) return;
    barsAnimTarget.current = 1;
    setBarsActive(true);
    barsOpacity.value = withTiming(1, {
      duration: getDuration(ANIM_DURATION.bars, reduceMotion),
    });
    if (barsTimer.current) clearTimeout(barsTimer.current);
    if (episodeDone) return;
    barsTimer.current = setTimeout(() => {
      barsAnimTarget.current = 0;
      barsOpacity.value = withTiming(
        0,
        {
          duration: getDuration(ANIM_DURATION.bars + 100, reduceMotion),
        },
        (finished) => {
          if (finished) runOnJS(setBarsActive)(false);
        },
      );
    }, 3000);
  }, [barsOpacity, episodeDone, reduceMotion]);

  const hideBars = useCallback(() => {
    if (barsAnimTarget.current === 0) return;
    barsAnimTarget.current = 0;
    if (barsTimer.current) clearTimeout(barsTimer.current);
    barsOpacity.value = withTiming(
      0,
      {
        duration: getDuration(ANIM_DURATION.bars, reduceMotion),
      },
      (finished) => {
        if (finished) runOnJS(setBarsActive)(false);
      },
    );
  }, [barsOpacity, reduceMotion]);

  // 屏幕进入时显示一次栏
  useEffect(() => {
    showBars();
    return () => {
      if (barsTimer.current) clearTimeout(barsTimer.current);
    };
  }, [showBars]);

  const toggleSidebar = useCallback(() => {
    const toOpen = !sidebarOpen;
    setSidebarOpen(toOpen);
    const dur = getDuration(ANIM_DURATION.sidebar, reduceMotion);
    sidebarAnim.value = withTiming(toOpen ? 1 : 0, {
      duration: dur,
      easing: Easing.out(Easing.cubic),
    });
    overlayAnim.value = withTiming(toOpen ? 1 : 0, {
      duration: dur,
    });
  }, [sidebarOpen, sidebarAnim, overlayAnim, reduceMotion]);

  const loadEp = useCallback(
    async (epNum: number, msgIdx: number) => {
      setLoading(true);
      setEpisodeDone(false);
      clickedCountsRef.current = {};
      hasInitialScrolled.current = false;
      cancelAnimation(dictAnim);
      dictAnim.value = 0;
      setDictWord(null);
      const ep = await loadEpisode(workId, epNum);
      setEpisode(ep);
      setCurrentEp(epNum);
      setCurrentMsg(msgIdx);
      if (ep && msgIdx > ep.messages.length) setEpisodeDone(true);
      setLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workId],
  );

  useEffect(() => {
    async function init() {
      const w = await getWork(workId);
      setWork(w);
      const { getProgress } = await import('@/src/db/progress');
      const p = await getProgress(workId);
      const fs = await getSetting('font_size');
      const rm = await getSetting('reading_mode');
      setFontScale(FONT_SCALES[(fs as FontSize) || 'medium']);
      setReadingMode((rm as ReadingMode) || 'chat');
      await loadEp(p?.current_ep ?? 1, p?.current_msg ?? 0);
    }
    init();
  }, [workId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    setPlainText(null);
    loadPlainText(workId)
      .then((text) => {
        if (!cancelled) setPlainText(text);
      })
      .catch((e) => {
        console.error('[Reader] Load plain text:', (e as Error)?.message ?? String(e));
        if (!cancelled) setPlainText(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workId]);

  useEffect(() => {
    let cancelled = false;

    async function loadEpisodeTitles() {
      if (!work) {
        setEpisodeTitles({});
        return;
      }
      const titles: Record<number, string> = {};
      for (let epNum = 1; epNum <= work.total_eps; epNum++) {
        const ep = await loadEpisode(workId, epNum);
        titles[epNum] = ep?.meta.title ?? '';
      }
      if (!cancelled) setEpisodeTitles(titles);
    }

    loadEpisodeTitles().catch((e) => {
      console.error('[Reader] Load episode titles:', (e as Error)?.message ?? String(e));
      if (!cancelled) setEpisodeTitles({});
    });

    return () => {
      cancelled = true;
    };
  }, [work, workId]);

  useEffect(() => {
    if (episodeDone && !isRevealing.current) {
      showBars();
    }
  }, [episodeDone, showBars]);

  useEffect(() => {
    if (!episodeDone || !episode || work?.source !== 'user') return;

    const key = `${workId}:${episode.meta.ep}`;
    if (submittedEpisodeLogs.current.has(key)) return;

    const log = buildEpisodeReadingLog(episode, clickedCountsRef.current);
    if (log.word_logs.length === 0) return;

    submittedEpisodeLogs.current.add(key);
    (async () => {
      try {
        await completeLocalEpisode(workId, log);
      } catch (e) {
        console.warn('[Reader] Complete local episode:', e);
      }
    })();
  }, [episodeDone, episode, work?.source, workId]);

  const saveProgress = useCallback(
    async (msgIdx: number) => {
      try {
        await updateProgress(workId, {
          current_ep: currentEp,
          current_msg: msgIdx,
        });
      } catch (e) {
        console.error('[Reader] Save progress:', (e as Error)?.message ?? String(e));
      }
    },
    [workId, currentEp],
  );

  const scrollToLatest = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: !reduceMotion });
  }, [reduceMotion]);

  const handleTap = useCallback(() => {
    if (dictWord) {
      hideDictPanel();
      return;
    }
    if (!episode || episodeDone) return;
    const next = currentMsg + 1;
    if (next > episode.messages.length) {
      saveProgress(next);
      isRevealing.current = true;
      const vocabCount = episode.vocab.length;
      const cardH = 148 + vocabCount * 33 + 56;
      pendingRevealScroll.current = cardH;
      setRevealSpacer(cardH);
      return;
    }
    setCurrentMsg(next);
    saveProgress(next);
    setTimeout(() => {
      scrollToLatest();
      barsOpacity.value = 0;
      barsAnimTarget.current = 0;
      if (barsTimer.current) { clearTimeout(barsTimer.current); barsTimer.current = null; }
    }, reduceMotion ? 0 : 80);
  }, [
    dictWord,
    episode,
    currentMsg,
    episodeDone,
    saveProgress,
    hideDictPanel,
    scrollToLatest,
    barsOpacity,
    reduceMotion,
  ]);

  const handleTouchStart = useCallback((e: any) => {
    touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    wordWasTapped.current = false;
    didScroll.current = false;
  }, []);

  const handleTouchMove = useCallback((e: any) => {
    if (!touchStart.current) return;
    const dy = e.nativeEvent.pageY - touchStart.current.y;
    if (dy > SWIPE_THRESHOLD || dy < -SWIPE_THRESHOLD) {
      didScroll.current = true;
      if (dy > SWIPE_THRESHOLD) showBars();
      else hideBars();
      touchStart.current = null;
    }
  }, [showBars, hideBars]);

  const handleTouchEnd = useCallback(
    (e: any) => {
      if (!touchStart.current || wordWasTapped.current) {
        touchStart.current = null;
        return;
      }
      const dy = e.nativeEvent.pageY - (touchStart.current?.y ?? e.nativeEvent.pageY);
      const dx = Math.abs(e.nativeEvent.pageX - (touchStart.current?.x ?? e.nativeEvent.pageX));
      // Swipe on release
      if (dy > SWIPE_THRESHOLD) showBars();
      else if (dy < -SWIPE_THRESHOLD) {
        const atBottom = scrollOffset.current >= Math.max(0, contentHeight.current - layoutHeight.current) - 2;
        if (atBottom) showBars();
        else hideBars();
      }
      // Tap: no scroll and small movement
      if (!didScroll.current && Math.abs(dx) < TAP_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
        setTimeout(() => {
          if (!wordWasTapped.current) handleTap();
        }, 0);
      }
      touchStart.current = null;
    },
    [handleTap, showBars, hideBars],
  );

  const handleWordTapped = useCallback(
    (word: string, _definition: string, mark?: Mark) => {
      wordWasTapped.current = true;
      if (mark?.item_id) {
        clickedCountsRef.current[mark.item_id] =
          (clickedCountsRef.current[mark.item_id] ?? 0) + 1;
      }
      hideBars();
      showDictPanel(word);
    },
    [hideBars, showDictPanel],
  );

  const handleExpandWord = useCallback(
    (word: string) => {
      wordWasTapped.current = true;
      showDictPanel(word);
    },
    [showDictPanel],
  );

  const handleAvatarPress = useCallback(
    async (characterName: string) => {
      wordWasTapped.current = true;
      avatarCharRef.current = characterName;
      const hasCustom = await checkCustomAvatarExists(
        getCustomAvatarUri(workId, characterName),
      );
      const actions: ActionItem[] = [];
      if (hasCustom) {
        actions.push({
          text: '恢复默认头像',
          destructive: true,
          onPress: async () => {
            await deleteCustomAvatar(workId, characterName);
            setAvatarVersion((v) => v + 1);
          },
        });
      }
      actions.push({
        text: '自定义头像',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets?.[0]) {
            await saveCustomAvatar(workId, characterName, result.assets[0].uri);
            setAvatarVersion((v) => v + 1);
          }
        },
      });
      setAvatarActions(actions);
      setAvatarSheetVisible(true);
    },
    [workId],
  );

  const goToEpisode = useCallback(
    async (epNum: number) => {
      if (!work || epNum < 1 || epNum > work.total_eps) return;
      await updateProgress(workId, {
        current_ep: currentEp,
        current_msg: currentMsg,
      });
      await loadEp(epNum, 0);
    },
    [work, workId, currentEp, currentMsg, loadEp],
  );

  const { newWords, reviewWords } = useMemo(() => {
    const nw = episode?.vocab.filter((v) => v.is_new) ?? [];
    const rw = episode?.vocab.filter((v) => !v.is_new) ?? [];
    return { newWords: nw, reviewWords: rw };
  }, [episode?.vocab]);

  // 集末面板出现时自动滚动到底部
  useEffect(() => {
    if (episodeDone) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [episodeDone]);

  // Android 系统返回：先关面板/侧边栏
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (dictWord) {
        hideDictPanel();
        return true;
      }
      if (sidebarOpen) {
        toggleSidebar();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [dictWord, sidebarOpen, hideDictPanel, toggleSidebar]);

  // FlatList 可见消息：按 currentMsg 截断（不渲染未到达的消息）
  const visibleMessages = useMemo(
    () => (episode ? episode.messages.slice(0, currentMsg) : []),
    [episode, currentMsg],
  );

  const isNewSpeaker = useCallback(
    (msg: Message, index: number): boolean => {
      if (index === 0) return false;
      const prev = visibleMessages[index - 1];
      if (!prev) return false;
      if (prev.type !== 'dialogue' || msg.type !== 'dialogue') return false;
      return prev.name !== msg.name;
    },
    [visibleMessages],
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Message>) => (
      <AnimatedMessage>
        <MessageRenderer
          message={item}
          workId={workId}
          fontScale={fontScale}
          isNewSpeaker={isNewSpeaker(item, index)}
          onWordTap={handleWordTapped}
          onAvatarPress={handleAvatarPress}
          avatarVersion={avatarVersion}
        />
      </AnimatedMessage>
    ),
    [workId, fontScale, isNewSpeaker, handleWordTapped, handleAvatarPress, avatarVersion],
  );

  const keyExtractor = useCallback(
    (_item: Message, index: number) => `ep${currentEp}-msg${index}`,
    [currentEp],
  );

  const initialRenderCount = Math.max(1, visibleMessages.length);

  const scrollToRestoredPosition = useCallback(() => {
    if (hasInitialScrolled.current || currentMsg <= 0) return;
    if (!flatListRef.current || layoutHeight.current === 0 || contentHeight.current === 0) return;

    hasInitialScrolled.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      });
    });
  }, [currentMsg]);

  // 动画样式
  const screenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: screenAnim.value }],
  }));

  const topBarStyle = useAnimatedStyle(() => ({
    opacity: barsOpacity.value,
  }));

  const dictWrapperStyle = useAnimatedStyle(() => ({
    opacity: dictAnim.value,
    transform: [
      {
        translateY: -30 + dictAnim.value * 30 + barsOpacity.value * TOP_BAR_OFFSET,
      },
    ],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayAnim.value,
  }));

  const sidebarStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: -SIDEBAR_WIDTH + sidebarAnim.value * SIDEBAR_WIDTH,
      },
    ],
  }));

  const bottomBarStyle = useAnimatedStyle(() => ({
    opacity: barsOpacity.value,
  }));

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!episode) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.statusBar}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Ionicons
              name="chevron-back"
              size={20}
              color={Colors.secondary}
            />
            <Text style={styles.backButtonText}>书架</Text>
          </Pressable>
          <Text style={styles.title}>{work?.title ?? workId}</Text>
          <Text style={styles.episodeLabel}>Ep.{currentEp}</Text>
        </View>
        <View style={styles.centered}>
          <Text style={styles.loadingText}>无法加载本集内容</Text>
        </View>
      </SafeAreaView>
    );
  }

  const totalEps = work?.total_eps ?? 1;
  const progress =
    episode.messages.length > 0 ? (currentMsg / episode.messages.length) * 100 : 0;

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.animatedContent, screenStyle]}>
        {/* Progress bar: 规范 2px */}
        {readingMode === 'chat' && (
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(progress, 100)}%` },
              ]}
            />
          </View>
        )}

        {/* Top bar */}
        <Animated.View
          style={[styles.topBarOverlay, topBarStyle]}
          pointerEvents={barsActive ? 'box-none' : 'none'}
        >
          <View style={styles.statusBar}>
            <Pressable
              style={styles.backButton}
              onPress={() => router.back()}
              hitSlop={12}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={Colors.secondary}
              />
              <Text style={styles.backButtonText}>书架</Text>
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>
              {episode.meta.title}
            </Text>
            <View style={{ width: 50 }} />
          </View>
        </Animated.View>

        {/* Dictionary panel */}
        {dictWord && (
          <Animated.View style={[styles.dictWrapper, dictWrapperStyle]}>
            <DictionaryPanel word={dictWord} onClose={hideDictPanel} />
          </Animated.View>
        )}

        {/* Chat mode */}
        {readingMode === 'chat' && (
          <View style={styles.tapContainer}>
            <FlatList
              ref={flatListRef}
              style={styles.scrollView}
              data={visibleMessages}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              initialNumToRender={initialRenderCount}
              maxToRenderPerBatch={initialRenderCount}
              removeClippedSubviews={false}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              overScrollMode="always"
              alwaysBounceVertical
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onContentSizeChange={(_w, h) => {
                contentHeight.current = h;
                scrollToRestoredPosition();
                if (pendingRevealScroll.current > 0) {
                  pendingRevealScroll.current = 0;
                  flatListRef.current?.scrollToOffset({
                    offset: Math.max(0, h - layoutHeight.current),
                    animated: !reduceMotion,
                  });
                  requestAnimationFrame(() => {
                    isRevealing.current = false;
                    showBars();
                  });
                  setRevealSpacer(0);
                  setEpisodeDone(true);
                }
              }}
              onLayout={(e) => {
                layoutHeight.current = e.nativeEvent.layout.height;
                scrollToRestoredPosition();
              }}
              onScroll={(e) => {
                scrollOffset.current = e.nativeEvent.contentOffset.y;
                lastScrollY.current = e.nativeEvent.contentOffset.y;
              }}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>点击屏幕任意位置继续阅读</Text>
                </View>
              }
              ListFooterComponent={
                episodeDone ? (
                  <EpisodeEndPanel
                    vocabCount={episode.vocab.length}
                    newWords={newWords}
                    reviewWords={reviewWords}
                    onExpandWord={handleExpandWord}
                  />
                ) : revealSpacer > 0 ? (
                  <View style={{ height: revealSpacer }} />
                ) : (
                  <View style={{ height: 200 }} />
                )
              }
              onEndReached={() => {
                if (episodeDone && !bottomBarsShown.current) {
                  bottomBarsShown.current = true;
                  showBars();
                }
              }}
              onEndReachedThreshold={0.1}
            />
          </View>
        )}

        {/* Paragraph mode */}
        {readingMode === 'paragraph' && (
          <PlainTextReader
            text={plainText ?? 'Chapter not found'}
            fontSize={13 * fontScale}
          />
        )}

        {/* Bottom bar */}
        {readingMode === 'chat' && (
          <Animated.View
            style={[styles.bottomBar, bottomBarStyle]}
            pointerEvents={barsActive ? 'box-none' : 'none'}
          >
            <Pressable
              style={styles.bottomBarSide}
              onPress={() => {
                if (currentEp > 1) goToEpisode(currentEp - 1);
                else if (episodeDone && currentEp === 1) router.back();
              }}
            >
              <Text
                style={[
                  styles.bottomBarArrow,
                  currentEp <= 1 && !episodeDone && styles.epNavDisabled,
                ]}
              >
                ‹
              </Text>
            </Pressable>
            <Pressable style={styles.bottomBarEpBtn} onPress={toggleSidebar}>
              <Text style={styles.bottomBarEpText}>
                Ep.{currentEp} / {totalEps}
              </Text>
            </Pressable>
            <Pressable
              style={styles.bottomBarSide}
              onPress={() => {
                if (currentEp >= totalEps && episodeDone) router.back();
                else if (currentEp < totalEps) goToEpisode(currentEp + 1);
              }}
            >
              <Text style={styles.bottomBarArrow}>›</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Sidebar */}
        {sidebarOpen && (
          <EpisodeSidebar
            currentEp={currentEp}
            totalEps={totalEps}
            titles={episodeTitles}
            overlayStyle={overlayStyle}
            sidebarStyle={sidebarStyle}
            onClose={toggleSidebar}
            onSelectEpisode={(epNum) => {
              goToEpisode(epNum);
              toggleSidebar();
            }}
          />
        )}
      </Animated.View>

      <ActionSheet
        visible={avatarSheetVisible}
        title="头像设置"
        actions={avatarActions}
        onClose={() => setAvatarSheetVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.mainBg },
  animatedContent: { flex: 1 },
  dictWrapper: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 200 },
  topBarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    backgroundColor: Colors.panelBg,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: Colors.panelBg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  backButton: {
    minWidth: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  backButtonText: { fontSize: 13, color: Colors.secondary },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.bodyText,
    flex: 1,
    textAlign: 'center',
  },
  episodeLabel: {
    fontSize: 11,
    color: Colors.secondary,
    minWidth: 50,
    textAlign: 'right',
    flexShrink: 1,
  },
  // 规范 2px
  progressBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 18,
    backgroundColor: 'transparent',
  },
  progressFill: { height: 2, backgroundColor: Colors.progressBar },
  tapContainer: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 50, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    minHeight: 300,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.secondary,
    fontFamily: 'Georgia',
  },
  loadingText: { fontSize: 14, color: Colors.secondary },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    backgroundColor: Colors.mainBg,
    paddingVertical: 2,
    zIndex: 10,
  },
  bottomBarSide: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: 48,
  },
  bottomBarArrow: { fontSize: 28, color: Colors.bodyText, lineHeight: 32 },
  bottomBarEpBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  bottomBarEpText: { fontSize: 15, color: Colors.bodyText, fontWeight: '500' },
  epNavDisabled: { color: Colors.divider },

});
