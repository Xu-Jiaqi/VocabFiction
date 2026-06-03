import { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  Modal,
} from 'react-native';
import { Colors } from '@/src/theme/colors';

export interface ActionItem {
  text: string;
  onPress: () => void;
  destructive?: boolean;
}

interface ActionSheetProps {
  visible: boolean;
  title?: string;
  actions: ActionItem[];
  onClose: () => void;
}

const CARD_WIDTH = 280;
const ANIM_IN = 250;
const ANIM_OUT = 150;

export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: ActionSheetProps) {
  const scrimOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(8)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  const show = useCallback(() => {
    cardTranslateY.setValue(8);
    cardOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(scrimOpacity, {
        toValue: 1,
        duration: ANIM_IN,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: ANIM_IN,
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: 0,
        duration: ANIM_IN,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scrimOpacity, cardTranslateY, cardOpacity]);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(scrimOpacity, {
        toValue: 0,
        duration: ANIM_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 0,
        duration: ANIM_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(cardTranslateY, {
        toValue: 8,
        duration: ANIM_OUT,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  }, [scrimOpacity, cardTranslateY, cardOpacity, onClose]);

  useEffect(() => {
    if (visible) show();
  }, [visible, show]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={hide}
    >
      {/* 最外层 Pressable 铺满全屏，点击任何位置触发 hide */}
      <Pressable style={styles.backdrop} onPress={hide}>
        <Animated.View
          style={[styles.scrim, { opacity: scrimOpacity }]}
        />
        {/* 居中容器：pointerEvents="box-none" 让空白处触摸穿透到 backdrop */}
        <View style={styles.centerWrap} pointerEvents="box-none">
          {/* 卡片用 Pressable 包裹，截断触摸，阻止触发 backdrop 的 hide */}
          <Animated.View
            style={[
              styles.card,
              {
                opacity: cardOpacity,
                transform: [{ translateY: cardTranslateY }],
              },
            ]}
          >
            {title != null && title.length > 0 && (
              <>
                <View style={styles.titleWrap}>
                  <Text style={styles.title}>{title}</Text>
                </View>
                <View style={styles.divider} />
              </>
            )}

            {actions.map((action, i) => (
              <View key={`as-${i}`}>
                {i > 0 && <View style={styles.divider} />}
                <Pressable
                  style={({ pressed }) => [
                    styles.actionRow,
                    pressed && { backgroundColor: Colors.pressedOverlay },
                  ]}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    hide();
                    setTimeout(action.onPress, ANIM_OUT + 20);
                  }}
                >
                  <Text
                    style={[
                      styles.actionText,
                      action.destructive && styles.actionDestructive,
                    ]}
                  >
                    {action.text}
                  </Text>
                </Pressable>
              </View>
            ))}
          </Animated.View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.scrim,
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: Colors.panelBg,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  titleWrap: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    alignItems: 'center',
  },
  title: {
    fontSize: 13,
    color: Colors.secondary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.divider,
  },
  actionRow: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 16,
    color: Colors.bodyText,
  },
  actionDestructive: {
    color: Colors.destructive,
  },
});
