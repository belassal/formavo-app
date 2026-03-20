export type MatchStatus = 'draft' | 'live' | 'paused' | 'halftime' | 'final';

export type MatchState = {
  status: MatchStatus;
  half?: 1 | 2;       // 1 = first half, 2 = second half (undefined = not started)

  startedAt?: number;
  resumedAt?: number;
  elapsedSec: number;

  homeScore: number;
  awayScore: number;
};