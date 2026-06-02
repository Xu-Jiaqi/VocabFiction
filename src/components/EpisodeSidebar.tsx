import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/src/theme/colors';

interface EpisodeSidebarProps {
  currentEp: number;
  totalEps: number;
  titles: Record<number, string>;
  overlayAnim: Animated.Value;
  sidebarAnim: Animated.Value;
  onClose: () => void;
  onSelectEpisode: (epNum: number) => void;
}

export function EpisodeSidebar({
  currentEp,
  totalEps,
  titles,
  overlayAnim,
  sidebarAnim,
  onClose,
  onSelectEpisode,
}: EpisodeSidebarProps) {
  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <Animated.View style={[styles.overlay, { opacity: overlayAnim }]}>
        <TouchableOpacity style={styles.overlayHitbox} onPress={onClose} activeOpacity={1} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sidebar,
          { transform: [{ translateX: sidebarAnim.interpolate({ inputRange: [0, 1], outputRange: [-220, 0] }) }] },
        ]}
      >
        <View style={styles.sidebarHeader}>
          <Text style={styles.sidebarTitle}>选集</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.sidebarClose}>✕</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.sidebarList}>
          {Array.from({ length: totalEps }, (_, i) => i + 1).map((epNum) => (
            <TouchableOpacity
              key={epNum}
              style={[styles.sidebarItem, epNum === currentEp && styles.sidebarItemActive]}
              onPress={() => onSelectEpisode(epNum)}
            >
              <Text style={[styles.sidebarItemText, epNum === currentEp && styles.sidebarItemTextActive]}>
                Ep.{epNum}
              </Text>
              <Text style={styles.sidebarItemTitle} numberOfLines={1}>
                {titles[epNum] ?? ''}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 300 },
  overlayHitbox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
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
