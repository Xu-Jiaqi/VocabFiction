import { useEffect, useRef, useState } from 'react';
import { Animated, AccessibilityInfo } from 'react-native';

interface AnimatedMessageProps {
  children: React.ReactNode;
}

/**
 * Wraps a message with a smooth fade-in entrance animation.
 *
 * Respects prefers-reduced-motion: when the system reports reduced motion,
 * the fade is skipped (opacity set directly to 1) so users with vestibular
 * sensitivity aren't exposed to the animation.
 */
export function AnimatedMessage({ children }: AnimatedMessageProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    // 读取系统动效降级偏好，并在用户切换时同步更新
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => setReduceMotion(false));
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      // 直接显示，无动画
      opacity.setValue(1);
      return;
    }
    // 规范 0.3s
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, opacity]);

  return <Animated.View style={{ opacity }}>{children}</Animated.View>;
}
