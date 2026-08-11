/**
 * ClubReportsScreen — the club-governance views: playing-time equity,
 * position exposure, and coach adoption. Reads playerAggregates and match
 * summaries (maintained by Cloud Functions) plus trainings.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { db } from '../../services/firebase';
import { COL } from '../../models/collections';

type Params = { ClubReports: { clubId: string; clubName?: string } };

type PlayerAgg = {
  playerId: string;
  playerName: string;
  minutes: number;
  appearances: number;
  positions?: Record<string, number>;
};

type TeamReport = {
  teamId: string;
  teamName: string;
  players: PlayerAgg[];
  completedMatches: number;
  matchesWithEvents: number;
  lastMatchISO: string | null;
  pastTrainings: number;
  trainingsWithCheckin: number;
};

async function fetchReports(clubId: string): Promise<TeamReport[]> {
  const teamsSnap = await db.collection(COL.teams).where('clubId', '==', clubId).get();
  const teams = teamsSnap.docs.filter((d) => !(d.data() as any).isDeleted);
  const todayKey = new Date().toISOString().substring(0, 10);

  return Promise.all(
    teams.map(async (teamDoc) => {
      const team = teamDoc.data() as any;
      const seasonKey = team.activeSeasonId || 'none';

      const [aggsSnap, matchesSnap, trainingsSnap] = await Promise.all([
        teamDoc.ref.collection('playerAggregates').where('seasonId', '==', seasonKey).get(),
        teamDoc.ref.collection(COL.matches).where('status', '==', 'completed').get(),
        teamDoc.ref.collection(COL.trainings).get(),
      ]);

      const players: PlayerAgg[] = aggsSnap.docs.map((d) => {
        const a = d.data() as any;
        return {
          playerId: a.playerId,
          playerName: a.playerName || 'Unknown',
          minutes: a.minutes || 0,
          appearances: a.appearances || 0,
          positions: a.positions,
        };
      });

      const matches = matchesSnap.docs.map((d) => d.data() as any).filter((m) => !m.isDeleted);
      const withEvents = matches.filter((m) => {
        const s = m.summary;
        if (!s) return false;
        const cards = (s.playerLines || []).reduce((n: number, l: any) => n + (l.yellow || 0) + (l.red || 0), 0);
        return (s.scorers?.length ?? 0) > 0 || cards > 0 || (s.awayScore ?? 0) > 0;
      }).length;
      const lastMatchISO = matches
        .map((m) => m.summary?.dateISO || m.dateISO || '')
        .filter(Boolean)
        .sort()
        .pop() ?? null;

      const trainings = trainingsSnap.docs.map((d) => d.data() as any).filter((t) => !t.isDeleted);
      const past = trainings.filter((t) => (t.startISO || '').substring(0, 10) <= todayKey);
      const withCheckin = past.filter((t) => (t.attendedPlayerIds?.length ?? 0) > 0);

      return {
        teamId: teamDoc.id,
        teamName: team.name || 'Team',
        players,
        completedMatches: matches.length,
        matchesWithEvents: withEvents,
        lastMatchISO,
        pastTrainings: past.length,
        trainingsWithCheckin: withCheckin.length,
      };
    }),
  );
}

const TABS = ['Equity', 'Positions', 'Adoption'] as const;

export default function ClubReportsScreen() {
  const route = useRoute<RouteProp<Params, 'ClubReports'>>();
  const { clubId } = route.params;

  const [tab, setTab] = useState<(typeof TABS)[number]>('Equity');
  const [reports, setReports] = useState<TeamReport[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setReports(await fetchReports(clubId));
    } catch (e) {
      console.warn('[ClubReports] load error', e);
      setReports([]);
    } finally {
      setRefreshing(false);
    }
  }, [clubId]);

  useEffect(() => { load(); }, [load]);

  const body = useMemo(() => {
    if (!reports) return null;
    if (reports.length === 0) {
      return <Text style={{ color: '#9ca3af', fontSize: 14, marginTop: 24, textAlign: 'center' }}>No team data yet.</Text>;
    }

    if (tab === 'Equity') {
      return reports.map((r) => {
        const played = r.players.filter((p) => p.appearances > 0).sort((a, b) => b.minutes - a.minutes);
        if (played.length === 0) {
          return (
            <View key={r.teamId} style={s.card}>
              <Text style={s.cardTitle}>{r.teamName}</Text>
              <Text style={s.empty}>No completed matches with minutes yet.</Text>
            </View>
          );
        }
        const max = played[0].minutes || 1;
        const sortedMin = [...played].map((p) => p.minutes).sort((a, b) => a - b);
        const median = sortedMin[Math.floor(sortedMin.length / 2)] || 0;
        return (
          <View key={r.teamId} style={s.card}>
            <Text style={s.cardTitle}>{r.teamName}</Text>
            <Text style={s.cardSub}>
              Median {median}' · spread {sortedMin[0]}'–{sortedMin[sortedMin.length - 1]}'
            </Text>
            {played.map((p) => {
              const flagged = median > 0 && p.minutes < median * 0.5;
              return (
                <View key={p.playerId} style={{ marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: flagged ? '#dc2626' : '#111' }}>
                      {p.playerName}{flagged ? '  ⚠️ under 50% of median' : ''}
                    </Text>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#111', fontVariant: ['tabular-nums'] }}>
                      {p.minutes}'
                    </Text>
                  </View>
                  <View style={{ height: 6, backgroundColor: '#f3f4f6', borderRadius: 3, marginTop: 4 }}>
                    <View style={{
                      height: 6, borderRadius: 3,
                      width: `${Math.max(3, Math.round((p.minutes / max) * 100))}%`,
                      backgroundColor: flagged ? '#dc2626' : '#22c55e',
                    }} />
                  </View>
                </View>
              );
            })}
          </View>
        );
      });
    }

    if (tab === 'Positions') {
      return reports.map((r) => {
        const withPos = r.players.filter((p) => p.positions && Object.keys(p.positions).length > 0);
        return (
          <View key={r.teamId} style={s.card}>
            <Text style={s.cardTitle}>{r.teamName}</Text>
            {withPos.length === 0 ? (
              <Text style={s.empty}>Position data appears as matches complete.</Text>
            ) : (
              withPos.map((p) => {
                const entries = Object.entries(p.positions!).sort((a, b) => b[1] - a[1]);
                const single = entries.length === 1 && p.appearances >= 3;
                return (
                  <View key={p.playerId} style={{ marginTop: 12 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#111' }}>
                      {p.playerName}{single ? '  🔁 consider rotating' : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {entries.map(([pos, count]) => (
                        <View key={pos} style={{
                          backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3,
                        }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>
                            {pos} ×{count}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        );
      });
    }

    // Adoption
    return reports.map((r) => {
      const matchPct = r.completedMatches > 0
        ? Math.round((r.matchesWithEvents / r.completedMatches) * 100) : null;
      const trainPct = r.pastTrainings > 0
        ? Math.round((r.trainingsWithCheckin / r.pastTrainings) * 100) : null;
      const stale = r.lastMatchISO
        ? (Date.now() - new Date(r.lastMatchISO.substring(0, 10)).getTime()) / (24 * 3600 * 1000) > 21
        : false;
      return (
        <View key={r.teamId} style={s.card}>
          <Text style={s.cardTitle}>{r.teamName}{stale ? '  💤' : ''}</Text>
          <View style={{ flexDirection: 'row', gap: 18, marginTop: 10 }}>
            <View>
              <Text style={s.bigStat}>{matchPct == null ? '—' : `${matchPct}%`}</Text>
              <Text style={s.statLabel}>matches with events{'\n'}({r.matchesWithEvents}/{r.completedMatches})</Text>
            </View>
            <View>
              <Text style={s.bigStat}>{trainPct == null ? '—' : `${trainPct}%`}</Text>
              <Text style={s.statLabel}>trainings checked in{'\n'}({r.trainingsWithCheckin}/{r.pastTrainings})</Text>
            </View>
            <View>
              <Text style={s.bigStat}>{r.lastMatchISO ? r.lastMatchISO.substring(5, 10) : '—'}</Text>
              <Text style={s.statLabel}>last completed{'\n'}match</Text>
            </View>
          </View>
        </View>
      );
    });
  }, [reports, tab]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <View style={{ flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 10 }}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{
              paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
              backgroundColor: tab === t ? '#111' : '#fff',
              borderWidth: 1, borderColor: tab === t ? '#111' : '#e5e7eb',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: tab === t ? '#fff' : '#374151' }}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!reports ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {tab === 'Equity' && (
            <Text style={s.blurb}>
              Minutes this season. ⚠️ flags players under half the team median — your receipts
              for equal-playing-time conversations.
            </Text>
          )}
          {tab === 'Positions' && (
            <Text style={s.blurb}>
              Positions actually played (from completed matches). 🔁 flags players stuck in a
              single position across 3+ appearances.
            </Text>
          )}
          {tab === 'Adoption' && (
            <Text style={s.blurb}>
              Are teams using the tools? 💤 marks teams with no completed match in 3+ weeks.
            </Text>
          )}
          {body}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = {
  card: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb',
    padding: 16, marginTop: 12,
  } as const,
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#111' } as const,
  cardSub: { fontSize: 12, color: '#9ca3af', marginTop: 2 } as const,
  empty: { fontSize: 13, color: '#9ca3af', marginTop: 8 } as const,
  blurb: { fontSize: 12.5, color: '#9ca3af', lineHeight: 18, marginTop: 2 } as const,
  bigStat: { fontSize: 22, fontWeight: '900', color: '#111' } as const,
  statLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2, lineHeight: 14 } as const,
};
