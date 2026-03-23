import firestore from '@react-native-firebase/firestore';
import { db, serverTimestamp } from './firebase';
import { COL } from '../models/collections';

export type SeasonStatus = 'active' | 'completed';

export type Season = {
  id: string;
  label: string;       // e.g. "2025/2026", "2026 Fall"
  year: number;        // e.g. 2026
  status: SeasonStatus;
  startDate?: any;
  endDate?: any;
  createdAt: any;
};

/**
 * Creates a new season doc under teams/{teamId}/seasons/.
 * Returns the new seasonId.
 */
export async function createSeason(params: {
  teamId: string;
  label: string;
  year: number;
  status?: SeasonStatus;
}): Promise<string> {
  const { teamId, label, year, status = 'active' } = params;

  const seasonRef = db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.seasons)
    .doc();

  await seasonRef.set({
    label: label.trim(),
    year,
    status,
    startDate: serverTimestamp(),
    endDate: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return seasonRef.id;
}

/**
 * Checks if teams/{teamId}/seasons has any docs.
 * If yes, returns the first one's id.
 * If no, creates a default season with label from existingSeasonText or "2025/2026",
 * year = 2026, status = 'active', and returns the new seasonId.
 */
export async function getOrCreateDefaultSeason(params: {
  teamId: string;
  teamName?: string;
  existingSeasonText?: string;
}): Promise<string> {
  const { teamId, existingSeasonText } = params;

  const snap = await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.seasons)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (!snap.empty) {
    const existingSeasonId = snap.docs[0].id;
    // Re-tag any docs that were missed (idempotent — only updates docs without seasonId)
    try {
      const [matchSnap, memberSnap] = await Promise.all([
        db.collection(COL.teams).doc(teamId).collection(COL.matches).get(),
        db.collection(COL.teams).doc(teamId).collection(COL.playerMemberships).get(),
      ]);
      const untagged = [...matchSnap.docs, ...memberSnap.docs].filter((d) => !d.data().seasonId);
      if (untagged.length > 0) {
        const BATCH_SIZE = 400;
        for (let i = 0; i < untagged.length; i += BATCH_SIZE) {
          const batch = db.batch();
          untagged.slice(i, i + BATCH_SIZE).forEach((d) => {
            batch.update(d.ref, { seasonId: existingSeasonId });
          });
          await batch.commit();
        }
      }
    } catch (e) {
      console.warn('[getOrCreateDefaultSeason] re-tag error:', e);
    }
    return existingSeasonId;
  }

  // No seasons exist — create the default one
  const label = (existingSeasonText || '').trim() || '2025/2026';
  const year = 2026;

  const seasonId = await createSeason({ teamId, label, year, status: 'active' });

  // Tag all existing matches and playerMemberships with this seasonId
  // so season filtering works correctly for legacy data
  try {
    const [matchSnap, memberSnap] = await Promise.all([
      db.collection(COL.teams).doc(teamId).collection(COL.matches).get(),
      db.collection(COL.teams).doc(teamId).collection(COL.playerMemberships).get(),
    ]);

    const BATCH_SIZE = 400;
    const allDocs = [...matchSnap.docs, ...memberSnap.docs];
    for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      allDocs.slice(i, i + BATCH_SIZE).forEach((d) => {
        if (!d.data().seasonId) {
          batch.update(d.ref, { seasonId });
        }
      });
      await batch.commit();
    }
  } catch (e) {
    console.warn('[getOrCreateDefaultSeason] tag existing docs error:', e);
  }

  return seasonId;
}

/**
 * Updates teams/{teamId} doc with { activeSeasonId: seasonId }.
 */
