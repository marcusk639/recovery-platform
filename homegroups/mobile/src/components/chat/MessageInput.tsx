import React, {useRef} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {DirectMessage} from '../../types';
import {ChatMessage} from '../../models/ChatModel';

type Message = ChatMessage | DirectMessage;

export interface MessageInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAttach?: () => void;
  replyingTo?: Message | null;
  onCancelReply?: () => void;
  placeholder?: string;
  showAttachButton?: boolean;
  inputRef?: React.RefObject<TextInput>;
}

const MessageInput: React.FC<MessageInputProps> = ({
  value,
  onChangeText,
  onSend,
  onAttach,
  replyingTo,
  onCancelReply,
  placeholder = 'Type a message...',
  showAttachButton = true,
  inputRef,
}) => {
  const internalInputRef = useRef<TextInput>(null);
  const inputHeight = useRef(new Animated.Value(50)).current;
  const actualInputRef = inputRef || internalInputRef;

  const handleInputFocus = () => {
    Animated.timing(inputHeight, {
      toValue: 60,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const handleInputBlur = () => {
    Animated.timing(inputHeight, {
      toValue: 50,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  return (
    <View style={styles.inputContainer}>
      {replyingTo && (
        <View
          style={styles.replyInputContainer}
          testID="chat-replying-to-banner">
          <View style={styles.replyInputContent}>
            <Text style={styles.replyInputLabel}>
              Replying to {replyingTo.senderName}
            </Text>
            <Text style={styles.replyInputText} numberOfLines={1}>
              {replyingTo.text}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.cancelReplyButton}
            onPress={onCancelReply}
            testID="chat-cancel-reply-button">
            <Icon name="close" size={16} color="#9E9E9E" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputRow}>
        {showAttachButton && (
          <TouchableOpacity
            style={styles.attachButton}
            onPress={onAttach}
            testID="chat-attach-button">
            <Icon name="plus" size={24} color="#2196F3" />
          </TouchableOpacity>
        )}

        <Animated.View
          style={[styles.textInputContainer, {height: inputHeight}]}>
          <TextInput
            ref={actualInputRef}
            style={styles.textInput}
            placeholder={placeholder}
            value={value}
            onChangeText={onChangeText}
            multiline
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            testID="dm-message-input"
          />
        </Animated.View>

        <TouchableOpacity
          style={styles.sendButton}
          onPress={onSend}
          disabled={!value.trim()}
          testID="dm-send-button">
          <Icon
            name="send"
            size={24}
            color={value.trim() ? '#2196F3' : '#BDBDBD'}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  inputContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    padding: 8,
  },
  replyInputContainer: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  replyInputContent: {
    flex: 1,
  },
  replyInputLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  replyInputText: {
    fontSize: 12,
    color: '#757575',
  },
  cancelReplyButton: {
    padding: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attachButton: {
    padding: 8,
    marginRight: 8,
  },
  textInputContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 20,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  textInput: {
    fontSize: 16,
    maxHeight: 100,
    color: '#212121',
  },
  sendButton: {
    padding: 8,
    marginLeft: 8,
  },
});

export default MessageInput;
