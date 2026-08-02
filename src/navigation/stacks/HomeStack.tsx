import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../../screens/home/HomeScreen';
import MatchDetailScreen from '../../screens/matches/MatchDetailScreen';
import MatchRecapScreen from '../../screens/matches/MatchRecapScreen';
import RatePlayersScreen from '../../screens/matches/RatePlayersScreen';
import GameDayPitchScreen from '../../screens/matches/GameDayPitchScreen';
import TrainingDetailScreen from '../../screens/teams/TrainingDetailScreen';

export type HomeStackParamList = {
  HomeRoot: undefined;
  MatchDetail: { teamId: string; matchId: string; title?: string; role?: string; linkedPlayerId?: string };
  MatchRecap: { teamId: string; matchId: string; teamName?: string };
  RatePlayers: { teamId: string; matchId: string; opponent?: string; matchDateISO?: string };
  GameDayPitch: { teamId: string; matchId: string; role?: string };
  TrainingDetail: { teamId: string; trainingId?: string; role?: string };
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="HomeRoot" component={HomeScreen} options={{ headerShown: false, title: 'Home' }} />
      <Stack.Screen
        name="MatchDetail"
        component={MatchDetailScreen}
        options={({ route }) => ({ title: route.params.title || 'Match' })}
      />
      <Stack.Screen
        name="MatchRecap"
        component={MatchRecapScreen}
        options={{ title: 'Match Recap' }}
      />
      <Stack.Screen
        name="RatePlayers"
        component={RatePlayersScreen}
        options={{ title: 'Rate Players' }}
      />
      <Stack.Screen
        name="GameDayPitch"
        component={GameDayPitchScreen}
        options={{ title: 'Game Day' }}
      />
      <Stack.Screen
        name="TrainingDetail"
        component={TrainingDetailScreen}
        options={({ route }) => ({
          title: route.params.role === 'parent'
            ? 'Training'
            : route.params.trainingId ? 'Edit Session' : 'New Session',
        })}
      />
    </Stack.Navigator>
  );
}
