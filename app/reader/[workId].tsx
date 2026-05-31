import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Animated, PanResponder,
} from 'react-native';
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
import { PlainTextReader } from '@/src/components/PlainTextReader';
import { loadPlainText } from '@/src/services/episode-loader';
import type { Episode } from '@/src/models/episode';
import type { Work } from '@/src/models/work';

const TAP_THRESHOLD = 8;
const CARD_HEIGHT = 100;

export default function ReaderScreen() {
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const router = useRouter();

  const [work, setWork] = useState<Work | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [currentEp, setCurrentEp] = useState(1);
  const [currentMsg, setCurrentMsg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [episodeDone, setEpisodeDone] = useState(false);

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
  const contentHeight = useRef(0);
  const layoutHeight = useRef(0);
  const scrollFrame = useRef<number | null>(null);
  const screenAnim = useRef(new Animated.Value(Dimensions.get('window').width)).current;
  const [fontScale, setFontScale] = useState(1);
  const [readingMode, setReadingMode] = useState<ReadingMode>('chat');
  const panelHeight = useRef(new Animated.Value(1)).current; // 1 = open, 0 = closed
  const panelOpen = useRef(true);
  const PANEL_FULL = 300; // max height of collapsible vocab area

  const panelPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5,
    onPanResponderMove: (_, g) => {
      // g.dy > 0 = finger moving down (closing). g.dy < 0 = finger moving up (opening)
      const base = panelOpen.current ? 1 : 0;
      const change = -g.dy / PANEL_FULL;
      panelHeight.setValue(Math.max(0, Math.min(1, base + change)));
    },
    onPanResponderRelease: (_, g) => {
      const moved = Math.abs(g.dy);
      if (moved < 5 && !g.dx) {
        // Tap: toggle panel
        const toOpen = !panelOpen.current;
        Animated.spring(panelHeight, { toValue: toOpen ? 1 : 0, useNativeDriver: false, speed: 14, bounciness: 0 }).start();
        panelOpen.current = toOpen;
      } else {
        const threshold = panelOpen.current ? 0.35 : 0.4;
        const progress = panelOpen.current ? 1 - g.dy / PANEL_FULL : -g.dy / PANEL_FULL;
        const snapOpen = progress > threshold;
        Animated.spring(panelHeight, { toValue: snapOpen ? 1 : 0, useNativeDriver: false, speed: 14, bounciness: 0 }).start();
        panelOpen.current = snapOpen;
      }
    },
  })).current;

  // Screen entrance animation: slide in from right
  useEffect(() => {
    Animated.timing(screenAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Smooth scroll with custom ease-out duration
  const smoothScrollTo = useCallback((targetY: number, duration = 500) => {
    const startY = scrollOffset.current;
    const startTime = Date.now();
    if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current);

    const step = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startY + (targetY - startY) * eased;
      scrollViewRef.current?.scrollTo({ y: current, animated: false });
      if (progress < 1) {
        scrollFrame.current = requestAnimationFrame(step);
      }
    };
    scrollFrame.current = requestAnimationFrame(step);
  }, []);

  const loadEp = useCallback(async (epNum: number, msgIdx: number) => {
    setLoading(true);
    setEpisodeDone(false);
    setVocabPopup(null);
    dictAnim.setValue(0);
    setDictWord(null);
    panelHeight.setValue(1);
    panelOpen.current = true;
    const ep = loadEpisode(workId, epNum);
    setEpisode(ep);
    setCurrentEp(epNum);
    setCurrentMsg(msgIdx);
    if (ep && msgIdx >= ep.messages.length) setEpisodeDone(true);
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
      await loadEp(p?.current_ep ?? 1, p?.current_msg ?? 0);
    }
    init();
  }, [workId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { prevMsgCount.current = currentMsg; }, [currentEp]);

  const saveProgress = useCallback(async (msgIdx: number) => {
    try { await updateProgress(workId, { current_ep: currentEp, current_msg: msgIdx }); }
    catch (e) { console.error('[Reader] Save progress:', e); }
  }, [workId, currentEp]);

  const handleTap = useCallback(() => {
    // Priority: close dict panel → close vocab popup → advance message
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
      setEpisodeDone(true);
      saveProgress(episode.messages.length);
      return;
    }
    setCurrentMsg(next);
    saveProgress(next);
    if (next >= episode.messages.length) setEpisodeDone(true);
    setTimeout(() => {
      const target = Math.max(0, contentHeight.current - layoutHeight.current + 100);
      smoothScrollTo(target, 500);
    }, 80);
  }, [dictWord, vocabPopup, episode, currentMsg, episodeDone, saveProgress, hideDictPanel, smoothScrollTo]);

  const handleTouchStart = useCallback((e: any) => {
    touchStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    wordWasTapped.current = false;
  }, []);

  const handleTouchEnd = useCallback((e: any) => {
    if (!touchStart.current || wordWasTapped.current) return;
    const { pageX, pageY } = e.nativeEvent;
    if (Math.abs(pageX - touchStart.current.x) < TAP_THRESHOLD &&
        Math.abs(pageY - touchStart.current.y) < TAP_THRESHOLD) {
      setTimeout(() => { if (!wordWasTapped.current) handleTap(); }, 0);
    }
    touchStart.current = null;
  }, [handleTap]);

  // Word tap → show popup at the touch position (reliable, no element measurement needed)
  const handleWordTapped = useCallback((word: string, definition: string) => {
    wordWasTapped.current = true;
    const pos = touchStart.current;
    const x = pos?.x ?? 100;
    const y = pos?.y ?? 300;
    setVocabPopup({ word, definition, x, y });
    // If word is near top, scroll to make room for the card
    if (y < CARD_HEIGHT + 80) {
      const diff = CARD_HEIGHT + 80 - y;
      scrollViewRef.current?.scrollTo({ y: scrollOffset.current - diff, animated: false });
    }
  }, []);

  const handleExpandWord = useCallback((word: string, scroll = true) => {
    setVocabPopup(null);
    showDictPanel(word);
    if (scroll) {
      const target = scrollOffset.current + 60;
      smoothScrollTo(target, 400);
    }
  }, [showDictPanel, smoothScrollTo]);

  const goToEpisode = useCallback(async (epNum: number) => {
    if (!work || epNum < 1 || epNum > work.total_eps) return;
    await updateProgress(workId, { current_ep: currentEp, current_msg: currentMsg });
    prevMsgCount.current = 0;
    scrollOffset.current = 0;
    await loadEp(epNum, 0);
  }, [work, workId, currentEp, currentMsg, loadEp]);

  const handleContinue = useCallback(async () => {
    if (!work) return;
    const nextEp = currentEp + 1;
    if (nextEp > work.total_eps) {
      await updateProgress(workId, { current_ep: currentEp, current_msg: episode?.messages.length ?? 0, status: 'finished' });
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
      <Animated.View style={[styles.animatedContent, { transform: [{ translateX: screenAnim }] }]}>
      <View style={styles.statusBar}>
        <TouchableOpacity onPress={() => router.back()}><Text style={styles.backButton}>← 书架</Text></TouchableOpacity>
        <View style={styles.epNav}>
          {readingMode === 'paragraph' ? (
            <Text style={styles.epNavLabel}>Ch.1 / 1</Text>
          ) : (
            <>
              <TouchableOpacity onPress={() => currentEp > 1 && goToEpisode(currentEp - 1)} disabled={currentEp <= 1}>
                <Text style={[styles.epNavArrow, currentEp <= 1 && styles.epNavDisabled]}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.epNavLabel}>Ep.{currentEp} / {totalEps}</Text>
              <TouchableOpacity onPress={() => currentEp < totalEps && goToEpisode(currentEp + 1)} disabled={currentEp >= totalEps}>
                <Text style={[styles.epNavArrow, currentEp >= totalEps && styles.epNavDisabled]}>›</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        <Text style={styles.episodeLabel} numberOfLines={1}>{episode.meta.title}</Text>
      </View>

      {readingMode === 'chat' && (
      <View style={styles.progressBarContainer}>
        <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
      </View>
      )}

      {/* Dictionary panel — in normal flow, pushes content down */}
      {dictWord && (
        <Animated.View style={[styles.dictWrapper, {
          opacity: dictAnim,
          transform: [{ translateY: dictAnim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }],
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
          scrollEventThrottle={16}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onContentSizeChange={(w, h) => { contentHeight.current = h; }}
          onLayout={(e) => { layoutHeight.current = e.nativeEvent.layout.height; }}
          onScroll={(e) => { scrollOffset.current = e.nativeEvent.contentOffset.y; }}
        >
          {visibleMessages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>点击屏幕任意位置继续阅读</Text>
            </View>
          ) : (
            visibleMessages.map((msg, i) => (
              <AnimatedMessage key={`msg-${i}`}>
                <MessageRenderer message={msg} workId={workId} fontScale={fontScale}
                  onWordTap={handleWordTapped} onExpandWord={handleExpandWord} />
              </AnimatedMessage>
            ))
          )}
          <View style={{ height: episodeDone ? 80 : 200 }} />
        </ScrollView>
      </View>
      )}

      {/* Traditional (paragraph) mode */}
      {readingMode === 'paragraph' && (
        <PlainTextReader
          text={loadPlainText(workId) ?? 'Chapter not found'}
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

      {episodeDone && (
        <View style={styles.endPanel}>
          {/* Handle at top: tap to toggle, drag to expand/collapse */}
          <View style={styles.endPanelHandle} {...panelPan.panHandlers}>
            <View style={styles.endPanelHandleBar} />
          </View>

          {/* Collapsible: title + vocab list */}
          <Animated.View style={[styles.endPanelBody, {
            maxHeight: panelHeight.interpolate({ inputRange: [0, 1], outputRange: [0, PANEL_FULL] }),
            opacity: panelHeight,
          }]}>
            <Text style={styles.endTitle}>本集读完</Text>
            <Text style={styles.endSubtitle}>遇见 {episode.vocab.length} 个词</Text>
            <ScrollView style={styles.vocabListScroll} showsVerticalScrollIndicator={false}>
              {episode.vocab.map((item, i) => (
                <TouchableOpacity key={i} style={styles.vocabRow}
                  onPress={() => handleExpandWord(item.word, false)}>
                  <Text style={item.is_new ? styles.vocabRowNew : styles.vocabRowReview}>
                    {item.word}
                    {item.is_new && <Text style={styles.vocabRowDef}>  {item.definition}</Text>}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>

          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <Text style={styles.continueText}>{currentEp < totalEps ? '继续阅读 →' : '返回书架'}</Text>
          </TouchableOpacity>
        </View>
      )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.mainBg },
  animatedContent: { flex: 1 },
  dictWrapper: { position: 'absolute', top: 48, left: 0, right: 0, zIndex: 200 },
  statusBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  backButton: { fontSize: 13, color: Colors.secondary, minWidth: 50 },
  title: { fontSize: 14, fontWeight: '500', color: Colors.bodyText, flex: 1, textAlign: 'center' },
  epNav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  epNavArrow: { fontSize: 22, color: Colors.bodyText, paddingHorizontal: 6, paddingVertical: 2 },
  epNavDisabled: { color: Colors.divider },
  epNavLabel: { fontSize: 13, color: Colors.bodyText, fontWeight: '500', minWidth: 70, textAlign: 'center' },
  episodeLabel: { fontSize: 11, color: Colors.secondary, minWidth: 50, textAlign: 'right', flexShrink: 1 },
  progressBarContainer: { height: 2, backgroundColor: Colors.divider },
  progressFill: { height: 2, backgroundColor: Colors.progressBar },
  tapContainer: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 12 },
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
  endPanel: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.panelBg, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 24, paddingBottom: 24 },
  endPanelBody: { overflow: 'hidden', alignItems: 'center' },
  endPanelHandle: { paddingTop: 12, paddingBottom: 4, justifyContent: 'center', alignItems: 'center' },
  endPanelHandleBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.divider },
  endTitle: { fontSize: 14, color: Colors.secondary, marginBottom: 4 },
  endSubtitle: { fontSize: 18, color: Colors.bodyText, fontFamily: 'Georgia', marginBottom: 16 },
  vocabListScroll: { width: '100%', maxHeight: 200, marginBottom: 16 },
  vocabRow: { paddingVertical: 6, paddingHorizontal: 12 },
  vocabRowNew: { fontSize: 15, color: Colors.bodyText, fontFamily: 'Georgia' },
  vocabRowReview: { fontSize: 15, color: Colors.bodyText, fontWeight: '600', fontFamily: 'Georgia' },
  vocabRowDef: { fontSize: 13, color: Colors.definition, fontWeight: '400' },
  continueButton: { paddingVertical: 8, paddingHorizontal: 24 },
  continueText: { fontSize: 15, color: Colors.bodyText },
});
