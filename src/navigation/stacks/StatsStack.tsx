import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import GlobalStatsScreen from '../../screens/stats/StatsScreen';
import TeamStatsScreen from '../../screens/teams/StatsScreen';

export type StatsStackParamList = {
  StatsHome: undefined;
  TeamStats: { teamId: string; teamName?: string };
};

const Stack = createNativeStackNavigator<StatsStackParamList>();

export default function StatsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="StatsHome" component={GlobalStatsScreen} options={{ title: 'Stats' }} />
      <Stack.Screen
        name="TeamStats"
        component={TeamStatsScreen}
        options={({ route }) => ({ title: `${route.params.teamName || 'Team'} Stats` })}
      />
    </Stack.Navigator>
  );
}
