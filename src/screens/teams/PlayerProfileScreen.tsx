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

type PlayerProfileRoute = RouteProp<TeamsStackParamList, 'PlayerProfile'>;

type PlayerStats = {
  appearances: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
};

async function fetchPlayerStats(teamId: string, playerId: string): Promise<PlayerStats> {
  const stats: PlayerStats = { appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };

  const matchSnap = await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .get();

  const allMatches = matchSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((m) => !m.isDeleted);

  await Promise.all(
    allMatches.map(async (match) => {
      // Count as appearance if player was a starter in this match's roster
      const rosterDoc = await db
        .collection(COL.teams)
        .doc(teamId)
        .collection(COL.matches)
        .doc(match.id)
        .collection(COL.roster)
        .doc(playerId)
        .get();

      if (rosterDoc.exists) {
        const rosterData = rosterDoc.data() as any;
        if (rosterData?.role === 'starter') {
          stats.appearances += 1;
        }
      }

      // Collect events for this player
      const eventsSnap = await db
        .collection(COL.teams)
        .doc(teamId)
        .collection(COL.matches)
        .doc(match.id)
        .collection(COL.events)
        .get();

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

type StatCardProps = {
  value: number;
  label: string;
  color?: string;
  bg?: string;
};

function StatCard({ value, label, color = '#111', bg = '#fff' }: StatCardProps) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: bg,
        borderRadius: 14,
        paddingVertical: 18,
        paddingHorizontal: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#e5e7eb',
      }}
    >
      <Text style={{ fontSize: 28, fontWeight: '800', color }}>{value}</Text>
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af', marginTop: 4, textAlign: 'center' }}>
        {label}
      </Text>
    </View>
  );
}

export default function PlayerProfileScreen() {
  const route = useRoute<PlayerProfileRoute>();
  const { teamId, playerId, playerName, playerNumber, playerPosition, avatarUrl } = route.params;

  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlayerStats(teamId, playerId)
      .then(setStats)
      .catch((err) => {
        console.warn('[PlayerProfile] fetchPlayerStats error', err);
        setStats({ appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 });
      })
      .finally(() => setLoading(false));
  }, [teamId, playerId]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>

        {/* ── Player header ── */}
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#e5e7eb',
            alignItems: 'center',
            paddingVertical: 28,
            paddingHorizontal: 20,
            gap: 12,
          }}
        >
          <Avatar
            name={playerName}
            avatarUrl={avatarUrl ?? null}
            size={80}
          />
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

        {/* ── Season stats ── */}
        <View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#9ca3af', marginBottom: 12, marginLeft: 4 }}>
            SEASON STATS
          </Text>

          {loading ? (
            <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', padding: 40, alignItems: 'center' }}>
              <ActivityIndicator />
            </View>
          ) : stats ? (
            <View style={{ gap: 10 }}>
              {/* Appearances — full width */}
              <View
                style={{
                  backgroundColor: '#111',
                  borderRadius: 14,
                  paddingVertical: 18,
                  paddingHorizontal: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.7)' }}>Appearances</Text>
                <Text style={{ fontSize: 32, fontWeight: '800', color: '#fff' }}>{stats.appearances}</Text>
              </View>

              {/* Goals + Assists */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <StatCard value={stats.goals} label="Goals" color="#16a34a" />
                <StatCard value={stats.assists} label="Assists" color="#2563eb" />
              </View>

              {/* Cards */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <StatCard value={stats.yellowCards} label="Yellow Cards" color="#ca8a04" bg="#fefce8" />
                <StatCard value={stats.redCards} label="Red Cards" color="#dc2626" bg="#fef2f2" />
              </View>
            </View>
          ) : null}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