export async function setActiveSeasonId(params: {
  teamId: string;
  seasonId: string;
}): Promise<void> {
  const { teamId, seasonId } = params;

  await db.collection(COL.teams).doc(teamId).update({
    activeSeasonId: seasonId,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Listens to teams/{teamId}/seasons ordered by createdAt desc.
 * Returns unsubscribe function.
 */
export function listenSeasons(
  teamId: string,
  onData: (seasons: Season[]) => void,
): () => void {
  return db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.seasons)
    .orderBy('createdAt', 'desc')
    .onSnapshot(
      (snap) => {
        const seasons = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Season, 'id'>),
        })) as Season[];
        onData(seasons);
      },
      (err) => {
        console.log('[listenSeasons] ERROR:', err);
        onData([]);
      },
    );
}

/**
 * Archives a season by setting its status to 'completed' and endDate to now.
 */
export async function archiveSeason(params: {
  teamId: string;
  seasonId: string;
}): Promise<void> {
  const { teamId, seasonId } = params;

  await db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.seasons)
    .doc(seasonId)
    .update({
      status: 'completed' as SeasonStatus,
      endDate: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
}

/**
 * Starts a new season:
 * 1. Creates a new season doc.
 * 2. For each playerId in keepPlayerIds, copies their playerMembership doc to the new season
 *    (adds seasonId field, resets startDate to now).
 * 3. Sets the new season as active via setActiveSeasonId.
 * 4. Archives the old active season if one exists.
 * Returns the new seasonId.
 */
export async function startNewSeason(params: {
  teamId: string;
  label: string;
  year: number;
  keepPlayerIds: string[];
}): Promise<string> {
  const { teamId, label, year, keepPlayerIds } = params;

  // 1. Get the currently active season id before creating the new one
  const teamSnap = await db.collection(COL.teams).doc(teamId).get();
  const teamData = teamSnap.data() as any;
  const oldActiveSeasonId: string | null = teamData?.activeSeasonId ?? null;

  // 2. Create new season doc
  const newSeasonId = await createSeason({ teamId, label, year, status: 'active' });

  // 3. Copy player memberships for returning players
  if (keepPlayerIds.length > 0) {
    const membershipsRef = db
      .collection(COL.teams)
      .doc(teamId)
      .collection(COL.playerMemberships);

    // Use batched writes for efficiency; Firestore batch limit is 500
    const BATCH_SIZE = 400;
    for (let i = 0; i < keepPlayerIds.length; i += BATCH_SIZE) {
      const chunk = keepPlayerIds.slice(i, i + BATCH_SIZE);
      const batch = db.batch();

      for (const playerId of chunk) {
        const existingSnap = await membershipsRef.doc(playerId).get();
        if (!existingSnap.exists) continue;

        const existingData = existingSnap.data() as any;

        // Create a new membership doc keyed by `playerId_seasonId` to avoid overwriting
        // the existing (un-seasoned) membership doc. We store these as separate docs
        // so that season-filtered queries work properly.
        const newMemRef = membershipsRef.doc(`${playerId}_${newSeasonId}`);

        batch.set(newMemRef, {
          ...existingData,
          playerId,
          seasonId: newSeasonId,
          status: 'active',
          startDate: serverTimestamp(),
          endDate: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
    }
  }

  // 4. Set new season as active
  await setActiveSeasonId({ teamId, seasonId: newSeasonId });

  // 5. Archive the old active season
  if (oldActiveSeasonId) {
    await archiveSeason({ teamId, seasonId: oldActiveSeasonId });
  }

  return newSeasonId;
}

/**
 * Listens to teams/{teamId}/playerMemberships where seasonId == seasonId and status == 'active'.
 * Returns unsubscribe function.
 */
export function listenSeasonRoster(
  params: { teamId: string; seasonId: string },
  onData: (players: any[]) => void,
): () => void {
  const { teamId, seasonId } = params;

  return db
    .collection(COL.teams)
    .doc(teamId)
    .collection(COL.playerMemberships)
    .where('seasonId', '==', seasonId)
    .where('status', '==', 'active')
    .onSnapshot(
      (snap) => {
        onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.log('[listenSeasonRoster] ERROR:', err);
        onData([]);
      },
    );
}
