import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';
import { listenTeamMemberships } from '../../services/playerService';
import {
  addMatchEvent,
  addPlayerToMatchRoster,
  buildCardEvent,
  buildGoalEvent,
  buildSubEvent,
  deleteMatchEvent,
  listenMatchEvents,
  listenMatchRoster,
  markMatchLive,
  markMatchCompleted,
  removePlayerFromMatchRoster,
  setMatchPlayerAttendance,
  setMatchPlayerRole,
  softDeleteMatch,
  updateMatch,
  updateMatchEvent,
  type AttendanceStatus,
  type CardColor,
  type MatchEvent,
  type MatchRole,
  type MatchStatus,
} from '../../services/matchService';
import { db } from '../../services/firebase';
import { COL } from '../../models/collections';
import DateTimePickerModal, { formatDateISO } from '../../components/DateTimePickerModal';
import MiniPitchDisplay from '../../components/MiniPitchDisplay';



type MatchDetailRoute = RouteProp<TeamsStackParamList, 'MatchDetail'>;

function norm(s: string) {
  return (s || '').trim();
}

export function deriveScoreFromEvents(events: MatchEvent[]) {
  let home = 0;
  let away = 0;

  for (const e of events || []) {
    if (e.type !== 'goal') continue;
    const side = (e as any).side || 'home';
    if (side === 'home') home++;
    if (side === 'away') away++;
  }

  return { home, away };
}

