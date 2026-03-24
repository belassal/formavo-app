import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { db } from '../../services/firebase';
import { COL } from '../../models/collections';
import Avatar from '../../components/Avatar';
import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';
import { getPlayerCareerStats, getClubPlayer, type CareerSeason, type ClubPlayer } from '../../services/clubPlayerService';
import { fetchPlayerRatings, type PlayerRating } from '../../services/ratingService';
import { fetchPlayerTrainingStats } from '../../services/trainingService';

type PlayerProfileRoute = RouteProp<TeamsStackParamList, 'PlayerProfile'>;
type Nav = NativeStackNavigationProp<TeamsStackParamList>;

type SeasonStats = {
  appearances: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
};

// Fetch stats for a single team (used when no clubId available)
async function fetchTeamStats(teamId: string, playerId: string): Promise<SeasonStats> {
  const stats: SeasonStats = { appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };

  const matchSnap = await db
    .collection(COL.teams).doc(teamId).collection(COL.matches).get();

  await Promise.all(
    matchSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((m) => !m.isDeleted)
      .map(async (match) => {
        const rosterDoc = await db
          .collection(COL.teams).doc(teamId).collection(COL.matches)
          .doc(match.id).collection(COL.roster).doc(playerId).get();

        if (rosterDoc.exists && (rosterDoc.data() as any)?.role === 'starter') {
          stats.appearances += 1;
        }

        const eventsSnap = await db
          .collection(COL.teams).doc(teamId).collection(COL.matches)
          .doc(match.id).collection(COL.events).get();

        for (const evDoc of eventsSnap.docs) {
          const ev = evDoc.data() as any;
          if (ev.type === 'goal' && ev.side === 'home') {
            if (ev.scorerId === playerId) stats.goals += 1;
            if (ev.assistId === playerId) stats.assists += 1;
          }
          if (ev.type === 'card' && ev.playerId === playerId) {
            if (ev.cardColor === 'yellow') stats.yellowCards += 1;
            if (ev.cardColor === 'red') stats.redCards += 1;
          }
        }
      }),
  );

  return stats;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6', gap: 12 }}>
      <Text style={{ width: 110, fontSize: 13, fontWeight: '500', color: '#9ca3af' }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 14, color: '#111' }}>{value}</Text>
    </View>
  );
}

