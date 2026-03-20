import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TeamsScreen from '../../screens/TeamsScreen';
import TeamDetailScreen from '../../screens/teams/TeamDetailScreen';
import MatchDetailScreen from '../../screens/matches/MatchDetailScreen';
import GameDayPitchScreen from '../../screens/matches/GameDayPitchScreen';
import StatsScreen from '../../screens/teams/StatsScreen';

export type TeamsStackParamList = {
  TeamsHome: undefined;
  TeamDetail: { teamId: string; teamName?: string };
  MatchDetail: { teamId: string; matchId: string; title?: string };
  GameDayPitch: { teamId: string; matchId: string };
  TeamStats: { teamId: string; teamName?: string };
};

const Stack = createNativeStackNavigator<TeamsStackParamList>();

export default function TeamsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="TeamsHome" component={TeamsScreen} options={{ title: 'Teams' }} />
      <Stack.Screen
        name="TeamDetail"
        component={TeamDetailScreen}
        options={({ route }) => ({ title: route.params.teamName || 'Team' })}
      />
      <Stack.Screen
  	name="MatchDetail"
  	component={MatchDetailScreen}
  	options={({ route }) => ({ title: route.params.title || 'Match' })} 
      />

      <Stack.Screen
        name="GameDayPitch"
        component={GameDayPitchScreen}
        options={{ title: 'Game Day' }}
      />
      <Stack.Screen
        name="TeamStats"
        component={StatsScreen}
        options={({ route }) => ({ title: `${route.params.teamName || 'Team'} Stats` })}
      />
    </Stack.Navigator>
  );
}

