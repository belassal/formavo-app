import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import { useNavigation } from '@react-navigation/native';

import { listenMyTeams } from '../../services/teamService';
import { listenMatches } from '../../services/matchService';

type TeamRow = { id: string; teamName?: string };

export default function MatchesScreen() {
  const navigation = useNavigation<any>();
  const uid = useMemo(() => auth().currentUser?.uid ?? null, []);

  const [loading, setLoading] = useState(true);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState<string>('');

  const [matches, setMatches] = useState<any[]>([]);

  // teams
  useEffect(() => {
    if (!uid) return;

    const unsub = listenMyTeams(uid, (rows) => {
      const t = rows as TeamRow[];
      setTeams(t);

      // auto-select first team
      if (!selectedTeamId && t.length > 0) {
        setSelectedTeamId(t[0].id);
        setSelectedTeamName(t[0].teamName || 'Team');
      }

      setLoading(false);
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // matches for selected team
  useEffect(() => {
    if (!selectedTeamId) {
      setMatches([]);
      return;
    }

    const unsub = listenMatches(selectedTeamId, (rows) => {
      const visible = (rows || []).filter((m: any) => !m.isDeleted);
      setMatches(visible);
    });

    return () => unsub();
  }, [selectedTeamId]);

  const selectTeam = (t: TeamRow) => {
    setSelectedTeamId(t.id);
    setSelectedTeamName(t.teamName || 'Team');
  };

  const pill = (label: string) => (
    <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderRadius: 999 }}>
      <Text style={{ fontWeight: '800', fontSize: 12 }}>{label}</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (teams.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, padding: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: '800' }}>Matches</Text>
        <Text style={{ marginTop: 12, color: '#666' }}>
          No teams yet. Create a team first, then you can create matches.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '800' }}>Matches</Text>

      {/* Team picker */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        {teams.map((t) => {
          const active = t.id === selectedTeamId;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => selectTeam(t)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderWidth: 1,
                borderRadius: 999,
                backgroundColor: active ? '#111' : 'transparent',
              }}
            >
              <Text style={{ fontWeight: '800', color: active ? 'white' : '#111' }}>
                {t.teamName || 'Team'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={{ marginTop: 14, fontSize: 16, fontWeight: '800' }}>{selectedTeamName}</Text>

      {matches.length === 0 ? (
        <Text style={{ marginTop: 12, color: '#666' }}>
          No matches for this team yet. Go to the team and create a match.
        </Text>
      ) : (
        <FlatList
          style={{ marginTop: 12 }}
          data={matches}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => {
            const count = Number.isFinite(item?.rosterCount) ? item.rosterCount : 0;

            const st = String(item.status || 'scheduled');
            const hg = Number.isFinite(item.homeScore) ? item.homeScore : 0;
            const ag = Number.isFinite(item.awayScore) ? item.awayScore : 0;

            let rightLabel = 'Scheduled';
            if (st === 'live') rightLabel = `LIVE ${hg}-${ag}`;
            if (st === 'completed') rightLabel = `FT ${hg}-${ag}`;

            return (
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('Teams', {
                    screen: 'MatchDetail',
                    params: {
                      teamId: selectedTeamId,
                      matchId: item.id,
                      title: `${selectedTeamName} vs ${item.opponent || 'Opponent'}`,
                    },
                  })
                }
                style={{ borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800' }}>
                      vs {item.opponent || 'Opponent'}
                    </Text>

                    <Text style={{ marginTop: 4, color: '#666' }}>
                      {item.dateISO || ''}
                      {item.location ? ` · ${item.location}` : ''}
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end', gap: 8 }}>
                    {pill(rightLabel)}
                    {pill(`${count} players`)}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}

        />
      )}
    </SafeAreaView>
  );
}