function formatDobProfile(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // Calculate age
  const birth = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate())) age--;
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}, ${y}  (Age ${age})`;
}

function StatBox({ value, label, color = '#111', bg = '#fff' }: {
  value: number; label: string; color?: string; bg?: string;
}) {
  return (
    <View style={{
      flex: 1, backgroundColor: bg, borderRadius: 14,
      paddingVertical: 18, paddingHorizontal: 12, alignItems: 'center',
      borderWidth: 1, borderColor: '#e5e7eb',
    }}>
      <Text style={{ fontSize: 28, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af', marginTop: 4, textAlign: 'center' }}>
        {label}
      </Text>
    </View>
  );
}

function SeasonRow({ season }: { season: CareerSeason }) {
  return (
    <View style={{
      backgroundColor: '#fff', borderRadius: 14,
      borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden',
    }}>
      {/* Season header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
      }}>
        <View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#111' }}>{season.teamName}</Text>
          <Text style={{ fontSize: 12, fontWeight: '500', color: '#6b7280', marginTop: 2 }}>{season.seasonLabel}</Text>
        </View>
        <View style={{
          paddingVertical: 4, paddingHorizontal: 12,
          backgroundColor: '#f3f4f6', borderRadius: 999,
        }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>
            {season.appearances} apps
          </Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 20 }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#16a34a' }}>{season.goals}</Text>
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#9ca3af', marginTop: 2 }}>Goals</Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#2563eb' }}>{season.assists}</Text>
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#9ca3af', marginTop: 2 }}>Assists</Text>
        </View>
        {season.yellowCards > 0 && (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#ca8a04' }}>{season.yellowCards}</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#9ca3af', marginTop: 2 }}>Yellow</Text>
          </View>
        )}
        {season.redCards > 0 && (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#dc2626' }}>{season.redCards}</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#9ca3af', marginTop: 2 }}>Red</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function PlayerProfileScreen() {
  const route = useRoute<PlayerProfileRoute>();
  const navigation = useNavigation<Nav>();
  const { teamId, playerId, playerName, playerNumber, playerPosition, avatarUrl, clubId } = route.params;

  const [careerSeasons, setCareerSeasons] = useState<CareerSeason[]>([]);
  const [fallbackStats, setFallbackStats] = useState<SeasonStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [playerData, setPlayerData] = useState<ClubPlayer | null>(null);
  const [devLog, setDevLog] = useState<PlayerRating[]>([]);
  const [loadingLog, setLoadingLog] = useState(true);
  const [trainingStats, setTrainingStats] = useState<{ attended: number; total: number }>({ attended: 0, total: 0 });

  // Edit button + live title in header
  useLayoutEffect(() => {
    const liveName = playerData?.name ?? playerName;
    if (!clubId) return;
    navigation.setOptions({
      title: liveName,
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('PlayerEdit', { clubId, playerId, playerName: liveName })}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: '#007AFF' }}>Edit</Text>
        </TouchableOpacity>
      ),
    });
  }, [clubId, playerId, playerName, playerData, navigation]);

  // Reload player data every time this screen comes into focus
  // (covers returning from PlayerEditScreen)
  useFocusEffect(
    useCallback(() => {
      if (!clubId) return;
      getClubPlayer({ clubId, playerId }).then(setPlayerData).catch(console.warn);
    }, [clubId, playerId]),
  );

  useEffect(() => {
    fetchPlayerRatings(teamId, playerId)
      .then(setDevLog)
      .catch(() => setDevLog([]))
      .finally(() => setLoadingLog(false));
  }, [teamId, playerId]);

  useEffect(() => {
    fetchPlayerTrainingStats(teamId, playerId)
      .then(setTrainingStats)
      .catch(() => setTrainingStats(null));
  }, [teamId, playerId]);

  useEffect(() => {
    if (clubId) {
      getPlayerCareerStats({ clubId, playerId })
        .then(setCareerSeasons)
        .catch((err) => {
          console.warn('[PlayerProfile] career stats error', err);
          setCareerSeasons([]);
        })
        .finally(() => setLoading(false));
    } else {
      fetchTeamStats(teamId, playerId)
        .then(setFallbackStats)
        .catch(() => setFallbackStats({ appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 }))
        .finally(() => setLoading(false));
    }
  }, [clubId, teamId, playerId]);

  // Career totals from season data
  const career = careerSeasons.reduce(
    (acc, s) => ({
      appearances: acc.appearances + s.appearances,
      goals: acc.goals + s.goals,
      assists: acc.assists + s.assists,
      yellowCards: acc.yellowCards + s.yellowCards,
      redCards: acc.redCards + s.redCards,
    }),
    { appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 },
  );

  const displayStats = clubId ? career : fallbackStats;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>

        {/* ── Player header ── */}
        {(() => {
          const liveAvatar = playerData?.avatarUrl ?? avatarUrl ?? null;
          const liveName = playerData?.name ?? playerName;
          const liveNumber = playerData?.number ?? playerNumber;
          const livePositions: string[] =
            playerData?.positions && playerData.positions.length > 0
              ? playerData.positions
              : playerData?.position
              ? [playerData.position]
              : playerPosition
              ? [playerPosition]
              : [];
          return (
            <View style={{
              backgroundColor: '#fff', borderRadius: 16,
              borderWidth: 1, borderColor: '#e5e7eb',
              alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, gap: 12,
            }}>
              <Avatar name={liveName} avatarUrl={liveAvatar} size={80} />
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: '#111' }}>{liveName}</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {liveNumber ? (
                    <View style={{ paddingVertical: 3, paddingHorizontal: 10, backgroundColor: '#111', borderRadius: 999 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>#{liveNumber}</Text>
                    </View>
                  ) : null}
                  {livePositions.map((pos) => (
                    <View key={pos} style={{ paddingVertical: 3, paddingHorizontal: 10, backgroundColor: '#f3f4f6', borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb' }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{pos}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          );
        })()}

        {/* ── Personal details (club context only) ── */}
        {playerData && (playerData.dob || playerData.phone || playerData.email || playerData.guardianName) && (
          <View>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', marginBottom: 8, marginLeft: 4 }}>DETAILS</Text>
            <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden' }}>
              {playerData.dob ? (
                <InfoRow label="Date of Birth" value={formatDobProfile(playerData.dob)} />
              ) : null}
              {playerData.email ? <InfoRow label="Email" value={playerData.email} /> : null}
              {playerData.phone ? <InfoRow label="Phone" value={playerData.phone} /> : null}
              {playerData.guardianName ? <InfoRow label="Guardian" value={playerData.guardianName} /> : null}
              {playerData.guardianPhone ? <InfoRow label="Guardian Phone" value={playerData.guardianPhone} /> : null}
              {playerData.guardianEmail ? <InfoRow label="Guardian Email" value={playerData.guardianEmail} /> : null}
              {playerData.notes ? <InfoRow label="Notes" value={playerData.notes} /> : null}
            </View>
          </View>
        )}

        {loading ? (
          <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', padding: 40, alignItems: 'center' }}>
            <ActivityIndicator />
          </View>
        ) : (
          <>
            {/* ── Career totals ── */}
            <View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#9ca3af', marginBottom: 12, marginLeft: 4 }}>
                {clubId && careerSeasons.length > 1 ? 'CAREER TOTALS' : 'SEASON STATS'}
              </Text>
              <View style={{ gap: 10 }}>
                <View style={{
                  backgroundColor: '#111', borderRadius: 14,
                  paddingVertical: 18, paddingHorizontal: 20,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.7)' }}>Appearances</Text>
                  <Text style={{ fontSize: 32, fontWeight: '800', color: '#fff' }}>
                    {displayStats?.appearances ?? 0}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <StatBox value={displayStats?.goals ?? 0} label="Goals" color="#16a34a" />
                  <StatBox value={displayStats?.assists ?? 0} label="Assists" color="#2563eb" />
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <StatBox value={displayStats?.yellowCards ?? 0} label="Yellow Cards" color="#ca8a04" bg="#fefce8" />
                  <StatBox value={displayStats?.redCards ?? 0} label="Red Cards" color="#dc2626" bg="#fef2f2" />
                </View>
                <View style={{
                  backgroundColor: '#fff', borderRadius: 14,
                  paddingVertical: 16, paddingHorizontal: 20,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  borderWidth: 1, borderColor: '#e5e7eb',
                }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151' }}>Training Attendance</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 24, fontWeight: '800', color: '#111' }}>
                      {trainingStats.attended}/{trainingStats.total}
                    </Text>
                    {trainingStats.total > 0 && (
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af' }}>
                        {Math.round((trainingStats.attended / trainingStats.total) * 100)}%
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            </View>

            {/* ── Season history ── */}
            {clubId && careerSeasons.length > 0 && (
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#9ca3af', marginBottom: 12, marginLeft: 4 }}>
                  SEASON HISTORY
                </Text>
                <View style={{ gap: 10 }}>
                  {careerSeasons.map((season) => (
                    <SeasonRow key={`${season.teamId}-${season.seasonId}`} season={season} />
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {/* ── Development Log ── */}
        {!loadingLog && (
          <View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#9ca3af', marginBottom: 12, marginLeft: 4 }}>
              DEVELOPMENT LOG
            </Text>
            {devLog.length === 0 ? (
              <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 20, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#9ca3af' }}>No match notes yet.</Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {devLog.map((entry) => (
                  <View
                    key={entry.matchId}
                    style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 16, gap: 6 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#111' }}>
                        vs {entry.opponent || 'Unknown'}
                      </Text>
                      {entry.matchDateISO ? (
                        <Text style={{ fontSize: 12, color: '#9ca3af' }}>
                          {(() => {
                            const [y, m, d] = (entry.matchDateISO || '').split('-');
                            if (!y || !m || !d) return entry.matchDateISO;
                            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                            return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}, ${y}`;
                          })()}
                        </Text>
                      ) : null}
                    </View>
                    {entry.rating > 0 && (
                      <Text style={{ fontSize: 16 }}>{'⭐'.repeat(entry.rating)}</Text>
                    )}
                    {entry.note ? (
                      <Text style={{ fontSize: 14, color: '#374151', lineHeight: 20 }}>{entry.note}</Text>
                    ) : null}
                    <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>— {entry.coachName}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
