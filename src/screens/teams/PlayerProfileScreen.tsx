import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { db } from '../../services/firebase';
import { COL } from '../../models/collections';
import Avatar from '../../components/Avatar';
import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';
import { getPlayerCareerStats, type CareerSeason } from '../../services/clubPlayerService';

type PlayerProfileRoute = RouteProp<TeamsStackParamList, 'PlayerProfile'>;

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
  const { teamId, playerId, playerName, playerNumber, playerPosition, avatarUrl, clubId } = route.params;

  const [careerSeasons, setCareerSeasons] = useState<CareerSeason[]>([]);
  const [fallbackStats, setFallbackStats] = useState<SeasonStats | null>(null);
  const [loading, setLoading] = useState(true);

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
        <View style={{
          backgroundColor: '#fff', borderRadius: 16,
          borderWidth: 1, borderColor: '#e5e7eb',
          alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, gap: 12,
        }}>
          <Avatar name={playerName} avatarUrl={avatarUrl ?? null} size={80} />
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#111' }}>{playerName}</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {playerNumber ? (
                <View style={{ paddingVertical: 3, paddingHorizontal: 10, backgroundColor: '#111', borderRadius: 999 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>#{playerNumber}</Text>
                </View>
              ) : null}
              {playerPosition ? (
                <View style={{ paddingVertical: 3, paddingHorizontal: 10, backgroundColor: '#f3f4f6', borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb' }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{playerPosition}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

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
      </ScrollView>
    </SafeAreaView>
  );
}
