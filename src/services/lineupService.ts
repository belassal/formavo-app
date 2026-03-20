import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';
import type { SavedLineup } from '../models/lineup';
import firestore from '@react-native-firebase/firestore';

/** Save (or overwrite) a named lineup for a team. Returns the lineupId. */
export async function saveLineup(params: {
  teamId: string;
  name: string;
  formation: string;
  format?: string;
  slots: Record<string, { playerId: string; playerName: string }>;
  slotPos?: Record<string, { x: number; y: number }>;
  lineupId?: string; // if provided, overwrite that doc; otherwise create new
}): Promise<string> {
  const { teamId, name, formation, format, slots, slotPos, lineupId } = params;

  const col = db.collection(COL.teams).doc(teamId).collection(COL.lineups);
  const ref = lineupId ? col.doc(lineupId) : col.doc();

  await ref.set({
    name: name.trim(),
    formation,
    format: format || '',
    slots,
    slotPos: slotPos || {},
    updatedAt: serverTimestamp(),
    createdAt: lineupId ? firestore.FieldValue.delete() : serverTimestamp(), // preserve original createdAt on update
  }, { merge: true });

  // For new docs, set createdAt explicitly
  if (!lineupId) {
    await ref.set({ createdAt: serverTimestamp() }, { merge: true });
  }

  return ref.id;
}

/** Real-time listener for saved lineups for a team. */
export function listenLineups(teamId: string, onData: (lineups: SavedLineup[]) => void) {
  return db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.lineups)
    .orderBy('createdAt', 'desc')
    .onSnapshot(
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as SavedLineup[];
        onData(rows);
      },
      (err) => {
        console.warn('[lineupService] listenLineups error', err);
        onData([]);
      }
    );
}

/** Delete a saved lineup. */
export async function deleteLineup(teamId: string, lineupId: string): Promise<void> {
  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.lineups)
    .doc(lineupId)
    .delete();
}

/**
 * Apply a saved lineup to a match roster.
 * Sets slotKey on each roster doc that matches a saved player assignment.
 * Players in the lineup who are not in the match roster are skipped.
 */
export async function applyLineupToMatch(params: {
  teamId: string;
  matchId: string;
  lineup: SavedLineup;
}): Promise<void> {
  const { teamId, matchId, lineup } = params;

  const rosterRef = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.matches)
    .doc(matchId)
    .collection(COL.roster);

  // Fetch current roster to see which players are actually in it
  const rosterSnap = await rosterRef.get();
  const rosterPlayerIds = new Set(rosterSnap.docs.map((d) => d.id));

  const batch = db.batch();

  // First, clear existing slotKeys and reset everyone to bench
  for (const doc of rosterSnap.docs) {
    batch.set(doc.ref, { slotKey: firestore.FieldValue.delete(), role: 'bench', updatedAt: serverTimestamp() }, { merge: true });
  }

  // Then apply lineup slot assignments and mark matched players as starters
  for (const [slotKey, entry] of Object.entries(lineup.slots)) {
    if (rosterPlayerIds.has(entry.playerId)) {
      const playerRef = rosterRef.doc(entry.playerId);
      batch.set(playerRef, { slotKey, role: 'starter', updatedAt: serverTimestamp() }, { merge: true });
    }
  }

  await batch.commit();

  // Apply custom slot positions to the match doc if any
  if (lineup.slotPos && Object.keys(lineup.slotPos).length > 0) {
    await db
      .collection(COL.teams)
      .doc(teamId)
      .collection(COL.matches)
      .doc(matchId)
      .set({ slotPos: lineup.slotPos, updatedAt: serverTimestamp() }, { merge: true });
  }
}
