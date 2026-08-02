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

// Maximum stoppage time (minutes) counted beyond scheduled play. Guards against
// a match left running (e.g. overnight) producing absurd clock and minute values.
const MAX_STOPPAGE_MIN = 20;

export function maxElapsedSec(state: MatchState, halfDuration = 45) {
  const half = state.half ?? 1;
  const scheduledSec = (half === 1 ? halfDuration : halfDuration * 2) * 60;
  return scheduledSec + MAX_STOPPAGE_MIN * 60;
}

export function computeCappedMinute(state: MatchState, nowMs: number, halfDuration = 45) {
  const capped = Math.min(computeElapsedSec(state, nowMs), maxElapsedSec(state, halfDuration));
  return Math.floor(capped / 60);
}

/**
 * Display-friendly clock string.
 * 1st half: 0:00 → 45:00+
 * Half time: HT
 * 2nd half: 45:00 → 90:00+  (base offset of 45 min added)
 * Capped at scheduled play + max stoppage; shows a trailing "+" when capped.
 */
export function computeDisplayMinute(state: MatchState, nowMs: number, halfDuration = 45): string {
  if (state.status === 'halftime') return 'HT';
  if (state.status === 'final')    return 'FT';

  const elapsed = computeElapsedSec(state, nowMs);
  const half = state.half ?? 1;
  // In 2nd half, raw elapsed includes 1st half time — clamp so display never shows less than halfDuration
  let displaySec = half === 2 ? Math.max(halfDuration * 60, elapsed) : elapsed;

  const cap = maxElapsedSec(state, halfDuration);
  const capped = displaySec > cap;
  if (capped) displaySec = cap;

  const mm = Math.floor(displaySec / 60);
  const ss = displaySec % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}${capped ? '+' : ''}`;
}