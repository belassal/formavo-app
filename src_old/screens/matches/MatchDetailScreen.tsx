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
  addPlayerToMatchRoster,
  listenMatchRoster,
  removePlayerFromMatchRoster,
  markMatchCompleted,
  setMatchPlayerAttendance,
  setMatchPlayerRole,
  softDeleteMatch,
  updateMatch,
  startMatch,
  endMatch,
  adjustScore,
  type AttendanceStatus,
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

  const [loading, setLoading] = useState(true);

  // match doc
  const [match, setMatch] = useState<any | null>(null);

  // match roster
  const [roster, setRoster] = useState<any[]>([]);

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

  // v0.4: score updates (optional UX)
  const [updatingScore, setUpdatingScore] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const isCompleted: boolean = (match?.status || 'scheduled') === 'completed';

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

    const unsubTeam = listenTeamMemberships(teamId, (rows) => {
      setTeamPlayers(rows.filter((r: any) => (r.status || 'active') === 'active'));
    });

    return () => {
      unsubMatch();
      unsubRoster();
      unsubTeam();
    };
  }, [teamId, matchId]);

  const playerCount = roster.length;

  // Sort roster by number (v0.3 polish)
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

  // ---- edit/delete/complete match ----
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

  const confirmComplete = () => {
    Alert.alert(
      'Mark as Completed?',
      'You can still edit roster, role, and attendance later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Completed',
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

  // ---- v0.4: score + live controls ----
  const homeScore = Number(match?.homeScore ?? 0);
  const awayScore = Number(match?.awayScore ?? 0);

  const bumpScore = async (field: 'homeScore' | 'awayScore', delta: number) => {
    // Keep simple UX: don't allow negatives
    const current = field === 'homeScore' ? homeScore : awayScore;
    if (delta < 0 && current <= 0) return;

    try {
      setUpdatingScore(true);
      await adjustScore({ teamId, matchId, field, delta });
    } catch (e: any) {
      Alert.alert('Score update failed', e?.message ?? 'Unknown error');
    } finally {
      setUpdatingScore(false);
    }
  };

  const onStartMatch = () => {
    Alert.alert(
      'Start Match?',
      'This will set the match status to LIVE.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            try {
              setUpdatingStatus(true);
              await startMatch({ teamId, matchId });
            } catch (e: any) {
              Alert.alert('Start failed', e?.message ?? 'Unknown error');
            } finally {
              setUpdatingStatus(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const onEndMatch = () => {
    Alert.alert(
      'End Match?',
      'This will set the match status to COMPLETED.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End',
          onPress: async () => {
            try {
              setUpdatingStatus(true);
              await endMatch({ teamId, matchId });
            } catch (e: any) {
              Alert.alert('End failed', e?.message ?? 'Unknown error');
            } finally {
              setUpdatingStatus(false);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // --- UI helpers ---
  const pill = (label: string) => (
    <View
      style={{
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderRadius: 999,
      }}
    >
      <Text style={{ fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </View>
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

  const scoreBtn = (label: string, disabled: boolean, onPress: () => void) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderRadius: 12,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: '900' }}>{label}</Text>
    </TouchableOpacity>
  );

  if (loading && !match) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const status: MatchStatus = (match?.status || 'scheduled') as MatchStatus;

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      {/* ===== Match summary card ===== */}
      <View style={{ borderWidth: 1, borderRadius: 14, padding: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '800' }}>vs {match?.opponent || 'Opponent'}</Text>
            <Text style={{ marginTop: 4, color: '#666' }}>
              {match?.dateISO || ''}
              {match?.location ? ` · ${match.location}` : ''}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end', gap: 8 }}>
            {pill(status)}
            {pill(`${playerCount} players`)}
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <TouchableOpacity
            onPress={openEdit}
            style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12 }}
          >
            <Text style={{ fontWeight: '800' }}>Edit</Text>
          </TouchableOpacity>

          {!isCompleted && (
            <TouchableOpacity
              onPress={confirmComplete}
              style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12 }}
            >
              <Text style={{ fontWeight: '800' }}>Mark Completed</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ===== Scoreboard (v0.4) ===== */}
      <View style={{ borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: '900' }}>
          {status === 'live' ? 'LIVE · Score' : 'Score'}
        </Text>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
          {/* Home */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontWeight: '800' }}>Home</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
              {scoreBtn('−', updatingScore || homeScore <= 0, () => bumpScore('homeScore', -1))}
              <Text style={{ fontSize: 26, fontWeight: '900' }}>{homeScore}</Text>
              {scoreBtn('+', updatingScore, () => bumpScore('homeScore', 1))}
            </View>
          </View>

          {/* Away */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontWeight: '800' }}>Away</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
              {scoreBtn('−', updatingScore || awayScore <= 0, () => bumpScore('awayScore', -1))}
              <Text style={{ fontSize: 26, fontWeight: '900' }}>{awayScore}</Text>
              {scoreBtn('+', updatingScore, () => bumpScore('awayScore', 1))}
            </View>
          </View>
        </View>

        {/* Live controls */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          {status === 'scheduled' && (
            <TouchableOpacity
              onPress={onStartMatch}
              disabled={updatingStatus}
              style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, opacity: updatingStatus ? 0.5 : 1 }}
            >
              <Text style={{ fontWeight: '900' }}>{updatingStatus ? 'Starting…' : 'Start Match'}</Text>
            </TouchableOpacity>
          )}

          {status === 'live' && (
            <TouchableOpacity
              onPress={onEndMatch}
              disabled={updatingStatus}
              style={{ paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, opacity: updatingStatus ? 0.5 : 1 }}
            >
              <Text style={{ fontWeight: '900' }}>{updatingStatus ? 'Ending…' : 'End Match'}</Text>
            </TouchableOpacity>
          )}
        </View>
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
              <View style={{ borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: '800' }}>
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

                <TouchableOpacity onPress={() => removeFromRoster(item.id)} style={{ marginTop: 10 }}>
                  <Text style={{ color: '#b00020', fontWeight: '800' }}>Remove</Text>
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
                  <Text style={{ fontWeight: '900', color: '#b00020' }}>
                    {deleting ? 'Deleting…' : 'Delete Match'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
