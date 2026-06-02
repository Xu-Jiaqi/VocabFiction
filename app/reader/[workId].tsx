import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Animated, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/src/theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loadEpisode, loadPlainText } from '@/src/services/episode-loader';
import { markEpisodeRead, moveToEpisode, saveMessageProgress } from '@/src/services/reading-progress';
import { getWork } from '@/src/db/works';
import { getSetting } from '@/src/db/settings';
import { FONT_SCALES } from '@/src/models/setting';
import type { FontSize, ReadingMode } from '@/src/models/setting';
import { MessageRenderer } from '@/src/components/MessageRenderer';
import { AnimatedMessage } from '@/src/components/AnimatedMessage';
import { DictionaryPanel } from '@/src/components/DictionaryPanel';
import { PlainTextReader } from '@/src/components/PlainTextReader';
import { EpisodeSidebar } from '@/src/components/EpisodeSidebar';
import { saveCustomAvatar, deleteCustomAvatar, getCustomAvatarUri, checkCustomAvatarExists } from '@/src/services/character-loader';
import * as ImagePicker from 'expo-image-picker';
import type { Episode } from '@/src/models/episode';
import type { Work } from '@/src/models/work';

const TAP_THRESHOLD = 5;
const SWIPE_THRESHOLD = 6;
const CARD_HEIGHT = 100;

