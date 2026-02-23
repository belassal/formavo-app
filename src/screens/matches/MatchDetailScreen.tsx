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
  updateMatchEvent, // ✅ REQUIRED for editing events
  type AttendanceStatus,
  type CardColor,
  type MatchEvent,
  type MatchRole,
  type MatchStatus,
} from '../../services/matchService';
import { db } from '../../services/firebase';
import { COL } from '../../models/collections';

type MatchDetailRoute = RouteProp<TeamsStackParamList, 'MatchDetail'>;

function norm(s: string) {
  return (s || '').trim();
}

export default function MatchDetailScreen() {
  const route = useRoute<MatchDetailRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<TeamsStackParamList>>();
  const { teamId, matchId } = route.params;

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

  // edit match modal
  const [showEdit, setShowEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editOpponent, setEditOpponent] = useState('');
  const [editDateISO, setEditDateISO] = useState('');
  const [editLocation, setEditLocation] = useState('');

  // delete confirm inside edit modal
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // add-event modal
  const [showEvent, setShowEvent] = useState(false);
  const [eventType, setEventType] = useState<'goal' | 'card'>('goal');
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

  const findRosterName = (playerId: string) => {
    const r = rosterForPick.find((x: any) => x.id === playerId);
    return r?.playerName || 'Player';
  };

  // ---- add to roster ----
  const addToRoster = async (p: any) => {
    try {
      await addPlayerToMatchRoster({
        teamId,
        matchId,
        playerId: p.id,
        playerName: p.playerName,
        number: p.number || '',
        position: p.position || '',
        role: 'bench',
        attendance: 'present',
      });
      setShowAdd(false);
      setQ('');
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
      } else {
        if (!cardPlayerId) return Alert.alert('Missing player', 'Pick who got the card.');
        const playerName = findRosterName(cardPlayerId);

        const event = buildCardEvent({
          minute,
          playerId: cardPlayerId,
          playerName,
          color: cardColor,
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
      setEditCardColor((ev.color || 'yellow') as CardColor);
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
            color: editCardColor,
          },
        });
      }

      closeEditEvent();
    } catch (e: any) {
      Alert.alert('Edit event failed', e?.message ?? 'Unknown error');
    }
  };

  // ---- stats / score label ----
  const stats = useMemo(() => {
    const homeGoals = events.filter((e: any) => e.type === 'goal' && (e.side || 'home') === 'home').length;
    const awayGoals = events.filter((e: any) => e.type === 'goal' && e.side === 'away').length;

    const yellow = events.filter((e) => e.type === 'card' && e.color === 'yellow').length;
    const red = events.filter((e) => e.type === 'card' && e.color === 'red').length;
    return { homeGoals, awayGoals, yellow, red };
  }, [events]);

  const scoreLabel = useMemo(() => {
    const hg = stats.homeGoals ?? 0;
    const ag = stats.awayGoals ?? 0;

    if (status === 'completed') return `FT ${hg}-${ag}`;
    if (status === 'live') return `LIVE ${hg}-${ag}`;
    return 'Scheduled';
  }, [stats.homeGoals, stats.awayGoals, status]);

  const playerCount = roster.length;

  // --- UI helpers ---
  const pill = (label: string) => (
    <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderWidth: 1, borderRadius: 999 }}>
      <Text style={{ fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </View>
  );

  const pillBtn = (label: string, onPress: () => void) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      {pill(label)}
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

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      {/* ===== Match summary card ===== */}
      <View style={{ borderWidth: 1, borderRadius: 14, padding: 12, position: 'relative' }}>
        {/* Edit icon */}
        <TouchableOpacity
          onPress={openEdit}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            ...ICON_BTN,
          }}
          activeOpacity={0.3}
          hitSlop={ICON_HITSLOP}
        >
          <Text style={ICON_EDIT_TEXT}>✎</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1, paddingRight: 34 }}>
            <Text style={{ fontSize: 18, fontWeight: '800' }}>vs {match?.opponent || 'Opponent'}</Text>
            <Text style={{ marginTop: 4, color: '#666' }}>
              {match?.dateISO || ''}
              {match?.location ? ` · ${match.location}` : ''}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end', gap: 8, marginRight: 38 }}>
            {pill(scoreLabel)}
            {pill(`${playerCount} players`)}
            {pillBtn('Game Day', () => navigation.navigate('GameDayPitch', { teamId, matchId }))}
          </View>
        </View>

        {status === 'scheduled' && (
          <TouchableOpacity
            onPress={() => markMatchLive({ teamId, matchId })}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderRadius: 12,
              alignSelf: 'flex-start',
              marginTop: 12,
            }}
          >
            <Text style={{ fontWeight: '800' }}>Start Game</Text>
          </TouchableOpacity>
        )}

        {status === 'live' && (
          <TouchableOpacity
            onPress={confirmComplete}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderRadius: 12,
              alignSelf: 'flex-start',
              marginTop: 12,
            }}
          >
            <Text style={{ fontWeight: '800' }}>End Game</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ===== Game Stats ===== */}
      <View style={{ marginTop: 14, borderWidth: 1, borderRadius: 14, padding: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 18, fontWeight: '900' }}>Game Stats</Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {events.length > 0 && (
              <TouchableOpacity
                onPress={confirmUndoLastEvent}
                style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12 }}
              >
                <Text style={{ fontWeight: '900' }}>Undo</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={openAddEvent}
              style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12 }}
            >
              <Text style={{ fontWeight: '900' }}>+ Event</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          {pill(`Goals: ${stats.homeGoals}-${stats.awayGoals}`)}
          {pill(`Yellow: ${stats.yellow}`)}
          {pill(`Red: ${stats.red}`)}
        </View>

        {events.length === 0 ? (
          <Text style={{ marginTop: 10, color: '#666' }}>No events yet. Add a goal or a card.</Text>
        ) : (
          <FlatList
            style={{ marginTop: 10, maxHeight: 220 }}
            data={events}
            keyExtractor={(e) => e.id}
            renderItem={({ item }) => {
              const minLabel = `${item.minute ?? 0}'`;

              const title =
                item.type === 'goal'
                  ? `GOAL · ${item.scorerName || 'Scorer'}${item.assistName ? ` (A: ${item.assistName})` : ''}`
                  : `CARD · ${(item.color || 'yellow').toUpperCase()} · ${item.playerName || 'Player'}`;

              return (
                <TouchableOpacity
                  onPress={() => openEditEvent(item)}
                  activeOpacity={0.85}
                  style={{
                    borderWidth: 1,
                    borderRadius: 12,
                    padding: 10,
                    marginBottom: 10,
                    position: 'relative',
                  }}
                >
                  <Text style={{ fontWeight: '900', paddingRight: 70 }}>
                    {minLabel}  {title}
                  </Text>

                  {/* Right-side actions (edit + delete) */}
                  <View
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      flexDirection: 'row',
                      gap: 10,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => openEditEvent(item)}
                      style={ICON_BTN}
                      activeOpacity={0.3}
                      hitSlop={ICON_HITSLOP}
                    >
                      <Text style={ICON_EDIT_TEXT}>✎</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => confirmDeleteEvent(item.id)}
                      style={ICON_BTN}
                      activeOpacity={0.3}
                      hitSlop={ICON_HITSLOP}
                    >
                      <Text style={ICON_X_TEXT}>×</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>

      {/* ===== Roster header ===== */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: '700' }}>Match Roster</Text>

        <TouchableOpacity
          onPress={() => setShowAdd(true)}
          style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10 }}
        >
          <Text style={{ fontWeight: '600' }}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {rosterSorted.length === 0 ? (
        <Text style={{ marginTop: 16, color: '#666' }}>No one on the roster yet.</Text>
      ) : (
        <FlatList
          style={{ marginTop: 12 }}
          data={rosterSorted}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const role: MatchRole = (item.role || 'bench') as MatchRole;
            const att: AttendanceStatus = (item.attendance || 'present') as AttendanceStatus;

            return (
              <View style={{ borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10, position: 'relative' }}>
                <Text style={{ fontSize: 16, fontWeight: '800', paddingRight: 34 }}>
                  {item.playerName}
                  {item.number ? `  #${item.number}` : ''}
                </Text>

                <Text style={{ marginTop: 4, color: '#666' }}>
                  {item.position ? `Pos: ${item.position} · ` : ''}
                  Role: {role} · Attendance: {att}
                </Text>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {choiceBtn(role === 'starter', 'Starter', () => setRole(item.id, 'starter'))}
                  {choiceBtn(role === 'bench', 'Bench', () => setRole(item.id, 'bench'))}
                  {choiceBtn(att === 'present', 'Present', () => setAttendance(item.id, 'present'))}
                  {choiceBtn(att === 'injured', 'Injured', () => setAttendance(item.id, 'injured'))}
                  {choiceBtn(att === 'absent', 'Absent', () => setAttendance(item.id, 'absent'))}
                </View>

                <TouchableOpacity
                  onPress={() => confirmRemoveFromRoster(item.id, item.playerName)}
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    ...ICON_BTN,
                  }}
                  activeOpacity={0.3}
                  hitSlop={ICON_HITSLOP}
                >
                  <Text style={ICON_X_TEXT}>×</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      {/* ===== Add Player Modal ===== */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: 'white',
              padding: 16,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              gap: 10,
              maxHeight: '75%',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '800' }}>Add to Match Roster</Text>

            <TextInput
              placeholder="Search team players..."
              value={q}
              onChangeText={setQ}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => addToRoster(item)}
                  style={{ borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8 }}
                >
                  <Text style={{ fontWeight: '800' }}>
                    {item.playerName}
                    {item.number ? `  #${item.number}` : ''}
                  </Text>
                  <Text style={{ color: '#666', marginTop: 2 }}>
                    {item.position ? `Pos: ${item.position}` : ' '}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ marginTop: 10, color: '#666' }}>
                  No available players (or all already added).
                </Text>
              }
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Text style={{ padding: 10, color: '#444', fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Add Event Modal ===== */}
      <Modal visible={showEvent} animationType="slide" transparent onRequestClose={() => setShowEvent(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: 'white',
              padding: 16,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              gap: 12,
              maxHeight: '85%',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '900' }}>Add Event</Text>

            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              {tagBtn(eventType === 'goal', 'Goal', () => setEventType('goal'))}
              {tagBtn(eventType === 'card', 'Card', () => setEventType('card'))}
            </View>

            <TextInput
              placeholder="Minute (ex: 12)"
              value={eventMinute}
              onChangeText={setEventMinute}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
              keyboardType="number-pad"
            />

            {eventType === 'goal' ? (
              <>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                  {tagBtn(goalSide === 'home', 'Our goal', () => setGoalSide('home'))}
                  {tagBtn(goalSide === 'away', 'Opponent goal', () => setGoalSide('away'))}
                </View>

                {goalSide === 'away' ? (
                  <>
                    <Text style={{ fontWeight: '900', marginTop: 8 }}>Opponent scorer (optional)</Text>
                    <TextInput
                      placeholder="Opponent"
                      value={oppScorerName}
                      onChangeText={setOppScorerName}
                      style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
                    />
                  </>
                ) : (
                  <>
                    <Text style={{ fontWeight: '900', marginTop: 8 }}>Scorer</Text>
                    <FlatList
                      style={{ maxHeight: 180 }}
                      data={rosterForPick}
                      keyExtractor={(x) => x.id}
                      renderItem={({ item }) => {
                        const active = item.id === goalScorerId;
                        return (
                          <TouchableOpacity
                            onPress={() => setGoalScorerId(item.id)}
                            style={{
                              borderWidth: 1,
                              borderRadius: 12,
                              padding: 10,
                              marginTop: 8,
                              backgroundColor: active ? '#111' : 'transparent',
                            }}
                          >
                            <Text style={{ fontWeight: '900', color: active ? 'white' : '#111' }}>
                              {item.playerName}
                              {item.number ? `  #${item.number}` : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      }}
                    />

                    <Text style={{ fontWeight: '900', marginTop: 8 }}>Assist (optional)</Text>
                    <FlatList
                      style={{ maxHeight: 180 }}
                      data={rosterForPick.filter((x: any) => x.id !== goalScorerId)}
                      keyExtractor={(x) => x.id}
                      renderItem={({ item }) => {
                        const active = item.id === goalAssistId;
                        return (
                          <TouchableOpacity
                            onPress={() => setGoalAssistId(active ? '' : item.id)}
                            style={{
                              borderWidth: 1,
                              borderRadius: 12,
                              padding: 10,
                              marginTop: 8,
                              backgroundColor: active ? '#111' : 'transparent',
                            }}
                          >
                            <Text style={{ fontWeight: '900', color: active ? 'white' : '#111' }}>
                              {item.playerName}
                              {item.number ? `  #${item.number}` : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      }}
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <Text style={{ fontWeight: '900' }}>Player</Text>
                <FlatList
                  style={{ maxHeight: 220 }}
                  data={rosterForPick}
                  keyExtractor={(x) => x.id}
                  renderItem={({ item }) => {
                    const active = item.id === cardPlayerId;
                    return (
                      <TouchableOpacity
                        onPress={() => setCardPlayerId(item.id)}
                        style={{
                          borderWidth: 1,
                          borderRadius: 12,
                          padding: 10,
                          marginTop: 8,
                          backgroundColor: active ? '#111' : 'transparent',
                        }}
                      >
                        <Text style={{ fontWeight: '900', color: active ? 'white' : '#111' }}>
                          {item.playerName}
                          {item.number ? `  #${item.number}` : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={<Text style={{ color: '#666', marginTop: 8 }}>Add players to the roster first.</Text>}
                />

                <Text style={{ fontWeight: '900', marginTop: 8 }}>Card</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                  {tagBtn(cardColor === 'yellow', 'Yellow', () => setCardColor('yellow'))}
                  {tagBtn(cardColor === 'red', 'Red', () => setCardColor('red'))}
                </View>
              </>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <TouchableOpacity onPress={() => setShowEvent(false)}>
                <Text style={{ padding: 10, color: '#444', fontWeight: '800' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={saveEvent}
                style={{ paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderRadius: 12 }}
              >
                <Text style={{ fontWeight: '900' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Edit Event Modal ===== */}
      <Modal visible={showEditEvent} animationType="slide" transparent onRequestClose={closeEditEvent}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: 'white',
              padding: 16,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              gap: 12,
              maxHeight: '85%',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '900' }}>Edit Event</Text>

            <TextInput
              placeholder="Minute (ex: 12)"
              value={editEventMinute}
              onChangeText={setEditEventMinute}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
              keyboardType="number-pad"
            />

            {editingEvent?.type === 'goal' ? (
              <>
                {(editingEvent.side || 'home') === 'away' ? (
                  <>
                    <Text style={{ fontWeight: '900', marginTop: 4 }}>Opponent scorer</Text>
                    <TextInput
                      placeholder="Opponent"
                      value={editOppScorerName}
                      onChangeText={setEditOppScorerName}
                      style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
                    />
                  </>
                ) : (
                  <>
                    <Text style={{ fontWeight: '900', marginTop: 4 }}>Scorer</Text>
                    <FlatList
                      style={{ maxHeight: 180 }}
                      data={rosterForPick}
                      keyExtractor={(x) => x.id}
                      renderItem={({ item }) => {
                        const active = item.id === editGoalScorerId;
                        return (
                          <TouchableOpacity
                            onPress={() => setEditGoalScorerId(item.id)}
                            style={{
                              borderWidth: 1,
                              borderRadius: 12,
                              padding: 10,
                              marginTop: 8,
                              backgroundColor: active ? '#111' : 'transparent',
                            }}
                          >
                            <Text style={{ fontWeight: '900', color: active ? 'white' : '#111' }}>
                              {item.playerName}
                              {item.number ? `  #${item.number}` : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      }}
                    />

                    <Text style={{ fontWeight: '900', marginTop: 8 }}>Assist (optional)</Text>
                    <FlatList
                      style={{ maxHeight: 180 }}
                      data={rosterForPick.filter((x: any) => x.id !== editGoalScorerId)}
                      keyExtractor={(x) => x.id}
                      renderItem={({ item }) => {
                        const active = item.id === editGoalAssistId;
                        return (
                          <TouchableOpacity
                            onPress={() => setEditGoalAssistId(active ? '' : item.id)}
                            style={{
                              borderWidth: 1,
                              borderRadius: 12,
                              padding: 10,
                              marginTop: 8,
                              backgroundColor: active ? '#111' : 'transparent',
                            }}
                          >
                            <Text style={{ fontWeight: '900', color: active ? 'white' : '#111' }}>
                              {item.playerName}
                              {item.number ? `  #${item.number}` : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      }}
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <Text style={{ fontWeight: '900' }}>Player</Text>
                <FlatList
                  style={{ maxHeight: 220 }}
                  data={rosterForPick}
                  keyExtractor={(x) => x.id}
                  renderItem={({ item }) => {
                    const active = item.id === editCardPlayerId;
                    return (
                      <TouchableOpacity
                        onPress={() => setEditCardPlayerId(item.id)}
                        style={{
                          borderWidth: 1,
                          borderRadius: 12,
                          padding: 10,
                          marginTop: 8,
                          backgroundColor: active ? '#111' : 'transparent',
                        }}
                      >
                        <Text style={{ fontWeight: '900', color: active ? 'white' : '#111' }}>
                          {item.playerName}
                          {item.number ? `  #${item.number}` : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />

                <Text style={{ fontWeight: '900', marginTop: 8 }}>Card</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                  {tagBtn(editCardColor === 'yellow', 'Yellow', () => setEditCardColor('yellow'))}
                  {tagBtn(editCardColor === 'red', 'Red', () => setEditCardColor('red'))}
                </View>
              </>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
              <TouchableOpacity onPress={closeEditEvent}>
                <Text style={{ padding: 10, color: '#444', fontWeight: '800' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={saveEditedEvent}
                style={{ paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderRadius: 12 }}
              >
                <Text style={{ fontWeight: '900' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Edit Match Modal (includes delete confirm) ===== */}
      <Modal visible={showEdit} animationType="slide" transparent onRequestClose={() => setShowEdit(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: 'white',
              padding: 16,
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              gap: 10,
              maxHeight: '85%',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '800' }}>Edit Match</Text>

            <TextInput
              placeholder="Opponent"
              value={editOpponent}
              onChangeText={setEditOpponent}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />
            <TextInput
              placeholder='Date/time (ex: "2026-02-22 19:00")'
              value={editDateISO}
              onChangeText={setEditDateISO}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />
            <TextInput
              placeholder="Location (optional)"
              value={editLocation}
              onChangeText={setEditLocation}
              style={{ borderWidth: 1, padding: 12, borderRadius: 12 }}
            />

            <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <TouchableOpacity onPress={() => setShowEdit(false)} disabled={savingEdit || deleting}>
                <Text style={{ padding: 10, color: '#444', fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={saveEdit}
                disabled={savingEdit || deleting}
                style={{ paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderRadius: 12 }}
              >
                <Text style={{ fontWeight: '800' }}>{savingEdit ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>

            {/* Danger zone */}
            <View style={{ borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 6 }}>
              <Text style={{ fontWeight: '900', color: '#b00020' }}>Danger zone</Text>
              <Text style={{ marginTop: 6, color: '#666' }}>
                Type <Text style={{ fontWeight: '900' }}>{match?.opponent || 'Opponent'}</Text> to delete this match.
              </Text>

              <TextInput
                placeholder="Type opponent to confirm"
                value={confirmDeleteText}
                onChangeText={setConfirmDeleteText}
                style={{ borderWidth: 1, padding: 12, borderRadius: 12, marginTop: 10 }}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
                <TouchableOpacity
                  onPress={onDeleteFromEdit}
                  disabled={
                    deleting ||
                    norm(confirmDeleteText).toLowerCase() !== norm(match?.opponent || '').toLowerCase()
                  }
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderWidth: 1,
                    borderRadius: 12,
                    opacity:
                      deleting ||
                      norm(confirmDeleteText).toLowerCase() !== norm(match?.opponent || '').toLowerCase()
                        ? 0.4
                        : 1,
                  }}
                >
                  <Text style={{ fontWeight: '900', color: '#b00020' }}>{deleting ? 'Deleting…' : 'Delete Match'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}