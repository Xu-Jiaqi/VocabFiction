import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

interface AnimatedMessageProps {
  children: React.ReactNode;
}

/**
 * Wraps a message with a smooth fade-in entrance animation.
 */
export function AnimatedMessage({ children }: AnimatedMessageProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View style={{ opacity }}>
      {children}
    </Animated.View>
  );
}