export default function ReaderScreen() {
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const router = useRouter();

  const [work, setWork] = useState<Work | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [plainText, setPlainText] = useState<string | null>(null);
  const [episodeTitles, setEpisodeTitles] = useState<Record<number, string>>({});
  const [currentEp, setCurrentEp] = useState(1);
  const [currentMsg, setCurrentMsg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [episodeDone, setEpisodeDone] = useState(false);
  const [revealSpacer, setRevealSpacer] = useState(0); // temp spacer to enable pre-render scroll
  const [avatarVersion, setAvatarVersion] = useState(0);

  // Vocab popup — positioned near tapped word
  const [vocabPopup, setVocabPopup] = useState<{
    word: string; definition: string; x: number; y: number;
  } | null>(null);
  // Dictionary panel at top
  const [dictWord, setDictWord] = useState<string | null>(null);
  const dictAnim = useRef(new Animated.Value(0)).current;

  const showDictPanel = useCallback((word: string) => {
    setDictWord(word);
    Animated.timing(dictAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  }, [dictAnim]);

  const hideDictPanel = useCallback(() => {
    Animated.timing(dictAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setDictWord(null);
    });
  }, [dictAnim]);

  const scrollViewRef = useRef<ScrollView>(null);
  const prevMsgCount = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const wordWasTapped = useRef(false);
  const scrollOffset = useRef(0);
  const lastScrollOffset = useRef(0);
  const contentHeight = useRef(0);
  const layoutHeight = useRef(0);
  const scrollFrame = useRef<number | null>(null);
  const isAutoScrolling = useRef(false);
  const screenAnim = useRef(new Animated.Value(Dimensions.get('window').width)).current;
  const [fontScale, setFontScale] = useState(1);
  const [readingMode, setReadingMode] = useState<ReadingMode>('chat');
  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAnim = useRef(new Animated.Value(0)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  // Bar visibility: 1 = visible, 0 = hidden
  const barsOpacity = useRef(new Animated.Value(0)).current;
  const barsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRevealing = useRef(false);
  const pendingRevealScroll = useRef(0);
  const bottomBarsShown = useRef(false);
  const scrollDir = useRef<'up'|'down'|null>(null);
  const dirChangeAt = useRef(0);

  const barsAnimTarget = useRef<0|1>(0);
  const topBarStyle = useMemo(() => [styles.topBarOverlay, { opacity: barsOpacity }], []);
  const [barsActive, setBarsActive] = useState(false);

  const showBars = useCallback(() => {
    if (barsAnimTarget.current === 1) return;
    barsAnimTarget.current = 1;
    setBarsActive(true);
    Animated.timing(barsOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (barsTimer.current) clearTimeout(barsTimer.current);
    if (episodeDone) return;
    barsTimer.current = setTimeout(() => {
      barsAnimTarget.current = 0;
      Animated.timing(barsOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setBarsActive(false);
      });
    }, 3000);
  }, [barsOpacity, episodeDone]);

  const hideBars = useCallback(() => {
    if (barsAnimTarget.current === 0) return;
    barsAnimTarget.current = 0;
    if (barsTimer.current) clearTimeout(barsTimer.current);
    Animated.timing(barsOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setBarsActive(false);
    });
  }, [barsOpacity]);

  // Show bars initially
  useEffect(() => { showBars(); return () => { if (barsTimer.current) clearTimeout(barsTimer.current); }; }, [showBars]);

  const toggleSidebar = useCallback(() => {
    const toOpen = !sidebarOpen;
    setSidebarOpen(toOpen);
    Animated.parallel([
      Animated.timing(sidebarAnim, { toValue: toOpen ? 1 : 0, duration: 220, useNativeDriver: true }),
      Animated.timing(overlayAnim, { toValue: toOpen ? 1 : 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [sidebarOpen, sidebarAnim, overlayAnim]);

  // Screen entrance animation: slide in from right
  useEffect(() => {
    Animated.timing(screenAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Smooth scroll with custom ease-out duration
  const smoothScrollTo = useCallback((targetY: number, duration = 500, onComplete?: () => void) => {
    isAutoScrolling.current = true;
    const startY = scrollOffset.current;
    const startTime = Date.now();
    if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current);
    const step = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startY + (targetY - startY) * eased;
      scrollViewRef.current?.scrollTo({ y: current, animated: false });
      if (progress < 1) {
        scrollFrame.current = requestAnimationFrame(step);
      } else {
        isAutoScrolling.current = false;
        onComplete?.();
      }
    };
    scrollFrame.current = requestAnimationFrame(step);
  }, []);

  const loadEp = useCallback(async (epNum: number, msgIdx: number) => {
    setLoading(true);
    setEpisodeDone(false);
    hasInitialScrolled.current = false;
    setVocabPopup(null);
    dictAnim.setValue(0);
    setDictWord(null);
    const ep = await loadEpisode(workId, epNum);
    setEpisode(ep);
    setCurrentEp(epNum);
    setCurrentMsg(msgIdx);
    if (ep && msgIdx > ep.messages.length) setEpisodeDone(true);
    setLoading(false);
  }, [workId]);

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
      setPlainText(await loadPlainText(workId));
      await loadEp(p?.current_ep ?? 1, p?.current_msg ?? 0);
    }
    init();
  }, [workId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!work) return;
    const totalEpisodeCount = work.total_eps;
    let cancelled = false;
    async function loadTitles() {
      const entries = await Promise.all(
        Array.from({ length: totalEpisodeCount }, async (_, i) => {
          const epNum = i + 1;
          const ep = await loadEpisode(workId, epNum);
          return [epNum, ep?.meta.title ?? ''] as const;
        })
      );
      if (!cancelled) setEpisodeTitles(Object.fromEntries(entries));
    }
    loadTitles();
    return () => { cancelled = true; };
  }, [work, workId]);

  useEffect(() => { prevMsgCount.current = currentMsg; }, [currentEp]);
  // Show bars and keep them visible when episode is done
  // Skip during tap-to-reveal sequence — bars are shown after scroll completes
  useEffect(() => {
    if (episodeDone && !isRevealing.current) {
      showBars();
    }
  }, [episodeDone, barsOpacity, showBars]);

  const saveProgress = useCallback(async (msgIdx: number) => {
    try { await saveMessageProgress(workId, currentEp, msgIdx); }
    catch (e) { console.error('[Reader] Save progress:', (e as Error)?.message ?? String(e)); }
  }, [workId, currentEp]);

  const handleTap = useCallback(() => {
    if (dictWord) { hideDictPanel(); return; }
    if (vocabPopup) { setVocabPopup(null); return; }
    if (!episode || episodeDone) return;
    const next = currentMsg + 1;
    // Last message shown, one more tap to reveal end panel
    // Sequence: scroll → render card → show bars (all sequential)
    if (next > episode.messages.length) {
      void markEpisodeRead(workId, currentEp, next, work?.total_eps ?? currentEp);
      isRevealing.current = true;
      const vocabCount = episode.vocab.length;
      const cardH = 148 + vocabCount * 33 + 56;
      pendingRevealScroll.current = cardH;
      setRevealSpacer(cardH); // triggers re-render → onContentSizeChange → scroll → render card
      return;
    }
    setCurrentMsg(next);
    saveProgress(next);
    setTimeout(() => {
      const target = Math.max(0, contentHeight.current - layoutHeight.current + 100);
      smoothScrollTo(target, 500, () => {
        barsOpacity.setValue(0);
      });
    }, 80);
  }, [dictWord, vocabPopup, episode, currentMsg, episodeDone, saveProgress, hideDictPanel, smoothScrollTo, barsOpacity]);

  const didScroll = useRef(false);
  const hasInitialScrolled = useRef(false);

  const handleTouchStart = useCallback((e: any) => {
    touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    wordWasTapped.current = false;
    didScroll.current = false;
  }, []);

  const handleTouchMove = useCallback((e: any) => {
    if (!touchStart.current) return;
    const dy = e.nativeEvent.pageY - touchStart.current.y;
    const atBottom = episodeDone && scrollOffset.current >= Math.max(0, contentHeight.current - layoutHeight.current) - 2;
    if (dy > SWIPE_THRESHOLD || dy < -SWIPE_THRESHOLD) {
      if (dy > SWIPE_THRESHOLD) showBars();
      else if (atBottom) showBars();
      else hideBars();
      touchStart.current = null;
    }
  }, [showBars, episodeDone]);

  const handleTouchEnd = useCallback((e: any) => {
    if (!touchStart.current || wordWasTapped.current) { touchStart.current = null; return; }
    const dy = e.nativeEvent.pageY - touchStart.current.y;
    const dx = Math.abs(e.nativeEvent.pageX - touchStart.current.x);
    if (dy > SWIPE_THRESHOLD) showBars();
    else if (dy < -SWIPE_THRESHOLD) {
      const atBottomEnd = episodeDone && scrollOffset.current >= Math.max(0, contentHeight.current - layoutHeight.current) - 2;
      if (atBottomEnd) showBars();
      else hideBars();
    }
    if (!didScroll.current && Math.abs(dx) < TAP_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
      setTimeout(() => { if (!wordWasTapped.current) handleTap(); }, 0);
    }
    touchStart.current = null;
  }, [handleTap, showBars, episodeDone]);

  // Word tap → show popup at the touch position (reliable, no element measurement needed)
  const handleWordTapped = useCallback((word: string, definition: string) => {
    wordWasTapped.current = true;
    hideBars();
    const pos = touchStart.current;
    const x = pos?.x ?? 100;
    const y = pos?.y ?? 300;
    setVocabPopup({ word, definition, x, y });
    if (y < CARD_HEIGHT + 80) {
      const diff = CARD_HEIGHT + 80 - y;
      scrollViewRef.current?.scrollTo({ y: scrollOffset.current - diff, animated: false });
    }
  }, [hideBars]);

  const handleExpandWord = useCallback((word: string, scroll = true) => {
    wordWasTapped.current = true;
    setVocabPopup(null);
    showDictPanel(word);
    if (scroll) {
      const target = scrollOffset.current + 60;
      smoothScrollTo(target, 400);
    }
  }, [showDictPanel, smoothScrollTo]);

  const handleAvatarPress = useCallback(async (characterName: string) => {
    wordWasTapped.current = true;
    const hasCustom = await checkCustomAvatarExists(getCustomAvatarUri(workId, characterName));
    const options: { text: string; onPress?: () => void }[] = [
      { text: '自定义头像', onPress: async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
        if (!result.canceled && result.assets?.[0]) {
          await saveCustomAvatar(workId, characterName, result.assets[0].uri);
          setAvatarVersion(v => v + 1);
        }
      }},
    ];
    if (hasCustom) {
      options.unshift({ text: '恢复默认头像', onPress: async () => {
        await deleteCustomAvatar(workId, characterName);
        setAvatarVersion(v => v + 1);
      }});
    }
    options.push({ text: '取消' });
    Alert.alert('头像设置', undefined, options);
  }, [workId]);

  const goToEpisode = useCallback(async (epNum: number) => {
    if (!work || epNum < 1 || epNum > work.total_eps) return;
    await moveToEpisode(workId, epNum, work.total_eps);
    prevMsgCount.current = 0;
    scrollOffset.current = 0;
    await loadEp(epNum, 0);
  }, [work, workId, currentEp, currentMsg, loadEp]);

  const handleContinue = useCallback(async () => {
    if (!work) return;
    const nextEp = currentEp + 1;
    if (nextEp > work.total_eps) {
      await markEpisodeRead(workId, currentEp, (episode?.messages.length ?? 0) + 1, work.total_eps);
      router.back();
      return;
    }
    await goToEpisode(nextEp);
  }, [work, currentEp, workId, episode, router, goToEpisode]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}><Text style={styles.loadingText}>Loading...</Text></View>
      </SafeAreaView>
    );
  }

  if (!episode) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.statusBar}>
          <TouchableOpacity onPress={() => router.back()}><Text style={styles.backButton}>← 书架</Text></TouchableOpacity>
          <Text style={styles.title}>{work?.title ?? workId}</Text>
          <Text style={styles.episodeLabel}>Ep.{currentEp}</Text>
        </View>
        <View style={styles.centered}><Text style={styles.loadingText}>无法加载本集内容</Text></View>
      </SafeAreaView>
    );
  }

  const visibleMessages = episode.messages.slice(0, currentMsg);
  const totalEps = work?.total_eps ?? 1;
  const progress = episode.messages.length > 0 ? (currentMsg / episode.messages.length) * 100 : 0;

  const screenWidth = Dimensions.get('window').width;

  // Popup card: position near word, flip to left side if word is on right half
  const cardOnRight = vocabPopup ? vocabPopup.x < screenWidth * 0.5 : true;
  const cardLeft = cardOnRight
    ? Math.max(8, Math.min(vocabPopup?.x ?? 100, screenWidth - 180))
    : undefined;
  const cardTop = vocabPopup ? Math.max(60, vocabPopup.y - CARD_HEIGHT - 8) : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Swipe-up strip at top: detects upward swipe when bars hidden */}
      <Animated.View
        style={[styles.animatedContent, { transform: [{ translateX: screenAnim }] }]}>
      {/* Progress bar: always at very top */}
      {readingMode === 'chat' && (
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
      </View>
      )}

      {/* Top bar: absolute, animated, overlays reading area */}
      <Animated.View
        style={topBarStyle}
        pointerEvents={barsActive ? 'box-none' : 'none'}
      >
        <View style={styles.statusBar}>
          <TouchableOpacity onPress={() => router.back()}><Text style={styles.backButton}>← 书架</Text></TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{episode.meta.title}</Text>
          <View style={{ width: 50 }} />
        </View>
      </Animated.View>

      {/* Dictionary panel */}
      {dictWord && (
        <Animated.View style={[styles.dictWrapper, {
          opacity: dictAnim,
          transform: [{
            translateY: Animated.add(
              dictAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }),
              barsOpacity.interpolate({ inputRange: [0, 1], outputRange: [0, 48] })
            ),
          }],
        }]}>
          <DictionaryPanel word={dictWord} onClose={hideDictPanel} />
        </Animated.View>
      )}


      {/* Chat mode */}
      {readingMode === 'chat' && (
      <View style={styles.tapContainer}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          overScrollMode="always"
          alwaysBounceVertical
          scrollEventThrottle={16}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onContentSizeChange={(w, h) => {
            contentHeight.current = h;
            // Initial scroll to latest messages on re-enter
            if (!hasInitialScrolled.current && currentMsg > 0) {
              hasInitialScrolled.current = true;
              const target = Math.max(0, h - layoutHeight.current);
              setTimeout(() => scrollViewRef.current?.scrollTo({ y: target, animated: false }), 50);
            }
            if (pendingRevealScroll.current > 0) {
              const cardH = pendingRevealScroll.current;
              pendingRevealScroll.current = 0;
              const target = Math.max(0, h - layoutHeight.current);
              smoothScrollTo(target, 400, () => {
                setRevealSpacer(0);
                setEpisodeDone(true);
                requestAnimationFrame(() => {
                  isRevealing.current = false;
                  showBars();
                });
              });
            }
          }}
          onLayout={(e) => { layoutHeight.current = e.nativeEvent.layout.height; }}
          onScroll={(e) => {
            lastScrollOffset.current = scrollOffset.current;
            scrollOffset.current = e.nativeEvent.contentOffset.y;
            if (isAutoScrolling.current) return;
            didScroll.current = true;
            if (scrollOffset.current < lastScrollOffset.current) {
              // Finger down → show bars
              if (scrollDir.current !== 'down' && Math.abs(scrollOffset.current - dirChangeAt.current) > 8) {
                scrollDir.current = 'down';
                dirChangeAt.current = scrollOffset.current;
                showBars();
              }
            } else if (scrollOffset.current > lastScrollOffset.current) {
              // Finger up → hide bars (skip at top boundary)
              if (scrollDir.current !== 'up' && scrollOffset.current > 4 && Math.abs(scrollOffset.current - dirChangeAt.current) > 8) {
                scrollDir.current = 'up';
                dirChangeAt.current = scrollOffset.current;
                hideBars();
              }
            }
            // When episode is done and scrolled to bottom, show bars with auto-hide (once per visit)
            if (episodeDone) {
              const maxScroll = Math.max(0, contentHeight.current - layoutHeight.current);
              if (scrollOffset.current >= maxScroll - 8) {
                if (!bottomBarsShown.current) {
                  bottomBarsShown.current = true;
                  if (barsTimer.current) clearTimeout(barsTimer.current);
                  setBarsActive(true);
                  Animated.timing(barsOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
                  barsTimer.current = setTimeout(() => {
                    Animated.timing(barsOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
                      setBarsActive(false);
                    });
                  }, 3000);
                }
              } else {
                bottomBarsShown.current = false;
              }
            }
          }}
        >
          {visibleMessages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>点击屏幕任意位置继续阅读</Text>
            </View>
          ) : (
            visibleMessages.map((msg, i) => (
              <AnimatedMessage key={`msg-${i}`}>
                <MessageRenderer message={msg} workId={workId} fontScale={fontScale}
                  onWordTap={handleWordTapped} onExpandWord={handleExpandWord}
                  onAvatarPress={handleAvatarPress}
                  avatarVersion={avatarVersion} />
              </AnimatedMessage>
            ))
          )}
          {/* End panel — part of scroll content */}
          {episodeDone && (
            <View style={styles.endPanel}>
              <Text style={styles.endTitle}>本集读完</Text>
              <Text style={styles.endSubtitle}>遇见 {episode.vocab.length} 个词</Text>
              <View style={styles.vocabListInline}>
                {episode.vocab.map((item, i) => (
                  <TouchableOpacity key={i} style={styles.vocabRow}
                    onPress={() => handleExpandWord(item.word, false)}>
                    <Text style={item.is_new ? styles.vocabRowNew : styles.vocabRowReview}>
                      {item.word}
                      {item.is_new && <Text style={styles.vocabRowDef}>  {item.definition}</Text>}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          <View style={{ height: episodeDone ? 80 : revealSpacer > 0 ? revealSpacer : 200 }} />
        </ScrollView>
      </View>
      )}

      {/* Traditional (paragraph) mode */}
      {readingMode === 'paragraph' && (
        <PlainTextReader
          text={plainText ?? 'Chapter not found'}
          fontSize={13 * fontScale}
        />
      )}


      {/* Vocab popup — positioned near tapped word */}
      {vocabPopup && (
        <View style={styles.vocabPopupOverlay} pointerEvents="box-none">
          <TouchableOpacity style={styles.vocabPopupBackdrop}
            onPress={() => setVocabPopup(null)} activeOpacity={1} />
          <TouchableOpacity
            style={[
              styles.vocabPopupCard,
              cardOnRight
                ? { left: cardLeft, top: Math.max(60, cardTop) }
                : { right: 8, top: Math.max(60, cardTop) },
            ]}
            onPress={() => handleExpandWord(vocabPopup.word)}
            activeOpacity={0.8}
          >
            <Text style={styles.vocabPopupWord}>{vocabPopup.word}</Text>
            <Text style={styles.vocabPopupDef}>{vocabPopup.definition}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom bar: always present in chat mode, animated visibility */}
      {readingMode === 'chat' && (
        <Animated.View style={[styles.bottomBar, { opacity: barsOpacity }]} pointerEvents={barsActive ? 'box-none' : 'none'}>
          <TouchableOpacity
            style={styles.bottomBarSide}
            onPress={() => {
              if (currentEp > 1) goToEpisode(currentEp - 1);
              else if (episodeDone && currentEp === 1) router.back();
            }}
          >
            <Text style={[styles.bottomBarArrow, currentEp <= 1 && !episodeDone && styles.epNavDisabled]}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomBarEpBtn} onPress={toggleSidebar}>
            <Text style={styles.bottomBarEpText}>Ep.{currentEp} / {totalEps}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bottomBarSide}
            onPress={() => {
              if (currentEp >= totalEps && episodeDone) router.back();
              else if (currentEp < totalEps) goToEpisode(currentEp + 1);
            }}
          >
            <Text style={styles.bottomBarArrow}>›</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Sidebar overlay + episode list */}
      {sidebarOpen && (
        <EpisodeSidebar
          currentEp={currentEp}
          totalEps={totalEps}
          titles={episodeTitles}
          overlayAnim={overlayAnim}
          sidebarAnim={sidebarAnim}
          onClose={toggleSidebar}
          onSelectEpisode={(epNum) => { goToEpisode(epNum); toggleSidebar(); }}
        />
      )}

      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.mainBg },
  animatedContent: { flex: 1 },
  dictWrapper: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 200 },
  topBarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, backgroundColor: Colors.mainBg },
  statusBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  backButton: { fontSize: 13, color: Colors.secondary, minWidth: 50 },
  title: { fontSize: 14, fontWeight: '500', color: Colors.bodyText, flex: 1, textAlign: 'center' },
  epNav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  epNavArrow: { fontSize: 22, color: Colors.bodyText, paddingHorizontal: 6, paddingVertical: 2 },
  epNavDisabled: { color: Colors.divider },
  epNavLabel: { fontSize: 13, color: Colors.bodyText, fontWeight: '500', minWidth: 70, textAlign: 'center' },
  episodeLabel: { fontSize: 11, color: Colors.secondary, minWidth: 50, textAlign: 'right', flexShrink: 1 },
  progressBarContainer: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, zIndex: 18, backgroundColor: 'transparent' },
  progressFill: { height: 3, backgroundColor: Colors.progressBar },
  tapContainer: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 50, flexGrow: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, minHeight: 300 },
  emptyText: { fontSize: 14, color: Colors.secondary, fontFamily: 'Georgia' },
  loadingText: { fontSize: 14, color: Colors.secondary },
  // Vocab popup — absolute, positioned near word
  vocabPopupOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 },
  vocabPopupBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  vocabPopupCard: { position: 'absolute', backgroundColor: Colors.panelBg, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4, minWidth: 150 },
  vocabPopupWord: { fontSize: 17, fontWeight: '700', color: Colors.bodyText, marginBottom: 2 },
  vocabPopupDef: { fontSize: 14, color: Colors.secondary, marginBottom: 6 },
  // End panel
  endPanel: { backgroundColor: Colors.panelBg, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 20, marginTop: 24, marginHorizontal: 12 },
  endTitle: { fontSize: 14, color: Colors.secondary, marginBottom: 4 },
  endSubtitle: { fontSize: 18, color: Colors.bodyText, fontFamily: 'Georgia', marginBottom: 16 },
  vocabListInline: { width: '100%', marginTop: 12 },
  vocabListScroll: { width: '100%', maxHeight: 200, marginBottom: 16 },
  vocabRow: { paddingVertical: 6, paddingHorizontal: 12 },
  vocabRowNew: { fontSize: 15, color: Colors.bodyText, fontFamily: 'Georgia' },
  vocabRowReview: { fontSize: 15, color: Colors.bodyText, fontWeight: '600', fontFamily: 'Georgia' },
  vocabRowDef: { fontSize: 13, color: Colors.definition, fontWeight: '400' },
  // Bottom bar
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.divider, backgroundColor: Colors.mainBg, paddingVertical: 2, zIndex: 10 },
  bottomBarSide: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  bottomBarArrow: { fontSize: 28, color: Colors.bodyText },
  bottomBarEpBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  bottomBarEpText: { fontSize: 15, color: Colors.bodyText, fontWeight: '500' },
  // Sidebar
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 300 },
  sidebar: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 220, backgroundColor: Colors.mainBg, zIndex: 301, paddingTop: 50 },
  sidebarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  sidebarTitle: { fontSize: 16, color: Colors.bodyText, fontWeight: '500' },
  sidebarClose: { fontSize: 18, color: Colors.secondary, padding: 4 },
  sidebarList: { flex: 1 },
  sidebarItem: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  sidebarItemActive: { backgroundColor: Colors.leftBubble },
  sidebarItemText: { fontSize: 14, color: Colors.bodyText, fontWeight: '500' },
  sidebarItemTextActive: { color: Colors.bodyText },
  sidebarItemTitle: { fontSize: 12, color: Colors.secondary, marginTop: 2 },
});
