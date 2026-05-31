import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '@/src/theme/colors';

interface VocabCardProps {
  word: string;
  definition: string;
  onClose: () => void;
  onExpand?: () => void;
}

/**
 * First-level vocab card: small floating card showing word + definition.
 * Tapping the card can expand to the full dictionary panel.
 */
export function VocabCard({ word, definition, onClose, onExpand }: VocabCardProps) {
  const handlePress = () => {
    if (onExpand) {
      onExpand();
    }
  };

  return (
    <TouchableOpacity
      style={styles.overlay}
      onPress={onClose}
      activeOpacity={1}
    >
      <TouchableOpacity
        style={styles.card}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <Text style={styles.word}>{word}</Text>
        <Text style={styles.definition}>{definition}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: -8,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.panelBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    // Subtle shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  word: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.bodyText,
    marginRight: 8,
  },
  definition: {
    fontSize: 13,
    color: Colors.secondary,
  },
});
