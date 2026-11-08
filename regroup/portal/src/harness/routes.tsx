import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Routes } from '@mobile/navigation/types';
import Disputes from '@mobile/screens/Disputes/Disputes';
import DocumentListScreen from '@mobile/screens/Documents/DocumentListScreen';
import GuestList from '@mobile/screens/GuestList/GuestList';
import HouseSummary from '@mobile/screens/HouseOverview/HouseSummary/HouseSummary';
import PaymentDashboard from '@mobile/screens/HouseSettings/PaymentDashboard';

const Stack = createNativeStackNavigator<any>();

export const Screens = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name={Routes.GuestList} component={GuestList} />
    <Stack.Screen name={Routes.HouseDisputes} component={Disputes} />
    <Stack.Screen name={Routes.PaymentDashboard} component={PaymentDashboard} />
    <Stack.Screen name={Routes.Documents} component={DocumentListScreen} />
    <Stack.Screen name={Routes.HouseSummary} component={HouseSummary} />
  </Stack.Navigator>
);
