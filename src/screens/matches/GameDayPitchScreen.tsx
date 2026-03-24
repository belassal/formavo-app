import firestore from '@react-native-firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import auth from '@react-native-firebase/auth';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  FlatList,
  ScrollView,
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
import { saveLineup, listenLineups, deleteLineup, applyLineupToMatch } from '../../services/lineupService';
import type { SavedLineup } from '../../models/lineup';
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
  const isParent = route.params.role === 'parent';

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

  // Saved lineups
  const [lineups, setLineups] = useState<SavedLineup[]>([]);
  const [showSaveLineup, setShowSaveLineup] = useState(false);
  const [showLoadLineup, setShowLoadLineup] = useState(false);
  const [lineupName, setLineupName] = useState('');
  const [savingLineup, setSavingLineup] = useState(false);
  const [applyingLineup, setApplyingLineup] = useState(false);

  // Player avatar URLs: playerId → avatarUrl
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [memberAvailability, setMemberAvailability] = useState<Record<string, { availability: string; note: string }>>({});

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

  // 4) Saved lineups for this team
  useEffect(() => {
    return listenLineups(teamId, setLineups);
  }, [teamId]);

  // 5) Avatar URLs + availability from team memberships
  useEffect(() => {
    const unsub = db
      .collection(COL.teams)
      .doc(teamId)
      .collection(COL.playerMemberships)
      .onSnapshot((snap) => {
        const urls: Record<string, string> = {};
        const avail: Record<string, { availability: string; note: string }> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as any;
          if (data.avatarUrl) urls[d.id] = data.avatarUrl;
          if (data.availability && data.availability !== 'fit') {
            avail[d.id] = { availability: data.availability, note: data.availabilityNote || '' };
          }
        });
        setAvatarUrls(urls);
        setMemberAvailability(avail);
      }, () => {});
    return () => unsub();
  }, [teamId]);

  const formation = match?.formation || '4-3-3';

  // Memoize so derivedState only updates when Firestore data actually changes,
  // not on every render cycle (prevents MatchHeader re-render cascade).
  const state = useMemo(() => getMatchState(match), [match]);

  // Stable slotPos reference — avoids passing a new {} object every render
  // which would cause GameDayPitch effects to re-fire unnecessarily.
  const slotPos = useMemo(() => match?.slotPos || {}, [match?.slotPos]);

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

  // ── Lineup handlers ───────────────────────────────────────────────────────
  const onSaveLineup = async () => {
    const name = lineupName.trim();
    if (!name) { Alert.alert('Name required', 'Enter a name for this lineup.'); return; }
    try {
      setSavingLineup(true);
      // Build slots from current assignments
      const slots: Record<string, { playerId: string; playerName: string }> = {};
      for (const r of roster) {
        if (r.slotKey) {
          slots[r.slotKey] = { playerId: r.playerId || r.id, playerName: r.playerName || 'Unknown' };
        }
      }
      await saveLineup({
        teamId,
        name,
        formation,
        format: match?.format || '',
        slots,
        slotPos: slotPos,
      });
      setShowSaveLineup(false);
      setLineupName('');
      Alert.alert('Saved!', `Lineup "${name}" saved for future matches.`);
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Unknown error');
    } finally {
      setSavingLineup(false);
    }
  };

  const onApplyLineup = async (lineup: SavedLineup) => {
    try {
      setApplyingLineup(true);
      await applyLineupToMatch({ teamId, matchId, lineup });
      setShowLoadLineup(false);
    } catch (e: any) {
      Alert.alert('Apply failed', e?.message ?? 'Unknown error');
    } finally {
      setApplyingLineup(false);
    }
  };

  const onDeleteLineup = (lineup: SavedLineup) => {
    Alert.alert('Delete lineup?', `Remove "${lineup.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteLineup(teamId, lineup.id) },
    ]);
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

        {!isParent && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {/* Load lineup — draft only */}
            {derivedState.status === 'draft' && (
              <TouchableOpacity
                onPress={() => setShowLoadLineup(true)}
                style={styles.modeBtn}
              >
                <Text style={styles.modeBtnText}>📋 Lineup</Text>
              </TouchableOpacity>
            )}

            {/* Save lineup */}
            <TouchableOpacity
              onPress={() => { setLineupName(''); setShowSaveLineup(true); }}
              style={styles.modeBtn}
            >
              <Text style={styles.modeBtnText}>💾 Save</Text>
            </TouchableOpacity>

            {/* Edit layout toggle */}
            <TouchableOpacity
              onPress={() => setLayoutMode((v) => !v)}
              style={[styles.modeBtn, layoutMode ? styles.modeBtnOn : null]}
            >
              <Text style={[styles.modeBtnText, layoutMode ? { color: 'white' } : null]}>
                {layoutMode ? 'Done' : 'Layout'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

     <View style={styles.matchHeaderWrap}>
        <MatchHeader
          state={derivedState}
          canEdit={!isParent}
          halfDuration={match?.halfDuration ?? 45}
          onStart={onStart}
          onHalfTime={onHalfTime}
          onStartSecondHalf={onStartSecondHalf}
          onPause={onPause}
          onResume={onResume}
          onEnd={onEnd}
          onQuickEvent={(preset) => {
            if (isParent) return;
            if (derivedState.status !== 'live') return;
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
          slotPos={slotPos}
          layoutMode={layoutMode}
          onSlotPosChange={onSlotPosChange}
          events={events}
          avatarUrls={avatarUrls}
          onPlayerPress={(playerId) => {
            if (isParent) return;
            if (derivedState.status !== 'live') return;

            setActivePlayerId(playerId);
            setActionType('goal');
            setCardColor('yellow');
            setAssistId('');
            setShowPlayerModal(true);
          }}
          onSlotPress={(slotKey) => {
            if (isParent) return;
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

                const playerAvail = memberAvailability[item.id];
                return (
                  <TouchableOpacity
                    onPress={() => assignPlayerToSlot(item.id)}
                    disabled={savingAssign}
                    style={[styles.pickRow, isInThisSlot ? styles.pickRowActive : null]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.pickName, isInThisSlot ? { color: 'white' } : null]}>
                        {item.name}
                        {item.number ? `  #${item.number}` : ''}
                      </Text>
                      {playerAvail && (
                        <Text style={{ fontSize: 12, color: playerAvail.availability === 'injured' ? '#dc2626' : '#d97706', fontWeight: '700' }}>
                          {playerAvail.availability === 'injured' ? '🤕' : '⚠️'}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.pickMeta, isInThisSlot ? { color: 'white' } : null]}>
                      {current ? `Currently: ${current}` : 'Unassigned'}
                      {playerAvail ? `  · ${playerAvail.availability}${playerAvail.note ? ` (${playerAvail.note})` : ''}` : ''}
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

      {/* ===== Save Lineup Modal ===== */}
      <Modal visible={showSaveLineup} animationType="slide" transparent onRequestClose={() => setShowSaveLineup(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Save Lineup</Text>
            <Text style={styles.modalSub}>
              Give this lineup a name so you can reuse it for future matches.
            </Text>
            <TextInput
              style={styles.lineupInput}
              placeholder="e.g. Standard 4-3-3"
              placeholderTextColor="#9ca3af"
              value={lineupName}
              onChangeText={setLineupName}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => setShowSaveLineup(false)}
                style={styles.lineupCancelBtn}
              >
                <Text style={styles.lineupCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onSaveLineup}
                disabled={savingLineup}
                style={[styles.lineupSaveBtn, savingLineup && { opacity: 0.5 }]}
              >
                <Text style={styles.lineupSaveText}>{savingLineup ? 'Saving…' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== Load Lineup Modal ===== */}
      <Modal visible={showLoadLineup} animationType="slide" transparent onRequestClose={() => setShowLoadLineup(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxHeight: '75%' }]}>
            <Text style={styles.modalTitle}>Load Lineup</Text>
            <Text style={styles.modalSub}>
              Tap a lineup to apply its slot assignments to this match.
            </Text>
            {lineups.length === 0 ? (
              <Text style={{ color: '#9ca3af', fontSize: 14, marginVertical: 16, textAlign: 'center' }}>
                No saved lineups yet. Set up a lineup and tap 💾 Save.
              </Text>
            ) : (
              <ScrollView style={{ marginTop: 8 }}>
                {lineups.map((lu) => (
                  <View key={lu.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <TouchableOpacity
                      style={{ flex: 1, backgroundColor: '#f3f4f6', borderRadius: 12, padding: 14 }}
                      onPress={() => {
                        Alert.alert(
                          `Apply "${lu.name}"?`,
                          `This will replace the current slot assignments with the saved lineup. Players not in this match roster will be skipped.`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Apply', onPress: () => onApplyLineup(lu) },
                          ]
                        );
                      }}
                      disabled={applyingLineup}
                    >
                      <Text style={{ color: '#111', fontWeight: '700', fontSize: 15 }}>{lu.name}</Text>
                      <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 3 }}>
                        {lu.formation}{lu.format ? ` · ${lu.format}` : ''} · {Object.keys(lu.slots || {}).length} players
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onDeleteLineup(lu)}
                      style={{ padding: 12, marginLeft: 6 }}
                    >
                      <Text style={{ fontSize: 20, color: '#ef4444' }}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity
              onPress={() => setShowLoadLineup(false)}
              style={{ marginTop: 12, paddingVertical: 13, borderWidth: 1, borderRadius: 12, borderColor: '#d1d5db', alignItems: 'center' }}
            >
              <Text style={{ fontWeight: '700', fontSize: 15, color: '#374151' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  lineupInput: {
    marginTop: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111',
    borderWidth: 1,
    borderColor: '#e5e7eb',
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

  // Lineup modal buttons — explicit colors so text is always legible
  lineupCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  lineupCancelText: {
    fontWeight: '700',
    fontSize: 15,
    color: '#374151',
  },
  lineupSaveBtn: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#16a34a',
    alignItems: 'center',
  },
  lineupSaveText: {
    fontWeight: '700',
    fontSize: 15,
    color: 'white',
  },
});