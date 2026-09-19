/**
 * Client reads for the function-maintained aggregates
 * (teams/{t}/aggregates/{seasonKey}, teams/{t}/playerAggregates/{playerId}_{seasonKey}).
 * One doc + one small query replaces re-downloading every match/event/roster.
 * Callers should fall back to client-side computation when `team` is null
 * (team has no aggregate doc yet — e.g. nothing completed this season).
 */
import { db } from './firebase';
import { COL } from '../models/collections';

export type CompetitionRecord = {
  played: number; wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number;
};

export type SeasonAggregate = {
  played: number; wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number; cleanSheets: number;
  /** Last 5 results, oldest → newest (reverse for newest-first display). */
  form: ('W' | 'D' | 'L')[];
  byCompetition?: Record<string, CompetitionRecord>;
  competitions?: (CompetitionRecord & { name: string; type: string })[];
};

export type PlayerSeasonAggregate = {
  playerId: string; playerName: string;
  goals: number; assists: number; yellow: number; red: number;
  appearances: number; starts: number; minutes: number;
  positions?: Record<string, number>;
};

export async function fetchSeasonAggregates(teamId: string): Promise<{
  seasonKey: string;
  team: SeasonAggregate | null;
  players: PlayerSeasonAggregate[];
}> {
  const teamSnap = await db.collection(COL.teams).doc(teamId).get();
  const seasonKey = (teamSnap.data() as any)?.activeSeasonId || 'none';

  const teamRef = db.collection(COL.teams).doc(teamId);
  const [aggSnap, pAggSnap] = await Promise.all([
    teamRef.collection('aggregates').doc(seasonKey).get(),
    teamRef.collection('playerAggregates').where('seasonId', '==', seasonKey).get(),
  ]);

  return {
    seasonKey,
    team: aggSnap.exists ? (aggSnap.data() as SeasonAggregate) : null,
    players: pAggSnap.docs.map((d) => d.data() as PlayerSeasonAggregate),
  };
}