export default function MatchDetailScreen() {
  const route = useRoute<MatchDetailRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<TeamsStackParamList>>();
  const { teamId, matchId } = route.params;
  const isParent = route.params.role === 'parent';

  // --- icon buttons (make ALL edit/delete icons match the event style) ---
  const ICON_BTN = {
    width: 24,
    height: 24,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    opacity: 0.6,
  };

  const ICON_HITSLOP = { top: 12, bottom: 12, left: 12, right: 12 };

  const ICON_EDIT_TEXT = { fontSize: 16, fontWeight: '900' as const };
  const ICON_X_TEXT = { fontSize: 16, fontWeight: '900' as const, color: '#b00020' };

  const [loading, setLoading] = useState(true);

  // match doc
  const [match, setMatch] = useState<any | null>(null);

  // match roster
  const [roster, setRoster] = useState<any[]>([]);

  // match events
  const [events, setEvents] = useState<MatchEvent[]>([]);

  // team roster (active memberships only)
  const [teamPlayers, setTeamPlayers] = useState<any[]>([]);

  // add-player modal
  const [showAdd, setShowAdd] = useState(false);
  const [q, setQ] = useState('');
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);

  // edit match modal
  const [showEdit, setShowEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editOpponent, setEditOpponent] = useState('');
  const [editDateISO, setEditDateISO] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);

  // delete confirm inside edit modal
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // add-event modal
  const [showEvent, setShowEvent] = useState(false);
  const [eventType, setEventType] = useState<'goal' | 'card' | 'sub'>('goal');
  const [eventMinute, setEventMinute] = useState('');

  // goal inputs (add)
  const [goalScorerId, setGoalScorerId] = useState<string>('');
  const [goalAssistId, setGoalAssistId] = useState<string>('');

  // card inputs (add)
  const [cardPlayerId, setCardPlayerId] = useState<string>('');
  const [cardColor, setCardColor] = useState<CardColor>('yellow');

  // goal side + opponent scorer (add)
  const [goalSide, setGoalSide] = useState<'home' | 'away'>('home');
  const [oppScorerName, setOppScorerName] = useState('');

  // sub inputs (add)
  const [subOutId, setSubOutId] = useState('');
  const [subInId, setSubInId] = useState('');

  // goal location map
  const [showGoalMap, setShowGoalMap] = useState(false);
  const [mapEvent, setMapEvent] = useState<MatchEvent | null>(null);

  // edit-event modal state
  const [showEditEvent, setShowEditEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState<MatchEvent | null>(null);

  // shared edit
  const [editEventMinute, setEditEventMinute] = useState('');

  // goal fields (edit)
  const [editGoalScorerId, setEditGoalScorerId] = useState('');
  const [editGoalAssistId, setEditGoalAssistId] = useState('');
  const [editOppScorerName, setEditOppScorerName] = useState('');

  // card fields (edit)
  const [editCardPlayerId, setEditCardPlayerId] = useState('');
  const [editCardColor, setEditCardColor] = useState<CardColor>('yellow');

  // --- listeners ---
  useEffect(() => {
    const unsubMatch = db
      .collection(COL.teams)
      .doc(teamId)
      .collection(COL.matches)
      .doc(matchId)
      .onSnapshot(
        (snap) => {
          const data = snap.exists ? { id: snap.id, ...snap.data() } : null;
          setMatch(data);
        },
        (err) => {
          console.log('[MatchDetailScreen] match doc error:', err);
        }
      );

    const unsubRoster = listenMatchRoster(teamId, matchId, (rows) => {
      setRoster(rows);
      setLoading(false);
    });

    const unsubEvents = listenMatchEvents(teamId, matchId, (rows) => {
      setEvents(rows);
    });

    const unsubTeam = listenTeamMemberships(teamId, (rows) => {
      setTeamPlayers(rows.filter((r: any) => (r.status || 'active') === 'active'));
    });

    return () => {
      unsubMatch();
      unsubRoster();
      unsubEvents();
      unsubTeam();
    };
  }, [teamId, matchId]);

  // --- goal side cleanup ---
  useEffect(() => {
    if (goalSide === 'away') {
      setGoalScorerId('');
      setGoalAssistId('');
    } else {
      setOppScorerName('');
    }
  }, [goalSide]);

  // Sort roster by number (polish)
  const rosterSorted = useMemo(() => {
    const toNum = (x: any) => {
      const n = parseInt(String(x ?? '').trim(), 10);
      return Number.isFinite(n) ? n : 9999;
    };
    return [...roster].sort((a, b) => {
      const an = toNum(a.number);
      const bn = toNum(b.number);
      if (an !== bn) return an - bn;
      return String(a.playerName || '').localeCompare(String(b.playerName || ''));
    });
  }, [roster]);

  const rosterForPick = rosterSorted;

  // Derive RSVP map from the existing roster state (no extra listener needed)
  const rsvpMap = useMemo(() => {
    const map: Record<string, 'attending' | 'absent' | 'pending'> = {};
    roster.forEach((r: any) => {
      map[r.id] = (r.rsvpStatus as 'attending' | 'absent' | 'pending') || 'pending';
    });
    return map;
  }, [roster]);

  const findRosterName = (playerId: string) => {
    const r = rosterForPick.find((x: any) => x.id === playerId);
    return r?.playerName || 'Player';
  };

const closeAddModal = () => {
  setShowAdd(false);
  setQ('');
  setSelectedToAdd([]);
};

const toggleSelectToAdd = (playerId: string) => {
  setSelectedToAdd((prev) =>
    prev.includes(playerId)
      ? prev.filter((id) => id !== playerId)
      : [...prev, playerId]
  );
};

const addSelectedToRoster = async () => {
  if (!selectedToAdd.length) return;

  try {
    const players = teamPlayers.filter(
      (p: any) => selectedToAdd.includes(p.id) && !rosterIds.has(p.id)
    );

    await Promise.all(
      players.map((p: any) =>
        addPlayerToMatchRoster({
          teamId,
          matchId,
          playerId: p.id,
          playerName: p.playerName,
          number: p.number || '',
          position: p.position || '',
          role: 'bench',
          attendance: 'present',
        })
      )
    );

    closeAddModal();
  } catch (e: any) {
    Alert.alert('Add to roster failed', e?.message ?? 'Unknown error');
  }
};

  const removeFromRoster = async (playerId: string) => {
    try {
      await removePlayerFromMatchRoster(teamId, matchId, playerId);
    } catch (e: any) {
      Alert.alert('Remove failed', e?.message ?? 'Unknown error');
    }
  };

  const confirmRemoveFromRoster = (playerId: string, playerName?: string) => {
    Alert.alert(
      'Remove player?',
      `Remove ${playerName || 'this player'} from the match roster?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeFromRoster(playerId) },
      ],
      { cancelable: true }
    );
  };

  // available team players not already on match roster
  const rosterIds = useMemo(() => new Set(roster.map((r) => r.id)), [roster]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return teamPlayers.filter((p: any) => {
      if (rosterIds.has(p.id)) return false;
      if (!needle) return true;
      return String(p.playerName || '').toLowerCase().includes(needle);
    });
  }, [teamPlayers, rosterIds, q]);

  // ---- role / attendance updates ----
  const setRole = async (playerId: string, role: MatchRole) => {
    try {
      await setMatchPlayerRole({ teamId, matchId, playerId, role });
    } catch (e: any) {
      Alert.alert('Update role failed', e?.message ?? 'Unknown error');
    }
  };

  const setAttendance = async (playerId: string, attendance: AttendanceStatus) => {
    try {
      await setMatchPlayerAttendance({ teamId, matchId, playerId, attendance });
    } catch (e: any) {
      Alert.alert('Update attendance failed', e?.message ?? 'Unknown error');
    }
  };

  // ---- edit/delete match ----
  const openEdit = () => {
    setEditOpponent(String(match?.opponent || ''));
    setEditDateISO(String(match?.dateISO || ''));
    setEditLocation(String(match?.location || ''));
    setConfirmDeleteText('');
    setShowEdit(true);
  };

  const saveEdit = async () => {
    const opp = norm(editOpponent);
    const dt = norm(editDateISO);

    if (!opp) return Alert.alert('Missing Opponent', 'Please enter opponent name.');
    if (!dt) return Alert.alert('Missing Date', 'Please enter date/time (ex: 2026-02-22 19:00).');

    try {
      setSavingEdit(true);
      await updateMatch({
        teamId,
        matchId,
        opponent: opp,
        dateISO: dt,
        location: norm(editLocation),
      });
      setShowEdit(false);
    } catch (e: any) {
      Alert.alert('Save Failed', e?.message ?? 'Unknown error');
    } finally {
      setSavingEdit(false);
    }
  };

  const onDeleteFromEdit = async () => {
    const typed = norm(confirmDeleteText);
    const mustMatch = norm(match?.opponent || '');
    if (!typed || typed.toLowerCase() !== mustMatch.toLowerCase()) {
      return Alert.alert('Not matched', 'Type the opponent name to confirm delete.');
    }

    try {
      setDeleting(true);
      await softDeleteMatch({ teamId, matchId });
      setShowEdit(false);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Delete failed', e?.message ?? 'Unknown error');
    } finally {
      setDeleting(false);
    }
  };

  // ---- match status ----
  const status: MatchStatus = (match?.status || 'scheduled') as MatchStatus;

  const confirmComplete = () => {
    Alert.alert(
      'End game?',
      'This will mark the match as completed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Game',
          onPress: async () => {
            try {
              await markMatchCompleted({ teamId, matchId });
            } catch (e: any) {
              Alert.alert('Update failed', e?.message ?? 'Unknown error');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // ---- events ----
  const openAddEvent = () => {
    setEventType('goal');
    setEventMinute('');
    setGoalScorerId('');
    setGoalAssistId('');
    setCardPlayerId('');
    setCardColor('yellow');
    setGoalSide('home');
    setOppScorerName('');
    setSubOutId('');
    setSubInId('');
    setShowEvent(true);
  };

  const saveEvent = async () => {
    const minute = norm(eventMinute);

    try {
      if (eventType === 'goal') {
        if (goalSide === 'home') {
          if (!goalScorerId) return Alert.alert('Missing scorer', 'Pick who scored the goal.');
          const scorerName = findRosterName(goalScorerId);
          const assistName = goalAssistId ? findRosterName(goalAssistId) : '';

          const event = buildGoalEvent({
            minute,
            side: 'home',
            scorerId: goalScorerId,
            scorerName,
            assistId: goalAssistId || '',
            assistName: assistName || '',
          });

          await addMatchEvent({ teamId, matchId, event });
        } else {
          const event = buildGoalEvent({
            minute,
            side: 'away',
            scorerId: '',
            scorerName: oppScorerName.trim() || 'Opponent',
            assistId: '',
            assistName: '',
          });

          await addMatchEvent({ teamId, matchId, event });
        }
      } else if (eventType === 'card') {
        if (!cardPlayerId) return Alert.alert('Missing player', 'Pick who got the card.');
        const playerName = findRosterName(cardPlayerId);
        const event = buildCardEvent({ minute, playerId: cardPlayerId, playerName, cardColor });
        await addMatchEvent({ teamId, matchId, event });
      } else {
        if (!subOutId) return Alert.alert('Missing player', 'Pick the player coming off.');
        if (!subInId) return Alert.alert('Missing player', 'Pick the player coming on.');
        const event = buildSubEvent({
          minute,
          outPlayerId: subOutId,
          outPlayerName: findRosterName(subOutId),
          inPlayerId: subInId,
          inPlayerName: findRosterName(subInId),
        });
        await addMatchEvent({ teamId, matchId, event });
      }

      setShowEvent(false);
    } catch (e: any) {
      Alert.alert('Save event failed', e?.message ?? 'Unknown error');
    }
  };

  const removeEvent = async (eventId: string) => {
    try {
      await deleteMatchEvent({ teamId, matchId, eventId });
    } catch (e: any) {
      Alert.alert('Delete event failed', e?.message ?? 'Unknown error');
    }
  };

  const confirmDeleteEvent = (eventId: string) => {
    Alert.alert(
      'Delete event?',
      'This will permanently remove the event from this match.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => removeEvent(eventId) },
      ],
      { cancelable: true }
    );
  };

  // ---- undo last event ----
  const lastEvent = useMemo(() => {
    if (!events || events.length === 0) return null;
    const sorted = [...events].sort((a: any, b: any) => {
      const as = a?.createdAt?.seconds ?? 0;
      const bs = b?.createdAt?.seconds ?? 0;
      return bs - as;
    });
    return sorted[0] || null;
  }, [events]);

  const confirmUndoLastEvent = () => {
    if (!lastEvent) return;
    Alert.alert(
      'Undo last event?',
      'This will remove the most recent event.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Undo', style: 'destructive', onPress: () => removeEvent(lastEvent.id) },
      ],
      { cancelable: true }
    );
  };

  // ---- edit event ----
  const openEditEvent = (ev: MatchEvent) => {
    setEditingEvent(ev);
    setEditEventMinute(String(ev.minute ?? ''));

    if (ev.type === 'goal') {
      if ((ev.side || 'home') === 'home') {
        setEditGoalScorerId(ev.scorerId || '');
        setEditGoalAssistId(ev.assistId || '');
        setEditOppScorerName('');
      } else {
        setEditGoalScorerId('');
        setEditGoalAssistId('');
        setEditOppScorerName(ev.scorerName || '');
      }
    } else {
      setEditCardPlayerId(ev.playerId || '');
      setEditCardColor((ev.cardColor || 'yellow') as CardColor);
    }

    setShowEditEvent(true);
  };

  const closeEditEvent = () => {
    setShowEditEvent(false);
    setEditingEvent(null);

    setEditEventMinute('');
    setEditGoalScorerId('');
    setEditGoalAssistId('');
    setEditOppScorerName('');
    setEditCardPlayerId('');
    setEditCardColor('yellow');
  };

  const saveEditedEvent = async () => {
    if (!editingEvent) return;

    try {
      const minuteStr = norm(editEventMinute);

      if (editingEvent.type === 'goal') {
        const side = (editingEvent.side || 'home') as 'home' | 'away';

        if (side === 'home') {
          if (!editGoalScorerId) return Alert.alert('Missing scorer', 'Pick who scored.');

          const scorerName = findRosterName(editGoalScorerId);
          const assistName = editGoalAssistId ? findRosterName(editGoalAssistId) : '';

          await updateMatchEvent({
            teamId,
            matchId,
            eventId: editingEvent.id,
            patch: {
              minute: minuteStr,
              scorerId: editGoalScorerId,
              scorerName,
              assistId: editGoalAssistId || '',
              assistName: assistName || '',
            },
          });
        } else {
          await updateMatchEvent({
            teamId,
            matchId,
            eventId: editingEvent.id,
            patch: {
              minute: minuteStr,
              scorerName: norm(editOppScorerName) || 'Opponent',
            },
          });
        }
      } else {
        if (!editCardPlayerId) return Alert.alert('Missing player', 'Pick a player.');
        const playerName = findRosterName(editCardPlayerId);

        await updateMatchEvent({
          teamId,
          matchId,
          eventId: editingEvent.id,
          patch: {
            minute: minuteStr,
            playerId: editCardPlayerId,
            playerName,
            cardColor: editCardColor,
          },
        });
      }

      closeEditEvent();
    } catch (e: any) {
      Alert.alert('Edit event failed', e?.message ?? 'Unknown error');
    }
  };

  // ---- stats / score label ----
  const score = useMemo(() => deriveScoreFromEvents(events), [events]);

  const cards = useMemo(() => {
    const yellow = events.filter((e) => e.type === 'card' && e.cardColor === 'yellow').length;
    const red = events.filter((e) => e.type === 'card' && e.cardColor === 'red').length;
    return { yellow, red };
  }, [events]);

  const scoreLabel = useMemo(() => {
    if (status === 'completed') return `FT ${score.home}-${score.away}`;
    if (status === 'live') return `LIVE ${score.home}-${score.away}`;
    return 'Scheduled';
  }, [score, status]);

  const playerCount = roster.length;

  // --- UI helpers ---
  const pill = (label: string) => (
    <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderRadius: 999 }}>
      <Text style={{ fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </View>
  );

  const pillBtn = (label: string, onPress: () => void) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: '#111',
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 999,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 4,
        elevation: 3,
      }}
    >
      <Text style={{ fontSize: 13, color: '#fff', fontWeight: '900', letterSpacing: 0.3 }}>
        ⚽ {label}
      </Text>
      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>→</Text>
    </TouchableOpacity>
  );

  const choiceBtn = (active: boolean, label: string, onPress: () => void) => (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderRadius: 10,
        backgroundColor: active ? '#111' : 'transparent',
      }}
    >
      <Text style={{ fontWeight: '800', color: active ? 'white' : '#111', fontSize: 12 }}>{label}</Text>
    </TouchableOpacity>
  );

  const tagBtn = (active: boolean, label: string, onPress: () => void) => (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderRadius: 999,
        backgroundColor: active ? '#111' : 'transparent',
      }}
    >
      <Text style={{ fontWeight: '800', color: active ? 'white' : '#111' }}>{label}</Text>
    </TouchableOpacity>
  );

  if (loading && !match) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  // ── Shared styles (same design language as Teams screens) ──────────────
  const SC = {
    container: { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden' as const, borderWidth: 1, borderColor: '#e5e7eb' },
    header: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingVertical: 14 },
    titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
    title: { fontSize: 17, fontWeight: '700' as const, color: '#111' },
    count: { fontSize: 13, fontWeight: '600' as const, color: '#9ca3af' },
    addBtn: { paddingVertical: 6, paddingHorizontal: 14, backgroundColor: '#f3f4f6', borderRadius: 20 },
    addBtnText: { fontSize: 14, fontWeight: '600' as const, color: '#111' },
    divider: { height: 1, backgroundColor: '#e5e7eb' },
    row: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 16, paddingVertical: 13 },
    emptyRow: { paddingHorizontal: 16, paddingVertical: 20 },
    emptyText: { color: '#9ca3af', fontSize: 14 },
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f2f2f7' }}>
      <FlatList
        data={[]}
        renderItem={null}
        contentContainerStyle={{ padding: 16, gap: 16 }}
        ListHeaderComponent={
          <>
            {/* ===== Match summary card ===== */}
            <View style={SC.container}>
              <View style={[SC.header, { paddingBottom: 12 }]}>
                <View style={{ flex: 1, paddingRight: 36 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#111' }}>vs {match?.opponent || 'Opponent'}</Text>
                  <Text style={{ marginTop: 3, color: '#9ca3af', fontSize: 13 }}>
                    {match?.dateISO ? formatDateISO(match.dateISO) : ''}
                    {match?.location ? ` · ${match.location}` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    {pill(scoreLabel)}
                    {match?.format ? pill(match.format) : null}
                    {pill(`${playerCount} players`)}
                    {pillBtn('Game Day', () => navigation.navigate('GameDayPitch', { teamId, matchId, role: route.params.role }))}
                  </View>
                  {!isParent && status === 'scheduled' && (
                    <TouchableOpacity
                      onPress={() => markMatchLive({ teamId, matchId })}
                      style={{ marginTop: 12, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#111', borderRadius: 12 }}
                    >
                      <Text style={{ fontWeight: '700', color: '#fff' }}>Start Game</Text>
                    </TouchableOpacity>
                  )}
                  {!isParent && status === 'live' && (
                    <TouchableOpacity
                      onPress={confirmComplete}
                      style={{ marginTop: 12, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#ef4444', borderRadius: 12 }}
                    >
                      <Text style={{ fontWeight: '700', color: '#fff' }}>End Game</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {!isParent && (
                  <TouchableOpacity onPress={openEdit} style={{ position: 'absolute', top: 12, right: 12 }} hitSlop={ICON_HITSLOP}>
                    <Text style={{ fontSize: 16, color: '#9ca3af' }}>✎</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* ===== Game Stats ===== */}
            <View style={SC.container}>
              <View style={SC.header}>
                <View style={SC.titleRow}>
                  <Text style={SC.title}>Game Stats</Text>
                  {events.length > 0 && <Text style={SC.count}>{events.length} events</Text>}
                </View>
                {!isParent && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {events.length > 0 && (
                      <TouchableOpacity onPress={confirmUndoLastEvent} style={SC.addBtn}>
                        <Text style={SC.addBtnText}>Undo</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={openAddEvent} style={SC.addBtn}>
                      <Text style={SC.addBtnText}>+ Event</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {events.length > 0 && (
                <>
                  <View style={SC.divider} />
                  <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, flexWrap: 'wrap' }}>
                    {pill(`Goals: ${score.home}–${score.away}`)}
                    {pill(`Yellow: ${cards.yellow}`)}
                    {pill(`Red: ${cards.red}`)}
                  </View>
                </>
              )}

              {events.length === 0 ? (
                <>
                  <View style={SC.divider} />
                  <View style={SC.emptyRow}>
                    <Text style={SC.emptyText}>No events yet. Add a goal or a card.</Text>
                  </View>
                </>
              ) : (
                events.map((item) => {
                  const minLabel = item.minute ? `${item.minute}'` : '';
                  const isGoal = item.type === 'goal';
                  const isHome = (item.side || 'home') === 'home';
                  const cardDot = item.cardColor === 'red' ? '🟥' : '🟨';

                  return (
                    <View key={item.id}>
                      <View style={SC.divider} />
                      <View style={[SC.row, { gap: 12 }]}>
                        {minLabel ? (
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#9ca3af', width: 28 }}>{minLabel}</Text>
                        ) : null}
                        {item.type === 'goal' ? (
                          <TouchableOpacity
                            style={{ flex: 1 }}
                            activeOpacity={0.6}
                            onPress={() => { setMapEvent(item); setShowGoalMap(true); }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: '#111', flex: 1 }}>
                                ⚽ {isHome ? item.scorerName || 'Unknown' : `${item.scorerName || 'Opp'} (away)`}
                              </Text>
                              {item.pos && (
                                <Text style={{ fontSize: 12 }}>📍</Text>
                              )}
                            </View>
                            {item.assistName ? (
                              <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>Assist: {item.assistName}</Text>
                            ) : null}
                          </TouchableOpacity>
                        ) : (
                          <View style={{ flex: 1 }}>
                            {item.type === 'sub' ? (
                              <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }}>
                                ↕ {item.outPlayerName || '?'} → {item.inPlayerName || '?'}
                              </Text>
                            ) : (
                              <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }}>
                                {cardDot} {item.playerName || 'Unknown'}
                              </Text>
                            )}
                          </View>
                        )}
                        {!isParent && (
                          <View style={{ flexDirection: 'row', gap: 2 }}>
                            <TouchableOpacity onPress={() => openEditEvent(item)} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }} hitSlop={ICON_HITSLOP}>
                              <Text style={{ fontSize: 15, color: '#9ca3af' }}>✎</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => confirmDeleteEvent(item.id)} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }} hitSlop={ICON_HITSLOP}>
                              <Text style={{ fontSize: 18, fontWeight: '700', color: '#ef4444', lineHeight: 22 }}>×</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {/* ===== Availability (RSVP) ===== */}
            <View style={SC.container}>
              <View style={SC.header}>
                <View style={SC.titleRow}>
                  <Text style={SC.title}>Availability</Text>
                  {rosterSorted.length > 0 && <Text style={SC.count}>{rosterSorted.length} players</Text>}
                </View>
              </View>
              {rosterSorted.length === 0 ? (
                <>
                  <View style={SC.divider} />
                  <View style={SC.emptyRow}>
                    <Text style={SC.emptyText}>Add players to the roster to see their availability.</Text>
                  </View>
                </>
              ) : (
                rosterSorted.map((item) => {
                  const rsvp = rsvpMap[item.id] ?? 'pending';
                  const badge =
                    rsvp === 'attending'
                      ? { bg: '#dcfce7', text: '#16a34a', label: 'Attending' }
                      : rsvp === 'absent'
                      ? { bg: '#fee2e2', text: '#dc2626', label: "Can't Make It" }
                      : { bg: '#f3f4f6', text: '#6b7280', label: 'Pending' };
                  const rsvpByName = (item as any).rsvpByName;
                  const rsvpNote = (item as any).rsvpNote;
                  return (
                    <View key={item.id}>
                      <View style={SC.divider} />
                      <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: '#111', flex: 1, marginRight: 10 }} numberOfLines={1}>
                            {item.playerName}{item.number ? `  #${item.number}` : ''}
                          </Text>
                          <View style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: badge.bg, borderRadius: 999 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: badge.text }}>{badge.label}</Text>
                          </View>
                        </View>
                        {rsvpByName ? (
                          <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>
                            Confirmed by {rsvpByName}
                          </Text>
                        ) : null}
                        {rsvpNote ? (
                          <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2, fontStyle: 'italic' }}>
                            "{rsvpNote}"
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {/* ===== Match Roster ===== */}
            {!isParent && (
              <View style={SC.container}>
                <View style={SC.header}>
                  <View style={SC.titleRow}>
                    <Text style={SC.title}>Match Roster</Text>
                    {rosterSorted.length > 0 && <Text style={SC.count}>{rosterSorted.length} players</Text>}
                  </View>
                  <TouchableOpacity onPress={() => { setQ(''); setSelectedToAdd([]); setShowAdd(true); }} style={SC.addBtn}>
                    <Text style={SC.addBtnText}>+ Add</Text>
                  </TouchableOpacity>
                </View>

                {rosterSorted.length === 0 ? (
                  <>
                    <View style={SC.divider} />
                    <View style={SC.emptyRow}>
                      <Text style={SC.emptyText}>No one on the roster yet.</Text>
                    </View>
                  </>
                ) : (
                  rosterSorted.map((item) => {
                    const role: MatchRole = (item.role || 'bench') as MatchRole;
                    const att: AttendanceStatus = (item.attendance || 'present') as AttendanceStatus;

                    return (
                      <View key={item.id}>
                        <View style={SC.divider} />
                        <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                          {/* Name row */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 15, fontWeight: '600', color: '#111', flex: 1 }}>
                              {item.playerName}{item.number ? `  #${item.number}` : ''}
                            </Text>
                            <TouchableOpacity onPress={() => confirmRemoveFromRoster(item.id, item.playerName)} hitSlop={ICON_HITSLOP}>
                              <Text style={{ fontSize: 18, fontWeight: '700', color: '#ef4444', lineHeight: 22 }}>×</Text>
                            </TouchableOpacity>
                          </View>
                          {/* Role + Attendance chips */}
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                            {choiceBtn(role === 'starter', 'Starter', () => setRole(item.id, 'starter'))}
                            {choiceBtn(role === 'bench', 'Bench', () => setRole(item.id, 'bench'))}
                            <View style={{ width: 1, backgroundColor: '#e5e7eb', marginHorizontal: 2 }} />
                            {choiceBtn(att === 'present', 'Present', () => setAttendance(item.id, 'present'))}
                            {choiceBtn(att === 'injured', 'Injured', () => setAttendance(item.id, 'injured'))}
                            {choiceBtn(att === 'absent', 'Absent', () => setAttendance(item.id, 'absent'))}
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </>
        }
      />

      {/* ===== Add Player Modal ===== */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={closeAddModal}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', overflow: 'hidden' }}>
            {/* Header */}
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>Add to Match Roster</Text>
              <TouchableOpacity onPress={closeAddModal}>
                <Text style={{ fontSize: 20, color: '#9ca3af', fontWeight: '600' }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' }}>
              <TextInput
                placeholder="Search players…"
                value={q}
                onChangeText={setQ}
                style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, fontSize: 15, color: '#111' }}
                placeholderTextColor="#9ca3af"
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity onPress={() => setSelectedToAdd(filtered.map((p: any) => p.id))} style={{ paddingVertical: 6, paddingHorizontal: 14, backgroundColor: '#f3f4f6', borderRadius: 20 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#111' }}>Select All</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedToAdd([])} style={{ paddingVertical: 6, paddingHorizontal: 14, backgroundColor: '#f3f4f6', borderRadius: 20 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#111' }}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Player list */}
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const active = selectedToAdd.includes(item.id);
                return (
                  <TouchableOpacity onPress={() => toggleSelectToAdd(item.id)} activeOpacity={0.6}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, backgroundColor: active ? '#f0fdf4' : '#fff' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '600', color: '#111' }}>
                          {item.playerName}{item.number ? `  #${item.number}` : ''}
                        </Text>
                        {item.position ? <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 1 }}>{item.position}</Text> : null}
                      </View>
                      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: active ? '#16a34a' : '#d1d5db', backgroundColor: active ? '#16a34a' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                        {active ? <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>✓</Text> : null}
                      </View>
                    </View>
                    <View style={{ height: 1, backgroundColor: '#f3f4f6', marginLeft: 16 }} />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={{ paddingHorizontal: 16, paddingVertical: 20 }}>
                  <Text style={{ color: '#9ca3af', fontSize: 14 }}>No available players to add.</Text>
                </View>
              }
            />

            {/* Footer */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
              <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: '600' }}>{selectedToAdd.length} selected</Text>
              <TouchableOpacity
                onPress={addSelectedToRoster}
                disabled={!selectedToAdd.length}
                style={{ paddingVertical: 10, paddingHorizontal: 20, backgroundColor: selectedToAdd.length ? '#111' : '#e5e7eb', borderRadius: 12 }}
              >
                <Text style={{ fontWeight: '700', color: selectedToAdd.length ? '#fff' : '#9ca3af', fontSize: 14 }}>
                  Add {selectedToAdd.length > 0 ? `(${selectedToAdd.length})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Add Event Modal ===== */}
      <Modal visible={showEvent} animationType="slide" transparent onRequestClose={() => setShowEvent(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%', overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>Add Event</Text>
              <TouchableOpacity onPress={() => setShowEvent(false)}>
                <Text style={{ fontSize: 20, color: '#9ca3af', fontWeight: '600' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={[]}
              renderItem={null}
              ListHeaderComponent={
                <View style={{ padding: 16, gap: 14 }}>
                  {/* Event type */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {(['goal', 'card', 'sub'] as const).map((t) => (
                      <TouchableOpacity key={t} onPress={() => setEventType(t)}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: eventType === t ? '#111' : '#f3f4f6' }}>
                        <Text style={{ fontWeight: '700', fontSize: 13, color: eventType === t ? '#fff' : '#374151' }}>
                          {t === 'goal' ? '⚽ Goal' : t === 'card' ? '🟨 Card' : '↕ Sub'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Minute */}
                  <TextInput placeholder="Minute (e.g. 34)" value={eventMinute} onChangeText={setEventMinute} keyboardType="number-pad"
                    style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, fontSize: 15, color: '#111' }}
                    placeholderTextColor="#9ca3af" />

                  {eventType === 'sub' ? (
                    <>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>Player Off (starter)</Text>
                      {rosterForPick.filter((x: any) => x.role === 'starter').map((item: any) => {
                        const active = item.id === subOutId;
                        return (
                          <TouchableOpacity key={item.id} onPress={() => setSubOutId(item.id)} activeOpacity={0.6}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, backgroundColor: active ? '#111' : '#f9fafb', borderRadius: 10, marginBottom: 4 }}>
                            <Text style={{ flex: 1, fontWeight: '600', fontSize: 14, color: active ? '#fff' : '#111' }}>
                              {item.playerName}{item.number ? `  #${item.number}` : ''}
                            </Text>
                            {active && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
                          </TouchableOpacity>
                        );
                      })}
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 4 }}>Player On (bench)</Text>
                      {rosterForPick.filter((x: any) => x.role === 'bench' && x.id !== subOutId).map((item: any) => {
                        const active = item.id === subInId;
                        return (
                          <TouchableOpacity key={item.id} onPress={() => setSubInId(item.id)} activeOpacity={0.6}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, backgroundColor: active ? '#111' : '#f9fafb', borderRadius: 10, marginBottom: 4 }}>
                            <Text style={{ flex: 1, fontWeight: '600', fontSize: 14, color: active ? '#fff' : '#111' }}>
                              {item.playerName}{item.number ? `  #${item.number}` : ''}
                            </Text>
                            {active && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </>
                  ) : eventType === 'goal' ? (
                    <>
                      {/* Goal side */}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {(['home', 'away'] as const).map((s) => (
                          <TouchableOpacity key={s} onPress={() => setGoalSide(s)}
                            style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: goalSide === s ? '#111' : '#f3f4f6' }}>
                            <Text style={{ fontWeight: '700', fontSize: 13, color: goalSide === s ? '#fff' : '#374151' }}>{s === 'home' ? 'Our Goal' : 'Opponent Goal'}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {goalSide === 'away' ? (
                        <TextInput placeholder="Opponent scorer (optional)" value={oppScorerName} onChangeText={setOppScorerName}
                          style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, fontSize: 15, color: '#111' }}
                          placeholderTextColor="#9ca3af" />
                      ) : (
                        <>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>Scorer</Text>
                          {rosterForPick.map((item: any) => {
                            const active = item.id === goalScorerId;
                            return (
                              <TouchableOpacity key={item.id} onPress={() => setGoalScorerId(item.id)} activeOpacity={0.6}
                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, backgroundColor: active ? '#111' : '#f9fafb', borderRadius: 10, marginBottom: 4 }}>
                                <Text style={{ flex: 1, fontWeight: '600', fontSize: 14, color: active ? '#fff' : '#111' }}>
                                  {item.playerName}{item.number ? `  #${item.number}` : ''}
                                </Text>
                                {active && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
                              </TouchableOpacity>
                            );
                          })}
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 4 }}>Assist (optional)</Text>
                          {rosterForPick.filter((x: any) => x.id !== goalScorerId).map((item: any) => {
                            const active = item.id === goalAssistId;
                            return (
                              <TouchableOpacity key={item.id} onPress={() => setGoalAssistId(active ? '' : item.id)} activeOpacity={0.6}
                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, backgroundColor: active ? '#111' : '#f9fafb', borderRadius: 10, marginBottom: 4 }}>
                                <Text style={{ flex: 1, fontWeight: '600', fontSize: 14, color: active ? '#fff' : '#111' }}>
                                  {item.playerName}{item.number ? `  #${item.number}` : ''}
                                </Text>
                                {active && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
                              </TouchableOpacity>
                            );
                          })}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>Player</Text>
                      {rosterForPick.map((item: any) => {
                        const active = item.id === cardPlayerId;
                        return (
                          <TouchableOpacity key={item.id} onPress={() => setCardPlayerId(item.id)} activeOpacity={0.6}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, backgroundColor: active ? '#111' : '#f9fafb', borderRadius: 10, marginBottom: 4 }}>
                            <Text style={{ flex: 1, fontWeight: '600', fontSize: 14, color: active ? '#fff' : '#111' }}>
                              {item.playerName}{item.number ? `  #${item.number}` : ''}
                            </Text>
                            {active && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
                          </TouchableOpacity>
                        );
                      })}
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 4 }}>Card color</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {(['yellow', 'red'] as const).map((c) => (
                          <TouchableOpacity key={c} onPress={() => setCardColor(c)}
                            style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: cardColor === c ? '#111' : '#f3f4f6' }}>
                            <Text style={{ fontWeight: '700', fontSize: 14, color: cardColor === c ? '#fff' : '#374151' }}>{c === 'yellow' ? '🟨 Yellow' : '🟥 Red'}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
                </View>
              }
            />

            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
              <TouchableOpacity onPress={() => setShowEvent(false)} style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
                <Text style={{ color: '#6b7280', fontWeight: '600', fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEvent} style={{ paddingVertical: 10, paddingHorizontal: 24, backgroundColor: '#111', borderRadius: 12 }}>
                <Text style={{ fontWeight: '700', color: '#fff', fontSize: 15 }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Edit Event Modal ===== */}
      <Modal visible={showEditEvent} animationType="slide" transparent onRequestClose={closeEditEvent}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%', overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>Edit Event</Text>
              <TouchableOpacity onPress={closeEditEvent}>
                <Text style={{ fontSize: 20, color: '#9ca3af', fontWeight: '600' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={[]}
              renderItem={null}
              ListHeaderComponent={
                <View style={{ padding: 16, gap: 14 }}>
                  <TextInput placeholder="Minute (e.g. 34)" value={editEventMinute} onChangeText={setEditEventMinute} keyboardType="number-pad"
                    style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, fontSize: 15, color: '#111' }}
                    placeholderTextColor="#9ca3af" />

                  {editingEvent?.type === 'goal' ? (
                    (editingEvent.side || 'home') === 'away' ? (
                      <TextInput placeholder="Opponent scorer" value={editOppScorerName} onChangeText={setEditOppScorerName}
                        style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, fontSize: 15, color: '#111' }}
                        placeholderTextColor="#9ca3af" />
                    ) : (
                      <>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>Scorer</Text>
                        {rosterForPick.map((item: any) => {
                          const active = item.id === editGoalScorerId;
                          return (
                            <TouchableOpacity key={item.id} onPress={() => setEditGoalScorerId(item.id)} activeOpacity={0.6}
                              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, backgroundColor: active ? '#111' : '#f9fafb', borderRadius: 10, marginBottom: 4 }}>
                              <Text style={{ flex: 1, fontWeight: '600', fontSize: 14, color: active ? '#fff' : '#111' }}>
                                {item.playerName}{item.number ? `  #${item.number}` : ''}
                              </Text>
                              {active && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
                            </TouchableOpacity>
                          );
                        })}
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 4 }}>Assist (optional)</Text>
                        {rosterForPick.filter((x: any) => x.id !== editGoalScorerId).map((item: any) => {
                          const active = item.id === editGoalAssistId;
                          return (
                            <TouchableOpacity key={item.id} onPress={() => setEditGoalAssistId(active ? '' : item.id)} activeOpacity={0.6}
                              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, backgroundColor: active ? '#111' : '#f9fafb', borderRadius: 10, marginBottom: 4 }}>
                              <Text style={{ flex: 1, fontWeight: '600', fontSize: 14, color: active ? '#fff' : '#111' }}>
                                {item.playerName}{item.number ? `  #${item.number}` : ''}
                              </Text>
                              {active && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
                            </TouchableOpacity>
                          );
                        })}
                      </>
                    )
                  ) : (
                    <>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>Player</Text>
                      {rosterForPick.map((item: any) => {
                        const active = item.id === editCardPlayerId;
                        return (
                          <TouchableOpacity key={item.id} onPress={() => setEditCardPlayerId(item.id)} activeOpacity={0.6}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, backgroundColor: active ? '#111' : '#f9fafb', borderRadius: 10, marginBottom: 4 }}>
                            <Text style={{ flex: 1, fontWeight: '600', fontSize: 14, color: active ? '#fff' : '#111' }}>
                              {item.playerName}{item.number ? `  #${item.number}` : ''}
                            </Text>
                            {active && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}
                          </TouchableOpacity>
                        );
                      })}
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 4 }}>Card color</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {(['yellow', 'red'] as const).map((c) => (
                          <TouchableOpacity key={c} onPress={() => setEditCardColor(c)}
                            style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: editCardColor === c ? '#111' : '#f3f4f6' }}>
                            <Text style={{ fontWeight: '700', fontSize: 14, color: editCardColor === c ? '#fff' : '#374151' }}>{c === 'yellow' ? '🟨 Yellow' : '🟥 Red'}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
                </View>
              }
            />

            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
              <TouchableOpacity onPress={closeEditEvent} style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
                <Text style={{ color: '#6b7280', fontWeight: '600', fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEditedEvent} style={{ paddingVertical: 10, paddingHorizontal: 24, backgroundColor: '#111', borderRadius: 12 }}>
                <Text style={{ fontWeight: '700', color: '#fff', fontSize: 15 }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Goal Location Modal ===== */}
      <Modal visible={showGoalMap} animationType="slide" transparent onRequestClose={() => setShowGoalMap(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>
                  ⚽ {mapEvent?.scorerName || 'Goal'}
                  {mapEvent?.minute ? `  ·  ${mapEvent.minute}'` : ''}
                </Text>
                {mapEvent?.assistName ? (
                  <Text style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>Assist: {mapEvent.assistName}</Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => setShowGoalMap(false)}>
                <Text style={{ fontSize: 20, color: '#9ca3af', fontWeight: '600' }}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
              <MiniPitchDisplay
                goalPos={mapEvent?.pos}
                assistPos={mapEvent?.assistPos}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Edit Match Modal ===== */}
      <Modal visible={showEdit} animationType="slide" transparent onRequestClose={() => setShowEdit(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%', overflow: 'hidden' }}>
            {/* Header */}
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>Edit Match</Text>
              <TouchableOpacity onPress={() => setShowEdit(false)} disabled={savingEdit || deleting}>
                <Text style={{ fontSize: 20, color: '#9ca3af', fontWeight: '600' }}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={[]}
              renderItem={null}
              ListHeaderComponent={
                <View style={{ padding: 16, gap: 12 }}>
                  <TextInput
                    placeholder="Opponent" value={editOpponent} onChangeText={setEditOpponent}
                    style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, fontSize: 15, color: '#111' }}
                    placeholderTextColor="#9ca3af"
                  />
                  <TouchableOpacity onPress={() => setShowEditDatePicker(true)}
                    style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: editDateISO ? '#111' : '#9ca3af', fontSize: 15 }}>
                      {editDateISO ? formatDateISO(editDateISO) : 'Date & time (required)'}
                    </Text>
                    <Text style={{ fontSize: 16 }}>📅</Text>
                  </TouchableOpacity>
                  <TextInput
                    placeholder="Location (optional)" value={editLocation} onChangeText={setEditLocation}
                    style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, fontSize: 15, color: '#111' }}
                    placeholderTextColor="#9ca3af"
                  />

                  {/* Danger zone */}
                  <View style={{ marginTop: 8, backgroundColor: '#fff5f5', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#fecaca' }}>
                    <Text style={{ fontWeight: '700', color: '#dc2626', fontSize: 14 }}>Delete Match</Text>
                    <Text style={{ marginTop: 4, color: '#6b7280', fontSize: 13 }}>
                      Type <Text style={{ fontWeight: '700', color: '#111' }}>{match?.opponent || 'opponent'}</Text> to confirm deletion.
                    </Text>
                    <TextInput
                      placeholder="Type to confirm…"
                      value={confirmDeleteText}
                      onChangeText={setConfirmDeleteText}
                      style={{ backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, fontSize: 14, color: '#111', marginTop: 10, borderWidth: 1, borderColor: '#fecaca' }}
                      placeholderTextColor="#9ca3af"
                    />
                    <TouchableOpacity
                      onPress={onDeleteFromEdit}
                      disabled={deleting || norm(confirmDeleteText).toLowerCase() !== norm(match?.opponent || '').toLowerCase()}
                      style={{ marginTop: 10, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#dc2626', borderRadius: 10, alignSelf: 'flex-end',
                        opacity: (deleting || norm(confirmDeleteText).toLowerCase() !== norm(match?.opponent || '').toLowerCase()) ? 0.35 : 1 }}>
                      <Text style={{ fontWeight: '700', color: '#fff', fontSize: 14 }}>{deleting ? 'Deleting…' : 'Delete Match'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              }
            />

            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
              <TouchableOpacity onPress={() => setShowEdit(false)} disabled={savingEdit || deleting} style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
                <Text style={{ color: '#6b7280', fontWeight: '600', fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveEdit} disabled={savingEdit || deleting} style={{ paddingVertical: 10, paddingHorizontal: 24, backgroundColor: '#111', borderRadius: 12, opacity: savingEdit ? 0.6 : 1 }}>
                <Text style={{ fontWeight: '700', color: '#fff', fontSize: 15 }}>{savingEdit ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        {showEditDatePicker && (
          <DateTimePickerModal
            visible={showEditDatePicker}
            value={editDateISO}
            onConfirm={(iso) => { setEditDateISO(iso); setShowEditDatePicker(false); }}
            onClose={() => setShowEditDatePicker(false)}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
}