import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import type { TeamsStackParamList } from '../../navigation/stacks/TeamsStack';

import GameDayPitch from './components/GameDayPitch';
import { db } from '../../services/firebase';
import { COL } from '../../models/collections';
import { setMatchRosterSlotKey } from '../../services/matchService';
import { listenTeamMemberships } from '../../services/playerService';

type RouteT = RouteProp<TeamsStackParamList, 'GameDayPitch'>;

type MatchDoc = {
  opponent?: string;
  dateISO?: string;
  status?: 'scheduled' | 'live' | 'completed';
  formation?: string;
};

type MatchRosterRow = {
  id: string;
  playerId: string;
  playerName: string;
  number?: string;
  role?: 'starter' | 'bench';
  attendance?: 'present' | 'injured' | 'absent';
  slotKey?: string;
};

export default function GameDayPitchScreen() {
  const route = useRoute<RouteT>();
  const { teamId, matchId } = route.params;

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<MatchDoc | null>(null);
  const [roster, setRoster] = useState<MatchRosterRow[]>([]);

  // Team roster (memberships) -> used to show the *latest* name/number on game day
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

  // Slot assignment modal state
  const [assignSlotKey, setAssignSlotKey] = useState<string | null>(null);
  const [savingAssign, setSavingAssign] = useState(false);

  // 1) Match doc
  useEffect(() => {
    setLoading(true);

    const unsub = db
      .collection(COL.teams)
      .doc(teamId)
      .collection(COL.matches)
      .doc(matchId)
      .onSnapshot(
        (snap) => {
          if (!snap.exists) {
            setMatch(null);
            setLoading(false);
            return;
          }
          setMatch(snap.data() as MatchDoc);
          setLoading(false);
        },
        (err) => {
          console.error(err);
          Alert.alert('Error', 'Failed to load match.');
          setLoading(false);
        }
      );

    return () => unsub();
  }, [teamId, matchId]);

  // 2) Match roster
  useEffect(() => {
    const unsub = db
      .collection(COL.teams)
      .doc(teamId)
      .collection(COL.matches)
      .doc(matchId)
      .collection(COL.roster)
      .onSnapshot(
        (snap) => {
          const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as MatchRosterRow[];
          setRoster(rows);
        },
        (err) => {
          console.error(err);
          Alert.alert('Error', 'Failed to load match roster.');
        }
      );

    return () => unsub();
  }, [teamId, matchId]);

  // 3) Team roster (so name edits reflect in game day)
  useEffect(() => {
    const unsub = listenTeamMemberships(teamId, (rows) => setTeamMembers(rows));
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [teamId]);

  const memberById = useMemo(() => {
    const m: Record<string, any> = {};
    (teamMembers || []).forEach((r: any) => {
      const pid = r.playerId || r.id;
      if (pid) m[pid] = r;
    });
    return m;
  }, [teamMembers]);

  // Starters
  const starters = useMemo(() => {
    return roster
      .filter((r) => (r.role || 'bench') === 'starter')
      .filter((r) => (r.attendance || 'present') !== 'absent')
      .map((r) => {
        const pid = r.playerId || r.id;
        const mem = memberById[pid];
        return {
          id: pid,
          name: (mem?.playerName || mem?.name || r.playerName || 'Unknown') as string,
          number: String(r.number ?? mem?.number ?? '').trim() || undefined,
        };
      });
  }, [roster, memberById]);

  const formation = match?.formation || '4-3-3';

  // playerId -> slotKey
  const playerToSlotKey = useMemo(() => {
    const m: Record<string, string> = {};
    roster.forEach((r) => {
      const pid = r.playerId || r.id;
      if (r.slotKey) m[pid] = r.slotKey;
    });
    return m;
  }, [roster]);

  // slotKey -> playerId
  const slotToPlayerId = useMemo(() => {
    const m: Record<string, string> = {};
    Object.keys(playerToSlotKey).forEach((pid) => {
      const sk = playerToSlotKey[pid];
      m[sk] = pid;
    });
    return m;
  }, [playerToSlotKey]);

  const closeAssign = () => setAssignSlotKey(null);

  const assignPlayerToSlot = async (playerId: string) => {
    if (!assignSlotKey) return;

    try {
      setSavingAssign(true);

      // If another player is already in this slot, clear them
      const existing = slotToPlayerId[assignSlotKey];
      if (existing && existing !== playerId) {
        await setMatchRosterSlotKey({ teamId, matchId, playerId: existing, slotKey: null });
      }

      // Assign chosen player to slot
      await setMatchRosterSlotKey({ teamId, matchId, playerId, slotKey: assignSlotKey });

      closeAssign();
    } catch (e: any) {
      Alert.alert('Assign failed', e?.message ?? 'Unknown error');
    } finally {
      setSavingAssign(false);
    }
  };

  const clearThisSlot = async () => {
    if (!assignSlotKey) return;

    const existing = slotToPlayerId[assignSlotKey];
    if (!existing) {
      closeAssign();
      return;
    }

    try {
      setSavingAssign(true);
      await setMatchRosterSlotKey({ teamId, matchId, playerId: existing, slotKey: null });
      closeAssign();
    } catch (e: any) {
      Alert.alert('Clear failed', e?.message ?? 'Unknown error');
    } finally {
      setSavingAssign(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.loading}>Loading Game Day…</Text>
      </View>
    );
  }

  if (!match) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Match not found.</Text>
      </View>
    );
  }

  const selectedSlotCurrentPlayerId = assignSlotKey ? slotToPlayerId[assignSlotKey] : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Game Day Pitch</Text>
        <Text style={styles.subtitle}>Formation: {formation}</Text>
      </View>

      <View style={{ flex: 1 }}>
        <GameDayPitch
          formation={formation}
          starters={starters}
          playerToSlotKey={playerToSlotKey}
          onSlotPress={(slotKey) => setAssignSlotKey(slotKey)}
        />
      </View>

      {/* ===== Assign Slot Modal ===== */}
      <Modal visible={!!assignSlotKey} animationType="slide" transparent onRequestClose={closeAssign}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Assign position</Text>
            <Text style={styles.modalSub}>
              Slot: <Text style={{ fontWeight: '900' }}>{assignSlotKey}</Text>
            </Text>

            {/* Clear slot */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                onPress={closeAssign}
                disabled={savingAssign}
                style={[styles.modalBtn, { backgroundColor: 'transparent' }]}
              >
                <Text style={[styles.modalBtnText, { color: '#111' }]}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={clearThisSlot}
                disabled={savingAssign || !selectedSlotCurrentPlayerId}
                style={[
                  styles.modalBtn,
                  { borderColor: '#b00020' },
                  savingAssign || !selectedSlotCurrentPlayerId ? { opacity: 0.4 } : null,
                ]}
              >
                <Text style={[styles.modalBtnText, { color: '#b00020' }]}>Remove (−)</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSectionTitle, { marginTop: 14 }]}>Choose a starter (+)</Text>

            <FlatList
              data={starters}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => {
                const isAssignedHere = !!assignSlotKey && playerToSlotKey[item.id] === assignSlotKey;

                return (
                  <TouchableOpacity
                    onPress={() => assignPlayerToSlot(item.id)}
                    disabled={savingAssign}
                    style={[styles.pickRow, isAssignedHere ? styles.pickRowActive : null]}
                  >
                    <Text style={[styles.pickName, isAssignedHere ? { color: 'white' } : null]}>
                      {item.name}
                      {item.number ? `  #${item.number}` : ''}
                    </Text>

                    <Text style={[styles.pickMeta, isAssignedHere ? { color: 'white' } : null]}>
                      {playerToSlotKey[item.id] ? `Currently: ${playerToSlotKey[item.id]}` : 'Unassigned'}
                    </Text>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={{ marginTop: 10, color: '#666' }}>
                  No starters found. Mark players as Starter in Match Detail first.
                </Text>
              }
              style={{ marginTop: 10 }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220' },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  title: { color: 'white', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#cbd5e1', marginTop: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b1220' },
  loading: { marginTop: 10, color: '#cbd5e1' },
  error: { color: '#fca5a5' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: 'white',
    padding: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 18, fontWeight: '900' },
  modalSub: { marginTop: 6, color: '#444' },

  modalSectionTitle: { fontSize: 14, fontWeight: '900' },

  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: '#111',
  },
  modalBtnText: { fontWeight: '900' },

  pickRow: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  pickRowActive: {
    backgroundColor: '#111',
    borderColor: '#111',
  },
  pickName: { fontWeight: '900', color: '#111' },
  pickMeta: { marginTop: 4, color: '#666' },
});
