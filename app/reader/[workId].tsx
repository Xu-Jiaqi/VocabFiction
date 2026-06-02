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
  Platform,
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
import { loadPlainText } from '@/src/services/episode-loader';
import {
  saveCustomAvatar,
  deleteCustomAvatar,
  getCustomAvatarUri,
  checkCustomAvatarExists,
} from '@/src/services/character-loader';
import * as ImagePicker from 'expo-image-picker';
import type { Episode, Message } from '@/src/models/episode';
import type { Work } from '@/src/models/work';

const CARD_HEIGHT = 100;
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

  // Vocab popup — positioned near tapped word
  const [vocabPopup, setVocabPopup] = useState<{
    word: string;
    definition: string;
    x: number;
    y: number;
  } | null>(null);
  // Dictionary panel at top
  const [dictWord, setDictWord] = useState<string | null>(null);
  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [barsActive, setBarsActive] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [readingMode, setReadingMode] = useState<ReadingMode>('chat');

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
      hasInitialScrolled.current = false;
      setVocabPopup(null);
      cancelAnimation(dictAnim);
      dictAnim.value = 0;
      setDictWord(null);
      const ep = loadEpisode(workId, epNum);
      setEpisode(ep);
      setCurrentEp(epNum);
      setCurrentMsg(msgIdx);
      if (ep && msgIdx > ep.messages.length) setEpisodeDone(true);
      setLoading(false);
    },
    [workId, dictAnim],
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
  }, [workId, loadEp]);

  useEffect(() => {
    if (episodeDone && !isRevealing.current) {
      showBars();
    }
  }, [episodeDone, showBars]);

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
    if (!flatListRef.current || layoutHeight.current === 0) return;
    // 在 Reanimated 里用 withTiming 滚动（用 UI 线程 worklet）
    const target = Math.max(0, contentHeight.current - layoutHeight.current + 100);
    flatListRef.current.scrollToOffset({ offset: target, animated: !reduceMotion });
  }, [reduceMotion]);

  const handleTap = useCallback(() => {
    if (dictWord) {
      hideDictPanel();
      return;
    }
    if (vocabPopup) {
      setVocabPopup(null);
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
    vocabPopup,
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
    (word: string, definition: string) => {
      wordWasTapped.current = true;
      hideBars();
      const pos = touchStart.current;
      const x = pos?.x ?? 100;
      const y = pos?.y ?? 300;
      setVocabPopup({ word, definition, x, y });
      if (y < CARD_HEIGHT + 80) {
        const diff = CARD_HEIGHT + 80 - y;
        flatListRef.current?.scrollToOffset({
          offset: Math.max(0, (contentHeight.current - layoutHeight.current) - diff),
          animated: false,
        });
      }
    },
    [hideBars],
  );

  const handleExpandWord = useCallback(
    (word: string) => {
      wordWasTapped.current = true;
      setVocabPopup(null);
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
          onExpandWord={handleExpandWord}
          onAvatarPress={handleAvatarPress}
          avatarVersion={avatarVersion}
        />
      </AnimatedMessage>
    ),
    [workId, fontScale, isNewSpeaker, handleWordTapped, handleExpandWord, handleAvatarPress, avatarVersion],
  );

  const keyExtractor = useCallback(
    (_item: Message, index: number) => `ep${currentEp}-msg${index}`,
    [currentEp],
  );

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
        translateY: -30 + dictAnim.value * 30,
      },
    ],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayAnim.value,
  }));

  const sidebarStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: -220 + sidebarAnim.value * 220,
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
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backButton}>← 书架</Text>
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

  const cardOnRight = vocabPopup ? vocabPopup.x < screenWidth * 0.5 : true;
  const cardLeft = cardOnRight
    ? Math.max(8, Math.min(vocabPopup?.x ?? 100, screenWidth - 180))
    : undefined;
  const cardTop = vocabPopup ? Math.max(60, vocabPopup.y - CARD_HEIGHT - 8) : 0;

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
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.backButton}>← 书架</Text>
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
                if (!hasInitialScrolled.current && currentMsg > 0) {
                  hasInitialScrolled.current = true;
                  setTimeout(
                    () =>
                      flatListRef.current?.scrollToOffset({
                        offset: Math.max(0, h - layoutHeight.current),
                        animated: false,
                      }),
                    50,
                  );
                }
                if (pendingRevealScroll.current > 0) {
                  const cardH = pendingRevealScroll.current;
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
                  <View style={styles.endPanel}>
                    <Text style={styles.endTitle}>本集读完</Text>
                    <Text style={styles.endSubtitle}>
                      遇见 {episode.vocab.length} 个词
                    </Text>
                    <View style={styles.endColumns}>
                      {/* 新词 */}
                      <View style={styles.endColumn}>
                        <Text style={styles.endColumnTitle}>新词</Text>
                        {newWords.length > 0 ? (
                          newWords.map((item, i) => (
                            <Pressable
                              key={`end-new-${i}`}
                              style={({ pressed }) => [
                                styles.vocabRow,
                                pressed && { backgroundColor: Colors.pressedOverlay },
                              ]}
                              onPress={() => handleExpandWord(item.word)}
                            >
                              <Text style={styles.vocabRowNew} numberOfLines={1}>
                                {item.word}
                                <Text style={styles.vocabRowDef}>
                                  {'  '}
                                  {item.definition}
                                </Text>
                              </Text>
                            </Pressable>
                          ))
                        ) : (
                          <View style={styles.endPlaceholder}>
                            <Text style={styles.endPlaceholderText}>本集无新词</Text>
                          </View>
                        )}
                      </View>
                      {/* 旧词 */}
                      <View style={styles.endColumn}>
                        <Text style={styles.endColumnTitle}>旧词</Text>
                        {reviewWords.length > 0 ? (
                          reviewWords.map((item, i) => (
                            <Pressable
                              key={`end-review-${i}`}
                              style={({ pressed }) => [
                                styles.vocabRow,
                                pressed && { backgroundColor: Colors.pressedOverlay },
                              ]}
                              onPress={() => handleExpandWord(item.word)}
                            >
                              <Text style={styles.vocabRowReview} numberOfLines={1}>
                                {item.word}
                              </Text>
                            </Pressable>
                          ))
                        ) : (
                          <View style={styles.endPlaceholder}>
                            <Text style={styles.endPlaceholderText}>本集无旧词</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
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
            text={loadPlainText(workId) ?? 'Chapter not found'}
            fontSize={13 * fontScale}
          />
        )}

        {/* Vocab popup */}
        {vocabPopup && (
          <View style={styles.vocabPopupOverlay} pointerEvents="box-none">
            <Pressable
              style={styles.vocabPopupBackdrop}
              onPress={() => setVocabPopup(null)}
            />
            <Pressable
              style={({ pressed }) => [
                styles.vocabPopupCard,
                cardOnRight
                  ? { left: cardLeft, top: Math.max(60, cardTop) }
                  : { right: 8, top: Math.max(60, cardTop) },
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => handleExpandWord(vocabPopup.word)}
            >
              <Text style={styles.vocabPopupWord}>{vocabPopup.word}</Text>
              <Text style={styles.vocabPopupDef}>{vocabPopup.definition}</Text>
            </Pressable>
          </View>
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
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            pointerEvents="box-none"
          >
            <Animated.View style={[styles.overlay, overlayStyle]}>
              <Pressable
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                }}
                onPress={toggleSidebar}
              />
            </Animated.View>
            <Animated.View style={[styles.sidebar, sidebarStyle]}>
              <View style={styles.sidebarHeader}>
                <Text style={styles.sidebarTitle}>选集</Text>
                <Pressable
                  onPress={toggleSidebar}
                  hitSlop={12}
                  style={({ pressed }) => [
                    styles.sidebarCloseBtn,
                    pressed && { backgroundColor: Colors.pressedOverlay },
                  ]}
                >
                  <Text style={styles.sidebarClose}>✕</Text>
                </Pressable>
              </View>
              <FlatList
                style={styles.sidebarList}
                data={Array.from({ length: totalEps }, (_, i) => i + 1)}
                keyExtractor={(n) => `ep-${n}`}
                renderItem={({ item: epNum }) => (
                  <Pressable
                    style={({ pressed }) => [
                      styles.sidebarItem,
                      epNum === currentEp && styles.sidebarItemActive,
                      pressed && { backgroundColor: Colors.pressedOverlay },
                    ]}
                    onPress={() => {
                      goToEpisode(epNum);
                      toggleSidebar();
                    }}
                  >
                    <Text
                      style={[
                        styles.sidebarItemText,
                        epNum === currentEp && styles.sidebarItemTextActive,
                      ]}
                    >
                      Ep.{epNum}
                    </Text>
                    <Text style={styles.sidebarItemTitle} numberOfLines={1}>
                      {loadEpisode(workId, epNum)?.meta.title ?? ''}
                    </Text>
                  </Pressable>
                )}
              />
            </Animated.View>
          </View>
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
    backgroundColor: Colors.mainBg,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  backButton: { fontSize: 13, color: Colors.secondary, minWidth: 50 },
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
  // Vocab popup
  vocabPopupOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  vocabPopupBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  vocabPopupCard: {
    position: 'absolute',
    backgroundColor: Colors.panelBg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    shadowColor: '#2C2416',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    minWidth: 150,
  },
  vocabPopupWord: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.bodyText,
    marginBottom: 2,
  },
  vocabPopupDef: { fontSize: 14, color: Colors.secondary, marginBottom: 6 },
  // End panel
  endPanel: {
    backgroundColor: Colors.panelBg,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginTop: 24,
    marginHorizontal: 12,
    marginBottom: 80,
  },
  endTitle: { fontSize: 14, color: Colors.secondary, marginBottom: 4 },
  endSubtitle: {
    fontSize: 18,
    color: Colors.bodyText,
    fontFamily: 'Georgia',
    marginBottom: 16,
  },
  vocabListInline: { width: '100%', marginTop: 12 },
  endColumns: { flexDirection: 'row', gap: 12, marginTop: 12 },
  endColumn: { flex: 1 },
  endColumnTitle: { fontSize: 13, color: Colors.secondary, marginBottom: 8 },
  endPlaceholder: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: 8,
    borderStyle: 'dashed',
  },
  endPlaceholderText: { fontSize: 13, color: Colors.secondary },
  vocabRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    height: 44,
    justifyContent: 'center',
    borderRadius: 6,
    overflow: 'hidden',
  },
  vocabRowNew: {
    fontSize: 15,
    color: Colors.bodyText,
    fontFamily: 'Georgia',
  },
  vocabRowReview: {
    fontSize: 15,
    color: Colors.bodyText,
    fontWeight: '600',
    fontFamily: 'Georgia',
  },
  vocabRowDef: { fontSize: 13, color: Colors.definition, fontWeight: '400' },
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
  // Sidebar
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.scrim,
    zIndex: 300,
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 260,
    backgroundColor: Colors.mainBg,
    zIndex: 301,
    paddingTop: 50,
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  sidebarTitle: { fontSize: 16, color: Colors.bodyText, fontWeight: '500' },
  sidebarCloseBtn: {
    padding: 8,
    borderRadius: 6,
  },
  sidebarClose: { fontSize: 18, color: Colors.secondary },
  sidebarList: { flex: 1 },
  sidebarItem: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    justifyContent: 'center',
  },
  sidebarItemActive: { backgroundColor: Colors.leftBubble },
  sidebarItemText: { fontSize: 14, color: Colors.bodyText, fontWeight: '500' },
  sidebarItemTextActive: { color: Colors.bodyText },
  sidebarItemTitle: { fontSize: 12, color: Colors.secondary, marginTop: 2 },
});
