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
import auth from '@react-native-firebase/auth';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StatsStackParamList } from '../../navigation/stacks/StatsStack';
import { listenMyTeams } from '../../services/teamService';
import { db } from '../../services/firebase';
import { COL } from '../../models/collections';

type TeamRow = { id: string; teamName?: string; role?: string };

type TeamRecord = {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  form: ('W' | 'D' | 'L')[];
};

type TopScorer = {
  playerName: string;
  teamName: string;
  goals: number;
  assists: number;
};

// ─── data helpers ─────────────────────────────────────────────────────────────

async function fetchTeamRecord(teamId: string, teamName: string): Promise<TeamRecord> {
  const matchSnap = await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .get();

  const completed = matchSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((m) => !m.isDeleted && (m?.state?.status === 'final' || m?.status === 'completed'))
    .sort((a, b) => String(b.dateISO || '').localeCompare(String(a.dateISO || '')));

  const rec: TeamRecord = {
    teamId, teamName,
    played: completed.length,
    wins: 0, draws: 0, losses: 0,
    goalsFor: 0, goalsAgainst: 0,
    form: [],
  };

  for (const m of completed) {
    const gf = Number(m.homeScore ?? 0);
    const ga = Number(m.awayScore ?? 0);
    rec.goalsFor += gf;
    rec.goalsAgainst += ga;
    if (gf > ga)       { rec.wins++;   if (rec.form.length < 5) rec.form.push('W'); }
    else if (gf === ga){ rec.draws++;  if (rec.form.length < 5) rec.form.push('D'); }
    else               { rec.losses++; if (rec.form.length < 5) rec.form.push('L'); }
  }

  return rec;
}

