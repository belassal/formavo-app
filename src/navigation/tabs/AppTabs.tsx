import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MatchesScreen from '../../screens/matches/MatchesScreen';
import ProfileScreen from '../../screens/profile/ProfileScreen';
import TeamsStack from '../stacks/TeamsStack';
import StatsStack from '../stacks/StatsStack';

export type AppTabsParamList = {
  Teams: undefined;
  Matches: undefined;
  Stats: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<AppTabsParamList>();

export default function AppTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Teams" component={TeamsStack} options={{ headerShown: false }} />
      <Tab.Screen name="Matches" component={MatchesScreen} />
      <Tab.Screen name="Stats" component={StatsStack} options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
