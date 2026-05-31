import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';

import {IntergroupStackParamList} from '../types/navigation';

// V4.4: Intergroup screens
import IntergroupDashboardScreen from '../screens/intergroup/IntergroupDashboardScreen';
import IntergroupGroupsScreen from '../screens/intergroup/IntergroupGroupsScreen';
import IntergroupAnnouncementScreen from '../screens/intergroup/IntergroupAnnouncementScreen';
import IntergroupSSOScreen from '../screens/intergroup/IntergroupSSOScreen';
import FacilityDashboardScreen from '../screens/intergroup/FacilityDashboardScreen';

const Stack = createStackNavigator<IntergroupStackParamList>();

const IntergroupNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerBackTitle: 'Back',
        headerTitleAlign: 'center',
      }}>
      <Stack.Screen
        name="IntergroupDashboard"
        component={IntergroupDashboardScreen}
        options={({route}) => ({
          title: 'Intergroup Dashboard',
        })}
      />
      <Stack.Screen
        name="IntergroupGroups"
        component={IntergroupGroupsScreen}
        options={{
          title: 'Affiliated Groups',
        }}
      />
      {/* IntergroupGroupDetail — navigates to GroupOverview in the main stack */}
      <Stack.Screen
        name="IntergroupAnnouncement"
        component={IntergroupAnnouncementScreen}
        options={{
          title: 'Compose Announcement',
        }}
      />
      <Stack.Screen
        name="FacilityDashboard"
        component={FacilityDashboardScreen}
        options={{
          title: 'Facility Dashboard',
        }}
      />
      <Stack.Screen
        name="IntergroupSSO"
        component={IntergroupSSOScreen}
        options={{
          title: 'SSO / Auto-Join Settings',
        }}
      />
    </Stack.Navigator>
  );
};

export default IntergroupNavigator;
