import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';
import { listenClubPlayers, type ClubPlayer } from '../../services/clubPlayerService';
import { db } from '../../services/firebase';
import { COL } from '../../models/collections';
import Avatar from '../../components/Avatar';

type Route = RouteProp<TeamsStackParamList, 'ClubPlayers'>;
type Nav = NativeStackNavigationProp<TeamsStackParamList>;

export default function ClubPlayersScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { clubId, clubName } = route.params;

  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [teamMap, setTeamMap] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Load all club players
  useEffect(() => {
    const unsub = listenClubPlayers(clubId, (rows) => {
      setPlayers(rows);
      setLoading(false);
    });
    return () => unsub();
  }, [clubId]);

  // Build playerId → teamName map from all team memberships
  useEffect(() => {
    const buildTeamMap = async () => {
      const teamsSnap = await db
        .collection(COL.teams)
        .where('clubId', '==', clubId)
        .get();

      const map: Record<string, string> = {};

      await Promise.all(
        teamsSnap.docs.map(async (teamDoc) => {
          const teamName = teamDoc.data().name || 'Unknown Team';
          const membSnap = await db
            .collection(COL.teams)
            .doc(teamDoc.id)
            .collection(COL.playerMemberships)
            .where('status', '==', 'active')
            .get();

          membSnap.docs.forEach((m) => {
            if (!map[m.id]) map[m.id] = teamName;
          });
        }),
      );

      setTeamMap(map);
    };

    buildTeamMap().catch(console.warn);
  }, [clubId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => p.name.toLowerCase().includes(q));
  }, [players, search]);

  // Group by first letter
  const grouped = useMemo(() => {
    const groups: { letter: string; players: ClubPlayer[] }[] = [];
    let currentLetter = '';
    for (const p of filtered) {
      const letter = (p.name[0] || '#').toUpperCase();
      if (letter !== currentLetter) {
        currentLetter = letter;
        groups.push({ letter, players: [p] });
      } else {
        groups[groups.length - 1].players.push(p);
      }
    }
    return groups;
  }, [filtered]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      {/* Search bar */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search players..."
          placeholderTextColor="#9ca3af"
          style={{
            backgroundColor: '#fff',
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 10,
            fontSize: 15,
            borderWidth: 1,
            borderColor: '#e5e7eb',
            color: '#111',
          }}
        />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>👤</Text>
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#111', textAlign: 'center' }}>
            {search ? 'No players found' : 'No players yet'}
          </Text>
          <Text style={{ fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 8 }}>
            {search ? 'Try a different name' : 'Players are added when you build a team roster'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          {/* Player count */}
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#9ca3af', marginBottom: 4 }}>
            {filtered.length} {filtered.length === 1 ? 'player' : 'players'}
          </Text>

          {grouped.map((group) => (
            <View key={group.letter}>
              {/* Letter header */}
              <Text style={{
                fontSize: 13, fontWeight: '700', color: '#9ca3af',
                marginTop: 8, marginBottom: 6, marginLeft: 4,
              }}>
                {group.letter}
              </Text>

              <View style={{
                backgroundColor: '#fff', borderRadius: 14,
                borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden',
              }}>
                {group.players.map((player, idx) => (
                  <TouchableOpacity
                    key={player.id}
                    onPress={() =>
                      navigation.navigate('PlayerProfile', {
                        teamId: '',
                        playerId: player.id,
                        playerName: player.name,
                        playerNumber: player.number || undefined,
                        playerPosition: player.position || undefined,
                        avatarUrl: player.avatarUrl || undefined,
                        clubId,
                      })
                    }
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderTopWidth: idx === 0 ? 0 : 1,
                      borderTopColor: '#f3f4f6',
                      gap: 12,
                    }}
                  >
                    <Avatar name={player.name} avatarUrl={player.avatarUrl ?? null} size={40} />

                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }}>{player.name}</Text>
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 2, alignItems: 'center' }}>
                        {player.number ? (
                          <Text style={{ fontSize: 12, color: '#6b7280' }}>#{player.number}</Text>
                        ) : null}
                        {player.position ? (
                          <Text style={{ fontSize: 12, color: '#6b7280' }}>{player.position}</Text>
                        ) : null}
                        {teamMap[player.id] ? (
                          <View style={{
                            paddingVertical: 2, paddingHorizontal: 8,
                            backgroundColor: '#f3f4f6', borderRadius: 999,
                          }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#374151' }}>
                              {teamMap[player.id]}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    <Text style={{ fontSize: 18, color: '#d1d5db' }}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
