import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors } from '@/src/theme/colors';
import { getAvatarSource } from '@/src/services/character-loader';

interface ChatAvatarProps {
  workId: string;
  name: string;
  side: 'left' | 'right';
}

export function ChatAvatar({ workId, name, side }: ChatAvatarProps) {
  const avatarSource = getAvatarSource(workId, name);

  return (
    <View style={[styles.container, side === 'right' && styles.containerRight]}>
      {avatarSource ? (
        <Image source={avatarSource} style={styles.avatar} />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            {name.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginRight: 8,
  },
  containerRight: {
    marginRight: 0,
    marginLeft: 8,
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
