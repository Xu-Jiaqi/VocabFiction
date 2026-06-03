import { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '@/src/theme/colors';
import {
  getAvatarSource,
  getCustomAvatarUri,
  checkCustomAvatarExists,
} from '@/src/services/character-loader';

interface ChatAvatarProps {
  workId: string;
  name: string;
  side: 'left' | 'right';
  onPress?: () => void;
  /** Increment to force re-check of custom avatars */
  avatarVersion?: number;
}

export function ChatAvatar({
  workId,
  name,
  side,
  onPress,
  avatarVersion,
}: ChatAvatarProps) {
  const builtinSource = getAvatarSource(workId, name);
  const [customUri, setCustomUri] = useState<string | null>(null);

  useEffect(() => {
    const baseUri = getCustomAvatarUri(workId, name);
    if (baseUri) {
      checkCustomAvatarExists(baseUri)
        .then((exists) => {
          // Cache-busting query param forces Image reload when avatarVersion changes
          setCustomUri(exists ? `${baseUri}?v=${avatarVersion ?? 0}` : null);
        })
        .catch(() => setCustomUri(null));
    } else {
      setCustomUri(null);
    }
  }, [workId, name, avatarVersion]);

  const source = customUri ? { uri: customUri } : builtinSource;

  const content = source ? (
    <Image source={source} style={styles.avatar} />
  ) : (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );

  return (
    <TouchableOpacity
      style={[styles.container, side === 'right' && styles.containerRight]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
      // 36px 头像需补足到 ≥44pt 触摸目标
      hitSlop={4}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // 4px padding 围绕 36px 头像 = 44pt 触摸目标
  container: {
    marginRight: 8,
    padding: 4,
  },
  containerRight: {
    marginRight: 0,
    marginLeft: 8,
    padding: 4,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  placeholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.leftBubble,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 15,
    color: Colors.secondary,
    fontWeight: '500',
  },
});
