import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import TeamsScreen from '../../screens/TeamsScreen';
import MatchesScreen from '../../screens/matches/MatchesScreen';
import StatsScreen from '../../screens/stats/StatsScreen';
import ProfileScreen from '../../screens/profile/ProfileScreen';

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
      <Tab.Screen name="Teams" component={TeamsScreen} />
      <Tab.Screen name="Matches" component={MatchesScreen} />
      <Tab.Screen name="Stats" component={StatsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

