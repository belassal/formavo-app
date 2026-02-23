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
import { setMatchRosterSlotKey, setMatchSlotPos } from '../../services/matchService';
import { buildSlots } from '../../services/formation';

type RouteT = RouteProp<TeamsStackParamList, 'GameDayPitch'>;

type SlotPos = { x: number; y: number };

type MatchDoc = {
  opponent?: string;
  dateISO?: string;
  status?: 'scheduled' | 'live' | 'completed';
  formation?: string;

  // Optional custom layout overrides (relative 0..1)
  slotPos?: Record<string, SlotPos>;
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

  // Slot assignment modal state
  const [assignSlotKey, setAssignSlotKey] = useState<string | null>(null);
  const [savingAssign, setSavingAssign] = useState(false);

  // Layout mode (drag positions)
  const [layoutMode, setLayoutMode] = useState(false);

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

  const formation = match?.formation || '4-3-3';

  // Starters
  const starters = useMemo(() => {
    return roster
      .filter((r) => (r.role || 'bench') === 'starter')
      .filter((r) => (r.attendance || 'present') !== 'absent')
      .map((r) => ({
        id: r.playerId || r.id,
        name: r.playerName || 'Unknown',
        number: r.number ? String(r.number) : undefined,
      }));
  }, [roster]);

  // playerId -> slotKey
  const playerToSlotKey = useMemo(() => {
    const m: Record<string, string> = {};
    roster.forEach((r) => {
      const pid = r.playerId || r.id;
      if (r.slotKey) m[pid] = r.slotKey;
    });
    return m;
  }, [roster]);

  // slotKey -> playerId (who is currently here?)
  const slotToPlayerId = useMemo(() => {
    const m: Record<string, string> = {};
    Object.keys(playerToSlotKey).forEach((pid) => {
      const sk = playerToSlotKey[pid];
      m[sk] = pid;
    });
    return m;
  }, [playerToSlotKey]);

  // One-time auto-assign (ONLY when nobody has any slotKey yet)
  useEffect(() => {
    const assignedCount = Object.keys(playerToSlotKey).length;
    if (!starters.length) return;
    if (assignedCount > 0) return; // <- prevents re-shuffling later

    // Fill slots deterministically and WRITE to Firestore (so it becomes stable)
    const slots = buildSlots(formation);
    const gk = slots.find((s) => s.key === 'GK');
    const others = slots.filter((s) => s.key !== 'GK').sort((a, b) => (b.y - a.y) || (a.x - b.x));

    (async () => {
      try {
        let idx = 0;
        if (gk && starters[idx]) {
          await setMatchRosterSlotKey({ teamId, matchId, playerId: starters[idx].id, slotKey: gk.key });
          idx++;
        }
        for (const s of others) {
          const p = starters[idx++];
          if (!p) break;
          await setMatchRosterSlotKey({ teamId, matchId, playerId: p.id, slotKey: s.key });
        }
      } catch (e) {
        console.log('[GameDayPitchScreen] auto-assign failed', e);
      }
    })();
  }, [teamId, matchId, formation, starters, playerToSlotKey]);

  const closeAssign = () => setAssignSlotKey(null);

  // Swap logic (stable): only touched slots change.
  const assignPlayerToSlot = async (playerId: string) => {
    if (!assignSlotKey) return;

    try {
      setSavingAssign(true);

      const targetSlot = assignSlotKey;
      const occupantId = slotToPlayerId[targetSlot] || null; // player currently in this slot
      const pickedCurrentSlot = playerToSlotKey[playerId] || null; // where picked player currently is

      // No-op if already there
      if (pickedCurrentSlot === targetSlot) {
        closeAssign();
        return;
      }

      // If slot has someone and picked player has a slot too => SWAP
      if (occupantId && pickedCurrentSlot) {
        await setMatchRosterSlotKey({ teamId, matchId, playerId: occupantId, slotKey: pickedCurrentSlot });
        await setMatchRosterSlotKey({ teamId, matchId, playerId, slotKey: targetSlot });
        closeAssign();
        return;
      }

      // If slot has someone but picked is unassigned => clear occupant, place picked
      if (occupantId && !pickedCurrentSlot) {
        await setMatchRosterSlotKey({ teamId, matchId, playerId: occupantId, slotKey: null });
        await setMatchRosterSlotKey({ teamId, matchId, playerId, slotKey: targetSlot });
        closeAssign();
        return;
      }

      // If slot is empty and picked is in another slot => move picked
      await setMatchRosterSlotKey({ teamId, matchId, playerId, slotKey: targetSlot });
      closeAssign();
    } catch (e: any) {
      Alert.alert('Assign failed', e?.message ?? 'Unknown error');
    } finally {
      setSavingAssign(false);
    }
  };

  const clearThisSlot = async () => {
    if (!assignSlotKey) return;

    const occupantId = slotToPlayerId[assignSlotKey];
    if (!occupantId) {
      closeAssign();
      return;
    }

    try {
      setSavingAssign(true);
      await setMatchRosterSlotKey({ teamId, matchId, playerId: occupantId, slotKey: null });
      closeAssign();
    } catch (e: any) {
      Alert.alert('Clear failed', e?.message ?? 'Unknown error');
    } finally {
      setSavingAssign(false);
    }
  };

  const onSlotPosChange = async (slotKey: string, pos: SlotPos) => {
    try {
      await setMatchSlotPos({ teamId, matchId, slotKey, pos });
    } catch (e: any) {
      Alert.alert('Save layout failed', e?.message ?? 'Unknown error');
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
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Game Day Pitch</Text>
          <Text style={styles.subtitle}>Formation: {formation}</Text>
        </View>

        <TouchableOpacity
          onPress={() => setLayoutMode((v) => !v)}
          style={[styles.modeBtn, layoutMode ? styles.modeBtnOn : null]}
        >
          <Text style={[styles.modeBtnText, layoutMode ? { color: 'white' } : null]}>
            {layoutMode ? 'Done' : 'Edit layout'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        <GameDayPitch
          formation={formation}
          starters={starters}
          playerToSlotKey={playerToSlotKey}
          slotPos={match.slotPos || {}}
          layoutMode={layoutMode}
          onSlotPosChange={onSlotPosChange}
          onPlayerPress={(playerId) => {
            // You can later open player details here
            console.log('Tapped player:', playerId);
          }}
          onSlotPress={(slotKey) => {
            if (layoutMode) return; // no assigning while dragging
            setAssignSlotKey(slotKey);
          }}
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
                <Text style={[styles.modalBtnText, { color: '#b00020' }]}>Clear slot</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSectionTitle, { marginTop: 14 }]}>Pick a starter</Text>

            <FlatList
              data={starters}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => {
                const current = playerToSlotKey[item.id] || '';
                const isInThisSlot = !!assignSlotKey && current === assignSlotKey;

                return (
                  <TouchableOpacity
                    onPress={() => assignPlayerToSlot(item.id)}
                    disabled={savingAssign}
                    style={[styles.pickRow, isInThisSlot ? styles.pickRowActive : null]}
                  >
                    <Text style={[styles.pickName, isInThisSlot ? { color: 'white' } : null]}>
                      {item.name}
                      {item.number ? `  #${item.number}` : ''}
                    </Text>

                    <Text style={[styles.pickMeta, isInThisSlot ? { color: 'white' } : null]}>
                      {current ? `Currently: ${current}` : 'Unassigned'}
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
  header: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: 'white', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#cbd5e1', marginTop: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b1220' },
  loading: { marginTop: 10, color: '#cbd5e1' },
  error: { color: '#fca5a5' },

  modeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 12,
  },
  modeBtnOn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.6)',
  },
  modeBtnText: {
    color: '#cbd5e1',
    fontWeight: '800',
  },

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
