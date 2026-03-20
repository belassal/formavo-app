export type LineupSlotEntry = {
  playerId: string;
  playerName: string;
};

export type SavedLineup = {
  id: string;
  name: string;
  formation: string;
  format?: string;
  // slotKey → player assignment
  slots: Record<string, LineupSlotEntry>;
  // custom slot positions (relative 0..1), same shape as match.slotPos
  slotPos?: Record<string, { x: number; y: number }>;
  createdAt?: any;
  updatedAt?: any;
};
