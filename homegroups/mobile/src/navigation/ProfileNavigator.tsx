// src/navigation/ProfileNavigator.tsx
import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';

import ProfileScreen from '../screens/profile/ProfileScreen';
import ProfileManagementScreen from '../screens/profile/ProfileManagementScreen';
import SobrietyTrackerScreen from '../screens/profile/SobrietyTrackerScreen';
import MySponsorshipsScreen from '../screens/sponsorship/MySponsorshipsScreen';
import GratitudeJournalScreen from '../screens/profile/GratitudeJournalScreen';
import CheckInStreakScreen from '../screens/profile/CheckInStreakScreen';
import StepTrackerScreen from '../screens/profile/StepTrackerScreen';
// V4.2: Content & Resources
import DailyReflectionScreen from '../screens/profile/DailyReflectionScreen';
import LiteratureIndexScreen from '../screens/profile/LiteratureIndexScreen';
import LiteratureDetailScreen from '../screens/profile/LiteratureDetailScreen';
import ContributeLiteratureScreen from '../screens/profile/ContributeLiteratureScreen';
import SobrietyCalculatorScreen from '../screens/profile/SobrietyCalculatorScreen';
// V4.3: My Recovery Journey
import MyRecoveryJourneyScreen from '../screens/profile/MyRecoveryJourneyScreen';
// import ChangePasswordScreen from '../screens/profile/ChangePasswordScreen';
// import EmailVerificationScreen from '../screens/profile/EmailVerificationScreen';

const Stack = createStackNavigator();

const ProfileNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="ProfileMain"
      screenOptions={{
        headerShown: false,
      }}>
      <Stack.Screen
        name="ProfileMain"
        component={ProfileScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="ProfileManagement"
        component={ProfileManagementScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="SobrietyTracker"
        component={SobrietyTrackerScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="MySponsorships"
        component={MySponsorshipsScreen}
        options={{
          headerShown: true,
          title: 'My Sponsorships',
        }}
      />
      <Stack.Screen
        name="GratitudeJournal"
        component={GratitudeJournalScreen}
        options={{
          headerShown: true,
          title: 'Gratitude Journal',
        }}
      />
      <Stack.Screen
        name="CheckInStreak"
        component={CheckInStreakScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="StepTracker"
        component={StepTrackerScreen}
        options={{
          headerShown: true,
          title: 'Step Work',
        }}
      />
      {/* V4.2: Content & Resources */}
      <Stack.Screen
        name="DailyReflection"
        component={DailyReflectionScreen}
        options={{
          headerShown: true,
          title: "Today's Reflection",
        }}
      />
      <Stack.Screen
        name="LiteratureIndex"
        component={LiteratureIndexScreen}
        options={{
          headerShown: true,
          title: 'Literature & Resources',
        }}
      />
      <Stack.Screen
        name="LiteratureDetail"
        component={LiteratureDetailScreen}
        options={{
          headerShown: true,
          title: 'Resource',
        }}
      />
      <Stack.Screen
        name="ContributeLiterature"
        component={ContributeLiteratureScreen}
        options={{
          headerShown: true,
          title: 'Contribute Resource',
        }}
      />
      <Stack.Screen
        name="SobrietyCalculator"
        component={SobrietyCalculatorScreen}
        options={{
          headerShown: true,
          title: 'Sobriety Calculator',
        }}
      />
      {/* V4.3: My Recovery Journey */}
      <Stack.Screen
        name="MyRecoveryJourney"
        component={MyRecoveryJourneyScreen}
        options={{
          headerShown: true,
          title: 'My Recovery Journey',
        }}
      />
      {/* <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen
        name="EmailVerification"
        component={EmailVerificationScreen} */}
      {/* /> */}
    </Stack.Navigator>
  );
};

export default ProfileNavigator;
