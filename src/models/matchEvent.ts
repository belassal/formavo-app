export type MatchEventType = 'goal' | 'card' | 'sub' | 'note';

export type MatchEvent = {
  type: MatchEventType;
  side?: 'home' | 'away';

  matchSec?: number;      // important for ordering + display minute
  playerId?: string;
  assistId?: string;

  cardColor?: 'yellow' | 'red';

  // substitution
  inPlayerId?: string;
  outPlayerId?: string;

  createdAt?: any;        // firestore timestamp
  createdBy?: string;
};