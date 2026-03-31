import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SettingsScreen from '../../screens/settings/SettingsScreen';
import ProfileScreen from '../../screens/profile/ProfileScreen';
import LocationsScreen from '../../screens/settings/LocationsScreen';

export type SettingsStackParamList = {
  SettingsHome: undefined;
  Profile: undefined;
  Locations: undefined;
};

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export default function SettingsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="SettingsHome" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      <Stack.Screen name="Locations" component={LocationsScreen} options={{ title: 'Locations' }} />
    </Stack.Navigator>
  );
}
