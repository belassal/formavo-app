import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { db } from '../../services/firebase';
import { COL } from '../../models/collections';

// Params are identical whether navigated from TeamsStack or StatsStack
type StatsRouteParams = { teamId: string; teamName?: string };

type FormResult = 'W' | 'D' | 'L';

type TeamStat = {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  form: FormResult[];
};

type PlayerStat = {
  playerId: string;
  playerName: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
};

type SortKey = 'goals' | 'assists' | 'cards';

// ─── helpers ─────────────────────────────────────────────────────────────────

function ensurePlayer(id: string, name: string | undefined, map: Map<string, PlayerStat>) {
  if (!id) return;
  if (!map.has(id)) {
    map.set(id, { playerId: id, playerName: name || id, gamesPlayed: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 });
  } else if (name && map.get(id)!.playerName === id) {
    map.get(id)!.playerName = name;
  }
}

// ─── data fetching ────────────────────────────────────────────────────────────

async function fetchStats(teamId: string): Promise<{ team: TeamStat; players: PlayerStat[] }> {
  const matchSnap = await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .get();

  const allMatches = matchSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((m) => !m.isDeleted);

  const completedMatches = allMatches.filter(
    (m) => m?.state?.status === 'final' || m?.status === 'completed'
  );

  // ── Team stats ─────────────────────────────────────────────────────────────
  const teamStat: TeamStat = {
    played: completedMatches.length,
    wins: 0, draws: 0, losses: 0,
    goalsFor: 0, goalsAgainst: 0,
    cleanSheets: 0, form: [],
  };

  const sorted = [...completedMatches].sort((a, b) =>
    String(b.dateISO || '').localeCompare(String(a.dateISO || ''))
  );

  for (const m of sorted) {
    const gf = Number(m.homeScore ?? 0);
    const ga = Number(m.awayScore ?? 0);
    teamStat.goalsFor += gf;
    teamStat.goalsAgainst += ga;
    if (ga === 0) teamStat.cleanSheets++;
    if (gf > ga)      { teamStat.wins++;   if (teamStat.form.length < 5) teamStat.form.push('W'); }
    else if (gf === ga){ teamStat.draws++;  if (teamStat.form.length < 5) teamStat.form.push('D'); }
    else               { teamStat.losses++; if (teamStat.form.length < 5) teamStat.form.push('L'); }
  }

  // ── Player stats: events + roster in parallel per match ───────────────────
  const playerMap = new Map<string, PlayerStat>();

  const [eventsArrays, rosterArrays] = await Promise.all([
    // events for all matches
    Promise.all(
      allMatches.map((m) =>
        db.collection(COL.teams).doc(teamId)
          .collection(COL.matches).doc(m.id)
          .collection(COL.events).get()
          .then((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
          .catch(() => [] as any[])
      )
    ),
    // roster for all matches (for GP count)
    Promise.all(
      allMatches.map((m) =>
        db.collection(COL.teams).doc(teamId)
          .collection(COL.matches).doc(m.id)
          .collection(COL.roster).get()
          .then((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
          .catch(() => [] as any[])
      )
    ),
  ]);

  // GP: count appearances from roster (present or no explicit absence)
  for (const rosterRows of rosterArrays) {
    for (const r of rosterRows) {
      if (r.attendance === 'absent' || r.attendance === 'injured') continue;
      ensurePlayer(r.playerId || r.id, r.playerName, playerMap);
      playerMap.get(r.playerId || r.id)!.gamesPlayed++;
    }
  }

  // Goals / assists / cards from events
  for (const events of eventsArrays) {
    for (const ev of events) {
      if (ev.type === 'goal' && ev.side === 'home') {
        if (ev.scorerId) {
          ensurePlayer(ev.scorerId, ev.scorerName, playerMap);
          playerMap.get(ev.scorerId)!.goals++;
        }
        if (ev.assistId) {
          ensurePlayer(ev.assistId, ev.assistName, playerMap);
          playerMap.get(ev.assistId)!.assists++;
        }
      }
      if (ev.type === 'card' && ev.playerId) {
        ensurePlayer(ev.playerId, ev.playerName, playerMap);
        if (ev.cardColor === 'yellow') playerMap.get(ev.playerId)!.yellowCards++;
        if (ev.cardColor === 'red')    playerMap.get(ev.playerId)!.redCards++;
      }
    }
  }

  return { team: teamStat, players: Array.from(playerMap.values()) };
}

// ─── screen ───────────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const route = useRoute();
  const { teamId } = route.params as StatsRouteParams;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [teamStat, setTeamStat] = useState<TeamStat | null>(null);
  const [players, setPlayers] = useState<PlayerStat[]>([]);
  const [segment, setSegment] = useState<'team' | 'players'>('team');
  const [sortKey, setSortKey] = useState<SortKey>('goals');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const { team, players: p } = await fetchStats(teamId);
      setTeamStat(team);
      setPlayers(p);
    } catch (e) {
      console.warn('[StatsScreen] fetch error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const sortedPlayers = [...players].sort((a, b) => {
    if (sortKey === 'goals')   return b.goals - a.goals || b.assists - a.assists;
    if (sortKey === 'assists') return b.assists - a.assists || b.goals - a.goals;
    return (b.redCards * 2 + b.yellowCards) - (a.redCards * 2 + a.yellowCards);
  });

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#111" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      {/* Segment */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
        <View style={{ flexDirection: 'row', backgroundColor: '#e5e7eb', borderRadius: 12, padding: 3 }}>
          {(['team', 'players'] as const).map((seg) => (
            <TouchableOpacity
              key={seg}
              onPress={() => setSegment(seg)}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: segment === seg ? '#111' : 'transparent' }}
            >
              <Text style={{ fontWeight: '700', fontSize: 14, color: segment === seg ? '#fff' : '#6b7280' }}>
                {seg === 'team' ? 'Team' : 'Players'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        {segment === 'team'
          ? <TeamStatsView stat={teamStat} />
          : <PlayerStatsView players={sortedPlayers} sortKey={sortKey} onSort={setSortKey} />}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Team stats view ──────────────────────────────────────────────────────────

function TeamStatsView({ stat }: { stat: TeamStat | null }) {
  if (!stat || stat.played === 0) {
    return (
      <View style={card}>
        <Text style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', paddingVertical: 24 }}>
          No completed matches yet. Stats will appear after games are finished.
        </Text>
      </View>
    );
  }

  const gd = stat.goalsFor - stat.goalsAgainst;
  const winPct = Math.round((stat.wins / stat.played) * 100);

  return (
    <>
      <View style={card}>
        <Text style={cardTitle}>Season Record</Text>
        <View style={{ flexDirection: 'row', marginTop: 16 }}>
          {[
            { label: 'P',  value: stat.played, color: '#111' },
            { label: 'W',  value: stat.wins,   color: '#16a34a' },
            { label: 'D',  value: stat.draws,  color: '#6b7280' },
            { label: 'L',  value: stat.losses, color: '#dc2626' },
          ].map(({ label, value, color }) => (
            <View key={label} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: '800', color }}>{value}</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af', marginTop: 2 }}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: '#f3f4f6' }}>
            <View style={{ flex: stat.wins,   backgroundColor: '#16a34a' }} />
            <View style={{ flex: stat.draws,  backgroundColor: '#d1d5db' }} />
            <View style={{ flex: stat.losses, backgroundColor: '#fca5a5' }} />
          </View>
          <Text style={{ marginTop: 6, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>{winPct}% win rate</Text>
        </View>
      </View>

      <View style={card}>
        <Text style={cardTitle}>Goals</Text>
        <View style={{ flexDirection: 'row', marginTop: 16 }}>
          {[
            { label: 'For',          value: stat.goalsFor,        color: '#16a34a' },
            { label: 'Against',      value: stat.goalsAgainst,    color: '#dc2626' },
            { label: 'Difference',   value: gd >= 0 ? `+${gd}` : `${gd}`, color: gd >= 0 ? '#16a34a' : '#dc2626' },
            { label: 'Clean Sheets', value: stat.cleanSheets,     color: '#2563eb' },
          ].map(({ label, value, color }) => (
            <View key={label} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 26, fontWeight: '800', color }}>{value}</Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#9ca3af', marginTop: 2, textAlign: 'center' }}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      {stat.form.length > 0 && (
        <View style={card}>
          <Text style={cardTitle}>Recent Form</Text>
          <Text style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
            Last {stat.form.length} completed match{stat.form.length !== 1 ? 'es' : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {stat.form.map((r, i) => (
              <View key={i} style={{
                width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                backgroundColor: r === 'W' ? '#dcfce7' : r === 'D' ? '#f3f4f6' : '#fee2e2',
              }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: r === 'W' ? '#16a34a' : r === 'D' ? '#6b7280' : '#dc2626' }}>
                  {r}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </>
  );
}

// ─── Player stats view ────────────────────────────────────────────────────────

function PlayerStatsView({
  players,
  sortKey,
  onSort,
}: {
  players: PlayerStat[];
  sortKey: SortKey;
  onSort: (k: SortKey) => void;
}) {
  if (players.length === 0) {
    return (
      <View style={card}>
        <Text style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', paddingVertical: 24 }}>
          No player stats yet. Stats are collected from match events.
        </Text>
      </View>
    );
  }

  return (
    <>
      {/* Sort pills */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['goals', 'assists', 'cards'] as SortKey[]).map((k) => (
          <TouchableOpacity
            key={k}
            onPress={() => onSort(k)}
            style={{ paddingVertical: 7, paddingHorizontal: 16, borderRadius: 999, backgroundColor: sortKey === k ? '#111' : '#f3f4f6' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: sortKey === k ? '#fff' : '#374151' }}>
              {k.charAt(0).toUpperCase() + k.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={card}>
        {/* Column headers */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
          <Text style={{ width: 24, fontSize: 11, fontWeight: '700', color: '#9ca3af' }}>#</Text>
          <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: '#9ca3af' }}>PLAYER</Text>
          <Text style={[colHeader, { color: '#6b7280' }]}>GP</Text>
          <Text style={colHeader}>⚽</Text>
          <Text style={colHeader}>🅰️</Text>
          <Text style={colHeader}>🟨</Text>
          <Text style={colHeader}>🟥</Text>
        </View>

        {players.map((p, idx) => {
          const isTop =
            (sortKey === 'goals'   && idx === 0 && p.goals > 0) ||
            (sortKey === 'assists' && idx === 0 && p.assists > 0) ||
            (sortKey === 'cards'   && idx === 0 && (p.yellowCards + p.redCards) > 0);

          return (
            <View key={p.playerId}>
              {idx > 0 && <View style={{ height: 1, backgroundColor: '#f3f4f6' }} />}
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                paddingVertical: 12, paddingHorizontal: 4,
                backgroundColor: isTop ? '#fafafa' : 'transparent',
              }}>
                <Text style={{ width: 24, fontSize: 13, fontWeight: '700', color: isTop ? '#111' : '#9ca3af' }}>
                  {idx + 1}
                </Text>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: isTop ? '700' : '600', color: '#111' }} numberOfLines={1}>
                  {p.playerName}
                </Text>
                {/* GP — always shown in gray */}
                <Text style={{ width: 32, fontSize: 14, fontWeight: '500', color: '#9ca3af', textAlign: 'center' }}>
                  {p.gamesPlayed}
                </Text>
                <StatCell value={p.goals}       highlight={sortKey === 'goals'} />
                <StatCell value={p.assists}     highlight={sortKey === 'assists'} />
                <StatCell value={p.yellowCards} highlight={sortKey === 'cards'} />
                <StatCell value={p.redCards}    highlight={sortKey === 'cards'} />
              </View>
            </View>
          );
        })}
      </View>
    </>
  );
}

function StatCell({ value, highlight }: { value: number; highlight: boolean }) {
  return (
    <Text style={{
      width: 32,
      fontSize: 15,
      fontWeight: value > 0 && highlight ? '800' : '500',
      color: value > 0 ? (highlight ? '#111' : '#374151') : '#d1d5db',
      textAlign: 'center',
    }}>
      {value}
    </Text>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

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

const colHeader: any = {
  width: 32,
  fontSize: 11,
  fontWeight: '700',
  color: '#9ca3af',
  textAlign: 'center',
};