async function fetchTopScorers(teamId: string, teamName: string): Promise<Map<string, { name: string; team: string; goals: number; assists: number }>> {
  const matchSnap = await db.collection(COL.teams).doc(teamId).collection(COL.matches).get();
  const allMatches = matchSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((m) => !m.isDeleted);

  const map = new Map<string, { name: string; team: string; goals: number; assists: number }>();

  const eventsArrays = await Promise.all(
    allMatches.map((m) =>
      db.collection(COL.teams).doc(teamId)
        .collection(COL.matches).doc(m.id)
        .collection(COL.events).get()
        .then((s) => s.docs.map((d) => ({ ...(d.data() as any) })))
        .catch(() => [] as any[])
    )
  );

  for (const events of eventsArrays) {
    for (const ev of events) {
      if (ev.type === 'goal' && ev.side === 'home') {
        if (ev.scorerId) {
          if (!map.has(ev.scorerId)) map.set(ev.scorerId, { name: ev.scorerName || ev.scorerId, team: teamName, goals: 0, assists: 0 });
          map.get(ev.scorerId)!.goals++;
        }
        if (ev.assistId) {
          if (!map.has(ev.assistId)) map.set(ev.assistId, { name: ev.assistName || ev.assistId, team: teamName, goals: 0, assists: 0 });
          map.get(ev.assistId)!.assists++;
        }
      }
    }
  }

  return map;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const uid = useMemo(() => auth().currentUser?.uid ?? null, []);
  const navigation = useNavigation<NativeStackNavigationProp<StatsStackParamList>>();

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [records, setRecords] = useState<TeamRecord[]>([]);
  const [topScorers, setTopScorers] = useState<TopScorer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Listen to teams list
  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const unsub = listenMyTeams(uid, (rows) => setTeams(rows as TeamRow[]));
    return () => unsub();
  }, [uid]);

  const loadStats = useCallback(async (teamRows: TeamRow[], isRefresh = false) => {
    if (teamRows.length === 0) { setLoading(false); setRefreshing(false); return; }
    if (isRefresh) setRefreshing(true);

    try {
      const [recs, scorerMaps] = await Promise.all([
        Promise.all(teamRows.map((t) => fetchTeamRecord(t.id, t.teamName || t.id))),
        Promise.all(teamRows.map((t) => fetchTopScorers(t.id, t.teamName || t.id))),
      ]);

      setRecords(recs);

      // Merge scorer maps across teams
      const merged = new Map<string, { name: string; team: string; goals: number; assists: number }>();
      for (const m of scorerMaps) {
        for (const [id, val] of m) {
          if (!merged.has(id)) merged.set(id, { ...val });
          else {
            merged.get(id)!.goals += val.goals;
            merged.get(id)!.assists += val.assists;
          }
        }
      }

      const scorers = Array.from(merged.values())
        .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
        .slice(0, 10)
        .map((s) => ({ playerName: s.name, teamName: s.team, goals: s.goals, assists: s.assists }));

      setTopScorers(scorers);
    } catch (e) {
      console.warn('[GlobalStats] loadStats error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (teams.length > 0) loadStats(teams);
    else if (!loading) setLoading(false);
  }, [teams]);

  // ── render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#111" />
      </SafeAreaView>
    );
  }

  if (teams.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Text style={{ fontSize: 40, marginBottom: 16 }}>📊</Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#111', textAlign: 'center' }}>No teams yet</Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: '#9ca3af', textAlign: 'center' }}>
          Create or join a team to see stats here.
        </Text>
      </SafeAreaView>
    );
  }

  const totalPlayed = records.reduce((s, r) => s + r.played, 0);
  const totalWins   = records.reduce((s, r) => s + r.wins, 0);
  const totalGF     = records.reduce((s, r) => s + r.goalsFor, 0);
  const totalGA     = records.reduce((s, r) => s + r.goalsAgainst, 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadStats(teams, true)} />}
      >

        {/* ── Summary banner (multi-team only) ── */}
        {records.length > 1 && totalPlayed > 0 && (
          <View style={{ backgroundColor: '#111', borderRadius: 14, padding: 18 }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700', marginBottom: 10, letterSpacing: 0.5 }}>
              ALL TEAMS · COMBINED
            </Text>
            <View style={{ flexDirection: 'row' }}>
              {[
                { label: 'Played', value: totalPlayed },
                { label: 'Wins',   value: totalWins },
                { label: 'For',    value: totalGF },
                { label: 'Against',value: totalGA },
              ].map(({ label, value }) => (
                <View key={label} style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 26, fontWeight: '900', color: '#fff' }}>{value}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Team records ── */}
        <View style={card}>
          <Text style={[cardTitle, { marginBottom: 4 }]}>Team Records</Text>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginBottom: 14 }}>Completed matches only</Text>

          {/* Table header */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 4, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
            <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: '#9ca3af' }}>TEAM</Text>
            {['P','W','D','L','GF','GA'].map((h) => (
              <Text key={h} style={{ width: 30, fontSize: 11, fontWeight: '700', color: '#9ca3af', textAlign: 'center' }}>{h}</Text>
            ))}
            <Text style={{ width: 36, fontSize: 11, fontWeight: '700', color: '#9ca3af', textAlign: 'center' }}>FORM</Text>
          </View>

          {records.length === 0 ? (
            <Text style={{ color: '#9ca3af', fontSize: 14, paddingVertical: 20, textAlign: 'center' }}>
              No completed matches yet.
            </Text>
          ) : (
            records.map((r, idx) => (
              <View key={r.teamId}>
                {idx > 0 && <View style={{ height: 1, backgroundColor: '#f3f4f6' }} />}
                <TouchableOpacity
                  onPress={() => navigation.navigate('TeamStats', { teamId: r.teamId, teamName: r.teamName })}
                  activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 }}
                >
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#111' }} numberOfLines={1}>
                    {r.teamName}
                  </Text>
                  {[r.played, r.wins, r.draws, r.losses, r.goalsFor, r.goalsAgainst].map((v, i) => (
                    <Text key={i} style={{ width: 30, fontSize: 14, fontWeight: '600', color: '#374151', textAlign: 'center' }}>{v}</Text>
                  ))}
                  {/* Mini form dots */}
                  <View style={{ width: 36, flexDirection: 'row', gap: 2, justifyContent: 'center' }}>
                    {r.form.slice(0, 3).map((f, fi) => (
                      <View key={fi} style={{
                        width: 8, height: 8, borderRadius: 4,
                        backgroundColor: f === 'W' ? '#16a34a' : f === 'D' ? '#d1d5db' : '#ef4444',
                      }} />
                    ))}
                  </View>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* ── Top scorers ── */}
        {topScorers.length > 0 && (
          <View style={card}>
            <Text style={[cardTitle, { marginBottom: 14 }]}>Top Scorers</Text>

            <View style={{ flexDirection: 'row', paddingHorizontal: 4, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
              <Text style={{ width: 24, fontSize: 11, fontWeight: '700', color: '#9ca3af' }}>#</Text>
              <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: '#9ca3af' }}>PLAYER</Text>
              {records.length > 1 && <Text style={{ width: 80, fontSize: 11, fontWeight: '700', color: '#9ca3af' }}>TEAM</Text>}
              <Text style={{ width: 36, fontSize: 11, fontWeight: '700', color: '#9ca3af', textAlign: 'center' }}>⚽</Text>
              <Text style={{ width: 36, fontSize: 11, fontWeight: '700', color: '#9ca3af', textAlign: 'center' }}>🅰️</Text>
            </View>

            {topScorers.map((p, idx) => (
              <View key={idx}>
                {idx > 0 && <View style={{ height: 1, backgroundColor: '#f3f4f6' }} />}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 4 }}>
                  <Text style={{ width: 24, fontSize: 13, fontWeight: '700', color: idx === 0 ? '#111' : '#9ca3af' }}>
                    {idx + 1}
                  </Text>
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: idx === 0 ? '700' : '600', color: '#111' }} numberOfLines={1}>
                    {p.playerName}
                  </Text>
                  {records.length > 1 && (
                    <Text style={{ width: 80, fontSize: 12, color: '#9ca3af' }} numberOfLines={1}>{p.teamName}</Text>
                  )}
                  <Text style={{ width: 36, fontSize: 15, fontWeight: p.goals > 0 ? '800' : '500', color: p.goals > 0 ? '#111' : '#d1d5db', textAlign: 'center' }}>
                    {p.goals}
                  </Text>
                  <Text style={{ width: 36, fontSize: 15, fontWeight: p.assists > 0 ? '700' : '500', color: p.assists > 0 ? '#374151' : '#d1d5db', textAlign: 'center' }}>
                    {p.assists}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const card: any = {
  backgroundColor: '#fff',
  borderRadius: 14,
  borderWidth: 1,
  borderColor: '#e5e7eb',
  padding: 16,
};

const cardTitle: any = {
  fontSize: 15,
  fontWeight: '700',
  color: '#111',
};
