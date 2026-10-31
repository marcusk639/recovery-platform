/**
 * useChatLogic - Custom hook for chat management logic
 *
 * Phase 4.1: Extracted from BaseChat.tsx (575 LOC)
 * Contains keyboard management, message handling, and navigation logic
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Keyboard,
  Dimensions,
  EmitterSubscription,
  KeyboardEvent,
} from 'react-native';
import { callNumber } from '../../../util/phone';
import { Message } from '../../../entities/Message';
import { User } from '../../../entities/User';
import { House } from '../../../entities/House';
import { Guest } from '../../../entities/Guest';
import Admin from '../../../entities/Admin';
import { IOS } from '../../../util/platform';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Routes, RootStackParamList } from '../../../navigation/types';
import * as uuid from 'uuid';

interface UseChatLogicProps {
  navigation: NativeStackNavigationProp<RootStackParamList>;
  user: User;
  house: House;
  recipient: Guest | Admin;
  selectGuest: (id: string, state?: any) => any;
}

export const useChatLogic = ({
  navigation,
  user,
  house,
  recipient,
  selectGuest,
}: UseChatLogicProps) => {
  // State management
  const [keyboard, setKeyboard] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [shortHeight, setShortHeight] = useState(0);
  const [text, setText] = useState('');

  // Refs for listeners
  const keyboardDidShowListenerRef = useRef<EmitterSubscription | null>(null);
  const keyboardDidHideListenerRef = useRef<EmitterSubscription | null>(null);

  // Keyboard event handlers
  const keyboardDidShow = useCallback((e: KeyboardEvent) => {
    setKeyboard(true);
    setKeyboardHeight(e.endCoordinates.height);
    setShortHeight(Dimensions.get('window').height - e.endCoordinates.height);
  }, []);

  const keyboardDidHide = useCallback((e: KeyboardEvent) => {
    setKeyboard(false);
    setKeyboardHeight(0);
    setShortHeight(Dimensions.get('window').height);
  }, []);

  // Keyboard lifecycle management. (IQKeyboardManager, which this screen
  // turned off while focused, is gone; the composer rides on a
  // keyboard-controller sticky view in BaseChat.)
  useEffect(() => {
    keyboardDidShowListenerRef.current = Keyboard.addListener(
      IOS ? 'keyboardWillShow' : 'keyboardDidShow',
      keyboardDidShow,
    );
    keyboardDidHideListenerRef.current = Keyboard.addListener(
      IOS ? 'keyboardWillHide' : 'keyboardDidHide',
      keyboardDidHide,
    );

    return () => {
      if (keyboardDidHideListenerRef.current) {
        keyboardDidHideListenerRef.current.remove();
      }
      if (keyboardDidShowListenerRef.current) {
        keyboardDidShowListenerRef.current.remove();
      }
    };
  }, [keyboardDidShow, keyboardDidHide]);

  // Phone dialing
  const dialNumber = useCallback((phoneNumber: string) => {
    callNumber(phoneNumber);
  }, []);

  // Message text setter
  const setMessage = useCallback((newText: string) => {
    setText(newText);
  }, []);

  // Navigate to guest profile
  const navigateToGuest = useCallback(
    (id: string) => {
      selectGuest(id, null);
      navigation.navigate(Routes.Guest);
    },
    [selectGuest, navigation],
  );

  // Create message object
  const createMessage = useCallback(
    (messageText: string, defaultValues: Partial<Message> = {}) => {
      const message = new Message(
        messageText,
        user.uid,
        `${user.firstName} ${user.lastName}`,
      );
      message._id = uuid.v4();
      message.id = message._id;
      message.houseId = house.id;
      message.recipientId = recipient ? recipient.userId : undefined;
      message.sortKey = 0 - Date.now();
      message.read = false;
      message.user = {
        _id: user.uid,
        name: `${user.firstName} ${user.lastName}`,
        avatar: user.avatar || '',
      };
      Object.assign(message, defaultValues);
      return [message];
    },
    [user, house, recipient],
  );

  return {
    // State
    keyboard,
    keyboardHeight,
    shortHeight,
    text,

    // Actions
    setMessage,
    createMessage,
    dialNumber,
    navigateToGuest,
  };
};
