/**
 * MatchRecapScreen — post-match summary built for sharing.
 * Scoreline hero, scorers, shot map, player minutes, cards.
 * Reads match.summary (maintained by Cloud Functions); falls back to
 * computing from events + roster for matches completed before aggregates shipped.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  Share,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { db } from '../../services/firebase';
import { COL } from '../../models/collections';
import { listenMatchEvents, listenMatchRoster } from '../../services/matchService';
import { fetchClubSponsorForTeam, type ClubSponsor } from '../../services/clubService';
import { calculateMatchMinutes } from '../../services/minutesService';
import MiniPitchDisplay from '../../components/MiniPitchDisplay';
import { B } from '../../constants/brand';
import type { MatchEvent } from '../../models/matchEvent';

type Params = {
  MatchRecap: { teamId: string; matchId: string; teamName?: string };
};

export default function MatchRecapScreen() {
  const route = useRoute<RouteProp<Params, 'MatchRecap'>>();
  const { teamId, matchId, teamName: teamNameParam } = route.params;

  const [match, setMatch] = useState<any | null>(null);
  const [teamName, setTeamName] = useState(teamNameParam || 'Team');
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [roster, setRoster] = useState<any[]>([]);
  const [sponsor, setSponsor] = useState<ClubSponsor | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchClubSponsorForTeam(teamId).then((s) => { if (!cancelled) setSponsor(s); });
    return () => { cancelled = true; };
  }, [teamId]);

  useEffect(() => {
    const unsubMatch = db
      .collection(COL.teams).doc(teamId)
      .collection(COL.matches).doc(matchId)
      .onSnapshot((snap) => setMatch(snap.data() ?? null));
    const unsubEvents = listenMatchEvents(teamId, matchId, setEvents);
    const unsubRoster = listenMatchRoster(teamId, matchId, setRoster);
    if (!teamNameParam) {
      db.collection(COL.teams).doc(teamId).get()
        .then((s) => setTeamName((s.data() as any)?.name || 'Team'))
        .catch(() => {});
    }
    return () => { unsubMatch(); unsubEvents(); unsubRoster(); };
  }, [teamId, matchId, teamNameParam]);

  const homeScore = match?.homeScore ?? match?.state?.homeScore ?? 0;
  const awayScore = match?.awayScore ?? match?.state?.awayScore ?? 0;
  const opponent = match?.opponent || 'Opponent';
  const letter = homeScore > awayScore ? 'W' : homeScore < awayScore ? 'L' : 'D';
  const resultColor = letter === 'W' ? '#16a34a' : letter === 'L' ? '#dc2626' : '#6b7280';
  const resultWord = letter === 'W' ? 'WIN' : letter === 'L' ? 'LOSS' : 'DRAW';

  const goalEvents = useMemo(
    () => events
      .filter((e) => e.type === 'goal' && (e.side || 'home') === 'home')
      .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0)),
    [events],
  );
  const concededEvents = useMemo(
    () => events
      .filter((e) => e.type === 'goal' && e.side === 'away')
      .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0)),
    [events],
  );
  const cardEvents = useMemo(
    () => events.filter((e) => e.type === 'card').sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0)),
    [events],
  );
  const shotMarkers = useMemo(
    () => goalEvents.map((e) => e.pos).filter(Boolean) as { x: number; y: number }[],
    [goalEvents],
  );

  // Prefer the function-built summary for minutes; fall back to client calc.
  const playerLines = useMemo(() => {
    if (match?.summary?.playerLines?.length) {
      return [...match.summary.playerLines].sort((a: any, b: any) => b.minutes - a.minutes);
    }
    const rosterForCalc = roster.map((r) => ({
      playerId: r.playerId || r.id,
      playerName: r.playerName || 'Unknown',
      role: r.role,
      attendance: r.attendance,
    }));
    const matchDuration = (match?.halfDuration ?? 45) * 2;
    return calculateMatchMinutes(rosterForCalc, events as any, matchDuration).map((m) => ({
      playerId: m.playerId,
      playerName: m.playerName,
      minutes: m.minutesPlayed,
      started: m.startedMatch,
    }));
  }, [match, roster, events]);

  const dateLabel = (match?.dateISO || '').split(' ')[0] || '';

  const onShare = async () => {
    const scorerLines = goalEvents
      .map((e) => `⚽ ${e.minute ?? '?'}' ${e.scorerName || 'Goal'}${e.assistName ? ` (assist: ${e.assistName})` : ''}`)
      .join('\n');
    const message = [
      `FT: ${teamName} ${homeScore}-${awayScore} ${opponent}${dateLabel ? ` · ${dateLabel}` : ''}`,
      scorerLines,
      sponsor ? `Presented by ${sponsor.name}` : '',
      `Shared from Formavo ⚽`,
    ].filter(Boolean).join('\n\n');
    try { await Share.share({ message }); } catch { /* user cancelled */ }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: B.surface }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* ── Scoreline hero ── */}
        <View style={{ backgroundColor: '#0b1220', borderRadius: 18, padding: 20, alignItems: 'center' }}>
          <View style={{
            backgroundColor: resultColor, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10,
          }}>
            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 1 }}>
              FULL TIME · {resultWord}
            </Text>
          </View>
          <Text style={{ color: '#fff', fontSize: 44, fontWeight: '900', marginTop: 12 }}>
            {homeScore} - {awayScore}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 16, fontWeight: '700', marginTop: 4 }}>
            {teamName} vs {opponent}
          </Text>
          {!!dateLabel && (
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4 }}>{dateLabel}</Text>
          )}
          {sponsor && (
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 12 }}>
              PRESENTED BY {sponsor.name.toUpperCase()}
            </Text>
          )}
        </View>

        {/* ── Scorers ── */}
        {(goalEvents.length > 0 || concededEvents.length > 0) && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Goals</Text>
            {goalEvents.map((e, i) => (
              <View key={e.id || i} style={s.row}>
                <Text style={s.minute}>{e.minute ?? '–'}'</Text>
                <Text style={s.rowText}>⚽ {e.scorerName || 'Goal'}</Text>
                {!!e.assistName && <Text style={s.rowFaint}>assist: {e.assistName}</Text>}
              </View>
            ))}
            {concededEvents.map((e, i) => (
              <View key={e.id || `c${i}`} style={s.row}>
                <Text style={s.minute}>{e.minute ?? '–'}'</Text>
                <Text style={[s.rowText, { color: '#9ca3af' }]}>
                  ⚽ {opponent}{e.scorerName && e.scorerName !== 'Opponent' ? ` (${e.scorerName})` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Shot map ── */}
        {shotMarkers.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Where we scored</Text>
            <MiniPitchDisplay markers={shotMarkers} />
          </View>
        )}

        {/* ── Cards ── */}
        {cardEvents.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Cards</Text>
            {cardEvents.map((e, i) => (
              <View key={e.id || i} style={s.row}>
                <Text style={s.minute}>{e.minute ?? '–'}'</Text>
                <Text style={s.rowText}>
                  {e.cardColor === 'red' ? '🟥' : '🟨'} {e.playerName || 'Unknown'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Minutes ── */}
        {playerLines.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Minutes played</Text>
            {playerLines.map((p: any, i: number) => (
              <View key={p.playerId || i} style={[s.row, { justifyContent: 'space-between' }]}>
                <Text style={s.rowText}>
                  {p.playerName}{p.started ? '' : '  (sub)'}
                </Text>
                <Text style={s.minutesBadge}>{p.minutes}'</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Share ── */}
        <TouchableOpacity
          onPress={onShare}
          style={{
            backgroundColor: '#111', borderRadius: 14, paddingVertical: 15,
            alignItems: 'center', marginTop: 18,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Share result</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = {
  card: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb',
    padding: 16, marginTop: 14,
  } as const,
  cardTitle: { fontSize: 13, fontWeight: '800', color: '#111', letterSpacing: 0.3, marginBottom: 10 } as const,
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 } as const,
  minute: { width: 32, fontSize: 13, fontWeight: '800', color: '#9ca3af' } as const,
  rowText: { fontSize: 15, fontWeight: '600', color: '#111' } as const,
  rowFaint: { fontSize: 12, color: '#9ca3af' } as const,
  minutesBadge: { fontSize: 13, fontWeight: '800', color: '#111' } as const,
};
