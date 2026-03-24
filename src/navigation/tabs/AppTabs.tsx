import React from 'react';
import { Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MatchesScreen from '../../screens/matches/MatchesScreen';
import ProfileScreen from '../../screens/profile/ProfileScreen';
import TeamsStack from '../stacks/TeamsStack';
import StatsStack from '../stacks/StatsStack';
import { B } from '../../constants/brand';

export type AppTabsParamList = {
  Teams: undefined;
  Matches: undefined;
  Stats: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<AppTabsParamList>();

const TAB_ICONS: Record<string, string> = {
  Teams:   '⚽',
  Matches: '📅',
  Stats:   '📊',
  Profile: '👤',
};

export default function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => (
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18 }}>{TAB_ICONS[route.name]}</Text>
            {focused && (
              <View style={{
                width: 4, height: 4, borderRadius: 2,
                backgroundColor: B.green, marginTop: 3,
              }} />
            )}
          </View>
        ),
        tabBarLabel: ({ focused, color }) => (
          <Text style={{
            fontSize: 10,
            fontWeight: focused ? '700' : '500',
            color: focused ? B.green : B.inkFaint,
            marginBottom: 2,
          }}>
            {route.name}
          </Text>
        ),
        tabBarActiveTintColor: B.green,
        tabBarInactiveTintColor: B.inkFaint,
        tabBarStyle: {
          backgroundColor: B.navy,
          borderTopColor: B.navyBorder,
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 12,
          paddingTop: 8,
        },
        headerStyle: { backgroundColor: B.navy },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      })}
    >
      <Tab.Screen name="Teams"   component={TeamsStack}    options={{ headerShown: false }} />
      <Tab.Screen name="Matches" component={MatchesScreen} options={{ headerStyle: { backgroundColor: B.navy }, headerTintColor: '#fff' }} />
      <Tab.Screen name="Stats"   component={StatsStack}    options={{ headerShown: false }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ headerStyle: { backgroundColor: B.navy }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }} />
    </Tab.Navigator>
  );
}
