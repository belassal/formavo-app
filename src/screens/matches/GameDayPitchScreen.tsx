import firestore from '@react-native-firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import auth from '@react-native-firebase/auth';
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
import MatchHeader from './MatchHeader'; // adjust path if needed
import type { MatchState } from '../../models/match';
import { computeElapsedSec, computeMinute } from '../../services/matchClock';
import EventWizard from '../gameDay/components/EventWizard';

import {
  addMatchEvent,
  deleteMatchEvent,
  listenMatchEvents,
  buildGoalEvent,
  buildCardEvent,
  buildSubEvent,
} from '../../services/matchService';
import type { MatchEvent } from '../../models/matchEvent';
type RouteT = RouteProp<TeamsStackParamList, 'GameDayPitch'>;

type SlotPos = { x: number; y: number };

type MatchDoc = {
  opponent?: string;
  dateISO?: string;
  status?: 'scheduled' | 'live' | 'completed'; // you can keep this if you want
  formation?: string;
  halfDuration?: number;
  slotPos?: Record<string, SlotPos>;
  state?: MatchState;
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


const defaultMatchState: MatchState = {
  status: 'draft',
  elapsedSec: 0,
  homeScore: 0,
  awayScore: 0,
};

function getMatchState(m: MatchDoc | null): MatchState {
  return { ...defaultMatchState, ...(m?.state || {}) };
}

export default function GameDayPitchScreen() {
  const route = useRoute<RouteT>();
  const { teamId, matchId } = route.params;

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<MatchDoc | null>(null);
  const [roster, setRoster] = useState<MatchRosterRow[]>([]);

  const [events, setEvents] = useState<MatchEvent[]>([]);
  // Slot assignment modal state
  const [assignSlotKey, setAssignSlotKey] = useState<string | null>(null);
  const [savingAssign, setSavingAssign] = useState(false);

  // Player action modal
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'goal' | 'card'>('goal');
  const [cardColor, setCardColor] = useState<'yellow' | 'red'>('yellow');
  const [assistId, setAssistId] = useState<string>(''); // optional

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardPreset, setWizardPreset] =
  useState<null | { type:'goal'; side:'home'|'away' } | { type:'card' } | { type:'sub' }>(null);

  // Layout mode (drag positions)
  const [layoutMode, setLayoutMode] = useState(false);

  // Measured available size for the pitch container
  const [pitchContainerSize, setPitchContainerSize] = useState<{width:number;height:number}|null>(null);

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


  useEffect(() => {
    return listenMatchEvents(teamId, matchId, (rows) => setEvents(rows));
  }, [teamId, matchId]);

  const formation = match?.formation || '4-3-3';
  const state = getMatchState(match);

  // ...you already have `state` and can compute current matchSec:
  const getCurrentMatchSec = () => computeElapsedSec(state, Date.now());
  const currentMinute = () => computeMinute(state, Date.now());

  // For auto-assign: original starters by role
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

  // onPitch: anyone currently assigned to a slot (accounts for subs)
  const onPitch = useMemo(() => {
    return roster
      .filter((r) => !!r.slotKey)
      .filter((r) => (r.attendance || 'present') !== 'absent')
      .map((r) => ({
        id: r.playerId || r.id,
        name: r.playerName || 'Unknown',
        number: r.number ? String(r.number) : undefined,
      }));
  }, [roster]);

  // bench: anyone present without a slot (available to come on)
  const bench = useMemo(() => {
    return roster
      .filter((r) => !r.slotKey)
      .filter((r) => (r.attendance || 'present') === 'present')
      .map((r) => ({
        id: r.playerId || r.id,
        name: r.playerName || 'Unknown',
        number: r.number ? String(r.number) : undefined,
      }));
  }, [roster]);

  const rosterById = useMemo(() => {
    const m: Record<string, MatchRosterRow> = {};
    roster.forEach(r => {
      const pid = r.playerId || r.id;
      m[pid] = r;
    });
    return m;
  }, [roster]);

  const getPlayerName = (playerId: string) => rosterById[playerId]?.playerName || 'Player';

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


  const matchRef = useMemo(
    () =>
      db
        .collection(COL.teams)
        .doc(teamId)
        .collection(COL.matches)
        .doc(matchId),
    [teamId, matchId]
  );

  const score = useMemo(() => {
  let home = 0;
  let away = 0;

  for (const e of events) {
    if (e.type === 'goal') {
      if (e.side === 'home') home++;
      if (e.side === 'away') away++;
    }
  }
  return { home, away };
}, [events]);

const derivedState = useMemo(() => {
  return { ...state, homeScore: score.home, awayScore: score.away };
}, [state, score]);

  const updateState = async (patch: Partial<MatchState>) => {
    // Firestore cannot store undefined; use delete() to remove fields.
    const clean: any = {};
    Object.entries(patch).forEach(([k, v]) => {
      clean[k] = v === undefined ? firestore.FieldValue.delete() : v;
    });

    await matchRef.set({ state: clean }, { merge: true });
  };
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
  const undoLastGoal = async (side: 'home'|'away') => {
    // find last goal event for side
    const last = [...events]
      .filter(e => e.type === 'goal' && (e.side || 'home') === side)
      .sort((a:any,b:any) =>
        (b.minute ?? 0) - (a.minute ?? 0) ||
        (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
      )[0];

    if (!last) return;

    await deleteMatchEvent({ teamId, matchId, eventId: last.id });
  };



const onStart = async () => {
  const now = Date.now();
  await updateState({
    status: 'live',
    half: 1,
    startedAt: state.startedAt ?? now,
    resumedAt: now,
  });
};

const onHalfTime = async () => {
  const now = Date.now();
  if (state.status !== 'live') return;
  const resumedAt = state.resumedAt ?? state.startedAt ?? now;
  const add = Math.max(0, (now - resumedAt) / 1000);
  await updateState({
    status: 'halftime',
    elapsedSec: (state.elapsedSec || 0) + add,
    resumedAt: undefined,
  });
};

const onStartSecondHalf = async () => {
  const now = Date.now();
  if (state.status !== 'halftime') return;
  await updateState({
    status: 'live',
    half: 2,
    resumedAt: now,
  });
};

const onPause = async () => {
  const now = Date.now();
  if (state.status !== 'live') return;

  const resumedAt = state.resumedAt ?? state.startedAt ?? now;
  const add = Math.max(0, (now - resumedAt) / 1000);

  await updateState({
    status: 'paused',
    elapsedSec: (state.elapsedSec || 0) + add,
    resumedAt: undefined,
  });
};

const onResume = async () => {
  const now = Date.now();
  if (state.status !== 'paused') return;

  await updateState({
    status: 'live',
    resumedAt: now,
  });
};

const onEnd = async () => {
  const now = Date.now();

  // if live, accumulate time first
  if (state.status === 'live') {
    const resumedAt = state.resumedAt ?? state.startedAt ?? now;
    const add = Math.max(0, (now - resumedAt) / 1000);

    await updateState({
      status: 'final',
      elapsedSec: (state.elapsedSec || 0) + add,
      resumedAt: undefined,
    });
    return;
  }

  await updateState({ status: 'final' });
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


  const savePlayerEvent = async () => {
    if (!activePlayerId) return;

    try {
      const minute = String(currentMinute());

      if (actionType === 'goal') {
        const scorerName = getPlayerName(activePlayerId);
        const assistName = assistId ? getPlayerName(assistId) : '';

        await addMatchEvent({
          teamId,
          matchId,
          event: buildGoalEvent({
            minute,
            side: 'home',
            scorerId: activePlayerId,
            scorerName,
            assistId: assistId || '',
            assistName,
          }),
        });
      } else {
        await addMatchEvent({
          teamId,
          matchId,
          event: buildCardEvent({
            minute: currentMinute(),
            playerId: activePlayerId,
            playerName: getPlayerName(activePlayerId),
            cardColor: cardColor,
          }),
        });
      }

      setShowPlayerModal(false);
      setActivePlayerId(null);
      setAssistId('');
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Unknown error');
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

     <View style={styles.matchHeaderWrap}>
        <MatchHeader
          state={derivedState}
          canEdit={true}
          halfDuration={match?.halfDuration ?? 45}
          onStart={onStart}
          onHalfTime={onHalfTime}
          onStartSecondHalf={onStartSecondHalf}
          onPause={onPause}
          onResume={onResume}
          onEnd={onEnd}
          onQuickEvent={(preset) => {
            if (derivedState.status !== 'live') return; // optional: only log while live
            setWizardPreset(preset as any);
            setWizardOpen(true);
          }}
        />
      </View>

      <View
        style={styles.pitchWrap}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setPitchContainerSize({ width, height });
        }}
      >
        <GameDayPitch
          formation={formation}
          starters={onPitch}
          playerToSlotKey={playerToSlotKey}
          containerSize={pitchContainerSize ?? undefined}
          slotPos={match.slotPos || {}}
          layoutMode={layoutMode}
          onSlotPosChange={onSlotPosChange}
          events={events}
          onPlayerPress={(playerId) => {
            // optional: only allow logging when live
            if (derivedState.status !== 'live') return;

            setActivePlayerId(playerId);
            setActionType('goal');
            setCardColor('yellow');
            setAssistId('');
            setShowPlayerModal(true);
          }}
          onSlotPress={(slotKey) => {
            if (layoutMode) return;
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

            <Text style={[styles.modalSectionTitle, { marginTop: 14 }]}>Pick a player</Text>

            <FlatList
              data={[...onPitch, ...bench]}
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

      <Modal visible={showPlayerModal} animationType="slide" transparent onRequestClose={() => setShowPlayerModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{activePlayerId ? getPlayerName(activePlayerId) : 'Player'}</Text>
            <Text style={styles.modalSub}>Log an event</Text>

            {/* Pick type */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => setActionType('goal')}
                style={[styles.modalBtn, actionType === 'goal' ? { backgroundColor: '#111' } : null]}
              >
                <Text style={[styles.modalBtnText, actionType === 'goal' ? { color: 'white' } : null]}>Goal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setActionType('card')}
                style={[styles.modalBtn, actionType === 'card' ? { backgroundColor: '#111' } : null]}
              >
                <Text style={[styles.modalBtnText, actionType === 'card' ? { color: 'white' } : null]}>Card</Text>
              </TouchableOpacity>
            </View>

            {actionType === 'goal' ? (
              <>
                <Text style={[styles.modalSectionTitle, { marginTop: 14 }]}>Assist (optional)</Text>
                <FlatList
                  data={onPitch.filter(p => p.id !== activePlayerId)}
                  keyExtractor={(p) => p.id}
                  renderItem={({ item }) => {
                    const active = assistId === item.id;
                    return (
                      <TouchableOpacity
                        onPress={() => setAssistId(active ? '' : item.id)}
                        style={[styles.pickRow, active ? styles.pickRowActive : null]}
                      >
                        <Text style={[styles.pickName, active ? { color: 'white' } : null]}>
                          {item.name}{item.number ? `  #${item.number}` : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={<Text style={{ marginTop: 10, color: '#666' }}>No other starters.</Text>}
                  style={{ marginTop: 10, maxHeight: 260 }}
                />
              </>
            ) : (
              <>
                <Text style={[styles.modalSectionTitle, { marginTop: 14 }]}>Card color</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <TouchableOpacity
                    onPress={() => setCardColor('yellow')}
                    style={[styles.modalBtn, cardColor === 'yellow' ? { backgroundColor: '#111' } : null]}
                  >
                    <Text style={[styles.modalBtnText, cardColor === 'yellow' ? { color: 'white' } : null]}>Yellow</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setCardColor('red')}
                    style={[styles.modalBtn, cardColor === 'red' ? { backgroundColor: '#111' } : null]}
                  >
                    <Text style={[styles.modalBtnText, cardColor === 'red' ? { color: 'white' } : null]}>Red</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setShowPlayerModal(false)} style={[styles.modalBtn, { backgroundColor: 'transparent' }]}>
                <Text style={[styles.modalBtnText, { color: '#111' }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={savePlayerEvent} style={[styles.modalBtn, { backgroundColor: '#111' }]}>
                <Text style={[styles.modalBtnText, { color: 'white' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <EventWizard
        visible={wizardOpen}
        preset={wizardPreset as any}
        starters={onPitch}
        bench={bench}
        onCancel={() => {
          setWizardOpen(false);
          setWizardPreset(null);
        }}
        onSave={async (p) => {
          try {
            const minute = currentMinute();

            if (p.type === 'goal') {
              const scorerName = p.scorerId ? getPlayerName(p.scorerId) : 'Team';
              const assistName = p.assistId ? getPlayerName(p.assistId) : '';
              await addMatchEvent({
                teamId,
                matchId,
                event: buildGoalEvent({
                  minute,
                  side: p.side || 'home',
                  scorerId: p.scorerId || '',
                  scorerName,
                  assistId: p.assistId || '',
                  assistName,
                  pos: p.pos,
                  assistPos: p.assistPos,
                }),
              });
            } else if (p.type === 'card') {
              await addMatchEvent({
                teamId,
                matchId,
                event: buildCardEvent({
                  minute,
                  playerId: p.playerId!,
                  playerName: getPlayerName(p.playerId!),
                  cardColor: p.cardColor || 'yellow',
                  pos: p.pos,
                }),
              });
            } else if (p.type === 'sub') {
              await addMatchEvent({
                teamId,
                matchId,
                event: buildSubEvent({
                  minute,
                  outPlayerId: p.outPlayerId!,
                  outPlayerName: getPlayerName(p.outPlayerId!),
                  inPlayerId: p.inPlayerId!,
                  inPlayerName: getPlayerName(p.inPlayerId!),
                }),
              });
              // Move the incoming player to the outgoing player's slot on the pitch
              const outSlot = playerToSlotKey[p.outPlayerId!];
              if (outSlot) {
                await setMatchRosterSlotKey({ teamId, matchId, playerId: p.outPlayerId!, slotKey: null });
                await setMatchRosterSlotKey({ teamId, matchId, playerId: p.inPlayerId!, slotKey: outSlot });
              }
            }

            setWizardOpen(false);
            setWizardPreset(null);
          } catch (e: any) {
            Alert.alert('Save failed', e?.message ?? 'Unknown error');
          }
        }}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220' },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 30,
    elevation: 30,
  },
  matchHeaderWrap: {
    zIndex: 20,
    elevation: 20,          // iOS/Android stacking help
  },
  pitchWrap: {
    flex: 1,
    zIndex: 0,
    elevation: 0,
    marginTop: 6,           // small gap so it doesn’t “touch” the header
  },
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