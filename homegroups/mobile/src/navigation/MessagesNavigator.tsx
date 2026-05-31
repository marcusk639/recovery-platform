import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';

// Import types
import {MessagesStackParamList} from '../types/navigation';

// Import screens
import ConversationsListScreen from '../screens/messages/ConversationsListScreen';
import DirectMessageScreen from '../screens/messages/DirectMessageScreen';
import ChatMediaPickerScreen from '../components/chat/ChatMediaPickerScreen';
import UnifiedInboxScreen from '../screens/messages/UnifiedInboxScreen';

const Stack = createStackNavigator<MessagesStackParamList>();

const MessagesNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      initialRouteName="UnifiedInbox"
      screenOptions={{
        headerBackTitle: 'Back',
        headerTitleAlign: 'center',
      }}>
      <Stack.Screen
        name="UnifiedInbox"
        component={UnifiedInboxScreen}
        options={{
          title: 'Inbox',
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="ConversationsList"
        component={ConversationsListScreen}
        options={{
          title: 'Messages',
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="DirectMessage"
        component={DirectMessageScreen}
        options={({route}) => ({
          title: route.params.otherUserName || 'Message',
          headerShown: true,
        })}
      />
      <Stack.Screen
        name="ChatMediaPicker"
        component={ChatMediaPickerScreen}
        options={{
          title: 'Choose Media',
          presentation: 'modal',
        }}
      />
    </Stack.Navigator>
  );
};

export default MessagesNavigator;

