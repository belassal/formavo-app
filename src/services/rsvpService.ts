import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';

export type RsvpStatus = 'attending' | 'absent' | 'pending';

/**
 * Set (or update) a player's RSVP for a match.
 * Writes to the existing roster doc (or creates one with merge if it doesn't exist yet).
 */
export async function setRsvp(params: {
  teamId: string;
  matchId: string;
  playerId: string;
  status: RsvpStatus;
  byUid: string;
}): Promise<void> {
  const { teamId, matchId, playerId, status, byUid } = params;

  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId)
    .collection(COL.roster)
    .doc(playerId)
    .set(
      {
        rsvpStatus: status,
        rsvpBy: byUid,
        rsvpAt: serverTimestamp(),
      },
      { merge: true },
    );
}
