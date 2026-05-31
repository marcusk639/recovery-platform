import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Linking,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {DirectMessage, ChatAttachment, GroupMember} from '../../types';
import {ChatMessage} from '../../models/ChatModel';
import {
  formatTimestamp,
  formatFileSize,
  formatDuration,
  parseMessageText,
} from '../../utils/chatUtils';

type Message = ChatMessage | DirectMessage;

// Available reactions (same as GroupChatScreen)
const REACTIONS = [
  {emoji: '👍', name: 'thumbsup'},
  {emoji: '❤️', name: 'heart'},
  {emoji: '😂', name: 'laugh'},
  {emoji: '😮', name: 'wow'},
  {emoji: '😢', name: 'sad'},
  {emoji: '😡', name: 'angry'},
];

export interface MessageBubbleProps {
  message: Message;
  isCurrentUser: boolean;
  isSystem?: boolean;
  selectedMessageId?: string | null;
  showMentions?: boolean;
  showReadReceipts?: boolean;
  members?: GroupMember[];
  currentUserId?: string;
  onLongPress?: (messageId: string) => void;
  onImagePress?: (imageUrl: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isCurrentUser,
  isSystem = false,
  selectedMessageId,
  showMentions = false,
  showReadReceipts = false,
  members = [],
  currentUserId,
  onLongPress,
  onImagePress,
}) => {
  const formattedTime = message.sentAt ? formatTimestamp(message.sentAt) : '';
  const isOptimistic = (message as any).isOptimistic === true;

  // Get total reaction count
  const totalReactions: number = message.reactions
    ? (Object.values(message.reactions) as string[][]).reduce(
        (sum: number, users: string[]) => sum + users.length,
        0,
      )
    : 0;

  // Render attachments
  const renderAttachments = () => {
    if (!message.attachments || message.attachments.length === 0) return null;

    return (
      <View style={styles.attachmentsContainer}>
        {message.attachments.map(
          (attachment: ChatAttachment, index: number) => {
            // Image attachments
            if (attachment.type === 'image') {
              return (
                <TouchableOpacity
                  key={`${message.id}-attachment-${index}`}
                  onPress={() => onImagePress?.(attachment.url)}
                  style={styles.imageAttachmentContainer}>
                  <FastImage
                    source={{uri: attachment.url}}
                    style={styles.imageAttachment}
                    resizeMode={FastImage.resizeMode.contain}
                  />
                  <View style={styles.imageOverlay}>
                    <Icon
                      name="magnify-plus-outline"
                      size={16}
                      color="#FFFFFF"
                    />
                  </View>
                </TouchableOpacity>
              );
            }

            // File attachments
            if (attachment.type === 'file') {
              return (
                <TouchableOpacity
                  key={`${message.id}-attachment-${index}`}
                  onPress={() => Linking.openURL(attachment.url)}
                  style={styles.fileAttachmentContainer}>
                  <Icon
                    name="file-document-outline"
                    size={24}
                    color="#2196F3"
                  />
                  <View style={styles.fileAttachmentDetails}>
                    <Text style={styles.fileAttachmentName} numberOfLines={1}>
                      {attachment.name || 'Document'}
                    </Text>
                    {attachment.size && (
                      <Text style={styles.fileAttachmentSize}>
                        {formatFileSize(attachment.size)}
                      </Text>
                    )}
                  </View>
                  <Icon name="download" size={20} color="#757575" />
                </TouchableOpacity>
              );
            }

            // Voice attachments
            if (attachment.type === 'voice') {
              return (
                <View
                  key={`${message.id}-attachment-${index}`}
                  style={styles.voiceAttachmentContainer}>
                  <TouchableOpacity
                    style={styles.voicePlayButton}
                    onPress={() => Linking.openURL(attachment.url)}>
                    <Icon name="play" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                  <View style={styles.voiceWaveform}>
                    <View style={styles.voiceWaveformBar} />
                    <View style={[styles.voiceWaveformBar, {height: 15}]} />
                    <View style={[styles.voiceWaveformBar, {height: 18}]} />
                    <View style={[styles.voiceWaveformBar, {height: 12}]} />
                    <View style={[styles.voiceWaveformBar, {height: 16}]} />
                    <View style={[styles.voiceWaveformBar, {height: 10}]} />
                    <View style={[styles.voiceWaveformBar, {height: 14}]} />
                  </View>
                  {attachment.duration && (
                    <Text style={styles.voiceDuration}>
                      {formatDuration(attachment.duration)}
                    </Text>
                  )}
                </View>
              );
            }

            // Default fallback
            return (
              <TouchableOpacity
                key={`${message.id}-attachment-${index}`}
                onPress={() => Linking.openURL(attachment.url)}
                style={styles.genericAttachmentContainer}>
                <Text style={styles.genericAttachmentText}>
                  View Attachment
                </Text>
              </TouchableOpacity>
            );
          },
        )}
      </View>
    );
  };

  // Check if message is read (for direct messages)
  const isRead =
    showReadReceipts && isCurrentUser && 'read' in message
      ? Object.keys(message.read || {}).length > 1 // More than just the sender
      : false;

  return (
    <Pressable
      onLongPress={() => !isSystem && onLongPress?.(message.id)}
      testID={`chat-message-${message.id}`}
      style={[
        styles.messageBubbleContainer,
        isCurrentUser
          ? styles.userMessageContainer
          : styles.otherMessageContainer,
        isSystem && styles.systemMessageContainer,
      ]}>
      {!isCurrentUser && !isSystem && (
        <View style={styles.avatarContainer}>
          {message.senderPhotoURL ? (
            <FastImage
              source={{uri: message.senderPhotoURL}}
              style={styles.avatar}
            />
          ) : (
            <View style={[styles.avatar, styles.defaultAvatar]}>
              <Text style={styles.avatarText}>
                {message.senderName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      )}

      <View
        style={[
          styles.messageBubble,
          isCurrentUser ? styles.userBubble : styles.otherBubble,
          isSystem && styles.systemBubble,
          selectedMessageId === message.id && styles.selectedBubble,
          isOptimistic && styles.optimisticBubble,
        ]}>
        {!isCurrentUser && !isSystem && (
          <Text style={styles.senderName}>{message.senderName}</Text>
        )}

        {message.replyTo && (
          <View style={styles.replyContainer}>
            <View style={styles.replyLine} />
            <View style={styles.replyContent}>
              <Text style={styles.replyName}>{message.replyTo.senderName}</Text>
              <Text style={styles.replyText} numberOfLines={1}>
                {message.replyTo.text}
              </Text>
            </View>
          </View>
        )}

        {/* Text message */}
        {message.text && (
          <Text
            style={[styles.messageText, isSystem && styles.systemMessageText]}
            testID={`chat-message-text-${message.id}`}>
            {showMentions
              ? parseMessageText(message.text, {
                  parseMentions: true,
                  members,
                  currentUserId,
                  mentionHighlightStyle: styles.mentionHighlight,
                  mentionTextStyle: styles.mentionText,
                  linkTextStyle: styles.linkText,
                })
              : parseMessageText(message.text, {
                  parseMentions: false,
                  linkTextStyle: styles.linkText,
                })}
          </Text>
        )}

        {/* Attachments */}
        {renderAttachments()}

        <View style={styles.timestampContainer}>
          <Text
            style={[
              styles.timestamp,
              isCurrentUser ? styles.userTimestamp : styles.otherTimestamp,
              isSystem && styles.systemTimestamp,
            ]}>
            {formattedTime}
          </Text>
          {showReadReceipts && isCurrentUser && isRead && (
            <Text style={styles.readReceipt}>Read</Text>
          )}
        </View>

        {/* Reactions display */}
        {totalReactions > 0 && (
          <View style={styles.reactionsContainer}>
            {message.reactions &&
              Object.entries(message.reactions).map(([reaction, users]) => {
                const userArray = users as string[];
                if (userArray.length === 0) return null;
                const emojiObj = REACTIONS.find(r => r.name === reaction);
                return (
                  <View key={reaction} style={styles.reactionBubble}>
                    <Text style={styles.reactionEmoji}>
                      {emojiObj?.emoji || '👍'}
                    </Text>
                    <Text style={styles.reactionCount}>{userArray.length}</Text>
                  </View>
                );
              })}
          </View>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  messageBubbleContainer: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '85%',
  },
  userMessageContainer: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  otherMessageContainer: {
    alignSelf: 'flex-start',
  },
  systemMessageContainer: {
    alignSelf: 'center',
    marginVertical: 16,
    maxWidth: '90%',
  },
  avatarContainer: {
    marginRight: 8,
    alignSelf: 'flex-end',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  defaultAvatar: {
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  messageBubble: {
    padding: 12,
    borderRadius: 18,
    maxWidth: '100%',
  },
  userBubble: {
    backgroundColor: '#E3F2FD',
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  systemBubble: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  selectedBubble: {
    backgroundColor: '#E8F5E9',
  },
  senderName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 16,
    color: '#212121',
    lineHeight: 22,
  },
  systemMessageText: {
    fontSize: 14,
    color: '#757575',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  timestampContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timestamp: {
    fontSize: 10,
  },
  userTimestamp: {
    color: '#78909C',
  },
  otherTimestamp: {
    color: '#9E9E9E',
  },
  systemTimestamp: {
    display: 'none',
  },
  readReceipt: {
    fontSize: 9,
    color: '#4CAF50',
    marginLeft: 4,
    fontStyle: 'italic',
  },
  reactionsContainer: {
    flexDirection: 'row',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  reactionBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 4,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 12,
    marginLeft: 2,
    color: '#616161',
  },
  replyContainer: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  replyLine: {
    width: 2,
    backgroundColor: '#2196F3',
    marginRight: 8,
    borderRadius: 1,
  },
  replyContent: {
    flex: 1,
  },
  replyName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 2,
  },
  replyText: {
    fontSize: 12,
    color: '#757575',
  },
  attachmentsContainer: {
    marginTop: 8,
    marginBottom: 4,
    maxWidth: 280,
    alignSelf: 'center',
  },
  imageAttachmentContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 4,
    backgroundColor: '#f0f0f0',
    position: 'relative',
    width: '100%',
    aspectRatio: 1.5,
    maxHeight: 250,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageAttachment: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    maxWidth: 280,
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    padding: 4,
  },
  fileAttachmentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
  },
  fileAttachmentDetails: {
    flex: 1,
    marginHorizontal: 10,
  },
  fileAttachmentName: {
    fontSize: 14,
    color: '#212121',
    fontWeight: '500',
  },
  fileAttachmentSize: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  voiceAttachmentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    borderRadius: 16,
    padding: 8,
    marginBottom: 4,
  },
  voicePlayButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceWaveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    height: 30,
    marginHorizontal: 12,
  },
  voiceWaveformBar: {
    width: 3,
    height: 12,
    backgroundColor: '#2196F3',
    borderRadius: 1.5,
  },
  voiceDuration: {
    fontSize: 12,
    color: '#757575',
    marginLeft: 4,
  },
  genericAttachmentContainer: {
    padding: 10,
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    borderRadius: 8,
    marginBottom: 4,
    alignItems: 'center',
  },
  genericAttachmentText: {
    color: '#2196F3',
    fontWeight: '500',
  },
  mentionText: {
    fontWeight: 'bold',
    color: '#1E88E5',
  },
  mentionHighlight: {
    fontWeight: 'bold',
    backgroundColor: '#FFF9C4',
    color: '#1E88E5',
    borderRadius: 4,
    paddingHorizontal: 2,
  },
  linkText: {
    color: '#0D47A1',
    textDecorationLine: 'underline',
  },
  optimisticBubble: {
    opacity: 0.7,
  },
});

export default MessageBubble;
