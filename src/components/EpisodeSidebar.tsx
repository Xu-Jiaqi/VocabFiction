import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Colors } from '@/src/theme/colors';

export const SIDEBAR_WIDTH = 260;

interface EpisodeSidebarProps {
  currentEp: number;
  totalEps: number;
  titles: Record<number, string>;
  overlayStyle: object;
  sidebarStyle: object;
  onClose: () => void;
  onSelectEpisode: (epNum: number) => void;
}

export function EpisodeSidebar({
  currentEp,
  totalEps,
  titles,
  overlayStyle,
  sidebarStyle,
  onClose,
  onSelectEpisode,
}: EpisodeSidebarProps) {
  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <Pressable style={styles.overlayHitbox} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.sidebar, sidebarStyle]}>
        <View style={styles.sidebarHeader}>
          <Text style={styles.sidebarTitle}>选集</Text>
          <Pressable
            onPress={onClose}
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
          keyExtractor={(epNum) => `ep-${epNum}`}
          renderItem={({ item: epNum }) => (
            <Pressable
              style={({ pressed }) => [
                styles.sidebarItem,
                epNum === currentEp && styles.sidebarItemActive,
                pressed && { backgroundColor: Colors.pressedOverlay },
              ]}
              onPress={() => onSelectEpisode(epNum)}
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
                {titles[epNum] ?? ''}
              </Text>
            </Pressable>
          )}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.scrim,
    zIndex: 300,
  },
  overlayHitbox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sidebar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
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
  sidebarCloseBtn: { padding: 8, borderRadius: 6 },
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
