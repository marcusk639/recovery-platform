import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Animated} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const REACTIONS = [
  {emoji: '👍', name: 'thumbsup'},
  {emoji: '❤️', name: 'heart'},
  {emoji: '😂', name: 'laugh'},
  {emoji: '😮', name: 'wow'},
  {emoji: '😢', name: 'sad'},
  {emoji: '😡', name: 'angry'},
];

export interface ReactionPickerProps {
  visible: boolean;
  fadeAnim: Animated.Value;
  onReactionSelect: (reactionType: string) => void;
  onReply?: () => void;
  onReport?: () => void;
  onDelete?: () => void;
  onClose: () => void;
  canDelete?: boolean;
  canReport?: boolean;
}

const ReactionPicker: React.FC<ReactionPickerProps> = ({
  visible,
  fadeAnim,
  onReactionSelect,
  onReply,
  onReport,
  onDelete,
  onClose,
  canDelete = false,
  canReport = false,
}) => {
  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.reactionPickerContainer,
        {
          opacity: fadeAnim,
        },
      ]}>
      <View style={styles.reactionOptions}>
        {REACTIONS.map(reaction => (
          <TouchableOpacity
            key={reaction.name}
            style={styles.reactionOption}
            onPress={() => onReactionSelect(reaction.name)}
            testID={`chat-reaction-option-${reaction.name}`}>
            <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.messageOptions}>
        {onReply && (
          <TouchableOpacity
            style={styles.messageOption}
            onPress={onReply}
            testID="chat-message-option-reply">
            <Icon name="reply" size={24} color="#424242" />
            <Text style={styles.messageOptionText}>Reply</Text>
          </TouchableOpacity>
        )}

        {canReport && onReport && (
          <TouchableOpacity
            style={styles.messageOption}
            onPress={onReport}
            testID="chat-message-option-report">
            <Icon name="flag" size={24} color="#FF9800" />
            <Text style={styles.reportOptionText}>Report</Text>
          </TouchableOpacity>
        )}

        {canDelete && onDelete && (
          <TouchableOpacity
            style={[styles.messageOption, styles.deleteOption]}
            onPress={onDelete}
            testID="chat-message-option-delete">
            <Icon name="delete" size={24} color="#F44336" />
            <Text style={styles.deleteOptionText}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={styles.backdropOverlay}
        activeOpacity={1}
        onPress={onClose}
        testID="chat-reaction-picker-backdrop"
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  reactionPickerContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  reactionOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  reactionOption: {
    padding: 8,
  },
  reactionEmoji: {
    fontSize: 24,
  },
  messageOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    paddingBottom: 24,
  },
  messageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  messageOptionText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#424242',
  },
  deleteOption: {
    marginLeft: 16,
  },
  deleteOptionText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#F44336',
  },
  reportOptionText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#FF9800',
  },
  backdropOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: -1,
  },
});

export default ReactionPicker;

