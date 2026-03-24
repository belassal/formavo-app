import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

export interface PlayerRating {
  playerId: string;
  playerName: string;
  rating: number; // 1-5, 0 = not set
  note: string;
  coachId: string;
  coachName: string;
  matchId: string;
  opponent?: string;
  matchDateISO?: string;
  updatedAt: FirebaseFirestoreTypes.Timestamp | null;
}

/** Real-time listener: all ratings for a given match */
export function listenMatchRatings(
  teamId: string,
  matchId: string,
  onData: (ratings: Record<string, PlayerRating>) => void,
): () => void {
  return db
    .collection(COL.teams).doc(teamId)
    .collection(COL.matches).doc(matchId)
    .collection(COL.ratings)
    .onSnapshot(
      (snap) => {
        const map: Record<string, PlayerRating> = {};
        snap.docs.forEach((d) => {
          map[d.id] = { ...d.data(), playerId: d.id } as PlayerRating;
        });
        onData(map);
      },
      (err) => {
        console.warn('[listenMatchRatings]', err);
        onData({});
      },
    );
}

/** Write or update a player's rating for a specific match */
export async function setPlayerMatchRating(params: {
  teamId: string;
  matchId: string;
  playerId: string;
  playerName: string;
  rating: number;
  note: string;
  coachId: string;
  coachName: string;
  opponent?: string;
  matchDateISO?: string;
}): Promise<void> {
  const ref = db
    .collection(COL.teams).doc(params.teamId)
    .collection(COL.matches).doc(params.matchId)
    .collection(COL.ratings).doc(params.playerId);

  await ref.set(
    {
      playerId: params.playerId,
      playerName: params.playerName,
      rating: params.rating,
      note: params.note.trim(),
      coachId: params.coachId,
      coachName: params.coachName,
      matchId: params.matchId,
      opponent: params.opponent ?? '',
      matchDateISO: params.matchDateISO ?? '',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/** One-time fetch of all ratings for a player across all matches in a team */
export async function fetchPlayerRatings(
  teamId: string,
  playerId: string,
): Promise<PlayerRating[]> {
  // Fetch all non-deleted matches, then get the player's rating doc from each
  const matchesSnap = await db
    .collection(COL.teams).doc(teamId)
    .collection(COL.matches)
    .get();

  const matches = matchesSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((m) => !m.isDeleted);

  const results: PlayerRating[] = [];

  await Promise.all(
    matches.map(async (match) => {
      const ratingDoc = await db
        .collection(COL.teams).doc(teamId)
        .collection(COL.matches).doc(match.id)
        .collection(COL.ratings).doc(playerId)
        .get();

      if (ratingDoc.exists) {
        const data = ratingDoc.data() as any;
        if (data.rating > 0 || data.note) {
          results.push({
            ...data,
            playerId,
            matchId: match.id,
            opponent: data.opponent || match.opponent || '',
            matchDateISO: data.matchDateISO || match.dateISO || '',
          } as PlayerRating);
        }
      }
    }),
  );

  // Sort newest first
  return results.sort((a, b) => {
    if (!a.matchDateISO || !b.matchDateISO) return 0;
    return b.matchDateISO.localeCompare(a.matchDateISO);
  });
}
