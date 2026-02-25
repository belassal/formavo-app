export type MatchStatus = 'draft' | 'live' | 'paused' | 'final';

export type MatchState = {
  status: MatchStatus;

  startedAt?: number;
  resumedAt?: number;
  elapsedSec: number;

  homeScore: number;
  awayScore: number;
};