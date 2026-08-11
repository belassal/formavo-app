import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TeamsScreen from '../../screens/TeamsScreen';
import TeamDetailScreen from '../../screens/teams/TeamDetailScreen';
import MatchDetailScreen from '../../screens/matches/MatchDetailScreen';
import MatchRecapScreen from '../../screens/matches/MatchRecapScreen';
import RatePlayersScreen from '../../screens/matches/RatePlayersScreen';
import GameDayPitchScreen from '../../screens/matches/GameDayPitchScreen';
import StatsScreen from '../../screens/teams/StatsScreen';
import PlayerProfileScreen from '../../screens/teams/PlayerProfileScreen';
import ClubSettingsScreen from '../../screens/club/ClubSettingsScreen';
import StaffListScreen from '../../screens/club/StaffListScreen';
import StaffProfileScreen from '../../screens/club/StaffProfileScreen';
import ClubPlayersScreen from '../../screens/club/ClubPlayersScreen';
import PlayerEditScreen from '../../screens/teams/PlayerEditScreen';
import TrainingDetailScreen from '../../screens/teams/TrainingDetailScreen';
import TeamChatScreen from '../../screens/teams/TeamChatScreen';
import TeamScheduleScreen from '../../screens/teams/TeamScheduleScreen';
import TeamPhotosScreen from '../../screens/teams/TeamPhotosScreen';
import PlayerAttendanceScreen from '../../screens/teams/PlayerAttendanceScreen';
import PlayerSeasonCardScreen from '../../screens/teams/PlayerSeasonCardScreen';
import PlayerReportScreen from '../../screens/teams/PlayerReportScreen';
import OpponentHistoryScreen from '../../screens/teams/OpponentHistoryScreen';
import ClubDashboardScreen from '../../screens/club/ClubDashboardScreen';
import ClubReportsScreen from '../../screens/club/ClubReportsScreen';
import FixtureImportScreen from '../../screens/teams/FixtureImportScreen';
import TryoutsScreen from '../../screens/club/TryoutsScreen';
import TryoutDetailScreen from '../../screens/club/TryoutDetailScreen';

export type TeamsStackParamList = {
  TeamsHome: undefined;
  TeamDetail: { teamId: string; teamName?: string; role?: string; parentTeams?: { id: string; teamName: string }[] };
  MatchDetail: { teamId: string; matchId: string; title?: string; role?: string; linkedPlayerId?: string };
  MatchRecap: { teamId: string; matchId: string; teamName?: string };
  RatePlayers: { teamId: string; matchId: string; opponent?: string; matchDateISO?: string };
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
  ClubDashboard: { clubId: string; clubName: string; viewerRole?: string };
  ClubReports: { clubId: string; clubName?: string };
  FixtureImport: { teamId: string; seasonId?: string };
  Tryouts: { clubId: string; clubName?: string };
  TryoutDetail: { clubId: string; tryoutId: string; tryoutName?: string };
  ClubSettings: { clubId: string; clubName?: string };
  StaffList: { clubId: string; clubName?: string; viewerRole?: string };
  StaffProfile: { clubId: string; memberId: string; memberName?: string; viewerRole?: string };
  ClubPlayers: { clubId: string; clubName?: string };
  PlayerEdit: { clubId: string; playerId: string; playerName?: string };
  TrainingDetail: { teamId: string; trainingId?: string; role?: string };
  TeamChat: { teamId: string; teamName?: string; role?: string };
  TeamSchedule: { teamId: string; teamName?: string; role?: string };
  TeamPhotos: { teamId: string; teamName?: string; role?: string };
  PlayerAttendance: { teamId: string; playerId: string; playerName: string };
  PlayerSeasonCard: import('../../screens/teams/PlayerSeasonCardScreen').SeasonCardParams;
  PlayerReport: import('../../screens/teams/PlayerReportScreen').PlayerReportParams;
  OpponentHistory: { teamId: string; teamName?: string };
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
        name="ClubDashboard"
        component={ClubDashboardScreen}
        options={({ route }) => ({ title: `${route.params.clubName} Dashboard` })}
      />
      <Stack.Screen
        name="ClubReports"
        component={ClubReportsScreen}
        options={{ title: 'Club Reports' }}
      />
      <Stack.Screen
        name="FixtureImport"
        component={FixtureImportScreen}
        options={{ title: 'Import Fixtures' }}
      />
      <Stack.Screen
        name="Tryouts"
        component={TryoutsScreen}
        options={{ title: 'Tryouts' }}
      />
      <Stack.Screen
        name="TryoutDetail"
        component={TryoutDetailScreen}
        options={({ route }) => ({ title: route.params.tryoutName || 'Tryout' })}
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
      <Stack.Screen
        name="PlayerEdit"
        component={PlayerEditScreen}
        options={({ route }) => ({ title: route.params.playerName ? `Edit ${route.params.playerName}` : 'Edit Player' })}
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
      <Stack.Screen
        name="TeamChat"
        component={TeamChatScreen}
        options={({ route }) => ({ title: `${route.params.teamName || 'Team'} Chat` })}
      />
      <Stack.Screen
        name="TeamSchedule"
        component={TeamScheduleScreen}
        options={({ route }) => ({ title: `${route.params.teamName || 'Team'} Schedule` })}
      />
      <Stack.Screen
        name="TeamPhotos"
        component={TeamPhotosScreen}
        options={({ route }) => ({ title: `${route.params.teamName || 'Team'} Photos` })}
      />
      <Stack.Screen
        name="PlayerAttendance"
        component={PlayerAttendanceScreen}
        options={({ route }) => ({ title: `${route.params.playerName} Attendance` })}
      />
      <Stack.Screen
        name="PlayerSeasonCard"
        component={PlayerSeasonCardScreen}
        options={{ title: 'Season Card' }}
      />
      <Stack.Screen
        name="PlayerReport"
        component={PlayerReportScreen}
        options={{ title: 'Season Report' }}
      />
      <Stack.Screen
        name="OpponentHistory"
        component={OpponentHistoryScreen}
        options={({ route }) => ({ title: `${route.params.teamName || 'Team'} vs History` })}
      />
    </Stack.Navigator>
  );
}
