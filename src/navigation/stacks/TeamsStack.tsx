import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TeamsScreen from '../../screens/TeamsScreen';
import TeamDetailScreen from '../../screens/teams/TeamDetailScreen';
import MatchDetailScreen from '../../screens/matches/MatchDetailScreen';
import GameDayPitchScreen from '../../screens/matches/GameDayPitchScreen';
import StatsScreen from '../../screens/teams/StatsScreen';
import PlayerProfileScreen from '../../screens/teams/PlayerProfileScreen';
import ClubSettingsScreen from '../../screens/club/ClubSettingsScreen';
import StaffListScreen from '../../screens/club/StaffListScreen';
import StaffProfileScreen from '../../screens/club/StaffProfileScreen';
import ClubPlayersScreen from '../../screens/club/ClubPlayersScreen';

export type TeamsStackParamList = {
  TeamsHome: undefined;
  TeamDetail: { teamId: string; teamName?: string; role?: string };
  MatchDetail: { teamId: string; matchId: string; title?: string; role?: string };
  GameDayPitch: { teamId: string; matchId: string; role?: string };
  TeamStats: { teamId: string; teamName?: string };
  PlayerProfile: {
    teamId: string;
    playerId: string;
    playerName: string;
    playerNumber?: string;
    playerPosition?: string;
    avatarUrl?: string;
    clubId?: string;
  };
  ClubSettings: { clubId: string; clubName?: string };
  StaffList: { clubId: string; clubName?: string; viewerRole?: string };
  StaffProfile: { clubId: string; memberId: string; memberName?: string; viewerRole?: string };
  ClubPlayers: { clubId: string; clubName?: string };
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
      <Stack.Screen
        name="PlayerProfile"
        component={PlayerProfileScreen}
        options={({ route }) => ({ title: route.params.playerName || 'Player' })}
      />
      <Stack.Screen
        name="ClubSettings"
        component={ClubSettingsScreen}
        options={({ route }) => ({ title: route.params.clubName || 'Club Settings' })}
      />
      <Stack.Screen
        name="StaffList"
        component={StaffListScreen}
        options={({ route }) => ({ title: route.params.clubName || 'Staff' })}
      />
      <Stack.Screen
        name="StaffProfile"
        component={StaffProfileScreen}
        options={({ route }) => ({ title: route.params.memberName || 'Staff Member' })}
      />
      <Stack.Screen
        name="ClubPlayers"
        component={ClubPlayersScreen}
        options={({ route }) => ({ title: `${route.params.clubName || 'Club'} Players` })}
      />
    </Stack.Navigator>
  );
}
