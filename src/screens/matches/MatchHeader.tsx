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
  onScore: (side: 'home' | 'away', delta: 1 | -1) => void;
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
  onScore,
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
      <View style={styles.row}>
        <Text style={styles.clock}>{clockText}</Text>

        <View style={styles.scoreBox}>
          <View style={styles.scoreCol}>
            {canEdit && (
              <Pressable style={styles.scoreBtn} onPress={() => onScore('home', +1)}>
                <Text style={styles.scoreBtnText}>＋</Text>
              </Pressable>
            )}

            <Text style={styles.score}>{state.homeScore}</Text>

            {canEdit && (
              <Pressable
                style={[styles.scoreBtn, homeMinusDisabled ? styles.scoreBtnDisabled : null]}
                onPress={() => onScore('home', -1)}
                disabled={homeMinusDisabled}
              >
                <Text style={styles.scoreBtnText}>−</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.dash}>–</Text>

          <View style={styles.scoreCol}>
            {canEdit && (
              <Pressable style={styles.scoreBtn} onPress={() => onScore('away', +1)}>
                <Text style={styles.scoreBtnText}>＋</Text>
              </Pressable>
            )}

            <Text style={styles.score}>{state.awayScore}</Text>

            {canEdit && (
              <Pressable
                style={[styles.scoreBtn, awayMinusDisabled ? styles.scoreBtnDisabled : null]}
                onPress={() => onScore('away', -1)}
                disabled={awayMinusDisabled}
              >
                <Text style={styles.scoreBtnText}>−</Text>
              </Pressable>
            )}
          </View>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clock: {
    fontSize: 20,
    fontWeight: '800',
    color: 'white',
    width: 82,
  },
  scoreBox: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  scoreCol: { alignItems: 'center', width: 50 },
  score: { color: 'white', fontSize: 20, fontWeight: '900' },
  dash: { color: 'rgba(255,255,255,0.75)', fontSize: 18, fontWeight: '800' },
  scoreBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginVertical: 2,
  },
  scoreBtnDisabled: {
    opacity: 0.35,
  },
  scoreBtnText: { color: 'white', fontSize: 14, fontWeight: '900' },
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