// models/matchEvent.ts

export type MatchEventType = 'goal' | 'card' | 'sub' | 'note';
export type GoalSide = 'home' | 'away';
export type CardColor = 'yellow' | 'red';

// relative 0..1 on pitch
export type PitchPos = { x: number; y: number };

export type MatchEvent = {
  id: string;

  type: MatchEventType;

  // Use minute for ordering + display (0..999)
  minute: number;

  // goal side (and useful for "team vs opponent" too)
  side?: GoalSide;

  // optional: where the event happened on the pitch
  pos?: PitchPos;         // goal/shot location
  assistPos?: PitchPos;   // where the assist/pass came from

  // goal
  scorerId?: string;
  scorerName?: string;
  assistId?: string;
  assistName?: string;

  // card
  playerId?: string;
  playerName?: string;
  cardColor?: CardColor;

  // substitution
  inPlayerId?: string;
  inPlayerName?: string;
  outPlayerId?: string;
  outPlayerName?: string;

  // bookkeeping
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
};