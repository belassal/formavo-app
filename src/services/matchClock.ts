import type { MatchState } from '../models/match';

export function computeElapsedSec(state: MatchState, nowMs: number) {
  const base = state.elapsedSec || 0;

  if (state.status !== 'live') return Math.floor(base);

  const resumedAt = state.resumedAt ?? state.startedAt ?? nowMs;
  const add = Math.max(0, (nowMs - resumedAt) / 1000);

  return Math.floor(base + add);
}

export function computeMinute(state: MatchState, nowMs: number) {
  return Math.floor(computeElapsedSec(state, nowMs) / 60);
}