import { db } from './firebase';
import { COL } from '../models/collections';

export type PlayerMinutes = {
  playerId: string;
  playerName: string;
  minutesPlayed: number;
  startedMatch: boolean;
  subbedOn: boolean;
  subbedOff: boolean;
  minuteOn: number;
  minuteOff: number | null;
};

export type PlayerSeasonMinutes = {
  totalMinutes: number;
  appearances: number;
  starts: number;
  subAppearances: number;
  avgMinutes: number;
};

/**
 * Given the roster, all events, and the assumed total match duration,
 * returns minutes played for every player who had time on pitch.
 */
export function calculateMatchMinutes(
  roster: { playerId: string; playerName: string; role?: string; attendance?: string }[],
  events: { type: string; minute: number; inPlayerId?: string; outPlayerId?: string }[],
  matchDuration: number,
): PlayerMinutes[] {
  const subEvents = events
    .filter((e) => e.type === 'sub')
    .sort((a, b) => a.minute - b.minute);

  const result: PlayerMinutes[] = [];

  for (const player of roster) {
    if (player.attendance === 'absent' || player.attendance === 'injured') continue;

    const started = (player.role || 'bench') === 'starter';
    const subbedOnEvent = subEvents.find((e) => e.inPlayerId === player.playerId);
    const subbedOffEvent = subEvents.find((e) => e.outPlayerId === player.playerId);

    const minuteOn: number | null = started ? 0 : subbedOnEvent ? subbedOnEvent.minute : null;
    if (minuteOn === null) continue; // bench player who never came on

    const minuteOff = subbedOffEvent ? subbedOffEvent.minute : null;
    const minutesPlayed = Math.max(0, (minuteOff ?? matchDuration) - minuteOn);

    result.push({
      playerId: player.playerId,
      playerName: player.playerName,
      minutesPlayed,
      startedMatch: started,
      subbedOn: !!subbedOnEvent,
      subbedOff: !!subbedOffEvent,
      minuteOn,
      minuteOff,
    });
  }

  return result.sort((a, b) => b.minutesPlayed - a.minutesPlayed);
}

/**
 * Aggregates minutes across all completed/live matches for a player in a team.
 */
export async function fetchPlayerSeasonMinutes(
  teamId: string,
  playerId: string,
): Promise<PlayerSeasonMinutes> {
  const matchSnap = await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .orderBy('dateISO', 'desc')
    .get();

  const matches = matchSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((m) => !m.isDeleted && (m.status === 'completed' || m.status === 'live'));

  let totalMinutes = 0;
  let appearances = 0;
  let starts = 0;
  let subAppearances = 0;

  await Promise.all(
    matches.map(async (match) => {
      const [rosterSnap, eventsSnap] = await Promise.all([
        db
          .collection(COL.teams).doc(teamId).collection(COL.matches)
          .doc(match.id).collection(COL.roster).get(),
        db
          .collection(COL.teams).doc(teamId).collection(COL.matches)
          .doc(match.id).collection(COL.events).get(),
      ]);

      const roster = rosterSnap.docs.map((d) => ({ playerId: d.id, ...(d.data() as any) }));
      const events = eventsSnap.docs.map((d) => d.data() as any);
      const matchDuration = (match.halfDuration ?? 45) * 2;

      const allMinutes = calculateMatchMinutes(roster, events, matchDuration);
      const playerMin = allMinutes.find((m) => m.playerId === playerId);

      if (playerMin && playerMin.minutesPlayed > 0) {
        totalMinutes += playerMin.minutesPlayed;
        appearances++;
        if (playerMin.startedMatch) starts++;
        if (playerMin.subbedOn) subAppearances++;
      }
    }),
  );

  return {
    totalMinutes,
    appearances,
    starts,
    subAppearances,
    avgMinutes: appearances > 0 ? Math.round(totalMinutes / appearances) : 0,
  };
}
