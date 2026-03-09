import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { computeElapsedSec } from '../../services/matchClock'; // adjust path

export type MatchStatus = 'draft' | 'live' | 'paused' | 'final';

export type MatchState = {
  status: MatchStatus;
  startedAt?: number;   // epoch ms
  resumedAt?: number;   // epoch ms
  elapsedSec: number;   // accumulated seconds
  homeScore: number;
  awayScore: number;
};

type Props = {
  state: MatchState;
  canEdit?: boolean; // coach vs parent
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onEnd: () => void;
  onQuickEvent: (preset: { type: 'goal'|'card'; side?: 'home'|'away' }) => void;
};

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function MatchHeader({
  state,
  canEdit = true,
  onStart,
  onPause,
  onResume,
  onEnd,
  onQuickEvent,
}: Props) {
  const [now, setNow] = useState(() => Date.now());

  // tick while live
  useEffect(() => {
    if (state.status !== 'live') return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [state.status]);

  const liveElapsed = useMemo(() => {
    return computeElapsedSec(state, now);
  }, [state, now]);

  const clockText = fmt(liveElapsed);

  const leftBtn = useMemo(() => {
    if (!canEdit) return null;
    if (state.status === 'draft') return { label: 'Start', onPress: onStart };
    if (state.status === 'live') return { label: 'Pause', onPress: onPause };
    if (state.status === 'paused') return { label: 'Resume', onPress: onResume };
    return null;
  }, [state.status, canEdit, onStart, onPause, onResume]);

  const rightBtn = useMemo(() => {
    if (!canEdit) return null;
    if (state.status === 'final') return null;
    return { label: 'End', onPress: onEnd };
  }, [state.status, canEdit, onEnd]);

  const homeMinusDisabled = (state.homeScore ?? 0) <= 0;
  const awayMinusDisabled = (state.awayScore ?? 0) <= 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Text style={styles.clock}>{clockText}</Text>

        <View style={styles.scoreBox}>
          <Text style={styles.score}>{state.homeScore}</Text>
          <Text style={styles.dash}>-</Text>
          <Text style={styles.score}>{state.awayScore}</Text>
        </View>

        <View style={styles.actions}>
          {leftBtn && (
            <Pressable style={styles.actionBtn} onPress={leftBtn.onPress}>
              <Text style={styles.actionBtnText}>{leftBtn.label}</Text>
            </Pressable>
          )}
          {rightBtn && (
            <Pressable style={[styles.actionBtn, styles.endBtn]} onPress={rightBtn.onPress}>
              <Text style={styles.actionBtnText}>{rightBtn.label}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <Text style={styles.status}>
        {state.status === 'draft' && 'Setup Mode'}
        {state.status === 'live' && 'Live Mode'}
        {state.status === 'paused' && 'Paused'}
        {state.status === 'final' && 'Final'}
      </Text>

      <View style={styles.quickRow}>
        <Pressable style={styles.quickBtn} onPress={() => onQuickEvent({ type: 'goal', side: 'home' })}>
          <Text style={styles.quickText}>⚽ Home Goal</Text>
        </Pressable>

        <Pressable style={styles.quickBtn} onPress={() => onQuickEvent({ type: 'goal', side: 'away' })}>
          <Text style={styles.quickText}>⚽ Away Goal</Text>
        </Pressable>

        <Pressable style={styles.quickBtn} onPress={() => onQuickEvent({ type: 'card' })}>
          <Text style={styles.quickText}>🟨 Card</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: '#0b1220',
  },
  clock: {
    fontSize: 20,
    fontWeight: '800',
    color: 'white',
    width: 82,
  },
  topRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
},

scoreBox: {
  minWidth: 90,
  paddingVertical: 8,
  paddingHorizontal: 12,
  borderRadius: 14,
  backgroundColor: 'rgba(255,255,255,0.08)',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
},

score: {
  color: 'white',
  fontSize: 24,
  fontWeight: '900',
},

dash: {
  color: 'rgba(255,255,255,0.75)',
  fontSize: 20,
  fontWeight: '800',
},

quickRow: {
  flexDirection: 'row',
  gap: 8,
  marginTop: 10,
},

quickBtn: {
  flex: 1,
  paddingVertical: 10,
  borderRadius: 12,
  backgroundColor: 'rgba(255,255,255,0.10)',
  alignItems: 'center',
},

quickText: {
  color: 'white',
  fontWeight: '900',
  fontSize: 12,
},
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  endBtn: { backgroundColor: 'rgba(255,80,80,0.22)' },
  actionBtnText: { color: 'white', fontWeight: '800' },
  status: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '600',
  },
  });